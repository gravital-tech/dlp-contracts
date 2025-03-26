# Contributing to the Dispersion Launch Protocol (DLP)

First of all, thank you for considering contributing to DLP! This project represents a fundamental reimagining of how token distribution can work, and your contributions can help make this vision a reality.

This document provides guidelines and instructions for contributing to the Dispersion Launch Protocol. By following these guidelines, you'll help maintain the quality and consistency of the codebase.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Development Guidelines](#development-guidelines)
  - [Branching Strategy](#branching-strategy)
  - [Commit Messages](#commit-messages)
  - [Code Style](#code-style)
  - [Testing](#testing)
  - [Documentation](#documentation)
- [Smart Contract Development Guidelines](#smart-contract-development-guidelines)
  - [Security Considerations](#security-considerations)
  - [Gas Optimization](#gas-optimization)
  - [Contract Upgradeability](#contract-upgradeability)

## Code of Conduct

This project adheres to a Code of Conduct that ensures a welcoming environment for everyone. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project team.

## Getting Started

To get started with contributing:

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/dlp.git`
3. Add the upstream remote: `git remote add upstream https://github.com/gravital-tech/dlp-contracts.git`
4. Install dependencies: `npm install` or `yarn install`
5. Make sure tests pass: `npx hardhat test`

For more detailed information on the protocol and its implementation, refer to our [documentation site](https://docs.gravital.tech).

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report:

1. Check the [issues](https://github.com/Gravital/dlp/issues) to see if the problem has already been reported
2. Check if the issue has been fixed in a more recent version

When submitting a bug report, please include:

- A clear, descriptive title
- Steps to reproduce the behavior
- Expected behavior
- Current behavior
- Environment details (blockchain, Hardhat version, etc.)
- Additional context (logs, screenshots, etc.)

### Suggesting Enhancements

Enhancement suggestions help improve DLP. When submitting enhancement suggestions, please:

1. Use a clear, descriptive title
2. Provide a detailed description of the enhancement
3. Explain why this enhancement would be useful
4. Include examples of how it would be used

### Pull Requests

When submitting a pull request:

1. Fill in the required template
2. Include relevant issue numbers in the PR description
3. Update documentation to reflect your changes
4. Add or update tests to verify your changes
5. Ensure all tests pass

## Development Guidelines

### Branching Strategy

We follow a simplified GitFlow branching model:

- `main`: Represents the latest production-ready code
- `develop`: Integration branch for ongoing development
- Feature branches: Named as `feature/short-description`
- Bugfix branches: Named as `fix/short-description`

Create your branches from `develop` and submit PRs back to `develop`.

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types include:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, linting
- `refactor`: Code restructuring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Example:

```
fix(pricing): correct exponential premium calculation overflow
```

### Code Style

We follow the [Solidity Style Guide](https://docs.soliditylang.org/en/v0.8.19/style-guide.html) with some additional rules:

- Use 4 spaces for indentation
- Maximum line length of 100 characters
- Add NatSpec comments to all functions and public state variables
- Use named return variables for better documentation
- Prefix private/internal state variables with an underscore

We use Prettier and Solhint for formatting and linting.

### Testing

All code changes should include appropriate tests:

- Unit tests for individual contract functions
- Integration tests for interactions between contracts
- Edge case tests to ensure the system behaves correctly under extreme conditions

Test coverage should be maintained at a high level. Run the coverage report with:

```bash
npx hardhat coverage
```

### Documentation

- Add NatSpec comments to all functions and public state variables
- Update relevant documentation to reflect your changes
- Create or update diagrams if necessary
- Document any external interfaces or integration points

## Smart Contract Development Guidelines

### Security Considerations

Security is paramount for DLP. When making changes:

- Consider reentrancy attack vectors
- Be careful with external calls to untrusted contracts
- Validate all inputs
- Use SafeMath or Solidity 0.8+ built-in overflow protection
- Beware of front-running opportunities
- Use `address.transfer()` or `address.call{value: x}("")` with appropriate checks for ETH transfers
- Follow the checks-effects-interactions pattern

### Gas Optimization

DLP aims to be gas-efficient, especially for token transfers. Optimize for gas by:

- Minimizing storage reads and writes
- Using `memory` instead of `storage` when possible
- Avoiding redundant checks
- Batching operations
- Using `view` functions for read-only operations
- Being mindful of loop sizes and potential gas limit issues

### Contract Upgradeability

DLP uses the UUPS (Universal Upgradeable Proxy Standard) pattern. When modifying upgradeable contracts:

- Never remove or reorder state variables
- Add new state variables at the end of the contract
- Use the storage gap pattern to reserve slots for future use
- Be careful with constructors—use initializers instead
- Test upgrade paths to ensure state is preserved correctly

When adding new features:

- Consider backward compatibility
- Document upgrade procedures
- Update migration scripts

## Additional Resources

- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Documentation](https://docs.openzeppelin.com/)
- [DLP Technical Documentation](https://docs.gravital.tech)
- [Hardhat Documentation](https://hardhat.org/docs)

Thank you for contributing to DLP!
