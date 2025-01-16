// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract EIP2537 {
    mapping(address => bytes) private pendingInputs;
    
    function clearInput() public {
        delete pendingInputs[msg.sender];
    }

    function addInputChunk(bytes memory chunk) public {
        pendingInputs[msg.sender] = bytes.concat(pendingInputs[msg.sender], chunk);
    }

    // G1 Addition
    function bls12381G1Add(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x0b).call(finalInput);
        require(ok, "bls12381 g1 add operation failed");
        return output;
    }

    // G1 Multiplication
    function bls12381G1Mul(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x0c).call(finalInput);
        require(ok, "bls12381 g1 mul operation failed");
        return output;
    }

    // G1 MultiExp
    function bls12381G1MultiExp(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x0d).call(finalInput);
        require(ok, "bls12381 g1 multiexp operation failed");
        return output;
    }

    // G2 Addition
    function bls12381G2Add(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x0e).call(finalInput);
        require(ok, "bls12381 g2 add operation failed");
        return output;
    }

    // G2 Multiplication
    function bls12381G2Mul(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x0f).call(finalInput);
        require(ok, "bls12381 g2 mul operation failed");
        return output;
    }

    // G2 MultiExp
    function bls12381G2MultiExp(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x10).call(finalInput);
        require(ok, "bls12381 g2 multiexp operation failed");
        return output;
    }

    // Pairing
    function bls12381Pairing(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x11).call(finalInput);
        require(ok, "bls12381 pairing operation failed");
        return output;
    }

    // Map G1
    function bls12381MapG1(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x12).call(finalInput);
        require(ok, "bls12381 map g1 operation failed");
        return output;
    }

    // Map G2
    function bls12381MapG2(bytes memory input) public returns (bytes memory) {
        bytes memory finalInput;
        if (pendingInputs[msg.sender].length > 0) {
            finalInput = pendingInputs[msg.sender];
            delete pendingInputs[msg.sender];
        } else {
            finalInput = input;
        }
        (bool ok, bytes memory output) = address(0x13).call(finalInput);
        require(ok, "bls12381 map g2 operation failed");
        return output;
    }
}
