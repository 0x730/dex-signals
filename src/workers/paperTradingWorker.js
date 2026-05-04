require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const TokenModel = require('../models/TokenModel');
const {
  updatePaperTradingValues,
  ensurePaperTradedTokensAreWatched,
} = require('../services/trackingService');

/**
 * Updates the current values and profit/loss calculations for all paper traded tokens.
 * @returns {Promise<Object>} - Object containing counts of tokens updated, failed, and total
 */
async function updatePaperTradedTokens() {
  logger.info('[PaperTradingWorker] Starting update of paper traded tokens');

  try {
    // First, ensure all paper traded tokens have watch=true
    const watchUpdated = await ensurePaperTradedTokensAreWatched();
    if (watchUpdated > 0) {
      logger.info(
        `[PaperTradingWorker] Updated watch flag for ${watchUpdated} paper traded tokens`
      );
    }
    // Get all paper traded tokens
    const tokens = await TokenModel.findPaperTradedTokens();

    if (tokens.length === 0) {
      logger.info('[PaperTradingWorker] No paper traded tokens found');
      return { updated: 0, failed: 0, total: 0 };
    }

    let updatedCount = 0;
    let failedCount = 0;

    // Update each token's paper trading values
    for (const token of tokens) {
      const success = await updatePaperTradingValues(token);
      if (success) {
        updatedCount++;
      } else {
        failedCount++;
        logger.warn(
          `[PaperTradingWorker] Failed to update values for token ID ${token.id} (${token.tokenName || 'unknown'})`
        );
      }
    }

    const totalCount = tokens.length;

    if (failedCount > 0) {
      logger.warn(
        `[PaperTradingWorker] Completed with ${failedCount} failures. Updated ${updatedCount}/${totalCount} tokens.`
      );
    } else {
      logger.info(
        `[PaperTradingWorker] Successfully updated values for all ${updatedCount} paper traded tokens`
      );
    }

    return { updated: updatedCount, failed: failedCount, total: totalCount };
  } catch (error) {
    logger.error(
      `[PaperTradingWorker] Error updating paper traded tokens: ${error.message}`,
      error
    );
    return { updated: 0, failed: 0, total: 0, error: error.message };
  }
}

/**
 * Creates and starts a worker to update paper trading values
 * @returns {Object} - Worker control object with stop method
 */
function runPaperTradingWorker() {
  const intervalMs =
    parseInt(process.env.PAPER_TRADING_UPDATE_INTERVAL_MS, 10) || 300000; // Default: 5 minutes

  // Create the worker with the task to update paper traded tokens
  const worker = createWorker({
    name: 'PaperTradingWorker',
    task: async () => {
      return await updatePaperTradedTokens();
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
  runPaperTradingWorker();
}

module.exports = {
  runPaperTradingWorker,
  updatePaperTradedTokens,
};
