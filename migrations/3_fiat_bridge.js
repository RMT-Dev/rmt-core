const { deployProxy } = require('@openzeppelin/truffle-upgrades');

const BackedERC20 = artifacts.require("BackedERC20");
const FiatBridge = artifacts.require("FiatBridge");

module.exports = async function (deployer) {
  const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
  const BURNER_ROLE = web3.utils.soliditySha3('BURNER_ROLE');

  const token = await BackedERC20.deployed();
  const bridge = await deployProxy(FiatBridge, [token.address], { deployer });
  console.log('Deployed FiatBridge at', bridge.address);

  await token.grantRole(MINTER_ROLE,  bridge.address);
  await token.grantRole(BURNER_ROLE,  bridge.address);
  console.log(`Granted Minter and Burner roles`);
};
