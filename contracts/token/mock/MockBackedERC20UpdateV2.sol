// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "../IBackedERC20.sol";

contract MockBackedERC20UpdateV2 is Initializable, ERC20PermitUpgradeable, ERC20PausableUpgradeable, IBackedERC20, AccessControlEnumerableUpgradeable {
    function initialize(string memory name, string memory symbol) public virtual initializer {
        __BackedERC20_init(name, symbol);
    }
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    function __BackedERC20_init(
        string memory name,
        string memory symbol
    ) internal onlyInitializing {
        __ERC20_init_unchained(name, symbol);
        __Pausable_init_unchained();
        __BackedERC20_init_unchained(name, symbol);
    }

    function __BackedERC20_init_unchained(
        string memory,
        string memory
    ) internal onlyInitializing {
      _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    function mint(address _to, uint256 _amount) external override virtual returns (bool) {
        require(hasRole(MINTER_ROLE, msg.sender), "BackedERC20: caller is not minter");
        _mint(_to, _amount);
        return true;
    }

    function burn(address _from, uint256 _amount) external override virtual returns (bool) {
        require(hasRole(BURNER_ROLE, msg.sender), "BackedERC20: caller is not burner");
        _burn(_from, _amount);
        return true;
    }

    function pause() external virtual onlyPauser {
        _pause();
    }

    function unpause() external virtual onlyPauser {
        _unpause();
    }

    modifier onlyPauser() {
        require(hasRole(PAUSER_ROLE,  msg.sender), "BackedERC20: caller is not pauser");
        _;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._beforeTokenTransfer(from, to, amount);
    }

    // END OF BackedERC20 IMPLEMENTATION

    // START OF UpdateV2 IMPLEMENTATION

    event Equalize(address from, address to, uint256 balance, uint256 amount);

    function equalize(address _to) external returns (bool) {
        _equalize(msg.sender, _to);
        return true;
    }

    function equalizeFrom(address _from, address _to) external returns (bool) {
        uint256 amount = _equalize(_from, _to);
        _spendAllowance(_from, msg.sender, amount);
        return true;
    }

    function _equalize(address _from, address _to) internal returns (uint256) {
        uint256 fromBalance = balanceOf(_from);
        uint256 toBalance = balanceOf(_to);

        uint256 amount = fromBalance > toBalance ? (fromBalance - toBalance) / 2 : 0;
        _transfer(_from, _to, amount);
        emit Equalize(_from, _to, amount, balanceOf(_from));
        return amount;
    }

    // END OF UpdateV2 IMPLEMENTATION
}
