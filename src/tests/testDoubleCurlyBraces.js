/**
 * Test script for handling JSON-formatted Solidity code with double curly braces
 *
 * This script tests the functionality to handle JSON strings that start with {{ and end with }}
 */

require('dotenv').config();
const logger = require('../utils/logger');
const {
  extractSolidityFromJson,
} = require('../services/inactive/solidityService');

// Sample JSON content with double curly braces
const sampleJsonContent = `{{
  "language": "Solidity",
  "sources": {
    "contracts/SimpleStorage.sol": {
      "content": "// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.0;\\n\\ncontract SimpleStorage {\\n    uint256 private value;\\n\\n    function set(uint256 _value) public {\\n        value = _value;\\n    }\\n\\n    function get() public view returns (uint256) {\\n        return value;\\n    }\\n}"
    }
  },
  "settings": {
    "evmVersion": "paris",
    "optimizer": {
      "enabled": false,
      "runs": 200
    },
    "outputSelection": {
      "*": {
        "*": [
          "evm.bytecode",
          "evm.deployedBytecode",
          "abi"
        ]
      }
    }
  }
}}`;

// Test the extraction function
function testExtraction() {
  logger.info('Starting test for JSON with double curly braces');

  try {
    // Extract Solidity code from the JSON with double curly braces
    const extractedFiles = extractSolidityFromJson(sampleJsonContent);

    if (!extractedFiles) {
      logger.error(
        'Failed to extract Solidity code from JSON with double curly braces'
      );
      return;
    }

    logger.info(
      `Successfully extracted ${Object.keys(extractedFiles).length} Solidity files from JSON with double curly braces`
    );

    // Display the names of the extracted files
    for (const fileName of Object.keys(extractedFiles)) {
      logger.info(`Extracted file: ${fileName}`);

      // Show the first few lines of each file
      const firstLines = extractedFiles[fileName]
        .split('\n')
        .slice(0, 5)
        .join('\n');
      logger.info(`First few lines of ${fileName}:\n${firstLines}`);
    }

    logger.info('Test completed successfully');
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
  }
}

// Run the test
testExtraction();
