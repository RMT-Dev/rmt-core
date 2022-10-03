const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

const testFiatBridge = require('../../utils/evm/test/fiat-bridge');

const BackedERC20 = artifacts.require('BackedERC20');
const FiatBridge = artifacts.require('FiatBridge');
const MockFiatBridgeUpdateV2 = artifacts.require('MockFiatBridgeUpdateV2');

const MAX_INT_STR = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

contract('FiatBridge', ([deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter]) => {
  const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
  const BURNER_ROLE = web3.utils.soliditySha3('BURNER_ROLE');

  const BRIDGER_ROLE = web3.utils.soliditySha3('BRIDGER_ROLE');
  const APPROVE_ROLE = web3.utils.soliditySha3('APPROVE_ROLE');

  const addresses = { deployer, alice, bob, carol, dave, bridger_1, bridger_2, bridger_3, approver, minter }
  const tester = {}

  beforeEach(async () => {
    // deployProxy cannot specify deployer address using { from }.
    // See https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/85
    this.token = await deployProxy(BackedERC20, ["FiatBackedCoin", "FBC"]);
    this.bridge = await deployProxy(FiatBridge, [this.token.address]);

    await this.token.grantRole(MINTER_ROLE, this.bridge.address, { from:deployer });
    await this.token.grantRole(BURNER_ROLE, this.bridge.address, { from:deployer });
    await this.token.grantRole(MINTER_ROLE, minter, { from:deployer });

    await this.bridge.grantRole(BRIDGER_ROLE, bridger_1, { from:deployer });
    await this.bridge.grantRole(BRIDGER_ROLE, bridger_2, { from:deployer });
    await this.bridge.grantRole(BRIDGER_ROLE, bridger_3, { from:deployer });

    await this.bridge.grantRole(APPROVE_ROLE, approver, { from:deployer });

    for (const field in tester) delete tester[field];
    tester.web3 = web3;
    tester.bridge = this.bridge;
    tester.token = this.token;
    for (const addr in addresses) tester[addr] = addresses[addr];
  });

  testFiatBridge.basics(tester);
  testFiatBridge.bridgeMint(tester);
  testFiatBridge.bridgeMintWithFees(1, tester);
  testFiatBridge.bridgeMintWithFees(2, tester);
  testFiatBridge.bridgeMintWithFees(3, tester);
  testFiatBridge.passBridgeMint(tester);
  testFiatBridge.passBridgeMintWithFees(1, tester);
  testFiatBridge.passBridgeMintWithFees(2, tester);
  testFiatBridge.passBridgeMintWithFees(3, tester);
  testFiatBridge.bridgeBurn(tester);
  testFiatBridge.bridgeBurnWithFees(1, tester);
  testFiatBridge.bridgeBurnWithFees(2, tester);
  testFiatBridge.bridgeBurnWithFees(3, tester);
});
