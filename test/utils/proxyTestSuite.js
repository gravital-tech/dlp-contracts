// test/helpers/proxyTestSuite.js - Comprehensive test suite for proxy contracts

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { UpgradeableContractTester, ProxyPatternTester } = require("./upgradeability");

/**
 * Creates a comprehensive test suite for proxy contracts
 * @param {Object} config Configuration for the test suite
 * @param {Function} config.getInitializedProxy Function that returns a deployed proxy
 * @param {String} config.initialVersion Name of initial contract implementation
 * @param {String} config.upgradedVersion Name of upgraded contract implementation
 * @param {Object} config.stateVariables State variables to verify between upgrades
 * @param {Object} config.newStateVariables New state variables added in upgraded version
 * @param {Object} config.newFunctions New functions to test in upgraded version
 * @param {Object} config.initialFunctions Functions to test in initial version
 * @param {Boolean} config.isBeacon Whether this is a beacon proxy
 * @param {String} config.accessControlRole Role required for upgrades
 * @param {String} config.upgradeInitializer Function to call after upgrading (e.g., "initializeV2")
 * @param {Object} config.expectedEvents Events to check during upgrades
 * @returns {Function} Function that when called defines the test suite
 */
function createProxyTestSuite(config) {
    return function () {
        let initialProxy;
        let initialImplementation;
        let signers;
        let proxyTester;
        let contractTester;

        beforeEach(async function () {
            // Get signers
            signers = await ethers.getSigners();

            // Deploy initial proxy using provided function
            initialProxy = await config.getInitializedProxy();

            // Initialize testers
            proxyTester = new ProxyPatternTester();

            // Get initial implementation address
            initialImplementation = await proxyTester.testUUPSImplementationSlot(initialProxy);

            // Initialize contract tester
            contractTester = new UpgradeableContractTester(
                config.initialVersion,
                [],
                {
                    instance: initialProxy,
                    isBeacon: config.isBeacon || false
                }
            );
        });

        describe("Proxy Implementation", function () {
            it("Should have a valid implementation address", async function () {
                // This was already tested in beforeEach via proxyTester.testUUPSImplementationSlot
                expect(initialImplementation).to.not.equal(ethers.ZeroAddress);
                expect(initialImplementation).to.be.a.properAddress;
            });

            it("Should have implementation with code", async function () {
                const code = await ethers.provider.getCode(initialImplementation);
                expect(code).to.not.equal('0x');
                expect(code.length).to.be.greaterThan(2); // More than just '0x'
            });

            it("Should verify proxy implementation slot integrity", async function () {
                // Verify implementation slot integrity
                const newImplementation = await proxyTester.testUUPSImplementationSlot(initialProxy);
                expect(newImplementation).to.equal(initialImplementation);
            });

        });

        describe("Upgradeability", function () {
            let upgradedProxy;
            let preUpgradeState

            beforeEach(async function () {
                // Get pre-upgrade state
                preUpgradeState = {};

                // Capture values of all specified state variables
                for (const varName of Object.keys(config.stateVariables)) {
                    const varConfig = config.stateVariables[varName];
                    const getter = typeof varConfig.getter === 'function'
                        ? varConfig.getter
                        : async () => await initialProxy[varName]();

                    preUpgradeState[varName] = await getter(initialProxy);
                }

                // Upgrade to new version
                upgradedProxy = await contractTester.upgrade(
                    config.upgradedVersion,
                    config.upgradeInitializer || null
                );
            });

            it("Should upgrade to a new implementation", async function () {
                // Get new implementation address
                const newImplementation = await proxyTester.testUUPSImplementationSlot(upgradedProxy);

                // Verify implementation changed
                expect(newImplementation).to.not.equal(initialImplementation);
            });

            it("Should preserve state during upgrade", async function () {                // Verify state preservation
                for (const [varName, varConfig] of Object.entries(config.stateVariables)) {
                    const getter = typeof varConfig.getter === 'function'
                        ? varConfig.getter
                        : async (contract) => await contract[varName]();

                    const postValue = await getter(upgradedProxy);
                    const expectedValue = preUpgradeState[varName];

                    if (config.compareFunc) {
                        expect(config.compareFunc(postValue, expectedValue)).to.be.true;
                    } else if (typeof expectedValue === 'object' && expectedValue !== null) {
                        expect(postValue).to.deep.equal(expectedValue);
                    } else {
                        expect(postValue).to.equal(expectedValue);
                    }
                }
            });

            if (config.newStateVariables && Object.keys(config.newStateVariables).length > 0) {
                it("Should initialize new state variables correctly", async function () {
                    // Verify new state variables
                    for (const [varName, varConfig] of Object.entries(config.newStateVariables)) {
                        // First check if the variable exists (if public)
                        if (varConfig.isPublic !== false) {
                            expect(typeof upgradedProxy[varName]).to.not.equal('undefined',
                                `The state variable '${varName}' does not exist in the upgraded contract`);
                        }

                        // Then verify its value
                        const getter = typeof varConfig.getter === 'function'
                            ? varConfig.getter
                            : async (contract) => await contract[varName]();

                        const actualValue = await getter(upgradedProxy);
                        const expectedValue = varConfig.expectedValue;

                        if (varConfig.compareFunc) {
                            expect(varConfig.compareFunc(actualValue, expectedValue)).to.be.true;
                        } else if (typeof expectedValue === 'object' && expectedValue !== null) {
                            expect(actualValue).to.deep.equal(expectedValue);
                        } else {
                            expect(actualValue).to.equal(expectedValue);
                        }
                    }
                });
            }

            if (config.newFunctions && Object.keys(config.newFunctions).length > 0) {
                it("Should support new functionality after upgrade", async function () {
                    // Test each new function
                    for (const [funcName, testFunc] of Object.entries(config.newFunctions)) {
                        expect(typeof upgradedProxy[funcName]).to.equal('function',
                            `The function '${funcName}' does not exist in the upgraded contract`);

                        await testFunc(upgradedProxy);
                    }
                });
            }

            if (config.accessControlRole) {
                it("Should only allow authorized accounts to upgrade", async function () {
                    // Get contract factory
                    const UpgradedFactory = await ethers.getContractFactory(config.upgradedVersion);

                    // Unauthorized account attempts upgrade
                    const unauthorizedAccount = signers[5]; // Using a random signer

                    // Reverts with proper access control error
                    if (config.isBeacon) {
                        await expect(
                            upgrades.upgradeBeacon(initialProxy, UpgradedFactory.connect(unauthorizedAccount))
                        ).to.be.revertedWithCustomError(
                            initialProxy,
                            "AccessControlUnauthorizedAccount"
                        );
                    } else {
                        await expect(
                            upgrades.upgradeProxy(initialProxy, UpgradedFactory.connect(unauthorizedAccount))
                        ).to.be.revertedWithCustomError(
                            initialProxy,
                            "AccessControlUnauthorizedAccount"
                        );
                    }

                    // Authorized account should succeed
                    const admin = signers[0]; // Usually the deployer
                    if (config.isBeacon) {
                        await expect(
                            upgrades.upgradeBeacon(initialProxy, UpgradedFactory.connect(admin))
                        ).to.not.be.reverted;
                    } else {
                        await expect(
                            upgrades.upgradeProxy(initialProxy, UpgradedFactory.connect(admin))
                        ).to.not.be.reverted;
                    }
                });
            }
        });

        describe("Original Functionality", function () {
            if (config.initialFunctions && Object.keys(config.initialFunctions).length > 0) {
                // Test each initial function
                for (const [funcName, testFunc] of Object.entries(config.initialFunctions)) {
                    it(`Should correctly execute ${funcName}`, async function () {
                        await testFunc(initialProxy);
                    });
                }
            }
        });

        if (config.initialFunctions && config.upgradedVersion) {
            describe("Functionality After Upgrade", function () {
                beforeEach(async function () {
                    // Upgrade to new version
                    upgradedProxy = await contractTester.upgrade(config.upgradedVersion);
                });

                // Test each initial function also works after upgrade
                for (const [funcName, testFunc] of Object.entries(config.initialFunctions)) {
                    it(`Should maintain ${funcName} after upgrade`, async function () {
                        await testFunc(upgradedProxy);
                    });
                }
            });
        }

        if (config.expectedEvents) {
            describe("Events", function () {
                it("Should emit expected events during upgrade", async function () {
                    // Get contract factory
                    const UpgradedFactory = await ethers.getContractFactory(config.upgradedVersion);

                    // Test each expected event
                    for (const [eventName, eventConfig] of Object.entries(config.expectedEvents)) {
                        // Prepare upgrade and check for event
                        if (config.isBeacon) {
                            await expect(
                                upgrades.upgradeBeacon(contractTester.beaconAddress, UpgradedFactory)
                            ).to.emit(eventConfig.contract || initialProxy, eventName);
                        } else {
                            await expect(
                                initialProxy.upgradeTo(UpgradedFactory.target)
                            ).to.emit(eventConfig.contract || initialProxy, eventName);
                        }
                    }
                });
            });
        }
    };
}

module.exports = { createProxyTestSuite };