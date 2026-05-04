// workers/solidityDownloader.js

require('dotenv').config();
const logger = require('../../utils/logger');
const { createWorker } = require('../../utils/baseWorker');
const {
  enrichTokensWithSolidity,
} = require('../../services/inactive/solidityService');

/**
 * Creates and starts a worker to download and save Solidity code for tokens
 * @param {number} limit - Maximum number of tokens to process per run
 * @returns {Object} - Worker control object with stop method
 */
function runSolidityDownloaderWorker(limit = 10) {
  const intervalMs =
    parseInt(process.env.SOLIDITY_DOWNLOAD_INTERVAL_MS, 10) || 3600000; // Default: 1 hour

  // Create the worker with the task to enrich tokens with Solidity code
  const worker = createWorker({
    name: 'SolidityDownloaderWorker',
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
  runSolidityDownloaderWorker(TOKENS_LIMIT);
}

module.exports = {
  runSolidityDownloaderWorker,
};
