# DLP Token - Upgradeable Smart Contract Testing Framework

A comprehensive testing framework for upgradeable token smart contracts utilizing UUPS and Beacon proxies with advanced access control patterns.

## Overview

This framework provides robust testing utilities for DLP Token and similar upgradeable smart contracts with a focus on:

- Proxy-based upgradeability (UUPS and Beacon patterns)
- Role-based access control
- Token vesting enforcement
- State preservation during upgrades

The framework is designed to be modular, reusable, and easy to extend for testing all aspects of upgradeable token contracts.

## Architecture

### Core Components

1. **Fixture Helpers** (`helpers/fixtures.js`)

   - Reusable deployment fixtures for different types of proxies
   - Efficient test state isolation using Hardhat's `loadFixture`
   - Support for complex deployment scenarios and contract dependencies

2. **Upgradeability Helpers** (`helpers/upgradeability.js`)

   - Tools for testing contract upgrades
   - State preservation verification
   - Implementation slot validation
   - Upgrade security checks

3. **Access Control Helpers** (`helpers/accessControl.js`)
   - Comprehensive role-based access testing
   - Role management validation
   - Protected function verification
   - Role hierarchy testing

## Getting Started

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/dlp-token.git
   cd dlp-token
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Make sure test helpers are set up:
   ```bash
   mkdir -p test/helpers
   cp -r framework/helpers/* test/helpers/
   ```

### Running Tests

Run all tests:

```bash
npx hardhat test
```

Run specific test file:

```bash
npx hardhat test test/dlp-token.test.js
```

## Test Fixtures

The framework uses Hardhat's `loadFixture` to improve test efficiency and state isolation:

```javascript
// Example fixture usage
const { dlpToken, vestingContract, signers } = await loadFixture(
  deployDLPTokenFixture
);
```

### Available Fixtures

- `deployDLPTokenFixture` - Basic token deployment with vesting contract
- `deployWithTokensFixture` - Deployment with tokens minted to a test user
- `deployWithVestingActiveFixture` - Deployment with vesting schedules set up
- `deployWithMockVestingFixture` - Deployment with a mock vesting contract for isolated testing

## Upgrade Testing

The framework provides specialized tools for testing contract upgradeability:

```javascript
// Example upgradeability test
it("Should be upgradeable while preserving state", async function () {
  const { dlpToken, signers } = await loadFixture(deployWithTokensFixture);

  // Get state before upgrade
  const balanceBefore = await dlpToken.balanceOf(signers.user1.address);

  // Upgrade contract
  const DLPTokenV2 = await ethers.getContractFactory("DLPTokenV2");
  await dlpToken.connect(signers.admin).upgradeTo(DLPTokenV2.target);

  // Verify state preservation
  expect(await dlpToken.balanceOf(signers.user1.address)).to.equal(
    balanceBefore
  );

  // Test new V2 functionality
  // expect(await dlpToken.newV2Function()).to.equal(expectedValue);
});
```

## Access Control Testing

The framework includes utilities for testing role-based access control:

```javascript
// Example access control test
it("Should restrict functions to proper roles", async function () {
  const { dlpToken, signers } = await loadFixture(deployDLPTokenFixture);
  const ADMIN_ROLE = await dlpToken.DEFAULT_ADMIN_ROLE();

  // Test admin function access
  await expect(
    dlpToken.connect(signers.user1).setVestingActive(false)
  ).to.be.revertedWithCustomError(dlpToken, "AccessControlUnauthorizedAccount");

  // Grant role and test again
  await dlpToken.grantRole(ADMIN_ROLE, signers.user1.address);
  await expect(dlpToken.connect(signers.user1).setVestingActive(false)).to.not
    .be.reverted;
});
```

## Vesting Integration Testing

The framework provides utilities for testing token vesting interaction:

```javascript
// Example vesting integration test
it("Should check vesting contract for transfer allowance", async function () {
  const { dlpToken, mockVesting, signers } = await loadFixture(
    deployWithMockVestingFixture
  );

  // Test transfer with vesting check
  await dlpToken.connect(signers.user1).transfer(signers.user2.address, amount);

  // Verify vesting contract was called
  expect(/* check for event or state change */);
});
```

## Advanced Usage

### Testing Upgrade Security

```javascript
it("Should only allow authorized accounts to upgrade", async function () {
  const { dlpToken, signers } = await loadFixture(deployDLPTokenFixture);

  const UPGRADER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UPGRADER_ROLE")
  );
  await dlpToken.grantRole(UPGRADER_ROLE, signers.user1.address);

  const mockImplementation = ethers.Wallet.createRandom().address;

  // Unauthorized upgrade should fail
  await expect(
    dlpToken.connect(signers.user2).upgradeTo(mockImplementation)
  ).to.be.revertedWithCustomError(dlpToken, "AccessControlUnauthorizedAccount");

  // Authorized upgrade should succeed
  await expect(dlpToken.connect(signers.user1).upgradeTo(mockImplementation)).to
    .not.be.reverted;
});
```

### Testing Complex Vesting Scenarios

```javascript
it("Should handle transfers with complex vesting schedules", async function () {
  const { dlpToken, vestingContract, signers } = await loadFixture(
    deployWithVestingActiveFixture
  );

  // Create multiple vesting schedules
  const now = Math.floor(Date.now() / 1000);

  // First schedule - started in past, partially vested
  await vestingContract.createVestingSchedule(
    dlpToken.target,
    signers.user1.address,
    now - 86400 * 30, // 30 days ago
    86400 * 90, // 90 day duration
    0, // No cliff
    ethers.parseEther("300")
  );

  // Second schedule - not yet started
  await vestingContract.createVestingSchedule(
    dlpToken.target,
    signers.user1.address,
    now + 86400, // 1 day in future
    86400 * 60, // 60 day duration
    86400 * 10, // 10 day cliff
    ethers.parseEther("700")
  );

  // Test transfers with complex vesting state
  // ...
});
```

## Extending the Framework

### Adding New Test Fixtures

Create new fixtures by building on existing ones:

```javascript
async function deployWithCustomConfigFixture() {
  // Start with base deployment
  const result = await deployDLPTokenFixture();

  // Customize configuration
  await result.dlpToken.setVestingActive(false);
  await result.dlpToken.setMinter(result.signers.user1.address);

  // Add additional contracts or setup
  const OtherContract = await ethers.getContractFactory("OtherContract");
  const otherContract = await OtherContract.deploy();

  return {
    ...result,
    otherContract,
  };
}
```

### Testing New Upgrade Implementations

When testing a new implementation version:

1. Deploy the base contract using fixtures
2. Create a new implementation factory
3. Upgrade to the new implementation
4. Test both state preservation and new functionality

```javascript
// Example for testing DLPTokenV2
it("Should upgrade to V2 and add new functionality", async function () {
  const { dlpToken, signers } = await loadFixture(deployWithTokensFixture);

  // Upgrade to V2
  const DLPTokenV2 = await ethers.getContractFactory("DLPTokenV2");
  await dlpToken.connect(signers.admin).upgradeTo(DLPTokenV2.target);

  // Cast to V2 interface to access new functions
  const dlpTokenV2 = DLPTokenV2.attach(dlpToken.target);

  // Test new functionality
  await dlpTokenV2.connect(signers.admin).newV2Function();
  expect(await dlpTokenV2.newV2Property()).to.equal(expectedValue);
});
```

## Best Practices

1. **Use fixtures for deployment** - Improves test performance and isolation
2. **Test state preservation after upgrades** - Ensure all state variables remain intact
3. **Test access control thoroughly** - Verify all protected functions
4. **Use mock contracts for isolation** - Test token functionality independent of vesting logic
5. **Test upgrade security** - Ensure only authorized roles can upgrade
6. **Write explicit assertions** - Be specific about expected behavior

## License

[MIT License](LICENSE)
