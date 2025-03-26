// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {SD59x18, sd} from "@prb/math/src/SD59x18.sol";
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";
import "../lib/PricingMath.sol";

/**
 * @title TestPricingLibrary
 * @dev Test wrapper to expose PricingMath functions for testing
 */
contract TestPricingLibrary {
    /**
     * @dev Exposes calculateBasePrice function for testing
     */
    function calculateBasePrice(
        PricingMath.PricingConfig memory config
    ) public pure returns (uint256) {
        return PricingMath.calculateBasePrice(config);
    }

    /**
     * @dev Exposes calculatePremium function for testing
     */
    function calculatePremium(
        PricingMath.PricingConfig memory config,
        uint256 amount
    ) public pure returns (uint256) {
        return PricingMath.calculatePremium(config, amount);
    }

    /**
     * @dev Exposes exponential approximation using PRBMath
     */
    function exponentialApprox(uint256 x) public pure returns (uint256) {
        // Convert to PRBMath type
        UD60x18 xUD = ud(x);
        // Use PRBMath exp function
        return xUD.exp().unwrap();
    }

    /**
     * @dev Exposes calculateTotalCost function for testing
     */
    function calculateTotalCost(
        PricingMath.PricingConfig memory config,
        uint256 amount
    ) public pure returns (uint256, uint256, uint256, uint256) {
        return PricingMath.calculateTotalCost(config, amount);
    }

    function calculateTokensForCurrency(
        PricingMath.PricingConfig memory config,
        uint256 currencyAmount
    ) public pure returns (uint256) {
        return PricingMath.calculateTokensForCurrency(config, currencyAmount);
    }
}
