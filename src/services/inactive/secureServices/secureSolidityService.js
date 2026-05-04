/**
 * Secure Solidity Service
 *
 * This service handles downloading and saving Solidity code for token contracts with enhanced security.
 * It addresses input validation vulnerabilities, improves error handling, and adds better file system security.
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../../utils/logger');
const TokenModel = require('../../../models/TokenModel');
const { withRetry, sleep } = require('../../../utils/baseWorker');

// API configuration - load from environment variables with validation
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
if (!BASESCAN_API_KEY) {
  logger.warn('BASESCAN_API_KEY is not set in environment variables');
}

const BASE_SCAN_URL =
  process.env.BASE_SCAN_URL || 'https://api.basescan.org/api';

// Directory to save Solidity codes - using environment variable or fallback
const SOLIDITY_DIR = process.env.SOLIDITY_DIR
  ? path.resolve(process.env.SOLIDITY_DIR, 'base')
  : path.resolve(__dirname, '..', '..', '..', 'data', 'solidity_codes', 'base');

// Ensure the directory exists
(async () => {
  try {
    await fs.mkdir(SOLIDITY_DIR, { recursive: true });
    logger.info(`Solidity code directory created at ${SOLIDITY_DIR}`);
  } catch (error) {
    logger.error(`Failed to create Solidity code directory: ${error.message}`);
  }
})();

/**
 * Validate contract address format
 *
 * @param {string} address - The contract address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidContractAddress(address) {
  // Check if address is a valid Ethereum address (0x followed by 40 hex characters)
  return Boolean(
    address &&
      typeof address === 'string' &&
      /^0x[a-fA-F0-9]{40}$/.test(address)
  );
}

/**
 * Validate and sanitize file path to prevent path traversal attacks
 *
 * @param {string} address - The contract address
 * @returns {string|null} - Validated file path or null if invalid
 */
function validateFilePath(address) {
  if (!isValidContractAddress(address)) {
    logger.error(`Invalid contract address format: ${address}`);
    return null;
  }

  // Construct and normalize the path
  const filePath = path.normalize(path.join(SOLIDITY_DIR, `${address}.sol`));

  // Ensure the path is within the SOLIDITY_DIR to prevent directory traversal
  if (!filePath.startsWith(SOLIDITY_DIR)) {
    logger.error(`Path traversal attempt detected: ${filePath}`);
    return null;
  }

  return filePath;
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
 * Fetch Solidity code for a given contract address on BASE with enhanced security.
 *
 * @param {string} address - The contract address
 * @returns {Promise<Object|string|null>} - The Solidity code (string or object with multiple files) or null if not available
 */
async function fetchSolidityCode(address) {
  // Validate address format
  if (!isValidContractAddress(address)) {
    logger.error(`Invalid contract address format: ${address}`);
    return null;
  }

  const params = {
    module: 'contract',
    action: 'getsourcecode',
    address: address,
    apikey: BASESCAN_API_KEY,
  };

  try {
    const response = await withRetry(
      async () => {
        return await axios.get(BASE_SCAN_URL, {
          params,
          timeout: 10000, // 10 second timeout
          headers: {
            'User-Agent': 'TokenMonitor/1.0',
          },
        });
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
      }
    );

    // Validate API response
    if (!response || !response.data) {
      logger.warn(`Empty response from API for address ${address}`);
      return null;
    }

    if (response.data.status !== '1') {
      logger.warn(
        `Failed to fetch Solidity code for address ${address}: ${response.data.result || 'Unknown error'}`
      );
      return null;
    }

    // Validate result structure
    if (
      !response.data.result ||
      !Array.isArray(response.data.result) ||
      response.data.result.length === 0
    ) {
      logger.warn(`Invalid result structure for address ${address}`);
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
 * Save Solidity code to disk with enhanced security.
 *
 * @param {string} address - The contract address
 * @param {string|Object} code - The Solidity code (string or object with multiple files)
 * @returns {Promise<boolean>} - True if saved successfully, else false
 */
async function saveSolidityCode(address, code) {
  // Handle different types of code input
  if (!code) {
    logger.error(`Invalid code content for address ${address}`);
    return false;
  }

  // Case 1: Single file as string
  if (typeof code === 'string') {
    // Validate file path
    const filePath = validateFilePath(address);
    if (!filePath) {
      return false;
    }

    // Validate that the code is actually Solidity code
    if (!isValidSolidityCode(code)) {
      logger.error(
        `Content for address ${address} does not appear to be valid Solidity code`
      );
      return false;
    }

    try {
      // Write file atomically by writing to a temporary file first
      const tempFilePath = `${filePath}.tmp`;
      await fs.writeFile(tempFilePath, code, 'utf8');
      await fs.rename(tempFilePath, filePath);
      logger.info(`Saved single Solidity file for address ${address}`);
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
      await fs.mkdir(contractDir, { recursive: true });

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
          // Write file atomically
          const tempFilePath = `${filePath}.tmp`;
          await fs.writeFile(tempFilePath, fileContent, 'utf8');
          await fs.rename(tempFilePath, filePath);
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

        const mainFilePath = validateFilePath(address);
        if (mainFilePath) {
          const tempMainFilePath = `${mainFilePath}.tmp`;
          await fs.writeFile(tempMainFilePath, manifestContent, 'utf8');
          await fs.rename(tempMainFilePath, mainFilePath);
        }
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
 * Enrich tokens with Solidity code by downloading and saving to disk with enhanced security.
 *
 * @param {number} limit - Maximum number of tokens to process
 * @returns {Promise<number>} - Number of tokens successfully processed
 */
async function enrichTokensWithSolidity(limit = 10) {
  // Log the threshold value being used
  const scoreThreshold = parseFloat(process.env.DOWNLOAD_SCORE_THRESHOLD) || 20;
  logger.info(
    `[SecureSolidityService] Using score threshold: ${scoreThreshold}`
  );
  logger.info(
    '[SecureSolidityService] Fetching tokens for Solidity download...'
  );

  // Fetch tokens needing source code download
  const tokens = await TokenModel.findTokensForSourceDownloadAnalysis(limit);

  if (!tokens.length) {
    logger.info('[SecureSolidityService] No tokens to process.');
    return 0;
  }

  logger.info(
    `[SecureSolidityService] Found ${tokens.length} tokens to process.`
  );

  let processedCount = 0;
  let errorCount = 0;

  for (const token of tokens) {
    const { id, baseToken, chain } = token;

    // Ensure we're processing BASE tokens
    if (chain !== 'base') {
      logger.warn(`Token ID ${id} is not on BASE. Skipping.`);
      continue;
    }

    // Validate baseToken format
    if (!isValidContractAddress(baseToken)) {
      logger.warn(
        `Invalid baseToken format for token ID ${id}: ${baseToken}. Skipping.`
      );
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
    try {
      await fs.access(solidityFilePath);
      logger.info(
        `Solidity code for token ID ${id} already exists. Skipping download.`
      );
      continue;
    } catch (error) {
      // File doesn't exist, continue with download
    }

    // Fetch Solidity code
    const solidityCode = await fetchSolidityCode(baseToken);

    if (solidityCode) {
      // Save to disk
      const saved = await saveSolidityCode(baseToken, solidityCode);
      if (saved) {
        // Update the token's solidityLastCheck timestamp
        await TokenModel.updateSolidityDownloadStatus(id);
        logger.info(
          `Downloaded and saved Solidity code for token ID ${id} (${baseToken}).`
        );
        processedCount++;
      } else {
        logger.warn(
          `Failed to save Solidity code for token ID ${id} (${baseToken}).`
        );
        errorCount++;
      }
    } else {
      logger.warn(
        `Could not download Solidity code for token ID ${id} (${baseToken}).`
      );
      errorCount++;
    }

    // Respect rate limits by adding a delay
    await sleep(500); // 0.5 second delay
  }

  logger.info(
    `[SecureSolidityService] Completed Solidity code download. Processed ${processedCount} tokens, encountered ${errorCount} errors.`
  );
  return processedCount;
}

module.exports = {
  enrichTokensWithSolidity,
  fetchSolidityCode,
  saveSolidityCode,
  extractSolidityFromJson, // Exported for use by other modules
  isValidContractAddress, // Exported for testing
  validateFilePath, // Exported for testing
  isValidSolidityCode, // Exported for testing
};
