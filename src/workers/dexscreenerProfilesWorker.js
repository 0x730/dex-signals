require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const {
  fetchAndSaveTokenProfilesAndBoosts,
} = require('../services/dexscreenerService');

/**
 * Creates and starts a worker to fetch and save token profiles and boosts from DexScreener
 * @param {string} chainId - Chain ID to fetch data for (default: 'base')
 * @returns {Object} - Worker control object with stop method
 */
function runDexScreenerProfilesWorker(chainId = 'base') {
  const intervalMs =
    parseInt(process.env.DEXSCREENER_PROFILES_FETCH_INTERVAL_MS, 10) || 180000; // Default: 3 minutes

  // Create the worker with the task to fetch and save token profiles and boosts
  const worker = createWorker({
    name: `DexScreenerProfilesWorker-${chainId}`,
    task: async () => {
      return await fetchAndSaveTokenProfilesAndBoosts(chainId);
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
  const CHAIN_ID = process.env.DEXSCREENER_CHAIN_ID || 'base';
  runDexScreenerProfilesWorker(CHAIN_ID);
}

module.exports = {
  runDexScreenerProfilesWorker,
};
