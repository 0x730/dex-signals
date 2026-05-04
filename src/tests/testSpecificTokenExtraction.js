/**
 * Test script for extracting Solidity code from a specific token's JSON file
 *
 * This script tests the extraction and analysis of the problematic token
 * (0x13d06bbeeb664f3938f34dfca6cc172e57bf9938) that was causing issues.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const {
  extractSolidityFromJson,
  saveSolidityCode,
  isValidSolidityCode,
} = require('../services/inactive/secureServices/secureSolidityService');
const {
  analyzeSolidityWithSlither,
  isValidSolidityFile,
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

// The problematic token address
const TOKEN_ADDRESS = '0x13d06bbeeb664f3938f34dfca6cc172e57bf9938';

async function runTest() {
  logger.info(`Starting extraction test for token ${TOKEN_ADDRESS}`);

  try {
    // Path to the token's Solidity file
    const filePath = path.join(SOLIDITY_DIR, `${TOKEN_ADDRESS}.sol`);

    // Check if the file exists
    try {
      await fs.access(filePath);
      logger.info(`File exists at ${filePath}`);
    } catch (error) {
      logger.error(
        `File does not exist at ${filePath}. Creating a sample JSON file for testing.`
      );

      // Create a sample JSON file with minimal content for testing
      const sampleJson = `{
        "language": "Solidity",
        "sources": {
          "contracts/SimpleToken.sol": {
            "content": "// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.0;\\n\\ncontract SimpleToken {\\n    string public name = \\"TestToken\\";\\n    string public symbol = \\"TEST\\";\\n    uint8 public decimals = 18;\\n    uint256 public totalSupply = 1000000 * 10**18;\\n\\n    mapping(address => uint256) public balanceOf;\\n\\n    constructor() {\\n        balanceOf[msg.sender] = totalSupply;\\n    }\\n}"
          }
        }
      }`;

      await fs.writeFile(filePath, sampleJson, 'utf8');
      logger.info(`Created sample JSON file at ${filePath}`);
    }

    // Read the file content
    const content = await fs.readFile(filePath, 'utf8');
    logger.info(
      `Read file content (first 100 chars): ${content.substring(0, 100)}...`
    );

    // Check if it's valid Solidity code
    const isValid = isValidSolidityCode(content);
    logger.info(`Is the file valid Solidity? ${isValid ? 'Yes' : 'No'}`);

    // If not valid Solidity, try to extract from JSON
    if (!isValid) {
      logger.info('Attempting to extract Solidity code from JSON...');

      // Check if it's valid JSON
      try {
        JSON.parse(content);
        logger.info('Content is valid JSON');
      } catch (error) {
        logger.error(`Content is not valid JSON: ${error.message}`);
        return;
      }

      // Extract Solidity code from JSON
      const extractedFiles = extractSolidityFromJson(content);

      if (extractedFiles) {
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

          // Check if the extracted content is valid Solidity
          const isExtractedValid = isValidSolidityCode(
            extractedFiles[fileName]
          );
          logger.info(
            `Is extracted file valid Solidity? ${isExtractedValid ? 'Yes' : 'No'}`
          );
        }

        // Save the extracted files to disk
        logger.info(`Saving extracted files for address ${TOKEN_ADDRESS}...`);
        const saved = await saveSolidityCode(TOKEN_ADDRESS, extractedFiles);

        if (saved) {
          logger.info('Successfully saved extracted Solidity files');

          // Run Slither analysis on the saved files
          logger.info('Running Slither analysis...');
          try {
            const { analysis, humanSummary } =
              await analyzeSolidityWithSlither(TOKEN_ADDRESS);

            logger.info('Slither analysis completed successfully');
            logger.info(`Human summary:\n${humanSummary}`);

            if (analysis) {
              logger.info(
                `Analysis contains ${analysis.results?.detectors?.length || 0} detectors`
              );
            }
          } catch (slitherError) {
            logger.error(`Slither analysis failed: ${slitherError.message}`);
          }
        } else {
          logger.error('Failed to save extracted Solidity files');
        }
      } else {
        logger.error('Failed to extract Solidity code from JSON');
      }
    } else {
      // If it's already valid Solidity, run Slither analysis directly
      logger.info(
        'File is valid Solidity, running Slither analysis directly...'
      );
      try {
        const { analysis, humanSummary } =
          await analyzeSolidityWithSlither(TOKEN_ADDRESS);

        logger.info('Slither analysis completed successfully');
        logger.info(`Human summary:\n${humanSummary}`);

        if (analysis) {
          logger.info(
            `Analysis contains ${analysis.results?.detectors?.length || 0} detectors`
          );
        }
      } catch (slitherError) {
        logger.error(`Slither analysis failed: ${slitherError.message}`);
      }
    }
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
  }

  logger.info(`Completed extraction test for token ${TOKEN_ADDRESS}`);
}

// Run the test
runTest().catch((error) => {
  logger.error(`Test failed: ${error.message}`);
});
