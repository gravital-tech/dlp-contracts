// test/helpers/fixtures.js - Reusable fixtures for testing

const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Deploy a standard UUPS proxy contract for testing
 * @param {string} contractName - The contract to deploy
 * @param {Array} initArgs - Arguments for the initializer
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object containing contracts and signers
 */
async function deployUUPSProxyFixture(contractName, initArgs = [], options = {}) {
    const [owner, upgrader, user1, user2] = await ethers.getSigners();

    // Deploy implementation
    const ContractFactory = await ethers.getContractFactory(contractName);
    const proxy = await upgrades.deployProxy(
        ContractFactory,
        initArgs,
        {
            initializer: options.initializer || 'initialize',
            kind: 'uups'
        }
    );

    const proxyAddress = await proxy.getAddress();

    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    // Get implementation contract
    const implementation = ContractFactory.attach(implementationAddress);

    return {
        proxy,
        implementation,
        implementationAddress,
        ContractFactory,
        signers: {
            owner,
            upgrader,
            user1,
            user2
        }
    };
}

/**
 * Deploy a standard beacon proxy contract for testing
 * @param {string} contractName - The contract to deploy
 * @param {Array} initArgs - Arguments for the initializer
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Object containing contracts and signers
 */
async function deployBeaconProxyFixture(contractName, initArgs = [], options = {}) {
    const [owner, upgrader, user1, user2] = await ethers.getSigners();

    // Deploy implementation and beacon
    const ContractFactory = await ethers.getContractFactory(contractName);
    const beacon = await upgrades.deployBeacon(ContractFactory);

    // Deploy beacon proxy
    const proxy = await upgrades.deployBeaconProxy(
        beacon,
        ContractFactory,
        initArgs,
        {
            initializer: options.initializer || 'initialize'
        }
    );

    // Get implementation address
    const implementationAddress = await beacon.implementation();

    // Get implementation contract
    const implementation = ContractFactory.attach(implementationAddress);

    return {
        proxy,
        beacon,
        implementation,
        implementationAddress,
        ContractFactory,
        signers: {
            owner,
            upgrader,
            user1,
            user2
        }
    };
}

/**
 * Test fixture for a group of related contracts
 * @param {Object} contractNames - Object with keys as contract reference names and values as actual contract names
 * @param {boolean} useBeacon - Whether to use beacon proxies (if false, UUPS is used)
 * @returns {Promise<Object>} Object containing all deployed contracts
 */
async function deployContractSystemFixture(contractNames, useBeacon = false) {
    const deployMethod = useBeacon ? deployBeaconProxyFixture : deployUUPSProxyFixture;
    const [owner, upgrader, user1, user2] = await ethers.getSigners();

    const contracts = {};
    const deployedBeacons = {};

    // Deploy each contract
    for (const [key, contractInfo] of Object.entries(contractNames)) {
        let name, initArgs, options;

        if (typeof contractInfo === 'string') {
            name = contractInfo;
            initArgs = [];
            options = {};
        } else {
            name = contractInfo.name;
            initArgs = contractInfo.initArgs || [];
            options = contractInfo.options || {};
        }

        // If this is a beacon proxy and we want to reuse a beacon
        if (useBeacon && options.reuseBeacon) {
            const beacon = deployedBeacons[options.reuseBeacon];
            if (!beacon) {
                throw new Error(`Beacon ${options.reuseBeacon} not found for reuse`);
            }

            const ContractFactory = await ethers.getContractFactory(name);
            const proxy = await upgrades.deployBeaconProxy(
                beacon,
                ContractFactory,
                initArgs,
                {
                    initializer: options.initializer || 'initialize'
                }
            );

            contracts[key] = {
                proxy,
                beacon,
                ContractFactory
            };
        } else {
            const deployed = await deployMethod(name, initArgs, options);
            contracts[key] = deployed;

            // Store beacon for potential reuse
            if (useBeacon && options.beaconId) {
                deployedBeacons[options.beaconId] = deployed.beacon;
            }
        }
    }

    return {
        contracts,
        signers: {
            owner,
            upgrader,
            user1,
            user2
        }
    };
}

/**
 * Upgrading a UUPS proxy for testing
 * @param {Contract} proxy - The proxy contract to upgrade
 * @param {string} newImplementationName - The name of the new implementation contract
 * @returns {Promise<Object>} Object containing updated contracts
 */
async function upgradeUUPSProxyFixture(proxy, newImplementationName) {
    const NewImplementationFactory = await ethers.getContractFactory(newImplementationName);

    const upgradedProxy = await upgrades.upgradeProxy(proxy, NewImplementationFactory);
    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(upgradedProxy.address);

    return {
        proxy: upgradedProxy,
        implementationAddress: newImplementationAddress,
        NewImplementationFactory
    };
}

/**
 * Upgrading a beacon for testing
 * @param {Contract} beacon - The beacon contract to upgrade
 * @param {string} newImplementationName - The name of the new implementation contract
 * @returns {Promise<Object>} Object containing updated contracts
 */
async function upgradeBeaconFixture(beacon, newImplementationName) {
    const NewImplementationFactory = await ethers.getContractFactory(newImplementationName);

    await upgrades.upgradeBeacon(beacon, NewImplementationFactory);
    const newImplementationAddress = await beacon.implementation();

    return {
        beacon,
        implementationAddress: newImplementationAddress,
        NewImplementationFactory
    };
}

module.exports = {
    deployUUPSProxyFixture,
    deployBeaconProxyFixture,
    deployContractSystemFixture,
    upgradeUUPSProxyFixture,
    upgradeBeaconFixture,
    loadFixture
};