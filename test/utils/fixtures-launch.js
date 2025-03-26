const { ethers } = require("hardhat");
const { deployUUPSProxyFixture } = require("./fixtures");

// --- Configurations ---
const standardConfig = {
    txnFee: ethers.parseEther("0.01"),
    initialPrice: ethers.parseEther("0.001"),
    totalSupply: ethers.parseUnits("1000000", 18),
    mintCap: ethers.parseUnits("1200000", 18),
    alpha: -1,
    k: 20,
    beta: ethers.parseUnits("0.5", 18),
    maxPurchaseAmount: ethers.parseUnits("1000000", 18)
}

const zeroBetaConfig = {
    txnFee: ethers.parseEther("0.01"),
    initialPrice: ethers.parseEther("0.001"),
    totalSupply: ethers.parseUnits("1000000", 18),
    alpha: -1,
    k: 20,
    beta: 0,
    maxPurchaseAmount: ethers.parseUnits("1000000", 18)
}

const lowBetaConfig = {
    txnFee: ethers.parseEther("0.01"),
    initialPrice: ethers.parseEther("0.001"),
    totalSupply: ethers.parseUnits("1000000", 18),
    alpha: -1,
    k: 20,
    beta: ethers.parseUnits("0.1", 18),
    maxPurchaseAmount: ethers.parseUnits("1000000", 18)
}

// --- Test Fixtures ---
async function deployLaunchFixture(config) {
    const [admin, user1, user2, user3, attacker, treasury] = await ethers.getSigners();

    // Deploy UniversalVesting using our helper
    const { proxy: vestingContract } = await deployUUPSProxyFixture(
        "UniversalVesting",
        [],
        { initializer: 'initialize' }
    );

    // Deploy DLPToken using our helper
    const { proxy: tokenContract } = await deployUUPSProxyFixture(
        "DLPToken",
        ["DLPToken", "DLP", admin.address, vestingContract.target],
        { initializer: 'initialize' }
    );

    // Extend config
    config.tokenAddress = tokenContract.target;
    config.vestingContractAddress = vestingContract.target;
    config.treasury = treasury.address;

    // Deploy Launch using our helper
    const { proxy: launchContract } = await deployUUPSProxyFixture(
        "MockLaunch",
        [config],
        { initializer: 'initialize' }
    );

    // Register the token with the vesting contract
    await vestingContract.registerToken(
        tokenContract.target,
        3600,                          // 1 hour minimum cliff
        86400 * 365 * 2               // 2 years maximum duration
    );

    // Make launch contract the token minter
    await tokenContract.setMinter(launchContract.target);

    // Assign VESTING_CREATOR_ROLE to Launch contract
    await vestingContract.grantRole(await vestingContract.VESTING_CREATOR_ROLE(), launchContract.target);

    return {
        launchContract,
        tokenContract,
        vestingContract,
        signers: {
            admin,
            user1,
            user2,
            user3,
            attacker,
            treasury
        },
        launchConfig: config
    };
}

async function deployLaunchFixtureStandard() {
    let result = await deployLaunchFixture(standardConfig);
    return result;
}

async function deployLaunchFixtureComplete() {
    let result = await deployLaunchFixture(standardConfig);

    // Set remaining supply equal to zero
    await result.launchContract.setRemainingSupply(ethers.parseUnits("0", 18));

    return result;
}

async function deployLaunchFixtureNearlyComplete() {
    let result = await deployLaunchFixture(standardConfig);

    // Set remaining supply to one token
    await result.launchContract.setRemainingSupply(ethers.parseUnits("1", 18));

    return result;
}

module.exports = {
    deployLaunchFixture,
    deployLaunchFixtureStandard,
    deployLaunchFixtureComplete,
    deployLaunchFixtureNearlyComplete
};