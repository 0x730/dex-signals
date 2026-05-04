require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');
const TokenModel = require('../models/TokenModel');
const { withRetry, sleep } = require('../utils/baseWorker');

// Read config from env
const GECKO_BASE_URL =
  process.env.GECKO_BASE_URL || 'https://api.geckoterminal.com';

// For paging new pools
const MAX_PAGES = parseInt(process.env.GECKO_MAX_PAGES, 10) || 10;
const NOT_OLDER_DAYS = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
// For optional thresholds
const MIN_LIQUIDITY = parseFloat(process.env.MIN_LIQUIDITY) || 0;
// Typically you won't use MIN_DEXT_SCORE in geckoService, because
// Dextools score comes from Dextools Worker. But we read it here if you
// want consistent environment variables.
const MIN_DEXT_SCORE = parseFloat(process.env.MIN_DEXT_SCORE) || 0;

// Rate limiting configuration
const API_RATE_LIMIT_MS = parseInt(process.env.API_RATE_LIMIT_MS, 10) || 3000; // Default to 3 seconds between API calls
const MAX_RETRIES = parseInt(process.env.GECKO_MAX_RETRIES, 10) || 3; // Maximum number of retries
const INITIAL_RETRY_DELAY =
  parseInt(process.env.GECKO_INITIAL_RETRY_DELAY, 10) || 10000; // Initial retry delay in ms
const RATE_LIMIT_BACKOFF =
  parseInt(process.env.GECKO_RATE_LIMIT_BACKOFF, 10) || 60000; // Additional delay after rate limit error
const MAX_CONSECUTIVE_RATE_LIMITS =
  parseInt(process.env.GECKO_MAX_CONSECUTIVE_RATE_LIMITS, 10) || 3; // Maximum number of consecutive rate limits before taking a longer break

// Define valid quote tokens per network
const VALID_QUOTE_TOKENS = {
  base: '0x4200000000000000000000000000000000000006', // WETH
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  eth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
};

/**
 * Utility: parse a dex ID string like 'pancakeswap-v3-base'
 * into { poolType: 'pancakeswap', poolVersion: 'v3' }.
 */
function parseDexId(dexId) {
  if (!dexId || typeof dexId !== 'string') {
    return { poolType: null, poolVersion: null };
  }

  // Determine the delimiter: prioritize '_' over '-'
  const delimiter = dexId.includes('_') ? '_' : '-';

  const parts = dexId.split(delimiter);

  // Extract poolType and poolVersion based on available parts
  const poolType = parts[0] || null;
  const poolVersion = parts[1] || null;

  return { poolType, poolVersion };
}

/**
 * Utility: parse 'network_0x4200...' -> '0x4200...' (remove 'network_' prefix).
 * Handles any network prefix by finding the first underscore and returning everything after it.
 * If there's no underscore, returns the original tokenId.
 */
function parseTokenId(tokenId) {
  if (!tokenId || typeof tokenId !== 'string') {
    return tokenId;
  }

  const underscoreIndex = tokenId.indexOf('_');
  if (underscoreIndex !== -1) {
    return tokenId.slice(underscoreIndex + 1);
  }

  return tokenId;
}

/**
 * Safe parse float from a string, defaulting to 0 if invalid.
 */
function parseFloatSafe(value) {
  if (!value) return 0.0;
  const f = parseFloat(value);
  return Number.isNaN(f) ? 0.0 : f;
}

/**
 * Clean a string by truncating it to a maximum length.
 * With the database now using utf8mb4 character set, we can keep emoji characters.
 * @param {string} str - The string to clean
 * @param {number} maxLength - Maximum length of the string (default: 100)
 * @returns {string} - The cleaned string
 */
function cleanString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  // Store original string for comparison
  const original = str;

  // Instead of removing emojis, we'll just truncate the string to the specified length
  const cleaned = str.substring(0, maxLength).trim();

  // Log if the string was changed
  if (original !== cleaned) {
    logger.info(
      `[GeckoService] Cleaned token name: "${original}" -> "${cleaned}"`
    );
  }

  return cleaned;
}

/**
 * Fetch data from GeckoTerminal API with retry and rate limit handling
 * @param {string} url - The URL to fetch
 * @returns {Promise<Object>} - The response data
 */
async function fetchWithRateLimitHandling(url) {
  return withRetry(
    async () => {
      try {
        const response = await axios.get(url, {
          timeout: 15000, // 15 second timeout
          headers: {
            'User-Agent': 'TokenMonitor/1.0', // Identify our application
          },
        });
        return response.data;
      } catch (error) {
        // Check specifically for rate limit errors (HTTP 429)
        if (error.response && error.response.status === 429) {
          logger.warn(
            `[GeckoService] Rate limit exceeded when fetching ${url}. Will back off and retry.`
          );
          // Add a longer delay for rate limit errors
          await sleep(RATE_LIMIT_BACKOFF);
          // Rethrow to trigger retry
          throw new Error(`Rate limit exceeded: ${error.message}`);
        }

        // Check specifically for not found errors (HTTP 404)
        if (error.response && error.response.status === 404) {
          logger.error(
            `[GeckoService] Resource not found when fetching ${url}. Error: ${error.message}`
          );
          throw new Error(`Resource not found (404): ${error.message}`);
        }

        // For other errors, just rethrow
        throw error;
      }
    },
    {
      maxRetries: MAX_RETRIES,
      initialDelay: INITIAL_RETRY_DELAY,
      onRetry: (error, retryCount) => {
        logger.warn(
          `[GeckoService] Retry ${retryCount}/${MAX_RETRIES} after error: ${error.message}`
        );
      },
    }
  );
}

/**
 * Fetch up to MAX_PAGES of pools from the GeckoTerminal API,
 * upsert them into the 'tokens' table, and store liquidity + default dextScore=0.
 * Optionally set watch=false if liquidity < MIN_LIQUIDITY.
 * Enhanced with rate limiting and retry logic.
 *
 * @param {string} network - The blockchain network (e.g., 'base', 'ethereum')
 * @param {string} endpoint - The endpoint to use (default: 'pools')
 * @param {string} sort - How to sort the pools (default: 'h24_volume_usd_desc' for highest volume pools)
 * @param {boolean} skipAgeCheck - Whether to skip the age check (default: false)
 */
async function fetchAndSaveLatestTokens(
  network = 'base',
  endpoint = 'pools',
  sort = 'h24_volume_usd_desc',
  skipAgeCheck = false
) {
  try {
    logger.info(
      `[GeckoService] Fetching up to ${MAX_PAGES} pages of new pools...`
    );

    let totalSaved = 0;
    let consecutiveRateLimits = 0;
    let currentDelay = API_RATE_LIMIT_MS; // Start with the base delay

    const notOlderThan = new Date(
      Date.now() - NOT_OLDER_DAYS * 24 * 60 * 60 * 1000
    );

    // Loop through pages 1..MAX_PAGES
    for (let page = 1; page <= MAX_PAGES; page++) {
      // If we've hit too many consecutive rate limits, take a longer break
      if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
        const longBackoff = RATE_LIMIT_BACKOFF * 2;
        logger.warn(
          `[GeckoService] Too many consecutive rate limits (${consecutiveRateLimits}). Taking a longer break (${longBackoff}ms) before continuing.`
        );
        await sleep(longBackoff);
        consecutiveRateLimits = 0; // Reset after the long break
        currentDelay = API_RATE_LIMIT_MS * 2; // Increase the base delay
      }

      // Updated API endpoint structure to match the current GeckoTerminal API
      const url = `${GECKO_BASE_URL}/api/v2/networks/${network}/${endpoint}?page=${page}${sort ? `&sort=${sort}` : ''}`;
      logger.info(`[GeckoService] Fetching page ${page}: ${url}`);

      try {
        // Use the new fetchWithRateLimitHandling function
        const data = await fetchWithRateLimitHandling(url);
        const poolsData = data.data || [];

        // Reset consecutive rate limits on success
        consecutiveRateLimits = 0;

        // Gradually reduce delay if we're successful (but not below the base delay)
        currentDelay = Math.max(API_RATE_LIMIT_MS, currentDelay * 0.9);

        if (!poolsData.length) {
          logger.info(
            `[GeckoService] Page ${page} returned no data. Stopping early.`
          );
          break; // Exit loop if no data
        }

        let pageCount = 0; // Reset page count for each page
        for (const pool of poolsData) {
          const address = pool.attributes?.address || '';
          const poolCreatedAt = new Date(pool.attributes.pool_created_at);

          if (!skipAgeCheck && poolCreatedAt < notOlderThan) {
            logger.info(
              `Skipping pool ${address} as it was created on ${poolCreatedAt.toISOString()} (older than ${NOT_OLDER_DAYS} days).`
            );
            continue;
          }

          // Check if the address is already in the database
          const exists = await TokenModel.existsByAddress(network, address);
          if (exists) {
            logger.info(`Skipping pool ${address} as it already exists.`);
            continue;
          }

          // Extract and parse other pool attributes
          const baseRel = pool.relationships?.base_token?.data;
          const quoteRel = pool.relationships?.quote_token?.data;
          const dexRel = pool.relationships?.dex?.data;

          const baseToken = baseRel ? parseTokenId(baseRel.id) : null;
          const quoteToken = quoteRel ? parseTokenId(quoteRel.id) : null;

          if (
            quoteToken &&
            VALID_QUOTE_TOKENS[network] &&
            quoteToken.toLowerCase() !==
              VALID_QUOTE_TOKENS[network].toLowerCase()
          ) {
            logger.info(
              `Skipping pool ${address} due to mismatched quote token ${quoteToken}.`
            );
            continue;
          }

          const { poolType, poolVersion } = dexRel ? parseDexId(dexRel.id) : {};
          const liquidity = parseFloatSafe(pool.attributes?.reserve_in_usd);
          const watchStatus = liquidity >= MIN_LIQUIDITY;

          const record = {
            chain: network,
            address,
            watch: watchStatus,
            recommendX: 0.5,
            otherData: JSON.stringify(pool.attributes),
            liquidityUsd: liquidity,
            tokenName: cleanString(pool.attributes.name, 100),
            poolCreatedAt,
            baseToken,
            quoteToken,
            poolType,
            poolVersion,
          };

          await TokenModel.upsertToken(record);
          pageCount++;
          totalSaved++;
        }

        logger.info(`[GeckoService] Page ${page} saved ${pageCount} pools.`);

        if (poolsData.length < 20) {
          logger.info(
            `[GeckoService] Page ${page} had only ${poolsData.length} items — stopping.`
          );
          break; // Assume last page if fewer than expected results
        }
      } catch (error) {
        // Check if it's a rate limit error
        if (error.message && error.message.includes('Rate limit exceeded')) {
          consecutiveRateLimits++;
          logger.warn(
            `[GeckoService] Rate limit error for page ${page} when fetching ${url}. Consecutive rate limits: ${consecutiveRateLimits}`
          );

          // Increase delay for the next request
          currentDelay = currentDelay * 2;

          // If we haven't hit the max consecutive rate limits, try the same page again
          if (consecutiveRateLimits < MAX_CONSECUTIVE_RATE_LIMITS) {
            page--; // Retry the same page
            logger.info(
              `[GeckoService] Will retry page ${page + 1} after delay`
            );
          }
        } else if (
          error.message &&
          error.message.includes('Resource not found (404)')
        ) {
          // Specifically log 404 errors with the URL
          logger.error(
            `[GeckoService] Error fetching page ${page}: 404 Not Found for URL ${url}`
          );
        } else {
          // For other errors, log and continue to the next page
          // Try to extract status code if available
          const statusCode = error.response?.status
            ? error.response.status
            : 'unknown';
          logger.error(
            `[GeckoService] Error fetching page ${page}: ${error.message} (Status: ${statusCode}, URL: ${url})`
          );
        }
      }

      // Adaptive delay between pages
      const delayWithJitter = currentDelay * (0.8 + Math.random() * 0.4); // Add jitter (±20%)
      await sleep(delayWithJitter);
    }

    logger.info(
      `[GeckoService] Done. Fetched & saved total ${totalSaved} new pools.`
    );
  } catch (err) {
    logger.error(`[GeckoService] Error: ${err.message}`, err);
  }
}

module.exports = {
  fetchAndSaveLatestTokens,
  cleanString,
};
