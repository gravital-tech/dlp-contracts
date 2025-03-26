const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { createProxyTestSuite } = require("./utils/proxyTestSuite");
const tokenFixtures = require("./utils/fixtures-token");

describe("DLPToken Proxy Tests", function () {
    // Create a test suite using our reusable framework
    describe("Proxy Tests", createProxyTestSuite({
        // Provide a function that returns an initialized proxy
        getInitializedProxy: async () => {
            const { dlpToken } = await loadFixture(tokenFixtures.deployWithTokensFixture);
            return dlpToken;
        },

        // Contract versions
        initialVersion: "DLPToken",
        upgradedVersion: "DLPTokenV2",

        // Specify upgrade initializer function
        upgradeInitializer: "initializeV2",

        // State variables to test for preservation during upgrade
        stateVariables: {
            name: {
                getter: async (contract) => await contract.name()
            },
            symbol: {
                getter: async (contract) => await contract.symbol()
            },
            minterAddress: {
                getter: async (contract) => await contract.minterAddress()
            },
            vestingContract: {
                getter: async (contract) => await contract.vestingContract()
            },
            isVestingActive: {
                getter: async (contract) => await contract.isVestingActive()
            },
            totalSupply: {
                getter: async (contract) => await contract.totalSupply()
            }
        },

        // Functions to test in initial version
        initialFunctions: {
            mint: async (contract) => {
                const [_, minter, __, user2] = await ethers.getSigners();
                const mintAmount = ethers.parseEther("100");
                const initialBalance = await contract.balanceOf(user2.address);

                await contract.connect(minter).mint(user2.address, mintAmount);

                const finalBalance = await contract.balanceOf(user2.address);
                expect(finalBalance).to.equal(initialBalance + mintAmount);
            },
            burn: async (contract) => {
                const [_, __, user1] = await ethers.getSigners();
                const initialBalance = await contract.balanceOf(user1.address);
                const burnAmount = ethers.parseEther("100");

                // Only burn if there's enough balance
                if (initialBalance >= burnAmount) {
                    await contract.connect(user1).burn(burnAmount);

                    const finalBalance = await contract.balanceOf(user1.address);
                    expect(finalBalance).to.equal(initialBalance - burnAmount);
                } else {
                    // Skip test if balance insufficient
                    console.log("Insufficient balance for burn test");
                }
            },
            transfer: async (contract) => {
                const [_, __, user1, user2] = await ethers.getSigners();

                // Disable vesting to allow transfers
                const [admin] = await ethers.getSigners();
                await contract.connect(admin).setVestingActive(false);

                const initialBalance1 = await contract.balanceOf(user1.address);
                const initialBalance2 = await contract.balanceOf(user2.address);
                const transferAmount = ethers.parseEther("50");

                // Only transfer if there's enough balance
                if (initialBalance1 >= transferAmount) {
                    await contract.connect(user1).transfer(user2.address, transferAmount);

                    const finalBalance1 = await contract.balanceOf(user1.address);
                    const finalBalance2 = await contract.balanceOf(user2.address);

                    expect(finalBalance1).to.equal(initialBalance1 - transferAmount);
                    expect(finalBalance2).to.equal(initialBalance2 + transferAmount);
                } else {
                    // Skip test if balance insufficient
                    console.log("Insufficient balance for transfer test");
                }
            },
            hasRole: async (contract) => {
                const [admin, user1] = await ethers.getSigners();
                const role = await contract.DEFAULT_ADMIN_ROLE();

                // Grant minter role to user1
                await contract.connect(admin).grantRole(role, user1.address);

                // Check if user1 has the role
                const hasRole = await contract.hasRole(role, user1.address);
                expect(hasRole).to.be.true;
            }
        },

        // New state variables added in V2
        newStateVariables: {
            version: {
                getter: async (contract) => await contract.version(),
                expectedValue: "V2",
                isPublic: true // This is a public variable so we can directly check it
            }
        },

        // New functions in the upgraded version (if any)
        newFunctions: {
            getVersion: async (contract) => {
                const version = await contract.getVersion();
                expect(version).to.equal("V2");
            }
        },

        // Role required for upgrades
        accessControlRole: "DEFAULT_ADMIN_ROLE",

        // Events to check during upgrades
        expectedEvents: {
            // If your contract emits specific events during upgrade
            // Upgraded: {
            //     contract: null  // will use the proxy by default
            // }
        }
    }));
});