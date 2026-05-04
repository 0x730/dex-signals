/**
 * Secure Slither Analyzer Worker
 *
 * This worker handles analyzing Solidity code using the Slither tool with enhanced security.
 * It uses the secure Slither service to prevent command injection and other security vulnerabilities.
 */

require('dotenv').config();
const logger = require('../../../utils/logger');
const { createWorker } = require('../../../utils/baseWorker');
const {
  enrichTokensWithSlither,
} = require('../../../services/inactive/secureServices/secureSlitherService');

/**
 * Creates and starts a worker to analyze tokens with Slither securely
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runSecureSlitherAnalyzerWorker(
  limit = parseInt(process.env.SLITHER_TOKENS_LIMIT, 10) || 10
) {
  const intervalMs = parseInt(process.env.SLITHER_INTERVAL_MS, 10) || 3600000; // Default: 1 hour

  // Create the worker with the task to analyze tokens with Slither
  const worker = createWorker({
    name: 'SecureSlitherAnalyzerWorker',
    task: async () => {
      return await enrichTokensWithSlither(limit);
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
  const TOKENS_LIMIT = parseInt(process.env.SLITHER_TOKENS_LIMIT, 10) || 10;
  runSecureSlitherAnalyzerWorker(TOKENS_LIMIT);
}

module.exports = {
  runSecureSlitherAnalyzerWorker,
};
