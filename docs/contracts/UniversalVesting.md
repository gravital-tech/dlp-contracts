---
title: UniversalVesting
---

# UniversalVesting

> UniversalVestingContract

## Developer Notes

Manages vesting schedules for multiple tokens based on remaining supply decay.
     Utilizes UUPSUpgradeable for upgradeability, AccessControl for role-based access,
     and PausableUpgradeable for emergency pausing.

## Functions

### constructor

```solidity
constructor() public
```

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address newImplementation) internal
```

_Required by UUPSUpgradeable, restricts upgrade ability to admin_

### initialize

```solidity
function initialize() public virtual
```

### createVestingSchedule

```solidity
function createVestingSchedule(address _token, address _user, uint256 _startTime, uint256 _duration, uint256 _cliffDuration, uint256 _totalAmount) external virtual
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

### _verifyVestingParms

```solidity
function _verifyVestingParms(struct UniversalVesting.VestingSchedule schedule) internal view
```

### isTransferAllowed

```solidity
function isTransferAllowed(address _sender, uint256 _amount, address _token) external view returns (bool)
```

_Checks if a token transfer is allowed for a sender and amount based on vesting schedules.
     Called by DLPToken before any transfer._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _sender | address | Address of the sender. |
| _amount | uint256 | Amount of tokens to transfer. |
| _token | address |  |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if transfer is allowed, false otherwise. |

### getVestedAmountForUser

```solidity
function getVestedAmountForUser(address _user, uint256 atTimestamp) public view returns (uint256)
```

_Calculates the total vested amount for a user and token across all their vesting schedules._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | Address of the user. |
| atTimestamp | uint256 |  |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total vested amount for the user and token. |

### _calculateVestedAmount

```solidity
function _calculateVestedAmount(struct UniversalVesting.VestingSchedule schedule, uint256 _time) internal pure returns (uint256)
```

_Calculates the vested amount for a single vesting schedule at a given time._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| schedule | struct UniversalVesting.VestingSchedule | VestingSchedule struct. |
| _time | uint256 | Timestamp to calculate vested amount at. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Vested amount for the schedule at the given time. |

### recordTransfer

```solidity
function recordTransfer(address _sender, uint256 _amount, address _token) external
```

_Records a token transfer and updates the transferred amount in relevant vesting schedules.
     Called by DLPToken after a successful transfer validated by vesting._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _sender | address | Address of the sender. |
| _amount | uint256 | Amount of tokens transferred. |
| _token | address | Address of the token transferred. |

### registerToken

```solidity
function registerToken(address _token, uint256 _dMin, uint256 _dMax) external
```

Registers a new ERC20 token for vesting management

_Only callable by accounts with DEFAULT_ADMIN_ROLE_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | Address of the ERC20 token to register |
| _dMin | uint256 | Minimum vesting duration in seconds |
| _dMax | uint256 | Maximum vesting duration in seconds |

### _verifyVestingConfig

```solidity
function _verifyVestingConfig(struct UniversalVesting.TokenVestingConfig _config) internal pure
```

### setVestingConfig

```solidity
function setVestingConfig(address _token, uint256 _dMin, uint256 _dMax) external
```

_Sets the vesting configuration parameters for a registered token.
     Only callable by accounts with DEFAULT_ADMIN_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _dMin | uint256 | Minimum vesting duration in seconds. |
| _dMax | uint256 | Maximum vesting duration in seconds. |

### getVestingConfig

```solidity
function getVestingConfig() public view returns (struct UniversalVesting.TokenVestingConfig)
```

_Gets the vesting configuration for a registered token._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct UniversalVesting.TokenVestingConfig | VestingConfig struct. |

### getUserVestingSchedules

```solidity
function getUserVestingSchedules(address _token, address _user) public view returns (struct UniversalVesting.VestingSchedule[])
```

_Gets all vesting schedules for a user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _user | address | Address of the user. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct UniversalVesting.VestingSchedule[] | Array of VestingSchedule structs. |

### getScheduleById

```solidity
function getScheduleById(uint256 _id) public view returns (struct UniversalVesting.VestingSchedule)
```

### pause

```solidity
function pause() external
```

Pause the registry

### unpause

```solidity
function unpause() external
```

Unpause the registry

## Modifiers

### onlyToken

```solidity
modifier onlyToken()
```

Only allow calls from the DLPToken contract

## Events

### VestingScheduleCreated

```solidity
event VestingScheduleCreated(address token, address user, uint256 id, uint256 startTime, uint256 duration, uint256 cliffDuration, uint256 totalAmount)
```

### TransferRecorded

```solidity
event TransferRecorded(address sender, address token, uint256 amount)
```

### VestingConfigUpdated

```solidity
event VestingConfigUpdated(struct UniversalVesting.TokenVestingConfig config)
```

## Custom Errors

### NotTokenContract

```solidity
error NotTokenContract()
```

Thrown when an operation is attempted by a non-token contract

### InvalidVestingConfig

```solidity
error InvalidVestingConfig(string param)
```

Thrown when vesting configuration parameters are invalid

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| param |  | The name of the invalid parameter |
### TokenRegistrationError

```solidity
error TokenRegistrationError(string reason)
```

Thrown when a token registration error occurs

### InvalidScheduleParams

```solidity
error InvalidScheduleParams(string param)
```

Thrown when invalid schedule parameters are provided

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| param |  | The name of the invalid parameter |
### InvalidUserSchedules

```solidity
error InvalidUserSchedules()
```

Thrown when no schedules are found for a user

