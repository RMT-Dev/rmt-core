// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "./BridgeProposal.sol";
import "../fee/ConversionFee.sol";
import "../token/IBackedERC20.sol";

contract FiatBridge is Initializable, AccessControlEnumerableUpgradeable, ConversionFee, BridgeProposal {
    function initialize(IBackedERC20 _token) public virtual initializer {
        __FiatBridge_init(_token);
    }

    bytes32 public constant BRIDGER_ROLE = keccak256("BRIDGER_ROLE");
    bytes32 public constant APPROVE_ROLE = keccak256("APPROVE_ROLE");

    IBackedERC20 public token;
    mapping(string => bool) public transactionMinted;
    uint256 public minimumBurn;

    mapping(uint256 => bool) public accountApproved;

    event BridgeMint(address indexed to, uint256 amount, string transactionId);
    event BridgeBurn(uint256 indexed account, address indexed from, uint256 amount);
    event MinimumBurnChanged(uint256 previousMinimum, uint256 minimum);
    event AccountApprovalChanged(uint256 indexed account, bool approved);

    function __FiatBridge_init(IBackedERC20 _token) internal onlyInitializing {
        __FiatBridge_init_unchained(_token);
    }

    function __FiatBridge_init_unchained(IBackedERC20 _token) internal onlyInitializing {
        token = _token;
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * Vote to bridge fiat currency onto the chain as tokens. Specify the token
     * recipient `to`, the quantity of tokens `amount`, and the unique `transactionId`.
     * Once `voteThreshold` bridgers vote on a proposed minting with identical
     * arguments, the tokens will be minted and the transactionId locked. May
     * assess fees; use `calculateMintFee` to assess the amount in advance.
     *
     * Caller must have BRIDGER_ROLE, have not yet voted for this proposal,
     * and the provided transactionId must not have been minted. `amount` must
     * be sufficient to cover fees.
     *
     * Postcondition: the caller's vote is added to this proposal. If that pushed
     * it over the `voteThreshold`, mint the indicated quantity of tokens to the
     * indicated recipient. If minting fees
     * are applied, they will be taken out of the quantity minted, with the
     * remainder going to `to`.
     *
     * Emits:
     *   ProposalVote
     *   ProposalPassed if this vote passes the voteThresholds
     *   BridgeMint if tokens are minted
     */
    function bridgeMint(
        address to,
        uint256 amount,
        string memory transactionId
    ) external onlyBridger {
        require(!transactionMinted[transactionId], "FiatBridge: transaction minted");
        if (_vote(to, amount, transactionId)) {
            _performMint(to, amount, transactionId);
        }
    }

    /**
     * Pass the specified bridgeMint proposal without adding the caller's vote.
     * The proposal must have already accumulated enough votes to pass. Use this
     * function if `voteThreshold` is lowered after the proposal receives votes
     * and it now qualifies to be passed.
     *
     * Caller must have BRIDGER_ROLE and the provided transactionId must not have
     * been minted. `amount` must be sufficient to cover fees.
     *
     * Postcondition: if the proposal is already over the `voteThreshold`, mint the
     * indicated quantity of tokens to the indicated recipient. If minting fees
     * are applied, they will be taken out of the quantity minted, with the
     * remainder going to `to`.
     *
     * Emits:
     *   ProposalPassed if this vote passes the voteThresholds
     *   BridgeMint if tokens are minted
     */
    function passBridgeMint(address to, uint256 amount, string memory transactionId) external onlyBridger {
        require(!transactionMinted[transactionId], "FiatBridge: transaction minted");
        if (_pass(to, amount, transactionId)) {
            _performMint(to, amount, transactionId);
        }
    }

    function _performMint(address to, uint256 amount, string memory transactionId) internal {
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
        emit BridgeMint(to, amount, transactionId);
    }

    /**
     * Burn and/or remove the indicated quantity of tokens from the caller's wallet,
     * requesting a bridge conversion to fiat currency into the account numbered
     * `account`. At least the specified quantity of tokens must have been
     * `approve`d for transfer by this contract from the message sender's wallet.
     * May assesss fees; use `calculateBurnFee` to preview fee quantity.
     *
     * Caller must have at least `amount`tokens in their wallet, `approve`d for
     * transfer by this contract. `account` must have been recorded as a valid
     * account number for receiving fiat currency. `amount` must be sufficient to
     * cover fees and must meet or exceed `minimumBurn`.
     *
     * Postcondition: burns and/or transfers the indicated token quantity from
     * the caller's wallet. If fees are assessed, they are transferred from the
     * callers wallet; the remainder are burned.
     *
     * Emits:
     *    BridgeBurn for the amount of tokens actually burned (not counting fees).
     *      this is the quantity that should be issued to `account` in fiat.
     */
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

    /**
     * Sets the minimum burn quantity; the minimum amount users must convert from
     * token to fiat to be accepted by the bridge. Burn fees represent an implicit
     * minimum (amount must exceed the fixed burn fee); this explicit minimum
     * is useful to limit the number of low-value withdrawals that must be
     * processed by a fiat currency holder.
     *
     * Caller must have DEFAULT_ADMIN_ROLE.
     *
     * Postcondition: any `bridgeBurn` attempts must specify an amount greater
     * than or equal to `_minimumBurn`.
     *
     * Emits: MinimumBurnChanged
     */
    function setMinimumBurn(uint256 _minimumBurn) external onlyAdmin {
        uint256 previousMinimum = minimumBurn;
        minimumBurn = _minimumBurn;
        emit MinimumBurnChanged(previousMinimum, minimumBurn);
    }

    /**
     * Sets fee recipients; the account(s) to which fee payments are transferred,
     * and the share of the fee that goes to each.
     *
     * Caller must have DEFAULT_ADMIN_ROLE. `_recipients` and `_shares` must
     * have the same length.  `_recipients` must not repeat entries and `_shares`
     * must not contain zeroes.
     *
     * Postcondition: Future mints and burns will transfer fees to the recipient(s)
     * specified, proportional to their shares.
     *
     * Emits:
     *   FeeRecipientsCleared
     *   FeeRecipientSharesChange for each entry in `_recipients`
     */
    function setFeeRecipients(address[] memory _recipients, uint256[] memory _shares) external onlyAdmin {
         _setFeeRecipients(_recipients, _shares);
    }

    /**
     * Updates the fee share sent to the indicated recipient. If `_shares` == 0,
     * removes from fee recipient list.
     *
     * Caller must have DEFAULT_ADMIN_ROLE.
     *
     * Postcondition: the indicated recipient will receive a portion of minting
     * and burning fees proportional to their share.
     *
     * Emits:
     *   FeeRecipientSharesChange
     */
    function setFeeRecipientShares(address _recipient, uint256 _shares) external onlyAdmin {
        _setFeeRecipientShares(_recipient, _shares);
    }

    /**
     * Set the fees that will be assessed for each mint and burn operation.
     * Both are divided into a fixed component and a ratio, the latter of which
     * is applied to any token quantity left over after the fixed fee is deducted.
     *
     * All fees collected in this way are transferred to the fee recipients,
     * proportional to their share.
     *
     * Caller must have DEFAULT_ADMIN_ROLE. Fee ratios must be <= 1.
     *
     * Postcondition: minting and burning fees will have been updated to the
     * indicated values.
     *
     * Emits:
     *   MintFeeChange
     *   BurnFeeChange
     */
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

    /**
     * Sets the vote threshold for `bridgeMint` proposals. When this many votes
     * are received, the proposal passes and tokens are minted.
     *
     * Caller must have DEFAULT_ADMIN_ROLE.
     *
     * Postcondition: any future `bridgeMint` proposals will pass once they meet
     * or exceed this new vote threshold. Any pending proposals that now meet
     * the threshold may be passed with `passBridgeMint`. If the theshold is 0,
     * no proposals will pass until it is set to a nonzero value.
     *
     * Emits: ProposalThresholdChanged
     */
    function setVoteThreshold(uint256 _threshold) external onlyAdmin {
        _setVoteThreshold(_threshold);
    }

    /**
     * Sets "approval" for the indicated accounts. `bridgeBurn` requests must
     * specify a recipeint account that has been approved for use.
     *
     * Caller must have DEFAULT_ADMIN_ROLE.
     *
     * Postcondition: all specified `_accounts` will have their approved-for-burn
     * settings updated to `_approved`. If true, they may be used as targets
     * for `bridgeBurn`. If false, attempts to burn into those accounts will be
     * rejected.
     */
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
}
