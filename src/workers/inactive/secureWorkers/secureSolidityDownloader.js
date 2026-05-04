/**
 * Secure Solidity Downloader Worker
 *
 * This worker handles downloading and saving Solidity code for token contracts with enhanced security.
 * It uses the secure Solidity service to prevent path traversal and other security vulnerabilities.
 */

require('dotenv').config();
const logger = require('../../../utils/logger');
const { createWorker } = require('../../../utils/baseWorker');
const {
  enrichTokensWithSolidity,
} = require('../../../services/inactive/secureServices/secureSolidityService');

/**
 * Creates and starts a worker to download and save Solidity code for tokens securely
 * @param {number} limit - Maximum number of tokens to process per run
 * @returns {Object} - Worker control object with stop method
 */
function runSecureSolidityDownloaderWorker(
  limit = parseInt(process.env.SOLIDITY_TOKENS_LIMIT, 10) || 10
) {
  const intervalMs =
    parseInt(process.env.SOLIDITY_DOWNLOAD_INTERVAL_MS, 10) || 3600000; // Default: 1 hour

  // Create the worker with the task to enrich tokens with Solidity code
  const worker = createWorker({
    name: 'SecureSolidityDownloaderWorker',
    task: async () => {
      return await enrichTokensWithSolidity(limit);
    },
    intervalMs,
    retryOptions: {
      maxRetries: 3,
      initialDelay: 5000,
    },
    runImmediately: true,
  });

  // Start the worker
  return worker.start();
}

// If this script is run directly, start the worker
if (require.main === module) {
  const TOKENS_LIMIT = parseInt(process.env.SOLIDITY_TOKENS_LIMIT, 10) || 10;
  runSecureSolidityDownloaderWorker(TOKENS_LIMIT);
}

module.exports = {
  runSecureSolidityDownloaderWorker,
};
