// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Launch} from "../Launch.sol";
import {PricingMath} from "../lib/PricingMath.sol";

contract MockLaunchV2 is Launch {
    string public version;
    uint256[50] private __gap_v2;

    function setConfig(PricingMath.PricingConfig calldata config) public {
        pricingConfig = config;
    }

    function setRemainingSupply(uint256 remainingSupply) public {
        pricingConfig.remainingSupply = remainingSupply;
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
