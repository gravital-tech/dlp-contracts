const { expect } = require('chai');
const { ethers } = require('hardhat');

function getLinearVestingAmount(vesting, atTimestamp = null) {
    const cliffEnd = vesting.start + vesting.cliff;
    const vestingDuration = vesting.duration - vesting.cliff;

    if (!atTimestamp) {
        atTimestamp = vesting.currentTime;
    } else {
        atTimestamp = ethers.toBigInt(atTimestamp);
    };

    const elapsed = (atTimestamp - cliffEnd) > 0 ? (atTimestamp - cliffEnd) : ethers.toBigInt(0);
    let vestedAmount = (elapsed * vesting.amount) / vestingDuration;
    if (vestedAmount > vesting.amount) {
        vestedAmount = vesting.amount;
    }
    expect(cliffEnd).to.be.gte(vesting.start);
    expect(vestingDuration).to.be.lte(vesting.duration);
    expect(elapsed).to.be.gte(ethers.toBigInt(0));
    expect(vestedAmount).to.be.lte(vesting.amount);
    expect(vestedAmount).to.be.gte(ethers.toBigInt(0));

    return vestedAmount;
}

function getLinearVestingAmountFromSchedules(schedules, atTimestamp = null) {
    let totalVestedAmount = ethers.toBigInt(0);
    let totalAmount = ethers.toBigInt(0);
    for (const schedule of schedules) {
        totalVestedAmount += getLinearVestingAmount(schedule, atTimestamp);
        totalAmount += schedule.amount;
    }
    expect(totalVestedAmount).to.be.lte(totalAmount);

    return { totalVestedAmount, totalAmount };
}

function getTolerance(vesting) {
    const vestingDuration = vesting.duration - vesting.cliff;

    // Provide a 10 second tolerance
    const tolerance = ethers.toBigInt(10) * ethers.toBigInt(100000000); // 10 seconds in appropriate unit
    const tolerancePercentage = tolerance / vestingDuration;

    expect(vestingDuration).to.be.gte(ethers.toBigInt(0));
    expect(tolerancePercentage).to.be.gt(ethers.toBigInt(0));
    expect(tolerancePercentage).to.be.lte(ethers.toBigInt(100000000));
    const calculatedTolerance = (vesting.amount * tolerancePercentage) / ethers.toBigInt(100000000);

    expect(calculatedTolerance).to.be.lte(vesting.amount);
    return calculatedTolerance;
}

function getToleranceFromSchedules(schedules) {
    let totalAmount = ethers.toBigInt(0);
    for (const schedule of schedules) {
        totalAmount += schedule.amount;
    }

    // Take a weigted average of the tolerances
    let tolerance = ethers.toBigInt(0);
    for (let i = 0; i < schedules.length; i++) {
        tolerance += getTolerance(schedules[i]) * schedules[i].amount;
    }
    const averageTolerance = tolerance / totalAmount;

    return averageTolerance;
}

module.exports = { getLinearVestingAmount, getLinearVestingAmountFromSchedules, getTolerance, getToleranceFromSchedules };