import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { EIP2537 } from "../../typechain-types";
import { expect } from "chai";
import * as fs from 'fs';
import * as path from 'path';

interface SuccessTestCase {
    Input: string;
    Expected: string;
    Name: string;
    Gas: number;
    NoBenchmark: boolean;
}

interface FailureTestCase {
    Input: string;
    ExpectedError: string;
    Name: string;
}

interface TestFunction {
    name: string;
    contractMethod: string;
    successJsonFile: string;
    failureJsonFile: string;
}

const testFunctions: TestFunction[] = [
    { 
        name: "G1 Add", 
        contractMethod: "bls12381G1Add", 
        successJsonFile: "blsG1Add.json",
        failureJsonFile: "fail-blsG1Add.json"
    },
    { 
        name: "G1 Mul", 
        contractMethod: "bls12381G1Mul", 
        successJsonFile: "blsG1Mul.json",
        failureJsonFile: "fail-blsG1Mul.json"
    },
    { 
        name: "G1 MultiExp", 
        contractMethod: "bls12381G1MultiExp", 
        successJsonFile: "blsG1MultiExp.json",
        failureJsonFile: "fail-blsG1MultiExp.json"
    },
    { 
        name: "G2 Add", 
        contractMethod: "bls12381G2Add", 
        successJsonFile: "blsG2Add.json",
        failureJsonFile: "fail-blsG2Add.json"
    },
    { 
        name: "G2 Mul", 
        contractMethod: "bls12381G2Mul", 
        successJsonFile: "blsG2Mul.json",
        failureJsonFile: "fail-blsG2Mul.json"
    },
    { 
        name: "G2 MultiExp", 
        contractMethod: "bls12381G2MultiExp", 
        successJsonFile: "blsG2MultiExp.json",
        failureJsonFile: "fail-blsG2MultiExp.json"
    },
    { 
        name: "Map G1", 
        contractMethod: "bls12381MapG1", 
        successJsonFile: "blsMapG1.json",
        failureJsonFile: "fail-blsMapG1.json"
    },
    { 
        name: "Map G2", 
        contractMethod: "bls12381MapG2", 
        successJsonFile: "blsMapG2.json",
        failureJsonFile: "fail-blsMapG2.json"
    },
    { 
        name: "Pairing", 
        contractMethod: "bls12381Pairing", 
        successJsonFile: "blsPairing.json",
        failureJsonFile: "fail-blsPairing.json"
    }
 ];

async function runWithRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxAttempts: number = 3,
    baseWaitTime: number = 5000
): Promise<T> {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.log(`${operationName} failed (attempt ${attempt}/${maxAttempts}): ${error.message}`);
            
            if (attempt === maxAttempts) {
                console.error(`All attempts failed for ${operationName}`);
                throw lastError;
            }

            const waitTime = baseWaitTime * attempt;
            console.log(`Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    throw lastError;
}

async function executeOperation(
    contract: EIP2537,
    functionInfo: TestFunction,
    testCase: TestCase
): Promise<string> {
    const FAST_EXECUTION_LIMIT = 50 * 1024 * 2;
    
    if (testCase.Input.length <= FAST_EXECUTION_LIMIT) {
        console.log("Fast execution path for small input");
        const result = await contract[functionInfo.contractMethod].staticCall('0x' + testCase.Input);
        return ethers.hexlify(result).slice(2);
    }

    return await runWithRecovery(
        async () => {
            const result = await contract[functionInfo.contractMethod].staticCall('0x' + testCase.Input);
            return ethers.hexlify(result).slice(2);
        },
        "Execute operation",
        3,  // maxAttempts
        5000 // baseWaitTime
    );
}

async function verifyResult(
    result: string,
    expected: string,
    testName: string
): Promise<boolean> {
    const matches = result.toLowerCase() === expected.toLowerCase();
    console.log(`\nTest ${testName} results:`);
    console.log("Result:  ", result);
    console.log("Expected:", expected);
    console.log("Test passed:", matches);
    return matches;
}

async function runFailureTest(
    contract: EIP2537,
    functionInfo: TestFunction,
    testCase: FailureTestCase
): Promise<boolean> {
    console.log(`\nRunning failure test: ${testCase.Name}`);
    
    try {
        const result = await ethers.provider.call({
            to: await contract.getAddress(),
            data: contract.interface.encodeFunctionData(
                functionInfo.contractMethod,
                ['0x' + testCase.Input]
            )
        });
        
        console.error("Test should have failed but succeeded");
        return false;
    } catch (error) {
        let revertData = error.data;
        if (error.error && error.error.data) {
            revertData = error.error.data;
        }

        let errorMessage = "";
        if (revertData) {
            try {
                const bytes = ethers.getBytes(revertData);
                errorMessage = ethers.toUtf8String(bytes.slice(4));
            } catch (e) {
                errorMessage = error.reason || error.message;
            }
        } else {
            errorMessage = error.reason || error.message;
        }

        const isExpectedError = errorMessage.toLowerCase().includes("evm: execution reverted");
        console.log("Error matches expected:", isExpectedError);
        
        return isExpectedError;
    }
}

async function runTests(
    contract: EIP2537,
    functionInfo: TestFunction
): Promise<{ passed: number; failed: number }> {
    let passedTests = 0;
    let failedTests = 0;
    
    const successFilePath = path.join(__dirname, './testdata', functionInfo.successJsonFile);
    try {
        const successJsonData = fs.readFileSync(successFilePath, 'utf8');
        const successTests: SuccessTestCase[] = JSON.parse(successJsonData);
        
        console.log(`\n=== Running Success Tests for ${functionInfo.name} ===`);
        for (const testCase of successTests) {
            try {
                const result = await executeOperation(contract, functionInfo, testCase);
                const matches = await verifyResult(result, testCase.Expected, testCase.Name);
                if (matches) passedTests++;
                else failedTests++;
            } catch (error) {
                console.error(`Error in success test case ${testCase.Name}:`, error);
                failedTests++;
            }
        }
    } catch (error) {
        console.error(`Error reading success test cases:`, error);
    }

    const failureFilePath = path.join(__dirname, './testdata', functionInfo.failureJsonFile);
    try {
        const failureJsonData = fs.readFileSync(failureFilePath, 'utf8');
        const failureTests: FailureTestCase[] = JSON.parse(failureJsonData);
        
        console.log(`\n=== Running Failure Tests for ${functionInfo.name} ===`);
        for (const testCase of failureTests) {
            const passed = await runFailureTest(contract, functionInfo, testCase);
            if (passed) passedTests++;
            else failedTests++;
        }
    } catch (error) {
        console.error(`Error reading failure test cases:`, error);
    }

    console.log(`\n${functionInfo.name} Summary:`);
    console.log(`Total tests: ${passedTests + failedTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);

    return { passed: passedTests, failed: failedTests };
}

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const signerPrivateKey = process.env.PRIVATE_KEY;

    if (!contractAddress || !signerPrivateKey) {
        throw new Error("CONTRACT_ADDRESS or SIGNER_PRIVATE_KEY not found in environment");
    }

    const provider = ethers.provider;
    const signer = new ethers.Wallet(signerPrivateKey, provider);

    console.log("Connecting to contract...");
    const BLS12381 = await ethers.getContractFactory("EIP2537");
    const bls12381 = (await BLS12381.attach(contractAddress).connect(signer)) as EIP2537;
    console.log("Contract connected at:", contractAddress);

    let totalPassed = 0;
    let totalFailed = 0;

    let outputBuffer = "";

    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
        const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
        outputBuffer += message + '\n';
        originalConsoleLog(...args);
    };

    for (const testFunction of testFunctions) {
        const { passed, failed } = await runTests(bls12381, testFunction);
        totalPassed += passed;
        totalFailed += failed;
    }

    console.log("\n=== Overall Test Summary ===");
    console.log(`Total tests passed: ${totalPassed}`);
    console.log(`Total tests failed: ${totalFailed}`);

    const resultDir = path.join(__dirname, '.', 'results');
    
    if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true });
    }

    const resultPath = path.join(resultDir, 'eip2537.txt');
    fs.writeFileSync(resultPath, outputBuffer);
    console.log(`Test results saved to ${resultPath}`);

    if (totalFailed > 0) {
        process.exitCode = 1;
    }

    console.log = originalConsoleLog;
}

main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exitCode = 1;
});
