// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "../BridgeProposal.sol";
import "../../fee/ConversionFee.sol";
import "../../token/IBackedERC20.sol";

contract MockFiatBridgeUpdateV2 is Initializable, AccessControlEnumerableUpgradeable, ConversionFee, BridgeProposal {
    function initialize(IBackedERC20 _token) public virtual initializer {
        __MockFiatBridgeUpdateV2_init(_token);
    }

    bytes32 public constant BRIDGER_ROLE = keccak256("BRIDGER_ROLE");
    bytes32 public constant APPROVE_ROLE = keccak256("APPROVE_ROLE");

    IBackedERC20 public token;
    mapping(string => bool) public transactionMinted;
    uint256 public minimumBurn;

    mapping(uint256 => bool) public accountApproved;

    // BridgeMint event redefined for V2
    event BridgeBurn(uint256 indexed account, address indexed from, uint256 amount);
    event MinimumBurnChanged(uint256 previousMinimum, uint256 minimum);
    event AccountApprovalChanged(uint256 indexed account, bool approved);

    function __MockFiatBridgeUpdateV2_init(IBackedERC20 _token) internal onlyInitializing {
        __MockFiatBridgeUpdateV2_init_unchained(_token);
    }

    function __MockFiatBridgeUpdateV2_init_unchained(IBackedERC20 _token) internal onlyInitializing {
        token = _token;
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    // bridgeMint redefined in V2
    // passBridgeMint redefined in V2
    // _performMint redefined in V2

    function bridgeBurn(
        uint256 account,
        uint256 amount
    ) public onlyApprovedAccount(account) {
      require(amount >= minimumBurn, "FiatBridge: insufficient burn amount");

      // tokens are transferred to fee recipients; the remainder is burned.
      (uint256 fee, uint256 burnAmount) = calculateBurnFee(amount);
      uint256 unusedFee = fee;

      // mint fee
      uint256 feeTransferCount = feeRecipientCount();
      for (uint256 i = 0; i < feeTransferCount; i++) {
          (address recipient, uint256 shares) = feeRecipient(i);
          uint256 recipientFee = (fee * shares) / totalFeeShares;
          unusedFee -= recipientFee;
          // send
          token.transferFrom(msg.sender, recipient, recipientFee);
      }

      uint256 totalBurn = burnAmount + unusedFee;

      // burn from client
      token.burn(msg.sender, totalBurn);

      // record burning
      emit BridgeBurn(account, msg.sender, totalBurn);
    }

    function setMinimumBurn(uint256 _minimumBurn) external onlyAdmin {
        uint256 previousMinimum = minimumBurn;
        minimumBurn = _minimumBurn;
        emit MinimumBurnChanged(previousMinimum, minimumBurn);
    }

    function setFeeRecipients(address[] memory _recipients, uint256[] memory _shares) external onlyAdmin {
         _setFeeRecipients(_recipients, _shares);
    }

    function setFeeRecipientShares(address _recipient, uint256 _shares) external onlyAdmin {
        _setFeeRecipientShares(_recipient, _shares);
    }

    function setFee(
        uint256 _mintFeeFixed,
        uint256 _mintFeeRatioNumerator,
        uint256 _mintFeeRatioDenominator,
        uint256 _burnFeeFixed,
        uint256 _burnFeeRatioNumerator,
        uint256 _burnFeeRatioDenominator
    ) external onlyAdmin {
        _setMintFee(_mintFeeFixed, _mintFeeRatioNumerator, _mintFeeRatioDenominator);
        _setBurnFee(_burnFeeFixed, _burnFeeRatioNumerator, _burnFeeRatioDenominator);
    }

    function setVoteThreshold(uint256 _threshold) external onlyAdmin {
        _setVoteThreshold(_threshold);
    }

    function setAccountApproval(uint256[] calldata _accounts, bool _approved) external onlyApprover {
        for (uint256 i = 0; i < _accounts.length; i++) {
            accountApproved[_accounts[i]] = _approved;
        }

        for (uint256 i = 0; i < _accounts.length; i++) {
            emit AccountApprovalChanged(_accounts[i], _approved);
        }
    }

    modifier onlyApprovedAccount(uint256 _account) {
        require(accountApproved[_account], "FiatBridge: account not approved");
        _;
    }

    modifier onlyBridger() {
        require(hasRole(BRIDGER_ROLE, msg.sender), "FiatBridge: sender not bridger");
        _;
    }

    modifier onlyApprover() {
        require(hasRole(APPROVE_ROLE, msg.sender), "FiatBridge: sender not approver");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "FiatBridge: sender not admin");
        _;
    }

    // END OF FiatBridge IMPLEMENTATION

    // START OF UpdateV2 IMPLEMENTATION

    event BridgeMint(uint256 indexed account, address indexed to, uint256 amount, string transactionId);

    function bridgeMint(
        uint256 account,
        address to,
        uint256 amount,
        string memory transactionId
    ) external onlyBridger onlyApprovedAccount(account) {
        require(!transactionMinted[transactionId], "FiatBridge: transaction minted");
        if (_vote(to, amount, transactionId)) {
            _performMint(account, to, amount, transactionId);
        }
    }

    function passBridgeMint(
        uint256 account,
        address to,
        uint256 amount,
        string memory transactionId
    ) external onlyBridger onlyApprovedAccount(account) {
        require(!transactionMinted[transactionId], "FiatBridge: transaction minted");
        if (_pass(to, amount, transactionId)) {
            _performMint(account, to, amount, transactionId);
        }
    }

    function _performMint(uint256 account, address to, uint256 amount, string memory transactionId) internal {
        // tokens are minted to fee recipients; the remainder to the client.
        (uint256 fee, uint256 mintAmount) = calculateMintFee(amount);
        uint256 unusedFee = fee;

        // mint fee
        uint256 feeTransferCount = feeRecipientCount();
        for (uint256 i = 0; i < feeTransferCount; i++) {
            (address recipient, uint256 shares) = feeRecipient(i);
            uint256 recipientFee = (fee * shares) / totalFeeShares;
            unusedFee -= recipientFee;
            // mint
            token.mint(recipient, recipientFee);
        }

        // mint to client
        token.mint(to, mintAmount + unusedFee);

        // record minting
        transactionMinted[transactionId] = true;
        emit BridgeMint(account, to, amount, transactionId);
    }

    // END OF UpdateV2 IMPLEMENTATION
}
