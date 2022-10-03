const { deployProxy } = require('@openzeppelin/truffle-upgrades');

const FiatBridge = artifacts.require("FiatBridge");

module.exports = async function (deployer) {
  const BRIDGER_ROLE = web3.utils.soliditySha3('BRIDGER_ROLE');
  const APPROVE_ROLE = web3.utils.soliditySha3('APPROVE_ROLE');

  const bridge = await FiatBridge.deployed();

  console.log(`TODO: grantRole to bridgers`);
  console.log(`TODO: grantRole to approver(s)`);
  console.log(`TODO: set mint/burn fees`);
  console.log(`TODO: set minimum burn quantity`);
  console.log(`TODO: set vote threshold`);
  // at this point the bridge is ready
};
