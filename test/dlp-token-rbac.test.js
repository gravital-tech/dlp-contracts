const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const tokenFixtures = require("./utils/fixtures-token");
const { createAccessControlTestSuite } = require("./utils/accessControlSuite");

describe("Role-Based Access Control", function () {
    createAccessControlTestSuite(
        tokenFixtures.deployDLPTokenFixture,
        {
            // Optional: Custom function to extract the contract from fixture result
            contractGetter: (result) => result.dlpToken,

            // Optional: Custom function to extract signers from fixture result
            signersGetter: (result) => result.signers,

            // Enable testing of UUPS Upgrade permissions
            testUpgrades: true,
            upgradeContract: "DLPTokenV2",

            // Test the role hierarchy
            testRoleHierarchy: true,

            // Define functions protected by access control
            protectedFunctions: {
                "setMinter": {
                    role: "DEFAULT_ADMIN",
                    args: [ethers.ZeroAddress]
                },
                "setVestingActive": {
                    role: "DEFAULT_ADMIN",
                    args: [false]
                },
                "setVestingContract": {
                    role: "DEFAULT_ADMIN",
                    args: [ethers.ZeroAddress]
                },
            }
        }
    )();
});

// Additional manual access control tests
describe("Manual Role-Based Access Control", function () {
    it("Should only allow minter to mint tokens", async function () {
        const { dlpToken, signers } = await loadFixture(tokenFixtures.deployDLPTokenFixture);

        const mintAmount = ethers.parseEther("100");

        // Cannot use standard role-based testing here since this is a custom onlyMinter modifier
        // Test that non-minter cannot mint
        await expect(
            dlpToken.connect(signers.user1).mint(signers.user2.address, mintAmount)
        ).to.be.revertedWith("DLPToken: Only minter can call this function");

        // Test that minter can mint
        await expect(
            dlpToken.connect(signers.minter).mint(signers.user2.address, mintAmount)
        ).not.to.be.reverted;

        expect(await dlpToken.balanceOf(signers.user2.address)).to.equal(mintAmount);
    });
});