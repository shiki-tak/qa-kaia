import { ethers } from "hardhat";

async function main() {
    const signerPrivateKey = process.env.PRIVATE_KEY;
    if (!signerPrivateKey) {
        throw new Error("SIGNER_PRIVATE_KEY not found in environment");
    }

    const EIP2537 = await ethers.getContractFactory("EIP2537");
    const contract = await EIP2537.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    
    console.log(JSON.stringify({
        contractAddress: address,
        signerPrivateKey: signerPrivateKey
    }));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
});