const { ethers } = require("hardhat");
const { time, setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const { deployUUPSProxyFixture } = require("./fixtures");
const { config } = require("dotenv");

// --- Standard Configuration ---
const standardConfig = {
    txnFee: ethers.parseEther("0.01"),
    initialPrice: ethers.parseEther("0.001"),
    totalSupply: ethers.parseUnits("1000000", 18),
    mintCap: ethers.parseUnits("1200000", 18),
    alpha: -1,
    k: 20,
    beta: ethers.parseUnits("50", 16), // 0.5 in 1e18 format
    maxPurchaseAmount: ethers.parseUnits("100000", 18)
};

// --- End-to-End Test Fixtures ---

/**
 * Deploy all three contracts with proper configuration for end-to-end testing
 */
async function deployE2EFixture() {
    const [admin, user1, user2, user3, user4, treasury] = await ethers.getSigners();

    // Deploy UniversalVesting
    const { proxy: vestingContract } = await deployUUPSProxyFixture(
        "UniversalVesting",
        [],
        { initializer: 'initialize' }
    );

    // Deploy DLPToken
    const { proxy: tokenContract } = await deployUUPSProxyFixture(
        "DLPToken",
        ["Dispersion Launch Protocol Token", "DLP", admin.address, vestingContract.target],
        { initializer: 'initialize' }
    );

    // Extend config
    standardConfig.tokenAddress = tokenContract.target;
    standardConfig.vestingContractAddress = vestingContract.target;
    standardConfig.treasury = treasury.address;

    // Deploy Launch
    const { proxy: launchContract } = await deployUUPSProxyFixture(
        "Launch",
        [standardConfig],
        { initializer: 'initialize' }
    );

    // Register token with vesting contract
    await vestingContract.registerToken(
        tokenContract.target,
        3600,                // 1 hour minimum vesting
        86400 * 365 * 2         // 2 year maximum vesting
    );

    // Set up DLPToken with Launch as minter
    await tokenContract.setMinter(launchContract.target);

    // Grant VESTING_CREATOR_ROLE to Launch contract
    const VESTING_CREATOR_ROLE = await vestingContract.VESTING_CREATOR_ROLE();
    await vestingContract.grantRole(VESTING_CREATOR_ROLE, launchContract.target);

    return {
        launchContract,
        tokenContract,
        vestingContract,
        config: standardConfig,
        signers: {
            admin,
            user1,
            user2,
            user3,
            user4,
            treasury
        }
    };
}

/**
 * Fixture that starts in distribution phase
 */
async function deployDistributionPhaseFixture() {
    const result = await deployE2EFixture();

    // Start distribution phase
    await result.launchContract.startDistribution();

    return result;
}

/**
 * Fixture with multiple users who have already purchased tokens
 */
async function deployWithPurchasesFixture() {
    const result = await deployDistributionPhaseFixture();
    const { user1, user2, user3 } = result.signers;

    // User1 buys 1000 tokens
    await result.launchContract.connect(user1).purchaseTokens(
        ethers.parseUnits("1000", 18),
        { value: ethers.parseEther("2") } // More than enough to cover cost + fee
    );

    // User2 buys 5000 tokens
    await result.launchContract.connect(user2).purchaseTokens(
        ethers.parseUnits("5000", 18),
        { value: ethers.parseEther("10") }
    );

    // User3 buys using ETH directly
    await result.launchContract.connect(user3).purchaseTokensWithETH({
        value: ethers.parseEther("5")
    });

    return result;
}

/**
 * Fixture with system in AMM phase after some purchases
 */
async function deployAMMPhaseFixture() {
    const result = await deployWithPurchasesFixture();

    // Move to AMM phase
    await result.launchContract.moveToAMMPhase();

    return result;
}

/**
 * Fixture with system in final Market phase
 */
async function deployMarketPhaseFixture() {
    const result = await deployAMMPhaseFixture();

    // Move to Market phase
    await result.launchContract.moveToMarketPhase();

    return result;
}

/**
 * Fixture with partial vesting completed
 */
async function deployWithPartialVestingFixture() {
    const result = await deployWithPurchasesFixture();

    // Skip 30 days to allow some vesting to occur
    await time.increase(86400 * 30 * 4);

    return result;
}

/**
 * Fixture with nearly complete token distribution (low remaining supply)
 */
async function deployLowSupplyFixture() {
    const result = await deployDistributionPhaseFixture();
    const { admin, user1 } = result.signers;

    // Set a higher max purchase amount temporarily
    await result.launchContract.setMaxPurchaseAmount(result.config.totalSupply);

    const batchPurchaseSize = ethers.parseUnits("10000", 18)

    let remainingSupply = await result.launchContract.getRemainingSupply()
    let nextPurchaseSize = batchPurchaseSize;
    const targetSupply = result.config.totalSupply / 100n // 1% of supply

    let _e = await result.launchContract.previewPurchaseWithETH(nextPurchaseSize);

    // Make many large purchases (to reduce remaining supply)
    while (remainingSupply > targetSupply) {
        // Mint user the appropriate amount of eth
        await setBalance(user1.address, nextPurchaseSize * 2n);

        await result.launchContract.connect(user1).purchaseTokensWithETH({
            value: nextPurchaseSize
        });

        const newRemainingSupply = await result.launchContract.getRemainingSupply();

        if (newRemainingSupply <= targetSupply) {
            break;
        }

        remainingSupply = newRemainingSupply;

        // Determine how much is needed to deplete supply to target
        const preview = await result.launchContract.calculateTotalCost(remainingSupply - targetSupply);

        if (preview.totalCostWithFee < nextPurchaseSize) {
            nextPurchaseSize = preview.totalCostWithFee * 101n / 100n;
        }
    }

    // Reset max purchase amount
    await result.launchContract.setMaxPurchaseAmount(result.config.maxPurchaseAmount);

    return result;
}

/**
 * Fixture with multiple small purchases to create many vesting schedules
 */
async function deployMultipleSchedulesFixture() {
    const result = await deployDistributionPhaseFixture();
    const { user1 } = result.signers;

    // Make 10 small purchases
    for (let i = 0; i < 10; i++) {
        await result.launchContract.connect(user1).purchaseTokens(
            ethers.parseUnits("100", 18),
            { value: ethers.parseEther("1") }
        );
    }

    return result;
}

/**
 * Fixture with an emergency paused system
 */
async function deployPausedSystemFixture() {
    const result = await deployWithPurchasesFixture();

    // Pause the system
    await result.launchContract.pause();

    return result;
}

/**
 * Fixture with updated price parameters
 */
async function deployWithUpdatedPriceParamsFixture() {
    const result = await deployDistributionPhaseFixture();

    // Update price parameters for higher premium and steeper curve
    await result.launchContract.updatePriceParameters(
        -2, // Alpha (steeper curve)
        30, // K (higher premium intensity)
        ethers.parseUnits("70", 16) // Beta (0.7 in 1e18 format)
    );

    return result;
}

/**
 * Fixture with completed vesting schedules
 */
async function deployCompletedVestingFixture() {
    const result = await deployWithPurchasesFixture();

    // Fast forward 1 year to complete all vesting
    await time.increase(86400 * 365 * 2);

    return result;
}

// Helper functions
async function advanceTimeForVesting(seconds) {
    await time.increase(seconds);
}

// Export fixtures and helpers
module.exports = {
    standardConfig,
    deployE2EFixture,
    deployDistributionPhaseFixture,
    deployWithPurchasesFixture,
    deployAMMPhaseFixture,
    deployMarketPhaseFixture,
    deployWithPartialVestingFixture,
    deployLowSupplyFixture,
    deployMultipleSchedulesFixture,
    deployPausedSystemFixture,
    deployWithUpdatedPriceParamsFixture,
    deployCompletedVestingFixture,
    advanceTimeForVesting
};