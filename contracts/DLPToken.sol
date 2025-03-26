// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./UniversalVesting.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/**
 * @title DLPToken
 * @dev ERC20 token with vesting enforcement via UniversalVestingContract.
 */
contract DLPToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    address public minterAddress;
    bool public isVestingActive; // Indicates if vesting is currently active
    UniversalVesting public vestingContract; // Address of the UniversalVestingContract

    event VestingActiveUpdated(bool isActive);

    /// @notice Thrown when a user attempts to transfer tokens that aren't yet vested
    error TokensNotVested();

    /// @notice Thrown when vesting contract isn't properly configured
    error VestingNotConfigured();

    // Storage gap for future upgrades
    uint256[50] private __gap;

    /**
     * @dev Constructor disabled since this contract is meant to be used behind a proxy
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer for DLPToken.
     * @param _name Token name.
     * @param _symbol Token symbol.
     * @param _minterAddress Address authorized to mint tokens.
     * @param _vestingContractAddress Address of the UniversalVestingContract.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _minterAddress,
        address _vestingContractAddress
    ) public virtual initializer {
        __ERC20_init(_name, _symbol);
        __AccessControl_init();
        __ERC20Burnable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender()); // Deployer is default admin

        minterAddress = _minterAddress;
        vestingContract = UniversalVesting(_vestingContractAddress);
        isVestingActive = true;
    }

    // --- Upgradeability ---
    function _authorizeUpgrade(
        address newAddress
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /**
     * @dev Modifier to restrict function calls to only the minter address.
     */
    modifier onlyMinter() {
        require(
            msg.sender == minterAddress,
            "DLPToken: Only minter can call this function"
        );
        _;
    }

    // --- Mint and Burn ---

    /**
     * @dev Mints new tokens to a specified address.
     *      Only callable by the minter address.
     * @param _to Address to mint tokens to.
     * @param _amount Amount of tokens to mint.
     */
    function mint(address _to, uint256 _amount) public onlyMinter {
        _mint(_to, _amount);
    }

    // --- Vesting Enforcement on Transfer ---

    /**
     * @dev Overrides the ERC20 _update function to enforce vesting
     * @notice Transfers are allowed only if vesting conditions are met
     * @param from Address of the sender (or address(0) for mint)
     * @param to Address of the recipient (or address(0) for burn)
     * @param value Amount of tokens to transfer
     * @custom:throws TokensNotVested if the sender has insufficient vested tokens
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Vesting check only applies to transfers (from and to are not address(0))
        if (from != address(0) && to != address(0) && isVestingActive) {
            if (!isTransferAllowed(from, value)) {
                revert TokensNotVested();
            }
            super._update(from, to, value); // Call parent function for the actual transfer/mint/burn logic
            vestingContract.recordTransfer(from, value, address(this));
        } else {
            super._update(from, to, value); // Call parent function for the actual transfer/mint/burn logic
        }
    }

    /**
     * @dev Checks with the UniversalVestingContract if a transfer is allowed for a user and amount.
     * @param sender Address of the sender.
     * @param amount Amount of tokens to transfer.
     * @return True if transfer is allowed, false otherwise.
     */
    function isTransferAllowed(
        address sender,
        uint256 amount
    ) internal view virtual returns (bool) {
        if (address(vestingContract) == address(0)) {
            revert VestingNotConfigured();
        }
        return vestingContract.isTransferAllowed(sender, amount, address(this)); // Pass this token contract address
    }

    // --- Admin Functions (Ownable) ---
    /**
     * @dev Sets a new minter address.
     *      Only callable by the contract owner.
     * @param _newMinter Address of the new minter.
     */
    function setMinter(address _newMinter) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minterAddress = _newMinter;
    }

    /**
     * @dev Sets the vesting active status.
     *      Only callable by the contract owner.
     * @param _isVestingActive New vesting active status.
     */
    function setVestingActive(
        bool _isVestingActive
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (isVestingActive == _isVestingActive) {
            return;
        }
        isVestingActive = _isVestingActive;
        emit VestingActiveUpdated(_isVestingActive);
    }

    /**
     * @dev Sets a new vesting contract address.
     *      Only callable by the contract owner.
     * @param _newVestingContract Address of the new vesting contract.
     */
    function setVestingContract(
        address _newVestingContract
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        vestingContract = UniversalVesting(_newVestingContract);
    }

    // ... (Optional: Pause/Burn functions could be added here if needed for governance/emergency) ...
}
