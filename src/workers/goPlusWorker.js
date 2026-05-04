require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const { updateTokensWithGoPlusData } = require('../services/goPlusService');

/**
 * Creates and starts a worker to analyze tokens with GoPlus
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runGoPlusWorker(
  limit = parseInt(process.env.MAX_GOPLUS_TOKENS, 10) || 20
) {
  const intervalMs =
    parseInt(process.env.GOPLUS_FETCH_INTERVAL_MS, 10) || 900000; // Default: 15 minutes

  // Create the worker with the task to analyze tokens with GoPlus
  const worker = createWorker({
    name: 'GoPlusWorker',
    task: async () => {
      return await updateTokensWithGoPlusData(limit);
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
  runGoPlusWorker();
}

module.exports = {
  runGoPlusWorker,
};
