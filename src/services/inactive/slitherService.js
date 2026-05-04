/**
 * Slither Service
 *
 * This service handles analyzing Solidity code using the Slither tool.
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
 * Analyze Solidity code using Slither CLI directly.
 *
 * @param {string} baseToken - The token address to analyze.
 * @returns {Promise<{analysis: Object, humanSummary: string}>} - JSON analysis and human-readable summary.
 */
function analyzeSolidityWithSlither(baseToken) {
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

    const outputFileName = `slither_output_${Date.now()}.json`;
    const jsonOutputPath = path.join(
      path.dirname(solidityFilePath),
      outputFileName
    );

    const solcPath = '/usr/local/bin/solc'; // Update this if needed
    const command = `slither "${pathToAnalyze}" --solc-disable-warnings --exclude naming-convention,unused-state --exclude-low --json "${jsonOutputPath}" --print human-summary`;

    const env = Object.assign({}, process.env);
    const solcDir = path.dirname(solcPath);
    env.PATH = `${solcDir}:${env.PATH}`;

    exec(command, { env }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Slither execution error: ${error.message}`);
        logger.error(`Stderr: ${stderr}`);
        return reject(
          new Error(
            `Slither execution error: ${error.message}\nStderr: ${stderr}`
          )
        );
      }

      if (stderr) {
        logger.warn(`Slither stderr: ${stderr}`);
      }

      try {
        const rawData = fs.existsSync(jsonOutputPath)
          ? fs.readFileSync(jsonOutputPath, 'utf8')
          : null;
        const analysis = rawData ? JSON.parse(rawData) : null;

        const humanSummary = stdout; // Human-readable summary from stdout

        // Clean up the JSON output file to prevent clutter
        if (fs.existsSync(jsonOutputPath)) {
          fs.unlinkSync(jsonOutputPath);
        }

        resolve({ analysis, humanSummary });
      } catch (parseError) {
        logger.error(`Failed to parse Slither output: ${parseError.message}`);
        return reject(
          new Error(`Failed to parse Slither output: ${parseError.message}`)
        );
      }
    });
  });
}

/**
 * Enrich tokens with Slither analysis.
 *
 * @param {number} limit - Maximum number of tokens to analyze
 * @returns {number} - Number of tokens successfully analyzed
 */
async function enrichTokensWithSlither(limit = 10) {
  logger.info('[SlitherService] Fetching tokens for Slither analysis...');

  const tokens = await TokenModel.findTokensForSlitherAnalysis(limit);

  if (!tokens.length) {
    logger.info('[SlitherService] No tokens to analyze.');
    return 0;
  }

  logger.info(`[SlitherService] Found ${tokens.length} tokens to analyze.`);

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

    try {
      // Use withRetry for the analysis to handle potential failures
      const { analysis, humanSummary } = await withRetry(
        async () => analyzeSolidityWithSlither(baseToken),
        {
          maxRetries: 2,
          initialDelay: 2000,
        }
      );

      logger.info(
        `Slither human summary for token ID ${id} (${baseToken}): ${humanSummary}`
      );

      const formattedAnalysis = analysis ? JSON.stringify(analysis) : null;

      await TokenModel.updateSlitherResultWithSummary(id, formattedAnalysis);

      logger.info(
        `[SlitherService] Updated token ID ${id} (${baseToken}) with Slither analysis and human summary.`
      );

      analyzedCount++;
    } catch (error) {
      logger.error(
        `Failed to analyze or update token ID ${id} (${baseToken}): ${error.message}`
      );
    }

    // Rate limiting
    await sleep(1000); // 1 second delay
  }

  logger.info(
    `[SlitherService] Completed Slither analysis. Analyzed ${analyzedCount} tokens.`
  );
  return analyzedCount;
}

module.exports = {
  enrichTokensWithSlither,
  analyzeSolidityWithSlither,
};
