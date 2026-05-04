/**
 * Base Worker Utility
 *
 * This utility provides a standardized way to create and manage worker processes.
 * It includes error handling, graceful shutdown, retry mechanisms, and better logging.
 */

const logger = require('./logger');

/**
 * Sleep function for rate limiting and retries
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Resolves after the specified time
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {Function} options.onRetry - Function to call on retry (default: null)
 * @returns {Promise} - Result of the function
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
  } = options;

  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      if (retries > maxRetries) {
        throw error;
      }

      logger.warn(
        `Retry ${retries}/${maxRetries} after error: ${error.message}`
      );

      if (onRetry) {
        onRetry(error, retries);
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 0.3 + 0.85; // Random between 0.85 and 1.15
      delay = Math.min(delay * 2 * jitter, maxDelay);

      await sleep(delay);
    }
  }
}

/**
 * Create a worker that runs a task at specified intervals
 * @param {Object} config - Worker configuration
 * @param {string} config.name - Worker name
 * @param {Function} config.task - Task function to run
 * @param {number} config.intervalMs - Interval in milliseconds
 * @param {Function} config.getNextRunTime - Function to calculate the next run time
 * @param {Object} config.retryOptions - Retry options for the task
 * @param {boolean} config.runImmediately - Whether to run the task immediately (default: true)
 * @returns {Object} - Worker control object
 */
function createWorker(config) {
  const {
    name,
    task,
    intervalMs,
    getNextRunTime,
    retryOptions = {},
    runImmediately = true,
  } = config;

  let intervalId = null;
  let isRunning = false;
  let isStopping = false;

  // Function to run the task with error handling and retry
  async function runTask() {
    if (isRunning || isStopping) {
      logger.info(
        `[${name}] Task already running or worker stopping, skipping this run`
      );
      return;
    }

    isRunning = true;
    logger.info(`[${name}] Starting task execution`);

    try {
      await withRetry(task, {
        ...retryOptions,
        onRetry: (error, retries) => {
          logger.warn(
            `[${name}] Retry ${retries} after error: ${error.message}`
          );
          if (retryOptions.onRetry) {
            retryOptions.onRetry(error, retries);
          }
        },
      });
      logger.info(`[${name}] Task completed successfully`);
    } catch (error) {
      logger.error(
        `[${name}] Task failed after retries: ${error.message}`,
        error
      );
    } finally {
      isRunning = false;
    }
  }

  // Function to schedule the next run
  function scheduleNextRun() {
    if (isStopping) return;

    // Clear any existing interval
    if (intervalId) {
      clearTimeout(intervalId);
      intervalId = null;
    }

    // Calculate when to run next
    let nextRunTime;
    if (getNextRunTime) {
      // Use the provided function to calculate next run time
      nextRunTime = getNextRunTime();

      // Ensure nextRunTime is in the future
      if (nextRunTime <= Date.now()) {
        logger.warn(
          `[${name}] getNextRunTime returned a time in the past or present, using default interval`
        );
        nextRunTime = Date.now() + (intervalMs || 60000); // Default to 1 minute if intervalMs not provided
      }
    } else if (intervalMs) {
      // Use fixed interval if getNextRunTime not provided
      nextRunTime = Date.now() + intervalMs;
    } else {
      // Default interval if neither is provided
      nextRunTime = Date.now() + 60000; // 1 minute default
    }

    const delayMs = nextRunTime - Date.now();

    logger.info(
      `[${name}] Next run scheduled in ${Math.round(delayMs / 1000)} seconds`
    );

    // Schedule the next run
    intervalId = setTimeout(async () => {
      await runTask();
      // Schedule the next run after this one completes
      scheduleNextRun();
    }, delayMs);
  }

  // Start the worker
  function start() {
    logger.info(`[${name}] Starting worker...`);

    if (runImmediately) {
      // Run immediately
      runTask().then(() => {
        // Schedule next run after initial run completes
        scheduleNextRun();
      });
    } else {
      // Schedule first run
      scheduleNextRun();
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));

    return {
      stop,
      isRunning: () => isRunning,
    };
  }

  // Stop the worker
  async function stop(signal) {
    if (isStopping) return;

    isStopping = true;
    logger.info(
      `[${name}] Received ${signal || 'stop command'}. Shutting down...`
    );

    if (intervalId) {
      clearTimeout(intervalId);
      intervalId = null;
    }

    // Wait for current task to complete if it's running
    if (isRunning) {
      logger.info(`[${name}] Waiting for current task to complete...`);
      while (isRunning) {
        await sleep(100);
      }
    }

    logger.info(`[${name}] Worker stopped`);
    isStopping = false;
  }

  return {
    start,
    stop,
  };
}

module.exports = {
  createWorker,
  withRetry,
  sleep,
};
