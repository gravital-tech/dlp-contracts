const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { keccak256, toUtf8Bytes } = require("ethers");
const tokenFixtures = require("./utils/fixtures-token");
const testLogic = require("./utils/logic-token");
const { getLinearVestingAmount, getLinearVestingAmountFromSchedules, getTolerance, getToleranceFromSchedules } = require("./utils/vestingMath");

describe("Token-Vesting Integration Tests", function () {
    describe("Basic Integration with Vesting Contract", function () {
        it("Should revert transfer if token is not registered with vesting contract", async function () {
            const { dlpToken, vestingContract, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            await expect(dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("5"))).to.be.revertedWithCustomError(vestingContract, "NotTokenContract");
        });

        it("Should check vesting contract for transfer allowance", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            // Mock allows transfer, so this should succeed
            await dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("500"));
            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("500"));
        });

        it("Should record transfers in the vesting contract", async function () {
            const { dlpToken, mockVesting, signers } = await loadFixture(tokenFixtures.deployWithMockVestingFixture);

            const transferAmount = ethers.parseEther("10");
            const tx = await dlpToken.connect(signers.user1).transfer(signers.user2.address, transferAmount);
            const receipt = await tx.wait();

            // Get the event signature hash for TransferRecorded
            const transferRecordedEventSignature = keccak256(toUtf8Bytes("TransferRecorded(address,address,uint256)"));

            // Check if the event was emitted
            const transferRecordedEvent = receipt.logs.find(
                log => log.address === mockVesting.target && log.topics[0] === transferRecordedEventSignature
            );

            expect(transferRecordedEvent).to.exist;
        });

        it("Should not check vesting rules for mint and burn operations", async function () {
            const { dlpToken, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            // Verify that mint operations work even with vesting active
            await dlpToken.connect(signers.minter).mint(signers.user2.address, ethers.parseEther("500"));
            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("500"));

            // Verify that burn operations work even with vesting active
            await dlpToken.connect(signers.user1).burn(ethers.parseEther("300"));
            expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(ethers.parseEther("700"));
        });

        it("Should not check vesting when vesting is inactive", async function () {
            const { dlpToken, vestingContract, signers } = await loadFixture(tokenFixtures.deployWithTokensFixture);

            // Disable vesting
            await dlpToken.connect(signers.admin).setVestingActive(false);

            // Transfer should work without checking the vesting contract
            await dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("500"));
            expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(ethers.parseEther("500"));

            // No vesting event should be emitted
            const tx = await dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("100"));
            const receipt = await tx.wait();

            const transferRecordedEvent = receipt.logs.find(
                log => log.address === vestingContract.target && log.fragment?.name === "TransferRecorded"
            );

            expect(transferRecordedEvent).to.be.undefined;
        });

    });

    describe("Single User, Single Vesting Schedule Creation", function () {
        describe("80% Withdrawal", function () {
            for (const fixture of tokenFixtures.singleUserInProgressCompleteFixtures) {
                testLogic.testWithdrawalPercentage(fixture)(80);
            }
        });

        describe("100% Withdrawal", function () {
            for (const fixture of tokenFixtures.singleUserInProgressCompleteFixtures) {
                testLogic.testWithdrawalPercentage(fixture)(100);
            }
        });

        describe("Full Transfer After Completion", function () {
            testLogic.testFullTransferAfterCompletion(tokenFixtures.singleUserVestingComplete); // Call test logic function
        });

        describe("Revert Transfer Exceeding Vested Amount", function () {
            for (const fixture of tokenFixtures.singleUserInProgressCompleteFixtures) {
                testLogic.testRevertTransferExceedingVestedAmount(fixture);
            }
        });

        describe("Revert Transfer Before Vest Start", function () {
            testLogic.testRevertTransferBeforeVestStart(tokenFixtures.singleUserVestingInTheFuture); // Call test logic function
        });

        describe("Vested Amount Updates After Transfers", function () {
            for (const fixture of tokenFixtures.singleUserInProgressCompleteFixtures) {
                testLogic.testVestedAmountUpdatesAfterTransfer(fixture);
            }
        });
    });

    describe("Single User, Multiple In-Progress Vesting Schedules", function () {
        describe("80% Withdrawal", function () {
            testLogic.testWithdrawalPercentage(tokenFixtures.singleUserMutipleSchedulesInProgress)(80);
        });

        describe("100% Withdrawal", function () {
            testLogic.testWithdrawalPercentage(tokenFixtures.singleUserMutipleSchedulesInProgress)(100);
        });

        describe("Revert Transfer Exceeding Vested Amount", function () {
            testLogic.testRevertTransferExceedingVestedAmount(tokenFixtures.singleUserMutipleSchedulesInProgress);
        });

        describe("Vested Amount Updates After Transfers", function () {
            testLogic.testVestedAmountUpdatesAfterTransfer(tokenFixtures.singleUserMutipleSchedulesInProgress);
        });
    });

    describe("Single User, Multiple Mixed Vesting Schedues", function () {
        it("Should calculate the correct vested amount for mixed schedules", async function () {

            const { dlpToken, signers, vesting, vestingContract } = await loadFixture(tokenFixtures.singleUserMutipleSchedulesMixed);

            let expectedAmount = ethers.toBigInt(0);

            const vestingSchedules = vesting[signers.user1.address];
            for (const schedule of vestingSchedules) {
                expectedAmount += getLinearVestingAmount(schedule);
            }

            tolerance = expectedAmount / ethers.toBigInt(2000); // 0.05%

            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(vestedAmount).to.be.approximately(expectedAmount, tolerance);

        });

        it("Should allow transfer up to the total vested amount across all schedules", async function () {
            const { dlpToken, signers, vesting, vestingContract } = await loadFixture(tokenFixtures.singleUserMutipleSchedulesMixed);

            let totalVested = ethers.toBigInt(0);
            let totalAmount = ethers.toBigInt(0);

            const vestingSchedules = vesting[signers.user1.address];
            for (const schedule of vestingSchedules) {
                totalVested += getLinearVestingAmount(schedule);
                totalAmount += schedule.amount;
            }

            const tolerance = totalAmount / ethers.toBigInt(1000); // 0.1%

            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(vestedAmount).to.be.approximately(totalVested, tolerance);

            expect(await dlpToken.balanceOf(signers.user1.address)).to.be.gte(totalAmount);
            expect(await dlpToken.connect(signers.user1).transfer(signers.recipient.address, vestedAmount)).not.to.be.reverted;
            await expect(dlpToken.connect(signers.user1).transfer(signers.recipient.address, tolerance)).to.be.revertedWithCustomError(dlpToken, "TokensNotVested");
        });

        it("Should update the vested amount after token transfer", async function () {
            const { dlpToken, signers, vesting, vestingContract } = await loadFixture(tokenFixtures.singleUserMutipleSchedulesMixed);

            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);

            transferValue = (vestedAmount * ethers.toBigInt(60)) / ethers.toBigInt(100);

            const tolerance = vestedAmount / ethers.toBigInt(100); // 1%

            expect(await dlpToken.connect(signers.user1).transfer(signers.recipient.address, transferValue)).not.to.be.reverted;

            const newVestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(newVestedAmount).to.be.approximately(vestedAmount - transferValue, tolerance);
        });

    });

    describe("Multiple Users, Single Vesting Schedule Each", function () {
        describe("80% Withdrawal", function () {
            testLogic.testWithdrawalPercentage(tokenFixtures.multiUserVestingInProgress)(80);
        });

        describe("100% Withdrawal", function () {
            testLogic.testWithdrawalPercentage(tokenFixtures.multiUserVestingInProgress)(100);
        });

        describe("Revert Transfer Exceeding Vested Amount", function () {
            testLogic.testRevertTransferExceedingVestedAmount(tokenFixtures.multiUserVestingInProgress);
        });

        describe("Vested Amount Updates After Transfers", function () {
            testLogic.testVestedAmountUpdatesAfterTransfer(tokenFixtures.multiUserVestingInProgress);
        });
    });

    describe("Multiple Users, Multiple Vesting Schedule Each", function () {
        describe("80% Withdrawal", function () {
            testLogic.testWithdrawalPercentage(tokenFixtures.multiUserMultipleSchedulesInProgress)(80);
        });

        describe("100% Withdrawal", function () {
            testLogic.testWithdrawalPercentage(tokenFixtures.multiUserMultipleSchedulesInProgress)(100);
        });

        describe("Revert Transfer Exceeding Vested Amount", function () {
            testLogic.testRevertTransferExceedingVestedAmount(tokenFixtures.multiUserMultipleSchedulesInProgress);
        });

        describe("Vested Amount Updates After Transfers", function () {
            testLogic.testVestedAmountUpdatesAfterTransfer(tokenFixtures.multiUserMultipleSchedulesInProgress);
        });
    });

});