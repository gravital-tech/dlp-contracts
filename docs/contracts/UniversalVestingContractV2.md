---
title: UniversalVestingContractV2
---

# UniversalVestingContractV2

## Functions

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize() public
```

_Original initialize function, kept for compatibility.
This will likely never be called after initial deployment._

### initializeV2

```solidity
function initializeV2() public
```

_V2-specific initializer for upgrades.
This should be called during the upgrade process._

### getVersion

```solidity
function getVersion() public view returns (string)
```

