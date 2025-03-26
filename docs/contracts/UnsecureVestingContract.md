---
title: UnsecureVestingContract
---

# UnsecureVestingContract

## Functions

### createVestingSchedule

```solidity
function createVestingSchedule(address _token, address _user, uint256 _startTime, uint256 _duration, uint256 _cliffDuration, uint256 _totalAmount) external
```

_Creates a new vesting schedule for a user.
     Only callable by accounts with VESTING_CREATOR_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | Address of the token. |
| _user | address | Address of the token recipient. |
| _startTime | uint256 | Unix timestamp for vesting start. |
| _duration | uint256 | Vesting duration in seconds. |
| _cliffDuration | uint256 | Cliff duration in seconds (0 for no cliff). |
| _totalAmount | uint256 | Total amount of tokens to be vested. |

