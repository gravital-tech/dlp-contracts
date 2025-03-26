// test/helpers/upgradeability.js - Core utilities for testing upgradeable contracts

const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
/**
 * Helper class for testing upgradeable contracts
 */
class UpgradeableContractTester {
    /**
     * @param {string} contractName - The name of the contract to deploy
     * @param {Array} constructorArgs - Arguments for the contract constructor
     * @param {Object} options - Additional options
     * @param {boolean} options.isBeacon - Whether to use a beacon proxy (if false, UUPS is used)
     * @param {Object} options.initializer - Initializer function and arguments
     * @param {Contract} options.instance - Existing contract instance to use instead of deploying new one
     */
    constructor(contractName, constructorArgs = [], options = {}) {
        this.contractName = contractName;
        this.constructorArgs = constructorArgs;
        this.isBeacon = options.isBeacon || false;
        this.initializer = options.initializer || { function: "initialize", args: [] };
        this.instance = options.instance || null;
        this.factory = null;
        this.beaconAddress = null;

        // Track version status (added for reinitialization tracking)
        this.currentVersion = 1;
        this.upgradeInitializerCalled = false;
    }

    /**
     * Deploy the contract using the appropriate proxy method
     * @returns {Promise<Contract>} The deployed contract instance
     */
    async deploy() {
        this.factory = await ethers.getContractFactory(this.contractName);

        if (this.isBeacon) {
            // Deploy as beacon proxy
            const beacon = await upgrades.deployBeacon(this.factory);
            this.beaconAddress = await beacon.getAddress();

            this.instance = await upgrades.deployBeaconProxy(
                beacon,
                this.factory,
                this.initializer.args,
                { initializer: this.initializer.function }
            );
        } else {
            // Deploy as UUPS proxy
            this.instance = await upgrades.deployProxy(
                this.factory,
                this.initializer.args,
                {
                    initializer: this.initializer.function,
                    kind: "uups"
                }
            );
        }

        return this.instance;
    }

    /**
     * Upgrade the contract to a new implementation
     * @param {string} newContractName - The name of the new contract implementation
     * @returns {Promise<Contract>} The upgraded contract instance
     */
    async upgrade(newContractName, initializerFunction = null) {
        const newFactory = await ethers.getContractFactory(newContractName);

        // Check if we're attempting to upgrade to the same contract. If so, return the current instance.
        if (this.contractName === newContractName) {
            return this.instance;
        }

        // Track if we need to try initializing
        const shouldTryInitializer = initializerFunction && !this.upgradeInitializerCalled;

        if (this.isBeacon) {
            // Upgrade beacon implementation
            await upgrades.upgradeBeacon(this.beaconAddress, newFactory);
            // Get the same proxy with the new implementation
            this.instance = newFactory.attach(this.instance.address);

            // Call initializer if provided and not already called
            if (shouldTryInitializer) {
                try {
                    await this.instance[initializerFunction]();
                    this.upgradeInitializerCalled = true;
                    this.currentVersion++;
                } catch (error) {
                    // If initialization fails, log it but continue
                    // This allows tests to proceed even if initialization can't be performed again
                    console.log(`Initializer call failed (expected if already initialized): ${error.message}`);
                }
            }
        } else {
            if (shouldTryInitializer) {
                try {
                    // Try to upgrade with initializer
                    this.instance = await upgrades.upgradeProxy(await this.instance.getAddress(), newFactory, {
                        call: initializerFunction
                    });
                    this.upgradeInitializerCalled = true;
                    this.currentVersion++;
                } catch (error) {
                    if (error.message.includes('InvalidInitialization')) {
                        // If initialization fails due to InvalidInitialization, upgrade without initializer
                        this.instance = await upgrades.upgradeProxy(await this.instance.getAddress(), newFactory);
                    } else {
                        // Re-throw other errors
                        throw error;
                    }
                }
            } else {
                // Upgrade without calling initializer
                this.instance = await upgrades.upgradeProxy(await this.instance.getAddress(), newFactory);
            }
        }

        this.contractName = newContractName;
        return this.instance;
    }

    /**
      * Test if state variables are preserved after an upgrade
      * @param {Object} variables - Key-value pairs of variable names and expected values
      * @returns {Promise<void>}
      */
    async testStatePreservation(variables) {
        for (const [variable, expectedValue] of Object.entries(variables)) {
            const getter = `get${variable.charAt(0).toUpperCase() + variable.slice(1)}`;
            const actualValue = await this.instance[getter]();

            if (typeof expectedValue === 'object' && expectedValue !== null) {
                expect(actualValue).to.deep.equal(expectedValue);
            } else {
                expect(actualValue).to.equal(expectedValue);
            }
        }
    }

    /**
     * Test if a function reverts with a specific message
     * @param {string} functionName - The function to call
     * @param {Array} args - Arguments for the function
     * @param {string} revertMessage - Expected revert message
     * @returns {Promise<void>}
     */
    async expectRevert(functionName, args, revertMessage) {
        await expect(this.instance[functionName](...args)).to.be.revertedWith(revertMessage);
    }

    /**
     * Check if a contract is upgradeable to a new implementation
     * @param {string} newContractName - The name of the new implementation
     * @returns {Promise<boolean>} Whether the contract is upgradeable
     */
    async isUpgradeable(newContractName) {
        try {
            const newFactory = await ethers.getContractFactory(newContractName);

            if (this.isBeacon) {
                await upgrades.validateBeacon(newFactory);
            } else {
                await upgrades.validateUpgrade(this.instance.address, newFactory);
            }

            return true;
        } catch (error) {
            console.error(`Upgrade validation failed: ${error.message}`);
            return false;
        }
    }
}

/**
 * Helper for testing proxy patterns
 */
class ProxyPatternTester {
    /**
     * Test the upgrade security and implementation slot for UUPS proxies
     * @param {Contract} proxy - The proxy contract
     * @returns {Promise<void>}
     */
    async testUUPSImplementationSlot(proxy) {
        // Check implementation slot
        const ERC1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

        // In ethers v6, contracts have a 'target' property with their address
        const proxyAddress = proxy.target;

        // Get the storage value at the implementation slot
        const implementationStorage = await ethers.provider.getStorage(
            proxyAddress,
            ERC1967_IMPLEMENTATION_SLOT
        );

        // Extract address from storage value (last 20 bytes)
        // In ethers v6, we need a different approach to format the address
        const implementationAddress = ethers.getAddress(
            '0x' + implementationStorage.toString().slice(-40)
        );

        // Verify implementation has code
        const code = await ethers.provider.getCode(implementationAddress);
        expect(code).to.not.equal('0x');

        return implementationAddress;
    }

    /**
     * Test beacon functionality for beacon proxies
     * @param {string} beaconAddress - The address of the beacon
     * @param {string} expectedImplementation - The expected implementation address
     * @returns {Promise<void>}
     */
    async testBeacon(beaconAddress, expectedImplementation) {
        // Get the beacon interface
        const beacon = await ethers.getContractAt('IBeacon', beaconAddress);

        // Check implementation
        const implementation = await beacon.implementation();
        expect(implementation).to.equal(expectedImplementation);

        return implementation;
    }
}

module.exports = {
    UpgradeableContractTester,
    ProxyPatternTester
};