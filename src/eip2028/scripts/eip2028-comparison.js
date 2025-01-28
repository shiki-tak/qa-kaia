const Caver = require('caver-js');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const CONTRACT_BYTECODES = require('./contract-bytecodes');
const deployedAddresses = require('./deployed-addresses');
const { processResults } = require('./gas-validation');
const { saveChartAsImage } = require('./save-image');

class KaiaTransactionAnalyzer {
  constructor(config) {
    this.caver = new Caver(config.rpcUrl);
    this.senderKeyring = this.caver.wallet.keyring.createFromPrivateKey(config.privateKey);
    this.caver.wallet.add(this.senderKeyring);
    this.feePayerKeyring = this.caver.wallet.keyring.createFromPrivateKey(config.feePayerPrivateKey);
    this.caver.wallet.add(this.feePayerKeyring);
    this.networkName = config.networkName;
    this.contractAddress = config.contractAddress;
  }

  async getBasicTxParams(txType) {
    const chainId = await this.caver.rpc.klay.getChainId();
    const baseParams = {
      from: this.senderKeyring.address,
      gas: 500000,
      chainId: chainId
    };

    if (txType === 'ethereumDynamicFee') {
      // For EthereumDynamicFee, we need maxPriorityFeePerGas and maxFeePerGas instead of gasPrice
      const gasPrice = await this.caver.rpc.klay.getGasPrice();
      return {
        ...baseParams,
        maxPriorityFeePerGas: gasPrice,
        maxFeePerGas: gasPrice, // In Kaia, both values are set to the same fixed gas price
      };
    } else {
      // For other transaction types, use normal gasPrice
      return {
        ...baseParams,
        gasPrice: await this.caver.rpc.klay.getGasPrice()
      };
    };
  }

  generateDummyData(size) {
    return {
      contract: CONTRACT_BYTECODES[size],
      memo: this.caver.utils.utf8ToHex('a'.repeat(size)),
      publicKey: '0x' + '1'.repeat(128),
      contractInput: (() => {
        const rawData = 'aa'.repeat(size / 2);
        const hexData = this.caver.utils.utf8ToHex(rawData);
        
        const functionSignature = {
          name: 'processData',
          type: 'function',
          inputs: [{
            type: 'bytes',
            name: 'data'
          }]
        };
  
        console.log('Generated hex data:', {
          size,
          hexDataLength: hexData.length,
          hexData: hexData.slice(0, 66) + '...'
        });
  
        try {
          const encodedInput = this.caver.abi.encodeFunctionCall(functionSignature, [hexData]);
          console.log('Encoded function call:', {
            length: encodedInput.length,
            data: encodedInput.slice(0, 66) + '...'
          });
          return encodedInput;
        } catch (error) {
          console.error('Error encoding function call:', error);
          throw error;
        }
      })(),
      accessList: [{
        address: '0x5430192ae264b3feff967fc08982b9c6f5694023',
        storageKeys: [
          '0x' + '0'.repeat(63) + '1',
          '0x' + '0'.repeat(63) + '2'
        ]
      }]
    };
  }

  async createTransaction(txType, dataSize) {
    const baseParams = await this.getBasicTxParams(txType);
    const dummyData = this.generateDummyData(dataSize);
    const randomAddress = this.caver.wallet.keyring.generate().address;
    const value = this.caver.utils.convertToPeb('0.1', 'KAIA');

    try {
      switch(txType) {
        case 'legacyTransaction':
          return this.caver.transaction.legacyTransaction.create({
            ...baseParams,
            to: randomAddress,
            value,
            input: dummyData.memo
          });
        case 'valueTransfer':
          return this.caver.transaction.valueTransfer.create({
            ...baseParams,
            to: randomAddress,
            value
          });

        case 'valueTransferMemo':
          return this.caver.transaction.valueTransferMemo.create({
            ...baseParams,
            to: randomAddress,
            value,
            input: dummyData.memo
          });

        case 'smartContractDeploy':
          return this.caver.transaction.smartContractDeploy.create({
            ...baseParams,
            value: 0,
            input: dummyData.contract
          });

        case 'smartContractExecution':
          return this.caver.transaction.smartContractExecution.create({
            ...baseParams,
            to: this.contractAddress,
            value: '0x0',
            input: dummyData.contractInput
          });

        case 'accountUpdate':
          // Generate new private key
          var newPrivateKey = this.caver.wallet.keyring.generateSingleKey();
          console.log('Generated new private key for account update');
          
          // Create a new keyring but don't update the class's keyring yet
          var newKeyring = this.caver.wallet.keyring.createWithSingleKey(
            this.senderKeyring.address, 
            newPrivateKey
          );
          
          // Create an Account instance from the new keyring
          var account = newKeyring.toAccount();
          
          // Create the update transaction
          var tx = this.caver.transaction.accountUpdate.create({
            ...baseParams,
            from: this.senderKeyring.address,
            account: account
          });

          return { tx, newKeyring }; // Return both tx and the new keyring

        case 'feeDelegatedValueTransfer':
          if (!this.feePayerKeyring) {
            throw new Error('Fee payer keyring is not set');
          }
          return this.caver.transaction.feeDelegatedValueTransfer.create({
            ...baseParams,
            to: randomAddress,
            value,
            feePayer: this.feePayerKeyring.address
          });

        case 'feeDelegatedValueTransferMemo':
          return this.caver.transaction.feeDelegatedValueTransferMemo.create({
            ...baseParams,
            to: randomAddress,
            value,
            input: dummyData.memo,
            feePayer: this.feePayerKeyring.address
          });

        case 'feeDelegatedValueTransferWithRatio':
          return this.caver.transaction.feeDelegatedValueTransferWithRatio.create({
            ...baseParams,
            to: randomAddress,
            value,
            feePayer: this.feePayerKeyring.address,
            feeRatio: 30
          });

        case 'feeDelegatedValueTransferMemoWithRatio':
          return this.caver.transaction.feeDelegatedValueTransferMemoWithRatio.create({
            ...baseParams,
            to: randomAddress,
            value,
            input: dummyData.memo,
            feePayer: this.feePayerKeyring.address,
            feeRatio: 30
          });

        case 'feeDelegatedSmartContractDeploy':
          return this.caver.transaction.feeDelegatedSmartContractDeploy.create({
            ...baseParams,
            value: 0,
            input: dummyData.contract,
            feePayer: this.feePayerKeyring.address
          });

        case 'feeDelegatedSmartContractDeployWithRatio':
          return this.caver.transaction.feeDelegatedSmartContractDeployWithRatio.create({
            ...baseParams,
            value: 0,
            input: dummyData.contract,
            feePayer: this.feePayerKeyring.address,
            feeRatio: 30
          });
        case 'feeDelegatedSmartContractExecution':
          return this.caver.transaction.feeDelegatedSmartContractExecution.create({
            ...baseParams,
            to: this.contractAddress,
            value: '0x0',
            input: dummyData.contractInput,
            feePayer: this.feePayerKeyring.address,
          });

        case 'feeDelegatedSmartContractExecutionWithRatio':
          return this.caver.transaction.feeDelegatedSmartContractExecutionWithRatio.create({
            ...baseParams,
            to: this.contractAddress,
            value: '0x0',
            input: dummyData.contractInput,
            feePayer: this.feePayerKeyring.address,
            feeRatio: 30,
          });

        case 'feeDelegatedAccountUpdate':
         // Generate new private key
        newPrivateKey = this.caver.wallet.keyring.generateSingleKey();
         console.log('Generated new private key for account update');
         
         // Create a new keyring but don't update the class's keyring yet
        newKeyring = this.caver.wallet.keyring.createWithSingleKey(
           this.senderKeyring.address, 
           newPrivateKey
         );
         
         // Create an Account instance from the new keyring
        account = newKeyring.toAccount();
         
         // Create the update transaction
        tx = this.caver.transaction.feeDelegatedAccountUpdate.create({
           ...baseParams,
           from: this.senderKeyring.address,
           account: account,
           feePayer: this.feePayerKeyring.address,
         });

         return { tx, newKeyring }; // Return both tx and the new keyring

        case 'feeDelegatedAccountUpdateWithRatio':
         // Generate new private key
         newPrivateKey = this.caver.wallet.keyring.generateSingleKey();
         console.log('Generated new private key for account update');
         
         // Create a new keyring but don't update the class's keyring yet
        newKeyring = this.caver.wallet.keyring.createWithSingleKey(
           this.senderKeyring.address, 
           newPrivateKey
         );
         
         // Create an Account instance from the new keyring
        account = newKeyring.toAccount();
         
         // Create the update transaction
        tx = this.caver.transaction.feeDelegatedAccountUpdateWithRatio.create({
           ...baseParams,
           from: this.senderKeyring.address,
           account: account,
           feePayer: this.feePayerKeyring.address,
           feeRatio: 30,
         });

         return { tx, newKeyring }; // Return both tx and the new keyring

        case 'cancel':
          return this.caver.transaction.cancel.create({
            ...baseParams,
            from: this.senderKeyring.address,
          });

        case 'feeDelegatedCancel':
          return this.caver.transaction.feeDelegatedCancel.create({
            ...baseParams,
            feePayer: this.feePayerKeyring.address
          });

        case 'feeDelegatedCancelWithRatio':
          return this.caver.transaction.feeDelegatedCancelWithRatio.create({
            ...baseParams,
            feePayer: this.feePayerKeyring.address,
            feeRatio: 30
          });

        case 'ethereumAccessList':
          return this.caver.transaction.ethereumAccessList.create({
            ...baseParams,
            to: randomAddress,
            input: dummyData.memo,
            accessList: dummyData.accessList
          });

        case 'ethereumDynamicFee':
          return this.caver.transaction.ethereumDynamicFee.create({
            ...baseParams,
            to: randomAddress,
            input: dummyData.memo,
          });

        default:
          throw new Error(`Unsupported transaction type: ${txType}`);
      }
    } catch (error) {
      console.error('Transaction creation details:', {
        txType,
        dataSize,
        contractAddress: this.contractAddress,
        input: dummyData.contractInput
      });
      throw new Error(`Error creating transaction ${txType}: ${error.message}`);    }
  }

  async analyzeSingleTransaction(txType, dataSize) {
    try {
      console.log(`[${this.networkName}] Analyzing transaction type: ${txType} with data size: ${dataSize} bytes`);
      const result = await this.createTransaction(txType, dataSize);
      if (txType === 'accountUpdate' || txType === 'feeDelegatedAccountUpdate' || txType === 'feeDelegatedAccountUpdateWithRatio') {
        if (txType.includes('feeDelegated') && this.feePayerKeyring) {
          await this.caver.wallet.signAsFeePayer(this.feePayerKeyring.address, result.tx);
        }

        // Sign with the current (old) keyring
        const signed = await this.caver.wallet.sign(this.senderKeyring.address, result.tx);
        console.log('Transaction signed successfully');
        
        // Send transaction
        const receipt = await this.caver.rpc.klay.sendRawTransaction(signed);
        console.log('Transaction sent successfully:', receipt.transactionHash);
        
        // Wait for the transaction to be mined
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Now update the keyring
        this.caver.wallet.updateKeyring(result.newKeyring);
        this.senderKeyring = result.newKeyring;
  
        const gasUsedBN = new this.caver.utils.BN(receipt.gasUsed);
        const effectiveGasPriceBN = new this.caver.utils.BN(receipt.effectiveGasPrice || '0');
        const totalCostPeb = gasUsedBN.mul(effectiveGasPriceBN);
        
        return {
          txType,
          dataSize,
          networkName: this.networkName,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice || '0',
          totalCost: this.caver.utils.convertFromPeb(totalCostPeb, 'KLAY'),
          timestamp: Math.floor(Date.now() / 1000),
          success: true
        };
      }

      const tx = (txType === 'accountUpdate' || txType === 'feeDelegatedAccountUpdate' || txType === 'feeDelegatedAccountUpdateWithRatio') 
      ? result.tx 
      : result;
  
      if (tx._type.includes('FeeDelegated') && this.feePayerKeyring) {
        await this.caver.wallet.signAsFeePayer(this.feePayerKeyring.address, tx);
      }

      console.log(`Transaction details:`, {
        to: tx.to,
        inputLength: tx.input ? tx.input.length : 0,
        input: tx.input?.slice(0, 66) + '...'
      });
      
      console.log('About to sign transaction...');
      const signed = await this.caver.wallet.sign(this.senderKeyring.address, tx);
      console.log('Transaction signed successfully');
      
      console.log('Sending transaction...');
      const receipt = await this.caver.rpc.klay.sendRawTransaction(signed);
      console.log('Transaction sent successfully:', receipt.transactionHash);
      await new Promise(resolve => setTimeout(resolve, 1000));
  
      const gasUsedBN = new this.caver.utils.BN(receipt.gasUsed);
      const effectiveGasPriceBN = new this.caver.utils.BN(receipt.effectiveGasPrice || '0');
      const totalCostPeb = gasUsedBN.mul(effectiveGasPriceBN);
  
      return {
        txType,
        dataSize,
        networkName: this.networkName,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice || '0',
        totalCost: this.caver.utils.convertFromPeb(totalCostPeb, 'KAIA'),
        timestamp: Math.floor(Date.now() / 1000),
        success: true
      };
    } catch (error) {
      console.error(`[${this.networkName}] Detailed error information:`, {
        message: error.message,
        data: error.data,
        stack: error.stack
      });
  
      return {
        txType,
        dataSize,
        networkName: this.networkName,
        gasUsed: '0',
        effectiveGasPrice: '0',
        totalCost: '0',
        timestamp: Math.floor(Date.now() / 1000),
        success: false,
        error: error.message
      };
    }
  }
}

async function main() {
  const configs = [
    {
      rpcUrl: 'http://localhost:8553',
      privateKey: process.env.TESTNET_PRIVATE_KEY || '',
      feePayerPrivateKey: process.env.TESTNET_FEE_PAYER_PRIVATE_KEY || '',
      networkName: 'testnet',
      contractAddress: deployedAddresses.testnet
    },
    {
      rpcUrl: 'http://localhost:8551',
      privateKey: process.env.LOCAL_PRIVATE_KEY || '',
      feePayerPrivateKey: process.env.LOCAL_FEE_PAYER_PRIVATE_KEY || '',
      networkName: 'local',
      contractAddress: deployedAddresses.local
    }
  ];
 
  const analyzers = configs.map(config => new KaiaTransactionAnalyzer(config));
  const iterations = 1;
  const dataSizes = [32, 64, 128, 256, 512, 1024];
  const txTypes = [
    'legacyTransaction',
    // 'valueTransfer',
    // 'valueTransferMemo',
    // 'smartContractDeploy',
    // 'smartContractExecution',
    // 'accountUpdate',
    // 'cancel',
    // 'feeDelegatedValueTransfer',
    // 'feeDelegatedValueTransferMemo',
    // 'feeDelegatedValueTransferWithRatio',
    // 'feeDelegatedValueTransferMemoWithRatio',
    // 'feeDelegatedSmartContractDeploy',
    // 'feeDelegatedSmartContractDeployWithRatio',
    // 'feeDelegatedSmartContractExecution',
    // 'feeDelegatedSmartContractExecutionWithRatio',
    // 'feeDelegatedAccountUpdate',
    // 'feeDelegatedAccountUpdateWithRatio',
    // 'feeDelegatedCancel',
    // 'feeDelegatedCancelWithRatio',
    // 'ethereumAccessList',
    // 'ethereumDynamicFee'
  ];
  
  const allResults = [];
 
  for (let i = 0; i < iterations; i++) {
    console.log(`\nIteration ${i + 1} of ${iterations}`);
    
    for (const analyzer of analyzers) {
      for (const txType of txTypes) {
        for (const dataSize of dataSizes) {
          const analysis = await analyzer.analyzeSingleTransaction(txType, dataSize);
          allResults.push(analysis);
          
          if (analysis.success) {
            console.log(`[${analysis.networkName}] ${txType} with ${dataSize} bytes:`, {
              gasUsed: analysis.gasUsed,
              totalCost: `${analysis.totalCost} KAIA`
            });
          } else {
            console.log(`[${analysis.networkName}] Failed for ${dataSize} bytes:`, analysis.error);
          }
        }
      }
    }
  }
 
  const resultsByNetwork = new Map();
  allResults.forEach(result => {
    if (!resultsByNetwork.has(result.networkName)) {
      resultsByNetwork.set(result.networkName, new Map());
    }
    const networkResults = resultsByNetwork.get(result.networkName);
    
    const key = `${result.dataSize}`;
    const current = networkResults.get(key) || {
      avgGasUsed: 0,
      avgTotalCost: 0,
      gasPerByte: 0,
      count: 0
    };
    
    if (result.success) {
      const gasUsed = parseInt(result.gasUsed, 16);
      networkResults.set(key, {
        avgGasUsed: current.avgGasUsed + gasUsed,
        avgTotalCost: current.avgTotalCost + parseFloat(result.totalCost),
        gasPerByte: current.gasPerByte + (gasUsed / result.dataSize),
        count: current.count + 1
      });
    }
  });
 
  const uniqueTxTypes = [...new Set(allResults.map(r => r.txType))];
  processResults(allResults);
  for (const txType of uniqueTxTypes) {
    const txTypeDir = path.join('../results', txType);
    if (!fs.existsSync(txTypeDir)) {
      fs.mkdirSync(txTypeDir, { recursive: true });
    }
    
    const graphFileName = 'gas-comparison.png';
    const txResults = allResults.filter(result => result.txType === txType);
    await saveChartAsImage(txResults, path.join(txTypeDir, graphFileName));
    
    console.log(`Generated graph for ${txType}: ${graphFileName}`);
  }
}
 
if (require.main === module) {
  main().catch(console.error);
}
 
 module.exports = KaiaTransactionAnalyzer;
