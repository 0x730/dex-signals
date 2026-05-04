/**
 * Cleanup Service
 *
 * This service handles cleaning up old and inactive tokens from the database.
 */

require('dotenv').config();
const logger = require('../utils/logger');
const TokenModel = require('../models/TokenModel');
const DexscreenerHistoricalDataModel = require('../models/DexscreenerHistoricalDataModel');

/**
 * Clean up old and inactive tokens.
 * Deletes records that:
 * - Are not marked for watch (`watch = false`).
 * - Have either `liquidityUsd` or `pooledQuote` equal to 0.
 * - Are older than 1 hour.
 *
 * @returns {number} - Number of tokens deleted
 */
async function cleanupOldInactiveTokens() {
  logger.info('[CleanupService] Starting cleanup of old inactive tokens.');

  try {
    const deletedCount = await TokenModel.deleteOldInactiveTokens();
    logger.info(
      `[CleanupService] Successfully deleted ${deletedCount} old inactive tokens.`
    );
    return deletedCount;
  } catch (err) {
    logger.error(`[CleanupService] Error during cleanup: ${err.message}`, err);
    throw err;
  }
}

/**
 * Clean up old historical data from DexScreener.
 * Deletes records that are older than the specified retention period.
 * The retention period is configurable via the DEXSCREENER_HISTORY_RETENTION_DAYS
 * environment variable, with a default of 30 days.
 *
 * @returns {number} - Number of records deleted
 */
async function cleanupOldDexscreenerHistoricalData() {
  logger.info(
    '[CleanupService] Starting cleanup of old DexScreener historical data.'
  );

  try {
    // Get the retention period from the environment variable or use the default (30 days)
    const retentionDays =
      parseInt(process.env.DEXSCREENER_HISTORY_RETENTION_DAYS, 10) || 30;

    const deletedCount =
      await DexscreenerHistoricalDataModel.deleteOldData(retentionDays);

    logger.info(
      `[CleanupService] Successfully deleted ${deletedCount} old DexScreener historical data records (older than ${retentionDays} days).`
    );

    return deletedCount;
  } catch (err) {
    logger.error(
      `[CleanupService] Error during DexScreener historical data cleanup: ${err.message}`,
      err
    );
    throw err;
  }
}

module.exports = {
  cleanupOldInactiveTokens,
  cleanupOldDexscreenerHistoricalData,
};
