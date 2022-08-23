// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

contract ConversionFee {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    uint256 private constant PRECISION = 1e20;

    uint256 public mintFeeFixed;
    uint256 public mintFeeRatio;    // PRECISION is applied

    uint256 public burnFeeFixed;
    uint256 public burnFeeRatio;    // PRECISION is applied

    EnumerableSetUpgradeable.AddressSet private _feeRecipients;
    mapping(address => uint256) private _feeShares;
    uint256 public totalFeeShares;

    event MintFeeChange(uint256 fixedFee, uint256 ratioNumerator, uint256 ratioDenominator);
    event BurnFeeChange(uint256 fixedFee, uint256 ratioNumerator, uint256 ratioDenominator);
    event FeeRecipientSharesChange(address indexed recipient, uint256 shares, uint256 totalShares);
    event FeeRecipientsCleared();

    function _setFeeRecipients(address[] memory recipients, uint256[] memory shares) internal {
        require(recipients.length == shares.length, "ConversionFee: array lengths must match");

        while (_feeRecipients.length() > 0) {
            address recipient = _feeRecipients.at(0);
            _feeShares[recipient] = 0;
            _feeRecipients.remove(recipient);
        }
        emit FeeRecipientsCleared();

        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            uint256 recipientShares = shares[i];

            require(recipientShares > 0, "ConversionFee: must set shares > 0");
            require(_feeShares[recipient] == 0, "ConversionFee: must not repeat recipients");

            _feeRecipients.add(recipient);
            _feeShares[recipient] = recipientShares;
            total += recipientShares;

            emit FeeRecipientSharesChange(recipient, recipientShares, total);
        }
        totalFeeShares = total;
    }

    function _setFeeRecipientShares(address recipient, uint256 shares) internal {
        if (_feeRecipients.contains(recipient) && shares == 0) {
            _feeRecipients.remove(recipient);
        } else if (!_feeRecipients.contains(recipient) && shares > 0) {
            _feeRecipients.add(recipient);
        }
        totalFeeShares = (totalFeeShares + shares) - _feeShares[recipient];
        _feeShares[recipient] = shares;

        emit FeeRecipientSharesChange(recipient, shares, totalFeeShares);
    }

    function _setMintFee(
        uint256 _fixed,
        uint256 _ratioNumerator,
        uint256 _ratioDenominator
    ) internal {
        require(_ratioNumerator <= _ratioDenominator, "ConversionFee: fee ratio must be <= 1");
        mintFeeFixed = _fixed;
        mintFeeRatio = (_ratioNumerator * PRECISION) / _ratioDenominator;
        emit MintFeeChange(_fixed, _ratioNumerator, _ratioDenominator);
    }

    function _setBurnFee(
        uint256 _fixed,
        uint256 _ratioNumerator,
        uint256 _ratioDenominator
    ) internal {
        require(_ratioNumerator <= _ratioDenominator, "ConversionFee: fee ratio must be <= 1");
        burnFeeFixed = _fixed;
        burnFeeRatio = (_ratioNumerator * PRECISION) / _ratioDenominator;
        emit BurnFeeChange(_fixed, _ratioNumerator, _ratioDenominator);
    }

    function calculateMintFee(uint256 amount) public view returns (uint256 fee, uint256 remaining) {
        fee = mintFeeFixed + ((amount - mintFeeFixed) * mintFeeRatio) / PRECISION;
        remaining = amount - fee;
    }

    function calculateBurnFee(uint256 amount) public view returns (uint256 fee, uint256 remaining) {
      fee = burnFeeFixed + ((amount - burnFeeFixed) * burnFeeRatio) / PRECISION;
      remaining = amount - fee;
    }

    function feeRecipientCount() public view returns (uint256) {
        return _feeRecipients.length();
    }

    function feeRecipient(uint256 index) public view returns (address recipient, uint256 shares) {
        recipient = _feeRecipients.at(index);
        shares = _feeShares[recipient];
    }
}
