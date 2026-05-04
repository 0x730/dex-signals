/**
 * Solidity Service
 *
 * This service handles downloading and saving Solidity code for token contracts.
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const TokenModel = require('../../models/TokenModel');
const { withRetry, sleep } = require('../../utils/baseWorker');

// API configuration
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
const BASE_SCAN_URL = 'https://api.basescan.org/api';

// Directory to save Solidity codes
const SOLIDITY_DIR = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'solidity_codes',
  'base'
);

// Ensure the directory exists
if (!fs.existsSync(SOLIDITY_DIR)) {
  fs.mkdirSync(SOLIDITY_DIR, { recursive: true });
}

/**
 * Validate if a string contains valid Solidity code
 *
 * @param {string} code - The code to validate
 * @returns {boolean} - True if valid Solidity, false otherwise
 */
function isValidSolidityCode(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Check if the code starts with JSON markers
  if (code.trim().startsWith('{') || code.trim().startsWith('[')) {
    // Try to parse as JSON to confirm
    try {
      JSON.parse(code);
      logger.warn(`Code appears to be JSON, not Solidity code`);
      return false;
    } catch (e) {
      // Not valid JSON, might still be Solidity with a brace at the start
    }
  }

  // Check for common Solidity patterns
  const hasPragma = code.includes('pragma solidity');
  const hasContract =
    code.includes('contract ') ||
    code.includes('library ') ||
    code.includes('interface ');
  const hasSpdx = code.includes('SPDX-License-Identifier:');

  // If it has at least one of these patterns, it's likely Solidity
  return hasPragma || hasContract || hasSpdx;
}

/**
 * Extract Solidity code from JSON if possible
 *
 * @param {string} jsonCode - The JSON string that might contain Solidity code
 * @returns {Object|null} - Object with extracted Solidity code files or null if not found
 */
function extractSolidityFromJson(jsonCode) {
  try {
    // Check for double curly braces at the beginning and end
    let processedJsonCode = jsonCode;
    if (
      processedJsonCode.trim().startsWith('{{') &&
      processedJsonCode.trim().endsWith('}}')
    ) {
      logger.info(
        'Detected double curly braces in JSON. Removing extra braces for parsing.'
      );
      // Remove the first and last curly brace
      processedJsonCode = processedJsonCode
        .trim()
        .substring(1, processedJsonCode.trim().length - 1);
    }

    // Parse the JSON
    const parsed = JSON.parse(processedJsonCode);

    // Check if it's a standard compiler input JSON format with sources
    if (parsed.sources) {
      const extractedFiles = {};
      let hasValidSolidity = false;

      // Extract all source files content
      for (const sourcePath in parsed.sources) {
        if (parsed.sources[sourcePath].content) {
          const content = parsed.sources[sourcePath].content;

          // Validate the content is Solidity code
          if (isValidSolidityCode(content)) {
            // Use the filename from the path, or the full path if no filename
            const fileName = sourcePath.split('/').pop() || sourcePath;
            extractedFiles[fileName] = content;
            hasValidSolidity = true;
            logger.info(
              `Successfully extracted Solidity code from JSON for source: ${sourcePath}`
            );
          }
        }
      }

      if (hasValidSolidity) {
        return extractedFiles;
      }
    }

    logger.warn('Could not extract valid Solidity code from JSON');
    return null;
  } catch (error) {
    logger.error(`Error parsing JSON: ${error.message}`);
    return null;
  }
}

/**
 * Fetch Solidity code for a given contract address on BASE.
 *
 * @param {string} address - The contract address.
 * @returns {string|null} - The Solidity code or null if not available.
 */
async function fetchSolidityCode(address) {
  const params = {
    module: 'contract',
    action: 'getsourcecode',
    address: address,
    apikey: BASESCAN_API_KEY,
  };

  try {
    const response = await withRetry(
      async () => {
        return await axios.get(BASE_SCAN_URL, { params });
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
      }
    );

    if (response.data.status !== '1') {
      logger.warn(
        `Failed to fetch Solidity code for address ${address}: ${response.data.result}`
      );
      return null;
    }

    const sourceCode = response.data.result[0].SourceCode;
    if (!sourceCode || sourceCode.trim() === '') {
      logger.warn(`No Solidity code found for address ${address}`);
      return null;
    }

    // Check if the source code is valid Solidity
    if (isValidSolidityCode(sourceCode)) {
      return sourceCode;
    }

    // If not valid Solidity, try to extract Solidity code from JSON
    logger.info(
      `Source code for ${address} appears to be in JSON format. Attempting to extract Solidity code.`
    );
    const extractedCode = extractSolidityFromJson(sourceCode);
    if (extractedCode) {
      return extractedCode;
    }

    logger.warn(`Could not extract valid Solidity code for address ${address}`);
    return null;
  } catch (error) {
    logger.error(
      `Error fetching Solidity code for address ${address}: ${error.message}`,
      error
    );
    return null;
  }
}

/**
 * Save Solidity code to disk.
 *
 * @param {string} address - The contract address.
 * @param {string|Object} code - The Solidity code (string or object with multiple files).
 * @returns {boolean} - True if saved successfully, else false.
 */
function saveSolidityCode(address, code) {
  // Handle different types of code input
  if (!code) {
    logger.error(`Invalid code content for address ${address}`);
    return false;
  }

  console.log('typeof code:', typeof code);

  // Case 1: Single file as string
  if (typeof code === 'string') {
    // Validate that the code is actually Solidity code
    if (!isValidSolidityCode(code)) {
      logger.error(
        `Content for address ${address} does not appear to be valid Solidity code`
      );
      return false;
    }

    const filePath = path.join(SOLIDITY_DIR, `${address}.sol`);
    try {
      // Write file
      fs.writeFileSync(filePath, code, 'utf8');
      logger.info(
        `Successfully saved valid Solidity code for address ${address}`
      );
      return true;
    } catch (error) {
      logger.error(
        `Error saving Solidity code for address ${address}: ${error.message}`,
        error
      );
      return false;
    }
  }

  // Case 2: Multiple files as object
  if (typeof code === 'object' && code !== null) {
    // Create a directory for the contract
    const contractDir = path.join(SOLIDITY_DIR, address);

    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(contractDir)) {
        fs.mkdirSync(contractDir, { recursive: true });
      }

      // Track if at least one file was successfully saved
      let savedCount = 0;
      const fileCount = Object.keys(code).length;

      // Save each file in the directory
      for (const [fileName, fileContent] of Object.entries(code)) {
        // Skip invalid content
        if (
          !fileContent ||
          typeof fileContent !== 'string' ||
          !isValidSolidityCode(fileContent)
        ) {
          logger.warn(
            `Skipping invalid file ${fileName} for address ${address}`
          );
          continue;
        }

        // Sanitize filename to prevent path traversal
        const safeFileName = path.basename(fileName);
        const filePath = path.join(contractDir, safeFileName);

        try {
          // Write file
          fs.writeFileSync(filePath, fileContent, 'utf8');
          savedCount++;
        } catch (fileError) {
          logger.error(
            `Error saving file ${fileName} for address ${address}: ${fileError.message}`,
            fileError
          );
        }
      }

      // Also save a main file with the contract address as the filename
      // This helps maintain compatibility with existing code that expects a single file
      if (savedCount > 0) {
        // Create a manifest file listing all the extracted files
        const manifestContent =
          `// Solidity code extracted from JSON for address ${address}\n` +
          `// Contains ${savedCount} files:\n` +
          Object.keys(code)
            .map((name) => `// - ${name}`)
            .join('\n');

        const mainFilePath = path.join(SOLIDITY_DIR, `${address}.sol`);
        fs.writeFileSync(mainFilePath, manifestContent, 'utf8');
      }

      logger.info(
        `Saved ${savedCount}/${fileCount} Solidity files for address ${address}`
      );
      return savedCount > 0;
    } catch (error) {
      logger.error(
        `Error saving Solidity files for address ${address}: ${error.message}`,
        error
      );
      return false;
    }
  }

  logger.error(`Unsupported code type for address ${address}: ${typeof code}`);
  return false;
}

/**
 * Enrich tokens with Solidity code by downloading and saving to disk.
 *
 * @param {number} limit - Maximum number of tokens to process
 * @returns {number} - Number of tokens successfully processed
 */
async function enrichTokensWithSolidity(limit = 10) {
  logger.info('[SolidityService] Fetching tokens for Solidity download...');

  // Fetch tokens needing OpenAI analysis (they haven't been analyzed yet)
  const tokens = await TokenModel.findTokensForSourceDownloadAnalysis(limit);

  if (!tokens.length) {
    logger.info('[SolidityService] No tokens to process.');
    return 0;
  }

  logger.info(`[SolidityService] Found ${tokens.length} tokens to process.`);

  let processedCount = 0;

  for (const token of tokens) {
    const { id, baseToken, chain } = token;

    // Ensure we're processing BASE tokens
    if (chain !== 'base') {
      logger.warn(`Token ID ${id} is not on BASE. Skipping.`);
      continue;
    }

    // Exclude tokens marked as NOTSAFE
    if (token.openai === 'NOTSAFE') {
      logger.info(`Skipping token ID ${id} as it is marked NOTSAFE.`);
      continue;
    }

    // Define the path for the Solidity file
    const solidityFilePath = path.join(SOLIDITY_DIR, `${baseToken}.sol`);

    // Check if the file already exists to prevent re-downloading
    if (fs.existsSync(solidityFilePath)) {
      logger.info(
        `Solidity code for token ID ${id} already exists. Skipping download.`
      );
      continue;
    }

    // Fetch Solidity code
    const solidityCode = await fetchSolidityCode(baseToken);

    if (solidityCode) {
      // Save to disk
      const saved = saveSolidityCode(baseToken, solidityCode);
      if (saved) {
        logger.info(
          `Downloaded and saved Solidity code for token ID ${id} (${baseToken}).`
        );
        processedCount++;
      } else {
        logger.warn(
          `Failed to save Solidity code for token ID ${id} (${baseToken}).`
        );
      }
    } else {
      logger.warn(
        `Could not download Solidity code for token ID ${id} (${baseToken}).`
      );
    }

    // Respect rate limits by adding a delay
    await sleep(500); // 0.5 second delay
  }

  logger.info(
    `[SolidityService] Completed Solidity code download. Processed ${processedCount} tokens.`
  );
  return processedCount;
}

module.exports = {
  enrichTokensWithSolidity,
  fetchSolidityCode,
  saveSolidityCode,
  isValidSolidityCode,
  extractSolidityFromJson,
};
