/**
 * Token Sniffer Worker
 *
 * This worker fetches and analyzes token data from DexScreener using ScraperAPI.
 */

require('dotenv').config();
const logger = require('../../utils/logger');
const { createWorker } = require('../../utils/baseWorker');
const {
  enrichTokensWithTokenSniffer,
} = require('../../services/inactive/tokenSnifferService');

/**
 * Creates and starts a worker to analyze tokens with Token Sniffer
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runTokenSnifferWorker(limit = 50) {
  const intervalMs =
    parseInt(process.env.TOKENSNIFFER_FETCH_INTERVAL_MS, 10) || 900000; // Default: 15 minutes

  // Create the worker with the task to analyze tokens with Token Sniffer
  const worker = createWorker({
    name: 'TokenSnifferWorker',
    task: async () => {
      return await enrichTokensWithTokenSniffer(limit);
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
  const TOKENS_LIMIT = parseInt(process.env.MAX_TOKENSNIFFER_TOKENS, 10) || 50;
  runTokenSnifferWorker(TOKENS_LIMIT);
}

module.exports = {
  runTokenSnifferWorker,
};
