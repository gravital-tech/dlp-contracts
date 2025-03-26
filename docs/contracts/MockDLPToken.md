---
title: MockDLPToken
---

# MockDLPToken

## Functions

### isTransferAllowed

```solidity
function isTransferAllowed(address sender, uint256 amount) internal view returns (bool)
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

### setAllow

```solidity
function setAllow(bool _allow) public
```

