const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;

function basics(tester, opts = {}) {
  const expectRevert = opts.expectRevert || require('@openzeppelin/test-helpers').expectRevert;
  const expectEvent = opts.expectEvent || require('@openzeppelin/test-helpers').expectEvent;
  const sanitize = opts.sonitize || require('../helpers/sanitize');

  it('tester context should have appropriate symbols', async () => {
    assert.ok(tester, "should have truthy input parameter");

    const env = ["web3"];
    const contracts = ["token"];
    const addresses = ["deployer", "alice", "bob", "carol", "dave", "minter", "burner", "pauser"];
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
  });

  it('should have appropriate starting values', async () => {
    const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

    assert.equal(await token.totalSupply(), '0');
    assert.equal(await token.balanceOf(deployer), '0')
    assert.equal(await token.balanceOf(alice), '0');
  });

  it('only minter may mint', async () => {
    const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

    let res;

    await expectRevert(token.mint(alice, 100, { from:alice }), "BackedERC20: caller is not minter");
    await expectRevert(token.mint(alice, 100, { from:deployer }), "BackedERC20: caller is not minter");
    await expectRevert(token.mint(alice, 100, { from:burner }), "BackedERC20: caller is not minter");
    await expectRevert(token.mint(alice, 100, { from:pauser }), "BackedERC20: caller is not minter");

    res = await token.mint(alice, 100, { from:minter });
    await expectEvent.inTransaction(res.tx || res, token, 'Transfer', { from:ZERO_ADDRESS, to:alice, value:'100' });

    const b = await token.balanceOf(alice)
    assert.equal(await token.balanceOf(alice), '100');
    assert.equal(await token.totalSupply(), '100');


    res = await token.mint(bob, '25', { from:minter });
    await expectEvent.inTransaction(res.tx || res, token, 'Transfer', { from:ZERO_ADDRESS, to:bob, value:'25' });

    assert.equal(await token.balanceOf(alice), '100');
    assert.equal(await token.balanceOf(bob), '25');
    assert.equal(await token.totalSupply(), '125');
  });

  it('only burner may burn', async () => {
    const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

    let res;

    await token.mint(alice, 500, { from:minter });
    await token.mint(bob, 500, { from:minter });

    await token.approve(burner, 1000, { from:alice });
    await token.approve(burner, 1000, { from:bob });

    await expectRevert(token.burn(alice, 100, { from:alice }), "BackedERC20: caller is not burner");
    await expectRevert(token.burn(alice, 100, { from:deployer }), "BackedERC20: caller is not burner");
    await expectRevert(token.burn(alice, 100, { from:minter }), "BackedERC20: caller is not burner");
    await expectRevert(token.burn(alice, 100, { from:pauser }), "BackedERC20: caller is not burner");

    res = await token.burn(alice, 100, { from:burner });
    await expectEvent.inTransaction(res.tx || res, token, 'Transfer', { from:alice, to:ZERO_ADDRESS, value:'100' });
    assert.equal(await token.balanceOf(alice), '400');
    assert.equal(await token.totalSupply(), '900');

    res = await token.burn(bob, '25', { from:burner });
    await expectEvent.inTransaction(res.tx || res, token, 'Transfer', { from:bob, to:ZERO_ADDRESS, value:'25' });
    assert.equal(await token.balanceOf(alice), '400');
    assert.equal(await token.balanceOf(bob), '475');
    assert.equal(await token.totalSupply(), '875');
  });

  context('pause', async () => {
    it('only pauser may pause or unpause', async () => {
      const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

      await token.mint(alice, 500, { from:minter });

      await expectRevert(token.pause({ from:alice }), "BackedERC20: caller is not pauser");
      await expectRevert(token.pause({ from:deployer }), "BackedERC20: caller is not pauser");
      await expectRevert(token.unpause({ from:minter }), "BackedERC20: caller is not pauser");
      await expectRevert(token.unpause({ from:burner }), "BackedERC20: caller is not pauser");

      await token.pause({ from:pauser });
      await token.unpause({ from:pauser });
    });

    it('token transfers, mints, burns, only allowed during unpaused state', async () => {
      const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

      await token.mint(alice, 500, { from:minter });
      await token.approve(burner, 1000, { from:alice });

      await token.pause({ from:pauser });

      await expectRevert(token.transfer(bob, 100, { from:alice }), "ERC20Pausable: token transfer while paused");
      await expectRevert(token.mint(bob, 100, { from:minter }), "ERC20Pausable: token transfer while paused");
      await expectRevert(token.burn(alice, 100, { from:burner }), "ERC20Pausable: token transfer while paused");

      await token.unpause({ from:pauser });

      await token.transfer(bob, 100, { from:alice });
      await token.mint(bob, 50, { from:minter });
      await token.burn(alice, 25, { from:burner });

      assert.equal(await token.balanceOf(alice), '375');
      assert.equal(await token.balanceOf(bob), '150');
      assert.equal(await token.totalSupply(), '525');
    });
  });

  it('cannot transfer more than balance (test overflow protection)', async () => {
      const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

      await token.mint(alice, 1000, { from:minter });

      await expectRevert.unspecified(token.transfer(bob, 1001, { from:alice }));
      await expectRevert.unspecified(token.transfer(carol, 1, { from:bob }));

      await token.transfer(carol, 0, { from:bob });
      await token.transfer(bob, 1000, { from:alice });

      assert.equal(await token.balanceOf(alice), '0');
      assert.equal(await token.balanceOf(bob), '1000');
      assert.equal(await token.balanceOf(carol), '0');
  });

  it('cannot transfer more than allowance (test overflow protection)', async () => {
      const { token, deployer, alice, bob, carol, dave, minter, burner, pauser } = tester;

      await token.mint(alice, 1000, { from:minter });
      await token.mint(bob, 1000, { from:minter });

      await token.approve(bob, 500, { from:alice });
      await token.approve(carol, 200, { from:alice });
      await token.approve(alice, 0, { from:bob });
      await token.approve(carol, 100, { from:bob });

      await expectRevert.unspecified(token.transferFrom(alice, dave, 501, { from:bob }));
      await expectRevert.unspecified(token.transferFrom(alice, dave, 201, { from:carol }));
      await expectRevert.unspecified(token.transferFrom(bob, dave, 1, { from:alice }));
      await expectRevert.unspecified(token.transferFrom(bob, dave, 101, { from:carol }));

      await token.transferFrom(alice, dave, 250, { from:bob });
      await token.transferFrom(alice, dave, 200, { from:carol });
      await token.transferFrom(bob, dave, 0, { from:alice });
      await token.transferFrom(bob, dave, 99, { from:carol });

      assert.equal(await token.balanceOf(alice), '550');
      assert.equal(await token.balanceOf(bob), '901');
      assert.equal(await token.balanceOf(carol), '0');
      assert.equal(await token.balanceOf(dave), '549');
  });
}

module.exports = exports = {
  basics
}
