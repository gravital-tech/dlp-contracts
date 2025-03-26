// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title UniversalVestingContract
 * @dev Manages vesting schedules for multiple tokens based on remaining supply decay.
 *      Utilizes UUPSUpgradeable for upgradeability, AccessControl for role-based access,
 *      and PausableUpgradeable for emergency pausing.
 */
contract UniversalVesting is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    using Math for uint256;

    // --- Roles ---
    bytes32 public constant VESTING_CREATOR_ROLE =
        keccak256("VESTING_CREATOR_ROLE");
    bytes32 public constant LIQUIDITY_MANAGER_ROLE =
        keccak256("LIQUIDITY_MANAGER_ROLE"); // Reserved for future use

    // --- Vesting Parameters per Token ---
    struct TokenVestingConfig {
        address token; // Address of the token
        uint256 dMin; // Minimum vesting duration (in seconds)
        uint256 dMax; // Maximum vesting duration (in seconds)
    }

    // --- Vesting Schedules ---
    struct VestingSchedule {
        uint256 id;
        address user; // User address for this vesting schedule
        address token;
        uint256 startTime; // Vesting start timestamp
        uint256 endTime; // Vesting end timestamp
        uint256 cliffEndTime; // Cliff duration (in seconds)
        uint256 totalAmount; // Total amount of tokens to vest
        uint256 transferredAmount; // Total amount claimed so far
    }

    // --- State Variables ---
    address internal tokenAddress;
    TokenVestingConfig public tokenConfig; // Configuration for registered tokens
    mapping(address => VestingSchedule[]) public userVestingSchedules; // Schedules per user, keyed by token address
    mapping(uint256 => VestingSchedule) public vestingSchedulesById;
    uint256 public nextScheduleId;

    // --- Events ---
    event VestingScheduleCreated(
        address indexed token,
        address indexed user,
        uint256 id,
        uint256 startTime,
        uint256 duration,
        uint256 cliffDuration,
        uint256 totalAmount
    );
    event TransferRecorded(
        address indexed sender,
        address indexed token,
        uint256 amount
    );
    event VestingConfigUpdated(TokenVestingConfig config);

    /// @notice Thrown when an operation is attempted by a non-token contract
    error NotTokenContract();

    /// @notice Thrown when vesting configuration parameters are invalid
    /// @param param The name of the invalid parameter
    error InvalidVestingConfig(string param);

    /// @notice Thrown when a token registration error occurs
    error TokenRegistrationError(string reason);

    /// @notice Thrown when invalid schedule parameters are provided
    /// @param param The name of the invalid parameter
    error InvalidScheduleParams(string param);

    /// @notice Thrown when no schedules are found for a user
    error InvalidUserSchedules();

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Required by UUPSUpgradeable, restricts upgrade ability to admin
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /**
     * @notice Only allow calls from the DLPToken contract
     */
    modifier onlyToken() {
        if (msg.sender != tokenAddress) revert NotTokenContract();
        _;
    }

    // --- Initializer ---
    function initialize() public virtual initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender()); // Deployer is default admin
    }

    // --- Vesting Schedule Management ---

    /**
     * @dev Creates a new vesting schedule for a user.
     *      Only callable by accounts with VESTING_CREATOR_ROLE.
     * @param _token Address of the token.
     * @param _user Address of the token recipient.
     * @param _startTime Unix timestamp for vesting start.
     * @param _duration Vesting duration in seconds.
     * @param _cliffDuration Cliff duration in seconds (0 for no cliff).
     * @param _totalAmount Total amount of tokens to be vested.
     */
    function createVestingSchedule(
        address _token,
        address _user,
        uint256 _startTime,
        uint256 _duration,
        uint256 _cliffDuration,
        uint256 _totalAmount
    ) external virtual whenNotPaused onlyRole(VESTING_CREATOR_ROLE) {
        VestingSchedule memory newSchedule = VestingSchedule({
            id: nextScheduleId,
            user: _user,
            token: _token,
            startTime: _startTime,
            endTime: _startTime + _duration,
            cliffEndTime: _startTime + _cliffDuration,
            totalAmount: _totalAmount,
            transferredAmount: 0 // Initialize transferred amount to 0
        });

        _verifyVestingParms(newSchedule);

        userVestingSchedules[_user].push(newSchedule);
        vestingSchedulesById[nextScheduleId] = newSchedule;

        // Emit event for Vesting Schedule Creation (for off-chain tracking)
        emit VestingScheduleCreated(
            _token,
            _user,
            nextScheduleId,
            _startTime,
            _duration,
            _cliffDuration,
            _totalAmount
        );

        nextScheduleId++;
    }

    function _verifyVestingParms(
        VestingSchedule memory schedule
    ) internal view {
        if (schedule.token != tokenAddress || tokenAddress == address(0)) {
            revert TokenRegistrationError(
                "Token not registered or address is zero."
            );
        }
        if (schedule.user == address(0)) {
            revert InvalidScheduleParams("User address");
        }
        if (schedule.endTime <= schedule.startTime) {
            revert InvalidScheduleParams("Vesting duration");
        }
        if (schedule.totalAmount == 0) {
            revert InvalidScheduleParams("Total amount");
        }
        if (schedule.startTime >= block.timestamp + 365 days) {
            revert InvalidScheduleParams("Start time too far in future");
        }
        if (schedule.startTime < block.timestamp - 365 days) {
            revert InvalidScheduleParams("Start time is too far in the past");
        }
        if (schedule.endTime >= block.timestamp + 3650 days) {
            revert InvalidScheduleParams("End time too far in future");
        }
        if (schedule.endTime < block.timestamp) {
            revert InvalidScheduleParams("End time is in the past");
        }
        if (schedule.cliffEndTime > schedule.endTime) {
            revert InvalidScheduleParams(
                "Cliff end time after schedule end time"
            );
        }
        if (schedule.totalAmount > IERC20(schedule.token).totalSupply()) {
            revert InvalidScheduleParams("Amount exceeds supply maximum");
        }
    }
    // --- Transfer Restriction Enforcement ---

    /**
     * @dev Checks if a token transfer is allowed for a sender and amount based on vesting schedules.
     *      Called by DLPToken before any transfer.
     * @param _sender Address of the sender.
     * @param _amount Amount of tokens to transfer.
     * @return True if transfer is allowed, false otherwise.
     */
    function isTransferAllowed(
        address _sender,
        uint256 _amount,
        address _token
    ) external view onlyToken whenNotPaused returns (bool) {
        if (_token != tokenAddress || tokenAddress == address(0)) {
            revert TokenRegistrationError(
                "Token not registered or address is zero."
            );
        }
        uint256 vestedAmount = getVestedAmountForUser(_sender, block.timestamp);
        return vestedAmount >= _amount;
    }

    /**
     * @dev Calculates the total vested amount for a user and token across all their vesting schedules.
     * @param _user Address of the user.
     * @return Total vested amount for the user and token.
     */
    function getVestedAmountForUser(
        address _user,
        uint256 atTimestamp
    ) public view returns (uint256) {
        uint256 totalVestedAmount = 0;
        VestingSchedule[] storage schedules = userVestingSchedules[_user]; // Get all schedules for the user

        atTimestamp = atTimestamp == 0 ? block.timestamp : atTimestamp;

        for (uint256 i = 0; i < schedules.length; i++) {
            uint256 vestedAmount;

            vestedAmount += _calculateVestedAmount(schedules[i], atTimestamp);

            // Subtract the already transferred amount to get the remaining vested amount
            uint256 remainingVestedAmount = vestedAmount -
                schedules[i].transferredAmount;

            totalVestedAmount += remainingVestedAmount > 0
                ? remainingVestedAmount
                : 0;
        }
        return totalVestedAmount;
    }

    /**
     * @dev Calculates the vested amount for a single vesting schedule at a given time.
     * @param schedule VestingSchedule struct.
     * @param _time Timestamp to calculate vested amount at.
     * @return Vested amount for the schedule at the given time.
     */
    function _calculateVestedAmount(
        VestingSchedule memory schedule,
        uint256 _time
    ) internal pure returns (uint256) {
        if (_time < schedule.startTime) {
            return 0; // Before vesting start, no tokens are vested
        }

        if (_time >= schedule.endTime) {
            return schedule.totalAmount; // After vesting end, all tokens are vested
        }

        if (_time < schedule.cliffEndTime) {
            return 0; // Within cliff period, no tokens are vested (after startTime but before cliff ends)
        }

        uint256 vestingPeriod = schedule.endTime - schedule.cliffEndTime;
        if (vestingPeriod == 0) {
            return schedule.totalAmount; // No vesting period after cliff, all vested immediately after cliff
        }

        uint256 elapsedTime = _time - schedule.cliffEndTime;
        uint256 vestedAmount = (schedule.totalAmount * elapsedTime) /
            vestingPeriod; // Linear vesting calculation

        return vestedAmount;
    }

    /**
     * @dev Records a token transfer and updates the transferred amount in relevant vesting schedules.
     *      Called by DLPToken after a successful transfer validated by vesting.
     * @param _sender Address of the sender.
     * @param _amount Amount of tokens transferred.
     * @param _token Address of the token transferred.
     */
    function recordTransfer(
        address _sender,
        uint256 _amount,
        address _token
    ) external whenNotPaused onlyToken {
        require(
            _token == tokenAddress,
            "UniversalVestingContract: Token address does not match registered token."
        );
        uint256 amountToRecord = _amount;
        VestingSchedule[] storage schedules = userVestingSchedules[_sender];

        if (schedules.length == 0) {
            revert InvalidUserSchedules();
        }

        for (uint256 i = 0; i < schedules.length; i++) {
            uint256 vestedAmount = _calculateVestedAmount(
                schedules[i],
                block.timestamp
            );
            uint256 remainingVestedAmount = vestedAmount -
                schedules[i].transferredAmount;

            if (remainingVestedAmount > 0) {
                uint256 deductAmount = Math.min(
                    remainingVestedAmount,
                    amountToRecord
                );
                schedules[i].transferredAmount += deductAmount;
                amountToRecord -= deductAmount;
                if (amountToRecord == 0) {
                    break; // All transfer amount recorded, exit loop
                }
            }
        }

        // Emit event for transfer recording (for off-chain tracking and debugging)
        emit TransferRecorded(_sender, tokenAddress, _amount);
    }

    // --- Token Registration and Configuration ---

    /**
     * @notice Registers a new ERC20 token for vesting management
     * @dev Only callable by accounts with DEFAULT_ADMIN_ROLE
     * @param _token Address of the ERC20 token to register
     * @param _dMin Minimum vesting duration in seconds
     * @param _dMax Maximum vesting duration in seconds
     * @custom:throws TokenRegistrationError if token address is missing or invalid
     * @custom:throws InvalidVestingConfig if vesting parameters are invalid
     */
    function registerToken(
        address _token,
        uint256 _dMin,
        uint256 _dMax
    ) external whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tokenAddress != address(0)) {
            revert TokenRegistrationError("Token address missing");
        }

        TokenVestingConfig memory config = TokenVestingConfig({
            token: _token,
            dMin: _dMin,
            dMax: _dMax
        });

        _verifyVestingConfig(config);

        tokenAddress = _token;
        tokenConfig = config;

        emit VestingConfigUpdated(tokenConfig);
    }

    function _verifyVestingConfig(
        TokenVestingConfig memory _config
    ) internal pure {
        if (_config.token == address(0)) {
            revert InvalidVestingConfig("Token address");
        }
        if (_config.dMin == 0) {
            revert InvalidVestingConfig("Minimum vesting duration");
        }
        if (_config.dMax == 0) {
            revert InvalidVestingConfig("Maximum vesting duration");
        }
        if (_config.dMax < _config.dMin) {
            revert InvalidVestingConfig(
                "Maximum vesting duration must be greater than minimum vesting duration."
            );
        }
    }

    /**
     * @dev Sets the vesting configuration parameters for a registered token.
     *      Only callable by accounts with DEFAULT_ADMIN_ROLE.
     * @param _dMin Minimum vesting duration in seconds.
     * @param _dMax Maximum vesting duration in seconds.
     */
    function setVestingConfig(
        address _token,
        uint256 _dMin,
        uint256 _dMax
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_token != tokenAddress) {
            revert TokenRegistrationError(
                "Token address does not match registered token."
            );
        }

        TokenVestingConfig memory config = TokenVestingConfig({
            token: _token,
            dMin: _dMin,
            dMax: _dMax
        });

        _verifyVestingConfig(config);

        tokenConfig = config;
        emit VestingConfigUpdated(tokenConfig);
    }

    // --- View Functions ---

    /**
     * @dev Gets the vesting configuration for a registered token.
     * @return VestingConfig struct.
     */
    function getVestingConfig()
        public
        view
        returns (TokenVestingConfig memory)
    {
        require(
            tokenAddress != address(0),
            "UniversalVestingContract: Token is not registered."
        );
        return tokenConfig;
    }

    /**
     * @dev Gets all vesting schedules for a user.
     * @param _user Address of the user.
     * @return Array of VestingSchedule structs.
     */
    function getUserVestingSchedules(
        address _token,
        address _user
    ) public view returns (VestingSchedule[] memory) {
        require(
            _token == tokenAddress,
            "UniversalVestingContract: Invalid token address."
        );
        return userVestingSchedules[_user];
    }

    function getScheduleById(
        uint256 _id
    ) public view returns (VestingSchedule memory) {
        require(
            vestingSchedulesById[_id].user != address(0),
            "Schedule ID not found"
        ); // Basic check for existence
        return vestingSchedulesById[_id];
    }

    /**
     * @notice Pause the registry
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the registry
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
