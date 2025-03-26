const {
    deployUUPSProxyFixture,
} = require("./fixtures");
const { ethers } = require("hardhat");

async function deployDLPTokenFixture() {
    const [admin, minter, user1, user2, user3, attacker, recipient, placeholder] = await ethers.getSigners();

    // Deploy UniversalVesting using our helper
    const { proxy: vestingContract } = await deployUUPSProxyFixture(
        "UnsecureVestingContract",
        [],
        { initializer: 'initialize' }
    );

    // Deploy DLPToken using our helper
    const { proxy: dlpToken } = await deployUUPSProxyFixture(
        "DLPToken",
        ["DLPToken", "DLP", minter.address, vestingContract.target],
        { initializer: 'initialize' }
    );

    return {
        dlpToken,
        vestingContract,
        signers: {
            admin,
            minter,
            user1,
            user2,
            user3,
            attacker,
            recipient,
            placeholder
        }
    };
}

// Fixture to deploy with tokens minted to user1
async function deployWithTokensFixture() {
    const result = await deployDLPTokenFixture();

    // Mint tokens to user1
    await result.dlpToken.connect(result.signers.minter).mint(
        result.signers.user1.address,
        ethers.parseEther("1000")
    );

    return result;
}

async function deployWithTokenRegisteredFixture() {
    const result = await deployDLPTokenFixture();

    await result.dlpToken.connect(result.signers.minter).mint(
        result.signers.placeholder.address,
        ethers.parseEther("1000000")
    );

    // Register DLPToken in Vesting Contract (for proper setup)
    await result.vestingContract.registerToken(result.dlpToken.target, 3600, 86400);

    return result;
}


// Fixture to deploy with vesting active and tokens minted
async function deployWithVestingActiveFixture() {
    const result = await deployWithTokenRegisteredFixture();

    // Grant vesting creator role to admin
    const VESTING_CREATOR_ROLE = await result.vestingContract.VESTING_CREATOR_ROLE();
    await result.vestingContract.grantRole(VESTING_CREATOR_ROLE, result.signers.admin.address);

    return result;
}

async function addVestingSchedule(result, user, startOffset, duration, cliffDuration, totalAmount) {
    result.vesting = result.vesting || {};
    result.vesting[user.address] = result.vesting[user.address] || [];

    // Create a vesting schedule for user that allows some transfers immediately
    const latestBlock = await ethers.provider.getBlock("latest"); // Get the latest block directly
    const timestamp = latestBlock.timestamp;
    const start = timestamp - startOffset;


    await result.vestingContract.connect(result.signers.admin).createVestingSchedule(
        result.dlpToken.target,
        user.address,
        start,
        duration,
        cliffDuration,
        totalAmount
    );

    schedule = {
        currentTime: ethers.toBigInt(timestamp),
        duration: ethers.toBigInt(duration),
        start: ethers.toBigInt(start),
        cliff: ethers.toBigInt(cliffDuration),
        amount: totalAmount
    }

    result.vesting[user.address].push(schedule);

    return result;
}

async function mintTokensAndAddSchedule(result, user, startOffset, duration, cliffDuration, totalAmount) {
    // Mint tokens to user
    await result.dlpToken.connect(result.signers.minter).mint(
        user.address,
        totalAmount
    );

    // Add vesting schedule
    const _result = await addVestingSchedule(result, user, startOffset, duration, cliffDuration, totalAmount);

    return _result;
}

// Fixture to deploy with mock vesting contract
async function deployWithMockVestingFixture() {
    const result = await deployWithTokensFixture();

    // Deploy MockVestingContract
    const MockVestingContract = await ethers.getContractFactory("MockVestingContract");
    const mockVesting = await MockVestingContract.deploy();

    // Update DLPToken to use mock vesting
    await result.dlpToken.connect(result.signers.admin).setVestingContract(mockVesting.target);

    return {
        ...result,
        mockVesting
    };
}

// Create fixtures for different vesting scenarios
async function singleUserVestingWithCliff() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 0, 86400 * 30, 86400, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingWithoutCliff() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 0, 86400 * 30, 0, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingWithCliffInProgress() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 3600, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingWithoutCliffInProgress() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 0, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingComplete() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 9999, 1000, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingNearCompletion() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 11000, 0, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingInTheFuture() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, -10000, 10000, 1000, ethers.parseEther("1000"));
    return result;
}

async function singleUserMutipleSchedulesInProgress() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 100, 10000, 0, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 2, 1000, ethers.parseEther("750"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 11000, 0, ethers.parseEther("800"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 8600 * 10, 8600 * 14, 8600 * 2, ethers.parseEther("1200"));
    return result;
}

async function singleUserMutipleSchedulesMixed() {
    let result = await deployWithVestingActiveFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, -8600 * 5, 8600 * 500, 8600 * 5, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 100000, 700000, 90000, ethers.parseEther("750"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 100000, 700000, 200000, ethers.parseEther("750"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 11000, 0, ethers.parseEther("800"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 8600 * 10, 8600 * 14, 8600 * 2, ethers.parseEther("1200"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 0, 86400, 0, ethers.parseEther("500"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 8600 * 500, 8600 * 1200, 8600 * 20, ethers.parseEther("1106"));

    return result;
}

async function multiUserVestingInProgress() {
    let result = await deployWithVestingActiveFixture();

    result = await mintTokensAndAddSchedule(result, result.signers.user1, 100, 10000, 0, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user2, 86400, 86400 * 2, 1000, ethers.parseEther("2000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user3, 86400 * 10, 86400 * 100, 86400 * 5, ethers.parseEther("1000"));

    return result;
}

async function multiUserMultipleSchedulesInProgress() {
    let result = await deployWithVestingActiveFixture();

    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 3600, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 0, ethers.parseEther("500"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400 * 10, 86400 * 100, 86400 * 5, ethers.parseEther("255"));
    result = await mintTokensAndAddSchedule(result, result.signers.user2, 86400 * 30, 86400 * 100, 0, ethers.parseEther("1021"));
    result = await mintTokensAndAddSchedule(result, result.signers.user2, 0, 86400 * 100, 0, ethers.parseEther("15"));
    result = await mintTokensAndAddSchedule(result, result.signers.user2, 86400 * 30, 86400 * 100, 86400 * 5, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user3, 1, 86400 * 100, 0, ethers.parseEther("888"));
    result = await mintTokensAndAddSchedule(result, result.signers.user3, 0, 86400 * 100, 0, ethers.parseEther("746"));
    return result;
}

// Create fixture groupings
const singleUserInProgressCompleteFixtures = [
    singleUserVestingWithCliffInProgress,
    singleUserVestingWithoutCliffInProgress,
    singleUserVestingNearCompletion,
];


module.exports = {
    deployDLPTokenFixture,
    deployWithTokensFixture,
    deployWithVestingActiveFixture,
    deployWithMockVestingFixture,
    singleUserVestingWithCliff,
    singleUserVestingWithoutCliff,
    singleUserVestingWithCliffInProgress,
    singleUserVestingWithoutCliffInProgress,
    singleUserVestingComplete,
    singleUserVestingNearCompletion,
    singleUserVestingInTheFuture,
    multiUserMultipleSchedulesInProgress,
    multiUserVestingInProgress,
    singleUserInProgressCompleteFixtures,
    singleUserMutipleSchedulesInProgress,
    singleUserMutipleSchedulesMixed
};