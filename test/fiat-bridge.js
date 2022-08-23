const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

const BackedERC20 = artifacts.require('BackedERC20');
const FiatBridge = artifacts.require('FiatBridge');
const MockFiatBridgeUpdateV2 = artifacts.require('MockFiatBridgeUpdateV2');

const MAX_INT_STR = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

contract('FiatBridge', ([deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, tokenMinter]) => {
  const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
  const BURNER_ROLE = web3.utils.soliditySha3('BURNER_ROLE');

  const BRIDGER_ROLE = web3.utils.soliditySha3('BRIDGER_ROLE');
  const APPROVE_ROLE = web3.utils.soliditySha3('APPROVE_ROLE');

  beforeEach(async () => {
    // deployProxy cannot specify deployer address using { from }.
    // See https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/85
    this.token = await deployProxy(BackedERC20, ["FiatBackedCoin", "FBC"]);
    this.bridge = await deployProxy(FiatBridge, [this.token.address]);

    await this.token.grantRole(MINTER_ROLE, this.bridge.address, { from:deployer });
    await this.token.grantRole(BURNER_ROLE, this.bridge.address, { from:deployer });

    await this.bridge.grantRole(BRIDGER_ROLE, bridger_1, { from:deployer });
    await this.bridge.grantRole(BRIDGER_ROLE, bridger_2, { from:deployer });
    await this.bridge.grantRole(BRIDGER_ROLE, bridger_3, { from:deployer });

    await this.bridge.grantRole(APPROVE_ROLE, approver, { from:deployer });
  });

  async function testBasics(tester) {
    context('setMinimumBurn', () => {
      it('only admin', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.setMinimumBurn(2, { from:alice }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setMinimumBurn(2, { from:bridger_1 }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setMinimumBurn(2, { from:approver }),
          "FiatBridge: sender not admin"
        );

        await bridge.setMinimumBurn(2, { from:deployer });
        await bridge.setMinimumBurn(1000, { from:deployer });
      });

      it('alters "minimumBurn"', async () => {
        const { bridge } = tester;

        assert.equal(await bridge.minimumBurn(), '0');

        await bridge.setMinimumBurn(2, { from:deployer });
        assert.equal(await bridge.minimumBurn(), '2');

        await bridge.setMinimumBurn(3000, { from:deployer });
        assert.equal(await bridge.minimumBurn(), '3000');
      });

      it('emits "MinimumBurnChanged" event', async () => {
        const { bridge } = tester;
        let res;

        res = await bridge.setMinimumBurn(2, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'MinimumBurnChanged', { previousMinimum:'0', minimum:'2' });

        res = await bridge.setMinimumBurn(1000, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'MinimumBurnChanged', { previousMinimum:'2', minimum:'1000' });
      });
    });

    context('setFeeRecipients', () => {
      it('only admin', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.setFeeRecipients([alice, bob], [6, 2], { from:alice }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setFeeRecipients([alice, bob], [6, 2], { from:bridger_1 }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setFeeRecipients([alice, bob], [6, 2], { from:approver }),
          "FiatBridge: sender not admin"
        );

        await bridge.setFeeRecipients([alice, bob], [6, 2], { from:deployer });
        await bridge.setFeeRecipients([bob], [2], { from:deployer });
        await bridge.setFeeRecipients([alice, bob, carol], [1, 2, 3], { from:deployer });
      });

      it('alters "totalFeeShares", "feeRecipient", "feeRecipientCount", etc.', async () => {
        const { bridge } = tester;

        let result;

        assert.equal(await bridge.totalFeeShares(), '0');
        assert.equal(await bridge.feeRecipientCount(), '0');

        await bridge.setFeeRecipients([alice, bob], [6, 2], { from:deployer });
        assert.equal(await bridge.totalFeeShares(), '8');
        assert.equal(await bridge.feeRecipientCount(), '2');
        result = await bridge.feeRecipient(0);
        assert.equal(result.recipient, alice);
        assert.equal(result.shares, '6');
        result = await bridge.feeRecipient(1);
        assert.equal(result.recipient, bob);
        assert.equal(result.shares, '2');

        await bridge.setFeeRecipients([bob], [2], { from:deployer });
        assert.equal(await bridge.totalFeeShares(), '2');
        assert.equal(await bridge.feeRecipientCount(), '1');
        result = await bridge.feeRecipient(0);
        assert.equal(result.recipient, bob);
        assert.equal(result.shares, '2');

        await bridge.setFeeRecipients([alice, bob, carol], [1, 2, 3], { from:deployer });
        assert.equal(await bridge.totalFeeShares(), '6');
        assert.equal(await bridge.feeRecipientCount(), '3');
        result = await bridge.feeRecipient(0);
        assert.equal(result.recipient, alice);
        assert.equal(result.shares, '1');
        result = await bridge.feeRecipient(1);
        assert.equal(result.recipient, bob);
        assert.equal(result.shares, '2');
        result = await bridge.feeRecipient(2);
        assert.equal(result.recipient, carol);
        assert.equal(result.shares, '3');
      });

      it('emits "FeeRecipientsCleared" and "FeeRecipientSharesChange" events', async () => {
        const { bridge } = tester;
        let res;

        res = await bridge.setFeeRecipients([alice, bob], [6, 2], { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientsCleared');
        // openzeppelin tests doesn't easily expectEvents for multiple events of the same name

        res = await bridge.setFeeRecipients([bob], [2], { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientsCleared');
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientSharesChange', { recipient:bob, shares:'2', totalShares:'2' });

        res = await bridge.setFeeRecipients([alice, bob, carol], [1, 2, 3], { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientsCleared');
        // openzeppelin tests doesn't easily expectEvents for multiple events of the same name
      });
    });

    context('setFeeRecipientShares', () => {
      it('only admin', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.setFeeRecipientShares(alice, 10, { from:alice }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setFeeRecipientShares(alice, 10, { from:bridger_1 }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setFeeRecipientShares(alice, 10, { from:approver }),
          "FiatBridge: sender not admin"
        );

        await bridge.setFeeRecipientShares(alice, 6, { from:deployer });
        await bridge.setFeeRecipientShares(bob, 2, { from:deployer });
        await bridge.setFeeRecipientShares(alice, 0, { from:deployer });
      });

      it('alters "totalFeeShares", "feeRecipient", "feeRecipientCount", etc.', async () => {
        const { bridge } = tester;

        let result

        assert.equal(await bridge.totalFeeShares(), '0');
        assert.equal(await bridge.feeRecipientCount(), '0');

        await bridge.setFeeRecipientShares(alice, 6, { from:deployer });
        assert.equal(await bridge.totalFeeShares(), '6');
        assert.equal(await bridge.feeRecipientCount(), '1');
        result = await bridge.feeRecipient(0);
        assert.equal(result.recipient, alice);
        assert.equal(result.shares, '6');

        await bridge.setFeeRecipientShares(bob, 2, { from:deployer });
        assert.equal(await bridge.totalFeeShares(), '8');
        assert.equal(await bridge.feeRecipientCount(), '2');
        result = await bridge.feeRecipient(0);
        assert.equal(result.recipient, alice);
        assert.equal(result.shares, '6');
        result = await bridge.feeRecipient(1);
        assert.equal(result.recipient, bob);
        assert.equal(result.shares, '2');

        await bridge.setFeeRecipientShares(alice, 0, { from:deployer });
        assert.equal(await bridge.totalFeeShares(), '2');
        assert.equal(await bridge.feeRecipientCount(), '1');
        result = await bridge.feeRecipient(0);
        assert.equal(result.recipient, bob);
        assert.equal(result.shares, '2');
      });

      it('emits "FeeRecipientSharesChange" event', async () => {
        const { bridge } = tester;
        let res;

        res = await bridge.setFeeRecipientShares(alice, 6, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientSharesChange', { recipient:alice, shares:'6', totalShares:'6' });

        res = await bridge.setFeeRecipientShares(bob, 2, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientSharesChange', { recipient:bob, shares:'2', totalShares:'8' });

        res = await bridge.setFeeRecipientShares(alice, 0, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'FeeRecipientSharesChange', { recipient:alice, shares:'0', totalShares:'2' });
      });
    });

    context('setFee', () => {
      it('only admin', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.setFee(2, 1, 10, 5, 1, 5, { from:alice }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setFee(2, 1, 10, 5, 1, 5, { from:bridger_1 }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setFee(2, 1, 10, 5, 1, 5, { from:approver }),
          "FiatBridge: sender not admin"
        );

        await bridge.setFee(2, 1, 10, 5, 1, 5, { from:deployer });
        await bridge.setFee(0, 0, 1, 0, 0, 1, { from:deployer });
      });

      it('alters "mintFeeFixed", "mintFeeRatio", etc.', async () => {
        const { bridge } = tester;

        await bridge.setFee(2, 1, 10, 5, 1, 5, { from:deployer });
        assert.equal(await bridge.mintFeeFixed(), '2');
        assert.equal(await bridge.mintFeeRatio(), '10000000000000000000');  // precision is 1e20
        assert.equal(await bridge.burnFeeFixed(), '5');
        assert.equal(await bridge.burnFeeRatio(), '20000000000000000000');  // precision is 1e20

        await bridge.setFee(0, 0, 1, 10, 3, 100, { from:deployer });
        assert.equal(await bridge.mintFeeFixed(), '0');
        assert.equal(await bridge.mintFeeRatio(), '0');  // precision is 1e20
        assert.equal(await bridge.burnFeeFixed(), '10');
        assert.equal(await bridge.burnFeeRatio(), '3000000000000000000');  // precision is 1e20
      });

      it('emits "MintFeeChange", "BurnFeeChange" events', async () => {
        const { bridge } = tester;
        let res;

        res = await bridge.setFee(2, 1, 10, 5, 1, 5, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'MintFeeChange', { fixedFee:'2', ratioNumerator:'1', ratioDenominator:'10' });
        await expectEvent.inTransaction(res.tx, bridge, 'BurnFeeChange', { fixedFee:'5', ratioNumerator:'1', ratioDenominator:'5' });

        res = await bridge.setFee(0, 0, 1, 10, 3, 100, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'MintFeeChange', { fixedFee:'0', ratioNumerator:'0', ratioDenominator:'1' });
        await expectEvent.inTransaction(res.tx, bridge, 'BurnFeeChange', { fixedFee:'10', ratioNumerator:'3', ratioDenominator:'100' });
      });
    });

    context('setVoteThreshold', () => {
      it('only admin', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.setVoteThreshold(2, { from:alice }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setVoteThreshold(2, { from:bridger_1 }),
          "FiatBridge: sender not admin"
        );
        await expectRevert(
          bridge.setVoteThreshold(2, { from:approver }),
          "FiatBridge: sender not admin"
        );

        await bridge.setVoteThreshold(2, { from:deployer });
        await bridge.setVoteThreshold(1, { from:deployer });
      });

      it('alters "voteThreshold"', async () => {
        const { bridge } = tester;

        assert.equal(await bridge.voteThreshold(), '0');

        await bridge.setVoteThreshold(2, { from:deployer });
        assert.equal(await bridge.voteThreshold(), '2');

        await bridge.setVoteThreshold(3, { from:deployer });
        assert.equal(await bridge.voteThreshold(), '3');
      });

      it('emits "ProposalThresholdChanged" event', async () => {
        const { bridge } = tester;
        let res;

        res = await bridge.setVoteThreshold(2, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'ProposalThresholdChanged', { previousThreshold:'0', threshold:'2' });

        res = await bridge.setVoteThreshold(3, { from:deployer });
        await expectEvent.inTransaction(res.tx, bridge, 'ProposalThresholdChanged', { previousThreshold:'2', threshold:'3' });
      });
    });

    context('setAccountApproval', () => {
      it('only approver', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.setAccountApproval([1001, 1002], true, { from:deployer }),
          "FiatBridge: sender not approver"
        );
        await expectRevert(
          bridge.setAccountApproval([1001, 1002], false, { from:alice }),
          "FiatBridge: sender not approver"
        );
        await expectRevert(
          bridge.setAccountApproval([1001, 1002], true, { from:bridger_1 }),
          "FiatBridge: sender not approver"
        );

        await bridge.setAccountApproval([1001, 1002, 1003], true, { from:approver });
        await bridge.setAccountApproval([1002], false, { from:approver });
      });

      it('adds to "accountApproved"', async () => {
        const { bridge } = tester;

        assert.equal(await bridge.accountApproved(0), false);
        assert.equal(await bridge.accountApproved(1), false);
        assert.equal(await bridge.accountApproved(1001), false);
        assert.equal(await bridge.accountApproved(1002), false);
        assert.equal(await bridge.accountApproved(1003), false);

        await bridge.setAccountApproval([1, 1001, 1002], true, { from:approver });

        assert.equal(await bridge.accountApproved(0), false);
        assert.equal(await bridge.accountApproved(1), true);
        assert.equal(await bridge.accountApproved(1001), true);
        assert.equal(await bridge.accountApproved(1002), true);
        assert.equal(await bridge.accountApproved(1003), false);

        let res = await bridge.setAccountApproval([1001], false, { from:approver });
        await expectEvent.inTransaction(res.tx, bridge, 'AccountApprovalChanged', { account:'1001', approved:false });

        assert.equal(await bridge.accountApproved(0), false);
        assert.equal(await bridge.accountApproved(1), true);
        assert.equal(await bridge.accountApproved(1001), false);
        assert.equal(await bridge.accountApproved(1002), true);
        assert.equal(await bridge.accountApproved(1003), false);

        await bridge.setAccountApproval([1002, 1003], true, { from:approver });
        assert.equal(await bridge.accountApproved(0), false);
        assert.equal(await bridge.accountApproved(1), true);
        assert.equal(await bridge.accountApproved(1001), false);
        assert.equal(await bridge.accountApproved(1002), true);
        assert.equal(await bridge.accountApproved(1003), true);
      });
    });
  }

  async function testBridgeMint(tester) {
    context('bridgeMint', () => {
      beforeEach(async () => {
        const { bridge } = tester;

        await bridge.setVoteThreshold(2, { from:deployer });
      });

      it('only bridger', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:deployer }),
          "FiatBridge: sender not bridger"
        );
        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:alice }),
          "FiatBridge: sender not bridger"
        );
        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:approver }),
          "FiatBridge: sender not bridger"
        );

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(bob, 25, "tx_2", { from:bridger_2 });
      });

      it('revert if voteThreshold == 0', async () => {
        const { bridge } = tester;

        await bridge.setVoteThreshold(0, { from:deployer });

        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 }),
          "BridgeProposal: threshold not > 0"
        );
      });

      it('voting emits ProposalVote event', async () => {
        const { bridge } = tester;
        let res;

        res = await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1',
          voter: bridger_1,
          count: '1',
          threshold: '2'
        });

        res = await bridge.bridgeMint(bob, 75, "tx_2", { from:bridger_2 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: bob,
          amount: '75',
          transactionId: 'tx_2',
          voter: bridger_2,
          count: '1',
          threshold: '2'
        });

        res = await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1',
          voter: bridger_2,
          count: '2',
          threshold: '2'
        });

        await bridge.setVoteThreshold(3, { from:deployer });
        res = await bridge.bridgeMint(alice, 150, "tx_3", { from:bridger_3 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: alice,
          amount: '150',
          transactionId: 'tx_3',
          voter: bridger_3,
          count: '1',
          threshold: '3'
        });

        await bridge.setVoteThreshold(1, { from:deployer });
        res = await bridge.bridgeMint(carol, 20, "tx_4", { from:bridger_3 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: carol,
          amount: '20',
          transactionId: 'tx_4',
          voter: bridger_3,
          count: '1',
          threshold: '1'
        });
      });

      it('passing vote emits ProposalPassed event', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        res = await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1'
        });

        await bridge.setVoteThreshold(1, { from:deployer });
        res = await bridge.bridgeMint(bob, 75, "tx_2", { from:bridger_3 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: bob,
          amount: '75',
          transactionId: 'tx_2'
        });
      });

      it('reverts if already voted', async () => {
        const { bridge } = tester;
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 }),
          "BridgeProposal: already voted"
        );
      });

      it('reverts if passed', async () => {
        const { bridge } = tester;
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );
      });

      it('passing vote updates "transactionMinted"', async () => {
        const { bridge } = tester;

        assert.equal(await bridge.transactionMinted('tx_1'), false);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
        assert.equal(await bridge.transactionMinted('tx_1'), false);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.bridgeMint(alice, 50, 'tx_2', { from:bridger_2 });
        assert.equal(await bridge.transactionMinted('tx_1'), false);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_3 });
        assert.equal(await bridge.transactionMinted('tx_1'), true);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.bridgeMint(alice, 50, 'tx_2', { from:bridger_3 });
        assert.equal(await bridge.transactionMinted('tx_1'), true);
        assert.equal(await bridge.transactionMinted('tx_2'), true);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.setVoteThreshold(1, { from:deployer });

        await bridge.bridgeMint(carol, 77, 'tx_3', { from:bridger_3 });
        assert.equal(await bridge.transactionMinted('tx_1'), true);
        assert.equal(await bridge.transactionMinted('tx_2'), true);
        assert.equal(await bridge.transactionMinted('tx_3'), true);
      });

      it('vote only counts towards total if transactionId matches', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });

        res = await bridge.bridgeMint(alice, 100, 'tx_1_b', { from:bridger_2 });
        assert.equal(await bridge.transactionMinted('tx_1'), false);
        assert.equal(await bridge.transactionMinted('tx_1_b'), false);
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1_b',
          voter: bridger_2,
          count: '1',
          threshold: '2'
        });
      });

      it('vote only counts towards total if recipient matches', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });

        res = await bridge.bridgeMint(bob, 100, 'tx_1', { from:bridger_2 });
        assert.equal(await bridge.transactionMinted('tx_1'), false);
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: bob,
          amount: '100',
          transactionId: 'tx_1',
          voter: bridger_2,
          count: '1',
          threshold: '2'
        });
      });

      it('vote only counts towards total if amount matches', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });

        res = await bridge.bridgeMint(alice, 99, 'tx_1', { from:bridger_2 });
        assert.equal(await bridge.transactionMinted('tx_1'), false);
        await expectEvent.inTransaction(res.tx, bridge, "ProposalVote", {
          to: alice,
          amount: '99',
          transactionId: 'tx_1',
          voter: bridger_2,
          count: '1',
          threshold: '2'
        });
      });

      it('vote reverts if transactionId already minted, even if other fields differ', async () => {
        const { bridge } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });

        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );

        await expectRevert(
          bridge.bridgeMint(alice, 99, "tx_1", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );

        await expectRevert(
          bridge.bridgeMint(bob, 100, "tx_1", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );

        await expectRevert(
          bridge.bridgeMint(bob, 50, "tx_1", { from:bridger_1 }),
          "FiatBridge: transaction minted"
        );

        await expectRevert(
          bridge.bridgeMint(bob, 50, "tx_1", { from:bridger_2 }),
          "FiatBridge: transaction minted"
        );

        await expectRevert(
          bridge.bridgeMint(bob, 50, "tx_1", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );
      });

      it('voting w/o passing does not change token balances', async () => {
        const { bridge, token } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(alice, 100, "tx_2", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(bob, 50, "tx_3", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.setVoteThreshold(3, { from:deployer });

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(alice, 100, "tx_2", { from:bridger_2 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(bob, 50, "tx_3", { from:bridger_2 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');
      });

      it('passing proposal mints the indicated amount to the indicated recipient', async () => {
        const { bridge, token } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        assert.equal(await token.totalSupply(), '100');
        assert.equal(await token.balanceOf(alice), '100');

        await bridge.setVoteThreshold(1, { from:deployer });
        await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_3 });
        assert.equal(await token.totalSupply(), '150');
        assert.equal(await token.balanceOf(alice), '100');
        assert.equal(await token.balanceOf(bob), '50');

        await bridge.setVoteThreshold(3, { from:deployer });
        await bridge.bridgeMint(carol, 77, "tx_3", { from:bridger_3 });
        assert.equal(await token.totalSupply(), '150');
        assert.equal(await token.balanceOf(alice), '100');
        assert.equal(await token.balanceOf(bob), '50');

        await bridge.setVoteThreshold(2, { from:deployer });
        await bridge.bridgeMint(carol, 77, "tx_3", { from:bridger_2 });
        assert.equal(await token.totalSupply(), '227');
        assert.equal(await token.balanceOf(alice), '100');
        assert.equal(await token.balanceOf(bob), '50');
        assert.equal(await token.balanceOf(carol), '77');
      });

      it('when transactionIds compete, the first-to-threshold wins', async () => {
        const { bridge, token } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_2 });
        await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_3 });
        await expectRevert(
          bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 }),
          "FiatBridge: transaction minted"
        );
        assert.equal(await token.totalSupply(), '66');
        assert.equal(await token.balanceOf(alice), '0');
        assert.equal(await token.balanceOf(bob), '66');
        assert.equal(await token.balanceOf(carol), '0');

        await bridge.setVoteThreshold(3, { from:deployer });

        await bridge.bridgeMint(alice, 10, "tx_2", { from:bridger_1 });
        await bridge.bridgeMint(bob, 11, "tx_2", { from:bridger_2 });
        await bridge.bridgeMint(carol, 12, "tx_2", { from:bridger_3 });

        await bridge.bridgeMint(alice, 10, "tx_2", { from:bridger_2 });
        await bridge.bridgeMint(bob, 11, "tx_2", { from:bridger_3 });
        await bridge.bridgeMint(carol, 12, "tx_2", { from:bridger_1 });

        await bridge.bridgeMint(carol, 12, "tx_2", { from:bridger_2 });
        await expectRevert(
          bridge.bridgeMint(bob, 11, "tx_2", { from:bridger_1 }),
          "FiatBridge: transaction minted"
        );
        await expectRevert(
          bridge.bridgeMint(alice, 10, "tx_2", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );
        assert.equal(await token.totalSupply(), '78');
        assert.equal(await token.balanceOf(alice), '0');
        assert.equal(await token.balanceOf(bob), '66');
        assert.equal(await token.balanceOf(carol), '12');
      });

      context('with fees', async () => {
        beforeEach(async () => {
          const { bridge } = tester;

          // minting fee: 50 up front, 10% of the rest
          await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

          // 10% of fee to carol
          // 20% to dave
          // 70% to bridger_1
          // (all round down)
          await bridge.setFeeRecipients([carol, dave, bridger_1], [1, 2, 7], { from:deployer });

          // e.g. mint 150
          // fee is 55
          // 5 to to carol,
          // 11 to dave
          // 38 to bridger_1
          // totaling 54, so 96 goes to recipient.
        });

        it('reverts for fee larger than amount', async () => {
          const { bridge } = tester;
          await bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_1 });
          await expectRevert.unspecified(bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_2 }));
        });

        it('succeeds for exact fee amount; mints nothing to intended recipient', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_2 });

          assert.equal(await token.totalSupply(), '50');
          assert.equal(await token.balanceOf(alice), '0');
          assert.equal(await token.balanceOf(carol), '5');
          assert.equal(await token.balanceOf(dave), '10');
          assert.equal(await token.balanceOf(bridger_1), '35');
        });

        it('succeeds for fee amount + 1', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });

          assert.equal(await token.totalSupply(), '51');
          assert.equal(await token.balanceOf(alice), '1');
          assert.equal(await token.balanceOf(carol), '5');
          assert.equal(await token.balanceOf(dave), '10');
          assert.equal(await token.balanceOf(bridger_1), '35');
        });

        it('succeeds for fee amount + 10', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_2 });

          assert.equal(await token.totalSupply(), '60');
          assert.equal(await token.balanceOf(alice), '10');
          assert.equal(await token.balanceOf(carol), '5');  // 10% of 51
          assert.equal(await token.balanceOf(dave), '10');  // 20% of 51
          assert.equal(await token.balanceOf(bridger_1), '35'); // 70% of 51
        });

        it('succeeds for fee amount + 50', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });

          assert.equal(await token.totalSupply(), '100');
          assert.equal(await token.balanceOf(alice), '46');
          assert.equal(await token.balanceOf(carol), '5');  // 10% of 55
          assert.equal(await token.balanceOf(dave), '11');  // 20% of 55
          assert.equal(await token.balanceOf(bridger_1), '38'); // 70% of 55
        });

        it('succeeds for fee amount + 100', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });

          assert.equal(await token.totalSupply(), '150');
          assert.equal(await token.balanceOf(alice), '90');
          assert.equal(await token.balanceOf(carol), '6');  // 10% of 60
          assert.equal(await token.balanceOf(dave), '12');  // 20% of 60
          assert.equal(await token.balanceOf(bridger_1), '42'); // 70% of 60
        });

        it('succeeds for fee amount + 1000', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });

          assert.equal(await token.totalSupply(), '1050');
          assert.equal(await token.balanceOf(alice), '900');
          assert.equal(await token.balanceOf(carol), '15');  // 10% of 150
          assert.equal(await token.balanceOf(dave), '30');  // 20% of 150
          assert.equal(await token.balanceOf(bridger_1), '105'); // 70% of 150
        });

        it('succeeds after fee change', async () => {
          const { bridge, token } = tester;

          await bridge.setFee(10, 1, 4, 0, 1, 2, { from:deployer });
          await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [4, 6, 10]);
          await bridge.setFeeRecipientShares(bridger_3, 0);

          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
          // 10 base fee + 25% of 140 = 45

          assert.equal(await token.totalSupply(), '150');
          assert.equal(await token.balanceOf(alice), '105');
          assert.equal(await token.balanceOf(bridger_1), '18');  // 40% of 45
          assert.equal(await token.balanceOf(bridger_2), '27');  // 60% of 45
        });

        it('passing vote emits ProposalPassed event for requested mint amount', async () => {
          const { bridge } = tester;
          let res;

          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
          res = await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });

          await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
            to: alice,
            amount: '1050',
            transactionId: 'tx_1'
          });

          await expectEvent.inTransaction(res.tx, bridge, "BridgeMint", {
            to: alice,
            amount: '1050',
            transactionId: 'tx_1'
          });
        });
      });
    });
  }

  async function testPassBridgeMint(tester) {
    context('passBridgeMint', () => {
      beforeEach(async () => {
        const { bridge } = tester;

        await bridge.setVoteThreshold(3, { from:deployer });
      });

      it('only bridger', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:deployer }),
          "FiatBridge: sender not bridger"
        );
        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:alice }),
          "FiatBridge: sender not bridger"
        );
        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:approver }),
          "FiatBridge: sender not bridger"
        );

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await bridge.setVoteThreshold(2, { from:deployer });

        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:deployer }),
          "FiatBridge: sender not bridger"
        );
        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:alice }),
          "FiatBridge: sender not bridger"
        );
        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:approver }),
          "FiatBridge: sender not bridger"
        );
      });

      it('revert if voteThreshold == 0', async () => {
        const { bridge } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });

        await bridge.setVoteThreshold(0, { from:deployer });

        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_2 }),
          "BridgeProposal: threshold not > 0"
        );

        await expectRevert(
          bridge.passBridgeMint(bob, 50, "tx_2", { from:bridger_2 }),
          "BridgeProposal: threshold not > 0"
        );
      });

      it('passing vote emits ProposalPassed event', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });

        await bridge.setVoteThreshold(2, { from:deployer });

        res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1'
        });

        await bridge.bridgeMint(bob, 120, "tx_2", { from:bridger_1 });
        await bridge.setVoteThreshold(1, { from:deployer });
        res = await bridge.passBridgeMint(bob, 120, "tx_2", { from:bridger_1 });
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: bob,
          amount: '120',
          transactionId: 'tx_2'
        });
      });

      it('reverts if passed', async () => {
        const { bridge } = tester;
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await bridge.setVoteThreshold(2, { from:deployer });
        await bridge.passBridgeMint(alice, 100, "tx_1", {  from:bridger_1 });
        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );

        await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_1 });
        await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_2 });
        await expectRevert(
          bridge.passBridgeMint(bob, 50, "tx_2", { from:bridger_1 }),
          "FiatBridge: transaction minted"
        );
      });

      it('passing updates "transactionMinted"', async () => {
        const { bridge } = tester;

        assert.equal(await bridge.transactionMinted('tx_1'), false);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await bridge.setVoteThreshold(2, { from:deployer });

        assert.equal(await bridge.transactionMinted('tx_1'), false);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);

        await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_3 });

        assert.equal(await bridge.transactionMinted('tx_1'), true);
        assert.equal(await bridge.transactionMinted('tx_2'), false);
        assert.equal(await bridge.transactionMinted('tx_3'), false);
      });

      it('passBridgeMint only passes if transactionId matches', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_2 });
        await bridge.setVoteThreshold(2, { from:deployer });
        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_2", { from:bridger_1 }),
          "BridgeProposal: not passable"
        );
        res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        assert.equal(await bridge.transactionMinted('tx_1'), true);
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1'
        });
      });

      it('passBridgeMint only passes if recipient matches', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_2 });
        await bridge.setVoteThreshold(2, { from:deployer });
        await expectRevert(
          bridge.passBridgeMint(bob, 100, "tx_1", { from:bridger_1 }),
          "BridgeProposal: not passable"
        );
        res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        assert.equal(await bridge.transactionMinted('tx_1'), true);
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1'
        });
      });

      it('passBridgeMint only passes if amount matches', async () => {
        const { bridge } = tester;
        let res;

        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_2 });
        await bridge.setVoteThreshold(2, { from:deployer });
        await expectRevert(
          bridge.passBridgeMint(alice, 50, "tx_1", { from:bridger_1 }),
          "BridgeProposal: not passable"
        );
        res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        assert.equal(await bridge.transactionMinted('tx_1'), true);
        await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
          to: alice,
          amount: '100',
          transactionId: 'tx_1'
        });
      });

      it('passing proposal mints the indicated amount to the indicated recipient', async () => {
        const { bridge, token } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');

        await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '0');
        assert.equal(await token.balanceOf(alice), '0');
        assert.equal(await token.balanceOf(bob), '0');

        await bridge.setVoteThreshold(2, { from:deployer });
        await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_3 });
        assert.equal(await token.totalSupply(), '100');
        assert.equal(await token.balanceOf(alice), '100');
        assert.equal(await token.balanceOf(bob), '0');

        await bridge.setVoteThreshold(1, { from:deployer });
        await bridge.passBridgeMint(bob, 50, "tx_2", { from:bridger_1 });
        assert.equal(await token.totalSupply(), '150');
        assert.equal(await token.balanceOf(alice), '100');
        assert.equal(await token.balanceOf(bob), '50');
      });

      it('when transactionIds compete, the first-to-pass wins', async () => {
        const { bridge, token } = tester;

        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
        await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
        await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_2 });
        await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_3 });

        await bridge.setVoteThreshold(2, { from:deployer });

        await bridge.passBridgeMint(bob, 66, "tx_1", { from:bridger_3 });

        await expectRevert(
          bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_2 }),
          "FiatBridge: transaction minted"
        );

        assert.equal(await token.totalSupply(), '66');
        assert.equal(await token.balanceOf(alice), '0');
        assert.equal(await token.balanceOf(bob), '66');
        assert.equal(await token.balanceOf(carol), '0');

        await bridge.setVoteThreshold(3, { from:deployer });

        await bridge.bridgeMint(alice, 10, "tx_2", { from:bridger_1 });
        await bridge.bridgeMint(bob, 11, "tx_2", { from:bridger_2 });
        await bridge.bridgeMint(carol, 12, "tx_2", { from:bridger_3 });

        await bridge.bridgeMint(alice, 10, "tx_2", { from:bridger_2 });
        await bridge.bridgeMint(bob, 11, "tx_2", { from:bridger_3 });
        await bridge.bridgeMint(carol, 12, "tx_2", { from:bridger_1 });

        await bridge.setVoteThreshold(2, { from:deployer });

        await bridge.passBridgeMint(carol, 12, "tx_2", { from:bridger_2 });
        await expectRevert(
          bridge.passBridgeMint(bob, 11, "tx_2", { from:bridger_1 }),
          "FiatBridge: transaction minted"
        );
        await expectRevert(
          bridge.passBridgeMint(alice, 10, "tx_2", { from:bridger_3 }),
          "FiatBridge: transaction minted"
        );
        assert.equal(await token.totalSupply(), '78');
        assert.equal(await token.balanceOf(alice), '0');
        assert.equal(await token.balanceOf(bob), '66');
        assert.equal(await token.balanceOf(carol), '12');
      });

      context('with fees', async () => {
        beforeEach(async () => {
          const { bridge } = tester;

          // minting fee: 50 up front, 10% of the rest
          await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

          // 10% of fee to carol
          // 20% to dave
          // 70% to bridger_1
          // (all round down)
          await bridge.setFeeRecipients([carol, dave, bridger_1], [1, 2, 7], { from:deployer });

          // e.g. mint 150
          // fee is 55
          // 5 to to carol,
          // 11 to dave
          // 38 to bridger_1
          // totaling 54, so 96 goes to recipient.
        });

        it('reverts for fee larger than amount', async () => {
          const { bridge } = tester;
          await bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await expectRevert.unspecified(bridge.passBridgeMint(alice, 50, "tx_1", { from:bridger_3 }));
        });

        it('succeeds for exact fee amount; mints nothing to intended recipient', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 50, "tx_1", { from:bridger_3 });

          assert.equal(await token.totalSupply(), '50');
          assert.equal(await token.balanceOf(alice), '0');
          assert.equal(await token.balanceOf(carol), '5');
          assert.equal(await token.balanceOf(dave), '10');
          assert.equal(await token.balanceOf(bridger_1), '35');
        });

        it('succeeds for fee amount + 1', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 51, "tx_1", { from:bridger_3 });

          assert.equal(await token.totalSupply(), '51');
          assert.equal(await token.balanceOf(alice), '1');
          assert.equal(await token.balanceOf(carol), '5');
          assert.equal(await token.balanceOf(dave), '10');
          assert.equal(await token.balanceOf(bridger_1), '35');
        });

        it('succeeds for fee amount + 10', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 60, "tx_1", { from:bridger_3 });

          assert.equal(await token.totalSupply(), '60');
          assert.equal(await token.balanceOf(alice), '10');
          assert.equal(await token.balanceOf(carol), '5');  // 10% of 51
          assert.equal(await token.balanceOf(dave), '10');  // 20% of 51
          assert.equal(await token.balanceOf(bridger_1), '35'); // 70% of 51
        });

        it('succeeds for fee amount + 50', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_3 });

          assert.equal(await token.totalSupply(), '100');
          assert.equal(await token.balanceOf(alice), '46');
          assert.equal(await token.balanceOf(carol), '5');  // 10% of 55
          assert.equal(await token.balanceOf(dave), '11');  // 20% of 55
          assert.equal(await token.balanceOf(bridger_1), '38'); // 70% of 55
        });

        it('succeeds for fee amount + 100', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 150, "tx_1", { from:bridger_3 });

          assert.equal(await token.totalSupply(), '150');
          assert.equal(await token.balanceOf(alice), '90');
          assert.equal(await token.balanceOf(carol), '6');  // 10% of 60
          assert.equal(await token.balanceOf(dave), '12');  // 20% of 60
          assert.equal(await token.balanceOf(bridger_1), '42'); // 70% of 60
        });

        it('succeeds for fee amount + 1000', async () => {
          const { bridge, token } = tester;
          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 1050, "tx_1", { from:bridger_3 });

          assert.equal(await token.totalSupply(), '1050');
          assert.equal(await token.balanceOf(alice), '900');
          assert.equal(await token.balanceOf(carol), '15');  // 10% of 150
          assert.equal(await token.balanceOf(dave), '30');  // 20% of 150
          assert.equal(await token.balanceOf(bridger_1), '105'); // 70% of 150
        });

        it('succeeds after fee change', async () => {
          const { bridge, token } = tester;

          await bridge.setFee(10, 1, 4, 0, 1, 2, { from:deployer });
          await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [4, 6, 10]);
          await bridge.setFeeRecipientShares(bridger_3, 0);

          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          await bridge.passBridgeMint(alice, 150, "tx_1", { from:bridger_3 });
          // 10 base fee + 25% of 140 = 45

          assert.equal(await token.totalSupply(), '150');
          assert.equal(await token.balanceOf(alice), '105');
          assert.equal(await token.balanceOf(bridger_1), '18');  // 40% of 45
          assert.equal(await token.balanceOf(bridger_2), '27');  // 60% of 45
        });

        it('passing vote emits ProposalPassed event for requested mint amount', async () => {
          const { bridge } = tester;
          let res;

          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
          await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });
          await bridge.setVoteThreshold(2, { from:deployer });
          res = await bridge.passBridgeMint(alice, 1050, "tx_1", { from:bridger_1 });

          await expectEvent.inTransaction(res.tx, bridge, "ProposalPassed", {
            to: alice,
            amount: '1050',
            transactionId: 'tx_1'
          });

          await expectEvent.inTransaction(res.tx, bridge, "BridgeMint", {
            to: alice,
            amount: '1050',
            transactionId: 'tx_1'
          });
        });
      });
    });
  }

  async function testBridgeBurn(tester) {
    context('bridgeBurn', async () => {
      const balance = 10000;

      beforeEach(async () => {
        const { bridge, token } = tester;

        // mint tokens
        await token.grantRole(MINTER_ROLE, tokenMinter, { from:deployer });

        await token.mint(alice, balance, { from:tokenMinter });
        await token.mint(bob, balance, { from:tokenMinter });
        await token.mint(carol, balance, { from:tokenMinter });
        await token.mint(dave, balance, { from:tokenMinter });

        // approve tokens
        await token.approve(bridge.address, MAX_INT_STR, { from:alice });
        await token.approve(bridge.address, MAX_INT_STR, { from:bob });
        await token.approve(bridge.address, MAX_INT_STR, { from:carol });
        await token.approve(bridge.address, MAX_INT_STR, { from:dave });

        // approve accounts
        await bridge.setAccountApproval([1001, 1002, 1003, 1004], true, { from:approver });
      });

      it('reverts for non-approved account', async () => {
        const { bridge } = tester;

        await expectRevert(
          bridge.bridgeBurn(1000, 1000, { from:alice }),
          "FiatBridge: account not approved"
        );

        await expectRevert(
          bridge.bridgeBurn(1005, 1, { from:bob }),
          "FiatBridge: account not approved"
        );

        await expectRevert(
          bridge.bridgeBurn(0, 5, { from:carol }),
          "FiatBridge: account not approved"
        );

        await expectRevert(
          bridge.bridgeBurn(1, 1, { from:dave }),
          "FiatBridge: account not approved"
        );
      });

      it('reverts for amount below minimum burn', async () => {
        const { bridge } = tester;

        await bridge.setMinimumBurn(100, { from:deployer });

        await expectRevert(
          bridge.bridgeBurn(1001, 1, { from:alice }),
          "FiatBridge: insufficient burn amount"
        );

        await expectRevert(
          bridge.bridgeBurn(1002, 10, { from:bob }),
          "FiatBridge: insufficient burn amount"
        );

        await expectRevert(
          bridge.bridgeBurn(1003, 90, { from:carol }),
          "FiatBridge: insufficient burn amount"
        );

        await expectRevert(
          bridge.bridgeBurn(1004, 99, { from:dave }),
          "FiatBridge: insufficient burn amount"
        );
      });

      it('reverts for insufficient balance', async () => {
        const { bridge } = tester;

        await expectRevert.unspecified(
          bridge.bridgeBurn(1001, balance + 1, { from:alice })
        );

        await expectRevert.unspecified(
          bridge.bridgeBurn(1002, balance + 10, { from:bob })
        );

        await expectRevert.unspecified(
          bridge.bridgeBurn(1003, balance + 1000, { from:carol })
        );

        await expectRevert.unspecified(
          bridge.bridgeBurn(1004, balance * 10, { from:dave })
        );
      });

      it('reverts for insufficient allowance', async () => {
        const { bridge, token } = tester;

        const allowance = balance / 2;
        await token.approve(bridge.address, allowance, { from:alice });
        await expectRevert.unspecified(
          bridge.bridgeBurn(1001, allowance + 1, { from:alice })
        );

        await token.approve(bridge.address, allowance, { from:bob });
        await expectRevert.unspecified(
          bridge.bridgeBurn(1002, allowance + 10, { from:bob })
        );

        await token.approve(bridge.address, allowance, { from:carol });
        await expectRevert.unspecified(
          bridge.bridgeBurn(1002, balance, { from:carol })
        );
      });

      it('destroys tokens on success', async () => {
        const { bridge, token } = tester;

        assert.equal(await token.totalSupply(), `${balance * 4}`);

        await bridge.bridgeBurn(1001, 14, { from:alice });
        assert.equal(await token.totalSupply(), `${balance * 4 - 14}`);
        assert.equal(await token.balanceOf(alice), `${balance - 14}`);

        await bridge.bridgeBurn(1002, 100, { from:bob });
        assert.equal(await token.totalSupply(), `${balance * 4 - (14 + 100)}`);
        assert.equal(await token.balanceOf(alice), `${balance - 14}`);
        assert.equal(await token.balanceOf(bob), `${balance - 100}`);

        await bridge.setMinimumBurn(balance / 2, { from:deployer });

        await bridge.bridgeBurn(1003, balance, { from:carol });
        assert.equal(await token.totalSupply(), `${balance * 3 - (14 + 100)}`);
        assert.equal(await token.balanceOf(alice), `${balance - 14}`);
        assert.equal(await token.balanceOf(bob), `${balance - 100}`);
        assert.equal(await token.balanceOf(carol), `0`);

        await bridge.bridgeBurn(1004, balance / 2, { from:dave });
        assert.equal(await token.totalSupply(), `${balance * 3 - (14 + 100 + balance / 2)}`);
        assert.equal(await token.balanceOf(alice), `${balance - 14}`);
        assert.equal(await token.balanceOf(bob), `${balance - 100}`);
        assert.equal(await token.balanceOf(carol), `0`);
        assert.equal(await token.balanceOf(dave), `${balance / 2}`);
      });

      it('emits BridgeBurn event on success', async () => {
        const { bridge, token } = tester;
        let res;

        assert.equal(await token.totalSupply(), `${balance * 4}`);

        res = await bridge.bridgeBurn(1001, 14, { from:alice });
        await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
          account: '1001',
          from: alice,
          amount: '14'
        });

        res = await bridge.bridgeBurn(1002, 100, { from:bob });
        await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
          account: '1002',
          from: bob,
          amount: '100'
        });

        await bridge.setMinimumBurn(balance / 2, { from:deployer });

        res = await bridge.bridgeBurn(1003, balance, { from:carol });
        await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
          account: '1003',
          from: carol,
          amount: `${balance}`
        });

        res = await bridge.bridgeBurn(1004, balance / 2, { from:dave });
        await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
          account: '1004',
          from: dave,
          amount: `${balance / 2}`
        });
      });

      context('with fees', async () => {
        beforeEach(async () => {
          const { bridge } = tester;

          // burning fee: 50 up front, 10% of the rest
          await bridge.setFee(100, 3, 7, 50, 1, 10, { from:deployer });

          // 10% of fee to carol
          // 20% to dave
          // 70% to bridger_1
          // (all round down)
          await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [1, 2, 7], { from:deployer });

          // e.g. burn 150
          // fee is 55
          // 5 to to carol,
          // 11 to dave
          // 38 to bridger_1
          // totaling 54, so 96 goes to recipient.
        });

        it('reverts for fee larger than amount', async () => {
          const { bridge } = tester;
          await expectRevert.unspecified(bridge.bridgeBurn(1001, 49, { from:alice }));
        });

        it('succeeds for exact fee amount', async () => {
          const { bridge, token } = tester;
          const res = await bridge.bridgeBurn(1002, 50, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4}`);
          assert.equal(await token.balanceOf(alice), `${balance - 50}`);
          assert.equal(await token.balanceOf(bridger_1), '5');
          assert.equal(await token.balanceOf(bridger_2), '10');
          assert.equal(await token.balanceOf(bridger_3), '35');

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1002',
            from: alice,
            amount: '0'
          });
        });

        it('succeeds for fee amount + 1', async () => {
          const { bridge, token } = tester;
          const res = await bridge.bridgeBurn(1002, 51, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4 - 1}`);
          assert.equal(await token.balanceOf(alice), `${balance - 51}`);
          assert.equal(await token.balanceOf(bridger_1), '5');
          assert.equal(await token.balanceOf(bridger_2), '10');
          assert.equal(await token.balanceOf(bridger_3), '35');

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1002',
            from: alice,
            amount: '1'
          });
        });

        it('succeeds for fee amount + 10', async () => {
          const { bridge, token } = tester;
          const res = await bridge.bridgeBurn(1002, 60, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4 - 10}`);
          assert.equal(await token.balanceOf(alice), `${balance - 60}`);
          assert.equal(await token.balanceOf(bridger_1), '5');  // 10% of 51
          assert.equal(await token.balanceOf(bridger_2), '10');  // 20% of 51
          assert.equal(await token.balanceOf(bridger_3), '35'); // 70% of 51

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1002',
            from: alice,
            amount: '10'
          });
        });

        it('succeeds for fee amount + 50', async () => {
          const { bridge, token } = tester;
          const res = await bridge.bridgeBurn(1003, 100, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4 - 46}`);
          assert.equal(await token.balanceOf(alice), `${balance - 100}`);
          assert.equal(await token.balanceOf(bridger_1), '5');  // 10% of 55
          assert.equal(await token.balanceOf(bridger_2), '11');  // 20% of 55
          assert.equal(await token.balanceOf(bridger_3), '38'); // 70% of 55

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1003',
            from: alice,
            amount: '46'
          });
        });

        it('succeeds for fee amount + 100', async () => {
          const { bridge, token } = tester;
          const res = await bridge.bridgeBurn(1004, 150, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4 - 90}`);
          assert.equal(await token.balanceOf(alice), `${balance - 150}`);
          assert.equal(await token.balanceOf(bridger_1), '6');  // 10% of 60
          assert.equal(await token.balanceOf(bridger_2), '12');  // 20% of 60
          assert.equal(await token.balanceOf(bridger_3), '42'); // 70% of 60

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1004',
            from: alice,
            amount: '90'
          });
        });

        it('succeeds for fee amount + 1000', async () => {
          const { bridge, token } = tester;
          const res = await bridge.bridgeBurn(1004, 1050, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4 - 900}`);
          assert.equal(await token.balanceOf(alice), `${balance - 1050}`);
          assert.equal(await token.balanceOf(bridger_1), '15');  // 10% of 150
          assert.equal(await token.balanceOf(bridger_2), '30');  // 20% of 150
          assert.equal(await token.balanceOf(bridger_3), '105'); // 70% of 150

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1004',
            from: alice,
            amount: '900'
          });
        });

        it('succeeds after fee change', async () => {
          const { bridge, token } = tester;

          await bridge.setFee(0, 1, 2, 10, 1, 4, { from:deployer });
          await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [4, 6, 10]);
          await bridge.setFeeRecipientShares(bridger_3, 0);

          const res = await bridge.bridgeBurn(1004, 150, { from:alice });
          // 10 base fee + 25% of 140 = 45

          assert.equal(await token.totalSupply(), `${balance * 4 - 105}`);
          assert.equal(await token.balanceOf(alice), `${balance - 150}`);
          assert.equal(await token.balanceOf(bridger_1), '18');  // 40% of 45
          assert.equal(await token.balanceOf(bridger_2), '27');  // 60% of 45

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1004',
            from: alice,
            amount: '105'
          });
        });

        it('minimumBurn does not affect token transfers or event emitted', async () => {
          const { bridge, token } = tester;
          await bridge.setMinimumBurn(950, { from:deployer });
          const res = await bridge.bridgeBurn(1004, 1050, { from:alice });

          assert.equal(await token.totalSupply(), `${balance * 4 - 900}`);
          assert.equal(await token.balanceOf(alice), `${balance - 1050}`);
          assert.equal(await token.balanceOf(bridger_1), '15');  // 10% of 150
          assert.equal(await token.balanceOf(bridger_2), '30');  // 20% of 150
          assert.equal(await token.balanceOf(bridger_3), '105'); // 70% of 150

          await expectEvent.inTransaction(res.tx, bridge, "BridgeBurn", {
            account: '1004',
            from: alice,
            amount: '900'
          });
        });
      });
    });
  }

  testBasics(this);
  testBridgeMint(this);
  testPassBridgeMint(this);
  testBridgeBurn(this);

  context('upgrades', () => {
    it('can upgrade', async () => {
      const { bridge, token } = this;

      const upgrade = await upgradeProxy(bridge.address, MockFiatBridgeUpdateV2, [token.address]);

      assert.equal(upgrade.address, bridge.address);
    });

    it('upgrading retains state', async () => {
      const { bridge, token } = this;

      await bridge.setMinimumBurn(400, { from:deployer });
      await bridge.setAccountApproval([1001, 1002], true, { from:approver });
      await bridge.setVoteThreshold(2, { from:deployer });

      await bridge.bridgeMint(alice, 1000, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 1000, "tx_1", { from:bridger_2 });
      await bridge.bridgeMint(bob, 500, "tx_2", { from:bridger_1 });

      const upgrade = await upgradeProxy(bridge.address, MockFiatBridgeUpdateV2, [token.address]);

      assert.equal(await upgrade.transactionMinted("tx_1"), true);
      assert.equal(await upgrade.transactionMinted("tx_2"), false);
      assert.equal(await upgrade.minimumBurn(), '400');

      await expectRevert(
        upgrade.bridgeMint(1001, alice, 1000, "tx_1", { from:bridger_3 }),
        "FiatBridge: transaction minted"
      );

      await expectRevert(
        upgrade.bridgeMint(1001, bob, 500, "tx_2", { from:bridger_1 }),
        "BridgeProposal: already voted"
      );
    });

    it('upgrading updates functions', async () => {
      const { bridge, token } = this;

      await bridge.setMinimumBurn(400, { from:deployer });
      await bridge.setAccountApproval([1001, 1002], true, { from:approver });
      await bridge.setVoteThreshold(2, { from:deployer });

      await bridge.bridgeMint(alice, 1000, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 1000, "tx_1", { from:bridger_2 });
      await bridge.bridgeMint(bob, 500, "tx_2", { from:bridger_1 });

      const upgrade = await upgradeProxy(bridge.address, MockFiatBridgeUpdateV2, [token.address]);

      assert.equal(await upgrade.transactionMinted("tx_1"), true);
      assert.equal(await upgrade.transactionMinted("tx_2"), false);
      assert.equal(await upgrade.minimumBurn(), '400');

      await expectRevert(
        upgrade.bridgeMint(1001, alice, 1000, "tx_1", { from:bridger_3 }),
        "FiatBridge: transaction minted"
      );

      await expectRevert(
        upgrade.bridgeMint(1001, bob, 500, "tx_2", { from:bridger_1 }),
        "BridgeProposal: already voted"
      );

      const res = await upgrade.bridgeMint(1001, bob, 500, "tx_2", { from:bridger_2 });
      assert.equal(await upgrade.transactionMinted("tx_2"), true);
      assert.equal(await token.balanceOf(bob), '500');

      await expectEvent.inTransaction(res.tx, upgrade, "ProposalPassed", {
        to: bob,
        amount: '500',
        transactionId: "tx_2"
      });

      await expectEvent.inTransaction(res.tx, upgrade, "BridgeMint", {
        account: '1001',
        to: bob,
        amount: '500',
        transactionId: "tx_2"
      });
    });

    context('expected functionality after upgrade', () => {
      beforeEach(async () => {
        this.bridge = await upgradeProxy(this.bridge.address, MockFiatBridgeUpdateV2, [this.token.addresss]);
      });

      testBasics(this);
      testBridgeBurn(this);
    });
  });
});
