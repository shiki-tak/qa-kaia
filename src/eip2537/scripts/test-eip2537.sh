#!/bin/bash

set -e

if [ -f .env ]; then
    export $(cat .env | xargs)
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY must be set in .env file"
    exit 1
fi

cd "$(dirname "$0")/.."

echo "Compiling contracts..."
npx hardhat compile

echo "Deploying contract..."
DEPLOY_OUTPUT=$(npx hardhat run deploy.ts --network homi)

export CONTRACT_ADDRESS=$(echo $DEPLOY_OUTPUT | jq -r '.contractAddress')

echo "Contract deployed at: $CONTRACT_ADDRESS"
echo "Running tests..."

npx hardhat run eip2537.ts --network homi

EXIT_CODE=$?

echo "Tests completed with exit code: $EXIT_CODE"
exit $EXIT_CODE
