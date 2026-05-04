/**
 * Test script for validating Solidity files
 *
 * This script tests the validation functions from the secure services
 * to ensure they correctly identify valid and invalid Solidity files and code.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const {
  isValidSolidityFile,
} = require('../services/inactive/secureServices/secureSlitherService');
const {
  isValidSolidityCode,
} = require('../services/inactive/secureServices/secureSolidityService');

// Directory where Solidity codes are stored
const SOLIDITY_DIR = path.resolve(__dirname, '..', 'solidity_codes', 'base');

// Test files
const testFiles = [
  '0xf8965033d5648d6fe98d748ebbb09170f9063569.sol', // Known JSON file (invalid)
  '0xcb3c3a62414a7bdaaa7fd5486a9a11be737deb07.sol', // Hopefully a valid Solidity file
];

async function runTests() {
  logger.info('Starting Solidity validation tests');

  logger.info('=== Testing isValidSolidityFile function ===');
  for (const file of testFiles) {
    const filePath = path.join(SOLIDITY_DIR, file);

    try {
      // Check if file exists
      await fs.access(filePath);

      // Test the file validation function
      const isValid = await isValidSolidityFile(filePath);

      logger.info(
        `File ${file}: ${isValid ? 'VALID Solidity' : 'INVALID Solidity'}`
      );

      // Read the first few lines to show in the log
      const content = await fs.readFile(filePath, 'utf8');
      const firstLines = content.split('\n').slice(0, 3).join('\n');
      logger.info(`First few lines: ${firstLines}`);

      // Test the code validation function
      logger.info('=== Testing isValidSolidityCode function ===');
      const isCodeValid = isValidSolidityCode(content);
      logger.info(
        `Code from ${file}: ${isCodeValid ? 'VALID Solidity' : 'INVALID Solidity'}`
      );
    } catch (error) {
      logger.error(`Error testing file ${file}: ${error.message}`);
    }
  }

  // Test some additional code samples
  logger.info('=== Testing additional code samples ===');

  const validSample = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private value;

    function set(uint256 _value) public {
        value = _value;
    }

    function get() public view returns (uint256) {
        return value;
    }
}`;

  const invalidSample = `{
    "status": "1",
    "message": "OK",
    "result": [
        {
            "SourceCode": "",
            "ABI": "[]",
            "ContractName": "",
            "CompilerVersion": "",
            "OptimizationUsed": "",
            "Runs": "",
            "ConstructorArguments": "",
            "EVMVersion": "",
            "Library": "",
            "LicenseType": "",
            "Proxy": "0",
            "Implementation": "",
            "SwarmSource": ""
        }
    ]
}`;

  logger.info(
    `Valid sample: ${isValidSolidityCode(validSample) ? 'VALID Solidity' : 'INVALID Solidity'}`
  );
  logger.info(
    `Invalid sample: ${isValidSolidityCode(invalidSample) ? 'VALID Solidity' : 'INVALID Solidity'}`
  );

  logger.info('Completed Solidity validation tests');
}

// Run the tests
runTests().catch((error) => {
  logger.error(`Test failed: ${error.message}`);
});
