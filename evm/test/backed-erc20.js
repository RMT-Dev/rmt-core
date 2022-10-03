const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const testBackedERC20 = require('../../utils/evm/test/backed-erc20');

const BackedERC20 = artifacts.require('BackedERC20');
const MockBackedERC20UpdateV2 = artifacts.require('MockBackedERC20UpdateV2');

contract('BackedERC20', ([deployer, alice, bob, carol, dave, minter, burner, pauser]) => {
  const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
  const BURNER_ROLE = web3.utils.soliditySha3('BURNER_ROLE');
  const PAUSER_ROLE = web3.utils.soliditySha3('PAUSER_ROLE');

  const addresses = { deployer, alice, bob, carol, dave, minter, burner, pauser }
  const tester = {}

  /*

  beforeEach(async () => {
    // deployProxy cannot specify deployer address using { from }.
    // See https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/85
    this.token = await deployProxy(BackedERC20, ["FiatBackedCoin", "FBC"]);
    await this.token.grantRole(MINTER_ROLE, minter, { from:deployer });
    await this.token.grantRole(BURNER_ROLE, burner, { from:deployer });
    await this.token.grantRole(PAUSER_ROLE, pauser, { from:deployer });

    for (const field in tester) delete tester[field];
    tester.web3 = web3;
    tester.token = this.token;
    for (const addr in addresses) tester[addr] = addresses[addr];
  });

  it('should have correct name and symbol and decimal', async () => {
    const { token } = tester;

    const name = await token.name();
    const symbol = await token.symbol();
    assert.equal(name.valueOf(), 'FiatBackedCoin');
    assert.equal(symbol.valueOf(), 'FBC');
  });

  testBackedERC20.basics(tester);

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

      it('should have correct name and symbol and decimal', async () => {
        const { token } = tester;

        const name = await token.name();
        const symbol = await token.symbol();
        assert.equal(name.valueOf(), 'FiatBackedCoin');
        assert.equal(symbol.valueOf(), 'FBC');
      });

      testBackedERC20.basics(tester);
    });
  });
  */
});
