// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {SD59x18, sd} from "@prb/math/src/SD59x18.sol";
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";

/**
 * @title PricingLibrary
 * @dev Implements price calculations for the Dispersion Launch Protocol
 * using PRBMath for enhanced precision and security.
 */
library PricingMath {
    // Configuration struct for all pricing parameters
    struct PricingConfig {
        uint256 initialPrice; // Initial token price in WEI
        uint256 totalSupply; // Total tokens for distribution
        uint256 remainingSupply; // Current tokens remaining
        int256 alphaParameter; // Supply curve exponent (can be negative)
        uint256 premiumIntensityK; // Premium intensity parameter
        uint256 betaParameter; // 0-100e18 representing 0%-100%
    }

    /**
     * @dev Calculates the base price based on remaining supply
     * @param config The pricing configuration
     * @return The base price in WEI per token
     */
    function calculateBasePrice(
        PricingConfig memory config
    ) internal pure returns (uint256) {
        // Handle edge cases
        if (config.totalSupply == 0) {
            revert("Total supply cannot be zero");
        }

        if (config.remainingSupply == 0) {
            revert("Remaining supply cannot be zero");
        }

        // Convert values to PRBMath types
        UD60x18 initialPrice = ud(config.initialPrice);
        UD60x18 remainingSupply = ud(config.remainingSupply);
        UD60x18 totalSupply = ud(config.totalSupply);

        // Calculate supply ratio
        UD60x18 supplyRatio = remainingSupply.div(totalSupply);

        // Handle different alpha values
        if (config.alphaParameter < 0) {
            // For negative alpha, price increases as supply decreases
            SD59x18 negAlpha = sd(int256(-config.alphaParameter * 1e18));

            // Power calculation with negative exponent: initialPrice * (supplyRatio)^(-alpha)
            // For negative alpha, we do (1/supplyRatio)^|alpha|
            UD60x18 inverseRatio = ud(1e18).div(supplyRatio);
            UD60x18 result = initialPrice.mul(
                inverseRatio.pow(ud(uint256(negAlpha.unwrap())))
            );

            return result.unwrap();
        } else {
            // For positive/zero alpha, price decreases as supply decreases
            SD59x18 posAlpha = sd(int256(config.alphaParameter * 1e18));

            // Power calculation: initialPrice * (supplyRatio)^alpha
            UD60x18 result = initialPrice.mul(
                supplyRatio.pow(ud(uint256(posAlpha.unwrap())))
            );

            return result.unwrap();
        }
    }

    /**
     * @dev Calculates the premium multiplier for a purchase
     * @param config The pricing configuration
     * @param amount The number of tokens to purchase
     * @return The premium multiplier (1.0 = no premium)
     */
    function calculatePremium(
        PricingConfig memory config,
        uint256 amount
    ) internal pure returns (uint256) {
        // Handle edge cases
        if (
            amount == 0 ||
            config.remainingSupply == 0 ||
            config.premiumIntensityK == 0
        ) {
            return 1e18; // No premium
        }

        // Convert values to PRBMath types
        UD60x18 amountUD = ud(amount);
        UD60x18 remainingSupply = ud(config.remainingSupply);
        UD60x18 totalSupply = ud(config.totalSupply);
        UD60x18 betaParameter = ud(config.betaParameter);
        UD60x18 hundredUD = ud(100e18);

        // Calculate effective supply denominator
        UD60x18 remainingPart = remainingSupply.mul(
            betaParameter.div(hundredUD)
        );
        UD60x18 totalPart = totalSupply.mul(
            hundredUD.sub(betaParameter).div(hundredUD)
        );
        UD60x18 effectiveSupply = remainingPart.add(totalPart);

        // Calculate ratio: amount / effectiveSupply
        UD60x18 ratio = amountUD.div(effectiveSupply);

        // Calculate k * ratio
        UD60x18 kUD = ud(config.premiumIntensityK * 1e18);
        UD60x18 kTimesRatio = kUD.mul(ratio);

        // Calculate exp(k * ratio)
        UD60x18 expTerm = kTimesRatio.exp();

        // Return the unwrapped value
        return expTerm.unwrap();
    }

    /**
     * @dev Calculates the total cost for a token purchase
     * @param config The pricing configuration
     * @param amount The number of tokens to purchase
     * @return basePrice The base price per token
     * @return premium The premium multiplier
     * @return baseCost The cost without premium
     * @return finalCost The total cost including premium
     */
    function calculateTotalCost(
        PricingConfig memory config,
        uint256 amount
    )
        internal
        pure
        returns (
            uint256 basePrice,
            uint256 premium,
            uint256 baseCost,
            uint256 finalCost
        )
    {
        // Handle zero amount
        if (amount == 0) {
            return (0, 1e18, 0, 0);
        }

        // Calculate price components
        basePrice = calculateBasePrice(config);
        premium = calculatePremium(config, amount);

        // Convert to PRBMath types for calculations
        UD60x18 basePriceUD = ud(basePrice);
        UD60x18 premiumUD = ud(premium);
        UD60x18 amountUD = ud(amount);

        // Calculate costs
        UD60x18 baseCostUD = basePriceUD.mul(amountUD);
        UD60x18 finalCostUD = baseCostUD.mul(premiumUD).div(ud(1e18));

        // Convert back to uint256
        baseCost = baseCostUD.unwrap();
        finalCost = finalCostUD.unwrap();

        return (basePrice, premium, baseCost, finalCost);
    }

    /**
     * @dev Calculates the number of tokens that can be purchased for a given currency amount
     * @param config The pricing configuration
     * @param currencyAmount The amount of pair currency (in wei) to spend
     * @return The maximum number of tokens that can be purchased
     */
    function calculateTokensForCurrency(
        PricingConfig memory config,
        uint256 currencyAmount
    ) internal pure returns (uint256) {
        if (currencyAmount == 0) {
            return 0;
        }

        uint256 low = 0;
        uint256 high = config.remainingSupply;

        while (low < high) {
            uint256 mid = low + (high - low + 1) / 2;
            (, , , uint256 cost) = calculateTotalCost(config, mid);
            if (cost <= currencyAmount) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }

        return low;
    }
}
