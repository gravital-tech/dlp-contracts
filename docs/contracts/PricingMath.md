---
title: PricingMath
---

# PricingMath

> PricingLibrary

## Developer Notes

Implements price calculations for the Dispersion Launch Protocol
using PRBMath for enhanced precision and security.

## Functions

### calculateBasePrice

```solidity
function calculateBasePrice(struct PricingMath.PricingConfig config) internal pure returns (uint256)
```

_Calculates the base price based on remaining supply_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct PricingMath.PricingConfig | The pricing configuration |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The base price in WEI per token |

### calculatePremium

```solidity
function calculatePremium(struct PricingMath.PricingConfig config, uint256 amount) internal pure returns (uint256)
```

_Calculates the premium multiplier for a purchase_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct PricingMath.PricingConfig | The pricing configuration |
| amount | uint256 | The number of tokens to purchase |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The premium multiplier (1.0 = no premium) |

### calculateTotalCost

```solidity
function calculateTotalCost(struct PricingMath.PricingConfig config, uint256 amount) internal pure returns (uint256 basePrice, uint256 premium, uint256 baseCost, uint256 finalCost)
```

_Calculates the total cost for a token purchase_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct PricingMath.PricingConfig | The pricing configuration |
| amount | uint256 | The number of tokens to purchase |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| basePrice | uint256 | The base price per token |
| premium | uint256 | The premium multiplier |
| baseCost | uint256 | The cost without premium |
| finalCost | uint256 | The total cost including premium |

### calculateTokensForCurrency

```solidity
function calculateTokensForCurrency(struct PricingMath.PricingConfig config, uint256 currencyAmount) internal pure returns (uint256)
```

_Calculates the number of tokens that can be purchased for a given currency amount_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct PricingMath.PricingConfig | The pricing configuration |
| currencyAmount | uint256 | The amount of pair currency (in wei) to spend |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The maximum number of tokens that can be purchased |

