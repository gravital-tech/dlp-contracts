// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../DLPToken.sol";

contract DLPTokenV2 is DLPToken {
    string public version;
    uint256[50] private __gap_v2;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Constructor should remain empty
    }

    /**
     * @dev Reinitializes the contract for a V2 upgrade.
     * Note the use of reinitializer(2) to allow calling this during an upgrade.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _minterAddress,
        address _vestingContractAddress
    ) public override initializer {
        // Call parent initializer with original params to maintain compatibility
        super.initialize(
            _name,
            _symbol,
            _minterAddress,
            _vestingContractAddress
        );
        // Set V2-specific state
        version = "V2";
    }

    /**
     * @dev V2-specific initializer for upgrades.
     * This should be called during the upgrade process.
     */
    function initializeV2() public reinitializer(2) {
        // Set V2-specific state
        version = "V2";
    }

    function getVersion() public view returns (string memory) {
        return version;
    }
}
