# Dispersion Launch Protocol (DLP)

<div align="center">
  <img src="assets/dlp-logo.png" alt="DLP Logo" width="300"/>
  <h3>Engineering Stable and Fair Token Launches Through Game-Theoretic Equilibrium</h3>
  <p>
    <a href="https://github.com/gravital-tech/dlp-contracts/issues">Report Bug</a> ·
    <a href="https://github.com/gravital-tech/dlp-contracts/issues">Request Feature</a> ·
    <a href="https://discord.gg/Gravital">Join Discord</a> ·
    <a href="https://docs.gravital.tech">Documentation</a>
  </p>
</div>

## Overview

The **Dispersion Launch Protocol (DLP)** is a groundbreaking framework for token distribution in decentralized systems. DLP solves the token distribution problem through game-theoretic incentives, creating systems where fair distribution emerges naturally from economic incentives rather than arbitrary restrictions.

By integrating **exponential pricing premiums**, **supply-based universal vesting**, **supply-driven price discovery**, and **fixed transaction fees**, DLP fosters an environment where equitable distribution becomes the mathematically optimal outcome.

## Why DLP Exists

Traditional token launches face three critical challenges:

- **Fair Governance Distribution**: Preventing concentration of ownership and power
- **Efficient Price Discovery**: Finding true market value based on genuine demand
- **Sustainable Market Dynamics**: Supporting long-term stability and growth

DLP addresses these challenges through innovative mechanism design rather than artificial caps, whitelists, or other restrictions that can be circumvented.

## Key Features

### 1. Exponential Pricing Premium

```
P_final = P_base(t) * (1 + exp(k * x/(β*S_remaining(t) + (1-β)*S_total)) - 1)
```

- Creates a cost function where token price increases exponentially with purchase size
- Naturally prevents concentration without artificial restrictions
- Configurable premium intensity through the `k` parameter
- Balances remaining supply sensitivity through the `β` parameter

### 2. Supply-Based Universal Vesting

```
D(S_remaining) = D_min + (D_max - D_min) * (S_remaining(t) / S_total)
```

- Vesting duration tied to remaining supply at purchase time
- Early purchases (lower prices) face longer vesting periods
- Late purchases (higher prices) benefit from shorter vesting periods
- Creates natural balance of advantages between participants

### 3. Fixed Transaction Fee

- Every token acquisition incurs a fixed fee (e.g., 0.1 ETH)
- Prevents circumvention of pricing mechanisms through multiple wallets
- Creates a lower bound for efficient transaction sizes
- Collected fees directed to community treasury

### 4. Phased Market Formation

- **Phase 1: Initial Distribution** - Tokens acquired from bonding contract
- **Phase 2: AMM Bootstrap** - Gradual liquidity introduction through AMM
- **Phase 3: Market Operations** - Protocol-controlled liquidity with natural market makers

## Contract Architecture

The DLP implementation consists of four main components:

1. **Launch Contract** (`Launch.sol`) - Orchestrates token distribution with exponential pricing
2. **DLP Token** (`DLPToken.sol`) - ERC20 token with integrated vesting enforcement
3. **Universal Vesting** (`UniversalVesting.sol`) - Manages vesting schedules for purchased tokens
4. **Pricing Math** (`PricingMath.sol`) - Mathematical library for dynamic pricing calculations

![Contract Architecture](assets/dlp-architecture.png)

## Technical Stack

- **Smart Contract Framework**: Hardhat
- **Testing Framework**: Mocha/Chai
- **JS Library**: ethers.js
- **Solidity Version**: ^0.8.19
- **OpenZeppelin Contracts**: For standard contract implementations and security

## Key Design Features

### "In-Wallet, Non-Transferable Until Vested" Model

DLP uses a novel implementation of the ERC-20 standard where:

- Tokens are delivered directly to users' wallets upon purchase/receipt
- Transferability is restricted until vesting conditions are met
- No claim action required as tokens automatically become transferable as they vest
- Users can participate in governance with their full balance (including unvested tokens)

### Upgradeable Contracts

All main contracts implement the UUPS (Universal Upgradeable Proxy Standard) pattern:

- Contracts deployed behind proxies for future improvements without migrating token balances
- Upgrade capability restricted to administrative roles
- Storage layout carefully maintained with gaps for future use

### Role-Based Access Control

The system implements granular permissions for administrative functions:

- `DEFAULT_ADMIN_ROLE` - Overall administrative control
- `PRICE_UPDATER_ROLE` - Can update pricing parameters
- `PHASE_MANAGER_ROLE` - Can transition between phases
- `EMERGENCY_ROLE` - Can pause/unpause the contract
- `VESTING_CREATOR_ROLE` - Can create new vesting schedules

## Directory Structure

```
dlp/
├── contracts/             # Smart contract source code
│   ├── Launch.sol         # Main token distribution contract
│   ├── DLPToken.sol       # ERC20 token with vesting enforcement
│   ├── UniversalVesting.sol # Vesting schedule management
│   ├── libraries/         # Helper libraries
│   │   └── PricingMath.sol # Price calculation logic
│   └── mocks/             # Mock contracts for testing
├── test/                  # Test scripts
├── scripts/               # Deployment and interaction scripts
├── hardhat.config.js      # Hardhat configuration
└── README.md              # You are here
```

## Getting Started

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn

### Installation

1. Clone the repository

```bash
git clone https://github.com/gravital-tech/dlp-contracts.git
cd dlp
```

2. Install dependencies

```bash
npm install
# or
yarn install
```

3. Compile contracts

```bash
npx hardhat compile
```

4. Run tests

```bash
npx hardhat test
```

### Deployment

DLP contracts can be deployed on any EVM-compatible blockchain. The deployment scripts are in the `scripts` directory.

```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

## Usage Examples

### Configuring Launch Parameters

```javascript
const launchParams = {
  initialPrice: ethers.utils.parseEther("0.0001"), // Starting price
  totalSupply: ethers.utils.parseUnits("10000000", 18), // 10M tokens
  premiumIntensityK: 10, // Premium intensity parameter
  betaParameter: 70, // Supply weighting (70%)
  maxVestingDuration: 7776000, // 90 days in seconds
  minVestingDuration: 604800, // 7 days in seconds
  fixedFee: ethers.utils.parseEther("0.1"), // 0.1 ETH transaction fee
};
```

### Initializing a Token Launch

```javascript
// Deploy contracts
const vestingContract = await deployUniversalVesting();
const dlpToken = await deployDLPToken(vestingContract.address);
const launchContract = await deployLaunch(
  dlpToken.address,
  vestingContract.address
);

// Configure vesting
await vestingContract.registerToken(
  dlpToken.address,
  launchParams.minVestingDuration,
  launchParams.maxVestingDuration
);

// Grant roles
await dlpToken.grantRole(MINTER_ROLE, launchContract.address);
await vestingContract.grantRole(VESTING_CREATOR_ROLE, launchContract.address);

// Start distribution
await launchContract.startDistribution();
```

### Purchasing Tokens

```javascript
// Purchase specific token amount
const tokenAmount = ethers.utils.parseUnits("1000", 18);
const purchaseCost = await launchContract.calculateTotalCost(tokenAmount);
await launchContract.purchaseTokens(tokenAmount, {
  value: purchaseCost.totalCostWithFee,
});

// Purchase with specific ETH amount
await launchContract.purchaseTokensWithETH({
  value: ethers.utils.parseEther("1"),
});
```

## Mathematical Foundation

DLP's approach can be understood as an innovative form of "inverse second-degree price discrimination," where larger purchases face higher per-unit costs rather than volume discounts. This creates a self-selection mechanism where participants naturally choose purchase sizes that lead to broad distribution. For a deeper dive into the mathematical models, see our [technical documentation](https://docs.gravital.tech).

The exponential premium formula:

```
P_final = P_base(t) * (1 + exp(k * x/(β*S_remaining(t) + (1-β)*S_total)) - 1)
```

Combined with the vesting duration formula:

```
D(S_remaining) = D_min + (D_max - D_min) * (S_remaining(t) / S_total)
```

Creates a system where:

- Early participants pay less but wait longer
- Later participants pay more but access liquidity sooner
- Large single purchases become economically inefficient
- The Nash equilibrium shifts toward multiple moderate purchases spread over time

## Security Considerations

The DLP contracts implement several security measures:

- **Reentrancy Guards**: To prevent reentrancy attacks during token purchases
- **Secure Math**: Using PRBMath for precise mathematical calculations
- **Access Control**: Granular permissions for administrative functions
- **Emergency Pause**: Ability to pause the system in case of issues
- **Input Validation**: Comprehensive validation of all parameters
- **Gas Optimization**: Careful optimization to ensure reasonable transaction costs

## Relation to Gravital

DLP was created by the team behind Gravital as the essential foundation for their broader ecosystem. While DLP focuses on solving the token distribution problem, Gravital builds on this to create a collaborative token economy through its reserve tree architecture.

The relationship can be understood as:

1. **DLP**: The foundation that ensures fair, decentralized token ownership
2. **Gravital**: The ecosystem built on DLP's foundation where tokens can form economic relationships

## Contributing

Contributions are welcome! Please check out our [contribution guidelines](CONTRIBUTING.md).

## Documentation

For comprehensive documentation on DLP, including detailed mathematical models, integration guides, and API references, visit our [documentation site](https://docs.gravital.tech).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Special thanks to the OpenZeppelin team for their secure contract implementations
- All contributors and early testers of the protocol
