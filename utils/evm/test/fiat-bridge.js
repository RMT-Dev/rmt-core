const MAX_INT_STR = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function basics(tester, opts = {}) {
  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  it('tester context should have appropriate symbols', async () => {
    assert.ok(tester, "should have truthy input parameter");

    const env = ["web3"];
    const contracts = ["token", "bridge"];
    const addresses = ["deployer", "alice", "bob", "carol", "dave", "bridger_1", "bridger_2", "bridger_3", "approver", "minter"];
    const fields = [...env, ...contracts,  ...addresses];

    // check field existence
    for (const field of fields) {
      assert.ok(tester[field], `should have field '${field}' defined`)
    }

    // check web3 object
    const web3 = tester["web3"];
    assert.ok(web3.eth, "'web3' doesn't have 'eth' subfield");
    assert.ok(web3.utils, "'web3' doesn't have 'utils' subfield");

    // check that addresses are addresses
    for (const addr of addresses) {
      assert.ok(await web3.utils.isAddress(tester[addr]), `'${addr}' is not a valid address: ${tester[addr]}`);
    }

    // check that contract looks like a contract
    const token = tester["token"];
    assert.ok(await web3.utils.isAddress(token.address), `'token' does not have valid 'address' field`);
    assert.ok(token.balanceOf, "'token' does not have 'balanceOf' field");
    assert.ok(token.transfer, "'token' does not have 'transfer' field");
    // TODO: more examination?

    const bridge = tester["bridge"];
    assert.ok(await web3.utils.isAddress(bridge.address), `'bridge' does not havve valid 'address' field`);
    assert.ok(bridge.bridgeMint, "'bridge' does not have 'bridgeMint'")
  });

  context('setMinimumBurn', () => {
    it('only admin', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      assert.equal(await bridge.minimumBurn(), '0');

      await bridge.setMinimumBurn(2, { from:deployer });
      assert.equal(await bridge.minimumBurn(), '2');

      await bridge.setMinimumBurn(3000, { from:deployer });
      assert.equal(await bridge.minimumBurn(), '3000');
    });

    it('emits "MinimumBurnChanged" event', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      res = await bridge.setMinimumBurn(2, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'MinimumBurnChanged', { previousMinimum:'0', minimum:'2' });

      res = await bridge.setMinimumBurn(1000, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'MinimumBurnChanged', { previousMinimum:'2', minimum:'1000' });
    });
  });

  context('setFeeRecipients', () => {
    it('only admin', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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

    it('reverts for zero-shared recipient', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await expectRevert(
        bridge.setFeeRecipients([alice, bob], [6, 0], { from:deployer }),
        "ConversionFee: must set shares > 0"
      );
      await expectRevert(
        bridge.setFeeRecipients([alice], [0], { from:deployer }),
        "ConversionFee: must set shares > 0"
      );
    });

    it('reverts for repeated recipient', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await expectRevert(
        bridge.setFeeRecipients([alice, bob, alice], [6, 1, 6], { from:deployer }),
        "ConversionFee: must not repeat recipients"
      );
      await expectRevert(
        bridge.setFeeRecipients([alice, bob, alice], [6, 1, 4], { from:deployer }),
        "ConversionFee: must not repeat recipients"
      );
    });

    it('alters "totalFeeShares", "feeRecipient", "feeRecipientCount", etc.', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      let result;

      assert.equal(await bridge.totalFeeShares(), '0');
      assert.equal(await bridge.feeRecipientCount(), '0');

      await bridge.setFeeRecipients([alice, bob, carol], [6, 2, 1], { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '9');
      assert.equal(await bridge.feeRecipientCount(), '3');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(alice));
      assert.equal(result["1"], '6');
      result = sanitize(await bridge.feeRecipient(1));
      assert.equal(result["0"], sanitize(bob));
      assert.equal(result["1"], '2');
      result = sanitize(await bridge.feeRecipient(2));
      assert.equal(result["0"], sanitize(carol));
      assert.equal(result["1"], '1');

      await bridge.setFeeRecipients([], [], { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '0');
      assert.equal(await bridge.feeRecipientCount(), '0');

      await bridge.setFeeRecipients([bob], [3], { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '3');
      assert.equal(await bridge.feeRecipientCount(), '1');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(bob));
      assert.equal(result["1"], '3');

      await bridge.setFeeRecipients([alice, bob, carol], [1, 2, 3], { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '6');
      assert.equal(await bridge.feeRecipientCount(), '3');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(alice));
      assert.equal(result["1"], '1');
      result = sanitize(await bridge.feeRecipient(1));
      assert.equal(result["0"], sanitize(bob));
      assert.equal(result["1"], '2');
      result = sanitize(await bridge.feeRecipient(2));
      assert.equal(result["0"], sanitize(carol));
      assert.equal(result["1"], '3');

      // note -- full replacement can be expensive. instead, two-step this
      // test: clear the recipients then set more. specific testing environments,
      // configured for longer-running transactions, can implement their own tests
      // for larger operations (such as by removing the calls with "[]" arguments)
      await bridge.setFeeRecipients([], [], { from:deployer });
      await bridge.setFeeRecipients([alice, bob], [3, 3], { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '6');
      assert.equal(await bridge.feeRecipientCount(), '2');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(alice));
      assert.equal(result["1"], '3');
      result = sanitize(await bridge.feeRecipient(1));
      assert.equal(result["0"], sanitize(bob));
      assert.equal(result["1"], '3');
    });

    it('emits "FeeRecipientSharesChange" events', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      res = await bridge.setFeeRecipients([alice, bob], [6, 2], { from:deployer });
      // openzeppelin tests doesn't easily expectEvents for multiple events of the same name

      res = await bridge.setFeeRecipients([bob], [2], { from:deployer });
      // await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:bob, shares:'2', totalShares:'2' });

      res = await bridge.setFeeRecipients([], [], { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:bob, shares:'0', totalShares:'0' });

      res = await bridge.setFeeRecipients([alice], [5], { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:alice, shares:'5', totalShares:'5' });

      res = await bridge.setFeeRecipients([alice], [4], { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:alice, shares:'4', totalShares:'4' });
    });
  });

  context('setFeeRecipientShares', () => {
    it('only admin', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      let result

      assert.equal(await bridge.totalFeeShares(), '0');
      assert.equal(await bridge.feeRecipientCount(), '0');

      await bridge.setFeeRecipientShares(alice, 6, { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '6');
      assert.equal(await bridge.feeRecipientCount(), '1');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(alice));
      assert.equal(result["1"], '6');

      await bridge.setFeeRecipientShares(bob, 2, { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '8');
      assert.equal(await bridge.feeRecipientCount(), '2');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(alice));
      assert.equal(result["1"], '6');
      result = sanitize(await bridge.feeRecipient(1));
      assert.equal(result["0"], sanitize(bob));
      assert.equal(result["1"], '2');

      await bridge.setFeeRecipientShares(alice, 0, { from:deployer });
      assert.equal(await bridge.totalFeeShares(), '2');
      assert.equal(await bridge.feeRecipientCount(), '1');
      result = sanitize(await bridge.feeRecipient(0));
      assert.equal(result["0"], sanitize(bob));
      assert.equal(result["1"], '2');
    });

    it('emits "FeeRecipientSharesChange" event', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      res = await bridge.setFeeRecipientShares(alice, 6, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:alice, shares:'6', totalShares:'6' });

      res = await bridge.setFeeRecipientShares(bob, 2, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:bob, shares:'2', totalShares:'8' });

      res = await bridge.setFeeRecipientShares(alice, 0, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'FeeRecipientSharesChange', { recipient:alice, shares:'0', totalShares:'2' });
    });
  });

  context('setFee', () => {
    it('only admin', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      res = await bridge.setFee(2, 1, 10, 5, 1, 5, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'MintFeeChange', { fixedFee:'2', ratioNumerator:'1', ratioDenominator:'10' });
      await expectEvent.inTransaction(res.tx || res, bridge, 'BurnFeeChange', { fixedFee:'5', ratioNumerator:'1', ratioDenominator:'5' });

      res = await bridge.setFee(0, 0, 1, 10, 3, 100, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'MintFeeChange', { fixedFee:'0', ratioNumerator:'0', ratioDenominator:'1' });
      await expectEvent.inTransaction(res.tx || res, bridge, 'BurnFeeChange', { fixedFee:'10', ratioNumerator:'3', ratioDenominator:'100' });
    });
  });

  context('setVoteThreshold', () => {
    it('only admin', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      assert.equal(await bridge.voteThreshold(), '0');

      await bridge.setVoteThreshold(2, { from:deployer });
      assert.equal(await bridge.voteThreshold(), '2');

      await bridge.setVoteThreshold(3, { from:deployer });
      assert.equal(await bridge.voteThreshold(), '3');
    });

    it('emits "ProposalThresholdChanged" event', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      res = await bridge.setVoteThreshold(2, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'ProposalThresholdChanged', { previousThreshold:'0', threshold:'2' });

      res = await bridge.setVoteThreshold(3, { from:deployer });
      await expectEvent.inTransaction(res.tx || res, bridge, 'ProposalThresholdChanged', { previousThreshold:'2', threshold:'3' });
    });
  });

  context('setAccountApproval', () => {
    it('only approver', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      await expectEvent.inTransaction(res.tx || res, bridge, 'AccountApprovalChanged', { account:'1001', approved:false });

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

function bridgeMint(tester, opts = {}) {
  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  context('bridgeMint', () => {
    let autoMint;

    beforeEach(async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      autoMint = await bridge.autoMint();

      await bridge.setVoteThreshold(2, { from:deployer });
    });

    it('only bridger', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.setVoteThreshold(0, { from:deployer });

      await expectRevert(
        bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 }),
        "BridgeProposal: threshold not > 0"
      );
    });

    it('voting emits ProposalVote event', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      res = await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1',
        voter: bridger_1,
        count: '1',
        threshold: '2'
      });

      res = await bridge.bridgeMint(bob, 75, "tx_2", { from:bridger_2 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: bob,
        amount: '75',
        transactionId: 'tx_2',
        voter: bridger_2,
        count: '1',
        threshold: '2'
      });

      res = await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1',
        voter: bridger_2,
        count: '2',
        threshold: '2'
      });

      await bridge.setVoteThreshold(3, { from:deployer });
      res = await bridge.bridgeMint(alice, 150, "tx_3", { from:bridger_3 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: alice,
        amount: '150',
        transactionId: 'tx_3',
        voter: bridger_3,
        count: '1',
        threshold: '3'
      });

      await bridge.setVoteThreshold(1, { from:deployer });
      res = await bridge.bridgeMint(carol, 20, "tx_4", { from:bridger_3 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: carol,
        amount: '20',
        transactionId: 'tx_4',
        voter: bridger_3,
        count: '1',
        threshold: '1'
      });
    });

    it('passing vote emits ProposalPassed event', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      res = await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1'
      });

      await bridge.setVoteThreshold(1, { from:deployer });
      res = await bridge.bridgeMint(bob, 75, "tx_2", { from:bridger_3 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: bob,
        amount: '75',
        transactionId: 'tx_2'
      });
    });

    it('reverts if already voted', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await expectRevert(
        bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 }),
        "BridgeProposal: already voted"
      );
    });

    it('reverts if passed', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.setAutoMint(false, { from:deployer });

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await expectRevert(
        bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_3 }),
        "BridgeProposal: already passed"
      );
    });

    it('reverts if minted', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });
      await expectRevert(
        bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_3 }),
        "FiatBridge: transaction minted"
      );
    });

    it('passing and minting vote updates "transactionMinted"', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      if (!autoMint) await bridge.performMint(alice, 100, 'tx_1', { from:alice });
      assert.equal(await bridge.transactionMinted('tx_1'), true);
      assert.equal(await bridge.transactionMinted('tx_2'), false);
      assert.equal(await bridge.transactionMinted('tx_3'), false);

      await bridge.bridgeMint(alice, 50, 'tx_2', { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 50, 'tx_2', { from:alice });
      assert.equal(await bridge.transactionMinted('tx_1'), true);
      assert.equal(await bridge.transactionMinted('tx_2'), true);
      assert.equal(await bridge.transactionMinted('tx_3'), false);

      await bridge.setVoteThreshold(1, { from:deployer });

      await bridge.bridgeMint(carol, 77, 'tx_3', { from:bridger_3 });
      if (!autoMint) await bridge.performMint(carol, 77, 'tx_3', { from:alice });
      assert.equal(await bridge.transactionMinted('tx_1'), true);
      assert.equal(await bridge.transactionMinted('tx_2'), true);
      assert.equal(await bridge.transactionMinted('tx_3'), true);
    });

    it('vote only counts towards total if transactionId matches', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });

      res = await bridge.bridgeMint(alice, 100, 'tx_1_b', { from:bridger_2 });
      assert.equal(await bridge.transactionMinted('tx_1'), false);
      assert.equal(await bridge.transactionMinted('tx_1_b'), false);
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1_b',
        voter: bridger_2,
        count: '1',
        threshold: '2'
      });
    });

    it('vote only counts towards total if recipient matches', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });

      res = await bridge.bridgeMint(bob, 100, 'tx_1', { from:bridger_2 });
      assert.equal(await bridge.transactionMinted('tx_1'), false);
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: bob,
        amount: '100',
        transactionId: 'tx_1',
        voter: bridger_2,
        count: '1',
        threshold: '2'
      });
    });

    it('vote only counts towards total if amount matches', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });

      res = await bridge.bridgeMint(alice, 99, 'tx_1', { from:bridger_2 });
      assert.equal(await bridge.transactionMinted('tx_1'), false);
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalVote", {
        to: alice,
        amount: '99',
        transactionId: 'tx_1',
        voter: bridger_2,
        count: '1',
        threshold: '2'
      });
    });

    it('vote reverts if transactionId already minted, even if other fields differ', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 100, 'tx_1', { from:alice });

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.setAutoMint(true, { from:deployer });

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      assert.equal(await token.totalSupply(), '0');
      assert.equal(await token.balanceOf(alice), '0');

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 100, 'tx_1', { from:alice });
      assert.equal(await token.totalSupply(), '100');
      assert.equal(await token.balanceOf(alice), '100');

      await bridge.setVoteThreshold(1, { from:deployer });
      await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(bob, 50, 'tx_2', { from:alice });
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
      if (!autoMint) await bridge.performMint(carol, 77, 'tx_3', { from:alice });
      assert.equal(await token.totalSupply(), '227');
      assert.equal(await token.balanceOf(alice), '100');
      assert.equal(await token.balanceOf(bob), '50');
      assert.equal(await token.balanceOf(carol), '77');
    });

    it('when transactionIds compete, the first-to-threshold wins', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_2 });
      await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(bob, 66, 'tx_1', { from:alice });
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
      if (!autoMint) await bridge.performMint(carol, 12, 'tx_2', { from:alice });
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

    it('succeeds for zero ', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      // minting fee: 50 up front, 10% of the rest
      await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

      // 100% of fee to carol
      await bridge.setFeeRecipients([], [], { from:deployer });

      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 51, "tx_1");

      assert.equal(await token.totalSupply(), '51');
      assert.equal(await token.balanceOf(alice), '51');
    });

    it('succeeds for one fee recipient', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      // minting fee: 50 up front, 10% of the rest
      await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

      // 100% of fee to carol
      await bridge.setFeeRecipients([carol], [1], { from:deployer });

      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 51, "tx_1");

      assert.equal(await token.totalSupply(), '51');
      assert.equal(await token.balanceOf(alice), '1');
      assert.equal(await token.balanceOf(carol), '50');
    });

    it('succeeds for two ', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      // minting fee: 50 up front, 10% of the rest
      await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

      // 10% of fee to carol
      // 90% of fee to dave
      await bridge.setFeeRecipients([carol, dave], [1, 9], { from:deployer });

      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 51, "tx_1");

      assert.equal(await token.totalSupply(), '51');
      assert.equal(await token.balanceOf(alice), '1');
      assert.equal(await token.balanceOf(carol), '5');
      assert.equal(await token.balanceOf(dave), '45');
    });
  });
}

function bridgeMintWithFees(recipientCount, tester, opts = {}) {
  if (recipientCount <= 0 || 4 <= recipientCount ) {
    throw new Error(`bridgeMintWithFees supports recipientCounts {1, 2, 3}, not ${recipientCount}`)
  }

  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  context(`bridgeMint with ${recipientCount} fee recipient(s)`, () => {
    let autoMint;
    beforeEach(async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      autoMint = await bridge.autoMint();

      await bridge.setVoteThreshold(2, { from:deployer });
      // minting fee: 50 up front, 10% of the rest
      await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

      if (recipientCount == 1) {
        // 100% of fee to carol
        await bridge.setFeeRecipients([carol], [1], { from:deployer });
      } else if (recipientCount == 2) {
        // 10% of fee to carol
        // 90% of fee to dave
        await bridge.setFeeRecipients([carol, dave], [1, 9], { from:deployer });
      } else {
        // 10% of fee to carol
        // 20% of fee to dave
        // 70% of fee to minter
        await bridge.setFeeRecipients([carol, dave, minter], [1, 2, 7], { from:deployer });
      }
    });

    it('reverts for fee larger than amount', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_1 });
      if (autoMint) {
        await expectRevert.unspecified(bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_2 }));
      } else {
        await bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_2 });
        await expectRevert.unspecified(bridge.performMint(alice, 49, "tx_1"));
      }
    });

    it('succeeds for exact fee amount; mints nothing to intended recipient', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 50, "tx_1");

      assert.equal(await token.totalSupply(), '50');
      assert.equal(await token.balanceOf(alice), '0');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '50');
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '45');
      } else {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '10');
        assert.equal(await token.balanceOf(minter), '35');
      }
    });

    it('succeeds for fee amount + 1', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 51, "tx_1");

      assert.equal(await token.totalSupply(), '51');
      assert.equal(await token.balanceOf(alice), '1');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '50');
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '45');
      } else {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '10');
        assert.equal(await token.balanceOf(minter), '35');
      }
    });

    it('succeeds for fee amount + 10', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 60, "tx_1");

      assert.equal(await token.totalSupply(), '60');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(alice), '9');
        assert.equal(await token.balanceOf(carol), '51');  // 100% of 51
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(alice), '10');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 51
        assert.equal(await token.balanceOf(dave), '45');  // 90% of 51
      } else {
        assert.equal(await token.balanceOf(alice), '10');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 51
        assert.equal(await token.balanceOf(dave), '10');  // 20% of 51
        assert.equal(await token.balanceOf(minter), '35'); // 70% of 51
      }
    });

    it('succeeds for fee amount + 50', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1");

      assert.equal(await token.totalSupply(), '100');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(alice), '45');
        assert.equal(await token.balanceOf(carol), '55');  // 100% of 55
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(alice), '46');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 55
        assert.equal(await token.balanceOf(dave), '49');  // 90% of 55
      } else {
        assert.equal(await token.balanceOf(alice), '46');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 55
        assert.equal(await token.balanceOf(dave), '11');  // 20% of 55
        assert.equal(await token.balanceOf(minter), '38'); // 70% of 55
      }
    });

    it('succeeds for fee amount + 100', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 150, "tx_1");

      assert.equal(await token.totalSupply(), '150');
      assert.equal(await token.balanceOf(alice), '90');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '60');  // 100% of 60
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '6');  // 10% of 60
        assert.equal(await token.balanceOf(dave), '54');  // 90% of 60
      } else {
        assert.equal(await token.balanceOf(carol), '6');  // 10% of 60
        assert.equal(await token.balanceOf(dave), '12');  // 20% of 60
        assert.equal(await token.balanceOf(minter), '42'); // 70% of 60
      }

    });

    it('succeeds for fee amount + 1000', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 1050, "tx_1");

      assert.equal(await token.totalSupply(), '1050');
      assert.equal(await token.balanceOf(alice), '900');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '150');  // 100% of 150
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '15');  // 10% of 150
        assert.equal(await token.balanceOf(dave), '135');  // 90% of 150
      } else {
        assert.equal(await token.balanceOf(carol), '15');  // 10% of 150
        assert.equal(await token.balanceOf(dave), '30');  // 20% of 150
        assert.equal(await token.balanceOf(minter), '105'); // 70% of 150
      }
    });

    it('succeeds after fee change', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.setFee(10, 1, 4, 0, 1, 2, { from:deployer });
      await bridge.setFeeRecipients([], [], { from:deployer });
      await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [4, 6, 10], { from:deployer });
      if (recipientCount == 1) {
        await bridge.setFeeRecipientShares(bridger_2, 0);
        await bridge.setFeeRecipientShares(bridger_3, 0);
        assert.equal(await bridge.feeRecipientCount(), '1');
      } else if (recipientCount == 2) {
        await bridge.setFeeRecipientShares(bridger_3, 0);
        assert.equal(await bridge.feeRecipientCount(), '2');
      }

      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
      if (!autoMint) await bridge.performMint(alice, 150, "tx_1");
      // 10 base fee + 25% of 140 = 45

      assert.equal(await token.totalSupply(), '150');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(alice), '105');
        assert.equal(await token.balanceOf(bridger_1), '45');  // 100% of 45
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(alice), '105');
        assert.equal(await token.balanceOf(bridger_1), '18');  // 40% of 45
        assert.equal(await token.balanceOf(bridger_2), '27');  // 60% of 45
      } else {
        assert.equal(await token.balanceOf(alice), '106');
        assert.equal(await token.balanceOf(bridger_1), '9');   // 20% of 45
        assert.equal(await token.balanceOf(bridger_2), '13');  // 30% of 45
        assert.equal(await token.balanceOf(bridger_3), '22');  // 50% of 45
      }
    });

    it('passing vote emits ProposalPassed event for requested mint amount', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
      res = await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });

      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '1050',
        transactionId: 'tx_1'
      });

      if (!autoMint) {
        res = await bridge.performMint(alice, 1050, "tx_1");
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeMint", {
        to: alice,
        amount: '1050',
        transactionId: 'tx_1'
      });
    });
  });
}

function passBridgeMint(tester, opts = {}) {
  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  context('passBridgeMint', () => {
    let autoMint;

    beforeEach(async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      autoMint = await bridge.autoMint();

      await bridge.setVoteThreshold(3, { from:deployer });
    });

    it('only bridger', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });

      await bridge.setVoteThreshold(2, { from:deployer });

      res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1'
      });

      await bridge.bridgeMint(bob, 120, "tx_2", { from:bridger_1 });
      await bridge.setVoteThreshold(1, { from:deployer });
      res = await bridge.passBridgeMint(bob, 120, "tx_2", { from:bridger_1 });
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: bob,
        amount: '120',
        transactionId: 'tx_2'
      });
    });

    it('reverts if passed', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.setAutoMint(false, { from:deployer  })
      await bridge.passBridgeMint(alice, 100, "tx_1", {  from:bridger_1 });
      await expectRevert(
        bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_3 }),
        "BridgeProposal: already passed"
      );

      await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_1 });
      await bridge.bridgeMint(bob, 50, "tx_2", { from:bridger_2 });
      await expectRevert(
        bridge.passBridgeMint(bob, 50, "tx_2", { from:bridger_1 }),
        "BridgeProposal: already passed"
      );
    });

    it('reverts if minted', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.setAutoMint(true, { from:deployer  })
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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });

      assert.equal(await bridge.transactionMinted('tx_1'), true);
      assert.equal(await bridge.transactionMinted('tx_2'), false);
      assert.equal(await bridge.transactionMinted('tx_3'), false);
    });

    it('passBridgeMint only passes if transactionId matches', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await expectRevert(
        bridge.passBridgeMint(alice, 100, "tx_2", { from:bridger_1 }),
        "BridgeProposal: not passable"
      );
      res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });
      assert.equal(await bridge.transactionMinted('tx_1'), true);
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1'
      });
    });

    it('passBridgeMint only passes if recipient matches', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await expectRevert(
        bridge.passBridgeMint(bob, 100, "tx_1", { from:bridger_1 }),
        "BridgeProposal: not passable"
      );
      res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });
      assert.equal(await bridge.transactionMinted('tx_1'), true);
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1'
      });
    });

    it('passBridgeMint only passes if amount matches', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, 'tx_1', { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await expectRevert(
        bridge.passBridgeMint(alice, 50, "tx_1", { from:bridger_1 }),
        "BridgeProposal: not passable"
      );
      res = await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });
      assert.equal(await bridge.transactionMinted('tx_1'), true);
      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '100',
        transactionId: 'tx_1'
      });
    });

    it('passing proposal mints the indicated amount to the indicated recipient', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });
      assert.equal(await token.totalSupply(), '100');
      assert.equal(await token.balanceOf(alice), '100');
      assert.equal(await token.balanceOf(bob), '0');

      await bridge.setVoteThreshold(1, { from:deployer });
      await bridge.passBridgeMint(bob, 50, "tx_2", { from:bridger_1 });
      if (!autoMint) await bridge.performMint(bob, 50, "tx_2", { from:alice });
      assert.equal(await token.totalSupply(), '150');
      assert.equal(await token.balanceOf(alice), '100');
      assert.equal(await token.balanceOf(bob), '50');
    });

    it('when transactionIds compete, the first-to-pass wins', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_2 });
      await bridge.bridgeMint(bob, 66, "tx_1", { from:bridger_3 });

      await bridge.setVoteThreshold(2, { from:deployer });

      await bridge.passBridgeMint(bob, 66, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(bob, 66, "tx_1", { from:alice });

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
      if (!autoMint) await bridge.performMint(carol, 12, "tx_2", { from:alice });
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
  });
}

function passBridgeMintWithFees(recipientCount, tester, opts = {}) {
  if (recipientCount <= 0 || 4 <= recipientCount ) {
    throw new Error(`bridgeMintWithFees supports recipientCounts {1, 2, 3}, not ${recipientCount}`)
  }

  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  context(`passBridgeMint with ${recipientCount} fee recipient(s)`, () => {
    let autoMint;
    beforeEach(async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      autoMint = await bridge.autoMint();

      await bridge.setVoteThreshold(3, { from:deployer });
      // minting fee: 50 up front, 10% of the rest
      await bridge.setFee(50, 1, 10, 100, 3, 7, { from:deployer });

      if (recipientCount == 1) {
        // 100% of fee to carol
        await bridge.setFeeRecipients([carol], [1], { from:deployer });
      } else if (recipientCount == 2) {
        // 10% of fee to carol
        // 90% of fee to dave
        await bridge.setFeeRecipients([carol, dave], [1, 9], { from:deployer });
      } else {
        // 10% of fee to carol
        // 20% of fee to dave
        // 70% of fee to minter
        await bridge.setFeeRecipients([carol, dave, minter], [1, 2, 7], { from:deployer });
      }
    });

    it('reverts for fee larger than amount', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 49, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      if (autoMint) {
        await expectRevert.unspecified(bridge.passBridgeMint(alice, 49, "tx_1", { from:bridger_3 }));
      } else {
        await bridge.passBridgeMint(alice, 49, "tx_1", { from:bridger_3 });
        await expectRevert.unspecified(bridge.performMint(alice, 49, "tx_1"));
      }
    });

    it('succeeds for exact fee amount; mints nothing to intended recipient', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 50, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 50, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 50, "tx_1", { from:alice });

      assert.equal(await token.totalSupply(), '50');
      assert.equal(await token.balanceOf(alice), '0');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '50');
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '45');
      } else {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '10');
        assert.equal(await token.balanceOf(minter), '35');
      }
    });

    it('succeeds for fee amount + 1', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 51, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 51, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 51, "tx_1", { from:alice });

      assert.equal(await token.totalSupply(), '51');
      assert.equal(await token.balanceOf(alice), '1');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '50');
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '45');
      } else {
        assert.equal(await token.balanceOf(carol), '5');
        assert.equal(await token.balanceOf(dave), '10');
        assert.equal(await token.balanceOf(minter), '35');
      }
    });

    it('succeeds for fee amount + 10', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 60, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 60, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 60, "tx_1", { from:alice });

      assert.equal(await token.totalSupply(), '60');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(alice), '9');
        assert.equal(await token.balanceOf(carol), '51');  // 100% of 51
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(alice), '10');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 51
        assert.equal(await token.balanceOf(dave), '45');  // 90% of 51
      } else {
        assert.equal(await token.balanceOf(alice), '10');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 51
        assert.equal(await token.balanceOf(dave), '10');  // 20% of 51
        assert.equal(await token.balanceOf(minter), '35'); // 70% of 51
      }
    });

    it('succeeds for fee amount + 50', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 100, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 100, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 100, "tx_1", { from:alice });

      assert.equal(await token.totalSupply(), '100');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(alice), '45');
        assert.equal(await token.balanceOf(carol), '55');  // 100% of 55
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(alice), '46');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 55
        assert.equal(await token.balanceOf(dave), '49');  // 90% of 55
      } else {
        assert.equal(await token.balanceOf(alice), '46');
        assert.equal(await token.balanceOf(carol), '5');  // 10% of 55
        assert.equal(await token.balanceOf(dave), '11');  // 20% of 55
        assert.equal(await token.balanceOf(minter), '38'); // 70% of 55
      }
    });

    it('succeeds for fee amount + 100', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 150, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 150, "tx_1", { from:alice });

      assert.equal(await token.totalSupply(), '150');
      assert.equal(await token.balanceOf(alice), '90');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '60');  // 100% of 60
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '6');  // 10% of 60
        assert.equal(await token.balanceOf(dave), '54');  // 90% of 60
      } else {
        assert.equal(await token.balanceOf(carol), '6');  // 10% of 60
        assert.equal(await token.balanceOf(dave), '12');  // 20% of 60
        assert.equal(await token.balanceOf(minter), '42'); // 70% of 60
      }
    });

    it('succeeds for fee amount + 1000', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 1050, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 1050, "tx_1", { from:alice });

      assert.equal(await token.totalSupply(), '1050');
      assert.equal(await token.balanceOf(alice), '900');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(carol), '150');  // 100% of 150
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(carol), '15');  // 10% of 150
        assert.equal(await token.balanceOf(dave), '135');  // 90% of 150
      } else {
        assert.equal(await token.balanceOf(carol), '15');  // 10% of 150
        assert.equal(await token.balanceOf(dave), '30');  // 20% of 150
        assert.equal(await token.balanceOf(minter), '105'); // 70% of 150
      }
    });

    it('succeeds after fee change', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.setFee(10, 1, 4, 0, 1, 2, { from:deployer });
      await bridge.setFeeRecipients([], [], { from:deployer });
      await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [4, 6, 10], { from:deployer });
      if (recipientCount == 1) {
        await bridge.setFeeRecipientShares(bridger_2, 0);
        await bridge.setFeeRecipientShares(bridger_3, 0);
      } else if (recipientCount == 2) {
        await bridge.setFeeRecipientShares(bridger_3, 0);
      }

      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 150, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      await bridge.passBridgeMint(alice, 150, "tx_1", { from:bridger_3 });
      if (!autoMint) await bridge.performMint(alice, 150, "tx_1", { from:alice });
      // 10 base fee + 25% of 140 = 45

      assert.equal(await token.totalSupply(), '150');
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(alice), '105');
        assert.equal(await token.balanceOf(bridger_1), '45');  // 100% of 45
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(alice), '105');
        assert.equal(await token.balanceOf(bridger_1), '18');  // 40% of 45
        assert.equal(await token.balanceOf(bridger_2), '27');  // 60% of 45
      } else {
        assert.equal(await token.balanceOf(alice), '106');
        assert.equal(await token.balanceOf(bridger_1), '9');   // 20% of 45
        assert.equal(await token.balanceOf(bridger_2), '13');  // 30% of 45
        assert.equal(await token.balanceOf(bridger_3), '22');  // 50% of 45
      }
    });

    it('passing vote emits ProposalPassed event for requested mint amount', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_1 });
      await bridge.bridgeMint(alice, 1050, "tx_1", { from:bridger_2 });
      await bridge.setVoteThreshold(2, { from:deployer });
      res = await bridge.passBridgeMint(alice, 1050, "tx_1", { from:bridger_1 });

      await expectEvent.inTransaction(res.tx || res, bridge, "ProposalPassed", {
        to: alice,
        amount: '1050',
        transactionId: 'tx_1'
      });

      if (!autoMint) {
        res = await bridge.performMint(alice, 1050, "tx_1", { from:alice });
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeMint", {
        to: alice,
        amount: '1050',
        transactionId: 'tx_1'
      });
    });
  });
}

function bridgeBurn(tester, opts = {}) {
  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  context('bridgeBurn', async () => {
    const balance = 10000;

    beforeEach(async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await token.mint(alice, balance, { from:minter });
      await token.mint(bob, balance, { from:minter });
      await token.mint(carol, balance, { from:minter });
      await token.mint(dave, balance, { from:minter });

      // approve tokens
      await token.approve(bridge.address, MAX_INT_STR, { from:alice });
      await token.approve(bridge.address, MAX_INT_STR, { from:bob });
      await token.approve(bridge.address, MAX_INT_STR, { from:carol });
      await token.approve(bridge.address, MAX_INT_STR, { from:dave });

      // approve accounts
      await bridge.setAccountApproval([1001, 1002, 1003, 1004], true, { from:approver });
    });

    it('reverts for non-approved account', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

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
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      let res;

      assert.equal(await token.totalSupply(), `${balance * 4}`);

      res = await bridge.bridgeBurn(1001, 14, { from:alice });
      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1001',
        from: alice,
        amount: '14'
      });

      res = await bridge.bridgeBurn(1002, 100, { from:bob });
      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1002',
        from: bob,
        amount: '100'
      });

      await bridge.setMinimumBurn(balance / 2, { from:deployer });

      res = await bridge.bridgeBurn(1003, balance, { from:carol });
      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1003',
        from: carol,
        amount: `${balance}`
      });

      res = await bridge.bridgeBurn(1004, balance / 2, { from:dave });
      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1004',
        from: dave,
        amount: `${balance / 2}`
      });
    });
  });
}

function bridgeBurnWithFees(recipientCount, tester, opts = {}) {
  if (recipientCount <= 0 || 4 <= recipientCount ) {
    throw new Error(`bridgeMintWithFees supports recipientCounts {1, 2, 3}, not ${recipientCount}`)
  }

  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sanitize || require('../helpers/sanitize');

  context(`bridgeBurn with ${recipientCount} fee recipient(s)`, () => {
    const balance = 10000;

    beforeEach(async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await token.mint(alice, balance, { from:minter });
      await token.mint(bob, balance, { from:minter });
      await token.mint(carol, balance, { from:minter });
      await token.mint(dave, balance, { from:minter });

      // approve tokens
      await token.approve(bridge.address, MAX_INT_STR, { from:alice });
      await token.approve(bridge.address, MAX_INT_STR, { from:bob });
      await token.approve(bridge.address, MAX_INT_STR, { from:carol });
      await token.approve(bridge.address, MAX_INT_STR, { from:dave });

      // approve accounts
      await bridge.setAccountApproval([1001, 1002, 1003, 1004], true, { from:approver });

      // burning fee: 50 up front, 10% of the rest
      await bridge.setFee(100, 3, 7, 50, 1, 10, { from:deployer });

      if (recipientCount == 1) {
        // 100% of fee to carol
        await bridge.setFeeRecipients([bridger_1], [1], { from:deployer });
      } else if (recipientCount == 2) {
        // 10% of fee to carol
        // 90% of fee to dave
        await bridge.setFeeRecipients([bridger_1, bridger_2], [1, 9], { from:deployer });
      } else {
        // 10% of fee to carol
        // 20% of fee to dave
        // 70% of fee to minter
        await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [1, 2, 7], { from:deployer });
      }
    });

    it('reverts for fee larger than amount', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await expectRevert.unspecified(bridge.bridgeBurn(1001, 49, { from:alice }));
    });

    it('succeeds for exact fee amount', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      const res = await bridge.bridgeBurn(1002, 50, { from:alice });

      assert.equal(await token.totalSupply(), `${balance * 4}`);
      assert.equal(await token.balanceOf(alice), `${balance - 50}`);
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(bridger_1), '50');
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(bridger_1), '5');
        assert.equal(await token.balanceOf(bridger_2), '45');
      } else {
        assert.equal(await token.balanceOf(bridger_1), '5');
        assert.equal(await token.balanceOf(bridger_2), '10');
        assert.equal(await token.balanceOf(bridger_3), '35');
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1002',
        from: alice,
        amount: '0'
      });
    });

    it('succeeds for fee amount + 1', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      const res = await bridge.bridgeBurn(1002, 51, { from:alice });

      assert.equal(await token.totalSupply(), `${balance * 4 - 1}`);
      assert.equal(await token.balanceOf(alice), `${balance - 51}`);
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(bridger_1), '50');
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(bridger_1), '5');
        assert.equal(await token.balanceOf(bridger_2), '45');
      } else {
        assert.equal(await token.balanceOf(bridger_1), '5');
        assert.equal(await token.balanceOf(bridger_2), '10');
        assert.equal(await token.balanceOf(bridger_3), '35');
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1002',
        from: alice,
        amount: '1'
      });
    });

    it('succeeds for fee amount + 10', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      const res = await bridge.bridgeBurn(1002, 60, { from:alice });

      assert.equal(await token.balanceOf(alice), `${balance - 60}`);
      if (recipientCount == 1) {
        assert.equal(await token.totalSupply(), `${balance * 4 - 9}`);
        assert.equal(await token.balanceOf(bridger_1), '51');  // 100% of 51

        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1002',
          from: alice,
          amount: '9'
        });
      } else if (recipientCount == 2) {
        assert.equal(await token.totalSupply(), `${balance * 4 - 10}`);
        assert.equal(await token.balanceOf(bridger_1), '5');  // 10% of 51
        assert.equal(await token.balanceOf(bridger_2), '45');  // 90% of 51

        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1002',
          from: alice,
          amount: '10'
        });
      } else {
        assert.equal(await token.totalSupply(), `${balance * 4 - 10}`);
        assert.equal(await token.balanceOf(bridger_1), '5');  // 10% of 51
        assert.equal(await token.balanceOf(bridger_2), '10');  // 20% of 51
        assert.equal(await token.balanceOf(bridger_3), '35'); // 70% of 51

        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1002',
          from: alice,
          amount: '10'
        });
      }
    });

    it('succeeds for fee amount + 50', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      const res = await bridge.bridgeBurn(1003, 100, { from:alice });

      assert.equal(await token.balanceOf(alice), `${balance - 100}`);
      if (recipientCount == 1) {
        assert.equal(await token.totalSupply(), `${balance * 4 - 45}`);
        assert.equal(await token.balanceOf(bridger_1), '55');  // 100% of 55
        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1003',
          from: alice,
          amount: '45'
        });
      } else if (recipientCount == 2) {
        assert.equal(await token.totalSupply(), `${balance * 4 - 46}`);
        assert.equal(await token.balanceOf(bridger_1), '5');  // 10% of 55
        assert.equal(await token.balanceOf(bridger_2), '49');  // 90% of 55
        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1003',
          from: alice,
          amount: '46'
        });
      } else {
        assert.equal(await token.totalSupply(), `${balance * 4 - 46}`);
        assert.equal(await token.balanceOf(bridger_1), '5');  // 10% of 55
        assert.equal(await token.balanceOf(bridger_2), '11');  // 20% of 55
        assert.equal(await token.balanceOf(bridger_3), '38'); // 70% of 55
        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1003',
          from: alice,
          amount: '46'
        });
      }
    });

    it('succeeds for fee amount + 100', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      const res = await bridge.bridgeBurn(1004, 150, { from:alice });

      assert.equal(await token.totalSupply(), `${balance * 4 - 90}`);
      assert.equal(await token.balanceOf(alice), `${balance - 150}`);
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(bridger_1), '60');  // 100% of 60
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(bridger_1), '6');  // 10% of 60
        assert.equal(await token.balanceOf(bridger_2), '54');  // 90% of 60
      } else {
        assert.equal(await token.balanceOf(bridger_1), '6');  // 10% of 60
        assert.equal(await token.balanceOf(bridger_2), '12');  // 20% of 60
        assert.equal(await token.balanceOf(bridger_3), '42'); // 70% of 60
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1004',
        from: alice,
        amount: '90'
      });
    });

    it('succeeds for fee amount + 1000', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      const res = await bridge.bridgeBurn(1004, 1050, { from:alice });

      assert.equal(await token.totalSupply(), `${balance * 4 - 900}`);
      assert.equal(await token.balanceOf(alice), `${balance - 1050}`);
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(bridger_1), '150');  // 100% of 150
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(bridger_1), '15');  // 10% of 150
        assert.equal(await token.balanceOf(bridger_2), '135');  // 90% of 150
      } else {
        assert.equal(await token.balanceOf(bridger_1), '15');  // 10% of 150
        assert.equal(await token.balanceOf(bridger_2), '30');  // 20% of 150
        assert.equal(await token.balanceOf(bridger_3), '105'); // 70% of 150
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1004',
        from: alice,
        amount: '900'
      });
    });

    it('succeeds after fee change', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;

      await bridge.setFee(0, 1, 2, 10, 1, 4, { from:deployer });
      await bridge.setFeeRecipients([], [], { from:deployer });
      await bridge.setFeeRecipients([bridger_1, bridger_2, bridger_3], [4, 6, 10], { from:deployer });
      if (recipientCount == 1) {
        await bridge.setFeeRecipientShares(bridger_2, 0);
        await bridge.setFeeRecipientShares(bridger_3, 0);
      } else if (recipientCount == 2) {
        await bridge.setFeeRecipientShares(bridger_3, 0);
      }

      const res = await bridge.bridgeBurn(1004, 150, { from:alice });
      // 10 base fee + 25% of 140 = 45

      assert.equal(await token.balanceOf(alice), `${balance - 150}`);
      if (recipientCount == 1) {
        assert.equal(await token.totalSupply(), `${balance * 4 - 105}`);
        assert.equal(await token.balanceOf(bridger_1), '45');  // 100% of 45
        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1004',
          from: alice,
          amount: '105'
        });
      } else if (recipientCount == 2) {
        assert.equal(await token.totalSupply(), `${balance * 4 - 105}`);
        assert.equal(await token.balanceOf(bridger_1), '18');  // 40% of 45
        assert.equal(await token.balanceOf(bridger_2), '27');  // 60% of 45
        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1004',
          from: alice,
          amount: '105'
        });
      } else {
        assert.equal(await token.totalSupply(), `${balance * 4 - 106}`);
        assert.equal(await token.balanceOf(bridger_1), '9');   // 20% of 45
        assert.equal(await token.balanceOf(bridger_2), '13');  // 30% of 45
        assert.equal(await token.balanceOf(bridger_3), '22');  // 50% of 45
        await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
          account: '1004',
          from: alice,
          amount: '106'
        });
      }
    });

    it('minimumBurn does not affect token transfers or event emitted', async () => {
      const { bridge, token, deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter } = tester;
      await bridge.setMinimumBurn(950, { from:deployer });
      const res = await bridge.bridgeBurn(1004, 1050, { from:alice });

      assert.equal(await token.totalSupply(), `${balance * 4 - 900}`);
      assert.equal(await token.balanceOf(alice), `${balance - 1050}`);
      if (recipientCount == 1) {
        assert.equal(await token.balanceOf(bridger_1), '150');  // 100% of 150
      } else if (recipientCount == 2) {
        assert.equal(await token.balanceOf(bridger_1), '15');  // 10% of 150
        assert.equal(await token.balanceOf(bridger_2), '135');  // 90% of 150
      } else {
        assert.equal(await token.balanceOf(bridger_1), '15');  // 10% of 150
        assert.equal(await token.balanceOf(bridger_2), '30');  // 20% of 150
        assert.equal(await token.balanceOf(bridger_3), '105'); // 70% of 150
      }

      await expectEvent.inTransaction(res.tx || res, bridge, "BridgeBurn", {
        account: '1004',
        from: alice,
        amount: '900'
      });
    });
  });
}

module.exports = exports =  {
  basics,
  bridgeMint,
  bridgeMintWithFees,
  passBridgeMint,
  passBridgeMintWithFees,
  bridgeBurn,
  bridgeBurnWithFees
}
