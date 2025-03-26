// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../UniversalVesting.sol";

contract UniversalVestingContractV2 is UniversalVesting {
    string public version;
    uint256[50] private __gap_v2;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Constructor should remain empty
    }

    /**
     * @dev Original initialize function, kept for compatibility.
     * This will likely never be called after initial deployment.
     */
    function initialize() public override initializer {
        super.initialize();
        version = "V2";
    }

    /**
     * @dev V2-specific initializer for upgrades.
     * This should be called during the upgrade process.
     */
    function initializeV2() public reinitializer(2) {
        // Set V2-specific state
        version = "V2";
    }

    function getVersion() public view returns (string memory) {
        return version;
    }
}
