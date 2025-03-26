// utils/vesting-test-logic.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getLinearVestingAmount, getLinearVestingAmountFromSchedules } = require("./vestingMath");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

module.exports = {
    testInitialization: (fixtureName) => {
        return it(`Should initialize with correct default values from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, signers } = await fixtureName();

            // Check DEFAULT_ADMIN_ROLE is assigned to deployer
            const DEFAULT_ADMIN_ROLE = await vestingContract.DEFAULT_ADMIN_ROLE();
            expect(await vestingContract.hasRole(DEFAULT_ADMIN_ROLE, signers.admin.address)).to.be.true;

            // Check VESTING_CREATOR_ROLE exists but not assigned by default
            const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();
            expect(await vestingContract.hasRole(VESTING_CREATOR_ROLE, signers.admin.address)).to.be.false;
        });
    },

    testTokenRegistration: (fixtureName) => {
        return it(`Should allow registering a new token from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Ensure tokens have been minted
            let currentSupply = await mockToken.totalSupply();

            if (currentSupply < ethers.parseEther("1000000")) {
                await mockToken.mint(signers.admin.address, ethers.parseEther("1000000") - currentSupply)
            };

            // Register the token
            const minCliff = 3600;               // 1 hour
            const maxDuration = 86400 * 365;     // 1 year
            const maxTokenAmount = ethers.parseEther("1000000"); // 1M tokens

            await vestingContract.registerToken(
                mockToken.target,
                minCliff,
                maxDuration,
                maxTokenAmount
            );

            // Check token registration
            const tokenConfig = await vestingContract.getVestingConfig();
            expect(tokenConfig.dMin).to.equal(minCliff);
            expect(tokenConfig.dMax).to.equal(maxDuration);
            expect(tokenConfig.totalSupplyCap).to.equal(maxTokenAmount);
        });
    },

    testTokenRegistrationValidation: (fixtureName) => {
        return it(`Should revert invalid token registration from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Ensure tokens have been minted
            let currentSupply = await mockToken.totalSupply();

            if (currentSupply < ethers.parseEther("1000000")) {
                await mockToken.mint(signers.admin.address, ethers.parseEther("1000000") - currentSupply)
            };

            // Try to register with zero address
            await expect(
                vestingContract.registerToken(
                    ethers.ZeroAddress,
                    3600,
                    86400 * 365,
                    ethers.parseEther("1000000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            // Try to register with invalid parameters
            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    0,  // zero min vesting duration
                    86400 * 365,
                    ethers.parseEther("1000000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            // No max duration
            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    3600,
                    0,  // zero max duration
                    ethers.parseEther("1000000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            // No max duration exceeds min duration
            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    3600,
                    3601,  // max duration exceeds min duration
                    ethers.parseEther("1000000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            // No supply cap
            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    3600,
                    86400 * 365,
                    0  // Supply cap
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            // Supply cap exceeds total supply
            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    100,
                    1000,
                    ethers.parseEther("1000001")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

        });
    },

    testConfigUpdates: (fixtureName) => {
        return it(`Should allow updating vesting config from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Update the vesting config
            const newMinDuration = 8392;
            const newMaxDuration = 20842 * 180;
            const newMaxTokenAmount = ethers.parseEther("500000"); // 500K tokens

            await vestingContract.setVestingConfig(
                mockToken.target,
                newMinDuration,
                newMaxDuration,
                newMaxTokenAmount
            );

            // Check updated config
            const tokenConfig = await vestingContract.getVestingConfig();
            expect(tokenConfig.dMin).to.equal(newMinDuration);
            expect(tokenConfig.dMax).to.equal(newMaxDuration);
            expect(tokenConfig.totalSupplyCap).to.equal(newMaxTokenAmount);
        });
    },

    testRoleManagement: (fixtureName) => {
        return it(`Should allow granting and revoking VESTING_CREATOR_ROLE from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, signers } = await fixtureName();

            const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();

            // Grant role to vestingCreator
            await vestingContract.grantRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address);
            expect(await vestingContract.hasRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address)).to.be.true;

            // Revoke role from vestingCreator
            await vestingContract.revokeRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address);
            expect(await vestingContract.hasRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address)).to.be.false;
        });
    },

    testVestingScheduleCreation: (fixtureName) => {
        return it(`Should allow creating a vesting schedule with valid parameters from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Mint tokens to the vesting contract
            await mockToken.mint(signers.admin, ethers.parseEther("1000"));

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create a vesting schedule
            const startTime = currentTimestamp;
            const duration = 86400 * 30; // 30 days
            const cliffDuration = 3600;  // 1 hour
            const amount = ethers.parseEther("1000");
            const scheduleId = await vestingContract.nextScheduleId();

            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    startTime,
                    duration,
                    cliffDuration,
                    amount
                )
            ).to.emit(vestingContract, "VestingScheduleCreated")
                .withArgs(
                    mockToken.target,
                    signers.user1.address,
                    ethers.toBigInt(startTime),
                    ethers.toBigInt(duration),
                    ethers.toBigInt(cliffDuration),
                    amount
                );

            // Verify the schedule was created correctly
            const schedule = await vestingContract.getScheduleById(scheduleId);
            expect(schedule.user).to.equal(signers.user1.address)
            expect(schedule.startTime).to.equal(startTime);
            expect(schedule.endTime).to.equal(duration + startTime);
            expect(schedule.cliffEndTime).to.equal(startTime + cliffDuration);
            expect(schedule.totalAmount).to.equal(amount);
            expect(schedule.transferredAmount).to.equal(0);
        });
    },

    testVestingBeforeCliff: (fixtureName) => {
        return it(`Should return zero vested amount before cliff end from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers, vestingSchedule } = await fixtureName();

            // Skip test if fixture doesn't provide vestingSchedule
            if (!vestingSchedule) {
                this.skip();
                return;
            }

            // Force time to be before cliff end for calculation
            const vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                vestingSchedule.cliffEnd - 1  // Just before cliff ends
            );

            expect(vestedAmount).to.equal(0);
        });
    },

    testVestingAfterCompletion: (fixtureName) => {
        return it(`Should return full amount after vesting period ends from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers, vesting } = await fixtureName();

            const usersToTest = [signers.user1, signers.user2, signers.user3];

            for (const signer of usersToTest) {
                const schedules = vesting[signer.address];

                if (!schedules || schedules.length === 0) {
                    continue
                }

                // Determine when all vesting is complete
                let allVestingComplete = ethers.toBigInt(0);
                for (const schedule of schedules) {
                    if (schedule.start + schedule.duration > allVestingComplete) {
                        allVestingComplete = schedule.start + schedule.duration;
                    }
                }

                // Calculate vested amount at completion
                const fullyVested = await vestingContract.getVestedAmountForUser(
                    signer.address,
                    allVestingComplete
                );

                // Should equal full amount
                const { totalAmount } = getLinearVestingAmountFromSchedules(schedules, allVestingComplete);
                expect(fullyVested).to.equal(totalAmount);

                // Move check into the future and ensure total vested remains constant
                expect(await vestingContract.getVestedAmountForUser(signer.address, allVestingComplete + 100000000n)).to.equal(totalAmount);
            };
        });
    },

    testVestingLinearCalculation: (fixtureName) => {
        return it(`Should calculate linear vesting correctly from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, signers, vesting } = await fixtureName();

            const usersToTest = [signers.user1, signers.user2, signers.user3];

            for (const signer of usersToTest) {
                const now = await time.latest();
                const schedules = vesting[signer.address];

                if (!schedules || schedules.length === 0) {
                    continue
                }

                // Get currently-vested amount
                const { totalVestedAmount, totalAmount } = getLinearVestingAmountFromSchedules(schedules, now);

                const vested = await vestingContract.getVestedAmountForUser(
                    signer.address,
                    now
                );

                expect(vested).to.equal(totalVestedAmount);

                // Determine when all vesting is complete
                let allVestingComplete = ethers.toBigInt(0);
                let firstVestingStarted = ethers.toBigInt(1000000000000);
                let firstCliffEnd = ethers.toBigInt(1000000000000);

                for (const schedule of schedules) {
                    if (schedule.start + schedule.duration > allVestingComplete) {
                        allVestingComplete = schedule.start + schedule.duration;
                    }
                    if (schedule.start < firstVestingStarted) {
                        firstVestingStarted = schedule.start;
                    }
                    if (schedule.start + schedule.cliff < firstCliffEnd) {
                        firstCliffEnd = schedule.start + schedule.cliff
                    }
                }

                // Test at 25% through vesting period (after cliff)
                const quarterTime = (allVestingComplete - ethers.toBigInt(now)) / 4n;
                const quarterVested = await vestingContract.getVestedAmountForUser(
                    signers.user1.address,
                    quarterTime
                );
                const { totalVestedAmount: expectedQuarterTime } = getLinearVestingAmountFromSchedules(schedules, quarterTime);
                expect(quarterVested).to.equal(expectedQuarterTime);


                // Test at 50% through vesting period
                const halfTime = (allVestingComplete - ethers.toBigInt(now)) / 2n;
                const halfVested = await vestingContract.getVestedAmountForUser(
                    signers.user1.address,
                    halfTime,
                );
                const { totalVestedAmount: expectedHalfTime } = getLinearVestingAmountFromSchedules(schedules, halfTime);
                expect(halfVested).to.equal(expectedHalfTime);

                // Test at 75% through vesting period
                const threeQuarterTime = (allVestingComplete - ethers.toBigInt(now)) * 3n / 4n;
                const threeQuarterVested = await vestingContract.getVestedAmountForUser(
                    signers.user1.address,
                    threeQuarterTime,
                );
                const { totalVestedAmount: expectedThreeQuarter } = getLinearVestingAmountFromSchedules(schedules, threeQuarterTime);
                expect(threeQuarterVested).to.equal(expectedThreeQuarter);

                // Move test just before first cliff ends and ensure no vested amount
                const vestedAtStart = await vestingContract.getVestedAmountForUser(signer.address, firstCliffEnd - 1n);
                expect(vestedAtStart).to.equal(0);

                // Advance the block forward a few blocks and ensure some vesting has started
                await time.increase(100);
                expect(await vestingContract.getVestedAmountForUser(signer.address, firstCliffEnd + 10n)).to.be.gt(0);
            }
        });
    },

    testMultipleVestingSchedules: (fixtureName) => {
        return it(`Should calculate combined vested amount from multiple schedules from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers, schedules } = await fixtureName();

            // Skip test if fixture doesn't provide schedules
            if (!schedules || schedules.length === 0) {
                this.skip();
                return;
            }

            // Get all schedules for user1
            const user1Schedules = schedules.filter(s => s.beneficiary === signers.user1.address);

            // Calculate expected total vested amount for a specific timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            let expectedTotal = ethers.toBigInt(0);
            for (let i = 0; i < user1Schedules.length; i++) {
                const schedule = user1Schedules[i];
                const cliffEnd = schedule.startTime + schedule.cliffDuration;

                if (currentTimestamp <= cliffEnd) {
                    // Before cliff, nothing is vested
                    continue;
                }

                const vestingDuration = schedule.duration - schedule.cliffDuration;
                const timeElapsed = ethers.toBigInt(currentTimestamp) - cliffEnd;

                if (timeElapsed >= vestingDuration) {
                    // After vesting ends, everything is vested
                    expectedTotal += schedule.amount;
                } else {
                    // During vesting period, calculate linear amount
                    const vestedAmount = (schedule.amount * timeElapsed) / vestingDuration;
                    expectedTotal += vestedAmount;
                }
            }

            // Get actual vested amount from contract
            const actualVested = await vestingContract.getVestedAmountForUser(mockToken.target, signers.user1.address);

            // Allow for small rounding differences
            expect(actualVested).to.be.closeTo(expectedTotal, ethers.parseEther("1"));
        });
    },

    testTransferAllowance: (fixtureName) => {
        return it(`Should correctly determine transfer allowance from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 second (just past cliff)
            await ethers.provider.send("evm_mine");

            // Get vested amount
            const vestedAmount = await vestingContract.getVestedAmountForUser(mockToken.target, signers.user1.address);
            expect(vestedAmount).to.be.gt(0);

            // Check if transfer is allowed for amount below vested
            const transferAmount = vestedAmount / 2n;
            const isAllowed = await vestingContract.isTransferAllowed(
                mockToken.target,
                signers.user1.address,
                transferAmount
            );
            expect(isAllowed).to.be.true;

            // Check if larger transfer is not allowed
            const excessAmount = vestedAmount + ethers.toBigInt(1);
            const isExcessAllowed = await vestingContract.isTransferAllowed(
                mockToken.target,
                signers.user1.address,
                excessAmount
            );
            expect(isExcessAllowed).to.be.false;
        });
    },

    testTransferRecording: (fixtureName) => {
        return it(`Should properly record transfers and update released amounts from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 second
            await ethers.provider.send("evm_mine");

            // Get vested amount
            const initialVestedAmount = await vestingContract.getVestedAmountForUser(
                mockToken.target,
                signers.user1.address
            );

            // Record a transfer
            const transferAmount = initialVestedAmount / 2n;
            await expect(
                vestingContract.recordTransfer(mockToken.target, signers.user1.address, transferAmount)
            ).to.emit(vestingContract, "TransferRecorded")
                .withArgs(mockToken.target, signers.user1.address, transferAmount);

            // Check remaining vested amount
            const remainingVested = await vestingContract.getVestedAmountForUser(
                mockToken.target,
                signers.user1.address
            );

            expect(remainingVested).to.equal(initialVestedAmount - transferAmount);

            // Check if schedule was updated
            const schedule = await vestingContract.getVestingSchedule(
                mockToken.target,
                signers.user1.address,
                0
            );

            expect(schedule.released).to.equal(transferAmount);
        });
    },

    testMultipleTransfers: (fixtureName) => {
        return it(`Should handle multiple transfers correctly from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 second
            await ethers.provider.send("evm_mine");

            // Get initial vested amount
            const initialVestedAmount = await vestingContract.getVestedAmountForUser(
                mockToken.target,
                signers.user1.address
            );

            // Record first transfer
            const firstTransfer = initialVestedAmount / 4n;
            await vestingContract.recordTransfer(mockToken.target, signers.user1.address, firstTransfer);

            // Record second transfer
            const secondTransfer = initialVestedAmount / 4n;
            await vestingContract.recordTransfer(mockToken.target, signers.user1.address, secondTransfer);

            // Check remaining vested amount
            const remainingVested = await vestingContract.getVestedAmountForUser(
                mockToken.target,
                signers.user1.address
            );

            expect(remainingVested).to.equal(initialVestedAmount - firstTransfer - secondTransfer);

            // Check if schedule was updated
            const schedule = await vestingContract.getVestingSchedule(
                mockToken.target,
                signers.user1.address,
                0
            );

            expect(schedule.released).to.equal(firstTransfer + secondTransfer);
        });
    },

    testProportionalTransferDistribution: (fixtureName) => {
        return it(`Should distribute transfers proportionally across multiple schedules from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Skip test if fixtures don't have multiple schedules
            const scheduleCount = await vestingContract.getVestingScheduleCount(
                mockToken.target,
                signers.user1.address
            );

            if (scheduleCount <= 1) {
                this.skip();
                return;
            }

            // Advance time to ensure some vesting has occurred
            await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 7 days
            await ethers.provider.send("evm_mine");

            // Get vested amount for user1
            const vestedAmount = await vestingContract.getVestedAmountForUser(
                mockToken.target,
                signers.user1.address
            );
            expect(vestedAmount).to.be.gt(0);

            // Record a transfer of half the vested amount
            const transferAmount = vestedAmount / 2n;
            await vestingContract.recordTransfer(mockToken.target, signers.user1.address, transferAmount);

            // Calculate total released across all schedules
            let totalReleased = ethers.toBigInt(0);
            for (let i = 0; i < scheduleCount; i++) {
                const schedule = await vestingContract.getVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    i
                );
                totalReleased += schedule.released;
            }

            // Total released should equal transferred amount
            expect(totalReleased).to.equal(transferAmount);

            // Check updated vested amount
            const updatedVestedAmount = await vestingContract.getVestedAmountForUser(
                mockToken.target,
                signers.user1.address
            );

            expect(updatedVestedAmount).to.be.closeTo(vestedAmount - transferAmount, ethers.parseEther("0.01"));
        });
    },

    testScheduleRevocation: (fixtureName) => {
        return it(`Should allow admin to revoke a vesting schedule from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Verify initial state
            expect(await vestingContract.getVestingScheduleCount(mockToken.target, signers.user1.address)).to.be.gt(0);

            // Revoke the schedule
            await expect(
                vestingContract.connect(signers.admin).revokeVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    0
                )
            ).to.emit(vestingContract, "VestingScheduleRevoked")
                .withArgs(mockToken.target, signers.user1.address, 0);

            // Check that schedule is revoked but still exists
            const schedule = await vestingContract.getVestingSchedule(
                mockToken.target,
                signers.user1.address,
                0
            );

            expect(schedule.revoked).to.be.true;

            // Get current vested amount
            const vestedAmount = await vestingContract.calculateVestedAmount(
                mockToken.target,
                signers.user1.address,
                0,
                await ethers.provider.getBlock('latest').then(b => b.timestamp)
            );

            // After revocation, the vested amount for this schedule should be 0
            expect(vestedAmount).to.equal(0);
        });
    },

    testScheduleRevocationSecurity: (fixtureName) => {
        return it(`Should revert revocation when called by non-admin from fixture: ${fixtureName.name}`, async function () {
            const { vestingContract, mockToken, signers } = await fixtureName();

            // Try to revoke by attacker
            await expect(
                vestingContract.connect(signers.attacker).revokeVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    0
                )
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");
        });
    }
};