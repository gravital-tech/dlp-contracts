const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const fixtures = require("./utils/fixtures-e2e");

describe("DLP System - Launch Contract Purchases E2E Tests", function () {
    let launchContract, tokenContract, vestingContract, signers, user1;

    beforeEach(async function () {
        const setup = await loadFixture(fixtures.deployDistributionPhaseFixture);
        launchContract = setup.launchContract;
        tokenContract = setup.tokenContract;
        vestingContract = setup.vestingContract;
        signers = setup.signers;
        user1 = signers.user1;
    });

    describe("purchaseTokens", function () {
        it("should purchase tokens with the specified amount", async function () {
            await launchContract.connect(user1).purchaseTokens(
                ethers.parseUnits("500", 18),
                { value: ethers.parseEther("1") }
            );
            expect(await tokenContract.balanceOf(user1.address)).to.be.gt(0);
        });
    });

    describe("purchaseTokensWithETH", function () {
        it("should purchase tokens by just specifying ETH", async function () {
            await launchContract.connect(user1).purchaseTokensWithETH({
                value: ethers.parseEther("2"),
            });
            expect(await tokenContract.balanceOf(user1.address)).to.be.gt(0);
        });
    });

    describe("Sending ETH directly", function () {
        it("should purchase tokens via receive() fallback", async function () {
            await user1.sendTransaction({
                to: launchContract.target,
                value: ethers.parseEther("2"),
            });
            expect(await tokenContract.balanceOf(user1.address)).to.be.gt(0);
        });
    });

    describe("Edge Cases", function () {
        it("should revert if user provides insufficient ETH for token purchase", async function () {
            await expect(
                launchContract.connect(user1).purchaseTokens(
                    ethers.parseUnits("1000", 18),
                    { value: ethers.parseEther("0.0001") }
                )
            ).to.be.reverted;
        });

        it("should revert if user tries to purchase zero tokens", async function () {
            await expect(
                launchContract.connect(user1).purchaseTokens(
                    ethers.parseUnits("0", 18),
                    { value: ethers.parseEther("0") }
                )
            ).to.be.reverted;
        });

        it("should revert if user tries to purchase beyond max purchase amount", async function () {
            const maxPurchase = await launchContract.maxPurchaseAmount();
            await expect(
                launchContract.connect(user1).purchaseTokens(
                    maxPurchase + 1n,
                    { value: ethers.parseEther("100") }
                )
            ).to.be.reverted;
        });
    });
});