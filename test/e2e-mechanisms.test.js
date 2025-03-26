const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const fixtures = require("./utils/fixtures-e2e");

describe("DLP System - Pricing Mechanism E2E Tests", function () {
    describe("Base Price Calculation", function () {
        it("should increase base price as supply decreases", async function () {
            const { launchContract, signers } = await loadFixture(fixtures.deployDistributionPhaseFixture);
            const { user1 } = signers;

            // Get initial base price
            const initialBasePrice = await launchContract.getBasePrice();

            // Purchase tokens to decrease supply
            await launchContract.connect(user1).purchaseTokens(
                ethers.parseUnits("10000", 18),
                { value: ethers.parseEther("50") }
            );

            // Get updated base price
            const updatedBasePrice = await launchContract.getBasePrice();

            // Price should increase
            expect(updatedBasePrice).to.be.gt(initialBasePrice);

            // Make another purchase
            await launchContract.connect(user1).purchaseTokens(
                ethers.parseUnits("20000", 18),
                { value: ethers.parseEther("100") }
            );

            // Get final base price
            const finalBasePrice = await launchContract.getBasePrice();

            // Price should increase further
            expect(finalBasePrice).to.be.gt(updatedBasePrice);

            // The price increase should follow a power law pattern
            // Initial to updated ratio should be less than updated to final ratio
            // since price increases more rapidly as supply decreases
            const firstIncrease = Number(updatedBasePrice) / Number(initialBasePrice);
            const secondIncrease = Number(finalBasePrice) / Number(updatedBasePrice);

            expect(secondIncrease).to.be.gt(firstIncrease);
        });

        it("should calculate base price correctly at very low supply", async function () {
            const { launchContract, signers, config } = await loadFixture(fixtures.deployLowSupplyFixture);
            const { user2 } = signers;

            // Get remaining supply
            const remainingSupply = await launchContract.getRemainingSupply();

            // Verify we're at low supply (1% or less)
            expect(remainingSupply).to.be.lte(config.totalSupply * 1n / 100n);

            // Get base price
            const basePrice = await launchContract.getBasePrice();

            // Price should be significantly higher than initial price
            expect(basePrice).to.be.gt(config.initialPrice * 10n); // At least 10x higher

            // Purchase half of remaining supply
            const purchaseAmount = remainingSupply / 2n;

            // Calculate the cost
            const [, , , cost] = await launchContract.calculatePurchaseCost(purchaseAmount);

            // Make the purchase
            await launchContract.connect(user2).purchaseTokens(
                purchaseAmount,
                { value: cost * 2n } // Extra buffer
            );

            // Get new base price
            const newBasePrice = await launchContract.getBasePrice();

            // Price should increase significantly
            expect(newBasePrice).to.be.gt(basePrice * 15n / 10n); // At least 1.5x higher
        });
    });

    describe("Premium Calculation", function () {
        it("should apply larger premiums for larger purchases", async function () {
            const { launchContract } = await loadFixture(fixtures.deployDistributionPhaseFixture);

            // Calculate premium for different purchase sizes
            const smallPremium = await launchContract.calculatePremium(ethers.parseUnits("100", 18));
            const mediumPremium = await launchContract.calculatePremium(ethers.parseUnits("10000", 18));
            const largePremium = await launchContract.calculatePremium(ethers.parseUnits("50000", 18));

            // Premiums should increase with purchase size
            expect(mediumPremium).to.be.gt(smallPremium);
            expect(largePremium).to.be.gt(mediumPremium);

            // The smallest premium should be close to 1.0 (1e18)
            expect(smallPremium).to.be.lt(ethers.parseUnits("1.1", 18)); // Less than 10% premium

            // Large purchases should have significant premium
            expect(largePremium).to.be.gt(ethers.parseUnits("1.2", 18)); // More than 20% premium
        });

        it("should be affected by premium intensity parameter (k)", async function () {
            const { launchContract } = await loadFixture(fixtures.deployWithUpdatedPriceParamsFixture);

            // With higher k parameter (30 vs. 20), premiums should be higher
            const purchaseAmount = ethers.parseUnits("10000", 18);
            const premiumWithHigherK = await launchContract.calculatePremium(purchaseAmount);

            // Deploy standard fixture for comparison
            const { launchContract: standardLaunch } = await loadFixture(fixtures.deployDistributionPhaseFixture);
            const standardPremium = await standardLaunch.calculatePremium(purchaseAmount);

            // Premium with higher k should be higher
            expect(premiumWithHigherK).to.be.gt(standardPremium);
        });

        it("should be affected by beta parameter", async function () {
            const { launchContract } = await loadFixture(fixtures.deployWithUpdatedPriceParamsFixture);

            // With higher beta parameter (0.7 vs 0.5), effective supply is more weighted to remaining supply
            // This results in higher premiums at the same purchase size and remaining supply
            const purchaseAmount = ethers.parseUnits("10000", 18);
            const premiumWithHigherBeta = await launchContract.calculatePremium(purchaseAmount);

            // Deploy standard fixture for comparison
            const { launchContract: standardLaunch } = await loadFixture(fixtures.deployDistributionPhaseFixture);
            const standardPremium = await standardLaunch.calculatePremium(purchaseAmount);

            // Premium with higher beta should be higher
            expect(premiumWithHigherBeta).to.be.gt(standardPremium);
        });
    });

    describe("Total Cost Calculation", function () {
        it("should correctly calculate total cost including base price and premium", async function () {
            const { launchContract } = await loadFixture(fixtures.deployDistributionPhaseFixture);

            const purchaseAmount = ethers.parseUnits("5000", 18);

            // Get individual components
            const basePrice = await launchContract.getBasePrice();
            const premium = await launchContract.calculatePremium(purchaseAmount);

            // Calculate manually
            const expectedBaseCost = basePrice * purchaseAmount / ethers.parseUnits("1", 18);
            const expectedTotalCost = expectedBaseCost * premium / ethers.parseUnits("1", 18);

            // Get from contract
            const [contractBasePrice, contractPremium, contractBaseCost, contractTotalCost] =
                await launchContract.calculatePurchaseCost(purchaseAmount);

            // Verify values match
            expect(contractBasePrice).to.equal(basePrice);
            expect(contractPremium).to.equal(premium);
            expect(contractBaseCost).to.be.closeTo(expectedBaseCost, expectedBaseCost / 1000n); // Within 0.1%
            expect(contractTotalCost).to.be.closeTo(expectedTotalCost, expectedTotalCost / 1000n); // Within 0.1%
        });

        it("should include transaction fee in total cost", async function () {
            const { launchContract, config } = await loadFixture(fixtures.deployDistributionPhaseFixture);

            const purchaseAmount = ethers.parseUnits("1000", 18);

            // Get cost without fee
            const [, , , costWithoutFee] = await launchContract.calculatePurchaseCost(purchaseAmount);

            // Get total cost with fee
            const [totalCost, totalCostWithFee] = await launchContract.calculateTotalCost(purchaseAmount);

            // Verify values
            expect(totalCost).to.equal(costWithoutFee);
            expect(totalCostWithFee).to.equal(costWithoutFee + config.txnFee);
        });

        it("should calculate maximum tokens purchasable with given ETH", async function () {
            const { launchContract } = await loadFixture(fixtures.deployDistributionPhaseFixture);

            const ethAmount = ethers.parseEther("2");

            // Calculate tokens for ETH
            const tokenAmount = await launchContract.calculateTokensForETH(ethAmount);

            // Verify token amount is reasonable (not zero or too high)
            expect(tokenAmount).to.be.gt(0);
            expect(tokenAmount).to.be.lt(ethers.parseUnits("10000", 18)); // Less than 10k tokens

            // Calculate cost of those tokens
            const [, totalCostWithFee] = await launchContract.calculateTotalCost(tokenAmount);

            // Cost should be less than or equal to ETH amount
            expect(totalCostWithFee).to.be.lte(ethAmount);

            // And should be close to the ETH amount (efficient use of funds)
            expect(totalCostWithFee).to.be.gte(ethAmount * 95n / 100n); // Within 5%
        });
    });

    describe("Price Parameter Updates", function () {
        it("should allow updating price parameters", async function () {
            const { launchContract, signers } = await loadFixture(fixtures.deployDistributionPhaseFixture);
            const { admin, user1 } = signers;

            // Get initial premium
            const purchaseAmount = ethers.parseUnits("10000", 18);
            const initialPremium = await launchContract.calculatePremium(purchaseAmount);

            // Update price parameters
            await launchContract.updatePriceParameters(
                -2, // Alpha (steeper curve)
                30, // K (higher premium intensity)
                ethers.parseUnits("70", 16) // Beta (0.7 in 1e18 format)
            );

            // Get updated premium
            const updatedPremium = await launchContract.calculatePremium(purchaseAmount);

            // Premium should be higher with updated parameters
            expect(updatedPremium).to.be.gt(initialPremium);

            // Base price calculation should also be affected by alpha
            // Make a purchase to reduce supply
            await launchContract.connect(user1).purchaseTokens(
                ethers.parseUnits("5000", 18),
                { value: ethers.parseEther("20") }
            );

            // Get base price after purchase
            const basePrice = await launchContract.getBasePrice();

            // Reset alpha to -1 (less steep)
            await launchContract.updatePriceParameters(
                -1, // Alpha (original value)
                30, // K (keep higher premium intensity)
                ethers.parseUnits("70", 16) // Beta (keep higher beta)
            );

            // Get base price with new alpha
            const basePriceWithNewAlpha = await launchContract.getBasePrice();

            // Base price should be lower with less steep alpha
            expect(basePriceWithNewAlpha).to.be.lt(basePrice);
        });
    });
});