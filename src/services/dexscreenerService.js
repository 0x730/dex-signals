/**
 * DexScreener Service
 *
 * This service handles fetching and updating liquidity data from DexScreener.
 * It also provides functions to fetch token profiles and token boosts from DexScreener.
 */

require('dotenv').config();
const axios = require('axios');
const Decimal = require('decimal.js');
const logger = require('../utils/logger');
const TokenModel = require('../models/TokenModel');
const db = require('../db');
const { withRetry, sleep } = require('../utils/baseWorker');
const DexscreenerHistoricalDataModel = require('../models/DexscreenerHistoricalDataModel');

/**
 * Sanitize string to ensure it's compatible with the database character set.
 * This is a fallback in case the database migration to utf8mb4 fails.
 * @param {string} str - The string to sanitize
 * @param {number} maxLength - Maximum length of the string (default: 100)
 * @returns {string} - Sanitized string
 */
function sanitizeString(str, maxLength = 100) {
  if (!str) return '';

  // Remove emoji characters if needed (fallback if database doesn't support utf8mb4)
  // This regex matches most emoji characters
  // const sanitized = str.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '');

  // Instead of removing emojis, we'll keep them but ensure the string is truncated properly
  return str.substring(0, maxLength);
}

// Configuration
const DEXSCREENER_BASE_URL = 'https://api.dexscreener.com/latest/dex/tokens';
const DEXSCREENER_PROFILES_URL =
  'https://api.dexscreener.com/token-profiles/latest/v1';
const DEXSCREENER_BOOSTS_URL =
  'https://api.dexscreener.com/token-boosts/latest/v1';
const MIN_LIQUIDITY = parseFloat(process.env.MIN_LIQUIDITY) || 5000; // Minimum liquidity in USD
const DEPLETED_POOL_THRESHOLD =
  parseFloat(process.env.DEPLETED_POOL_THRESHOLD) || 1; // Threshold for considering a pool depleted (in quote)
const SCORE_SKIP_INTERVAL_MINUTES =
  parseInt(process.env.SCORE_SKIP_INTERVAL_MINUTES, 10) || 60; // Default to 1 hour

// Define valid quote tokens per network (WETH addresses)
const VALID_QUOTE_TOKENS = {
  base: '0x4200000000000000000000000000000000000006', // WETH on Base
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB on BSC
  eth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH on Ethereum
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
};

// Rate limiting configuration
const API_RATE_LIMIT_MS = parseInt(process.env.API_RATE_LIMIT_MS, 10) || 1000; // Default to 1 second between API calls
const MAX_RETRIES = parseInt(process.env.DEXSCREENER_MAX_RETRIES, 10) || 3; // Maximum number of retries
const INITIAL_RETRY_DELAY =
  parseInt(process.env.DEXSCREENER_INITIAL_RETRY_DELAY, 10) || 5000; // Initial retry delay in ms
const RATE_LIMIT_BACKOFF =
  parseInt(process.env.DEXSCREENER_RATE_LIMIT_BACKOFF, 10) || 30000; // Additional delay after rate limit error

/**
 * Fetch data from DexScreener API with retry and rate limit handling
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
          logger.info(
            `[DexScreenerService] Rate limit exceeded when fetching ${url}. Will back off and retry.`
          );
          // Add a longer delay for rate limit errors
          await sleep(RATE_LIMIT_BACKOFF);
          // Rethrow to trigger retry
          throw new Error(`Rate limit exceeded: ${error.message}`);
        }

        // For other errors, just rethrow
        throw error;
      }
    },
    {
      maxRetries: MAX_RETRIES,
      initialDelay: INITIAL_RETRY_DELAY,
      onRetry: (error, retryCount) => {
        logger.info(
          `[DexScreenerService] Retry ${retryCount}/${MAX_RETRIES} after error: ${error.message}`
        );
      },
    }
  );
}

/**
 * Validates the price USD value to ensure it's within acceptable range.
 *
 * @param {string|number} value - The price value to validate
 * @returns {Decimal} - A valid Decimal price or 0.0
 */
const validatePriceUsd = (value) => {
  const MAX_PRICE_USD = new Decimal('99999999999.99');
  const MIN_PRICE_USD = new Decimal('0.000000000000001');

  let priceUsdDecimal = new Decimal(value || '0');

  if (
    priceUsdDecimal.isNaN() ||
    priceUsdDecimal.lessThan(MIN_PRICE_USD) ||
    priceUsdDecimal.greaterThan(MAX_PRICE_USD)
  ) {
    return new Decimal('0.0');
  }

  return priceUsdDecimal;
};

/**
 * Fetch liquidity and pooledQuote from DexScreener for a given token.
 * @param {string} address - The pair address.
 * @param {string} tokenAddress - The base token address.
 * @param {string} chain - The blockchain network (e.g., ethereum, bsc).
 * @returns {object} { liquidityUsd, pooledQuote, priceUsd, h1Buys, h1Sells, h6Buys, h6Sells, h24Buys, h24Sells, h1Volume, h6Volume, h24Volume, priceChange1h, priceChange6h, priceChange24h }
 * Note: Not all returned fields are stored in the database. Only use fields that exist in the tokens table.
 */
async function fetchLiquidity(address, tokenAddress, chain) {
  const url = `${DEXSCREENER_BASE_URL}/${tokenAddress.toLowerCase()}`;
  const chainId = chain === 'eth' ? 'ethereum' : chain;

  try {
    const response = await withRetry(
      async () => {
        return await axios.get(url);
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
      }
    );

    // Store the complete API response
    const apiResponse = response.data;
    const pairs = apiResponse.pairs;

    if (!pairs || pairs.length === 0) {
      logger.info(`No pairs found for token address: ${tokenAddress}`);
      return { liquidityUsd: 0, pooledQuote: 0, rawPairData: null };
    }

    const matchedPair = pairs.find(
      (pair) =>
        pair.chainId.toLowerCase() === chainId.toLowerCase() &&
        pair.pairAddress.toLowerCase() === address.toLowerCase()
    );

    if (!matchedPair) {
      logger.info(
        `No matching pair found for token address: ${tokenAddress} on chain: ${chain}`
      );
      return { liquidityUsd: 0, pooledQuote: 0, rawPairData: null };
    }

    // Get liquidity value
    const liquidityUsd = parseFloat(matchedPair.liquidity.usd) || 0.0;
    const pooledQuote = parseFloat(matchedPair.liquidity.quote) || 0.0;

    // Check if pool is depleted or very small
    if (pooledQuote < DEPLETED_POOL_THRESHOLD) {
      logger.info(
        `Pool for token address ${tokenAddress} has very low liquidity ($${liquidityUsd}), considering it depleted and setting price to 0`
      );
      return {
        liquidityUsd,
        pooledQuote,
        priceUsd: 0,
        // Include only fields that exist in the tokens table
        h1Sells: parseFloat(matchedPair.txns.h1.sells) || 0.0,
        h24Sells: parseFloat(matchedPair.txns.h24.sells) || 0.0,
        h1Volume: parseFloat(matchedPair.volume.h1) || 0.0,
        h24Volume: parseFloat(matchedPair.volume.h24) || 0.0,
        rawPairData: matchedPair,
      };
    }

    // Normal case - validate and use the price from DexScreener
    let priceUsdDecimal = validatePriceUsd(matchedPair.priceUsd);

    // Extract additional data for historical charts
    const priceChange1h = parseFloat(matchedPair.priceChange.h1) || 0.0;
    const priceChange6h = parseFloat(matchedPair.priceChange.h6) || 0.0;
    const priceChange24h = parseFloat(matchedPair.priceChange.h24) || 0.0;

    const h1Buys = parseFloat(matchedPair.txns.h1.buys) || 0.0;
    const h1Sells = parseFloat(matchedPair.txns.h1.sells) || 0.0;
    const h6Buys = parseFloat(matchedPair.txns.h6?.buys) || 0.0;
    const h6Sells = parseFloat(matchedPair.txns.h6?.sells) || 0.0;
    const h24Buys = parseFloat(matchedPair.txns.h24.buys) || 0.0;
    const h24Sells = parseFloat(matchedPair.txns.h24.sells) || 0.0;

    const h1Volume = parseFloat(matchedPair.volume.h1) || 0.0;
    const h6Volume = parseFloat(matchedPair.volume.h6) || 0.0;
    const h24Volume = parseFloat(matchedPair.volume.h24) || 0.0;

    return {
      liquidityUsd,
      pooledQuote,
      priceUsd: priceUsdDecimal.toNumber(),
      priceChange1h,
      priceChange6h,
      priceChange24h,
      h1Buys,
      h1Sells,
      h6Buys,
      h6Sells,
      h24Buys,
      h24Sells,
      h1Volume,
      h6Volume,
      h24Volume,
      rawPairData: matchedPair,
    };
  } catch (error) {
    logger.error(
      `Error fetching liquidity for ${tokenAddress}: ${error.message}`
    );
    return { liquidityUsd: 0, pooledQuote: 0, rawPairData: null };
  }
}

/**
 * Update liquidity for watched tokens.
 *
 * @param {number} skipIntervalMinutes - Minutes to skip between updates
 * @returns {number} - Number of tokens successfully updated
 */
async function updateLiquidityForWatchedTokens(
  skipIntervalMinutes = SCORE_SKIP_INTERVAL_MINUTES
) {
  logger.info(
    '[DexScreenerService] Starting liquidity update for watched tokens.'
  );

  try {
    const tokens =
      await TokenModel.findDexscreenerWatchedTokens(skipIntervalMinutes);

    if (tokens.length === 0) {
      logger.info('[DexScreenerService] No tokens under watch to update.');
      return 0;
    }

    logger.info(
      `[DexScreenerService] Found ${tokens.length} tokens under watch.`
    );

    let updatedCount = 0;

    for (const token of tokens) {
      const { id, address, baseToken, chain } = token;
      const liquidityData = await fetchLiquidity(address, baseToken, chain);

      try {
        // Extract only the columns that exist in the database
        const {
          liquidityUsd,
          pooledQuote,
          priceUsd,
          h1Sells,
          h24Sells,
          h1Volume,
          h24Volume,
        } = liquidityData;

        // Update the token in the tokens table with only existing columns
        await TokenModel.updateToken(id, {
          liquidityUsd,
          pooledQuote,
          priceUsd,
          h1Sells,
          h24Sells,
          h1Volume,
          h24Volume,
          dexscreenerLastCheck: new Date(), // Update the last check timestamp
        });

        // Save the data to the historical data table
        try {
          // Prepare the historical data
          const historicalData = {
            chain,
            poolAddress: address,
            timestamp: Math.floor(Date.now() / 1000),
            liquidityUsd: liquidityData.liquidityUsd,
            liquidityQuote: liquidityData.pooledQuote,
            priceUsd: liquidityData.priceUsd,
            priceChange1h: liquidityData.priceChange1h,
            priceChange6h: liquidityData.priceChange6h,
            priceChange24h: liquidityData.priceChange24h,
            volume1h: liquidityData.h1Volume,
            volume6h: liquidityData.h6Volume,
            volume24h: liquidityData.h24Volume,
            txnsBuys1h: liquidityData.h1Buys,
            txnsSells1h: liquidityData.h1Sells,
            txnsBuys6h: liquidityData.h6Buys,
            txnsSells6h: liquidityData.h6Sells,
            txnsBuys24h: liquidityData.h24Buys,
            txnsSells24h: liquidityData.h24Sells,
            baseTokenAddress: baseToken,
            baseTokenSymbol: token.tokenName
              ? sanitizeString(token.tokenName, 100)
              : null,
            quoteTokenAddress: token.quoteToken || null,
            quoteTokenSymbol: 'WETH', // Default for most tokens
            // Store only the matched pair data for future use
            rawData: JSON.stringify(liquidityData.rawPairData),
          };

          await DexscreenerHistoricalDataModel.insertHistoricalData(
            historicalData
          );

          logger.info(
            `[DexScreenerService] Saved historical data for pool ${address} on chain ${chain}`
          );
        } catch (histError) {
          logger.error(
            `[DexScreenerService] Error saving historical data for pool ${address}: ${histError.message}`
          );
          // Continue with the next token even if saving historical data fails
        }

        logger.info(
          `[DexScreenerService] Updated token ID ${id} with liquidityUsd=${liquidityData.liquidityUsd}, pooledQuote=${liquidityData.pooledQuote}`
        );

        updatedCount++;
      } catch (error) {
        logger.error(
          `[DexScreenerService] Error updating token ID ${id}: ${error.message}`
        );
        continue;
      }

      // Rate limiting
      await sleep(50);
    }

    logger.info(
      `[DexScreenerService] Completed liquidity updates for ${updatedCount} tokens.`
    );
    return updatedCount;
  } catch (err) {
    logger.error(`[DexScreenerService] Error: ${err.message}`, err);
    throw err;
  }
}

/**
 * Fetch token profiles from DexScreener API.
 * @param {string} chainId - The blockchain network (e.g., 'base', 'ethereum').
 * @returns {Promise<Array>} - Array of token profiles
 */
async function fetchTokenProfiles(chainId) {
  try {
    logger.info(
      `[DexScreenerService] Fetching token profiles for chain: ${chainId}`
    );

    const url = `${DEXSCREENER_PROFILES_URL}?chainId=${chainId}`;

    const data = await fetchWithRateLimitHandling(url);

    if (!data || !Array.isArray(data)) {
      logger.info(
        `[DexScreenerService] No token profiles found for chain: ${chainId}`
      );
      return [];
    }

    // Filter the profiles by chainId
    const filteredData = data.filter((profile) => profile.chainId === chainId);

    logger.info(
      `[DexScreenerService] Found ${data.length} token profiles, ${filteredData.length} for chain: ${chainId}`
    );
    return filteredData;
  } catch (error) {
    logger.error(
      `[DexScreenerService] Error fetching token profiles for chain ${chainId}: ${error.message}`
    );
    return [];
  }
}

/**
 * Fetch token boosts from DexScreener API.
 * @param {string} chainId - The blockchain network (e.g., 'base', 'ethereum').
 * @returns {Promise<Array>} - Array of token boosts
 */
async function fetchTokenBoosts(chainId) {
  try {
    logger.info(
      `[DexScreenerService] Fetching token boosts for chain: ${chainId}`
    );

    const url = `${DEXSCREENER_BOOSTS_URL}?chainId=${chainId}`;

    const data = await fetchWithRateLimitHandling(url);

    if (!data || !Array.isArray(data)) {
      logger.info(
        `[DexScreenerService] No token boosts found for chain: ${chainId}`
      );
      return [];
    }

    // Filter the boosts by chainId
    const filteredData = data.filter((boost) => boost.chainId === chainId);

    logger.info(
      `[DexScreenerService] Found ${data.length} token boosts, ${filteredData.length} for chain: ${chainId}`
    );
    return filteredData;
  } catch (error) {
    logger.error(
      `[DexScreenerService] Error fetching token boosts for chain ${chainId}: ${error.message}`
    );
    return [];
  }
}

/**
 * Process and save token profiles and boosts data.
 * This function fetches both profiles and boosts for a given chain,
 * then processes and saves the data to the database.
 * @param {string} chainId - The blockchain network (e.g., 'base', 'ethereum').
 * @returns {Promise<Object>} - Object containing counts of processed items
 */
async function fetchAndSaveTokenProfilesAndBoosts(chainId = 'base') {
  try {
    logger.info(
      `[DexScreenerService] Starting fetch and save of token profiles and boosts for chain: ${chainId}`
    );

    // Fetch both profiles and boosts
    const profiles = await fetchTokenProfiles(chainId);
    const boosts = await fetchTokenBoosts(chainId);

    console.log('profiles:', profiles);
    console.log('boosts:', boosts);

    let profilesSaved = 0;
    let boostsSaved = 0;

    // Process and save profiles
    for (const profile of profiles) {
      try {
        if (!profile.tokenAddress) {
          logger.info(
            `[DexScreenerService] Skipping profile without tokenAddress`
          );
          continue;
        }

        // Check if token exists in database
        const exists = await TokenModel.existsByAddress(
          chainId,
          profile.tokenAddress
        );

        if (exists) {
          // Update existing token - search by combination of chain + address
          const tokens = await db(TokenModel.tableName).where({
            chain: chainId,
            address: profile.tokenAddress,
          });
          if (tokens && tokens.length > 0) {
            const token = tokens[0];

            await TokenModel.updateToken(token.id, {
              otherData: JSON.stringify(profile),
              dexscreenerLastCheck: new Date(),
            });

            profilesSaved++;
            logger.info(
              `[DexScreenerService] Updated token profile for ${profile.tokenAddress}`
            );
          }
        } else {
          // Find the best pool for this token
          const bestPool = await findBestPoolForToken(
            profile.tokenAddress,
            chainId
          );

          if (!bestPool) {
            logger.info(
              `[DexScreenerService] No suitable pool found for token ${profile.tokenAddress}, skipping`
            );
            continue;
          }

          // Create new token record with pool data
          const record = {
            chain: chainId,
            address: bestPool.address, // Pool address
            watch: true, // Mark as watched since it has a profile
            recommendX: 0.5,
            otherData: JSON.stringify(profile),
            liquidityUsd: bestPool.liquidityUsd,
            tokenName: profile.description
              ? sanitizeString(profile.description, 100)
              : sanitizeString(bestPool.tokenName, 100),
            poolCreatedAt: bestPool.poolCreatedAt,
            baseToken: profile.tokenAddress, // Token address
            quoteToken: bestPool.quoteToken,
            poolType: bestPool.poolType,
            poolVersion: bestPool.poolVersion,
            dexscreenerLastCheck: new Date(),
          };

          await TokenModel.upsertToken(record);
          profilesSaved++;
          logger.info(
            `[DexScreenerService] Created new token from profile: ${profile.tokenAddress}`
          );
        }

        // Rate limiting
        await sleep(50);
      } catch (error) {
        logger.error(
          `[DexScreenerService] Error processing profile for token ${profile.tokenAddress}: ${error.message}`
        );
        continue;
      }
    }

    // Process and save boosts
    for (const boost of boosts) {
      try {
        if (!boost.tokenAddress) {
          logger.info(
            `[DexScreenerService] Skipping boost without tokenAddress`
          );
          continue;
        }

        // Check if token exists in database
        const exists = await TokenModel.existsByAddress(
          chainId,
          boost.tokenAddress
        );

        if (exists) {
          // Update existing token - search by combination of chain + address
          const tokens = await db(TokenModel.tableName).where({
            chain: chainId,
            baseToken: boost.tokenAddress,
          });
          if (tokens && tokens.length > 0) {
            const token = tokens[0];

            await TokenModel.updateToken(token.id, {
              otherData: JSON.stringify(boost),
              dexscreenerLastCheck: new Date(),
            });

            boostsSaved++;
            logger.info(
              `[DexScreenerService] Updated token boost for ${boost.tokenAddress}`
            );
          }
        } else {
          // Find the best pool for this token
          const bestPool = await findBestPoolForToken(
            boost.tokenAddress,
            chainId
          );

          if (!bestPool) {
            logger.info(
              `[DexScreenerService] No suitable pool found for token ${boost.tokenAddress}, skipping`
            );
            continue;
          }

          // Create new token record with pool data
          const record = {
            chain: chainId,
            address: bestPool.address, // Pool address
            watch: true,
            recommendX: 0.5,
            otherData: JSON.stringify(boost),
            liquidityUsd: bestPool.liquidityUsd,
            tokenName: boost.description
              ? sanitizeString(boost.description, 100)
              : sanitizeString(bestPool.tokenName, 100),
            poolCreatedAt: bestPool.poolCreatedAt,
            baseToken: boost.tokenAddress, // Token address
            quoteToken: bestPool.quoteToken,
            poolType: bestPool.poolType,
            poolVersion: bestPool.poolVersion,
            dexscreenerLastCheck: new Date(),
          };

          await TokenModel.upsertToken(record);
          boostsSaved++;
          logger.info(
            `[DexScreenerService] Created new token from boost: ${boost.tokenAddress}`
          );
        }

        // Rate limiting
        await sleep(50);
      } catch (error) {
        logger.error(
          `[DexScreenerService] Error processing boost for token ${boost.tokenAddress}: ${error.message}`
        );
        continue;
      }
    }

    logger.info(
      `[DexScreenerService] Completed processing. Saved ${profilesSaved} profiles and ${boostsSaved} boosts.`
    );

    return {
      profilesSaved,
      boostsSaved,
      total: profilesSaved + boostsSaved,
    };
  } catch (error) {
    logger.error(
      `[DexScreenerService] Error in fetchAndSaveTokenProfilesAndBoosts: ${error.message}`
    );
    throw error;
  }
}

/**
 * Find the best pool (highest liquidity with WETH as quote token) for a given token address
 * @param {string} tokenAddress - The token address to find pools for
 * @param {string} chainId - The blockchain network (e.g., 'base', 'ethereum')
 * @returns {Promise<Object|null>} - The best pool or null if none found
 */
async function findBestPoolForToken(tokenAddress, chainId) {
  try {
    logger.info(
      `[DexScreenerService] Finding best pool for token: ${tokenAddress} on chain: ${chainId}`
    );

    const url = `${DEXSCREENER_BASE_URL}/${tokenAddress.toLowerCase()}`;
    const normalizedChainId = chainId === 'eth' ? 'ethereum' : chainId;

    const response = await withRetry(
      async () => {
        return await axios.get(url);
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
      }
    );

    const pairs = response.data.pairs;

    if (!pairs || pairs.length === 0) {
      logger.info(
        `[DexScreenerService] No pairs found for token address: ${tokenAddress}`
      );
      return null;
    }

    // Filter pairs by chain, and by quote token only if we have a known mapping for that chain
    const validPairs = pairs.filter((pair) => {
      const sameChain =
        pair.chainId.toLowerCase() === normalizedChainId.toLowerCase();
      const mappedQuote = VALID_QUOTE_TOKENS[normalizedChainId];
      if (!sameChain) return false;
      if (!mappedQuote) return true; // No strict quote filter for this chain (e.g., solana)
      return (
        pair.quoteToken &&
        pair.quoteToken.address &&
        pair.quoteToken.address.toLowerCase() === mappedQuote.toLowerCase()
      );
    });

    if (validPairs.length === 0) {
      logger.info(
        `[DexScreenerService] No pairs with WETH as quote token found for: ${tokenAddress}`
      );
      return null;
    }

    // Sort by liquidity (highest first)
    validPairs.sort((a, b) => {
      const liquidityA = parseFloat(a.liquidity.usd) || 0;
      const liquidityB = parseFloat(b.liquidity.usd) || 0;
      return liquidityB - liquidityA;
    });

    // Return the pair with highest liquidity
    const bestPair = validPairs[0];

    logger.info(
      `[DexScreenerService] Found best pool for ${tokenAddress}: ${bestPair.pairAddress} with liquidity $${bestPair.liquidity.usd}`
    );

    return {
      address: bestPair.pairAddress,
      baseToken: tokenAddress,
      quoteToken: bestPair.quoteToken.address,
      liquidityUsd: parseFloat(bestPair.liquidity.usd) || 0,
      pooledQuote: parseFloat(bestPair.liquidity.quote) || 0,
      priceUsd: parseFloat(bestPair.priceUsd) || 0,
      tokenName: sanitizeString(bestPair.baseToken.name || 'Unknown', 100),
      poolType: bestPair.dexId || null,
      poolVersion: null, // DexScreener doesn't provide version info directly
      poolCreatedAt: new Date(), // DexScreener doesn't provide creation date
    };
  } catch (error) {
    logger.error(
      `[DexScreenerService] Error finding best pool for ${tokenAddress}: ${error.message}`
    );
    return null;
  }
}

/**
 * Fetch historical data for a specific token
 * @param {string} chain - The blockchain network
 * @param {string} poolAddress - The pool address
 * @param {number} limit - Maximum number of records to return
 * @param {number} offset - Number of records to skip
 * @returns {Promise<Array>} - Array of historical data records
 */
async function fetchHistoricalDataForToken(
  chain,
  poolAddress,
  limit = 100,
  offset = 0
) {
  try {
    logger.info(
      `[DexScreenerService] Fetching historical data for pool: ${poolAddress} on chain: ${chain}`
    );

    const data = await DexscreenerHistoricalDataModel.findHistoricalDataForPool(
      chain,
      poolAddress,
      limit,
      offset
    );

    // Process each record to parse rawData and include it in the response
    const processedData = data.map((record) => {
      // Create a copy of the record
      const processedRecord = { ...record };

      // If rawData exists and is a string, parse it and include its fields
      if (
        processedRecord.rawData &&
        typeof processedRecord.rawData === 'string'
      ) {
        try {
          // Parse the rawData JSON string
          const parsedRawData = JSON.parse(processedRecord.rawData);

          // Include the parsed rawData in the response
          processedRecord.rawData = parsedRawData;
        } catch (parseError) {
          logger.error(
            `[DexScreenerService] Error parsing rawData for pool ${poolAddress}: ${parseError.message}`
          );
          // Keep the original rawData if parsing fails
        }
      }

      return processedRecord;
    });

    // Sort data by timestamp in ascending order for charting
    processedData.sort((a, b) => a.timestamp - b.timestamp);

    return processedData;
  } catch (error) {
    logger.error(
      `[DexScreenerService] Error fetching historical data for pool ${poolAddress}: ${error.message}`
    );
    return [];
  }
}

module.exports = {
  updateLiquidityForWatchedTokens,
  fetchLiquidity,
  validatePriceUsd,
  DEPLETED_POOL_THRESHOLD,
  fetchTokenProfiles,
  fetchTokenBoosts,
  fetchAndSaveTokenProfilesAndBoosts,
  findBestPoolForToken,
  fetchWithRateLimitHandling,
  fetchHistoricalDataForToken,
  sanitizeString,
};
