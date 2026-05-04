/**
 * Secure Mythril Service
 *
 * This service handles analyzing Solidity code using the Mythril tool with enhanced security.
 * It addresses command injection vulnerabilities, improves input validation, and adds better error handling.
 */

require('dotenv').config();
const path = require('path');
const { promisify } = require('util');
const execFile = promisify(require('child_process').execFile);
const fs = require('fs').promises;
const logger = require('../../../utils/logger');
const TokenModel = require('../../../models/TokenModel');
const { withRetry, sleep } = require('../../../utils/baseWorker');

// Directory where Solidity codes are stored - using environment variable or fallback
const SOLIDITY_DIR = process.env.SOLIDITY_DIR
  ? path.resolve(process.env.SOLIDITY_DIR, 'base')
  : path.resolve(__dirname, '..', '..', '..', 'data', 'solidity_codes', 'base');

/**
 * Validate the Solidity file path to prevent path traversal attacks
 *
 * @param {string} baseToken - The token address
 * @returns {string|null} - Validated file path or null if invalid
 */
function validateSolidityFilePath(baseToken) {
  // Check if baseToken contains only valid characters (alphanumeric and some special chars)
  if (
    !baseToken ||
    typeof baseToken !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(baseToken)
  ) {
    logger.error(`Invalid baseToken format: ${baseToken}`);
    return null;
  }

  // Construct and normalize the path
  const filePath = path.normalize(path.join(SOLIDITY_DIR, `${baseToken}.sol`));

  // Ensure the path is within the SOLIDITY_DIR to prevent directory traversal
  if (!filePath.startsWith(SOLIDITY_DIR)) {
    logger.error(`Path traversal attempt detected: ${filePath}`);
    return null;
  }

  return filePath;
}

/**
 * Analyze Solidity code using Mythril CLI with enhanced security.
 *
 * @param {string} baseToken - The token address to analyze
 * @returns {Promise<Object[]>} - Array of detected issues
 */
async function analyzeSolidityWithMythril(baseToken) {
  // Validate the file path
  const solidityFilePath = validateSolidityFilePath(baseToken);
  if (!solidityFilePath) {
    throw new Error(`Invalid Solidity file path for token: ${baseToken}`);
  }

  // Check if file exists
  try {
    await fs.access(solidityFilePath);
  } catch (error) {
    throw new Error(`Solidity file not found for token: ${baseToken}`);
  }

  try {
    // Use execFile instead of exec for better security
    // Pass arguments as an array to prevent command injection
    const args = [
      'analyze',
      '-t',
      '5', // Increased from 4 to 5 for better coverage
      solidityFilePath,
      '-o',
      'jsonv2',
      '--execution-timeout',
      '90', // Increased from 60 to 90 seconds for complex contracts
      '--max-depth',
      '10', // Added depth limit to prevent excessive analysis time
      '--solv',
      process.env.MYTHRIL_SOLC_VERSION || '0.8.0', // Added solc version specification
    ];

    // Execute mythril with arguments as separate array elements
    const { stdout, stderr } = await execFile('myth', args);

    if (stderr) {
      logger.warn(`Mythril stderr: ${stderr}`);
    }

    // Parse the JSON output from Mythril
    const analysis = JSON.parse(stdout);
    const issues = [];

    // Extract relevant issue details
    if (analysis && analysis.issues) {
      analysis.issues.forEach((issue) => {
        issues.push({
          description: issue.description,
          severity: issue.severity,
          contract: issue.contract,
          function: issue.function,
          line: issue.line,
          column: issue.column,
          detector: issue.detector,
        });
      });
    }

    return issues;
  } catch (error) {
    logger.error(`Mythril analysis failed: ${error.message}`);
    throw new Error(`Mythril analysis failed: ${error.message}`);
  }
}

/**
 * Enrich tokens with Mythril analysis with enhanced security.
 *
 * @param {number} limit - Maximum number of tokens to analyze
 * @returns {Promise<number>} - Number of tokens successfully analyzed
 */
async function enrichTokensWithMythril(limit = 10) {
  // Log the threshold value being used
  const scoreThreshold = parseFloat(process.env.MYTHRIL_SCORE_THRESHOLD) || 20;
  logger.info(
    `[SecureMythrilService] Using score threshold: ${scoreThreshold}`
  );
  logger.info('[SecureMythrilService] Fetching tokens for Mythril analysis...');

  // Fetch tokens needing Mythril analysis
  const tokens = await TokenModel.findTokensForMythrilAnalysis(limit);

  if (!tokens.length) {
    logger.info('[SecureMythrilService] No tokens to analyze.');
    return 0;
  }

  logger.info(
    `[SecureMythrilService] Found ${tokens.length} tokens to analyze.`
  );

  let analyzedCount = 0;
  let errorCount = 0;

  for (const token of tokens) {
    const { id, baseToken } = token;

    // Skip if baseToken is invalid
    if (
      !baseToken ||
      typeof baseToken !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(baseToken)
    ) {
      logger.warn(
        `Invalid baseToken format for token ID ${id}: ${baseToken}. Skipping.`
      );
      continue;
    }

    // Define the path to the Solidity file
    const solidityFilePath = path.join(SOLIDITY_DIR, `${baseToken}.sol`);

    // Check if the Solidity code exists on disk
    try {
      await fs.access(solidityFilePath);
    } catch (error) {
      logger.warn(
        `Solidity code for token ID ${id} (${baseToken}) not found on disk. Skipping.`
      );
      continue;
    }

    // Analyze the Solidity code using Mythril with retry
    let analysisResult;
    try {
      analysisResult = await withRetry(
        async () => analyzeSolidityWithMythril(baseToken),
        {
          maxRetries: 2,
          initialDelay: 2000,
        }
      );
    } catch (error) {
      logger.error(
        `Mythril analysis failed for token ID ${id} (${baseToken}): ${error.message}`
      );
      errorCount++;
      continue;
    }

    // Update the token with the analysis result
    try {
      await TokenModel.updateMythrilResult(id, analysisResult);
      logger.info(
        `[SecureMythrilService] Updated token ID ${id} (${baseToken}) with Mythril analysis.`
      );
      analyzedCount++;
    } catch (updateError) {
      logger.error(
        `Failed to update Mythril results for token ID ${id} (${baseToken}): ${updateError.message}`
      );
      errorCount++;
      continue;
    }

    // Rate limiting
    await sleep(1000); // 1 second delay
  }

  logger.info(
    `[SecureMythrilService] Completed Mythril analysis. Analyzed ${analyzedCount} tokens, encountered ${errorCount} errors.`
  );
  return analyzedCount;
}

module.exports = {
  enrichTokensWithMythril,
  analyzeSolidityWithMythril,
  validateSolidityFilePath, // Exported for testing
};
