// utils/test-logic.js (or test/utils/test-logic.js)
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getToleranceFromSchedules, getLinearVestingAmountFromSchedules } = require("./vestingMath");

module.exports = {
    testWithdrawalPercentage: (fixtureName) => { // Higher-order function to capture fixture name
        return (percentage) => { // Return a function for each percentage to test
            return it(`Should allow ${percentage}% withdrawl of vested amount and update totalVestedAmount from fixture: ${fixtureName.name}`, async function () {
                const fixture = await fixtureName(); // Dynamically call the fixture
                const { dlpToken, signers, vesting, vestingContract } = fixture;

                const usersToTest = [signers.user1, signers.user2, signers.user3];

                // Test for all users with vesting schedules
                for (const signer of usersToTest) {
                    // Get the current timestamp
                    const latestBlock = await ethers.provider.getBlock("latest");
                    const timestamp = latestBlock.timestamp;


                    const vestingData = vesting[signer.address];
                    if (!vestingData || vestingData.length === 0) {
                        continue
                    }
                    const { totalVestedAmount } = getLinearVestingAmountFromSchedules(vestingData, timestamp);
                    expect(totalVestedAmount).to.be.gt(ethers.toBigInt("0"));

                    const withdrawlPercentageBN = ethers.toBigInt(percentage);
                    const withdrawlAmount = (totalVestedAmount * withdrawlPercentageBN) / ethers.toBigInt(100);

                    await expect(dlpToken.connect(signer).transfer(signers.recipient.address, withdrawlAmount)).to.not.be.reverted;
                    expect(await dlpToken.balanceOf(signers.recipient.address)).to.be.gte(withdrawlAmount);

                    // Ensure the totalVestedAmount is updated
                    const newlyVestedAmount = totalVestedAmount - withdrawlAmount;
                    expect(await vestingContract.getVestedAmountForUser(signer.address, 0)).to.be.approximately(newlyVestedAmount, getToleranceFromSchedules(vestingData));
                };
            });
        };
    },

    testFullWithdrawal: (fixtureName) => {
        return it(`Should allow 100% withdrawl of vested amount and update totalVestedAmount from fixture: ${fixtureName.name}`, async function () {
            const fixture = await fixtureName();
            const { dlpToken, signers, vesting, vestingContract } = fixture;

            const usersToTest = [signers.user1, signers.user2, signers.user3];

            // Test for all users with vesting schedules
            for (const signer of usersToTest) {
                // Get the current timestamp
                const latestBlock = await ethers.provider.getBlock("latest");
                const timestamp = latestBlock.timestamp;

                const vestingData = vesting[signer.address];
                if (!vestingData || vestingData.length === 0) {
                    continue
                }
                const { totalVestedAmount } = getLinearVestingAmountFromSchedules(vestingData, timestamp);
                expect(totalVestedAmount).to.be.gt(ethers.toBigInt("0"));

                const withdrawlAmount = totalVestedAmount;

                await expect(dlpToken.connect(signer).transfer(signers.recipient.address, withdrawlAmount)).to.not.be.reverted;
                expect(await dlpToken.balanceOf(signers.recipient.address)).to.be.gte(withdrawlAmount);

                // Ensure the totalVestedAmount is updated to nearly 0
                expect(await vestingContract.getVestedAmountForUser(signer.address, 0)).to.be.approximately(ethers.toBigInt(0), getToleranceFromSchedules(vestingData));
            };
        });
    },

    testFullTransferAfterCompletion: (fixtureName) => {
        return it(`Should allow transfers of all tokens when vesting schedule is complete from fixture: ${fixtureName.name}`, async function () {
            const fixture = await fixtureName();
            const { dlpToken, signers, vesting, vestingContract } = fixture;

            const usersToTest = [signers.user1, signers.user2, signers.user3];

            // Test for all users with vesting schedules
            for (const signer of usersToTest) {
                // Get the current timestamp
                const latestBlock = await ethers.provider.getBlock("latest");
                const timestamp = latestBlock.timestamp;

                const vestingData = vesting[signer.address];
                if (!vestingData || vestingData.length === 0) {
                    continue
                }
                const { totalVestedAmount, totalAmount } = getLinearVestingAmountFromSchedules(vestingData, timestamp);
                expect(totalVestedAmount).to.be.equal(totalAmount);

                // User should be able to transfer the vested amount
                await expect(dlpToken.connect(signer).transfer(signers.recipient.address, totalVestedAmount)).to.not.be.reverted;
                expect(await dlpToken.balanceOf(signers.recipient.address)).to.gte(totalVestedAmount);

                // Ensure the totalVestedAmount is updated to nearly 0
                expect(await vestingContract.getVestedAmountForUser(signer.address, 0)).to.be.approximately(ethers.toBigInt(0), getToleranceFromSchedules(vestingData));
            };
        });
    },

    testRevertTransferExceedingVestedAmount: (fixtureName) => {
        return it(`Should revert transfers exceeding vested amount from fixture ${fixtureName.name}`, async function () {
            const fixture = await fixtureName();
            const { dlpToken, signers, vesting, vestingContract } = fixture;

            const usersToTest = [signers.user1, signers.user2, signers.user3];

            // Test for all users with vesting schedules
            for (const signer of usersToTest) {
                // Get the current timestamp
                const latestBlock = await ethers.provider.getBlock("latest");
                const timestamp = latestBlock.timestamp;

                const vestingData = vesting[signer.address];
                if (!vestingData || vestingData.length === 0) {
                    continue
                }
                const { totalVestedAmount, totalAmount } = getLinearVestingAmountFromSchedules(vestingData, timestamp);
                expect(totalVestedAmount).to.be.gt(ethers.toBigInt("0"));

                const excessAmount = totalVestedAmount + ethers.toBigInt("1");

                // Transfer of vested amount should succeed
                await expect(dlpToken.connect(signer).transfer(signers.recipient.address, totalVestedAmount)).to.not.be.reverted;
                expect(await dlpToken.balanceOf(signers.recipient.address)).to.be.gte(totalVestedAmount);

                // Transfer exceeding vested amount should fail
                await expect(
                    dlpToken.connect(signer).transfer(signers.recipient.address, excessAmount)
                ).to.be.revertedWithCustomError(dlpToken, "TokensNotVested");

                // Ensure the totalVestedAmount for original txn is updated
                expect(await vestingContract.getVestedAmountForUser(signer.address, 0)).to.be.approximately(ethers.toBigInt(0), getToleranceFromSchedules(vestingData));
            };
        });
    },

    testRevertTransferBeforeVestStart: (fixtureName) => {
        return it(`Should revert any transfer if vesting starts in the future from fixture: ${fixtureName.name}`, async function () {
            const fixture = await fixtureName();
            const { dlpToken, signers } = fixture;

            // Ensure error is thrown when attempting to transfer
            await expect(
                dlpToken.connect(signers.user1).transfer(signers.user2.address, ethers.parseEther("0.01"))
            ).to.be.revertedWithCustomError(dlpToken, "TokensNotVested");
        });
    },

    testVestedAmountUpdatesAfterTransfer: (fixtureName) => {
        return it(`Should update vested amount records after transfers from fixture: ${fixtureName.name}`, async function () {
            const fixture = await fixtureName();
            const { dlpToken, vesting, vestingContract, signers } = fixture;

            const usersToTest = [signers.user1, signers.user2, signers.user3];

            // Test for all users with vesting schedules
            for (const signer of usersToTest) {
                // Get the current timestamp
                const latestBlock = await ethers.provider.getBlock("latest");
                const timestamp = latestBlock.timestamp;

                const vestingData = vesting[signer.address];
                if (!vestingData || vestingData.length === 0) {
                    continue
                }
                const { totalVestedAmount, totalAmount } = getLinearVestingAmountFromSchedules(vestingData, timestamp);
                expect(totalVestedAmount).to.be.gt(ethers.toBigInt("0"));

                const firstTransfer = totalVestedAmount / 3n;
                const secondTransfer = totalVestedAmount / 2n;

                // First transfer
                initialBalance = await dlpToken.balanceOf(signers.recipient.address);
                await dlpToken.connect(signer).transfer(signers.recipient.address, firstTransfer);

                expect(await dlpToken.balanceOf(signers.recipient.address)).to.equal(initialBalance + firstTransfer);

                // Calculate expected vested amount remaining
                const vestedAmountBefore = await vestingContract.getVestedAmountForUser(signer.address, 0);

                // Second transfer
                await dlpToken.connect(signer).transfer(signers.recipient.address, secondTransfer);

                // Balances of users should be updated
                expect(await dlpToken.balanceOf(signers.recipient.address)).to.equal(initialBalance + firstTransfer + secondTransfer);

                // Vested amount should be reduced by the transfer amount
                const vestedAmountAfter = await vestingContract.getVestedAmountForUser(signer.address, 0);
                expect(vestedAmountBefore - secondTransfer).to.be.approximately(vestedAmountAfter, getToleranceFromSchedules(vestingData));
            };
        });
    },
};