/**
 * Secure Slither Service
 *
 * This service handles analyzing Solidity code using the Slither tool with enhanced security.
 * It addresses command injection vulnerabilities, improves input validation, and adds better error handling.
 */

require('dotenv').config();
const path = require('path');
const { promisify } = require('util');
const execFile = promisify(require('child_process').execFile);
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../../../utils/logger');
const TokenModel = require('../../../models/TokenModel');
const { withRetry, sleep } = require('../../../utils/baseWorker');

// Directory where Solidity codes are stored - using environment variable or fallback
const SOLIDITY_DIR = process.env.SOLIDITY_DIR
  ? path.resolve(process.env.SOLIDITY_DIR, 'base')
  : path.resolve(__dirname, '..', '..', '..', 'data', 'solidity_codes', 'base');
// Directory for temporary output files
const TEMP_DIR = process.env.TEMP_DIR
  ? path.resolve(process.env.TEMP_DIR)
  : path.resolve(__dirname, '..', '..', '..', 'data', 'temp');

// Ensure directories exist
(async () => {
  try {
    await fs.mkdir(SOLIDITY_DIR, { recursive: true });
    logger.info(`Solidity directory created at ${SOLIDITY_DIR}`);

    await fs.mkdir(TEMP_DIR, { recursive: true });
    logger.info(`Temporary directory created at ${TEMP_DIR}`);
  } catch (error) {
    logger.error(`Failed to create directories: ${error.message}`);
  }
})();

/**
 * Validate the Solidity file path to prevent path traversal attacks
 *
 * @param {string} baseToken - The token address
 * @returns {Object} - Object with validated paths or null properties if invalid
 */
function validateSolidityFilePath(baseToken) {
  // Check if baseToken is a valid Ethereum address (0x followed by 40 hex characters)
  if (
    !baseToken ||
    typeof baseToken !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(baseToken)
  ) {
    logger.error(`Invalid baseToken format: ${baseToken}`);
    return { filePath: null, dirPath: null };
  }

  // Construct and normalize the paths
  const filePath = path.normalize(path.join(SOLIDITY_DIR, `${baseToken}.sol`));
  const dirPath = path.normalize(path.join(SOLIDITY_DIR, baseToken));

  // Ensure the paths are within the SOLIDITY_DIR to prevent directory traversal
  if (!filePath.startsWith(SOLIDITY_DIR)) {
    logger.error(`Path traversal attempt detected for file: ${filePath}`);
    return { filePath: null, dirPath: null };
  }

  if (!dirPath.startsWith(SOLIDITY_DIR)) {
    logger.error(`Path traversal attempt detected for directory: ${dirPath}`);
    return { filePath: null, dirPath: null };
  }

  return { filePath, dirPath };
}

/**
 * Validate if a file contains valid Solidity code and extract the pragma version
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<{isValid: boolean, version: string|null}>} - Validation result and pragma version
 */
async function isValidSolidityFile(filePath) {
  try {
    // Read the file content
    const fileContent = await fs.readFile(filePath, 'utf8');

    // Check if the file starts with JSON markers
    if (
      fileContent.trim().startsWith('{') ||
      fileContent.trim().startsWith('[')
    ) {
      // Try to parse as JSON to confirm
      try {
        const jsonContent = JSON.parse(fileContent);
        logger.info(
          `File ${filePath} appears to be JSON, checking for embedded Solidity code...`
        );

        // Check if this is a standard compiler input JSON format with sources
        if (jsonContent.sources) {
          logger.info(
            `JSON contains 'sources' field, likely contains Solidity code`
          );

          // Find the first source file with content
          for (const sourcePath in jsonContent.sources) {
            if (jsonContent.sources[sourcePath].content) {
              const content = jsonContent.sources[sourcePath].content;

              // Check for Solidity patterns in the embedded content
              const hasPragma = content.includes('pragma solidity');
              const hasContract =
                content.includes('contract ') ||
                content.includes('library ') ||
                content.includes('interface ');
              const hasSpdx = content.includes('SPDX-License-Identifier:');

              if (hasPragma || hasContract || hasSpdx) {
                // Extract version from the embedded content
                let version = null;
                if (hasPragma) {
                  const pragmaMatch = content.match(
                    /pragma\s+solidity\s+([^;]+);/
                  );
                  if (pragmaMatch && pragmaMatch[1]) {
                    version = pragmaMatch[1].trim();
                    // If version has a range or comparison operators, extract just the version number
                    if (version.includes(' ')) {
                      const versionParts = version.split(' ');
                      version = versionParts[versionParts.length - 1];
                    }
                    // Remove any caret or tilde
                    version = version.replace(/[\^~]/g, '');
                    logger.info(
                      `Detected Solidity version: ${version} in embedded code in ${filePath}`
                    );
                  }
                }

                // We found valid Solidity code in the JSON
                return {
                  isValid: true,
                  version,
                  isJson: true,
                };
              }
            }
          }
        }

        logger.warn(
          `File ${filePath} is JSON but doesn't contain valid Solidity code`
        );
        return { isValid: false, version: null };
      } catch (e) {
        // Not valid JSON, might still be Solidity with a brace at the start
        logger.info(
          `File ${filePath} starts with JSON markers but is not valid JSON, continuing with Solidity validation`
        );
      }
    }

    // Check for common Solidity patterns
    const hasPragma = fileContent.includes('pragma solidity');
    const hasContract =
      fileContent.includes('contract ') ||
      fileContent.includes('library ') ||
      fileContent.includes('interface ');
    const hasSpdx = fileContent.includes('SPDX-License-Identifier:');

    // Extract Solidity version from pragma directive
    let version = null;
    if (hasPragma) {
      const pragmaMatch = fileContent.match(/pragma\s+solidity\s+([^;]+);/);
      if (pragmaMatch && pragmaMatch[1]) {
        version = pragmaMatch[1].trim();
        // If version has a range or comparison operators, extract just the version number
        if (version.includes(' ')) {
          const versionParts = version.split(' ');
          version = versionParts[versionParts.length - 1];
        }
        // Remove any caret or tilde
        version = version.replace(/[\^~]/g, '');
        logger.info(
          `Detected Solidity version: ${version} in file ${filePath}`
        );
      }
    }

    // If it has at least one of these patterns, it's likely Solidity
    return {
      isValid: hasPragma || hasContract || hasSpdx,
      version,
    };
  } catch (error) {
    logger.error(
      `Error validating Solidity file ${filePath}: ${error.message}`
    );
    return { isValid: false, version: null };
  }
}

/**
 * Generate a secure random filename for temporary output
 *
 * @returns {string} - Random filename
 */
function generateSecureFilename() {
  return `slither_output_${crypto.randomBytes(16).toString('hex')}.json`;
}

/**
 * Extract Solidity code from JSON file and save to a temporary file for analysis
 *
 * @param {string} jsonFilePath - Path to the JSON file
 * @returns {Promise<{tempFilePath: string, version: string|null}>} - Path to the temporary file and Solidity version
 */
async function extractSolidityFromJsonFile(jsonFilePath) {
  try {
    // Read the JSON file
    const fileContent = await fs.readFile(jsonFilePath, 'utf8');

    try {
      // Parse the JSON
      const jsonContent = JSON.parse(fileContent);

      // Check if this is a standard compiler input JSON format with sources
      if (jsonContent.sources) {
        // Create a temporary directory for extracted files
        const tempDirName = `slither_temp_${crypto.randomBytes(8).toString('hex')}`;
        const tempDir = path.join(TEMP_DIR, tempDirName);
        await fs.mkdir(tempDir, { recursive: true });

        logger.info(
          `Created temporary directory for extracted Solidity files: ${tempDir}`
        );

        // Track the first valid Solidity file and its version
        let firstSolidityFile = null;
        let version = null;

        // Extract each source file
        for (const sourcePath in jsonContent.sources) {
          if (jsonContent.sources[sourcePath].content) {
            const content = jsonContent.sources[sourcePath].content;

            // Check if it's valid Solidity code
            const hasPragma = content.includes('pragma solidity');
            const hasContract =
              content.includes('contract ') ||
              content.includes('library ') ||
              content.includes('interface ');
            const hasSpdx = content.includes('SPDX-License-Identifier:');

            if (hasPragma || hasContract || hasSpdx) {
              // Extract version if available
              if (hasPragma && !version) {
                const pragmaMatch = content.match(
                  /pragma\s+solidity\s+([^;]+);/
                );
                if (pragmaMatch && pragmaMatch[1]) {
                  version = pragmaMatch[1].trim();
                  // If version has a range or comparison operators, extract just the version number
                  if (version.includes(' ')) {
                    const versionParts = version.split(' ');
                    version = versionParts[versionParts.length - 1];
                  }
                  // Remove any caret or tilde
                  version = version.replace(/[\^~]/g, '');
                }
              }

              // Use the filename from the path, or a default name if not available
              const fileName =
                sourcePath.split('/').pop() ||
                `Contract_${Object.keys(jsonContent.sources).indexOf(sourcePath)}.sol`;
              const filePath = path.join(tempDir, fileName);

              // Save the file
              await fs.writeFile(filePath, content, 'utf8');
              logger.info(`Extracted Solidity file: ${fileName}`);

              // Track the first file for return
              if (!firstSolidityFile) {
                firstSolidityFile = filePath;
              }
            }
          }
        }

        if (firstSolidityFile) {
          return { tempFilePath: tempDir, version, isDirectory: true };
        }
      }

      logger.warn(
        `JSON file ${jsonFilePath} doesn't contain valid Solidity code`
      );
      return { tempFilePath: null, version: null };
    } catch (parseError) {
      logger.error(
        `Failed to parse JSON file ${jsonFilePath}: ${parseError.message}`
      );
      return { tempFilePath: null, version: null };
    }
  } catch (error) {
    logger.error(
      `Error extracting Solidity from JSON file ${jsonFilePath}: ${error.message}`
    );
    return { tempFilePath: null, version: null };
  }
}

/**
 * Analyze Solidity code using Slither CLI with enhanced security.
 *
 * @param {string} baseToken - The token address to analyze
 * @returns {Promise<{analysis: Object, humanSummary: string}>} - JSON analysis and human-readable summary
 */
async function analyzeSolidityWithSlither(baseToken) {
  // Validate the file paths
  const { filePath: solidityFilePath, dirPath: solidityDirPath } =
    validateSolidityFilePath(baseToken);
  if (!solidityFilePath && !solidityDirPath) {
    throw new Error(`Invalid Solidity file path for token: ${baseToken}`);
  }

  // Determine which path to use for analysis
  let pathToAnalyze = null;
  let isDirectory = false;
  let version = null;
  let tempPath = null; // Track temporary path for cleanup

  // First check if directory exists and contains Solidity files
  try {
    await fs.access(solidityDirPath);

    // Check if directory contains any .sol files
    const dirContents = await fs.readdir(solidityDirPath);
    const solFiles = dirContents.filter((file) => file.endsWith('.sol'));

    if (solFiles.length > 0) {
      pathToAnalyze = solidityDirPath;
      isDirectory = true;

      // Try to extract version from the first .sol file
      const firstSolFile = path.join(solidityDirPath, solFiles[0]);
      const fileValidation = await isValidSolidityFile(firstSolFile);
      version = fileValidation.version;

      logger.info(
        `Using directory with ${solFiles.length} Solidity files for analysis: ${solidityDirPath}`
      );
    }
  } catch (dirError) {
    // Directory doesn't exist or can't be accessed, try the single file
  }

  // If directory doesn't exist or doesn't contain .sol files, try the single file
  if (!pathToAnalyze) {
    try {
      await fs.access(solidityFilePath);

      // Validate that the file contains valid Solidity code and extract version
      const fileValidation = await isValidSolidityFile(solidityFilePath);

      if (fileValidation.isValid) {
        // Check if it's JSON-formatted Solidity code
        if (fileValidation.isJson) {
          logger.info(
            `File ${solidityFilePath} contains JSON-formatted Solidity code. Extracting...`
          );

          // Extract Solidity code from JSON and save to temporary file
          const extractResult =
            await extractSolidityFromJsonFile(solidityFilePath);

          if (extractResult.tempFilePath) {
            pathToAnalyze = extractResult.tempFilePath;
            version = extractResult.version;
            isDirectory = extractResult.isDirectory;
            tempPath = extractResult.tempFilePath; // Track for cleanup

            logger.info(
              `Using extracted Solidity code for analysis: ${pathToAnalyze}`
            );
          } else {
            throw new Error(
              `Failed to extract Solidity code from JSON file for token ${baseToken}`
            );
          }
        } else {
          // Regular Solidity file
          pathToAnalyze = solidityFilePath;
          version = fileValidation.version;
          logger.info(
            `Using single Solidity file for analysis: ${solidityFilePath}`
          );
        }
      } else {
        throw new Error(
          `File for token ${baseToken} does not appear to be valid Solidity code`
        );
      }
    } catch (fileError) {
      throw new Error(
        `No valid Solidity code found for token: ${baseToken} - ${fileError.message}`
      );
    }
  }

  // Generate a secure random filename for the output
  const outputFileName = generateSecureFilename();
  const jsonOutputPath = path.join(TEMP_DIR, outputFileName);

  try {
    // Use execFile instead of exec for better security
    // Pass arguments as an array to prevent command injection
    const args = [
      pathToAnalyze,
      '--solc-disable-warnings',
      '--exclude',
      'naming-convention,unused-state',
      '--exclude-low',
      '--json',
      jsonOutputPath,
      '--print',
      'human-summary',
    ];

    // If a specific Solidity version is detected, add the solc-solcs-select option
    if (version) {
      logger.info(`Using Solidity version ${version} for analysis`);
      args.push('--solc-solcs-select');
      args.push(version);
    }

    // Set environment variables securely
    const env = { ...process.env };
    const solcPath = '/usr/local/bin/solc'; // Update this if needed
    const solcDir = path.dirname(solcPath);
    env.PATH = `${solcDir}:${env.PATH}`;

    // Execute slither with arguments as separate array elements
    const { stdout, stderr } = await execFile('slither', args, { env });

    if (stderr) {
      logger.warn(`Slither stderr: ${stderr}`);
    }

    // Read and parse the output file
    let analysis = null;
    try {
      const rawData = await fs.readFile(jsonOutputPath, 'utf8');
      analysis = JSON.parse(rawData);
    } catch (readError) {
      logger.error(`Failed to read Slither output file: ${readError.message}`);
      // Continue with null analysis, we still have the human summary
    }

    // Human-readable summary from stdout
    const humanSummary = stdout;

    // Clean up the JSON output file
    try {
      await fs.unlink(jsonOutputPath);
    } catch (unlinkError) {
      logger.warn(
        `Failed to delete temporary file ${jsonOutputPath}: ${unlinkError.message}`
      );
      // Non-critical error, continue
    }

    // Clean up temporary extracted files if any
    if (tempPath) {
      try {
        if (isDirectory) {
          // Remove all files in the directory
          const files = await fs.readdir(tempPath);
          for (const file of files) {
            await fs.unlink(path.join(tempPath, file));
          }
          // Remove the directory
          await fs.rmdir(tempPath);
        } else {
          await fs.unlink(tempPath);
        }
        logger.info(`Cleaned up temporary files at ${tempPath}`);
      } catch (cleanupError) {
        logger.warn(
          `Failed to clean up temporary files at ${tempPath}: ${cleanupError.message}`
        );
        // Non-critical error, continue
      }
    }

    return { analysis, humanSummary };
  } catch (error) {
    // Clean up the JSON output file in case of error
    try {
      await fs.access(jsonOutputPath);
      await fs.unlink(jsonOutputPath);
    } catch (unlinkError) {
      // File might not exist, ignore
    }

    // Clean up temporary extracted files if any
    if (tempPath) {
      try {
        if (isDirectory) {
          // Remove all files in the directory
          const files = await fs.readdir(tempPath);
          for (const file of files) {
            await fs.unlink(path.join(tempPath, file));
          }
          // Remove the directory
          await fs.rmdir(tempPath);
        } else {
          await fs.unlink(tempPath);
        }
      } catch (cleanupError) {
        // Non-critical error, ignore
      }
    }

    logger.error(`Slither analysis failed: ${error.message}`);
    throw new Error(`Slither analysis failed: ${error.message}`);
  }
}

/**
 * Enrich tokens with Slither analysis with enhanced security.
 *
 * @param {number} limit - Maximum number of tokens to analyze
 * @returns {Promise<number>} - Number of tokens successfully analyzed
 */
async function enrichTokensWithSlither(limit = 10) {
  // Log the threshold value being used
  const scoreThreshold = parseFloat(process.env.SLITHER_SCORE_THRESHOLD) || 20;
  logger.info(
    `[SecureSlitherService] Using score threshold: ${scoreThreshold}`
  );
  logger.info('[SecureSlitherService] Fetching tokens for Slither analysis...');

  // Fetch tokens needing Slither analysis
  const tokens = await TokenModel.findTokensForSlitherAnalysis(limit);

  if (!tokens.length) {
    logger.info('[SecureSlitherService] No tokens to analyze.');
    return 0;
  }

  logger.info(
    `[SecureSlitherService] Found ${tokens.length} tokens to analyze.`
  );

  let analyzedCount = 0;
  let errorCount = 0;

  for (const token of tokens) {
    const { id, baseToken } = token;

    // Skip if baseToken is invalid
    if (
      !baseToken ||
      typeof baseToken !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(baseToken)
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

    // Analyze the Solidity code using Slither with retry
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
        `[SecureSlitherService] Updated token ID ${id} (${baseToken}) with Slither analysis and human summary.`
      );

      analyzedCount++;
    } catch (error) {
      logger.error(
        `Failed to analyze or update token ID ${id} (${baseToken}): ${error.message}`
      );
      errorCount++;
    }

    // Rate limiting
    await sleep(1000); // 1 second delay
  }

  logger.info(
    `[SecureSlitherService] Completed Slither analysis. Analyzed ${analyzedCount} tokens, encountered ${errorCount} errors.`
  );
  return analyzedCount;
}

module.exports = {
  enrichTokensWithSlither,
  analyzeSolidityWithSlither,
  validateSolidityFilePath, // Exported for testing
  isValidSolidityFile, // Exported for testing
};
