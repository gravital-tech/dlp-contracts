const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const fixtures = require("./utils/fixtures-e2e");

describe("DLP System - Token Vesting E2E Tests", function () {
    describe("Vesting Schedule Creation", function () {
        it("should create vesting schedules with appropriate parameters", async function () {
            const { launchContract, vestingContract, tokenContract, signers } = await loadFixture(fixtures.deployWithPurchasesFixture);
            const { user1 } = signers;

            // Get user1's schedules
            const schedules = await vestingContract.getUserVestingSchedules(
                tokenContract.target,
                user1.address
            );

            // Verify schedule parameters
            expect(schedules.length).to.be.gt(0);
            expect(schedules[0].token).to.equal(tokenContract.target);
            expect(schedules[0].user).to.equal(user1.address);
            expect(schedules[0].totalAmount).to.be.gt(0);
            expect(schedules[0].transferredAmount).to.equal(0);

            // Verify timing parameters
            expect(schedules[0].startTime).to.be.lte(await ethers.provider.getBlock("latest").then(b => b.timestamp));
            expect(schedules[0].endTime).to.be.gt(schedules[0].startTime);
        });

        it("should calculate vesting duration based on remaining supply", async function () {
            const { launchContract, vestingContract, tokenContract, signers, config } = await loadFixture(fixtures.deployWithPurchasesFixture);
            const { user1, user4 } = signers;

            // Get vesting config to determine min/max durations
            const vestingConfig = await vestingContract.getVestingConfig();
            const dMin = vestingConfig.dMin;
            const dMax = vestingConfig.dMax;

            // Calculate current remaining supply ratio
            const remainingSupply = await launchContract.getRemainingSupply();
            const supplyRatio = Number(remainingSupply) / Number(config.totalSupply);

            // Calculate expected duration using the same formula as the contract
            const expectedDuration = Number(dMin) + (Number(dMax) - Number(dMin)) * supplyRatio;

            // Make a new purchase and check vesting duration
            await launchContract.connect(user4).purchaseTokens(
                ethers.parseUnits("1000", 18),
                { value: ethers.parseEther("5") }
            );

            // Get actual duration from the schedule
            const schedules = await vestingContract.getUserVestingSchedules(
                tokenContract.target,
                user4.address
            );
            const actualDuration = Number(schedules[0].endTime - schedules[0].startTime);

            // Verify duration is within acceptable range (allowing for slight difference due to block timing)
            expect(Math.abs(actualDuration - expectedDuration) / expectedDuration).to.be.lt(0.001); // Within .1%
        });
    });

    describe("Multiple Vesting Schedules", function () {
        it("should handle multiple vesting schedules for a single user", async function () {
            const { vestingContract, tokenContract, signers } = await loadFixture(fixtures.deployMultipleSchedulesFixture);
            const { user1 } = signers;

            // Get all schedules
            const schedules = await vestingContract.getUserVestingSchedules(
                tokenContract.target,
                user1.address
            );

            // Verify multiple schedules created
            expect(schedules.length).to.equal(10);

            // Each schedule should have a unique ID
            const scheduleIds = schedules.map(s => s.id);
            const uniqueIds = [...new Set(scheduleIds)];
            expect(uniqueIds.length).to.equal(10);

            // Total amount should be 1000 tokens (10 purchases of 100 tokens)
            const totalVestingAmount = schedules.reduce((acc, s) => acc + BigInt(s.totalAmount), 0n);
            expect(totalVestingAmount).to.equal(ethers.parseUnits("1000", 18));
        });

        it("should calculate total vested amount across all schedules", async function () {
            const { vestingContract, signers, config } = await loadFixture(fixtures.deployMultipleSchedulesFixture);
            const { user1 } = signers;

            // Initially nothing should be vested (still in cliff period)
            // Or a small amount might be vested if there's no cliff
            const initialVested = await vestingContract.getVestedAmountForUser(user1.address, 0);

            // Advance time by 30 days
            await fixtures.advanceTimeForVesting(86400 * 30);

            // More tokens should be vested now
            const vestedAfter30Days = await vestingContract.getVestedAmountForUser(user1.address, 0);

            // Vested amount should increase
            expect(vestedAfter30Days).to.be.gt(initialVested);

            // Advance time to complete vesting
            await fixtures.advanceTimeForVesting(86400 * 365 * 2);

            // All tokens should be vested now
            const fullyVested = await vestingContract.getVestedAmountForUser(user1.address, 0);
            expect(fullyVested).to.equal(ethers.parseUnits("1000", 18));
        });
    });

    describe("Token Transfer with Vesting", function () {
        it("should correctly track transferred amounts in vesting schedules", async function () {
            const { vestingContract, tokenContract, signers } = await loadFixture(fixtures.deployWithPartialVestingFixture);
            const { user1, user4 } = signers;

            // Get vested amount
            const vestedAmount = await vestingContract.getVestedAmountForUser(user1.address, 0);

            // Only transfer half of vested amount
            const transferAmount = vestedAmount / 2n;

            // Transfer tokens
            await tokenContract.connect(user1).transfer(user4.address, transferAmount);

            // Get schedules after transfer
            const schedules = await vestingContract.getUserVestingSchedules(
                tokenContract.target,
                user1.address
            );

            // Verify transferred amount is tracked
            const totalTransferred = schedules.reduce((acc, s) => acc + BigInt(s.transferredAmount), 0n);
            expect(totalTransferred).to.equal(transferAmount);

            // Available vested amount should be reduced
            const remainingVested = await vestingContract.getVestedAmountForUser(user1.address, 0);
            expect(remainingVested).to.be.approximately(vestedAmount - transferAmount, remainingVested / 10000n); //Allow for some rounding due to block times
        });

        it("should allow transfers of fully vested tokens", async function () {
            const { tokenContract, signers } = await loadFixture(fixtures.deployCompletedVestingFixture);

            // Get full balance
            const fullBalance = await tokenContract.balanceOf(signers.user1.address);

            // Transfer all tokens
            await expect(
                tokenContract.connect(signers.user1).transfer(signers.user4.address, fullBalance)
            ).to.not.be.reverted;

            // Verify balances
            expect(await tokenContract.balanceOf(signers.user1.address)).to.equal(0);
            expect(await tokenContract.balanceOf(signers.user4.address)).to.equal(fullBalance);
        });

        it("should update vesting record when transferring from multiple schedules", async function () {
            const { vestingContract, tokenContract, signers } = await loadFixture(fixtures.deployMultipleSchedulesFixture);

            // Advance time to vest some tokens
            await fixtures.advanceTimeForVesting(86400 * 90); // 90 days

            // Get vested amount
            const vestedAmount = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);

            // Transfer all vested tokens
            await tokenContract.connect(signers.user1).transfer(signers.user4.address, vestedAmount);

            // Get schedules after transfer
            const schedules = await vestingContract.getUserVestingSchedules(
                tokenContract.target,
                signers.user1.address
            );

            // Verify transferred amount is tracked across schedules
            const totalTransferred = schedules.reduce((acc, s) => acc + BigInt(s.transferredAmount), 0n);
            expect(totalTransferred).to.equal(vestedAmount);

            // Remaining vested amount should be close to zero
            const remainingVested = await vestingContract.getVestedAmountForUser(signers.user1.address, 0);
            expect(remainingVested).to.be.lt(ethers.parseUnits("1", 15)); // Less than 0.001 tokens due to potential rounding
        });
    });
});