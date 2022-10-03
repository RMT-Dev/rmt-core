const { deployProxy } = require('@openzeppelin/truffle-upgrades');

const BackedERC20 = artifacts.require("BackedERC20");

module.exports = async function (deployer) {
  const instance = await deployProxy(BackedERC20, ["Ringgit Managed Token", "RMT"], { deployer });
  console.log('Deployed BackedERC20 at', instance.address);
};
