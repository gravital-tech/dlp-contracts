const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture, impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const { createAccessControlTestSuite } = require("./utils/accessControlSuite");
const vestingFixtures = require("./utils/fixtures-vesting");

describe("Vesting RBAC", function () {
    describe("RBAC Test Suite",
        createAccessControlTestSuite(vestingFixtures.singleUserMutipleSchedulesInProgress, {
            // Extract contract from fixture result
            contractGetter: (result) => result.vestingContract,

            // Extract signers from fixture result
            signersGetter: (result) => result.signers,

            // Enable testing of UUPS Upgrade permissions
            testUpgrades: true,
            upgradeContract: "UniversalVestingContractV2",

            // Test the role hierarchy
            testRoleHierarchy: false,

            // Define custom roles
            customRoles: {
                VESTING_CREATOR_ROLE: async (contract) => await contract.VESTING_CREATOR_ROLE(),
                LIQUIDITY_MANAGER_ROLE: async (contract) => await contract.LIQUIDITY_MANAGER_ROLE()
            },

            // Define functions protected by access control
            protectedFunctions: {
                "setVestingConfig": {
                    role: "DEFAULT_ADMIN",
                    args: (ctx) => [ctx.mockToken.target, 7200, 172800]
                },
                "createVestingSchedule": {
                    role: async (contract) => await contract.VESTING_CREATOR_ROLE(),
                    args: (ctx) => [
                        ctx.mockToken.target, // Will be replaced dynamically
                        ctx.signers.user1.address, // Will be replaced dynamically
                        Math.floor(Date.now() / 1000) + 60, // Start time 60 seconds in future
                        86400 * 30, // 30 days duration
                        86400 * 7, // 7 days cliff
                        ethers.parseEther("100")
                    ]
                },
                "pause": {
                    role: "DEFAULT_ADMIN",
                    args: []
                },
            }
        }
        )
    );

    // Additional manual access control tests
    describe("UniversalVesting Manual Access Control Tests", function () {
        let vestingContract, dlpToken, signers;

        beforeEach(async function () {
            const fixture = await loadFixture(vestingFixtures.singleUserMutipleSchedulesInProgress);
            vestingContract = fixture.vestingContract;
            dlpToken = fixture.mockToken;
            signers = fixture.signers;
        });

        it("Should restrict isTransferAllowed to onlyToken", async function () {
            // Non-token address should get reverted
            await expect(
                vestingContract.connect(signers.admin).isTransferAllowed(
                    signers.user1.address,
                    ethers.parseEther("100"),
                    dlpToken.target
                )
            ).to.be.revertedWithCustomError(vestingContract, "NotTokenContract");
        });

        it("Should restrict recordTransfer to onlyToken", async function () {
            // Non-token address should get reverted
            await expect(
                vestingContract.connect(signers.admin).recordTransfer(
                    signers.user1.address,
                    ethers.parseEther("100"),
                    dlpToken.target
                )
            ).to.be.revertedWithCustomError(vestingContract, "NotTokenContract");
        });

        it("Should handle token-only functions when paused", async function () {
            // First pause the contract
            await vestingContract.connect(signers.admin).pause();

            // Impersonate the token contract address
            await impersonateAccount(dlpToken.target);
            await setBalance(dlpToken.target, ethers.parseEther("1.0"));
            const mockTokenSigner = await ethers.getSigner(dlpToken.target);

            // Direct calls to token-only functions should revert with paused error first
            await expect(
                vestingContract.connect(mockTokenSigner).isTransferAllowed(
                    signers.user1.address,
                    ethers.parseEther("100"),
                    dlpToken.target
                )
            ).to.be.revertedWithCustomError(vestingContract, "EnforcedPause");

            await expect(
                vestingContract.connect(mockTokenSigner).recordTransfer(
                    signers.user1.address,
                    ethers.parseEther("100"),
                    dlpToken.target
                )
            ).to.be.revertedWithCustomError(vestingContract, "EnforcedPause");

            await vestingContract.connect(signers.admin).unpause();
        });

        it("Should prevent createVestingSchedule when token is not registered", async function () {
            // Deploy a fresh contract without registering a token
            const UniversalVestingContract = await ethers.getContractFactory("UniversalVesting");
            const newVestingContract = await upgrades.deployProxy(
                UniversalVestingContract,
                [],
                { initializer: 'initialize', kind: "uups" }
            );
            await newVestingContract.waitForDeployment();

            // Grant role to the creator
            await newVestingContract.grantRole(
                await newVestingContract.VESTING_CREATOR_ROLE(),
                signers.vestingCreator.address
            );

            // Try to create a vesting schedule
            await expect(
                newVestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    dlpToken.target,
                    signers.user1.address,
                    Math.floor(Date.now() / 1000) + 60,
                    86400 * 30,
                    86400 * 7,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(newVestingContract, "TokenRegistrationError");
        });

        it("Should verify permission combinations", async function () {
            // Create a new user with VESTING_CREATOR_ROLE only
            const vestingCreatorOnly = signers.user1;
            await vestingContract.grantRole(
                await vestingContract.VESTING_CREATOR_ROLE(),
                vestingCreatorOnly.address
            );

            // Verify they can create vesting schedules
            const now = Math.floor(Date.now() / 1000);
            await expect(
                vestingContract.connect(vestingCreatorOnly).createVestingSchedule(
                    dlpToken.target,
                    signers.user2.address,
                    now + 60,
                    86400 * 30,
                    86400 * 7,
                    ethers.parseEther("1000")
                )
            ).to.not.be.reverted;

            // But they cannot perform admin actions
            await expect(
                vestingContract.connect(vestingCreatorOnly).pause()
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");

            await expect(
                vestingContract.connect(vestingCreatorOnly).setVestingConfig(
                    dlpToken.target, 7200, 172800
                )
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");
        });

        it("Should allow users to renounce roles", async function () {
            const vestingCreatorRole = await vestingContract.VESTING_CREATOR_ROLE();

            // First verify the vesting creator has the role
            expect(
                await vestingContract.hasRole(vestingCreatorRole, signers.vestingCreator.address)
            ).to.be.true;

            // Renounce the role
            await vestingContract.connect(signers.vestingCreator).renounceRole(
                vestingCreatorRole,
                signers.vestingCreator.address
            );

            // Verify the role was removed
            expect(
                await vestingContract.hasRole(vestingCreatorRole, signers.vestingCreator.address)
            ).to.be.false;

            // Verify they can no longer create vesting schedules
            const now = Math.floor(Date.now() / 1000);
            await expect(
                vestingContract.connect(signers.vestingCreator).createVestingSchedule(
                    dlpToken.target,
                    signers.user2.address,
                    now + 60,
                    86400 * 30,
                    86400 * 7,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWithCustomError(vestingContract, "AccessControlUnauthorizedAccount");
        });

        it("Should properly initialize roles during deployment", async function () {
            // Deploy fresh contract to verify initialization
            const UniversalVestingContract = await ethers.getContractFactory("UniversalVesting");
            const newVestingContract = await upgrades.deployProxy(
                UniversalVestingContract,
                [],
                { initializer: 'initialize', kind: "uups" }
            );
            await newVestingContract.waitForDeployment();

            // Check that deployer has both admin and vesting creator roles
            const adminRole = await newVestingContract.DEFAULT_ADMIN_ROLE();
            const vestingCreatorRole = await newVestingContract.VESTING_CREATOR_ROLE();

            expect(await newVestingContract.hasRole(adminRole, signers.admin.address)).to.be.true;
            expect(await newVestingContract.hasRole(vestingCreatorRole, signers.admin.address)).to.be.false;

            // Check that no one else has these roles
            expect(await newVestingContract.hasRole(adminRole, signers.user1.address)).to.be.false;
            expect(await newVestingContract.hasRole(vestingCreatorRole, signers.user1.address)).to.be.false;
        });
    });
});
