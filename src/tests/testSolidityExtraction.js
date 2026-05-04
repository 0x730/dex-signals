/**
 * Test script for Solidity code extraction from JSON
 *
 * This script tests the new functions added to solidityService.js
 * to ensure they correctly handle JSON-formatted Solidity code.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const {
  isValidSolidityCode,
  extractSolidityFromJson,
} = require('../services/inactive/solidityService');

// Directory where Solidity codes are stored
const SOLIDITY_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'solidity_codes',
  'base'
);

// Test file - the problematic JSON file
const testFile = '0xf8965033d5648d6fe98d748ebbb09170f9063569.sol';

async function runTest() {
  logger.info('Starting Solidity extraction test');

  try {
    // Read the file content
    const filePath = path.join(SOLIDITY_DIR, testFile);
    const content = await fs.readFile(filePath, 'utf8');

    // Test if it's valid Solidity code (should be false)
    const isValid = isValidSolidityCode(content);
    logger.info(`Is ${testFile} valid Solidity? ${isValid ? 'Yes' : 'No'}`);

    // Try to extract Solidity code from JSON
    if (!isValid) {
      logger.info(`Attempting to extract Solidity code from JSON...`);
      const extractedCode = extractSolidityFromJson(content);

      if (extractedCode) {
        // Check if the extracted code is valid Solidity
        const isExtractedValid = isValidSolidityCode(extractedCode);
        logger.info(
          `Is extracted code valid Solidity? ${isExtractedValid ? 'Yes' : 'No'}`
        );

        // Show the first few lines of the extracted code
        const firstLines = extractedCode.split('\n').slice(0, 5).join('\n');
        logger.info(`First few lines of extracted code:\n${firstLines}`);

        // Save the extracted code to a new file for inspection
        const newFilePath = path.join(
          SOLIDITY_DIR,
          `${testFile}.extracted.sol`
        );
        await fs.writeFile(newFilePath, extractedCode, 'utf8');
        logger.info(`Extracted code saved to ${newFilePath}`);
      } else {
        logger.warn(`Could not extract valid Solidity code from ${testFile}`);
      }
    }
  } catch (error) {
    logger.error(`Error testing file ${testFile}: ${error.message}`);
  }

  logger.info('Completed Solidity extraction test');
}

// Run the test
runTest().catch((error) => {
  logger.error(`Test failed: ${error.message}`);
});
