require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const { fetchAndSaveLatestTokens } = require('../services/geckoService');

/**
 * Creates and starts a worker to fetch and save latest tokens from Gecko
 * @param {string} network - Network to fetch tokens from (default: 'base')
 * @param {string} endpoint - The endpoint to use (default: 'pools')
 * @param {string} sort - How to sort the pools (default: 'h24_volume_usd_desc' for highest volume pools)
 * @returns {Object} - Worker control object with stop method
 */
function runGeckoWorker(
  network = 'base',
  endpoint = 'pools',
  sort = 'h24_volume_usd_desc'
) {
  const intervalMs =
    parseInt(process.env.GECKO_FETCH_INTERVAL_MS, 10) || 600000;

  // Create the worker with the task to fetch and save tokens
  const worker = createWorker({
    name: `GeckoWorker-${network}-${endpoint}-${sort}`,
    task: async () => {
      // Skip age check for geckoWorker as per requirements
      return await fetchAndSaveLatestTokens(network, endpoint, sort, true);
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

// If this file is run directly, start the worker
if (require.main === module) {
  const GECKO_NETWORK = process.env.GECKO_NETWORK || 'base';
  const GECKO_ENDPOINT = process.env.GECKO_ENDPOINT || 'pools';
  const GECKO_SORT = process.env.GECKO_SORT || 'h24_volume_usd_desc';
  runGeckoWorker(GECKO_NETWORK, GECKO_ENDPOINT, GECKO_SORT);
}

module.exports = {
  runGeckoWorker,
};
