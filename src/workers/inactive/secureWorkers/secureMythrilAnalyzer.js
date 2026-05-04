/**
 * Secure Mythril Analyzer Worker
 *
 * This worker handles analyzing Solidity code using the Mythril tool with enhanced security.
 * It uses the secure Mythril service to prevent command injection and other security vulnerabilities.
 */

require('dotenv').config();
const logger = require('../../../utils/logger');
const { createWorker } = require('../../../utils/baseWorker');
const {
  enrichTokensWithMythril,
} = require('../../../services/inactive/secureServices/secureMythrilService');

/**
 * Creates and starts a worker to analyze tokens with Mythril securely
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runSecureMythrilAnalyzerWorker(
  limit = parseInt(process.env.MYTHRIL_TOKENS_LIMIT, 10) || 10
) {
  const intervalMs = parseInt(process.env.MYTHRIL_INTERVAL_MS, 10) || 3600000; // Default: 1 hour

  // Create the worker with the task to analyze tokens with Mythril
  const worker = createWorker({
    name: 'SecureMythrilAnalyzerWorker',
    task: async () => {
      return await enrichTokensWithMythril(limit);
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
  const TOKENS_LIMIT = parseInt(process.env.MYTHRIL_TOKENS_LIMIT, 10) || 10;
  runSecureMythrilAnalyzerWorker(TOKENS_LIMIT);
}

module.exports = {
  runSecureMythrilAnalyzerWorker,
};
