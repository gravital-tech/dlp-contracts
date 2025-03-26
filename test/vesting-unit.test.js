const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const vestingFixtures = require("./utils/fixtures-vesting");
const { getLinearVestingAmount } = require("./utils/vestingMath");
const vestingLogic = require("./utils/logic-vesting");

describe("UniversalVesting Unit Tests", function () {
    describe("Initialization and Configuration", function () {
        it("Should initialize with correct default values", async function () {
            const { vestingContract, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            // Check DEFAULT_ADMIN_ROLE is assigned to deployer
            const DEFAULT_ADMIN_ROLE = await vestingContract.DEFAULT_ADMIN_ROLE();
            expect(await vestingContract.hasRole(DEFAULT_ADMIN_ROLE, signers.admin.address)).to.be.true;

            // Check VESTING_CREATOR_ROLE is unassigned by default
            const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();
            expect(await vestingContract.hasRole(VESTING_CREATOR_ROLE, signers.admin.address)).to.be.false;
        });
    });
    describe("Token Registration and Configuration", function () {
        it("Should allow registering a new token", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            // Mint tokens first
            await mockToken.mint(signers.admin.address, ethers.parseEther("1000000"));
            // Register the token
            const minCliff = 3600;               // 1 hour
            const maxDuration = 86400 * 365;     // 1 year

            await vestingContract.registerToken(
                mockToken.target,
                minCliff,
                maxDuration
            );

            // Check token registration
            const tokenConfig = await vestingContract.getVestingConfig();
            expect(tokenConfig.dMin).to.equal(minCliff);
            expect(tokenConfig.dMax).to.equal(maxDuration);
        });

        it("Should revert token registration when called by non-admin", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            await expect(
                vestingContract.connect(signers.attacker).registerToken(
                    mockToken.target,
                    3600,
                    86400 * 365
                )
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");
        });

        it("Should revert token registration if already called", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithRegisteredTokenFixture);

            await expect(vestingContract.registerToken(mockToken.target, 3600, 86400 * 365))
                .to.be.revertedWithCustomError(vestingContract, "TokenRegistrationError");
        });

        it("Should revert registering a token with invalid parameters", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            // Mint tokens
            await mockToken.mint(signers.admin.address, ethers.parseEther("1000000"));

            // Try to register with zero address
            await expect(
                vestingContract.registerToken(
                    ethers.ZeroAddress,
                    3600,
                    86400 * 365
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            // Try to register with invalid parameters
            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    0,  // zero min vesting duration
                    86400 * 365
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");

            await expect(
                vestingContract.registerToken(
                    mockToken.target,
                    3600,
                    0  // zero max duration
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidVestingConfig");
        });

        it("Should allow updating vesting configuration by admin only", async function () {
            const { vestingContract, signers, mockToken } = await loadFixture(vestingFixtures.deployWithRegisteredTokenFixture);

            // Update token configuration
            const newMinDuration = 8392;
            const newMaxDuration = 20842 * 180;

            await vestingContract.connect(signers.admin).setVestingConfig(mockToken.target, newMinDuration, newMaxDuration);

            await expect(vestingContract.connect(signers.attacker).setVestingConfig(mockToken.target, newMinDuration, newMaxDuration)).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");

            // Check updated token configuration
            const tokenConfig = await vestingContract.getVestingConfig();
            expect(tokenConfig.dMin).to.equal(newMinDuration);
            expect(tokenConfig.dMax).to.equal(newMaxDuration);
        });

        it("Should revert when updating configuration for unregistered token", async function () {
            const { vestingContract, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            // Create a new token address that hasn't been registered
            const unregisteredToken = signers.user3.address;

            // Try to update config for unregistered token
            await expect(
                vestingContract.connect(signers.admin).setVestingConfig(
                    unregisteredToken,
                    3600,
                    86400 * 365
                )
            ).to.be.revertedWithCustomError(vestingContract, "TokenRegistrationError");
        });

        it("Should allow granting and revoking VESTING_CREATOR_ROLE", async function () {
            const { vestingContract, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();

            // Grant role to vestingCreator
            await vestingContract.grantRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address);
            expect(await vestingContract.hasRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address)).to.be.true;

            // Revoke role from vestingCreator
            await vestingContract.revokeRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address);
            expect(await vestingContract.hasRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address)).to.be.false;
        });

        it("Should revert when non-admin tries to grant VESTING_CREATOR_ROLE", async function () {
            const { vestingContract, signers } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();

            // Attacker tries to grant role to themselves
            await expect(
                vestingContract.connect(signers.attacker).grantRole(VESTING_CREATOR_ROLE, signers.attacker.address)
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");
        });
    });

    describe("Basic Vesting Schedule Creation", function () {
        it("Should revert creating a schedule with unregistered token", async function () {
            const { vestingContract, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Try to create a schedule with an unregistered token
            const unregisteredToken = signers.user3.address;
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    unregisteredToken,
                    signers.user1.address,
                    currentTimestamp,
                    86400 * 30,
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "TokenRegistrationError");
        });

        it("Should revert if attempting to create schedule before token registration", async function () {
            const { vestingContract, signers, mockToken } = await loadFixture(vestingFixtures.deployVestingContractFixture);

            // Grant vesting creator role to vestingCreator
            const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();
            await vestingContract.grantRole(VESTING_CREATOR_ROLE, signers.vestingCreator.address);

            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    86400 * 30,
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "TokenRegistrationError");
        });

        it("Should revert creating a schedule with invalid parameters", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Try with zero beneficiary address
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    ethers.ZeroAddress,
                    currentTimestamp,
                    86400 * 30,
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with zero duration
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    0,  // zero duration
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with cliff duration > total duration
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    86400,  // 1 day
                    86401,  // 2 days cliff > duration
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with zero amount
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    86400 * 30,
                    3600,
                    0  // zero amount
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with amount exceeding max token amount
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    86400 * 30,
                    3600,
                    ethers.parseEther("2000000")  // exceeds maxTokenAmount
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with duration exceeding max duration
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    86400 * 365 * 11,  // 11 years, exceeds max duration
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with end time too far in the future
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp + 63072000, // 2 years, exceeds max duration
                    86400,
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with an end time in the past
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp - 1000, // 2 years, exceeds max duration in the past
                    999,
                    100,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

            // Try with a start time far in the past
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp - 63072000, // 2 years, exceeds max duration in the past
                    63072000 * 3,
                    63072000,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidScheduleParams");

        });

        it("Should revert when non-creator tries to create a schedule", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Attacker tries to create a schedule
            await expect(
                vestingContract.connect(signers.attacker).createVestingSchedule(
                    mockToken.target,
                    signers.user1.address,
                    currentTimestamp,
                    86400 * 30,
                    3600,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");
        });

        it("Should allow creating multiple schedules for the same user", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(signers.admin.address, ethers.parseEther("2000"));

            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;
            const schedule1Id = await vestingContract.nextScheduleId();

            // Create first schedule
            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                currentTimestamp,
                86400 * 30,  // 30 days
                3600,         // 1 hour cliff
                ethers.parseEther("650")
            );

            // Create second schedule
            schedule2Id = await vestingContract.nextScheduleId();
            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                currentTimestamp + 86400,  // start 1 day later
                86400 * 60,  // 60 days
                86400 * 5,   // 5 days cliff
                ethers.parseEther("1000")
            );

            // Verify both schedules exist
            const schedule1 = await vestingContract.getScheduleById(schedule1Id);
            expect(schedule1.startTime).to.equal(currentTimestamp);
            expect(schedule1.endTime).to.equal(86400 * 30 + currentTimestamp);
            expect(schedule1.totalAmount).to.equal(ethers.parseEther("650"));

            const schedule2 = await vestingContract.getScheduleById(schedule2Id);
            expect(schedule2.startTime).to.equal(currentTimestamp + 86400);
            expect(schedule2.totalAmount).to.equal(ethers.parseEther("1000"));
        });

        it("Should create a schedule that immediately starts vesting (no cliff)", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create a vesting schedule with no cliff
            const startTime = currentTimestamp - 86400;  // Start 1 day ago
            const duration = 86400 * 30; // 30 days
            const cliffDuration = 0;     // No cliff
            const amount = ethers.parseEther("1000");

            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                startTime,
                duration,
                cliffDuration,
                amount
            );

            // Check vested amount - should be non-zero since it started vesting immediately
            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(vestedAmount).to.be.gt(0);
        });

        it("Should create a schedule with a cliff period", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create a vesting schedule with future start and cliff
            const startTime = currentTimestamp;
            const duration = 86400 * 30;  // 30 days
            const cliffDuration = 86400 * 7; // 7 days cliff
            const amount = ethers.parseEther("1000");

            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                startTime,
                duration,
                cliffDuration,
                amount
            );

            // Check vested amount - should be zero because we're in the cliff period
            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(vestedAmount).to.equal(0);

            //Check vested amount in the future
            const futureVested = await vestingContract.getVestedAmountForUser(signers.user1.address, startTime + duration + 1000);
            expect(futureVested).to.be.gt(0);
        });
    });

    describe("Vesting Calculations", function () {
        it("Should return zero vested amount before cliff end", async function () {
            const { vestingContract, signers } = await loadFixture(vestingFixtures.singleUserBeforeCliffEnd);

            // Force time to be before cliff end for calculation
            const vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address, 0);

            expect(vestedAmount).to.equal(0);
        });

        it("Should calculate linear vesting correctly after cliff", async function () {
            const { vestingContract, signers, vesting } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            const vestingSchedule = vesting[signers.user1.address][0];

            // Calculate expected vested amount at various points
            const cliffEnd = vestingSchedule.start + vestingSchedule.cliff;
            const vestingDuration = vestingSchedule.duration - vestingSchedule.cliff;

            // Test at 25% through vesting period (after cliff)
            const quarterTime = cliffEnd + (vestingDuration / 4n);
            const quarterVested = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                quarterTime
            );

            // Expected is approximately 25% of total
            const expectedQuarter = getLinearVestingAmount(vestingSchedule, quarterTime)
            // Allow for small rounding differences
            expect(quarterVested).to.be.closeTo(expectedQuarter, ethers.parseEther("1"));

            // Test at 50% through vesting period
            const halfTime = cliffEnd + (vestingDuration / 2n);
            const halfVested = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                halfTime
            );

            // Expected is approximately 50% of total
            const expectedHalf = vestingSchedule.amount * 50n / 100n;
            expect(halfVested).to.be.closeTo(expectedHalf, ethers.parseEther("1"));

            // Test at 75% through vesting period
            const threeQuarterTime = cliffEnd + (vestingDuration * 3n / 4n);
            const threeQuarterVested = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                threeQuarterTime
            );

            // Expected is approximately 75% of total
            const expectedThreeQuarter = vestingSchedule.amount * 75n / 100n;
            expect(threeQuarterVested).to.be.closeTo(expectedThreeQuarter, ethers.parseEther("1"));
        });

        describe("Should calculate vesting correctly", async function () {
            for (const fixture of vestingFixtures.allVestingFixtures) {
                vestingLogic.testVestingLinearCalculation(fixture);
            }
        });

        describe("Should return full amount after vesting ends", function () {
            for (const fixture of vestingFixtures.allVestingFixtures) {
                vestingLogic.testVestingAfterCompletion(fixture);
            }
        });

        it("Should calculate combined vested amount from multiple schedules", async function () {
            const { vestingContract, mockToken, signers, vesting } = await loadFixture(vestingFixtures.singleUserMutipleSchedulesInProgress);

            // Get all schedules for user1
            const user1Schedules = vesting[signers.user1.address];

            // Calculate expected total vested amount for a specific timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            let expectedTotal = ethers.toBigInt(0);
            for (let i = 0; i < user1Schedules.length; i++) {
                const schedule = user1Schedules[i];
                const cliffEnd = schedule.start + schedule.cliff;

                if (currentTimestamp <= cliffEnd) {
                    // Before cliff, nothing is vested
                    continue;
                }

                const vestingDuration = schedule.duration - schedule.cliff;
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
            const actualVested = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);

            // Allow for small rounding differences
            expect(actualVested).to.be.closeTo(expectedTotal, ethers.parseEther("1"));
        });

        it("Should return correct vested amounts for different users", async function () {
            const { vestingContract, mockToken, signers, vesting } = await loadFixture(vestingFixtures.multiUserMultipleSchedulesInProgress);

            // Test for both users
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            for (const user of [signers.user1, signers.user2]) {
                // Calculate expected vesting for this user
                const userSchedules = vesting[user.address];
                let expectedUserTotal = ethers.toBigInt(0);

                for (const schedule of userSchedules) {
                    const cliffEnd = schedule.start + schedule.cliff;

                    if (currentTimestamp <= cliffEnd) {
                        continue;
                    }

                    const vestingDuration = schedule.duration - schedule.cliff;
                    const timeElapsed = BigInt(currentTimestamp) - cliffEnd;

                    if (timeElapsed >= vestingDuration) {
                        expectedUserTotal += schedule.amount;
                    } else {
                        const vestedAmount = (schedule.amount * timeElapsed) / vestingDuration;
                        expectedUserTotal += vestedAmount;
                    }
                }

                // Get actual vested amount from contract
                const actualVested = await vestingContract.getVestedAmountForUser(user.address, 0);

                // Allow for small rounding differences
                expect(actualVested).to.be.closeTo(expectedUserTotal, ethers.parseEther("0.1"));
            }
        });
    });

    describe("Transfer Management", function () {
        it("Should allow calling isTransferAllowed by token contract", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithRegisteredTokenFixture);

            // Impersonate the token contract address
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            await expect(vestingContract.connect(mockTokenSigner).isTransferAllowed(signers.user1.address, ethers.parseEther("100"), mockToken.target))
                .to.not.be.reverted;
        });

        it("Should revert calling isTransferAllowed by non-token contract", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithRegisteredTokenFixture);

            await expect(vestingContract.connect(signers.attacker).isTransferAllowed(signers.user1.address, ethers.parseEther("100"), mockToken.target))
                .to.be.revertedWithCustomError(vestingContract, "NotTokenContract");
        });

        it("Should allow transfer when amount is below vested amount", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [86401]); // 1 hour + 1 second (just past cliff)
            await ethers.provider.send("evm_mine");

            // Get vested amount
            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(vestedAmount).to.be.gt(0);

            // Check if transfer is allowed
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);
            const transferAmount = vestedAmount / 2n;
            const isAllowed = await vestingContract.connect(mockTokenSigner).isTransferAllowed(
                signers.user1.address,
                transferAmount,
                mockToken.target
            );

            expect(isAllowed).to.be.true;
        });

        it("Should revert transfer when amount exceeds vested amount", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [86401]); // 1 hour + 1 second
            await ethers.provider.send("evm_mine");

            // Get vested amount
            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(vestedAmount).to.be.gt(0);

            // Check if larger transfer is allowed
            const transferAmount = vestedAmount + ethers.toBigInt(1);
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            const isAllowed = await vestingContract.connect(mockTokenSigner).isTransferAllowed(
                signers.user1.address,
                transferAmount,
                mockToken.target
            );

            expect(isAllowed).to.be.false;
        });

        it("Should properly record transfers and update released amounts", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [86400 * 10]); // 10 days in to vesting
            await ethers.provider.send("evm_mine");

            // Get vested amount
            const initialVestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            // Record a transfer
            const transferAmount = initialVestedAmount / 2n;
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            await expect(
                vestingContract.connect(mockTokenSigner).recordTransfer(signers.user1.address, transferAmount, mockToken.target)
            ).to.emit(vestingContract, "TransferRecorded")
                .withArgs(signers.user1.address, mockToken.target, transferAmount);

            // Check remaining vested amount
            const remainingVested = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            expect(remainingVested).to.be.approximately(initialVestedAmount - transferAmount, ethers.parseEther("0.1"));

            // Check if schedule was updated
            const schedule = await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user1.address
            );

            expect(schedule[0].transferredAmount).to.be.approximately(transferAmount, ethers.parseEther("0.1"));
        });

        it("Should handle multiple transfers correctly", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            // Advance time past cliff
            await ethers.provider.send("evm_increaseTime", [86400 * 10]); // 10 days in to vesting
            await ethers.provider.send("evm_mine");

            // Get initial vested amount
            const initialVestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            // Record first transfer
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            const firstTransfer = initialVestedAmount / 4n;
            await vestingContract.connect(mockTokenSigner).recordTransfer(signers.user1.address, firstTransfer, mockToken.target);

            // Record second transfer
            const secondTransfer = initialVestedAmount / 4n;
            await vestingContract.connect(mockTokenSigner).recordTransfer(signers.user1.address, secondTransfer, mockToken.target);

            // Check remaining vested amount
            const remainingVested = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            expect(remainingVested).to.be.approximately(initialVestedAmount - firstTransfer - secondTransfer, ethers.parseEther("0.1"));

            // Check if schedule was updated
            const schedule = await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user1.address
            );

            expect(schedule[0].transferredAmount).to.be.approximately(firstTransfer + secondTransfer, ethers.parseEther("0.1"));
        });

        it("Should distribute transfers proportionally across multiple schedules", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserMutipleSchedulesMixed);

            // Get vested amount for user1 after 7 days
            await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 1 hour + 1 second
            await ethers.provider.send("evm_mine");

            const vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );
            expect(vestedAmount).to.be.gt(0);

            // Record a transfer of half the vested amount
            const transferAmount = vestedAmount / 2n;
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            await vestingContract.connect(mockTokenSigner).recordTransfer(signers.user1.address, transferAmount, mockToken.target);

            // Get all schedules for user1
            const user1Schedules = await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user1.address
            );

            // Calculate total released across all schedules
            let totalReleased = ethers.toBigInt(0);
            for (const schedule of user1Schedules) {
                totalReleased += schedule.transferredAmount;
            }

            // Total released should equal transferred amount
            expect(totalReleased).to.equal(transferAmount);

            // Check updated vested amount
            const updatedVestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            expect(updatedVestedAmount).to.be.closeTo(vestedAmount - transferAmount, ethers.parseEther("0.01"));
        });

        it("Should revert recording transfer for unregistered token", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            // Try to record transfer for unregistered token
            const unregisteredToken = signers.user3.address;

            await expect(
                vestingContract.connect(mockTokenSigner).recordTransfer(
                    signers.user1.address,
                    ethers.parseEther("100"),
                    unregisteredToken
                )
            ).to.be.reverted;
        });

        it("Should revert recording transfer for user with no schedules", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            // Try to record transfer for user with no schedules
            await expect(
                vestingContract.connect(mockTokenSigner).recordTransfer(
                    signers.user3.address,
                    ethers.parseEther("100"),
                    mockToken.target
                )
            ).to.be.revertedWithCustomError(vestingContract, "InvalidUserSchedules");
        });

        it("Should handle zero transfers as no-ops", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserVestingWithCliff);

            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            // Record a zero transfer
            await vestingContract.connect(mockTokenSigner).recordTransfer(signers.user1.address, 0, mockToken.target);

            // Check schedule wasn't modified
            const schedule = await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user1.address
            );

            expect(schedule[0].transferredAmount).to.equal(0);
        });
    });

    describe("Schedule Management", function () {
        it("Should retrieve all vesting schedules for a user", async function () {
            const { vestingContract, mockToken, signers, vesting } = await loadFixture(vestingFixtures.multiUserMultipleSchedulesInProgress);

            // Get count of user1's schedules
            const user1Schedules = await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user1.address
            );

            // Verify count matches expected
            const expectedUser1Schedules = vesting[signers.user1.address];
            expect(user1Schedules.length).to.equal(expectedUser1Schedules.length);

            // Check each schedule matches expected
            for (let _schedule of user1Schedules) {
                const schedule = await vestingContract.getScheduleById(_schedule.id);

                // Find matching expected schedule
                const expectedSchedule = expectedUser1Schedules.find(s =>
                    s.start === BigInt(schedule.startTime) &&
                    s.duration === BigInt(schedule.endTime - schedule.startTime) &&
                    s.amount === BigInt(schedule.totalAmount)
                );

                expect(expectedSchedule).to.not.be.undefined;
                expect(schedule.startTime).to.equal(expectedSchedule.start);
                expect(schedule.endTime).to.equal(expectedSchedule.start + expectedSchedule.duration);
                expect(schedule.cliffEndTime).to.equal(expectedSchedule.start + expectedSchedule.cliff);
                expect(schedule.totalAmount).to.equal(expectedSchedule.amount);
            }
        });

        it("Should return zero schedules for user with no vesting", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.singleUserMutipleSchedulesMixed);

            // Check count for user with no schedules
            const schedules = await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user3.address
            );

            expect(schedules.length).to.equal(0);
        });
    });

    describe("Edge Cases and Stress Testing", function () {
        it("Should handle vesting schedules with very short durations", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create schedule with very short duration (10 minutes)
            const shortDuration = 6300; // 5 minutes
            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                currentTimestamp,
                shortDuration,
                0, // no cliff
                ethers.parseEther("1000")
            );

            // Check vested amount is approximately 50%
            const vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                currentTimestamp + shortDuration / 2
            );

            expect(vestedAmount).to.be.closeTo(
                ethers.parseEther("500"),
                ethers.parseEther("1")
            );

            // Check vested amount is 100%
            const fullyVestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                currentTimestamp + shortDuration + 1
            );

            expect(fullyVestedAmount).to.equal(ethers.parseEther("1000"));
        });

        it("Should handle vesting schedules with very long durations", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Update token config to allow very long durations
            await vestingContract.setVestingConfig(
                mockToken.target,
                3600,
                86400 * 365 * 10 // 10 years
            );

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create schedule with very long duration (5 years)
            const longDuration = 86400 * 365 * 5; // 5 years
            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                currentTimestamp,
                longDuration,
                0, // no cliff
                ethers.parseEther("1000")
            );

            // Check vested amount after 99% of duration
            const checkTime = currentTimestamp + (longDuration * 99 / 100);
            const onePercentVested = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                checkTime
            );

            const expectedVesting = ethers.parseEther("990"); // 1% of 1000
            expect(onePercentVested).to.be.closeTo(expectedVesting, ethers.parseEther("1"));
        });

        it("Should handle many vesting schedules for a single user", async function () {
            const { vestingContract, mockToken, signers, vesting } = await loadFixture(vestingFixtures.singleUserStressTest);

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            let lastEnd = 0n;
            let totalAmount = 0n;

            const userSchedules = vesting[signers.user1.address];

            for (const schedule of userSchedules) {
                if (schedule.start + schedule.duration > lastEnd) {
                    lastEnd = schedule.start + schedule.duration;
                }
                totalAmount += schedule.amount;
            }

            // Verify all schedules were created
            expect(await vestingContract.getUserVestingSchedules(
                mockToken.target,
                signers.user1.address
            )).to.have.lengthOf(500);

            const testTimestamp = BigInt(currentTimestamp) + (lastEnd - BigInt(currentTimestamp)) / 2n; // Halfway through last end

            // Move time forward to the testTimestamp
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(testTimestamp)]);
            await ethers.provider.send("evm_mine");

            // Check that vested amount is reasonable halfway through largest duration
            const vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            // Should be greater than 0 and less than total amount
            expect(vestedAmount).to.be.gt(0);
            expect(vestedAmount).to.be.lt(totalAmount);


            // Impersonate the token contract address
            await impersonateAccount(mockToken.target);
            await setBalance(mockToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(mockToken.target);

            // Record a large transfer
            const transferAmount = vestedAmount / 2n;
            await vestingContract.connect(mockTokenSigner).recordTransfer(
                signers.user1.address,
                transferAmount,
                mockToken.target
            );

            // Verify vested amount is reduced
            const updatedVestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                0
            );

            expect(updatedVestedAmount).to.be.closeTo(
                vestedAmount - transferAmount,
                ethers.parseEther("1")
            );
        });

        it("Should handle extreme values for vesting schedules", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Update token config to allow very large amounts
            await vestingContract.setVestingConfig(
                mockToken.target,
                3600,
                86400 * 365
            );

            // Mint a very large amount of tokens
            const largeAmount = ethers.parseEther("1000000000"); // 1 billion tokens
            await mockToken.mint(vestingContract.target, largeAmount);

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create schedule with very large amount
            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                currentTimestamp,
                86400 * 365, // 1 year
                3600, // 1 hour cliff
                largeAmount
            );

            // Check vested amount calculation works with large numbers
            let vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                currentTimestamp + 3601 // Just past cliff
            );

            expect(vestedAmount).to.be.gt(0);
            expect(vestedAmount).to.be.lt(largeAmount);

            vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                currentTimestamp + 86400 * 364 // Just before end
            );

            expect(vestedAmount).to.be.gt(0);
            expect(vestedAmount).to.be.lt(largeAmount);

            vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                currentTimestamp + 86400 * 365 + 1 // Exactly at end
            );

            expect(vestedAmount).to.be.gt(0);
            expect(vestedAmount).to.equal(largeAmount);

        });

        it("Should handle a schedule with zero cliff correctly", async function () {
            const { vestingContract, mockToken, signers } = await loadFixture(vestingFixtures.deployWithVestingCreatorFixture);

            // Mint tokens to the vesting contract
            await mockToken.mint(vestingContract.target, ethers.parseEther("1000"));

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            // Create schedule with zero cliff
            await vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                mockToken.target,
                signers.user1.address,
                currentTimestamp,
                86400 * 30, // 30 days
                0, // No cliff
                ethers.parseEther("1000")
            );

            // Check vested amount - should be non-zero
            const vestedAmount = await vestingContract.getVestedAmountForUser(
                signers.user1.address,
                currentTimestamp + 1
            );

            expect(vestedAmount).to.be.gt(0);
        });

        it("Should handle multiple users with thousands of schedules", async function () {
            const { vestingContract, mockToken, signers, vesting } = await loadFixture(vestingFixtures.multiUserStressTest);

            // Get current timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentTimestamp = latestBlock.timestamp;

            for (const user of [signers.user1, signers.user2, signers.user3]) {
                let lastEnd = 0n;
                let totalAmount = 0n;

                const userSchedules = vesting[user.address];

                for (const schedule of userSchedules) {
                    if (schedule.start + schedule.duration > lastEnd) {
                        lastEnd = schedule.start + schedule.duration;
                    }
                    totalAmount += schedule.amount;
                }

                // Verify all schedules were created
                expect(await vestingContract.getUserVestingSchedules(
                    mockToken.target,
                    user.address
                )).to.have.lengthOf(1000);

                const testTimestamp = BigInt(currentTimestamp) + (lastEnd - BigInt(currentTimestamp)) / 2n; // Halfway through last end

                // Check that vested amount is reasonable halfway through largest duration
                const vestedAmount = await vestingContract.getVestedAmountForUser(
                    signers.user1.address,
                    testTimestamp
                );

                // Should be greater than 0 and less than total amount
                expect(vestedAmount).to.be.gt(0);
                expect(vestedAmount).to.be.lt(totalAmount);
            }
        })
    });
});