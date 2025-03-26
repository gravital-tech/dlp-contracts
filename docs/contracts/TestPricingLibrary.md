---
title: TestPricingLibrary
---

# TestPricingLibrary

> TestPricingLibrary

## Developer Notes

Test wrapper to expose PricingMath functions for testing

## Functions

### calculateBasePrice

```solidity
function calculateBasePrice(struct PricingMath.PricingConfig config) public pure returns (uint256)
```

_Exposes calculateBasePrice function for testing_

### calculatePremium

```solidity
function calculatePremium(struct PricingMath.PricingConfig config, uint256 amount) public pure returns (uint256)
```

_Exposes calculatePremium function for testing_

### exponentialApprox

```solidity
function exponentialApprox(uint256 x) public pure returns (uint256)
```

_Exposes exponential approximation using PRBMath_

### calculateTotalCost

```solidity
function calculateTotalCost(struct PricingMath.PricingConfig config, uint256 amount) public pure returns (uint256, uint256, uint256, uint256)
```

_Exposes calculateTotalCost function for testing_

### calculateTokensForCurrency

```solidity
function calculateTokensForCurrency(struct PricingMath.PricingConfig config, uint256 currencyAmount) public pure returns (uint256)
```

