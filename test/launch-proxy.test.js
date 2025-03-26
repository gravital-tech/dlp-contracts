const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { createProxyTestSuite } = require("./utils/proxyTestSuite");
const launchFixtures = require("./utils/fixtures-launch");

describe("Launch Proxy Tests", function () {
    let fixture;

    before(async function () {
        fixture = await loadFixture(launchFixtures.deployLaunchFixtureStandard);
    });

    describe("Proxy Tests", createProxyTestSuite({
        // Provide a function returning the initialized proxy
        getInitializedProxy: async () => {
            return fixture.launchContract;
        },

        // Contract versions
        initialVersion: "MockLaunch",
        upgradedVersion: "MockLaunchV2",

        // The function called after upgrading
        upgradeInitializer: "initializeV2",

        // Check that certain state variables are preserved
        stateVariables: {
            treasury: {
                getter: async (contract) => await contract.treasury()
            },
            transactionFee: {
                getter: async (contract) => await contract.transactionFee()
            },
            token: {
                getter: async (contract) => await contract.token()
            },
            vestingContract: {
                getter: async (contract) => await contract.vestingContract()
            },
            mintCap: {
                getter: async (contract) => await contract.mintCap()
            },
            pricingConfig: {
                getter: async (contract) => await contract.pricingConfig()
            },
        },

        // Functions to test in the initial contract
        initialFunctions: {
            calculatePurchaseCost: async (contract) => {
                const result = await contract.calculatePurchaseCost(100);
                expect(result.basePrice).to.exist;
            },
            getBasePrice: async (contract) => {
                const bp = await contract.getBasePrice();
                expect(bp).to.be.a("bigint");
            }
        },

        // New state variable to verify after upgrade
        newStateVariables: {
            version: {
                getter: async (contract) => await contract.version(),
                expectedValue: "V2",
                isPublic: true
            }
        },

        // New functions to verify after upgrade
        newFunctions: {
            getVersion: async (contract) => {
                const ver = await contract.getVersion();
                expect(ver).to.equal("V2");
            }
        },

        // Role that controls upgrades
        accessControlRole: "DEFAULT_ADMIN_ROLE",

        // Example of expected upgrade event
        expectedEvents: {
            // Upgraded: { signature: "Upgraded(address)" }
        }
    }));
});