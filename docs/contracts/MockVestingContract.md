---
title: MockVestingContract
---

# MockVestingContract

## Functions

### constructor

```solidity
constructor() public
```

### isTransferAllowed

```solidity
function isTransferAllowed(address sender, uint256 amount, address token) external view returns (bool)
```

### recordTransfer

```solidity
function recordTransfer(address sender, uint256 amount, address token) external
```

### setAllow

```solidity
function setAllow(bool _allow) external
```

### setTransferAllowedOverride

```solidity
function setTransferAllowedOverride(bool _override) external
```

## Events

### TransferRecorded

```solidity
event TransferRecorded(address sender, address token, uint256 amount)
```

