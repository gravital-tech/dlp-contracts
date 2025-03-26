// test/helpers/accessControl.js - Advanced utilities for testing access control

const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { keccak256, toUtf8Bytes } = require("ethers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Helper class for comprehensive testing of AccessControlUpgradeable functionality
 */
class AccessControlTester {
    /**
     * @param {Contract} contract - The deployed contract instance
     */
    constructor(contract) {
        this.contract = contract;
    }

    /**
     * Convert a string role name to bytes32 role identifier
     * @param {string} roleName - The name of the role (e.g., "ADMIN_ROLE")
     * @returns {string} - The bytes32 role identifier
     */
    static getRoleHash(roleName) {
        if (roleName === "DEFAULT_ADMIN_ROLE") {
            return ethers.ZeroHash; // 0x00
        }
        return keccak256(toUtf8Bytes(roleName));
    }

    /**
     * Get all roles defined in a contract
     * @returns {Promise<Array>} Array of role events emitted during contract initialization
     */
    async getAllDefinedRoles() {
        // Filter for RoleAdminChanged events during deployment
        const filter = this.contract.filters.RoleAdminChanged();
        const events = await this.contract.queryFilter(filter);

        // Extract unique roles
        const roles = new Set();
        for (const event of events) {
            roles.add(event.args.role);
            roles.add(event.args.previousAdminRole);
            roles.add(event.args.newAdminRole);
        }

        return Array.from(roles);
    }

    /**
     * Check if a specific account has a role
     * @param {string} role - The role to check
     * @param {string} account - The account address to check
     * @returns {Promise<boolean>} Whether the account has the role
     */
    async hasRole(role, account) {
        return await this.contract.hasRole(role, account);
    }

    /**
     * Test a complete role management cycle (grant, check, revoke, check)
     * @param {string} role - The role to test
     * @param {Object} accounts - Account addresses for testing
     * @returns {Promise<void>}
     */
    async testRoleManagement(role, accounts) {
        const { admin, user } = accounts;

        // Grant role
        await this.contract.connect(admin).grantRole(role, user.address);
        expect(await this.contract.hasRole(role, user.address)).to.be.true;

        // Revoke role
        await this.contract.connect(admin).revokeRole(role, user.address);
        expect(await this.contract.hasRole(role, user.address)).to.be.false;

        // Grant again and renounce
        await this.contract.connect(admin).grantRole(role, user.address);
        await this.contract.connect(user).renounceRole(role, user.address);
        expect(await this.contract.hasRole(role, user.address)).to.be.false;
    }

    /**
     * Test if a function is accessible only to accounts with a specific role
     * @param {string} functionName - The function to test
     * @param {Array} args - Arguments for the function
     * @param {string} role - The required role (bytes32 role identifier)
     * @param {Object} accounts - Account addresses
     * @returns {Promise<void>}
     */
    async testRoleBasedAccess(functionName, args, role, accounts) {
        const { authorized, unauthorized } = accounts;

        // Ensure authorized has the role
        if (!(await this.contract.hasRole(role, authorized.address))) {
            await this.grantRole(this.contract, role, authorized.address);
        }

        // Ensure unauthorized doesn't have the role
        if (await this.contract.hasRole(role, unauthorized.address)) {
            throw new Error(`Test error: Unauthorized account already has role ${role}`);
        }

        // Try with unauthorized account - should fail
        await expect(
            this.contract.connect(unauthorized)[functionName](...args)
        ).to.be.revertedWithCustomError(
            this.contract,
            "AccessControlUnauthorizedAccount"
        );

        // Try with authorized account - should succeed
        await this.contract.connect(authorized)[functionName](...args);
    }

    /**
     * Test function access across all roles and types of accounts
     * @param {string} functionName - Function to test
     * @param {Array} args - Arguments for the function call
     * @param {string} requiredRole - Role required to access the function
     * @param {Object} signers - Signer objects to use for testing
     * @returns {Promise<void>}
     */
    async testFunctionAccessAcrossRoles(functionName, args, requiredRole, signers) {
        for (const [name, signer] of Object.entries(signers)) {
            const hasRequiredRole = await this.contract.hasRole(requiredRole, signer.address);

            if (hasRequiredRole) {
                // Should succeed
                await expect(
                    this.contract.connect(signer)[functionName](...args)
                ).not.to.be.reverted;
            } else {
                // Should fail
                await expect(
                    this.contract.connect(signer)[functionName](...args)
                ).to.be.revertedWithCustomError(
                    this.contract,
                    "AccessControlUnauthorizedAccount"
                );
            }
        }
    }

    /**
     * Test the role hierarchy (who can grant which roles)
     * @param {Array<string>} roles - Array of roles to test
     * @param {Object} signers - Signer objects
     * @returns {Promise<Object>} Mapping of role relationships
     */
    async testRoleHierarchy(roles, signers) {
        const hierarchy = {};

        for (const role of roles) {
            // Get admin role for this role
            const adminRole = await this.contract.getRoleAdmin(role);
            hierarchy[role] = { adminRole };

            // Test if admin role can grant this role
            for (const [name, signer] of Object.entries(signers)) {
                const hasAdminRole = await this.contract.hasRole(adminRole, signer.address);
                const testUser = signers.user1.address;

                if (hasAdminRole) {
                    // Admin should be able to grant the role
                    await this.contract.connect(signer).grantRole(role, testUser);
                    expect(await this.contract.hasRole(role, testUser)).to.be.true;

                    // Clean up
                    await this.contract.connect(signer).revokeRole(role, testUser);
                } else {
                    // Non-admin should not be able to grant the role
                    await expect(
                        this.contract.connect(signer).grantRole(role, testUser)
                    ).to.be.revertedWithCustomError(
                        this.contract,
                        "AccessControlUnauthorizedAccount"
                    );
                }
            }
        }

        return hierarchy;
    }

    /**
     * Test complete authorization patterns for all protected functions
     * @param {Object} protectedFunctions - Map of function names to their required roles and test args
     * @param {Object} signers - Map of signer names to signer objects
     * @returns {Promise<void>}
     */
    async testProtectedFunctions(protectedFunctions, signers) {
        for (const [funcName, config] of Object.entries(protectedFunctions)) {
            const { role, args } = config;

            // For each signer, test if they can call the function
            for (const [name, signer] of Object.entries(signers)) {
                const hasRole = await this.contract.hasRole(role, signer.address);

                if (hasRole) {
                    // Should be allowed
                    await expect(
                        this.contract.connect(signer)[funcName](...args)
                    ).not.to.be.reverted;
                } else {
                    // Should be denied
                    await expect(
                        this.contract.connect(signer)[funcName](...args)
                    ).to.be.revertedWithCustomError(
                        this.contract,
                        "AccessControlUnauthorizedAccount"
                    );
                }
            }
        }
    }

    /**
     * Helper to grant a role directly (useful for test setup)
     * @param {Contract} contract - The contract instance
     * @param {string} role - The role to grant
     * @param {string} account - The account to grant the role to
     * @returns {Promise<void>}
     */
    async grantRole(contract, role, account) {
        // Get admin role
        const adminRole = await contract.getRoleAdmin(role);

        // Find an account with the admin role
        let adminSigner = null;
        for (const signer of await ethers.getSigners()) {
            if (await contract.hasRole(adminRole, signer.address)) {
                adminSigner = signer;
                break;
            }
        }

        if (!adminSigner) {
            throw new Error(`No account has the admin role ${adminRole} needed to grant ${role}`);
        }

        // Grant the role
        await contract.connect(adminSigner).grantRole(role, account);
    }
}

module.exports = {
    AccessControlTester,
};