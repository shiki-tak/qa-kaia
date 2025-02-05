const fs = require('fs');
const path = require('path');
const CONTRACT_BYTECODES = require('./contract-bytecodes');

const GasParams = {
  local: {
    TxGas: 21000,
    TxGasContractCreation: 53000,
    TxGasContractExecution: 21000,
    TxGasAccountUpdate: 21000,
    TxGasCancel: 21000,
    TxGasFeeDelegated: 10000,
    TxGasFeeDelegatedWithRatio: 15000,
    TxAccountCreationGasPerKey: 20000,
    TxAccessListAddressGas: 2400,
    TxAccessListStorageKeyGas: 1900,
    TxGasHumanReadable: 4000000000
  }
};

const ExecutionGasUsed = {
  "smartContractDeploy": {
    32: 86533,
    64: 87733,
    128: 100545,
    256: 127369,
    512: 178618,
    1024: 281116
  },
  "smartContractExecution": {
    32: 2135,
    64: 2397,
    128: 2921,
    256: 3969,
    512: 6066,
    1024: 10259
  }
};

function toWordSize(size) {
  if (size > Number.MAX_SAFE_INTEGER - 31) {
    return Math.floor(Number.MAX_SAFE_INTEGER / 32) + 1;
  }
  return Math.floor((size + 31) / 32);
}

function calculateTokensAndGas(bytecode) {
  const data = bytecode.slice(2);
  let nonZeroBytes = 0;
  
  for(let i = 0; i < data.length; i += 2) {
    const byte = parseInt(data.slice(i, i + 2), 16);
    if(byte !== 0) {
      nonZeroBytes++;
    }
  }
  
  const totalBytes = data.length / 2;
  const zeroBytes = totalBytes - nonZeroBytes;
  return {
    tokens: nonZeroBytes * 4 + zeroBytes,
    totalBytes
  };
}

function calculateTokens(data) {
  const hexData = data.startsWith('0x') ? data.slice(2) : data;
  let nonZeroBytes = 0;
  
  for(let i = 0; i < hexData.length; i += 2) {
    const byte = parseInt(hexData.slice(i, i + 2), 16);
    if(byte !== 0) {
      nonZeroBytes++;
    }
  }
  
  const totalBytes = hexData.length / 2;
  const zeroBytes = totalBytes - nonZeroBytes;
  return {
    tokens: nonZeroBytes * 4 + zeroBytes,
    totalBytes
  };
}


function calculateExpectedGas(txType, dataSize, networkName) {
  const isContractCreation = txType === 'smartContractDeploy' || 
                            txType === 'feeDelegatedSmartContractDeploy' ||
                            txType === 'feeDelegatedSmartContractDeployWithRatio';
 
  const noPayloadTypes = [
    'accountCreation',
    'accountUpdate',
    'cancel',
    'feeDelegatedAccountUpdateWithRatio',
    'feeDelegatedAccountUpdate',
    'feeDelegatedCancelWithRatio',
    'feeDelegatedCancel',
    'feeDelegatedValueTransferWithRatio',
    'feeDelegatedValueTransfer',
    'valueTransfer'
  ];
 
  const params = GasParams[networkName];
 
  if (txType === 'accountUpdate') {
    return params.TxGasAccountUpdate + params.TxAccountCreationGasPerKey;
  }
  if (txType === 'feeDelegatedAccountUpdate') {
    return params.TxGasAccountUpdate + params.TxAccountCreationGasPerKey + params.TxGasFeeDelegated;
  }
  if (txType === 'feeDelegatedAccountUpdateWithRatio') {
    return params.TxGasAccountUpdate + params.TxAccountCreationGasPerKey + params.TxGasFeeDelegatedWithRatio;
  }
 
  if (dataSize > 0 && networkName === 'local' && !noPayloadTypes.includes(txType)) {
    let tokens, totalBytes, execution_gas_used;
 
    const baseGas = params.TxGas;
 
    if (isContractCreation) {
      const bytecode = CONTRACT_BYTECODES[dataSize];
      ({ tokens, totalBytes } = calculateTokensAndGas(bytecode));
      execution_gas_used = ExecutionGasUsed['smartContractDeploy'][dataSize] || 0;
    } else if (txType === 'smartContractExecution' || txType.includes('feeDelegatedSmartContractExecution')) {
      const functionSelector = '8331ed0f';
      const dataOffset = '0000000000000000000000000000000000000000000000000000000000000020';
      const dataLength = dataSize.toString(16).padStart(64, '0');
      const inputData = 'a'.repeat(dataSize * 2).padEnd(64, '0');
 
      const fullData = '0x' + functionSelector + dataOffset + dataLength + inputData;
      ({ tokens, totalBytes } = calculateTokens(fullData));
      execution_gas_used = ExecutionGasUsed['smartContractExecution'][dataSize] || 0;
    } else {
      const dummyData = 'a'.repeat(dataSize * 2);
      ({ tokens } = calculateTokens(dummyData));
      execution_gas_used = 0;
    }
 
    const wordSize = toWordSize(totalBytes);
    const standardGas = tokens * 4 + execution_gas_used + 
    (isContractCreation ? (32000 + wordSize * 2) : 0);
    let gas = baseGas + standardGas;
 
    if (txType === 'ethereumAccessList') {
      const accessList = [{
        address: '0x5430192ae264b3feff967fc08982b9c6f5694023',
        storageKeys: [
          '0x' + '0'.repeat(63) + '1',
          '0x' + '0'.repeat(63) + '2'
        ]
      }];
      gas += accessList.length * params.TxAccessListAddressGas;
      const storageKeysTotal = accessList.reduce((sum, item) => sum + item.storageKeys.length, 0);
      gas += storageKeysTotal * params.TxAccessListStorageKeyGas;
    }
 
    const floorDataGas = baseGas + tokens * 10;
 
    if (txType.includes('feeDelegated')) {
      const feeDelegationCost = txType.includes('WithRatio') ? 
        params.TxGasFeeDelegatedWithRatio : 
        params.TxGasFeeDelegated;
      // Add feeDelegationCost to both floor gas and standard gas calculation
      return Math.max(gas + feeDelegationCost, floorDataGas + feeDelegationCost);
    } else {
      return Math.max(gas, floorDataGas);
    }
  }
 
  let gas = params.TxGas;
 
  if (txType.includes('feeDelegated')) {
    gas += txType.includes('WithRatio') ? 
      params.TxGasFeeDelegatedWithRatio : 
      params.TxGasFeeDelegated;
  }
 
  return gas;
}
  
function processResults(allResults) {
  const resultsByTxTypeAndNetwork = new Map();

  allResults.forEach(result => {
    const key = `${result.networkName}-${result.txType}`;
    if (!resultsByTxTypeAndNetwork.has(key)) {
      resultsByTxTypeAndNetwork.set(key, new Map());
    }
    const networkResults = resultsByTxTypeAndNetwork.get(key);
    
    const sizeKey = `${result.dataSize}`;
    const current = networkResults.get(sizeKey) || {
      avgGasUsed: 0,
      avgTotalCost: 0,
      gasPerByte: 0,
      count: 0
    };
    
    if (result.success) {
      const gasUsed = parseInt(result.gasUsed, 16);
      networkResults.set(sizeKey, {
        avgGasUsed: current.avgGasUsed + gasUsed,
        avgTotalCost: current.avgTotalCost + parseFloat(result.totalCost),
        gasPerByte: current.gasPerByte + (gasUsed / result.dataSize),
        count: current.count + 1
      });
    }
  });

  resultsByTxTypeAndNetwork.forEach((results, key) => {
    const [networkName, txType] = key.split('-');
    if (networkName === 'local') {
      let output = `=== Gas Validation Results ===\n\n${txType}:\n`;
      
      results.forEach((data, dataSize) => {
        const avgGasUsed = Math.round(data.avgGasUsed / data.count);
        const isValid = validateGasUsage(txType, parseInt(dataSize), avgGasUsed, networkName);
        const expectedGas = calculateExpectedGas(txType, parseInt(dataSize), networkName);

        output += `\nData Size: ${dataSize} bytes\n`;
        output += `Expected: ${expectedGas}\n`;
        output += `Actual: ${avgGasUsed}\n`;
        output += `Difference: ${Math.abs(avgGasUsed - expectedGas)}\n`;
        output += `Gas validation: ${isValid ? 'PASS' : 'FAIL'}\n`;
      });

      const txTypeDir = path.join('../results', txType);
      if (!fs.existsSync(txTypeDir)) {
        fs.mkdirSync(txTypeDir, { recursive: true });
      }

      fs.writeFileSync(path.join(txTypeDir, 'gas-validation.txt'), output);
      console.log(output);
    }
  });
}
 
function validateGasUsage(txType, dataSize, gasUsed, networkName) {
    const expectedGas = calculateExpectedGas(txType, dataSize, networkName);
    return gasUsed === expectedGas;
}
  
module.exports = {
    validateGasUsage,
    processResults,
    GasParams
};
