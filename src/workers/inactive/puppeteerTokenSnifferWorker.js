/**
 * Puppeteer Token Sniffer Worker
 *
 * This worker fetches and analyzes token data from DexScreener using Puppeteer.
 * It replaces the ScraperAPI-based implementation with an in-house solution to reduce costs.
 */

require('dotenv').config();
const logger = require('../../utils/logger');
const { createWorker } = require('../../utils/baseWorker');
const {
  enrichTokensWithTokenSniffer,
} = require('../../services/inactive/puppeteerTokenSnifferService');

/**
 * Creates and starts a worker to analyze tokens with Token Sniffer using Puppeteer
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runPuppeteerTokenSnifferWorker(
  limit = parseInt(process.env.MAX_TOKENSNIFFER_TOKENS, 10) || 5
) {
  const intervalMs =
    parseInt(process.env.TOKENSNIFFER_FETCH_INTERVAL_MS, 10) || 900000; // Default: 15 minutes

  // Create the worker with the task to analyze tokens with Token Sniffer
  const worker = createWorker({
    name: 'PuppeteerTokenSnifferWorker',
    task: async () => {
      return await enrichTokensWithTokenSniffer(limit);
    },
    intervalMs,
    retryOptions: {
      maxRetries: parseInt(process.env.PUPPETEER_MAX_RETRIES, 10) || 3,
      initialDelay: parseInt(process.env.PUPPETEER_RETRY_DELAY_MS, 10) || 2000,
    },
    runImmediately: true,
  });

  // Start the worker
  return worker.start();
}

// If this script is run directly, start the worker
if (require.main === module) {
  const TOKENS_LIMIT = parseInt(process.env.MAX_TOKENSNIFFER_TOKENS, 10) || 50;
  runPuppeteerTokenSnifferWorker(TOKENS_LIMIT);
}

module.exports = {
  runPuppeteerTokenSnifferWorker,
};
