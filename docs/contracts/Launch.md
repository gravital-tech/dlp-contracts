---
title: Launch
---

# Launch

> DLPLaunch

## Developer Notes

Main contract implementing the Dispersion Launch Protocol distribution
with supply-based pricing, exponential premiums, and vesting.

## Functions

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(struct Launch.LaunchConfig config) public
```

This function replaces the original initialize function to avoid stack too deep errors

_Initializer for Launch contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct Launch.LaunchConfig | The launch configuration struct containing all initialization parameters |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address newImplementation) internal
```

_Required by UUPSUpgradeable, restricts upgrade ability to admin_

### getBasePrice

```solidity
function getBasePrice() public view returns (uint256)
```

_Gets the current base price based on remaining supply_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Current base price in WEI per token |

### calculatePremium

```solidity
function calculatePremium(uint256 amount) public view returns (uint256)
```

_Calculates the premium multiplier for a purchase amount_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Number of tokens to purchase |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Premium multiplier (1e18 = 1.0) |

### calculatePurchaseCost

```solidity
function calculatePurchaseCost(uint256 amount) public view returns (uint256 basePrice, uint256 premium, uint256 baseCost, uint256 finalCost)
```

_Calculates the final cost for a token purchase_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Number of tokens to purchase |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| basePrice | uint256 | Base price per token |
| premium | uint256 | Premium multiplier |
| baseCost | uint256 | Base cost (without premium) |
| finalCost | uint256 | Final cost including premium |

### calculateTotalCost

```solidity
function calculateTotalCost(uint256 amount) public view returns (uint256 totalCost, uint256 totalCostWithFee)
```

_Calculates the final cost including transaction fee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Number of tokens to purchase |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalCost | uint256 | Total cost including premium |
| totalCostWithFee | uint256 | Total cost including premium and transaction fee |

### calculateTokensForETH

```solidity
function calculateTokensForETH(uint256 ethAmount) public view returns (uint256 tokenAmount)
```

_Calculates how many tokens can be purchased with a given amount of ETH_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| ethAmount | uint256 | Amount of ETH in WEI |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | Maximum number of tokens purchasable |

### calculateVestingDuration

```solidity
function calculateVestingDuration() public view returns (uint256)
```

_Calculates vesting duration based on current remaining supply_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Duration in seconds |

### purchaseTokens

```solidity
function purchaseTokens(uint256 tokenAmount) external payable
```

_Allows a user to purchase tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | Number of tokens to purchase |

### purchaseTokensWithETH

```solidity
function purchaseTokensWithETH() external payable
```

_Allows a user to purchase tokens by specifying ETH amount rather than token amount
The contract will calculate the maximum number of tokens purchasable with the provided ETH_

### _purchaseTokensWithETH

```solidity
function _purchaseTokensWithETH(address buyer, uint256 value) internal
```

### startDistribution

```solidity
function startDistribution() external
```

_Starts the distribution phase_

### moveToAMMPhase

```solidity
function moveToAMMPhase() external
```

_Moves to the AMM bootstrap phase_

### moveToMarketPhase

```solidity
function moveToMarketPhase() external
```

_Moves to the market phase_

### updatePriceParameters

```solidity
function updatePriceParameters(int256 _alpha, uint256 _k, uint256 _beta) external
```

_Updates pricing parameters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _alpha | int256 | Alpha parameter for base price calculation (must be between -10 and 0) |
| _k | uint256 | Premium intensity parameter (higher values create steeper premiums) |
| _beta | uint256 | Beta parameter (0-100e18) controlling supply sensitivity |

### setMaxPurchaseAmount

```solidity
function setMaxPurchaseAmount(uint256 _maxPurchaseAmount) external
```

_Updates the maximum purchase amount_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maxPurchaseAmount | uint256 | New maximum purchase amount |

### setTreasury

```solidity
function setTreasury(address _treasury) external
```

_Updates the treasury address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _treasury | address | New treasury address |

### setTransactionFee

```solidity
function setTransactionFee(uint256 _fee) external
```

_Updates the transaction fee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _fee | uint256 | New treasury address |

### updateMintCap

```solidity
function updateMintCap(uint256 _newMintCap) external
```

_Allows admin to update the mint cap if needed
Can only increase the cap, not decrease it_

### adminMint

```solidity
function adminMint(address _to, uint256 _amount) external
```

_Allows minting tokens for purposes outside the distribution
(e.g., team allocation, treasury, etc.)_

### pause

```solidity
function pause() external
```

Pauses token purchases in emergency situations

_Can only be called by accounts with EMERGENCY_ROLE_

### unpause

```solidity
function unpause() external
```

_Unpauses token purchases_

### recoverERC20

```solidity
function recoverERC20(address _token, uint256 _amount, address _to) external
```

_Recovers accidentally sent ERC20 tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | Address of ERC20 token |
| _amount | uint256 | Amount to recover |
| _to | address | Recipient address |

### getPhase

```solidity
function getPhase() external view returns (enum Launch.Phase)
```

_Gets the current phase status_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum Launch.Phase | Phase enum value (0=NotStarted, 1=Distribution, 2=AMM, 3=Market) |

### getRemainingSupply

```solidity
function getRemainingSupply() external view returns (uint256)
```

_Gets the number of tokens remaining for distribution_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Number of tokens remaining |

### getSupplyInfo

```solidity
function getSupplyInfo() external view returns (uint256 totalDistributionSupply, uint256 remainingDistributionSupply, uint256 totalMintCap, uint256 totalMinted, uint256 mintRemaining)
```

_Returns detailed supply information_

### getPercentageSold

```solidity
function getPercentageSold() external view returns (uint256)
```

_Gets the percentage of tokens sold_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Percentage sold (0-100e18) |

### getDistributionStats

```solidity
function getDistributionStats() external view returns (uint256 _totalRaised, uint256 _totalParticipants, uint256 _largestPurchase, address _largestPurchaser, uint256 _percentageSold)
```

_Gets distribution statistics_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| _totalRaised | uint256 | Total ETH raised |
| _totalParticipants | uint256 | Number of unique participants |
| _largestPurchase | uint256 | Size of largest purchase |
| _largestPurchaser | address | Address of largest purchaser |
| _percentageSold | uint256 | Percentage of tokens sold (0-100e18) |

### previewPurchaseWithETH

```solidity
function previewPurchaseWithETH(uint256 ethAmount) external view returns (uint256 tokenAmount, uint256 totalCost, uint256 basePrice, uint256 premium)
```

_Gets the actual token quantity and cost for a given ETH purchase_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| ethAmount | uint256 | Total size of purchase in wei |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The total number of tokens received |
| totalCost | uint256 | The total cost in wei |
| basePrice | uint256 | The base price per token |
| premium | uint256 | The premium multiplier |

### receive

```solidity
receive() external payable
```

Handles direct ETH transfers to the contract

_Automatically calls purchaseTokensWithETH when receiving ETH_

## Events

### Purchase

```solidity
event Purchase(address buyer, uint256 amount, uint256 basePrice, uint256 premium, uint256 totalCost, uint256 vestingDuration)
```

### PhaseChanged

```solidity
event PhaseChanged(enum Launch.Phase oldPhase, enum Launch.Phase newPhase)
```

### PriceParametersUpdated

```solidity
event PriceParametersUpdated(int256 alpha, uint256 k, uint256 beta)
```

### TreasuryUpdated

```solidity
event TreasuryUpdated(address oldTreasury, address newTreasury)
```

### MaxPurchaseAmountUpdated

```solidity
event MaxPurchaseAmountUpdated(uint256 oldMaxAmount, uint256 newMaxAmount)
```

### TokenRecovered

```solidity
event TokenRecovered(address token, uint256 amount, address to)
```

### RefundFailed

```solidity
event RefundFailed(address buyer, uint256 amount)
```

### TransactionFeeUpdated

```solidity
event TransactionFeeUpdated(uint256 fee)
```

### MintCapUpdated

```solidity
event MintCapUpdated(uint256 oldMintCap, uint256 newMintCap)
```

### AdminMint

```solidity
event AdminMint(address to, uint256 amount)
```

## Custom Errors

### NotDistributionPhase

```solidity
error NotDistributionPhase()
```

Reverts when the current phase is not Distribution

### InsufficientPayment

```solidity
error InsufficientPayment(uint256 required, uint256 provided)
```

Reverts when insufficient ETH is provided

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| required |  | The required amount |
| provided |  | The provided amount |
### ExceedsMaxPurchase

```solidity
error ExceedsMaxPurchase(uint256 requested, uint256 maxAllowed)
```

Reverts when the requested amount exceeds the maximum allowed

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| requested |  | The requested amount |
| maxAllowed |  | The maximum allowed |
### InsufficientMintCapacity

```solidity
error InsufficientMintCapacity(uint256 requested, uint256 available)
```

Reverts when there is not enough capacity to mint tokens

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| requested |  | The requested amount |
| available |  | The available amount |
### InsufficientSupply

```solidity
error InsufficientSupply(uint256 requested, uint256 available)
```

Reverts when the requested amount is greater than the available supply

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| requested |  | The requested amount |
| available |  | The available amount |
### InvalidPhaseTransition

```solidity
error InvalidPhaseTransition(enum Launch.Phase currentPhase, enum Launch.Phase requestedPhase)
```

Reverts when attempting an invalid phase transition

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| currentPhase |  | The current phase |
| requestedPhase |  | The requested phase |
### InvalidParameter

```solidity
error InvalidParameter(string param)
```

Reverts when an invalid parameter is used

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| param |  | The parameter name |
### ZeroAddress

```solidity
error ZeroAddress()
```

Reverts when using the zero address

### TransferFailed

```solidity
error TransferFailed()
```

Reverts on any transfer failure

