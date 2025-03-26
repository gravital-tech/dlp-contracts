---
title: DLPToken
---

# DLPToken

> DLPToken

## Developer Notes

ERC20 token with vesting enforcement via UniversalVestingContract.

## Functions

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(string _name, string _symbol, address _minterAddress, address _vestingContractAddress) public virtual
```

_Initializer for DLPToken._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _name | string | Token name. |
| _symbol | string | Token symbol. |
| _minterAddress | address | Address authorized to mint tokens. |
| _vestingContractAddress | address | Address of the UniversalVestingContract. |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address newAddress) internal
```

### mint

```solidity
function mint(address _to, uint256 _amount) public
```

_Mints new tokens to a specified address.
     Only callable by the minter address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | Address to mint tokens to. |
| _amount | uint256 | Amount of tokens to mint. |

### _update

```solidity
function _update(address from, address to, uint256 value) internal virtual
```

Transfers are allowed only if vesting conditions are met

_Overrides the ERC20 _update function to enforce vesting_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | Address of the sender (or address(0) for mint) |
| to | address | Address of the recipient (or address(0) for burn) |
| value | uint256 | Amount of tokens to transfer |

### isTransferAllowed

```solidity
function isTransferAllowed(address sender, uint256 amount) internal view virtual returns (bool)
```

_Checks with the UniversalVestingContract if a transfer is allowed for a user and amount._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender | address | Address of the sender. |
| amount | uint256 | Amount of tokens to transfer. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if transfer is allowed, false otherwise. |

### setMinter

```solidity
function setMinter(address _newMinter) public
```

_Sets a new minter address.
     Only callable by the contract owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newMinter | address | Address of the new minter. |

### setVestingActive

```solidity
function setVestingActive(bool _isVestingActive) public
```

_Sets the vesting active status.
     Only callable by the contract owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _isVestingActive | bool | New vesting active status. |

### setVestingContract

```solidity
function setVestingContract(address _newVestingContract) public
```

_Sets a new vesting contract address.
     Only callable by the contract owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newVestingContract | address | Address of the new vesting contract. |

## Modifiers

### onlyMinter

```solidity
modifier onlyMinter()
```

_Modifier to restrict function calls to only the minter address._

## Events

### VestingActiveUpdated

```solidity
event VestingActiveUpdated(bool isActive)
```

## Custom Errors

### TokensNotVested

```solidity
error TokensNotVested()
```

Thrown when a user attempts to transfer tokens that aren&#x27;t yet vested

### VestingNotConfigured

```solidity
error VestingNotConfigured()
```

Thrown when vesting contract isn&#x27;t properly configured

