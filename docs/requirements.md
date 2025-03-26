# DLPToken and UniversalVestingContract System Requirements

## Narrative

This document outlines the requirements for a system composed of two smart contracts: `DLPToken` and `UniversalVestingContract`. The system is designed to manage the distribution of the `DLPToken`, an ERC20 token, with robust vesting provisions. The primary goal is to enable immediate token ownership for users upon purchase or receipt (tokens are delivered directly to their wallets), while strategically restricting token transferability until predefined vesting schedules are fulfilled. This approach ensures long-term alignment of incentives, prevents premature dumping of tokens, and supports a sustainable token economy. The system must be upgradeable, secure, testable, and gas-efficient, especially concerning token transfers which should remain reasonably cost-effective for users.

## Functional Requirements

### 1. DLPToken Functionality (ERC20 Token)

1.  **ERC20 Standard Compliance:**

    ```
    DLPToken must be compliant with the ERC20 token standard, leveraging OpenZeppelin's ERC20Upgradeable implementation for upgradeability.
    ```

2.  **Mintable Token:**

    ```
    DLPToken must be mintable. Only accounts with the `MINTER_ROLE` should be authorized to mint new tokens.
    ```

3.  **Transfer Restrictions via Vesting:**

    ```
    DLPToken transfers must be restricted based on vesting schedules managed by the `UniversalVestingContract`. Transfers should be allowed only for tokens that have vested according to the user's vesting schedule(s).
    ```

4.  **`MINTER_ROLE` Management:**
    ```
    The `DLPToken` contract should implement role-based access control using OpenZeppelin's AccessControlUpgradeable. It must define a `MINTER_ROLE`.
    ```

### 2. UniversalVestingContract Functionality (Vesting Management)

1.  **Vesting Schedule Creation:**

    ```
    Authorized accounts (with `VESTING_CREATOR_ROLE`) must be able to create vesting schedules for users and specific ERC20 tokens (in this case, `DLPToken`).
    ```

2.  **Vesting Schedule Parameters:** Each vesting schedule must be defined by the following parameters:

    ```
    - `user`: Address of the token recipient.
    - `token`: Address of the vested ERC20 token (must be `DLPToken` in this system).
    - `startTime`: Unix timestamp (in seconds) for the vesting start.
    - `duration`: Vesting duration in seconds.
    - `cliffDuration`: Optional cliff duration in seconds before vesting starts (0 for no cliff).
    - `totalAmount`: Total amount of tokens to be vested under this schedule.
    ```

3.  **Linear Vesting Logic:**

    ```
    Vesting must be linear, progressing from `startTime` to `endTime` after the optional `cliffTime`. The vested amount at any given time should be calculated proportionally to the elapsed time within the vesting period.
    ```

4.  **Multiple Vesting Schedules:**

    ```
    The system must support users having multiple concurrent vesting schedules for the same `DLPToken`. Vested balances should be calculated by aggregating across all active vesting schedules for a given user and token.
    ```

5.  **"In-Wallet, Non-Transferable Until Vested" Model:**

    ```
    Tokens are immediately transferred to the user's wallet upon minting, but transferability is restricted until vesting conditions are met. No explicit "claim" action from users is required for tokens to become transferable as vesting progresses.
    ```

6.  **Transfer Restriction Enforcement (`isTransferAllowed`):**

    ```
    The `UniversalVestingContract` must provide a `view` function `isTransferAllowed(address _sender, uint256 _amount, address _token)` that determines if a token transfer is permitted. This function is called by `DLPToken` before any transfer. Transfers should be allowed only if the transfer amount is less than or equal to the sender's currently vested balance (summed across all vesting schedules for the given token).
    ```

7.  **Replay Attack Prevention & Transferred Amount Tracking:**

    ```
    To prevent replay attacks, the system must track the cumulative `transferredAmount` for each vesting schedule.
    - `VestingSchedule` struct must include a `transferredAmount` field.
    - The `UniversalVestingContract` must provide a non-view function `recordTransfer(address _sender, uint256 _amount, address _token)` to be called by `DLPToken` after each successful transfer that is validated by vesting.
    - `recordTransfer` is responsible for updating the `transferredAmount` in the relevant vesting schedule(s) to reflect the completed transfer and prevent future replay attempts.
    ```

8.  **Token Registration and Configuration:**

    ```
    The contract owner of `UniversalVestingContract` must be able to:
    - Register new ERC20 token addresses (specifically `DLPToken` instances) that will be subject to vesting.
    - Configure vesting parameters for each registered token:
        - `dMin`: Minimum vesting duration (in seconds).
        - `dMax`: Maximum vesting duration (in seconds).
        - `totalSupplyCap`: Total supply cap for the token (configuration, not actively enforced in vesting logic itself).
        - `dlpLaunchContractAddress`: Address of a related DLP Launch Contract (configuration, not actively enforced in vesting logic itself).
    - Update the vesting configuration parameters for registered tokens.
    ```

9.  **Role-Based Access Control:**
    ```
    `UniversalVestingContract` must implement role-based access control using OpenZeppelin's AccessControlUpgradeable, defining the following roles:
    - `DEFAULT_ADMIN_ROLE`: For contract administration and role management.
    - `VESTING_CREATOR_ROLE`: Authorized to create new vesting schedules.
    - `LIQUIDITY_MANAGER_ROLE`:  Reserved for future liquidity management functionalities.
    ```

### 3. Gas Efficiency Requirement

1.  **Minimize Gas Costs for Token Transfers:**
    ```
    The implementation must prioritize gas efficiency, especially for token transfers. The gas overhead introduced by the vesting logic should be minimized to ensure reasonable transaction costs for users trading `DLPToken`.
    ```
    This includes focusing on reducing gas consumption in:
    ```
    - External calls between `DLPToken` and `UniversalVestingContract`.
    - Storage reads within `isTransferAllowed` and `recordTransfer`.
    - Storage writes within `recordTransfer`.
    - Loop iterations when processing multiple vesting schedules.
    ```

## Non-Functional Requirements

1.  **Upgradeability:**

    ```
    Both `DLPToken` and `UniversalVestingContract` contracts must be upgradeable to allow for future feature enhancements and bug fixes without requiring token migration.  OpenZeppelin's Upgradeable Contracts proxy pattern must be used.
    ```

2.  **Security and Robustness:**

    ```
    The contracts must be designed and implemented with a strong emphasis on security to prevent vulnerabilities such as reentrancy attacks, integer overflows/underflows, and replay attacks. Robust error handling and input validation must be implemented to ensure contract stability and prevent unexpected behavior.
    ```

3.  **Testability:**

    ```
    The contracts must be easily testable. Comprehensive unit tests and integration tests are required to verify all functional requirements, access control mechanisms, vesting logic, transfer restrictions, and gas efficiency. Test suites must include scenarios for replay attack prevention and handling multiple vesting schedules.
    ```

4.  **Clarity and Maintainability:**
    ```
    The Solidity code must be written with clarity, well-structured, and thoroughly commented to ensure maintainability, readability, and ease of auditing. Code should adhere to Solidity best practices and coding conventions.
    ```

This document serves as a comprehensive guide for the development of the `DLPToken` and `UniversalVestingContract` system. All development and testing efforts should be aligned with these requirements.
