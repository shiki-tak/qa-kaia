// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract DataSizeTest {
    event DataProcessed(bytes data);
    
    function processData(bytes calldata data) external {
        emit DataProcessed(data);
    }
    
    function processMultipleData(
        bytes32[] calldata data1,
        bytes32[] calldata data2,
        bytes32[] calldata data3
    ) external {
        for(uint i = 0; i < data1.length; i++) {
            emit DataProcessed(abi.encodePacked(data1[i]));
        }
        for(uint i = 0; i < data2.length; i++) {
            emit DataProcessed(abi.encodePacked(data2[i]));
        }
        for(uint i = 0; i < data3.length; i++) {
            emit DataProcessed(abi.encodePacked(data3[i]));
        }
    }
}