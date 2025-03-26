// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SD59x18, sd} from "@prb/math/src/SD59x18.sol";
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";
import "./DLPToken.sol";
import "./UniversalVesting.sol";
import "./lib/PricingMath.sol";

/**
 * @title DLPLaunch
 * @dev Main contract implementing the Dispersion Launch Protocol distribution
 * with supply-based pricing, exponential premiums, and vesting.
 */
contract Launch is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // --- Roles ---
    bytes32 public constant PRICE_UPDATER_ROLE =
        keccak256("PRICE_UPDATER_ROLE");
    bytes32 public constant PHASE_MANAGER_ROLE =
        keccak256("PHASE_MANAGER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // --- Structs ---
    /**
     * @title LaunchConfig
     * @dev Configuration parameters for initializing the Launch contract
     * @param tokenAddress Address of the DLPToken contract
     * @param vestingContractAddress Address of the UniversalVesting contract
     * @param treasury Address where funds will be sent
     * @param txnFee The fixed fee per purchase (in wei)
     * @param initialPrice Initial token price in WEI
     * @param totalSupply Total tokens to distribute in the launch (used for pricing and limiting sale quantity)
     * @param mintCap Maximum tokens that can be minted (including all mint)
     * @param alpha Alpha parameter for base price calculation
     * @param k Premium intensity parameter
     * @param beta Beta parameter (0-100e18)
     * @param maxPurchaseAmount Maximum tokens purchasable in a single transaction
     */
    struct LaunchConfig {
        address tokenAddress;
        address vestingContractAddress;
        address treasury;
        uint256 txnFee;
        uint256 initialPrice;
        uint256 totalSupply;
        uint256 mintCap;
        int256 alpha;
        uint256 k;
        uint256 beta;
        uint256 maxPurchaseAmount;
    }

    // --- Configuration ---
    uint256 public transactionFee;
    DLPToken public token;
    UniversalVesting public vestingContract;
    address public treasury;
    uint256 public mintCap;

    // --- Pricing Configuration ---
    PricingMath.PricingConfig public pricingConfig;
    uint256 public maxPurchaseAmount;

    // --- Distribution Phases ---
    enum Phase {
        NotStarted,
        Distribution,
        AMM,
        Market
    }
    Phase public currentPhase;

    // --- Statistics ---
    uint256 public totalRaised;
    uint256 public totalParticipants;
    uint256 public largestPurchase;
    address public largestPurchaser;
    mapping(address => bool) public hasParticipated;

    // --- Events ---
    event Purchase(
        address indexed buyer,
        uint256 amount,
        uint256 basePrice,
        uint256 premium,
        uint256 totalCost,
        uint256 vestingDuration
    );
    event PhaseChanged(Phase indexed oldPhase, Phase indexed newPhase);
    event PriceParametersUpdated(int256 alpha, uint256 k, uint256 beta);
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event MaxPurchaseAmountUpdated(uint256 oldMaxAmount, uint256 newMaxAmount);
    event TokenRecovered(
        address indexed token,
        uint256 amount,
        address indexed to
    );
    event RefundFailed(address indexed buyer, uint256 amount);
    event TransactionFeeUpdated(uint256 fee);
    event MintCapUpdated(uint256 oldMintCap, uint256 newMintCap);
    event AdminMint(address indexed to, uint256 amount);

    // --- Errors ---
    /// @notice Reverts when the current phase is not Distribution
    error NotDistributionPhase();

    /// @notice Reverts when insufficient ETH is provided
    /// @param required The required amount
    /// @param provided The provided amount
    error InsufficientPayment(uint256 required, uint256 provided);

    /// @notice Reverts when the requested amount exceeds the maximum allowed
    /// @param requested The requested amount
    /// @param maxAllowed The maximum allowed
    error ExceedsMaxPurchase(uint256 requested, uint256 maxAllowed);

    /// @notice Reverts when there is not enough capacity to mint tokens
    /// @param requested The requested amount
    /// @param available The available amount
    error InsufficientMintCapacity(uint256 requested, uint256 available);

    /// @notice Reverts when the requested amount is greater than the available supply
    /// @param requested The requested amount
    /// @param available The available amount
    error InsufficientSupply(uint256 requested, uint256 available);

    /// @notice Reverts when attempting an invalid phase transition
    /// @param currentPhase The current phase
    /// @param requestedPhase The requested phase
    error InvalidPhaseTransition(Phase currentPhase, Phase requestedPhase);

    /// @notice Reverts when an invalid parameter is used
    /// @param param The parameter name
    error InvalidParameter(string param);

    /// @notice Reverts when using the zero address
    error ZeroAddress();

    /// @notice Reverts on any transfer failure
    error TransferFailed();

    /**
     * @dev Constructor disabled since this contract is meant to be used behind a proxy
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer for Launch contract
     * @param config The launch configuration struct containing all initialization parameters
     * @notice This function replaces the original initialize function to avoid stack too deep errors
     */
    function initialize(LaunchConfig memory config) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        // Grant roles to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(PRICE_UPDATER_ROLE, _msgSender());
        _grantRole(PHASE_MANAGER_ROLE, _msgSender());
        _grantRole(EMERGENCY_ROLE, _msgSender());

        // Validate addresses
        if (
            config.tokenAddress == address(0) ||
            config.vestingContractAddress == address(0) ||
            config.treasury == address(0)
        ) {
            revert ZeroAddress();
        }

        // Connect to external contracts
        token = DLPToken(config.tokenAddress);
        vestingContract = UniversalVesting(config.vestingContractAddress);
        treasury = config.treasury;

        // Validate and set pricing parameters
        if (config.initialPrice == 0) revert InvalidParameter("initialPrice");
        if (config.totalSupply == 0) revert InvalidParameter("totalSupply");
        if (config.mintCap < config.totalSupply)
            revert InvalidParameter("mintCap");
        if (config.alpha < -10 || config.alpha > 0)
            revert InvalidParameter("alpha");
        if (config.beta > 95e18) revert InvalidParameter("beta"); // As beta approaches 1 (100e18), prices approach infinity as remaing supply approaches 0, must limit
        if (config.k > 250) revert InvalidParameter("k");
        if (config.txnFee == 0) revert InvalidParameter("txnFee");
        if (
            config.maxPurchaseAmount == 0 ||
            config.maxPurchaseAmount > config.totalSupply
        ) {
            revert InvalidParameter("maxPurchaseAmount");
        }

        // Set pricing configuration
        pricingConfig = PricingMath.PricingConfig({
            initialPrice: config.initialPrice,
            totalSupply: config.totalSupply,
            remainingSupply: config.totalSupply,
            alphaParameter: config.alpha,
            premiumIntensityK: config.k,
            betaParameter: config.beta
        });

        transactionFee = config.txnFee;
        maxPurchaseAmount = config.maxPurchaseAmount;
        currentPhase = Phase.NotStarted;
        mintCap = config.mintCap;
    }

    /**
     * @dev Required by UUPSUpgradeable, restricts upgrade ability to admin
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // --- Price Calculation Functions ---

    /**
     * @dev Gets the current base price based on remaining supply
     * @return Current base price in WEI per token
     */
    function getBasePrice() public view returns (uint256) {
        return PricingMath.calculateBasePrice(pricingConfig);
    }

    /**
     * @dev Calculates the premium multiplier for a purchase amount
     * @param amount Number of tokens to purchase
     * @return Premium multiplier (1e18 = 1.0)
     */
    function calculatePremium(uint256 amount) public view returns (uint256) {
        return PricingMath.calculatePremium(pricingConfig, amount);
    }

    /**
     * @dev Calculates the final cost for a token purchase
     * @param amount Number of tokens to purchase
     * @return basePrice Base price per token
     * @return premium Premium multiplier
     * @return baseCost Base cost (without premium)
     * @return finalCost Final cost including premium
     */
    function calculatePurchaseCost(
        uint256 amount
    )
        public
        view
        returns (
            uint256 basePrice,
            uint256 premium,
            uint256 baseCost,
            uint256 finalCost
        )
    {
        return PricingMath.calculateTotalCost(pricingConfig, amount);
    }

    /**
     * @dev Calculates the final cost including transaction fee
     * @param amount Number of tokens to purchase
     * @return totalCost Total cost including premium
     * @return totalCostWithFee Total cost including premium and transaction fee
     */
    function calculateTotalCost(
        uint256 amount
    ) public view returns (uint256 totalCost, uint256 totalCostWithFee) {
        (, , , totalCost) = PricingMath.calculateTotalCost(
            pricingConfig,
            amount
        );
        totalCostWithFee = totalCost + transactionFee;
    }

    /**
     * @dev Calculates how many tokens can be purchased with a given amount of ETH
     * @param ethAmount Amount of ETH in WEI
     * @return tokenAmount Maximum number of tokens purchasable
     */
    function calculateTokensForETH(
        uint256 ethAmount
    ) public view returns (uint256 tokenAmount) {
        // Subtract transaction fee
        if (ethAmount <= transactionFee) {
            return 0;
        }

        uint256 availableForTokens = ethAmount - transactionFee;
        return
            PricingMath.calculateTokensForCurrency(
                pricingConfig,
                availableForTokens
            );
    }

    /**
     * @dev Calculates vesting duration based on current remaining supply
     * @return Duration in seconds
     */
    function calculateVestingDuration() public view returns (uint256) {
        // Get vesting parameters from vesting contract
        UniversalVesting.TokenVestingConfig
            memory vestingConfig = vestingContract.getVestingConfig();
        uint256 dMin = vestingConfig.dMin;
        uint256 dMax = vestingConfig.dMax;

        // D(S_remaining) = D_min + (D_max - D_min) * (S_remaining / S_total)
        UD60x18 supplyRatio = ud(pricingConfig.remainingSupply).div(
            ud(pricingConfig.totalSupply)
        );
        uint256 durationRange = dMax - dMin;

        return dMin + ((durationRange * supplyRatio.unwrap()) / 1e18);
    }

    // --- Core Purchase Function ---

    /**
     * @dev Allows a user to purchase tokens
     * @param tokenAmount Number of tokens to purchase
     */
    function purchaseTokens(
        uint256 tokenAmount
    ) external payable nonReentrant whenNotPaused {
        // Verify phase
        if (currentPhase != Phase.Distribution) {
            revert NotDistributionPhase();
        }

        // Validate amount
        if (tokenAmount == 0) {
            revert InvalidParameter("tokenAmount");
        }

        if (tokenAmount > maxPurchaseAmount) {
            revert ExceedsMaxPurchase(tokenAmount, maxPurchaseAmount);
        }

        if (tokenAmount > pricingConfig.remainingSupply) {
            revert InsufficientSupply(
                tokenAmount,
                pricingConfig.remainingSupply
            );
        }

        // Calculate cost
        (uint256 basePrice, uint256 premium, , uint256 totalCost) = PricingMath
            .calculateTotalCost(pricingConfig, tokenAmount);

        // Apply transaction fee
        uint256 requiredPayment = totalCost + transactionFee;

        // Verify payment
        if (msg.value < requiredPayment) {
            revert InsufficientPayment(requiredPayment, msg.value);
        }

        // Calculate vesting duration
        // This MUST be done before remaining supply is updated
        uint256 vestingDuration = calculateVestingDuration();

        // Update state variables
        pricingConfig.remainingSupply -= tokenAmount;

        // Update statistics
        totalRaised += totalCost;

        if (!hasParticipated[_msgSender()]) {
            totalParticipants++;
            hasParticipated[_msgSender()] = true;
        }

        if (tokenAmount > largestPurchase) {
            largestPurchase = tokenAmount;
            largestPurchaser = _msgSender();
        }

        // Mint tokens to the sender
        token.mint(_msgSender(), tokenAmount);

        // Create vesting schedule
        vestingContract.createVestingSchedule(
            address(token),
            _msgSender(),
            block.timestamp,
            vestingDuration,
            0, // No cliff
            tokenAmount
        );

        // Send funds to treasury
        (bool success, ) = treasury.call{value: requiredPayment}("");
        if (!success) {
            revert TransferFailed();
        }

        // Emit purchase event
        emit Purchase(
            _msgSender(),
            tokenAmount,
            basePrice,
            premium,
            totalCost,
            vestingDuration
        );

        // Refund excess ETH if any
        if (msg.value > requiredPayment) {
            uint256 refundAmount = msg.value - requiredPayment;
            (bool refundSuccess, ) = _msgSender().call{value: refundAmount}("");
            if (!refundSuccess) {
                // If refund fails, add to treasury instead of reverting
                (bool treasurySuccess, ) = treasury.call{value: refundAmount}(
                    ""
                );
                require(
                    treasurySuccess,
                    "Both refund and treasury transfer failed"
                );
                emit RefundFailed(_msgSender(), refundAmount);
            }
        }
    }

    /**
     * @dev Allows a user to purchase tokens by specifying ETH amount rather than token amount
     * The contract will calculate the maximum number of tokens purchasable with the provided ETH
     */
    function purchaseTokensWithETH() external payable {
        _purchaseTokensWithETH(_msgSender(), msg.value);
    }

    function _purchaseTokensWithETH(
        address buyer,
        uint256 value
    ) internal nonReentrant whenNotPaused {
        // Verify phase
        if (currentPhase != Phase.Distribution) {
            revert NotDistributionPhase();
        }

        // Ensure payment exceeds transaction fee
        if (value <= transactionFee) {
            revert InsufficientPayment(transactionFee, value);
        }

        // Calculate available ETH for tokens
        uint256 availableForTokens = value - transactionFee;

        // Calculate maximum purchasable tokens
        uint256 tokenAmount = PricingMath.calculateTokensForCurrency(
            pricingConfig,
            availableForTokens
        );

        // Validate amount
        if (tokenAmount == 0) {
            revert InvalidParameter("Calculated token amount is zero");
        }

        if (tokenAmount > maxPurchaseAmount) {
            tokenAmount = maxPurchaseAmount; // Cap at max purchase amount
        }

        if (tokenAmount > pricingConfig.remainingSupply) {
            tokenAmount = pricingConfig.remainingSupply; // Cap at remaining supply
        }

        // Recalculate actual cost for the token amount
        (uint256 basePrice, uint256 premium, , uint256 actualCost) = PricingMath
            .calculateTotalCost(pricingConfig, tokenAmount);
        uint256 totalRequiredPayment = actualCost + transactionFee;

        // Calculate refund if payment exceeds required amount
        uint256 refundAmount = 0;
        if (msg.value > totalRequiredPayment) {
            refundAmount = msg.value - totalRequiredPayment;
        }

        // Calculate vesting duration
        // This MUST be done before remaining supply is updated
        uint256 vestingDuration = calculateVestingDuration();

        // Update state variables
        pricingConfig.remainingSupply -= tokenAmount;

        // Update statistics
        totalRaised += actualCost;

        if (!hasParticipated[buyer]) {
            totalParticipants++;
            hasParticipated[buyer] = true;
        }

        if (tokenAmount > largestPurchase) {
            largestPurchase = tokenAmount;
            largestPurchaser = buyer;
        }

        // Mint tokens to the sender
        token.mint(buyer, tokenAmount);

        // Create vesting schedule
        vestingContract.createVestingSchedule(
            address(token),
            buyer,
            block.timestamp,
            vestingDuration,
            0, // No cliff
            tokenAmount
        );

        // Send funds to treasury
        uint256 treasuryAmount = msg.value - refundAmount;
        (bool success, ) = treasury.call{value: treasuryAmount}("");
        if (!success) {
            revert TransferFailed();
        }

        // Emit purchase event
        emit Purchase(
            buyer,
            tokenAmount,
            basePrice,
            premium,
            actualCost,
            vestingDuration
        );

        // Refund excess ETH if any
        if (refundAmount > 0) {
            (bool refundSuccess, ) = buyer.call{value: refundAmount}("");
            if (!refundSuccess) {
                // If refund fails, add to treasury instead of reverting
                (bool treasurySuccess, ) = treasury.call{value: refundAmount}(
                    ""
                );
                require(
                    treasurySuccess,
                    "Both refund and treasury transfer failed"
                );
                emit RefundFailed(buyer, refundAmount);
            }
        }
    }

    // --- Phase Management Functions ---

    /**
     * @dev Starts the distribution phase
     */
    function startDistribution() external onlyRole(PHASE_MANAGER_ROLE) {
        if (currentPhase != Phase.NotStarted) {
            revert InvalidPhaseTransition(currentPhase, Phase.Distribution);
        }

        Phase oldPhase = currentPhase;
        currentPhase = Phase.Distribution;
        emit PhaseChanged(oldPhase, currentPhase);
    }

    /**
     * @dev Moves to the AMM bootstrap phase
     */
    function moveToAMMPhase() external onlyRole(PHASE_MANAGER_ROLE) {
        if (currentPhase != Phase.Distribution) {
            revert InvalidPhaseTransition(currentPhase, Phase.AMM);
        }

        Phase oldPhase = currentPhase;
        currentPhase = Phase.AMM;
        emit PhaseChanged(oldPhase, currentPhase);
    }

    /**
     * @dev Moves to the market phase
     */
    function moveToMarketPhase() external onlyRole(PHASE_MANAGER_ROLE) {
        if (currentPhase != Phase.AMM) {
            revert InvalidPhaseTransition(currentPhase, Phase.Market);
        }

        Phase oldPhase = currentPhase;
        currentPhase = Phase.Market;
        emit PhaseChanged(oldPhase, currentPhase);
    }

    // --- Parameter Update Functions ---

    /**
     * @dev Updates pricing parameters
     * @param _alpha Alpha parameter for base price calculation (must be between -10 and 0)
     * @param _k Premium intensity parameter (higher values create steeper premiums)
     * @param _beta Beta parameter (0-100e18) controlling supply sensitivity
     */
    function updatePriceParameters(
        int256 _alpha,
        uint256 _k,
        uint256 _beta
    ) external onlyRole(PRICE_UPDATER_ROLE) {
        if (_alpha < -10 || _alpha > 0) revert InvalidParameter("alpha");
        if (_beta > 100e18) revert InvalidParameter("beta");
        if (_k > 250) revert InvalidParameter("k");

        pricingConfig.alphaParameter = _alpha;
        pricingConfig.premiumIntensityK = _k;
        pricingConfig.betaParameter = _beta;

        emit PriceParametersUpdated(_alpha, _k, _beta);
    }

    /**
     * @dev Updates the maximum purchase amount
     * @param _maxPurchaseAmount New maximum purchase amount
     */
    function setMaxPurchaseAmount(
        uint256 _maxPurchaseAmount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (
            _maxPurchaseAmount == 0 ||
            _maxPurchaseAmount > pricingConfig.totalSupply
        ) {
            revert InvalidParameter("maxPurchaseAmount");
        }

        uint256 oldMaxAmount = maxPurchaseAmount;
        maxPurchaseAmount = _maxPurchaseAmount;
        emit MaxPurchaseAmountUpdated(oldMaxAmount, _maxPurchaseAmount);
    }

    /**
     * @dev Updates the treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(
        address _treasury
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert ZeroAddress();

        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @dev Updates the transaction fee
     * @param _fee New treasury address
     */
    function setTransactionFee(
        uint256 _fee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_fee == 0) revert InvalidParameter("transactionFee");
        transactionFee = _fee;
        emit TransactionFeeUpdated(_fee);
    }

    /**
     * @dev Allows admin to update the mint cap if needed
     * Can only increase the cap, not decrease it
     */
    function updateMintCap(
        uint256 _newMintCap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newMintCap <= mintCap) {
            revert InvalidParameter(
                "newMintCap must be greater than current cap"
            );
        }

        // Ensure the new cap allows for remaining distribution
        uint256 currentSupply = token.totalSupply();
        if (_newMintCap < currentSupply + pricingConfig.remainingSupply) {
            revert InvalidParameter(
                "newMintCap insufficient for remaining distribution"
            );
        }

        uint256 oldMintCap = mintCap;
        mintCap = _newMintCap;

        emit MintCapUpdated(oldMintCap, _newMintCap);
    }

    /**
     * @dev Allows minting tokens for purposes outside the distribution
     * (e.g., team allocation, treasury, etc.)
     */
    function adminMint(
        address _to,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert InvalidParameter("amount");

        uint256 availableMintCapacity = mintCap - token.totalSupply();

        // The key invariant: Ensure enough capacity remains for distribution
        if (_amount > availableMintCapacity - pricingConfig.remainingSupply) {
            revert InsufficientMintCapacity(
                _amount,
                availableMintCapacity - pricingConfig.remainingSupply
            );
        }

        // Mint tokens
        token.mint(_to, _amount);

        emit AdminMint(_to, _amount);
    }

    // --- Emergency Functions ---

    /**
     * @notice Pauses token purchases in emergency situations
     * @dev Can only be called by accounts with EMERGENCY_ROLE
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses token purchases
     */
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    /**
     * @dev Recovers accidentally sent ERC20 tokens
     * @param _token Address of ERC20 token
     * @param _amount Amount to recover
     * @param _to Recipient address
     */
    function recoverERC20(
        address _token,
        uint256 _amount,
        address _to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_to == address(0)) revert ZeroAddress();
        if (_token == address(token))
            revert InvalidParameter("Cannot recover DLP token");

        IERC20(_token).safeTransfer(_to, _amount);
        emit TokenRecovered(_token, _amount, _to);
    }

    // --- View Functions ---

    /**
     * @dev Gets the current phase status
     * @return Phase enum value (0=NotStarted, 1=Distribution, 2=AMM, 3=Market)
     */
    function getPhase() external view returns (Phase) {
        return currentPhase;
    }

    /**
     * @dev Gets the number of tokens remaining for distribution
     * @return Number of tokens remaining
     */
    function getRemainingSupply() external view returns (uint256) {
        return pricingConfig.remainingSupply;
    }

    /**
     * @dev Returns detailed supply information
     */
    function getSupplyInfo()
        external
        view
        returns (
            uint256 totalDistributionSupply,
            uint256 remainingDistributionSupply,
            uint256 totalMintCap,
            uint256 totalMinted,
            uint256 mintRemaining
        )
    {
        uint256 mintedAmount = token.totalSupply();

        return (
            pricingConfig.totalSupply,
            pricingConfig.remainingSupply,
            mintCap,
            mintedAmount,
            mintCap - mintedAmount
        );
    }

    /**
     * @dev Gets the percentage of tokens sold
     * @return Percentage sold (0-100e18)
     */
    function getPercentageSold() external view returns (uint256) {
        return
            ud(pricingConfig.totalSupply - pricingConfig.remainingSupply)
                .div(ud(pricingConfig.totalSupply))
                .mul(ud(100e18))
                .unwrap();
    }

    /**
     * @dev Gets distribution statistics
     * @return _totalRaised Total ETH raised
     * @return _totalParticipants Number of unique participants
     * @return _largestPurchase Size of largest purchase
     * @return _largestPurchaser Address of largest purchaser
     * @return _percentageSold Percentage of tokens sold (0-100e18)
     */
    function getDistributionStats()
        external
        view
        returns (
            uint256 _totalRaised,
            uint256 _totalParticipants,
            uint256 _largestPurchase,
            address _largestPurchaser,
            uint256 _percentageSold
        )
    {
        _percentageSold = ud(
            pricingConfig.totalSupply - pricingConfig.remainingSupply
        ).div(ud(pricingConfig.totalSupply)).mul(ud(100e18)).unwrap();

        return (
            totalRaised,
            totalParticipants,
            largestPurchase,
            largestPurchaser,
            _percentageSold
        );
    }

    /**
     * @dev Gets the actual token quantity and cost for a given ETH purchase
     * @param ethAmount Total size of purchase in wei
     * @return tokenAmount The total number of tokens received
     * @return totalCost The total cost in wei
     * @return basePrice The base price per token
     * @return premium The premium multiplier
     */
    function previewPurchaseWithETH(
        uint256 ethAmount
    )
        external
        view
        returns (
            uint256 tokenAmount,
            uint256 totalCost,
            uint256 basePrice,
            uint256 premium
        )
    {
        if (ethAmount <= transactionFee) return (0, 0, 0, 0);
        uint256 availableForTokens = ethAmount - transactionFee;
        tokenAmount = PricingMath.calculateTokensForCurrency(
            pricingConfig,
            availableForTokens
        );
        if (tokenAmount > maxPurchaseAmount) tokenAmount = maxPurchaseAmount;
        if (tokenAmount > pricingConfig.remainingSupply)
            tokenAmount = pricingConfig.remainingSupply;
        (basePrice, premium, , totalCost) = PricingMath.calculateTotalCost(
            pricingConfig,
            tokenAmount
        );
        totalCost += transactionFee;
        return (tokenAmount, totalCost, basePrice, premium);
    }

    /**
     * @notice Handles direct ETH transfers to the contract
     * @dev Automatically calls purchaseTokensWithETH when receiving ETH
     */
    receive() external payable {
        _purchaseTokensWithETH(_msgSender(), msg.value);
    }
}
