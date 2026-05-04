require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');
const { createWorker, withRetry, sleep } = require('../utils/baseWorker');
const TokenModel = require('../models/TokenModel');

// Configuration from .env
const GECKO_BASE_URL =
  process.env.GECKO_BASE_URL || 'https://api.geckoterminal.com';
const SCORE_SKIP_INTERVAL_MINUTES =
  parseInt(process.env.SCORE_SKIP_INTERVAL_MINUTES, 10) || 60; // Default to 1 hour
const API_RATE_LIMIT_MS = parseInt(process.env.API_RATE_LIMIT_MS, 10) || 3000; // Default to 3 seconds between API calls
const MAX_RETRIES = parseInt(process.env.GECKO_MAX_RETRIES, 10) || 3; // Maximum number of retries
const INITIAL_RETRY_DELAY =
  parseInt(process.env.GECKO_INITIAL_RETRY_DELAY, 10) || 5000; // Initial retry delay in ms
const RATE_LIMIT_BACKOFF =
  parseInt(process.env.GECKO_RATE_LIMIT_BACKOFF, 10) || 60000; // Additional delay after rate limit error
const MAX_TOKENS_PER_RUN =
  parseInt(process.env.GECKO_MAX_TOKENS_PER_RUN, 10) || 50; // Maximum number of tokens to process in a single run
const MAX_CONSECUTIVE_RATE_LIMITS =
  parseInt(process.env.GECKO_MAX_CONSECUTIVE_RATE_LIMITS, 10) || 3; // Maximum number of consecutive rate limits before taking a longer break

/**
 * Fetch gt_score from GeckoTerminal for a given token address with improved rate limit handling.
 * @param {string} tokenAddress - The token address to fetch score for
 * @param {string} chain - The blockchain chain (e.g., 'base', 'eth')
 * @returns {Promise<Object>} - Object containing gtScoreFetched, gtInfo, and rateLimit flag
 */
async function fetchGtScore(tokenAddress, chain) {
  const url = `${GECKO_BASE_URL}/api/v2/networks/${chain}/tokens/${tokenAddress}/info`;

  return withRetry(
    async () => {
      try {
        const response = await axios.get(url, {
          timeout: 15000, // 15 second timeout
          headers: {
            'User-Agent': 'TokenMonitor/1.0', // Identify our application
          },
        });

        const data = response.data.data;

        if (!data || !data.attributes) {
          logger.warn(`No data found for token address: ${tokenAddress}`);
          return { gtScoreFetched: 0.0, gtInfo: null, rateLimit: false };
        }

        const gtScoreFetched = parseFloat(data.attributes.gt_score) || 0.0;
        return {
          gtScoreFetched: gtScoreFetched,
          gtInfo: data.attributes,
          rateLimit: false,
        };
      } catch (error) {
        // Check specifically for rate limit errors (HTTP 429)
        if (error.response && error.response.status === 429) {
          logger.warn(
            `[GeckoScoreWorker] Rate limit exceeded when fetching ${url}. Will back off and retry.`
          );
          // Add a longer delay for rate limit errors
          await sleep(RATE_LIMIT_BACKOFF);
          // Rethrow to trigger retry
          throw new Error(`Rate limit exceeded: ${error.message}`);
        }

        // Check specifically for not found errors (HTTP 404)
        if (error.response && error.response.status === 404) {
          logger.error(
            `[GeckoScoreWorker] Resource not found when fetching ${url}. Error: ${error.message}`
          );
          throw new Error(`Resource not found (404): ${error.message}`);
        }

        // For other errors, just rethrow with status code if available
        const statusCode = error.response?.status
          ? error.response.status
          : 'unknown';
        logger.error(
          `[GeckoScoreWorker] Error (${statusCode}) when fetching ${url}: ${error.message}`
        );
        throw error;
      }
    },
    {
      maxRetries: MAX_RETRIES,
      initialDelay: INITIAL_RETRY_DELAY,
      onRetry: (error, retryCount) => {
        logger.warn(
          `[GeckoScoreWorker] Retry ${retryCount}/${MAX_RETRIES} after error: ${error.message}`
        );
      },
    }
  ).catch((error) => {
    // Try to extract status code if available
    const statusCode = error.response?.status
      ? error.response.status
      : 'unknown';
    logger.error(
      `[GeckoScoreWorker] Error (${statusCode}) fetching gtScore for ${tokenAddress} from ${url}: ${error.message}`
    );
    return { gtScoreFetched: 0.0, gtInfo: null, rateLimit: false };
  });
}

// updateSingleToken function has been removed and its functionality integrated directly into updateGtScoreForWatchedTokens

/**
 * Worker function to fetch and update gtScore for watched tokens with improved rate limiting.
 */
async function updateGtScoreForWatchedTokens() {
  logger.info('[GeckoScoreWorker] Starting gtScore update for watched tokens.');

  try {
    // Find tokens that need score update (limited by MAX_TOKENS_PER_RUN)
    const tokensToProcess = await TokenModel.findTokensForGeckoScoreAnalysis(
      SCORE_SKIP_INTERVAL_MINUTES,
      MAX_TOKENS_PER_RUN
    );

    if (tokensToProcess.length === 0) {
      logger.info('[GeckoScoreWorker] No tokens under watch to update.');
      return;
    }

    logger.info(
      `[GeckoScoreWorker] Found ${tokensToProcess.length} tokens to process.`
    );

    let successCount = 0;
    let rateLimitCount = 0;
    let errorCount = 0;
    let consecutiveRateLimits = 0;
    let currentDelay = API_RATE_LIMIT_MS; // Start with the base delay

    // Process each token with adaptive rate limiting
    for (let i = 0; i < tokensToProcess.length; i++) {
      const token = tokensToProcess[i];

      // If we've hit too many consecutive rate limits, take a longer break
      if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
        const longBackoff = RATE_LIMIT_BACKOFF * 2;
        logger.warn(
          `[GeckoScoreWorker] Hit ${consecutiveRateLimits} consecutive rate limits. Taking a longer break (${longBackoff}ms) before continuing.`
        );
        await sleep(longBackoff);
        consecutiveRateLimits = 0; // Reset after the long break
        currentDelay = API_RATE_LIMIT_MS * 2; // Increase the base delay after a long break
      }

      try {
        // Try to update the token with our improved retry logic
        const result = await fetchGtScore(token.baseToken, token.chain);

        // Update was successful
        await TokenModel.updateToken(token.id, {
          gtScore: result.gtScoreFetched
            ? result.gtScoreFetched
            : token.gtScore,
          gtInfo: result.gtInfo ? JSON.stringify(result.gtInfo) : null,
          geckoScoreLastCheck: new Date(), // Update the last check timestamp
        });

        successCount++;
        consecutiveRateLimits = 0; // Reset consecutive rate limits on success

        // Gradually reduce delay if we're successful (but not below the base delay)
        currentDelay = Math.max(API_RATE_LIMIT_MS, currentDelay * 0.9);

        logger.info(
          `[GeckoScoreWorker] Updated gtScore for token ${token.baseToken}: ${result.gtScoreFetched}`
        );
      } catch (error) {
        // Construct the URL for better error logging
        const url = `${GECKO_BASE_URL}/api/v2/networks/${token.chain}/tokens/${token.baseToken}/info`;

        // Check if this was a rate limit error (this should be caught by fetchGtScore, but just in case)
        if (error.response && error.response.status === 429) {
          rateLimitCount++;
          consecutiveRateLimits++;

          logger.warn(
            `[GeckoScoreWorker] Rate limited for token ${token.baseToken} when fetching ${url}: ${error.message}`
          );

          // Exponential backoff for rate limit errors
          currentDelay = currentDelay * 2;
        } else if (
          error.message &&
          error.message.includes('Resource not found (404)')
        ) {
          // Specifically log 404 errors with the URL
          errorCount++;
          logger.error(
            `[GeckoScoreWorker] Resource not found for token ${token.baseToken} when fetching ${url}`
          );
        } else {
          // Other error
          errorCount++;
          // Try to extract status code if available
          const statusCode = error.response?.status
            ? error.response.status
            : 'unknown';
          logger.error(
            `[GeckoScoreWorker] Error (${statusCode}) updating token ${token.baseToken} when fetching ${url}: ${error.message}`
          );
        }
      }

      // Add jitter to the delay to avoid synchronized requests
      const delayWithJitter = currentDelay * (0.8 + Math.random() * 0.4); // Add jitter (±20%)
      logger.debug(
        `[GeckoScoreWorker] Waiting ${delayWithJitter}ms before next request`
      );
      await sleep(delayWithJitter);

      // Log progress every 10 tokens or at the end
      if ((i + 1) % 10 === 0 || i === tokensToProcess.length - 1) {
        logger.info(
          `[GeckoScoreWorker] Progress: ${i + 1}/${tokensToProcess.length} tokens processed. Success: ${successCount}, Rate Limited: ${rateLimitCount}, Errors: ${errorCount}`
        );
      }
    }

    logger.info(
      `[GeckoScoreWorker] Completed gtScore updates. Success: ${successCount}, Rate Limited: ${rateLimitCount}, Errors: ${errorCount}`
    );
  } catch (err) {
    logger.error(`[GeckoScoreWorker] Error: ${err.message}`, err);
    throw err; // Re-throw to allow retry mechanism to work
  }
}

/**
 * Run the GeckoScore Worker periodically.
 * @returns {Object} - Worker control object with stop method
 */
function runGeckoScoreWorker() {
  const intervalMs =
    parseInt(process.env.GECKO_SCORE_FETCH_INTERVAL_MS, 10) || 300000; // 5 minutes

  // Create the worker
  const worker = createWorker({
    name: 'GeckoScoreWorker',
    task: updateGtScoreForWatchedTokens,
    intervalMs,
    retryOptions: {
      maxRetries: 2,
      initialDelay: 10000,
    },
    runImmediately: true,
  });

  // Start the worker
  return worker.start();
}

// If this file is run directly, start the worker
if (require.main === module) {
  runGeckoScoreWorker();
}

module.exports = {
  runGeckoScoreWorker,
  fetchGtScore, // Export for testing
  updateGtScoreForWatchedTokens, // Export for testing
};
