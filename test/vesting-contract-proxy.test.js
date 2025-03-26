const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { createProxyTestSuite } = require("./utils/proxyTestSuite");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const vestingFixtures = require("./utils/fixtures-vesting");

describe("UniversalVesting Proxy Tests", function () {
    let fixture;

    before(async function () {
        fixture = await loadFixture(vestingFixtures.singleUserMutipleSchedulesInProgress);
    });

    // Create a test suite using our reusable framework
    describe("Proxy Tests", createProxyTestSuite({
        // Provide a function that returns an initialized proxy
        getInitializedProxy: async () => {
            return fixture.vestingContract;
        },

        // Contract versions
        initialVersion: "UniversalVesting",
        upgradedVersion: "UniversalVestingContractV2",

        // Specify upgrade initializer function
        upgradeInitializer: "initializeV2",

        // State variables to test for preservation during upgrade
        stateVariables: {
            paused: {
                getter: async (contract) => await contract.paused()
            },
            DEFAULT_ADMIN_ROLE: {
                getter: async (contract) => await contract.DEFAULT_ADMIN_ROLE()
            },
            VESTING_CREATOR_ROLE: {
                getter: async (contract) => await contract.VESTING_CREATOR_ROLE()
            },
            LIQUIDITY_MANAGER_ROLE: {
                getter: async (contract) => await contract.LIQUIDITY_MANAGER_ROLE()
            }
        },

        // Functions to test in initial version
        initialFunctions: {
            getVestingConfig: async (contract) => {
                const config = await contract.getVestingConfig();
                expect(config.dMin).to.be.a('bigint');
                expect(config.dMax).to.be.a('bigint');
                expect(config.dMax).to.be.gt(config.dMin);
            },

            getUserVestingSchedules: async (contract) => {
                const [, , user1] = await ethers.getSigners();
                const schedules = await contract.getUserVestingSchedules(fixture.mockToken.target, fixture.signers.user1.address);
                expect(schedules.length).to.be.gt(0);
                expect(schedules[0].user).to.equal(fixture.signers.user1.address);
            },

            setVestingConfig: async (contract) => {
                const initialConfig = await contract.getVestingConfig();
                const newDMin = initialConfig.dMin * 2n;
                const newDMax = initialConfig.dMax * 2n;

                await contract.setVestingConfig(fixture.mockToken.target, newDMin, newDMax);

                const updatedConfig = await contract.getVestingConfig();
                expect(updatedConfig.dMin).to.equal(newDMin);
                expect(updatedConfig.dMax).to.equal(newDMax);
            },

            createVestingSchedule: async (contract) => {
                const now = await time.latest();
                const beforeCount = (await contract.getUserVestingSchedules(fixture.mockToken.target, fixture.signers.user2.address)).length;

                await contract.connect(fixture.signers.vestingCreator).createVestingSchedule(
                    fixture.mockToken.target,
                    fixture.signers.user2.address,
                    now,
                    86400 * 60, // 60 days
                    0,          // No cliff
                    ethers.parseEther("500")
                );

                const afterCount = (await contract.getUserVestingSchedules(fixture.mockToken.target, fixture.signers.user2.address)).length;

                expect(afterCount).to.equal(beforeCount + 1);
            },

            getVestedAmountForUser: async (contract) => {
                const [, , user1] = await ethers.getSigners();

                // Get vested amount
                const vestedAmount = await contract.getVestedAmountForUser(fixture.signers.user1.address, 0);

                // This should be a valid BigInt
                expect(vestedAmount).to.be.a('bigint');
            },

            pause: async (contract) => {
                // Check initial state
                expect(await contract.paused()).to.be.false;

                // Pause the contract
                await contract.pause();

                // Verify paused
                expect(await contract.paused()).to.be.true;

                // Unpause for subsequent tests
                await contract.unpause();
                expect(await contract.paused()).to.be.false;
            },

            hasRole: async (contract) => {
                const vestingCreatorRole = await contract.VESTING_CREATOR_ROLE();

                // Check role assignment
                expect(await contract.hasRole(vestingCreatorRole, fixture.signers.vestingCreator.address)).to.be.true;

                // Test role management
                const testUser = ethers.Wallet.createRandom().address;
                await contract.grantRole(vestingCreatorRole, testUser);

                expect(await contract.hasRole(vestingCreatorRole, testUser)).to.be.true;

                await contract.revokeRole(vestingCreatorRole, testUser);
                expect(await contract.hasRole(vestingCreatorRole, testUser)).to.be.false;
            }
        },

        // New state variables added in V2
        newStateVariables: {
            version: {
                getter: async (contract) => await contract.version(),
                expectedValue: "V2",
                isPublic: true
            }
        },

        // New functions in the upgraded version
        newFunctions: {
            getVersion: async (contract) => {
                const version = await contract.getVersion();
                expect(version).to.equal("V2");
            }
        },

        // Role required for upgrades
        accessControlRole: "DEFAULT_ADMIN_ROLE",

        // Events to check during upgrades (if needed)
        expectedEvents: {
            // Uncomment if your contract emits events during upgrade
            // Upgraded: {
            //     contract: null
            // }
        }
    }));

    // Additional tests focusing on schedules preservation during upgrade
    describe("Vesting Schedules Preservation", function () {
        it("Should preserve all vesting schedules after upgrade", async function () {
            // Deploy and set up contracts
            const { vestingContract, mockToken, signers } = fixture;
            const { vestingCreator, user1, user2 } = signers;

            // Create additional vesting schedules
            const now = await time.latest();

            // Create schedule for user2
            await vestingContract.connect(vestingCreator).createVestingSchedule(
                mockToken.target,
                user2.address,
                now,
                86400 * 45, // 45 days
                86400 * 5,  // 5 days cliff
                ethers.parseEther("2000")
            );

            // Create second schedule for user1
            await vestingContract.connect(vestingCreator).createVestingSchedule(
                mockToken.target,
                user1.address,
                now,
                86400 * 90, // 90 days
                0,          // No cliff
                ethers.parseEther("3000")
            );

            // Get schedules before upgrade
            const user1SchedulesBefore = await vestingContract.getUserVestingSchedules(fixture.mockToken.target, user1.address);
            const user2SchedulesBefore = await vestingContract.getUserVestingSchedules(fixture.mockToken.target, user2.address);

            // Upgrade contract
            const UniversalVestingContractV2 = await ethers.getContractFactory("UniversalVestingContractV2");
            const upgradedContract = await upgrades.upgradeProxy(vestingContract.target, UniversalVestingContractV2);

            // Get schedules after upgrade
            const user1SchedulesAfter = await upgradedContract.getUserVestingSchedules(fixture.mockToken.target, user1.address);
            const user2SchedulesAfter = await upgradedContract.getUserVestingSchedules(fixture.mockToken.target, user2.address);

            // Compare schedule counts
            expect(user1SchedulesAfter.length).to.equal(user1SchedulesBefore.length);
            expect(user2SchedulesAfter.length).to.equal(user2SchedulesBefore.length);

            // Compare first user1 schedule details
            expect(user1SchedulesAfter[0].startTime).to.equal(user1SchedulesBefore[0].startTime);
            expect(user1SchedulesAfter[0].endTime).to.equal(user1SchedulesBefore[0].endTime);
            expect(user1SchedulesAfter[0].cliffDuration).to.equal(user1SchedulesBefore[0].cliffDuration);
            expect(user1SchedulesAfter[0].totalAmount).to.equal(user1SchedulesBefore[0].totalAmount);
            expect(user1SchedulesAfter[0].transferredAmount).to.equal(user1SchedulesBefore[0].transferredAmount);

            // Compare second user1 schedule details
            expect(user1SchedulesAfter[1].startTime).to.equal(user1SchedulesBefore[1].startTime);
            expect(user1SchedulesAfter[1].endTime).to.equal(user1SchedulesBefore[1].endTime);
            expect(user1SchedulesAfter[1].totalAmount).to.equal(user1SchedulesBefore[1].totalAmount);

            // Compare user2 schedule details
            expect(user2SchedulesAfter[0].startTime).to.equal(user2SchedulesBefore[0].startTime);
            expect(user2SchedulesAfter[0].endTime).to.equal(user2SchedulesBefore[0].endTime);
            expect(user2SchedulesAfter[0].cliffDuration).to.equal(user2SchedulesBefore[0].cliffDuration);
            expect(user2SchedulesAfter[0].totalAmount).to.equal(user2SchedulesBefore[0].totalAmount);
        });

        it("Should maintain correct vesting calculations after upgrade", async function () {
            const now = await time.latest();

            // Check vested amount before upgrade
            const vestedBefore = await fixture.vestingContract.getVestedAmountForUser(fixture.signers.user1.address, 0);
            const vestedBefore2 = await fixture.vestingContract.getVestedAmountForUser(fixture.signers.user1.address, now + 10000);

            // Upgrade contract
            const UniversalVestingContractV2 = await ethers.getContractFactory("UniversalVestingContractV2");
            const upgradedContract = await upgrades.upgradeProxy(fixture.vestingContract.target, UniversalVestingContractV2);

            // Check vested amount after upgrade
            const vestedAfter = await upgradedContract.getVestedAmountForUser(fixture.signers.user1.address, 0);
            const vestedAfter2 = await upgradedContract.getVestedAmountForUser(fixture.signers.user1.address, now + 10000);

            // Should be approximately equal (allowing for small time differences in block mining)
            expect(vestedAfter).to.be.closeTo(
                vestedBefore,
                ethers.parseEther("1") // Allow 1% difference due to block timing
            );
            expect(vestedAfter2).to.be.closeTo(
                vestedBefore2,
                ethers.parseEther("1") // Allow 1% difference due to block timing
            );
        });
    });
});