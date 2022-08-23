const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;

const BackedERC20 = artifacts.require('BackedERC20');
const MockBackedERC20UpdateV2 = artifacts.require('MockBackedERC20UpdateV2');

contract('BackedERC20', ([deployer, alice, bob, carol, dave, minter, burner, pauser]) => {
  const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
  const BURNER_ROLE = web3.utils.soliditySha3('BURNER_ROLE');
  const PAUSER_ROLE = web3.utils.soliditySha3('PAUSER_ROLE');

  beforeEach(async () => {
    // deployProxy cannot specify deployer address using { from }.
    // See https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/85
    this.token = await deployProxy(BackedERC20, ["FiatBackedCoin", "FBC"]);
    await this.token.grantRole(MINTER_ROLE, minter, { from:deployer });
    await this.token.grantRole(BURNER_ROLE, burner, { from:deployer });
    await this.token.grantRole(PAUSER_ROLE, pauser, { from:deployer });
  });

  function testToken(tester) {
    it('should have correct name and symbol and decimal', async () => {
      const { token } = tester;

      const name = await token.name();
      const symbol = await token.symbol();
      assert.equal(name.valueOf(), 'FiatBackedCoin');
      assert.equal(symbol.valueOf(), 'FBC');
    });

    it('should have appropriate starting values', async () => {
      const { token } = tester;

      assert.equal(await token.totalSupply(), '0');
      assert.equal(await token.balanceOf(deployer), '0')
      assert.equal(await token.balanceOf(alice), '0');
    });

    it('only minter may mint', async () => {
      const { token } = tester;

      let res;

      await expectRevert(token.mint(alice, 100, { from:alice }), "BackedERC20: caller is not minter");
      await expectRevert(token.mint(alice, 100, { from:deployer }), "BackedERC20: caller is not minter");
      await expectRevert(token.mint(alice, 100, { from:burner }), "BackedERC20: caller is not minter");
      await expectRevert(token.mint(alice, 100, { from:pauser }), "BackedERC20: caller is not minter");

      res = await token.mint(alice, 100, { from:minter });
      await expectEvent.inTransaction(res.tx, token, 'Transfer', { from:ZERO_ADDRESS, to:alice, value:'100' });
      assert.equal(await token.balanceOf(alice), '100');
      assert.equal(await token.totalSupply(), '100');


      res = await token.mint(bob, '25', { from:minter });
      await expectEvent.inTransaction(res.tx, token, 'Transfer', { from:ZERO_ADDRESS, to:bob, value:'25' });
      assert.equal(await token.balanceOf(alice), '100');
      assert.equal(await token.balanceOf(bob), '25');
      assert.equal(await token.totalSupply(), '125');
    });

    it('only burner may burn', async () => {
      const { token } = tester;

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
      await expectEvent.inTransaction(res.tx, token, 'Transfer', { from:alice, to:ZERO_ADDRESS, value:'100' });
      assert.equal(await token.balanceOf(alice), '400');
      assert.equal(await token.totalSupply(), '900');

      res = await token.burn(bob, '25', { from:burner });
      await expectEvent.inTransaction(res.tx, token, 'Transfer', { from:bob, to:ZERO_ADDRESS, value:'25' });
      assert.equal(await token.balanceOf(alice), '400');
      assert.equal(await token.balanceOf(bob), '475');
      assert.equal(await token.totalSupply(), '875');
    });

    context('pause', async () => {
      it('only pauser may pause or unpause', async () => {
        const { token } = tester;

        await token.mint(alice, 500, { from:minter });

        await expectRevert(token.pause({ from:alice }), "BackedERC20: caller is not pauser");
        await expectRevert(token.pause({ from:deployer }), "BackedERC20: caller is not pauser");
        await expectRevert(token.unpause({ from:minter }), "BackedERC20: caller is not pauser");
        await expectRevert(token.unpause({ from:burner }), "BackedERC20: caller is not pauser");

        await token.pause({ from:pauser });
        await token.unpause({ from:pauser });
      });

      it('token transfers, mints, burns, only allowed during unpaused state', async () => {
        const { token } = tester;

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
  }

  testToken(this);

  context('upgrades', () => {
    it('can upgrade', async () => {
      const { token } = this;

      const upgrade = await upgradeProxy(token.address, MockBackedERC20UpdateV2);

      assert.equal(upgrade.address, token.address);
    });

    it('upgrading retains state', async () => {
      const { token } = this;

      await token.mint(alice, 500, { from:minter });
      await token.mint(bob, 300, { from:minter });
      await token.mint(carol, 200, { from:minter });
      await token.mint(dave, 125, { from:minter });

      await upgradeProxy(token.address, MockBackedERC20UpdateV2);

      assert.equal(await token.balanceOf(alice), '500');
      assert.equal(await token.balanceOf(bob), '300');
      assert.equal(await token.balanceOf(carol), '200');
      assert.equal(await token.balanceOf(dave), '125');

      await token.transfer(bob, '12', { from:alice });
      assert.equal(await token.balanceOf(alice), '488');
      assert.equal(await token.balanceOf(bob), '312');

      assert.equal(await token.totalSupply(), '1125');
    });

    it('upgrading adds new functions', async () => {
        let { token } = this;

        await token.mint(alice, 500, { from:minter });
        await token.mint(bob, 300, { from:minter });
        await token.mint(carol, 200, { from:minter });
        await token.mint(dave, 125, { from:minter });

        token = await upgradeProxy(token.address, MockBackedERC20UpdateV2);

        await token.equalize(carol, { from:alice });

        assert.equal(await token.balanceOf(alice), '350');
        assert.equal(await token.balanceOf(bob), '300');
        assert.equal(await token.balanceOf(carol), '350');
        assert.equal(await token.balanceOf(dave), '125');

        assert.equal(await token.totalSupply(), '1125');
    });

    context('same functions after upgrade', async () => {
      beforeEach(async () => {
        await upgradeProxy(this.token.address, MockBackedERC20UpdateV2);
      });

      testToken(this);
    });
  });
});
