const { ethers } = require("hardhat");
const { deployUUPSProxyFixture } = require("./fixtures");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { duration } = require("@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time");

// --- Test Fixtures ---
async function deployVestingContractFixture() {
    const [admin, tokenOwner, user1, user2, user3, attacker, vestingCreator] = await ethers.getSigners();

    // Deploy UniversalVesting using our helper
    const { proxy: vestingContract } = await deployUUPSProxyFixture(
        "UniversalVesting",
        [],
        { initializer: 'initialize' }
    );

    // Deploy a mock token for testing
    const MockToken = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockToken.deploy("MockToken", "MTK");
    await mockToken.waitForDeployment();

    return {
        vestingContract,
        mockToken,
        tokenAddress: await mockToken.getAddress(),
        signers: {
            admin,
            tokenOwner,
            user1,
            user2,
            user3,
            attacker,
            vestingCreator
        }
    };
}

async function deployWithRegisteredTokenFixture() {
    const result = await deployVestingContractFixture();

    await result.mockToken.mint(result.signers.admin.address, ethers.parseEther("1000000"));

    // Register the mock token
    await result.vestingContract.registerToken(
        result.mockToken.target,
        3600,                          // 1 hour minimum cliff
        86400 * 30                    // 30 days maximum duration
    );

    return result;
}

async function deployWithVestingCreatorFixture() {
    const result = await deployWithRegisteredTokenFixture();

    // Grant vesting creator role to vestingCreator
    const VESTING_CREATOR_ROLE = await result.vestingContract.VESTING_CREATOR_ROLE();
    await result.vestingContract.grantRole(VESTING_CREATOR_ROLE, result.signers.vestingCreator.address);

    return result;
}

async function addVestingSchedule(result, user, startOffset, duration, cliffDuration, totalAmount) {
    result.vesting = result.vesting || {};
    result.vesting[user.address] = result.vesting[user.address] || [];

    // Create a vesting schedule for user that allows some transfers immediately
    const now = await time.latest();
    const start = now - startOffset;


    await result.vestingContract.connect(result.signers.vestingCreator).createVestingSchedule(
        result.mockToken.target,
        user.address,
        start,
        duration,
        cliffDuration,
        totalAmount
    );

    schedule = {
        currentTime: ethers.toBigInt(now),
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
    await result.mockToken.mint(
        user.address,
        totalAmount
    );

    // Add vesting schedule
    const _result = await addVestingSchedule(result, user, startOffset, duration, cliffDuration, totalAmount);

    return _result;
}

// Create fixtures for different vesting scenarios
async function singleUserVestingWithCliff() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 0, 86400 * 30, 86400, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingWithoutCliff() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 0, 86400 * 30, 0, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingWithCliffInProgress() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 3600, ethers.parseEther("1000"));
    return result;
}

async function singleUserBeforeCliffEnd() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 86700, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingWithoutCliffInProgress() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 30, 86400 * 2, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingComplete() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 9999, 1000, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingNearCompletion() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 11000, 0, ethers.parseEther("1000"));
    return result;
}

async function singleUserVestingInTheFuture() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, -10000, 10000, 1000, ethers.parseEther("1000"));
    return result;
}

async function singleUserMutipleSchedulesInProgress() {
    let result = await deployWithVestingCreatorFixture();
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 100, 10000, 0, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 86400, 86400 * 2, 1000, ethers.parseEther("750"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 10000, 11000, 0, ethers.parseEther("800"));
    result = await mintTokensAndAddSchedule(result, result.signers.user1, 8600 * 10, 8600 * 14, 8600 * 2, ethers.parseEther("1200"));
    return result;
}

async function singleUserMutipleSchedulesMixed() {
    let result = await deployWithVestingCreatorFixture();
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
    let result = await deployWithVestingCreatorFixture();

    result = await mintTokensAndAddSchedule(result, result.signers.user1, 100, 10000, 0, ethers.parseEther("1000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user2, 86400, 86400 * 2, 1000, ethers.parseEther("2000"));
    result = await mintTokensAndAddSchedule(result, result.signers.user3, 86400 * 10, 86400 * 100, 86400 * 5, ethers.parseEther("1000"));

    return result;
}

async function multiUserMultipleSchedulesInProgress() {
    let result = await deployWithVestingCreatorFixture();

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

async function singleUserStressTest() {
    let result = await deployWithVestingCreatorFixture();

    const now = await time.latest();

    // Define ranges for random values (in seconds)
    const durationRange = { min: 100, max: 86400 * 365 * 5 }; // Up to 5 years
    const cliffRange = { min: 0, max: 86400 * 365 * 2 };      // Up to 2 years
    const startOffsetRange = { min: -86400 * 365 * 0.25, max: 86400 * 365 };      // Up to 1 year
    const amountRange = { min: 1, max: 10000 };                     // Token amounts

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Create 500 random vesting schedules
    for (let i = 0; i < 500; i++) {
        // Generate random parameters
        let startOffset = getRandomInt(startOffsetRange.min, startOffsetRange.max);
        let duration = getRandomInt(durationRange.min, durationRange.max);
        let cliff = getRandomInt(cliffRange.min, cliffRange.max);
        let amount = getRandomInt(amountRange.min, amountRange.max);

        // Ensure end time is not in the past
        let start = now - startOffset;
        let end = start + duration;

        while (end < now + 100) {
            startOffset = getRandomInt(startOffsetRange.min, startOffsetRange.max);
            start = now - startOffset;
            end = start + duration;
        }

        // Ensure cliff is not longer than duration
        while (cliff > duration) {
            cliff = getRandomInt(cliffRange.min, cliffRange.max);
        }

        // Convert amount to string before parsing to ether
        const amountInEther = ethers.parseEther(amount.toString());

        // Add the vesting schedule with the random parameters
        result = await mintTokensAndAddSchedule(
            result,
            result.signers.user1,
            startOffset,
            duration,
            cliff,
            amountInEther
        );
    }

    return result;
}

async function multiUserStressTest() {
    let result = await deployWithVestingCreatorFixture();

    const now = await time.latest();

    // Define ranges for random values (in seconds)
    const durationRange = { min: 100, max: 86400 * 365 * 5 }; // Up to 5 years
    const cliffRange = { min: 0, max: 86400 * 365 * 2 };      // Up to 2 years
    const startOffsetRange = { min: -86400 * 365 * 0.25, max: 86400 * 365 };      // Up to 1 year
    const amountRange = { min: 1, max: 10000 };                     // Token amounts

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const allUsers = [result.signers.user1, result.signers.user2, result.signers.user3];
    const batchSize = 50; // Process 50 schedules at a time for each user

    for (const user of allUsers) {
        // Create 1000 random vesting schedules
        for (let batchStart = 0; batchStart < 1000; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, 1000);
            const batchPromises = [];

            for (let i = batchStart; i < batchEnd; i++) {
                // Generate random parameters
                let startOffset = getRandomInt(startOffsetRange.min, startOffsetRange.max);
                let duration = getRandomInt(durationRange.min, durationRange.max);
                let cliff = getRandomInt(cliffRange.min, cliffRange.max);
                let amount = getRandomInt(amountRange.min, amountRange.max);

                // Ensure end time is not in the past
                let start = now - startOffset;
                let end = start + duration;

                while (end < now + 100) {
                    startOffset = getRandomInt(startOffsetRange.min, startOffsetRange.max);
                    start = now - startOffset;
                    end = start + duration;
                }

                // Ensure cliff is not longer than duration
                while (cliff > duration) {
                    cliff = getRandomInt(cliffRange.min, cliffRange.max);
                }

                // Convert amount to string before parsing to ether
                const amountInEther = ethers.parseEther(amount.toString());

                // Add the vesting schedule with the random parameters
                batchPromises.push(mintTokensAndAddSchedule(
                    result,
                    user,
                    startOffset,
                    duration,
                    cliff,
                    amountInEther
                ));
            }
            // Wait for the current batch to complete
            const batchResults = await Promise.all(batchPromises);
            // Update result with the last result from the batch
            result = batchResults[batchResults.length - 1];
        }

    }

    return result;
}

// Create fixture groupings
const singleUserInProgressCompleteFixtures = [
    singleUserVestingWithCliffInProgress,
    singleUserVestingWithoutCliffInProgress,
    singleUserVestingComplete,
    singleUserVestingNearCompletion,
];

const allVestingFixtures = [
    singleUserVestingWithCliff,
    singleUserVestingWithoutCliff,
    singleUserVestingWithCliffInProgress,
    singleUserBeforeCliffEnd,
    singleUserVestingWithoutCliffInProgress,
    singleUserVestingNearCompletion,
    singleUserVestingInTheFuture,
    multiUserMultipleSchedulesInProgress,
    multiUserVestingInProgress,
    singleUserMutipleSchedulesInProgress,
    singleUserMutipleSchedulesMixed
]

const outlierVestingFixtures = [
    singleUserVestingComplete,

]

module.exports = {
    deployVestingContractFixture,
    deployWithRegisteredTokenFixture,
    deployWithVestingCreatorFixture,
    singleUserVestingWithCliff,
    singleUserVestingWithoutCliff,
    singleUserVestingWithCliffInProgress,
    singleUserBeforeCliffEnd,
    singleUserVestingWithoutCliffInProgress,
    singleUserVestingComplete,
    singleUserVestingNearCompletion,
    singleUserVestingInTheFuture,
    singleUserStressTest,
    multiUserMultipleSchedulesInProgress,
    multiUserVestingInProgress,
    multiUserStressTest,
    singleUserInProgressCompleteFixtures,
    singleUserMutipleSchedulesInProgress,
    singleUserMutipleSchedulesMixed,
    allVestingFixtures
};