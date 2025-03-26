// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DLPToken} from "../DLPToken.sol";

contract MockDLPToken is DLPToken {
    bool public allow;

    function isTransferAllowed(
        address sender,
        uint256 amount
    ) internal view override returns (bool) {
        return allow;
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Vesting check only applies to transfers (from and to are not address(0))
        if (from != address(0) && to != address(0) && isVestingActive) {
            if (!isTransferAllowed(from, value)) {
                revert TokensNotVested();
            }
            super._update(from, to, value); // Call parent function for the actual transfer/mint/burn logic
        } else {
            super._update(from, to, value); // Call parent function for the actual transfer/mint/burn logic
        }
    }

    function setAllow(bool _allow) public {
        allow = _allow;
    }
}
