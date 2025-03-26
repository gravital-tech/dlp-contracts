// test/launchContract.test.js

const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const launchFixtures = require("./utils/fixtures-launch");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { Block } = require("ethers");

describe("launchContract", function () {
    let launchContract;
    let vestingContract;
    let tokenContract;
    let signers;
    let launchConfig;

    beforeEach(async function () {
        ({ launchContract, tokenContract, vestingContract, signers, launchConfig }
            = await loadFixture(launchFixtures.deployLaunchFixtureStandard));

        // Start distribution
        await launchContract.startDistribution();
    });

    describe("Initialization", function () {
        it("should correctly initialize with the provided parameters", async function () {
            expect(await launchContract.token()).to.equal(tokenContract.target);
            expect(await launchContract.vestingContract()).to.equal(vestingContract.target);
            expect(await launchContract.treasury()).to.equal(signers.treasury.address);

            const config = await launchContract.pricingConfig();
            expect(config.initialPrice).to.equal(launchConfig.initialPrice);
            expect(config.totalSupply).to.equal(launchConfig.totalSupply);
            expect(config.remainingSupply).to.equal(launchConfig.totalSupply);
            expect(config.alphaParameter).to.equal(launchConfig.alpha);
            expect(config.premiumIntensityK).to.equal(launchConfig.k);
            expect(config.betaParameter).to.equal(launchConfig.beta);

            const initialSupplyInfo = await launchContract.getSupplyInfo();
            expect(initialSupplyInfo.totalMintCap).to.equal(launchConfig.mintCap);
            expect(initialSupplyInfo.totalMinted).to.equal(0);
            expect(initialSupplyInfo.mintRemaining).to.equal(launchConfig.mintCap);

            expect(await launchContract.maxPurchaseAmount()).to.equal(launchConfig.maxPurchaseAmount);
            expect(await launchContract.currentPhase()).to.equal(1); // Distribution phase
        });
    });

    describe("Price Calculation", function () {
        it("should calculate base price correctly", async function () {
            const basePrice = await launchContract.getBasePrice();
            expect(basePrice).to.equal(launchConfig.initialPrice);

            // Buy some tokens to change the remaining supply
            const amount = launchConfig.totalSupply / 10n;
            const totalCost = await launchContract.calculateTotalCost(amount);
            await launchContract.connect(signers.user1).purchaseTokens(amount, { value: totalCost.totalCostWithFee + ethers.parseEther("1") });

            // Get new base price
            const newBasePrice = await launchContract.getBasePrice();

            // Price should be higher with less supply
            expect(newBasePrice).to.be.gt(launchConfig.initialPrice);
        });

        it("should calculate premium correctly for different purchase sizes", async function () {
            // Small purchase (0.1% of supply)
            const smallAmount = launchConfig.totalSupply / 1000n;
            const smallPremium = await launchContract.calculatePremium(smallAmount);

            // Medium purchase (1% of supply)
            const mediumAmount = launchConfig.totalSupply / 100n;
            const mediumPremium = await launchContract.calculatePremium(mediumAmount);

            // Large purchase (5% of supply)
            const largeAmount = launchConfig.totalSupply / 20n;
            const largePremium = await launchContract.calculatePremium(largeAmount);

            // Premium should increase with purchase size
            expect(smallPremium).to.be.lt(mediumPremium);
            expect(mediumPremium).to.be.lt(largePremium);
        });

        it("should calculate total cost correctly including premium", async function () {
            const amount = launchConfig.totalSupply / 100n;

            const costDetails = await launchContract.calculatePurchaseCost(amount);

            // Base cost should be amount * basePrice
            const expectedBaseCost = amount * costDetails.basePrice / (ethers.parseEther("1"));
            expect(costDetails.baseCost).to.be.closeTo(expectedBaseCost, expectedBaseCost / 100n);

            // Final cost should include premium
            const expectedFinalCost = expectedBaseCost * costDetails.premium / (ethers.parseEther("1"));
            expect(costDetails.finalCost).to.be.closeTo(expectedFinalCost, expectedFinalCost / 100n);
        });

        it("should include transaction fee in total cost", async function () {
            const amount = launchConfig.totalSupply / 100n;

            const costs = await launchContract.calculateTotalCost(amount);

            // Total cost with fee should be token cost + fee
            expect(costs.totalCostWithFee).to.equal(costs.totalCost + launchConfig.txnFee);
        });
    });

    describe("Token Purchase", function () {
        it("should allow token purchase with proper payment", async function () {
            const amount = launchConfig.totalSupply / 100n;
            const costs = await launchContract.calculateTotalCost(amount);

            // Record initial balances
            const initialTreasuryBalance = await ethers.provider.getBalance(signers.treasury.address);

            // Get expected values
            const expectedValues = await launchContract.calculatePurchaseCost(amount);
            const expectedVesting = await launchContract.calculateVestingDuration();

            // Execute purchase
            await expect(launchContract.connect(signers.user1).purchaseTokens(amount, { value: costs.totalCostWithFee }))
                .to.emit(launchContract, "Purchase")
                .withArgs(
                    signers.user1.address,
                    amount,
                    expectedValues.basePrice,
                    expectedValues.premium,
                    costs.totalCost,
                    expectedVesting
                );

            // Verify user received tokens
            expect(await tokenContract.balanceOf(signers.user1.address)).to.equal(amount);

            // Verify remaining supply decreased
            const newConfig = await launchContract.pricingConfig();
            expect(newConfig.remainingSupply).to.equal(launchConfig.totalSupply - amount);

            // Verify treasury received funds
            const newTreasuryBalance = await ethers.provider.getBalance(signers.treasury.address);
            expect(newTreasuryBalance).to.equal(initialTreasuryBalance + costs.totalCostWithFee);

            // Verify vesting stats were updated
            const stats = await launchContract.getDistributionStats();
            expect(stats._totalRaised).to.equal(costs.totalCost);
            expect(stats._totalParticipants).to.equal(1);
            expect(stats._largestPurchase).to.equal(amount);
            expect(stats._largestPurchaser).to.equal(signers.user1.address);

            // Check that participant flag was set
            expect(await launchContract.hasParticipated(signers.user1.address)).to.be.true;
        });

        it("should reject purchase if payment is insufficient", async function () {
            const amount = launchConfig.totalSupply / 100n; // 1% of supply
            const costs = await launchContract.calculateTotalCost(amount);

            // Try to purchase with insufficient payment
            const insufficientPayment = costs.totalCostWithFee - ethers.parseEther("0.01");
            await expect(
                launchContract.connect(signers.user1).purchaseTokens(amount, { value: insufficientPayment })
            ).to.be.revertedWithCustomError(launchContract, "InsufficientPayment");
        });

        it("should reject purchase exceeding max purchase amount", async function () {
            const tooLargeAmount = launchConfig.maxPurchaseAmount + 1n;

            await expect(
                launchContract.connect(signers.user1).purchaseTokens(tooLargeAmount, { value: ethers.parseEther("100") })
            ).to.be.revertedWithCustomError(launchContract, "ExceedsMaxPurchase");
        });

        it("should refund excess payment", async function () {
            const amount = launchConfig.totalSupply / 1000n; // 0.1% of supply
            const costs = await launchContract.calculateTotalCost(amount);

            // Overpay by 1 ETH
            const overpayment = costs.totalCostWithFee + ethers.parseEther("1");

            // Track buyer's balance
            const initialBuyerBalance = await ethers.provider.getBalance(signers.user1.address);

            // Purchase with overpayment
            const tx = await launchContract.connect(signers.user1).purchaseTokens(amount, { value: overpayment });
            const receipt = await tx.wait();

            // Calculate gas cost
            const gasCost = receipt.gasUsed * receipt.gasPrice;

            // Final balance should be initial - required payment - gas costs
            const expectedFinalBalance = initialBuyerBalance - costs.totalCostWithFee - gasCost;

            const finalBuyerBalance = await ethers.provider.getBalance(signers.user1.address);
            expect(finalBuyerBalance).to.be.closeTo(expectedFinalBalance, ethers.parseEther("0.01"));
        });

        it("should create vesting schedule with correct duration", async function () {
            const amount = launchConfig.totalSupply / 100n;
            const costs = await launchContract.calculateTotalCost(amount);

            // Get vesting duration
            const expectedDuration = await launchContract.calculateVestingDuration();

            // Execute purchase
            await launchContract.connect(signers.user1).purchaseTokens(amount, { value: costs.totalCostWithFee });

            // Get vesting schedule
            const schedules = await vestingContract.getUserVestingSchedules(tokenContract.target, signers.user1.address);
            expect(schedules.length).to.equal(1);

            // Calculate duration from schedule
            const actualDuration = schedules[0].endTime - schedules[0].startTime;
            expect(actualDuration).to.equal(expectedDuration);

            // Verify schedule amount
            expect(schedules[0].totalAmount).to.equal(amount);
        });

        it("should track statistics correctly across multiple purchases", async function () {
            // First purchase
            const amount1 = launchConfig.totalSupply / 200n; // 0.5% of supply
            const costs1 = await launchContract.calculateTotalCost(amount1);
            await launchContract.connect(signers.user1).purchaseTokens(amount1, { value: costs1.totalCostWithFee });

            // Second purchase (larger)
            const amount2 = launchConfig.totalSupply / 133n; // 0.75% of supply
            const costs2 = await launchContract.calculateTotalCost(amount2);
            await launchContract.connect(signers.user2).purchaseTokens(amount2, { value: costs2.totalCostWithFee });

            // Third purchase (smaller)
            const amount3 = launchConfig.totalSupply / 400n; // 0.25% of supply
            const costs3 = await launchContract.calculateTotalCost(amount3);
            await launchContract.connect(signers.user1).purchaseTokens(amount3, { value: costs3.totalCostWithFee });

            // Check stats
            const stats = await launchContract.getDistributionStats();

            expect(stats._totalRaised).to.equal(costs1.totalCost + costs2.totalCost + costs3.totalCost);
            expect(stats._totalParticipants).to.equal(2); // Update to reflect two unique buyers now
            expect(stats._largestPurchase).to.equal(amount2); // signers.user2's purchase was largest
            expect(stats._largestPurchaser).to.equal(signers.user2.address);

            // Calculate percentage sold
            const totalSold = amount1 + amount2 + amount3;
            const percentageSold = totalSold * ethers.parseEther("100") / launchConfig.totalSupply;
            expect(stats._percentageSold).to.be.closeTo(percentageSold, ethers.parseEther("0.01"));
        });
    });

    // Additional tests for new Launch contract functionality

    describe("Supply Management", function () {
        it("should properly track and enforce mintCap", async function () {
            // Check initial supply info
            const initialSupplyInfo = await launchContract.getSupplyInfo();
            expect(initialSupplyInfo.totalMintCap).to.equal(launchConfig.mintCap);
            expect(initialSupplyInfo.totalMinted).to.equal(0);
            expect(initialSupplyInfo.mintRemaining).to.equal(launchConfig.mintCap);

            // Purchase some tokens
            const purchaseAmount = ethers.parseUnits("10000", 18);
            const cost = await launchContract.calculateTotalCost(purchaseAmount);
            await launchContract.connect(signers.user1).purchaseTokens(purchaseAmount, { value: cost.totalCostWithFee });

            // Check updated supply info
            const updatedSupplyInfo = await launchContract.getSupplyInfo();
            expect(updatedSupplyInfo.totalMinted).to.equal(purchaseAmount);
            expect(updatedSupplyInfo.mintRemaining).to.equal(launchConfig.mintCap - purchaseAmount);
        });

        it("should allow increasing the mint cap", async function () {
            const oldMintCap = await launchContract.mintCap();
            const newMintCap = oldMintCap + ethers.parseUnits("1000000", 18);

            await expect(launchContract.updateMintCap(newMintCap))
                .to.emit(launchContract, "MintCapUpdated")
                .withArgs(oldMintCap, newMintCap);

            expect(await launchContract.mintCap()).to.equal(newMintCap);
        });

        it("should reject decreasing the mint cap", async function () {
            const oldMintCap = await launchContract.mintCap();
            const lowerMintCap = oldMintCap - 1n;

            await expect(launchContract.updateMintCap(lowerMintCap))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });

        it("should reject setting mint cap below current supply + remaining distribution", async function () {
            // Purchase some tokens
            const purchaseAmount = ethers.parseUnits("10000", 18);
            const cost = await launchContract.calculateTotalCost(purchaseAmount);
            await launchContract.connect(signers.user1).purchaseTokens(purchaseAmount, { value: cost.totalCostWithFee });

            // Get current supply
            const currentSupply = await tokenContract.totalSupply();

            // Try to set mint cap below what's needed for distribution
            const invalidMintCap = currentSupply + (await launchContract.getRemainingSupply()) - 1n;

            await expect(launchContract.updateMintCap(invalidMintCap))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });
    });

    describe("Admin Mint", function () {
        it("should allow admin to mint tokens outside distribution", async function () {
            const mintAmount = ethers.parseUnits("50000", 18);

            await expect(launchContract.adminMint(signers.treasury.address, mintAmount))
                .to.emit(launchContract, "AdminMint")
                .withArgs(signers.treasury.address, mintAmount);

            expect(await tokenContract.balanceOf(signers.treasury.address)).to.equal(mintAmount);
        });

        it("should reject admin mint exceeding available capacity", async function () {
            // Get current mint capacity minus distribution
            const supplyInfo = await launchContract.getSupplyInfo();
            const extraCapacity = supplyInfo.mintRemaining - supplyInfo.remainingDistributionSupply;

            // Try to mint more than available
            const excessiveAmount = extraCapacity + 1n;

            await expect(launchContract.adminMint(signers.treasury.address, excessiveAmount))
                .to.be.revertedWithCustomError(launchContract, "InsufficientMintCapacity");
        });

        it("should reject admin mint to zero address", async function () {
            await expect(launchContract.adminMint(ethers.ZeroAddress, ethers.parseUnits("1000", 18)))
                .to.be.revertedWithCustomError(launchContract, "ZeroAddress");
        });

        it("should reject admin mint of zero tokens", async function () {
            await expect(launchContract.adminMint(signers.treasury.address, 0))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });
    });

    describe("Transaction Fee Management", function () {
        it("should allow updating the transaction fee", async function () {
            const newFee = ethers.parseEther("0.05"); // 0.05 ETH

            await expect(launchContract.setTransactionFee(newFee))
                .to.emit(launchContract, "TransactionFeeUpdated")
                .withArgs(newFee);

            expect(await launchContract.transactionFee()).to.equal(newFee);

            // Verify fee is used in calculations
            const amount = ethers.parseUnits("10000", 18);
            const costs = await launchContract.calculateTotalCost(amount);
            expect(costs.totalCostWithFee).to.equal(costs.totalCost + newFee);
        });

        it("should reject setting transaction fee to zero", async function () {
            await expect(launchContract.setTransactionFee(0))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });

        it("should apply updated fee to purchases", async function () {
            // Set a new fee
            const newFee = ethers.parseEther("0.05");
            await launchContract.setTransactionFee(newFee);

            // Make a purchase
            const amount = ethers.parseUnits("1000", 18);
            const costs = await launchContract.calculateTotalCost(amount);

            // Record initial treasury balance
            const initialTreasuryBalance = await ethers.provider.getBalance(signers.treasury.address);

            // Purchase with exact required payment
            await launchContract.connect(signers.user1).purchaseTokens(amount, { value: costs.totalCostWithFee });

            // Verify treasury received the payment including the new fee
            const newTreasuryBalance = await ethers.provider.getBalance(signers.treasury.address);
            expect(newTreasuryBalance - initialTreasuryBalance).to.equal(costs.totalCostWithFee);
        });
    });

    describe("Preview Purchase With ETH", function () {
        it("should correctly preview purchase outcomes", async function () {
            const ethAmount = ethers.parseEther("1");

            const preview = await launchContract.previewPurchaseWithETH(ethAmount);

            // Check that the returned values are reasonable
            expect(preview.tokenAmount).to.be.gt(0);
            expect(preview.totalCost).to.be.lte(ethAmount); // Should not exceed input amount
            expect(preview.basePrice).to.equal(await launchContract.getBasePrice());
            expect(preview.premium).to.equal(await launchContract.calculatePremium(preview.tokenAmount));

            // Execute the purchase and verify results match preview
            await launchContract.connect(signers.user1).purchaseTokensWithETH({ value: ethAmount });
            expect(await tokenContract.balanceOf(signers.user1.address)).to.equal(preview.tokenAmount);
        });

        it("should handle previews with insufficient ETH", async function () {
            // Try with less than transaction fee
            const smallAmount = (await launchContract.transactionFee()) - 1n;
            const preview = await launchContract.previewPurchaseWithETH(smallAmount);

            // Should return zeros for all values
            expect(preview.tokenAmount).to.equal(0);
            expect(preview.totalCost).to.equal(0);
            expect(preview.basePrice).to.equal(0);
            expect(preview.premium).to.equal(0);
        });

        it("should preview amounts respecting max purchase limit", async function () {
            // Set a low max purchase limit
            const lowLimit = ethers.parseUnits("500", 18);
            await launchContract.setMaxPurchaseAmount(lowLimit);

            // Preview with large ETH amount
            const largeAmount = ethers.parseEther("1000");
            const preview = await launchContract.previewPurchaseWithETH(largeAmount);

            // Token amount should be capped at max purchase amount
            expect(preview.tokenAmount).to.equal(lowLimit);
        });

        it("should preview amounts respecting remaining supply", async function () {
            // Set remaining supply to a low value
            const lowSupply = ethers.parseUnits("200", 18);
            await launchContract.setRemainingSupply(lowSupply);

            // Preview with large ETH amount
            const largeAmount = ethers.parseEther("10000");
            const preview = await launchContract.previewPurchaseWithETH(largeAmount);

            // Token amount should be capped at remaining supply
            expect(preview.tokenAmount).to.be.closeTo(lowSupply, lowSupply / 1000n);
        });
    });

    describe("Validation Constraints", function () {
        it("should properly validate alpha parameters", async function () {
            // Valid values
            await expect(launchContract.updatePriceParameters(-1, 10, ethers.parseEther("70")))
                .to.not.be.reverted;

            await expect(launchContract.updatePriceParameters(-10, 10, ethers.parseEther("70")))
                .to.not.be.reverted;

            // Invalid values
            await expect(launchContract.updatePriceParameters(-11, 10, ethers.parseEther("70")))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");

            await expect(launchContract.updatePriceParameters(1, 10, ethers.parseEther("70")))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });

        it("should properly validate k parameter", async function () {
            // Valid values
            await expect(launchContract.updatePriceParameters(-1, 10, ethers.parseEther("70")))
                .to.not.be.reverted;

            await expect(launchContract.updatePriceParameters(-1, 250, ethers.parseEther("70")))
                .to.not.be.reverted;

            // Invalid value
            await expect(launchContract.updatePriceParameters(-1, 251, ethers.parseEther("70")))
                .to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });
    });

    describe("Supply and Remaining Supply Info", function () {
        it("should correctly report distribution statistics", async function () {
            // Make multiple purchases
            const amount1 = ethers.parseUnits("10000", 18);
            const cost1 = await launchContract.calculateTotalCost(amount1);
            await launchContract.connect(signers.user1).purchaseTokens(amount1, { value: cost1.totalCostWithFee });

            const amount2 = ethers.parseUnits("20000", 18);
            const cost2 = await launchContract.calculateTotalCost(amount2);
            await launchContract.connect(signers.user2).purchaseTokens(amount2, { value: cost2.totalCostWithFee });

            // Check getSupplyInfo
            const supplyInfo = await launchContract.getSupplyInfo();
            expect(supplyInfo.totalDistributionSupply).to.equal(launchConfig.totalSupply);
            expect(supplyInfo.remainingDistributionSupply).to.equal(launchConfig.totalSupply - amount1 - amount2);
            expect(supplyInfo.totalMinted).to.equal(amount1 + amount2);

            // Check getDistributionStats
            const stats = await launchContract.getDistributionStats();
            expect(stats._totalRaised).to.equal(cost1.totalCost + cost2.totalCost);
            expect(stats._totalParticipants).to.equal(2);
            expect(stats._largestPurchase).to.equal(amount2);
            expect(stats._largestPurchaser).to.equal(signers.user2.address);

            // Calculate percentage sold and compare
            const totalSold = amount1 + amount2;
            const percentageSold = (totalSold * ethers.parseEther("100")) / launchConfig.totalSupply;
            expect(stats._percentageSold).to.be.closeTo(percentageSold, ethers.parseEther("0.01"));
        });

        it("should report correct percentage sold", async function () {
            // No purchases yet
            expect(await launchContract.getPercentageSold()).to.equal(0);

            // Make a purchase of 10% of supply
            const tenPercent = launchConfig.totalSupply / 10n;
            const cost = await launchContract.calculateTotalCost(tenPercent);
            await launchContract.connect(signers.user1).purchaseTokens(tenPercent, { value: cost.totalCostWithFee });

            // Should report approximately 10%
            expect(await launchContract.getPercentageSold()).to.be.closeTo(
                ethers.parseEther("10"),
                ethers.parseEther("0.01")
            );
        });
    });

    describe("Phase Management", function () {
        it("should allow phase transitions in correct order", async function () {
            // Already in Distribution phase from setup
            expect(await launchContract.currentPhase()).to.equal(1); // Distribution

            // Move to AMM phase
            await expect(launchContract.moveToAMMPhase())
                .to.emit(launchContract, "PhaseChanged")
                .withArgs(1, 2); // From Distribution to AMM

            expect(await launchContract.currentPhase()).to.equal(2); // AMM

            // Move to Market phase
            await expect(launchContract.moveToMarketPhase())
                .to.emit(launchContract, "PhaseChanged")
                .withArgs(2, 3); // From AMM to Market

            expect(await launchContract.currentPhase()).to.equal(3); // Market
        });

        it("should reject invalid phase transitions", async function () {
            // Try to skip from Distribution to Market
            await expect(launchContract.moveToMarketPhase())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");

            // Move to AMM phase
            await launchContract.moveToAMMPhase();

            // Try to move back to Distribution
            await expect(launchContract.startDistribution())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");
        });

        it("should prevent purchases when not in Distribution phase", async function () {
            // Move to AMM phase
            await launchContract.moveToAMMPhase();

            // Attempt purchase
            const amount = ethers.parseUnits("10000", 18);
            await expect(
                launchContract.connect(signers.user1).purchaseTokens(amount, { value: ethers.parseEther("10") })
            ).to.be.revertedWithCustomError(launchContract, "NotDistributionPhase");
        });
    });

    describe("Parameter Updates", function () {
        it("should allow updating price parameters", async function () {
            const newAlpha = -2;
            const newK = 15;
            const newBeta = ethers.parseEther("50");

            await expect(launchContract.updatePriceParameters(newAlpha, newK, newBeta))
                .to.emit(launchContract, "PriceParametersUpdated")
                .withArgs(newAlpha, newK, newBeta);

            const config = await launchContract.pricingConfig();
            expect(config.alphaParameter).to.equal(newAlpha);
            expect(config.premiumIntensityK).to.equal(newK);
            expect(config.betaParameter).to.equal(newBeta);
        });

        it("should allow updating max purchase amount", async function () {
            const newMaxAmount = ethers.parseUnits("200000", 18);

            await expect(launchContract.setMaxPurchaseAmount(newMaxAmount))
                .to.emit(launchContract, "MaxPurchaseAmountUpdated")
                .withArgs(launchConfig.maxPurchaseAmount, newMaxAmount);

            expect(await launchContract.maxPurchaseAmount()).to.equal(newMaxAmount);
        });

        it("should allow updating treasury address", async function () {
            const newTreasury = signers.user2.address;

            await expect(launchContract.setTreasury(newTreasury))
                .to.emit(launchContract, "TreasuryUpdated")
                .withArgs(signers.treasury.address, newTreasury);

            expect(await launchContract.treasury()).to.equal(newTreasury);
        });

        it("should reject invalid parameter values", async function () {
            // Invalid beta > 100e18
            await expect(
                launchContract.updatePriceParameters(launchConfig.alpha, launchConfig.k, ethers.parseEther("101"))
            ).to.be.revertedWithCustomError(launchContract, "InvalidParameter");

            // Zero max purchase amount
            await expect(
                launchContract.setMaxPurchaseAmount(0)
            ).to.be.revertedWithCustomError(launchContract, "InvalidParameter");

            // Zero address for treasury
            await expect(
                launchContract.setTreasury(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(launchContract, "ZeroAddress");
        });
    });

    describe("Emergency Functions", function () {
        it("should allow pausing and unpausing", async function () {
            // Pause
            await launchContract.pause();
            expect(await launchContract.paused()).to.be.true;

            // Attempt purchase while paused
            const amount = ethers.parseUnits("10000", 18);
            await expect(
                launchContract.connect(signers.user1).purchaseTokens(amount, { value: ethers.parseEther("10") })
            ).to.be.revertedWithCustomError(launchContract, "EnforcedPause");

            // Unpause
            await launchContract.unpause();
            expect(await launchContract.paused()).to.be.false;

            // Purchase should work now
            const costs = await launchContract.calculateTotalCost(amount);
            await launchContract.connect(signers.user1).purchaseTokens(amount, { value: costs.totalCostWithFee });
        });

        it("should allow recovering accidentally sent ERC20 tokens", async function () {
            // Deploy a test token
            const TestToken = await ethers.getContractFactory("MockERC20");
            const testToken = await TestToken.deploy("Test Token", "TEST");
            await testToken.waitForDeployment();
            const tokenAddress = testToken.getAddress();

            // Send some tokens to the contract
            await testToken.mint(signers.user1.address, ethers.parseEther("100"));
            await testToken.connect(signers.user1).transfer(launchContract.target, ethers.parseEther("50"));
            expect(await testToken.balanceOf(launchContract.target)).to.equal(ethers.parseEther("50"));
            expect(await testToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("50"));

            // Recover tokens
            await expect(launchContract.recoverERC20(tokenAddress, ethers.parseEther("50"), signers.user1.address))
                .to.emit(launchContract, "TokenRecovered")
                .withArgs(tokenAddress, ethers.parseEther("50"), signers.user1.address);

            // Verify tokens were recovered
            expect(await testToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("100"));
            expect(await testToken.balanceOf(launchContract.target)).to.equal(ethers.parseEther("0"));
        });

        it("should prevent recovering DLP tokens", async function () {
            await expect(
                launchContract.recoverERC20(tokenContract.target, ethers.parseEther("10"), signers.admin.address)
            ).to.be.revertedWithCustomError(launchContract, "InvalidParameter");
        });
    });

    describe("Edge Cases", function () {
        it("should handle the last tokens in supply", async function () {
            // Set remaining supply to one token
            await launchContract.setRemainingSupply(ethers.parseUnits("1", 18));

            // Buy the rest
            const remainingAmount = await launchContract.getRemainingSupply();
            const finalCosts = await launchContract.calculateTotalCost(remainingAmount);
            await launchContract.connect(signers.user2).purchaseTokens(remainingAmount, { value: finalCosts.totalCostWithFee });

            // Verify supply is exhausted
            expect(await launchContract.getRemainingSupply()).to.equal(0);

            // Verify percentage sold is 100%
            const stats = await launchContract.getDistributionStats();
            expect(stats._percentageSold).to.be.closeTo(ethers.parseEther("100"), ethers.parseEther("0.01"));

            // Try to buy more
            await expect(
                launchContract.connect(signers.user1).purchaseTokens(1, { value: ethers.parseEther("1000") })
            ).to.be.revertedWithCustomError(launchContract, "InsufficientSupply");
        });

        it("should reject purchases after supply is exhausted", async function () {
            // Set remaining supply equal to total supply
            await launchContract.setRemainingSupply(0);

            // Try to buy more
            await expect(
                launchContract.connect(signers.user1).purchaseTokens(1, { value: ethers.parseEther("1000") })
            ).to.be.revertedWithCustomError(launchContract, "InsufficientSupply");
        });
    });

    describe("Purchase Tokens With ETH", function () {
        it("should calculate and mint the correct number of tokens when sending ETH", async function () {
            // Send 1 ETH for token purchase
            const ethAmount = ethers.parseEther("1");

            // Get expected values
            const expectedVesting = await launchContract.calculateVestingDuration();
            const expectedTokens = await launchContract.calculateTokensForETH(ethAmount);
            const preview = await launchContract.previewPurchaseWithETH(ethAmount);

            expect(preview.tokenAmount).to.equal(expectedTokens);

            // Record initial state
            const initialRemainingSupply = (await launchContract.pricingConfig()).remainingSupply;
            const initialBuyerTokenVesting = await vestingContract.getVestedAmountForUser(signers.user1.address, ethers.parseUnits("100000", 18));

            // Purchase tokens with ETH
            await expect(launchContract.connect(signers.user1).purchaseTokensWithETH({ value: ethAmount }))
                .to.emit(launchContract, "Purchase")
                .withArgs(
                    signers.user1.address,
                    expectedTokens,
                    preview.basePrice,
                    preview.premium,
                    preview.totalCost - launchConfig.txnFee,
                    expectedVesting
                );


            // Verify user received tokens
            expect(await tokenContract.balanceOf(signers.user1.address)).to.equal(expectedTokens);

            // Verify supply decreased by expected amount
            const newRemainingSupply = (await launchContract.pricingConfig()).remainingSupply;
            expect(initialRemainingSupply - newRemainingSupply).to.equal(expectedTokens);

            // Verify vesting schedule was created
            const newBuyerTokenVesting = await vestingContract.getVestedAmountForUser(signers.user1.address, ethers.parseUnits("100000", 18));
            expect(newBuyerTokenVesting - initialBuyerTokenVesting).to.equal(expectedTokens);
        });

        it("should cap purchase at maxPurchaseAmount", async function () {
            // Set a low max purchase amount
            const lowMaxPurchase = ethers.parseUnits("1000", 18);
            await launchContract.setMaxPurchaseAmount(lowMaxPurchase);

            // Send a large amount of ETH
            const largeEthAmount = ethers.parseEther("100");

            // Purchase tokens
            await launchContract.connect(signers.user1).purchaseTokensWithETH({ value: largeEthAmount });

            // Get purchase statistics
            const stats = await launchContract.getDistributionStats();

            // Largest purchase should be capped at maxPurchaseAmount
            expect(stats._largestPurchase).to.equal(lowMaxPurchase);

            // Remaining ETH should have been refunded
            // (We can't easily check exact refund amount, but we verify that purchase was capped)
        });

        it("should reject if provided ETH is less than or equal to transaction fee", async function () {
            // Send exactly the transaction fee
            await expect(
                launchContract.connect(signers.user1).purchaseTokensWithETH({ value: launchConfig.txnFee })
            ).to.be.revertedWithCustomError(launchContract, "InsufficientPayment");

            // Send less than the transaction fee
            await expect(
                launchContract.connect(signers.user1).purchaseTokensWithETH({ value: launchConfig.txnFee - 1n })
            ).to.be.revertedWithCustomError(launchContract, "InsufficientPayment");
        });

        it("should handle remaining supply correctly", async function () {
            // Set remaining supply to one token
            await launchContract.setRemainingSupply(ethers.parseUnits("100", 18));

            // Track user balance
            const initialUserBalance = await ethers.provider.getBalance(signers.user1.address);
            const expectedCost = await launchContract.calculateTotalCost(ethers.parseUnits("100", 18));

            // Try to buy with large ETH amount
            const largeEthAmount = ethers.parseEther("9000");

            // Should only get remaining tokens
            await launchContract.connect(signers.user1).purchaseTokensWithETH({ value: largeEthAmount });

            // Check remaining supply is now zero
            expect(await launchContract.getRemainingSupply()).to.equal(0);

            // Check that remaining ETH was refunded
            const finalUserBalance = await ethers.provider.getBalance(signers.user1.address);
            expect(finalUserBalance).to.be.closeTo(initialUserBalance - expectedCost.totalCostWithFee, ethers.parseEther("0.01"));
        });

        it("should allow sending ETH directly to contract", async function () {
            // Send 1 ETH to contract
            const ethAmount = ethers.parseEther("1");

            // Record initial state
            const initialRemainingSupply = (await launchContract.pricingConfig()).remainingSupply;

            const expectedTokens = await launchContract.calculateTokensForETH(ethAmount);

            // Send ETH to contract
            await expect(signers.user1.sendTransaction({ to: launchContract.target, value: ethAmount })).to.not.be.reverted;

            // Verify user received tokens
            const balance = await tokenContract.balanceOf(signers.user1.address);
            expect(balance).to.equal(expectedTokens);

            // Verify remaining supply decreased by expected amount
            const newRemainingSupply = (await launchContract.pricingConfig()).remainingSupply;

            expect(initialRemainingSupply - newRemainingSupply).to.equal(expectedTokens);
        });
    });
});