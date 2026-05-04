require('dotenv').config();
const logger = require('../../utils/logger');
const { createWorker } = require('../../utils/baseWorker');
const {
  enrichTokensWithDextoolsData,
} = require('../../services/inactive/dextoolsService');

/**
 * Creates and starts a worker to analyze tokens with Dextools
 * Enhanced with better monitoring and adaptive scheduling
 *
 * @param {number} limit - Maximum number of tokens to analyze per run
 * @returns {Object} - Worker control object with stop method
 */
function runDextoolsWorker(
  limit = parseInt(process.env.MAX_DEXTOOLS_TOKENS, 10) || 20
) {
  // Get base interval from environment
  const baseIntervalMs =
    parseInt(process.env.DEXTOOLS_FETCH_INTERVAL_MS, 10) || 900000; // Default: 15 minutes

  // Track performance metrics for adaptive scheduling
  let lastRunStats = {
    successRate: 1,
    errorRate: 0,
    duration: 0,
    lastRunTime: null,
  };

  // Create the worker with the task to analyze tokens with Dextools
  const worker = createWorker({
    name: 'DextoolsWorker',
    task: async () => {
      logger.info('[DextoolsWorker] Starting task execution');

      // Record start time
      const startTime = Date.now();

      try {
        // Run the enrichment process
        const stats = await enrichTokensWithDextoolsData(limit);

        // Calculate success and error rates
        const totalProcessed = stats.processedCount || 0;
        const successRate =
          totalProcessed > 0 ? stats.successCount / totalProcessed : 1;
        const errorRate =
          totalProcessed > 0 ? stats.errorCount / totalProcessed : 0;

        // Update performance metrics
        lastRunStats = {
          successRate,
          errorRate,
          duration: stats.duration || Date.now() - startTime,
          lastRunTime: new Date(),
          ...stats,
        };

        // Log detailed statistics
        logger.info(
          `[DextoolsWorker] Task completed with success rate: ${(successRate * 100).toFixed(1)}%`
        );
        logger.info(
          `[DextoolsWorker] Processed: ${stats.processedCount}, Success: ${stats.successCount}, Errors: ${stats.errorCount}`
        );

        if (stats.errorCount > 0 && stats.errorsByType) {
          logger.info(
            `[DextoolsWorker] Error types: ${JSON.stringify(stats.errorsByType)}`
          );
        }

        // Return the statistics for the worker framework
        return stats;
      } catch (error) {
        // Handle unexpected errors
        logger.error(`[DextoolsWorker] Unexpected error: ${error.message}`);

        // Update error metrics
        lastRunStats.errorRate = 1;
        lastRunStats.successRate = 0;
        lastRunStats.duration = Date.now() - startTime;
        lastRunStats.lastRunTime = new Date();

        // Re-throw to let the worker framework handle retries
        throw error;
      }
    },
    // Use adaptive interval based on performance
    getNextRunTime: () => {
      // If this is the first run or there were errors, use the base interval
      if (!lastRunStats.lastRunTime || lastRunStats.errorRate > 0.5) {
        return Date.now() + baseIntervalMs;
      }

      // Calculate adaptive interval based on success rate and performance
      let adaptiveInterval = baseIntervalMs;

      // If success rate is high, we can run more frequently
      if (lastRunStats.successRate > 0.9) {
        adaptiveInterval = Math.max(baseIntervalMs * 0.8, 60000); // Min 1 minute
      }
      // If success rate is low but not critical, run less frequently
      else if (lastRunStats.successRate < 0.7) {
        adaptiveInterval = baseIntervalMs * 1.5; // 50% longer interval
      }

      // If the last run took a long time, add some buffer
      if (lastRunStats.duration > baseIntervalMs * 0.5) {
        adaptiveInterval += lastRunStats.duration * 0.5;
      }

      logger.info(
        `[DextoolsWorker] Next run scheduled in ${Math.round(adaptiveInterval / 1000)} seconds`
      );
      return Date.now() + adaptiveInterval;
    },
    retryOptions: {
      maxRetries: 2, // Fewer retries for browser automation
      initialDelay: 10000, // Longer delay for browser automation
    },
    runImmediately: true,
  });

  // Start the worker
  return worker.start();
}

if (require.main === module) {
  runDextoolsWorker();
}

module.exports = {
  runDextoolsWorker,
};
