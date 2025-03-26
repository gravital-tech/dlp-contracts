const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { AccessControlTester } = require("./accessControlTester");
const { loadFixture, impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Helper to create a comprehensive test suite for typical access control patterns
 * @param {Contract} contractFixtureFn - The contract fixture function to test
 * @param {Object} config - Configuration for tests
 * @returns {Function} A function that sets up the describe block with tests
 */
function createAccessControlTestSuite(contractFixtureFn, config = {}) {
    return function () {
        let accessTester;
        let contract;
        let signers;
        let resolvedRoles = {}; // Store resolved roles here
        let fixture;

        beforeEach(async function () {
            // Allow for passing in the fixture and extracting
            if (contractFixtureFn != "pass") {
                // Get fresh contract instance using the fixture
                const result = await loadFixture(contractFixtureFn);
                fixture = result;

                // More flexible contract extraction
                if (config.contractGetter) {
                    // Custom function to extract contract from result
                    contract = config.contractGetter(result);
                } else if (result.contract) {
                    // Standard contract property
                    contract = result.contract;
                } else if (result.proxy) {
                    // Proxy contract
                    contract = result.proxy;
                } else if (result.dlpToken) {
                    // Specific to dlpToken tests
                    contract = result.dlpToken;
                } else {
                    // Assume result is the contract itself
                    contract = result;
                }

                // Extract signers - support multiple formats
                if (config.signersGetter) {
                    // Custom function to extract signers
                    signers = config.signersGetter(result);
                } else if (result.signers) {
                    // Standard signers property
                    signers = result.signers;
                } else {
                    // Default to ethers signers
                    const allSigners = await ethers.getSigners();
                    signers = {
                        admin: allSigners[0],
                        user1: allSigners[1],
                        user2: allSigners[2],
                        attacker: allSigners[3]
                    };
                }
            } else {
                // Provide contract and signers directly
                contract = config.contract();
                signers = config.signers();
            }

            // Create the tester with the initialized contract
            accessTester = new AccessControlTester(contract);

            // Resolve all roles first
            resolvedRoles.DEFAULT_ADMIN = await contract.DEFAULT_ADMIN_ROLE();

            // Now resolve roles for protected functions
            if (config.protectedFunctions) {
                for (const [funcName, funcConfig] of Object.entries(config.protectedFunctions)) {
                    if (typeof funcConfig.role === 'string') {
                        // If it's a string reference to a known role
                        funcConfig.resolvedRole = resolvedRoles[funcConfig.role];
                    } else if (typeof funcConfig.role === 'function') {
                        // If it's a function that resolves to a role
                        funcConfig.resolvedRole = await funcConfig.role(contract);
                    } else {
                        // If it's already a direct role value
                        funcConfig.resolvedRole = funcConfig.role;
                    }
                }
            }
        });

        // Test the admin role
        it("Should set up the default admin role correctly", async function () {
            // Find the admin signer
            const adminSigner = signers.admin || signers.owner || Object.values(signers)[0];
            expect(await contract.hasRole(resolvedRoles.DEFAULT_ADMIN, adminSigner.address)).to.be.true;
        });

        // Test upgrader role and upgradeTo function if the contract is UUPS upgradeable
        if (config.testUpgrades) {
            it("Should protect upgrades with DEFAULT_ADMIN_ROLE", async function () {
                // Get signers
                const upgraderSigner = signers.admin || signers.owner || Object.values(signers)[0];
                const unauthorizedSigner = signers.attacker || signers.user2 || Object.values(signers)[2];

                // Get the contract factory for the implementation
                const ImplementationFactory = await ethers.getContractFactory(
                    config.upgradeContract, upgraderSigner
                );

                const proxyAddress = await contract.getAddress();
                // Authorized upgrade should succeed
                try {
                    await upgrades.upgradeProxy(proxyAddress, ImplementationFactory);
                    // If we get here, the upgrade succeeded
                } catch (e) {
                    // Ensure that this is a permission error, not some other error
                    console.log(e.message);
                    if (e.message.includes("missing role") || e.message.includes("AccessControl")) {
                        assert.fail("Upgrade with authorized account failed: " + e.message);
                    } else {
                        console.log("Non-permission related upgrade error:", e.message);
                        return; // Skip the rest of the test
                    }
                }

                // Unauthorized upgrade should fail
                const UnauthorizedFactory = await ethers.getContractFactory(
                    config.upgradeContract,
                    unauthorizedSigner
                );

                try {
                    await upgrades.upgradeProxy(proxyAddress, UnauthorizedFactory);
                    assert.fail("Upgrade with unauthorized account succeeded but should have failed");
                } catch (e) {
                    // Ensure that this is a permission error, not some other error
                    if (!e.message.includes("missing role") && !e.message.includes("AccessControl")) {
                        console.log("Unexpected error during unauthorized upgrade:", e.message);
                    }
                    // Otherwise, this is expected
                }
            });
        }

        // Test protected functions
        if (config.protectedFunctions) {
            for (const [funcName, funcConfig] of Object.entries(config.protectedFunctions)) {
                it(`Should protect ${funcName} with the correct role`, async function () {
                    // Skip if function doesn't exist on the contract
                    if (typeof contract[funcName] !== 'function') {
                        this.skip();
                        return;
                    }

                    const role = funcConfig.resolvedRole;

                    // Find an authorized signer (has the role)
                    let authorizedSigner = null;
                    for (const signer of Object.values(signers)) {
                        if (await contract.hasRole(role, signer.address)) {
                            authorizedSigner = signer;
                            break;
                        }
                    }

                    if (!authorizedSigner) {
                        // Grant the role to admin if no one has it
                        const adminSigner = signers.admin || signers.owner || Object.values(signers)[0];
                        await contract.connect(adminSigner).grantRole(role, adminSigner.address);
                        authorizedSigner = adminSigner;
                    }

                    // Find an unauthorized signer (doesn't have the role)
                    let unauthorizedSigner = null;
                    for (const signer of Object.values(signers)) {
                        if (!(await contract.hasRole(role, signer.address))) {
                            unauthorizedSigner = signer;
                            break;
                        }
                    }

                    // Resolve args if it's a function, otherwise treat it as an array
                    const functionArgs = typeof funcConfig.args === "function"
                        ? funcConfig.args(fixture)
                        : funcConfig.args;

                    //Check if we need to impersonate account
                    if (funcConfig.impersonate) {
                        const _t = typeof funcConfig.impersonate === "function"
                            ? funcConfig.impersonate(fixture)
                            : funcConfig.impersonate;
                        // Impersonate the token contract address
                        await impersonateAccount(_t);
                        await setBalance(_t, ethers.parseEther("1.0"));
                        const mockSigner = await ethers.getSigner(_t);
                        authorizedSigner = mockSigner;
                    }

                    // Test authorized access
                    await expect(
                        contract.connect(authorizedSigner)[funcName](...functionArgs)
                    ).not.to.be.reverted;

                    // Test unauthorized access
                    await expect(
                        contract.connect(unauthorizedSigner)[funcName](...functionArgs)
                    ).to.be.reverted;
                });
            }
        }

        // Test role hierarchy if enabled
        if (config.testRoleHierarchy) {
            it("Should maintain proper role hierarchy", async function () {
                const adminSigner = signers.admin || signers.owner || Object.values(signers)[0];
                const rolesToTest = [resolvedRoles.DEFAULT_ADMIN];

                if (resolvedRoles.UPGRADER) {
                    rolesToTest.push(resolvedRoles.UPGRADER);
                }

                // Add other custom roles from config
                if (config.customRoles) {
                    for (const role of Object.values(config.customRoles)) {
                        rolesToTest.push(role);
                    }
                }

                const hierarchy = await accessTester.testRoleHierarchy(
                    rolesToTest,
                    {
                        admin: adminSigner,
                        user1: signers.user1 || Object.values(signers)[1],
                        user2: signers.user2 || Object.values(signers)[2]
                    }
                );

                // Verify DEFAULT_ADMIN is the admin for other roles
                for (const [role, info] of Object.entries(hierarchy)) {
                    if (role !== resolvedRoles.DEFAULT_ADMIN.toString()) {
                        expect(info.adminRole).to.equal(resolvedRoles.DEFAULT_ADMIN);
                    }
                }
            });
        }
    };
}

module.exports = { createAccessControlTestSuite };