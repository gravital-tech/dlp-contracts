const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const fixtures = require("./utils/fixtures-e2e");

describe("DLP System - Phase Transitions E2E Tests", function () {
    describe("Phase Transition Rules", function () {
        it("should enforce correct phase transition sequence", async function () {
            const { launchContract } = await loadFixture(fixtures.deployE2EFixture);

            // Initial phase should be NotStarted
            expect(await launchContract.currentPhase()).to.equal(0); // NotStarted

            // Cannot skip directly to AMM
            await expect(launchContract.moveToAMMPhase())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");

            // Cannot skip directly to Market
            await expect(launchContract.moveToMarketPhase())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");

            // Start distribution phase
            await launchContract.startDistribution();
            expect(await launchContract.currentPhase()).to.equal(1); // Distribution

            // Cannot skip to Market from Distribution
            await expect(launchContract.moveToMarketPhase())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");

            // Move to AMM phase
            await launchContract.moveToAMMPhase();
            expect(await launchContract.currentPhase()).to.equal(2); // AMM

            // Cannot go back to Distribution
            await expect(launchContract.startDistribution())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");

            // Move to Market phase
            await launchContract.moveToMarketPhase();
            expect(await launchContract.currentPhase()).to.equal(3); // Market

            // Cannot go back to previous phases
            await expect(launchContract.startDistribution())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");
            await expect(launchContract.moveToAMMPhase())
                .to.be.revertedWithCustomError(launchContract, "InvalidPhaseTransition");
        });

        it("should emit PhaseChanged event on phase transitions", async function () {
            const { launchContract } = await loadFixture(fixtures.deployE2EFixture);

            // Listen for PhaseChanged event with the correct arguments
            await expect(launchContract.startDistribution())
                .to.emit(launchContract, "PhaseChanged")
                .withArgs(0, 1); // From NotStarted(0) to Distribution(1)

            await expect(launchContract.moveToAMMPhase())
                .to.emit(launchContract, "PhaseChanged")
                .withArgs(1, 2); // From Distribution(1) to AMM(2)

            await expect(launchContract.moveToMarketPhase())
                .to.emit(launchContract, "PhaseChanged")
                .withArgs(2, 3); // From AMM(2) to Market(3)
        });
    });

    describe("Phase Functionality Restrictions", function () {
        it("should only allow purchases during Distribution phase", async function () {
            // In NotStarted phase
            const { launchContract: notStartedLaunch, signers } = await loadFixture(fixtures.deployE2EFixture);
            const { user1 } = signers;

            // Cannot purchase in NotStarted phase
            await expect(notStartedLaunch.connect(user1).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            )).to.be.revertedWithCustomError(notStartedLaunch, "NotDistributionPhase");

            // In Distribution phase - should work
            const { launchContract: distributionLaunch } = await loadFixture(fixtures.deployDistributionPhaseFixture);

            await expect(distributionLaunch.connect(user1).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            )).to.not.be.reverted;

            // In AMM phase
            const { launchContract: ammLaunch } = await loadFixture(fixtures.deployAMMPhaseFixture);

            await expect(ammLaunch.connect(user1).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            )).to.be.revertedWithCustomError(ammLaunch, "NotDistributionPhase");

            // In Market phase
            const { launchContract: marketLaunch } = await loadFixture(fixtures.deployMarketPhaseFixture);

            await expect(marketLaunch.connect(user1).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            )).to.be.revertedWithCustomError(marketLaunch, "NotDistributionPhase");
        });

        it("should not affect token transfers with phase transitions", async function () {
            // Setup system with purchases and partial vesting
            const { launchContract, tokenContract, vestingContract, signers } = await loadFixture(fixtures.deployDistributionPhaseFixture);
            const { user1, user2 } = signers;

            // Make a purchase
            await launchContract.connect(user1).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            );

            // Advance time to vest some tokens
            await fixtures.advanceTimeForVesting(86400 * 30); // 30 days

            // Get vested amount
            const vestedAmount = await vestingContract.getVestedAmountForUser(user1.address, 0);
            expect(vestedAmount).to.be.gt(0);

            // Transfer in Distribution phase
            await expect(tokenContract.connect(user1).transfer(user2.address, vestedAmount / 2n))
                .to.not.be.reverted;

            // Move to AMM phase
            await launchContract.moveToAMMPhase();

            // Transfer in AMM phase should still work
            await expect(tokenContract.connect(user1).transfer(user2.address, vestedAmount / 4n))
                .to.not.be.reverted;

            // Move to Market phase
            await launchContract.moveToMarketPhase();

            // Transfer in Market phase should still work
            await expect(tokenContract.connect(user1).transfer(user2.address, vestedAmount / 8n))
                .to.not.be.reverted;
        });
    });

    describe("Emergency Controls", function () {
        it("should halt purchases when paused", async function () {
            const { launchContract, signers } = await loadFixture(fixtures.deployPausedSystemFixture);
            const { user4 } = signers;

            // Attempt purchase while paused
            await expect(launchContract.connect(user4).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            )).to.be.reverted; // Paused error

            // Unpause
            await launchContract.unpause();

            // Purchase should now work
            await expect(launchContract.connect(user4).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            )).to.not.be.reverted;
        });

        it("should allow emergency parameter updates during any phase", async function () {
            // Test in AMM phase
            const { launchContract, signers } = await loadFixture(fixtures.deployAMMPhaseFixture);
            const { admin } = signers;

            // Update max purchase amount
            const newMaxAmount = ethers.parseUnits("50000", 18);
            await expect(launchContract.setMaxPurchaseAmount(newMaxAmount))
                .to.emit(launchContract, "MaxPurchaseAmountUpdated");

            expect(await launchContract.maxPurchaseAmount()).to.equal(newMaxAmount);

            // Update treasury address
            const newTreasury = admin.address; // Just for testing
            await expect(launchContract.setTreasury(newTreasury))
                .to.emit(launchContract, "TreasuryUpdated");

            expect(await launchContract.treasury()).to.equal(newTreasury);

            // Update transaction fee
            const newFee = ethers.parseEther("0.02");
            await expect(launchContract.setTransactionFee(newFee))
                .to.emit(launchContract, "TransactionFeeUpdated");

            expect(await launchContract.transactionFee()).to.equal(newFee);
        });
    });
});