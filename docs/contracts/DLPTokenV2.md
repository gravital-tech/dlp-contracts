---
title: DLPTokenV2
---

# DLPTokenV2

## Functions

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(string _name, string _symbol, address _minterAddress, address _vestingContractAddress) public
```

_Reinitializes the contract for a V2 upgrade.
Note the use of reinitializer(2) to allow calling this during an upgrade._

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

