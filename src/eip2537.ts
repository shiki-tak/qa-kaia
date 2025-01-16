import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { EIP2537 } from "../typechain-types";
import { expect } from "chai";
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
    Input: string;
    Expected: string;
    Name: string;
    Gas: number;
    NoBenchmark: boolean;
}

interface TestFunction {
    name: string;
    contractMethod: string;
    jsonFile: string;
}

const FAST_EXECUTION_LIMIT = 50 * 1024 * 2;

const testFunctions: TestFunction[] = [
    { name: "G1 Add", contractMethod: "bls12381G1Add", jsonFile: "blsG1Add.json" },
    { name: "G1 Mul", contractMethod: "bls12381G1Mul", jsonFile: "blsG1Mul.json" },
    { name: "G1 MultiExp", contractMethod: "bls12381G1MultiExp", jsonFile: "blsG1MultiExp.json" },
    { name: "G2 Add", contractMethod: "bls12381G2Add", jsonFile: "blsG2Add.json" },
    { name: "G2 Mul", contractMethod: "bls12381G2Mul", jsonFile: "blsG2Mul.json" },
    { name: "G2 MultiExp", contractMethod: "bls12381G2MultiExp", jsonFile: "blsG2MultiExp.json" },
    { name: "Map G1", contractMethod: "bls12381MapG1", jsonFile: "blsMapG1.json" },
    { name: "Map G2", contractMethod: "bls12381MapG2", jsonFile: "blsMapG2.json" },
    { name: "Pairing", contractMethod: "bls12381Pairing", jsonFile: "blsPairing.json" }
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

async function clearContractState(contract: EIP2537): Promise<void> {
    await runWithRecovery(
        async () => {
            const tx = await contract.clearInput();
            await tx.wait();
        },
        "Clear contract state"
    );
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

async function runTests(
    contract: EIP2537,
    functionInfo: TestFunction
): Promise<{ passed: number; failed: number }> {
    const testFilePath = path.join(__dirname, '../testdata/eip2537', functionInfo.jsonFile);
    let testCases: TestCase[];
    let passedTests = 0;
    let failedTests = 0;
    
    console.log(`\n=== Testing ${functionInfo.name} ===`);
    
    try {
        const jsonData = fs.readFileSync(testFilePath, 'utf8');
        testCases = JSON.parse(jsonData);
    } catch (error) {
        console.error(`Error reading test cases for ${functionInfo.name}:`, error);
        return { passed: 0, failed: 1 };
    }

    for (const testCase of testCases) {
        console.log(`\nRunning test: ${testCase.Name}`);
        try {
            console.log(`Input size: ${testCase.Input.length} characters`);

            if (testCase.Input.length > FAST_EXECUTION_LIMIT) {
                await clearContractState(contract);
            }

            const result = await executeOperation(contract, functionInfo, testCase);
            const matches = await verifyResult(result, testCase.Expected, testCase.Name);

            if (matches) {
                passedTests++;
            } else {
                failedTests++;
            }

            if (testCase.Input.length > FAST_EXECUTION_LIMIT) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            console.error(`Error in test case ${testCase.Name}:`, error);
            failedTests++;
        }
    }

    console.log(`\n${functionInfo.name} Summary:`);
    console.log(`Total tests: ${testCases.length}`);
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

    const resultDir = path.join(__dirname, '..', 'results');
    
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
