/**
 * Test script for JSON-formatted Solidity code extraction and analysis
 *
 * This script tests the new functionality to extract Solidity code from JSON,
 * save it to disk, and analyze it with Slither.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const {
  extractSolidityFromJson,
  saveSolidityCode,
} = require('../services/inactive/secureServices/secureSolidityService');
const {
  analyzeSolidityWithSlither,
} = require('../services/inactive/secureServices/secureSlitherService');

// Directory where Solidity codes are stored
const SOLIDITY_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'solidity_codes',
  'base'
);

// Test address - use a placeholder address for testing
const TEST_ADDRESS = '0xTestJsonExtraction';

// Sample JSON content with a simplified Solidity contract
const sampleJsonContent = `{
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
}`;

async function runTest() {
  logger.info('Starting JSON Solidity extraction and analysis test');

  try {
    // First, extract Solidity code from the JSON
    logger.info('Extracting Solidity code from JSON...');
    const extractedFiles = extractSolidityFromJson(sampleJsonContent);

    if (!extractedFiles) {
      logger.error('Failed to extract Solidity code from JSON');
      return;
    }

    logger.info(
      `Successfully extracted ${Object.keys(extractedFiles).length} Solidity files from JSON`
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

    // Save the extracted files to disk
    logger.info(`Saving extracted files for address ${TEST_ADDRESS}...`);
    const saved = await saveSolidityCode(TEST_ADDRESS, extractedFiles);

    if (!saved) {
      logger.error('Failed to save extracted Solidity files');
      return;
    }

    logger.info('Successfully saved extracted Solidity files');

    // Run Slither analysis on the saved files
    logger.info('Running Slither analysis...');
    try {
      const { analysis, humanSummary } =
        await analyzeSolidityWithSlither(TEST_ADDRESS);

      logger.info('Slither analysis completed successfully');
      logger.info(`Human summary:\n${humanSummary}`);

      if (analysis) {
        logger.info(
          `Analysis contains ${analysis.results.detectors.length} detectors`
        );
      }
    } catch (slitherError) {
      logger.error(`Slither analysis failed: ${slitherError.message}`);
    }

    // Clean up test files
    logger.info('Cleaning up test files...');
    try {
      // Remove the directory with extracted files
      const dirPath = path.join(SOLIDITY_DIR, TEST_ADDRESS);
      const dirContents = await fs.readdir(dirPath);

      for (const file of dirContents) {
        await fs.unlink(path.join(dirPath, file));
      }

      await fs.rmdir(dirPath);

      // Remove the main file
      const filePath = path.join(SOLIDITY_DIR, `${TEST_ADDRESS}.sol`);
      await fs.unlink(filePath);

      logger.info('Test files cleaned up successfully');
    } catch (cleanupError) {
      logger.warn(
        `Failed to clean up some test files: ${cleanupError.message}`
      );
    }
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
  }

  logger.info('Completed JSON Solidity extraction and analysis test');
}

// Run the test
runTest().catch((error) => {
  logger.error(`Test failed: ${error.message}`);
});
