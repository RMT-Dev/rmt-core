// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

contract BridgeProposal {
    uint256 public voteThreshold;

    mapping(bytes32 => bool) private passed;
    mapping(bytes32 => uint256) private voteCount;
    mapping(bytes32 => mapping(address => bool)) private voted;

    event ProposalThresholdChanged(uint256 previousThreshold, uint256 threshold);
    event ProposalVote(
        address indexed to,
        uint256 amount,
        string transactionId,
        address indexed voter,
        uint256 count,
        uint256 threshold
    );
    event ProposalPassed(address indexed to, uint256 amount, string transactionId);

    function _setVoteThreshold(uint256 _threshold) internal {
        uint256 oldT = voteThreshold;
        voteThreshold = _threshold;
        emit ProposalThresholdChanged(oldT, _threshold);
    }

    function _vote(address to, uint256 amount, string memory transactionId) internal returns (bool) {
        require(voteThreshold > 0, "BridgeProposal: threshold not > 0");

        bytes32 proposalCode = keccak256(abi.encodePacked(to, amount, transactionId));
        require(!passed[proposalCode], "BridgeProposal: already passed");
        require(!voted[proposalCode][msg.sender], "BridgeProposal: already voted");

        voted[proposalCode][msg.sender] = true;
        voteCount[proposalCode]++;

        emit ProposalVote(to, amount, transactionId, msg.sender, voteCount[proposalCode], voteThreshold);

        return _checkPass(to, amount, transactionId, proposalCode);
    }

    function _pass(address to, uint256 amount, string memory transactionId) internal returns (bool) {
        require(voteThreshold > 0, "BridgeProposal: threshold not > 0");

        bytes32 proposalCode = keccak256(abi.encodePacked(to, amount, transactionId));
        require(!passed[proposalCode], "BridgeProposal: already passed");

        bool didPass = _checkPass(to, amount, transactionId, proposalCode);
        require(didPass, "BridgeProposal: not passable");
        return true;
    }

    function _isPassed(address to, uint256 amount, string memory transactionId) internal view returns (bool) {
        bytes32 proposalCode = keccak256(abi.encodePacked(to, amount, transactionId));
        return passed[proposalCode];
    }

    function _checkPass(address to, uint256 amount, string memory transactionId, bytes32 proposalCode) private returns (bool) {
        if (!passed[proposalCode] && voteCount[proposalCode] >= voteThreshold) {
            passed[proposalCode] = true;
            emit ProposalPassed(to, amount, transactionId);
        }
        return passed[proposalCode];
    }
}
