// workers/cleanupWorker.js

require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const {
  cleanupOldInactiveTokens,
  cleanupOldDexscreenerHistoricalData,
} = require('../services/cleanupService');

/**
 * Creates and starts a worker to clean up old and inactive tokens
 * @returns {Object} - Worker control object with stop method
 */
function runCleanupWorker() {
  const intervalMs =
    parseInt(process.env.CLEANUP_WORKER_INTERVAL_MS, 10) || 3600000; // Default: 1 hour

  // Create the worker with the task to clean up old inactive tokens and historical data
  const worker = createWorker({
    name: 'CleanupWorker',
    task: async () => {
      // Clean up old inactive tokens
      const tokensDeleted = await cleanupOldInactiveTokens();

      // Clean up old historical data
      const historicalDataDeleted = await cleanupOldDexscreenerHistoricalData();

      return {
        tokensDeleted,
        historicalDataDeleted,
      };
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
  runCleanupWorker();
}

module.exports = {
  runCleanupWorker,
};
