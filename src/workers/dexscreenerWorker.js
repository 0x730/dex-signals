require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const {
  updateLiquidityForWatchedTokens,
} = require('../services/dexscreenerService');

/**
 * Creates and starts a worker to update liquidity data from DexScreener
 * @param {number} skipIntervalMinutes - Minutes to skip between updates
 * @returns {Object} - Worker control object with stop method
 */
function runDexScreenerWorker(skipIntervalMinutes) {
  const intervalMs =
    parseInt(process.env.DEXSCREENER_FETCH_INTERVAL_MS, 10) || 300000; // Default: 5 minutes
  const skipInterval =
    skipIntervalMinutes ||
    parseInt(process.env.SCORE_SKIP_INTERVAL_MINUTES, 10) ||
    60; // Default to 1 hour

  // Create the worker with the task to update liquidity data
  const worker = createWorker({
    name: 'DexScreenerWorker',
    task: async () => {
      return await updateLiquidityForWatchedTokens(skipInterval);
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

if (require.main === module) {
  runDexScreenerWorker();
}

module.exports = {
  runDexScreenerWorker,
};
