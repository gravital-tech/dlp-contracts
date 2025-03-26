// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {UniversalVesting} from "../UniversalVesting.sol";

contract UnsecureVestingContract is UniversalVesting {
    function createVestingSchedule(
        address _token,
        address _user,
        uint256 _startTime,
        uint256 _duration,
        uint256 _cliffDuration,
        uint256 _totalAmount
    ) external override whenNotPaused onlyRole(VESTING_CREATOR_ROLE) {
        VestingSchedule memory newSchedule = VestingSchedule({
            id: nextScheduleId,
            user: _user,
            token: _token,
            startTime: _startTime,
            endTime: _startTime + _duration,
            cliffEndTime: _startTime + _cliffDuration,
            totalAmount: _totalAmount,
            transferredAmount: 0 // Initialize transferred amount to 0
        });

        userVestingSchedules[_user].push(newSchedule);
        vestingSchedulesById[nextScheduleId] = newSchedule;

        // Emit event for Vesting Schedule Creation (for off-chain tracking)
        emit VestingScheduleCreated(
            _token,
            _user,
            nextScheduleId,
            _startTime,
            _duration,
            _cliffDuration,
            _totalAmount
        );

        nextScheduleId++;
    }
}
