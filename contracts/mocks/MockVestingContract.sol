// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockVestingContract {
    event TransferRecorded(address sender, address token, uint256 amount);
    bool public isTransferAllowedOverride; // Public state var to control isTransferAllowed return

    constructor() {
        isTransferAllowedOverride = true; // Default to allow transfers in mock
    }

    function isTransferAllowed(
        address sender,
        uint256 amount,
        address token
    ) external view returns (bool) {
        return isTransferAllowedOverride; // Return the override value, controllable in tests
    }

    function recordTransfer(
        address sender,
        uint256 amount,
        address token
    ) external {
        emit TransferRecorded(sender, token, amount); // Emit event to track recordTransfer calls in tests
    }

    function setAllow(bool _allow) external {
        isTransferAllowedOverride = _allow; // Set the override value, controllable in tests
    }

    function setTransferAllowedOverride(bool _override) external {
        // Admin function to set override value, if needed
        isTransferAllowedOverride = _override;
    }
}
