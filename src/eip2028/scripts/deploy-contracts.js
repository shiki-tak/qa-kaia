const Caver = require('caver-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const NETWORKS = {
  testnet: {
    rpcUrl: 'http://localhost:8553',
    privateKey: process.env.TESTNET_PRIVATE_KEY || ''
  },
  local: {
    rpcUrl: 'http://localhost:8551',
    privateKey: process.env.LOCAL_PRIVATE_KEY || ''
  }
};

const CONTRACT_BYTECODE = '0x6080604052348015600f57600080fd5b506104358061001f6000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80633af3c45f1461003b5780638331ed0f14610050575b600080fd5b61004e610049366004610232565b610063565b005b61004e61005e3660046102d8565b6101bb565b60005b858110156100d2576000805160206103e083398151915287878381811061008f5761008f61034c565b905060200201356040516020016100a891815260200190565b60408051601f19818403018152908290526100c291610362565b60405180910390a1600101610066565b5060005b83811015610142576000805160206103e08339815191528585838181106100ff576100ff61034c565b9050602002013560405160200161011891815260200190565b60408051601f198184030181529082905261013291610362565b60405180910390a16001016100d6565b5060005b818110156101b2576000805160206103e083398151915283838381811061016f5761016f61034c565b9050602002013560405160200161018891815260200190565b60408051601f19818403018152908290526101a291610362565b60405180910390a1600101610146565b50505050505050565b6000805160206103e083398151915282826040516101da9291906103b0565b60405180910390a15050565b60008083601f8401126101f857600080fd5b50813567ffffffffffffffff81111561021057600080fd5b6020830191508360208260051b850101111561022b57600080fd5b9250929050565b6000806000806000806060878903121561024b57600080fd5b863567ffffffffffffffff81111561026257600080fd5b61026e89828a016101e6565b909750955050602087013567ffffffffffffffff81111561028e57600080fd5b61029a89828a016101e6565b909550935050604087013567ffffffffffffffff8111156102ba57600080fd5b6102c689828a016101e6565b979a9699509497509295939492505050565b600080602083850312156102eb57600080fd5b823567ffffffffffffffff81111561030257600080fd5b8301601f8101851361031357600080fd5b803567ffffffffffffffff81111561032a57600080fd5b85602082840101111561033c57600080fd5b6020919091019590945092505050565b634e487b7160e01b600052603260045260246000fd5b602081526000825180602084015260005b818110156103905760208186018101516040868401015201610373565b506000604082850101526040601f19601f83011684010191505092915050565b60208152816020820152818360408301376000818301604090810191909152601f909201601f1916010191905056fe23121a7b6d0c813a5070976dd44a97a1055ac4ee68e2beeded6b187e96d00e88a264697066735822122077f4979542e5de69a89d50c56d4ca8e95270ea092b6293f76591fcd3061dadbc64736f6c634300081c0033';

const CONTRACT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "DataProcessed",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "processData",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32[]",
        "name": "data1",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "data2",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "data3",
        "type": "bytes32[]"
      }
    ],
    "name": "processMultipleData",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function deployContract(networkName) {
  const network = NETWORKS[networkName];
  const caver = new Caver(network.rpcUrl);
  
  const senderKeyring = caver.wallet.keyring.createFromPrivateKey(network.privateKey);
  caver.wallet.add(senderKeyring);

  console.log(`\nDeploying to ${networkName}...`);
  console.log(`Deployer address: ${senderKeyring.address}`);

  try {
    const contract = new caver.contract(CONTRACT_ABI);

    const deploy = contract.deploy({
      data: CONTRACT_BYTECODE,
    });

    const gas = await deploy.estimateGas({
      from: senderKeyring.address
    });

    const deployedContract = await deploy.send({
      from: senderKeyring.address,
      gas: gas,
      value: 0
    });

    console.log(`Contract deployed at: ${deployedContract.options.address}`);
    return deployedContract.options.address;

  } catch (error) {
    console.error(`Error deploying to ${networkName}:`, error);
    throw error;
  }
}

async function main() {
  const deployedAddresses = {};

  for (const network of Object.keys(NETWORKS)) {
    try {
      deployedAddresses[network] = await deployContract(network);
    } catch (error) {
      console.error(`Failed to deploy to ${network}`);
    }
  }

  const configContent = `module.exports = ${JSON.stringify(deployedAddresses, null, 2)};`;
  const configPath = path.join(__dirname, 'deployed-addresses.js');
  fs.writeFileSync(configPath, configContent);

  console.log('\nDeployment summary:');
  console.log(deployedAddresses);
  console.log(`\nAddresses have been saved to: ${configPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}
