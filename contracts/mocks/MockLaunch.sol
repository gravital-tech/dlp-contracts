// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Launch} from "../Launch.sol";
import {PricingMath} from "../lib/PricingMath.sol";

contract MockLaunch is Launch {
    function setConfig(PricingMath.PricingConfig calldata config) public {
        pricingConfig = config;
    }

    function setRemainingSupply(uint256 remainingSupply) public {
        pricingConfig.remainingSupply = remainingSupply;
    }
}
