/**
 * Mythril Service
 *
 * This service handles analyzing Solidity code using the Mythril tool.
 */

require('dotenv').config();
const path = require('path');
const logger = require('../../utils/logger');
const TokenModel = require('../../models/TokenModel');
const { exec } = require('child_process');
const fs = require('fs');
const { withRetry, sleep } = require('../../utils/baseWorker');

// Directory where Solidity codes are stored
const SOLIDITY_DIR = path.join(__dirname, '..', 'solidity_codes', 'base');

/**
 * Analyze Solidity code using Mythril CLI directly.
 *
 * @param {string} baseToken - The token address to analyze.
 * @returns {Promise<Object[]>} - Array of detected issues.
 */
function analyzeSolidityWithMythril(baseToken) {
  return new Promise((resolve, reject) => {
    // Check if baseToken is a valid Ethereum address
    if (
      !baseToken ||
      typeof baseToken !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(baseToken)
    ) {
      return reject(new Error(`Invalid baseToken format: ${baseToken}`));
    }

    // Define paths for both single file and directory
    const solidityFilePath = path.join(SOLIDITY_DIR, `${baseToken}.sol`);
    const solidityDirPath = path.join(SOLIDITY_DIR, baseToken);

    // Determine which path to use for analysis
    let pathToAnalyze;

    // First check if directory exists and contains Solidity files
    if (
      fs.existsSync(solidityDirPath) &&
      fs.statSync(solidityDirPath).isDirectory()
    ) {
      try {
        // Check if directory contains any .sol files
        const dirContents = fs.readdirSync(solidityDirPath);
        const solFiles = dirContents.filter((file) => file.endsWith('.sol'));

        if (solFiles.length > 0) {
          pathToAnalyze = solidityDirPath;
          logger.info(
            `Using directory with ${solFiles.length} Solidity files for analysis: ${solidityDirPath}`
          );
        }
      } catch (dirError) {
        logger.warn(
          `Error reading directory ${solidityDirPath}: ${dirError.message}`
        );
        // Continue to try the single file
      }
    }

    // If directory doesn't exist or doesn't contain .sol files, use the single file
    if (!pathToAnalyze) {
      if (!fs.existsSync(solidityFilePath)) {
        return reject(
          new Error(`No Solidity code found for token: ${baseToken}`)
        );
      }
      pathToAnalyze = solidityFilePath;
      logger.info(
        `Using single Solidity file for analysis: ${solidityFilePath}`
      );
    }

    // Construct the Mythril CLI command
    const command = `myth analyze -t 4 "${pathToAnalyze}" -o jsonv2 --execution-timeout 60`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Mythril execution error: ${error.message}`);
        logger.error(`Stderr: ${stderr}`);
        return reject(
          new Error(
            `Mythril execution error: ${error.message}\nStderr: ${stderr}`
          )
        );
      }

      if (stderr) {
        logger.warn(`Mythril stderr: ${stderr}`);
      }

      try {
        // Parse the JSON output from Mythril
        const analysis = JSON.parse(stdout);
        const issues = [];
        logger.debug(`Mythril analysis result: ${JSON.stringify(analysis)}`);

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

        resolve(issues);
      } catch (parseError) {
        logger.error(`Failed to parse Mythril output: ${parseError.message}`);
        reject(
          new Error(`Failed to parse Mythril output: ${parseError.message}`)
        );
      }
    });
  });
}

/**
 * Enrich tokens with Mythril analysis.
 *
 * @param {number} limit - Maximum number of tokens to analyze
 * @returns {number} - Number of tokens successfully analyzed
 */
async function enrichTokensWithMythril(limit = 10) {
  logger.info('[MythrilService] Fetching tokens for Mythril analysis...');

  // Fetch tokens needing Mythril analysis
  const tokens = await TokenModel.findTokensForMythrilAnalysis(limit);

  if (!tokens.length) {
    logger.info('[MythrilService] No tokens to analyze.');
    return 0;
  }

  logger.info(`[MythrilService] Found ${tokens.length} tokens to analyze.`);

  let analyzedCount = 0;

  for (const token of tokens) {
    const { id, baseToken } = token;

    // Check if either the single file or directory exists
    const solidityFilePath = path.join(SOLIDITY_DIR, `${baseToken}.sol`);
    const solidityDirPath = path.join(SOLIDITY_DIR, baseToken);

    if (
      !fs.existsSync(solidityFilePath) &&
      !(
        fs.existsSync(solidityDirPath) &&
        fs.statSync(solidityDirPath).isDirectory()
      )
    ) {
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
      continue;
    }

    // Update the token with the analysis result
    try {
      await TokenModel.updateMythrilResult(id, analysisResult);
      logger.info(
        `[MythrilService] Updated token ID ${id} (${baseToken}) with Mythril analysis.`
      );
      analyzedCount++;
    } catch (updateError) {
      logger.error(
        `Failed to update Mythril results for token ID ${id} (${baseToken}): ${updateError.message}`
      );
      continue;
    }

    // Rate limiting
    await sleep(1000); // 1 second delay
  }

  logger.info(
    `[MythrilService] Completed Mythril analysis. Analyzed ${analyzedCount} tokens.`
  );
  return analyzedCount;
}

module.exports = {
  enrichTokensWithMythril,
  analyzeSolidityWithMythril,
};
