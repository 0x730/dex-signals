require('dotenv').config();
const logger = require('../../utils/logger');
const { createWorker } = require('../../utils/baseWorker');
const {
  enrichTokensWithSlither,
} = require('../../services/inactive/slitherService');

/**
 * Creates and starts a worker to analyze tokens with Slither
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runSlitherAnalyzerWorker(limit = 10) {
  const intervalMs = parseInt(process.env.SLITHER_INTERVAL_MS, 10) || 3600000; // Default: 1 hour

  // Create the worker with the task to analyze tokens with Slither
  const worker = createWorker({
    name: 'SlitherAnalyzerWorker',
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
  runSlitherAnalyzerWorker(TOKENS_LIMIT);
}

module.exports = {
  runSlitherAnalyzerWorker,
};
