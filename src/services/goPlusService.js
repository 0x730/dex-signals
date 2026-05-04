/**
 * GoPlus Service
 *
 * This service handles fetching and analyzing token data using the GoPlus API.
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');
const TokenModel = require('../models/TokenModel');
const { withRetry, sleep } = require('../utils/baseWorker');

// API Config
const GOPLUS_BASE_URL = 'https://api.gopluslabs.io/api/v1/token_security';

/**
 * Calculate the score based on GoPlus data.
 * @param {Object} data - Parsed result from GoPlus API.
 * @returns {number} Score between 0 and 10.
 */
function calculateScore(data) {
  let score = 10; // Start with the best score

  // Critical security issues (severe penalties)
  if (data.is_blacklisted === '1') score -= 50;
  if (data.is_whitelisted === '1') score -= 30;
  if (data.is_honeypot === '1') score -= 50;
  if (data.honeypot_with_same_creator === '1') score -= 4;
  if (data.selfdestruct === '1') score -= 4;
  if (data.hidden_owner === '1') score -= 4;
  if (data.can_take_back_ownership === '1') score -= 3;
  if (data.external_call === '1') score -= 2;

  // Tax-related penalties
  const buyTax = parseFloat(data.buy_tax) || 0;
  const sellTax = parseFloat(data.sell_tax) || 0;
  const transferTax = parseFloat(data.transfer_tax) || 0;
  const totalTax = buyTax + sellTax + transferTax;

  if (totalTax > 20) score -= 10;
  else if (totalTax > 10) score -= 5;
  else if (totalTax > 5) score -= 1;

  // Ownership concentration
  const creatorPercent = parseFloat(data.creator_percent) || 0;
  if (creatorPercent > 20) score -= 3;
  else if (creatorPercent > 10) score -= 2;
  else if (creatorPercent > 5) score -= 1;

  // Holder concentration analysis
  if (data.holders && Array.isArray(data.holders)) {
    // Calculate the percentage owned by top 10 holders
    let top10HoldersPercent = 0;
    const topHolders = data.holders.slice(0, 10);

    for (const holder of topHolders) {
      top10HoldersPercent += parseFloat(holder.percent) || 0;
    }

    // Penalize high concentration
    if (top10HoldersPercent > 80) score -= 3;
    else if (top10HoldersPercent > 60) score -= 2;
    else if (top10HoldersPercent > 40) score -= 1;

    // Check for locked tokens (positive factor)
    const hasLockedTokens = topHolders.some((holder) => holder.is_locked === 1);
    if (hasLockedTokens) score += 1;
  }

  // Liquidity analysis
  if (data.dex && Array.isArray(data.dex) && data.dex.length > 0) {
    // Having liquidity is positive
    score += 1;

    // Multiple DEXes is a positive sign
    if (data.dex.length > 1) score += 0.5;
  }

  // LP holder analysis
  if (data.lp_holders && Array.isArray(data.lp_holders)) {
    // Check for locked LP tokens (positive factor)
    const hasLockedLP = data.lp_holders.some(
      (holder) => holder.is_locked === 1
    );
    if (hasLockedLP) score += 1;
  }

  // Other positive factors
  if (data.is_open_source === '1') score += 1;
  else {
    score -= 15;
  }

  // Other negative factors
  if (data.is_mintable === '1') score -= 1;
  if (data.is_proxy === '1') score -= 0.5;
  if (data.is_anti_whale === '1') score -= 0.5;
  if (data.trading_cooldown === '1') score -= 0.5;
  if (data.transfer_pausable === '1') score -= 0.5;
  if (data.cannot_sell_all === '1') score -= 1;
  if (data.cannot_buy === '1') score -= 1;
  if (data.slippage_modifiable === '1') score -= 0.5;
  if (data.personal_slippage_modifiable === '1') score -= 0.5;

  // Ensure the score is within the valid range (0 to 10)
  return Math.max(0, Math.min(10, score));
}

/**
 * Map chain name to GoPlus chain ID.
 * @param {string} chainId - Chain name (e.g., 'base', 'ethereum', 'bsc').
 * @returns {number|string|null} GoPlus chain ID or null if not supported.
 */
function mapChainToGoPlusId(chainId) {
  const chainMap = {
    // EVM Chains
    ethereum: 1,
    eth: 1,
    bsc: 56,
    arbitrum: 42161,
    polygon: 137,
    solana: 'solana',
    opbnb: 204,
    zksync: 324,
    'zksync era': 324,
    linea: 59144,
    base: 8453,
    mantle: 5000,
    scroll: 534352,
    optimism: 10,
    avalanche: 43114,
    fantom: 250,
    cronos: 25,
    heco: 128,
    gnosis: 100,
    tron: 'tron',
    kcc: 321,
    fon: 201022,
    zkfair: 42766,
    soneium: 1868,
    story: 1514,
    sonic: 146,
    abstract: 2741,
    hashkey: 177,
    berachain: 80094,
    monad: 10143,
    world: 480,
    'world chain': 480,
    morph: 2818,
    gravity: 1625,
    mint: 185,
    zircuit: 48899,
    xlayer: 196,
    'x layer': 196,
    zklink: 810180,
    'zklink nova': 810180,
    bitlayer: 200901,
    merlin: 4200,
    manta: 169,
    'manta pacific': 169,
    blast: 81457,
  };

  return chainMap[chainId.toLowerCase()] || null;
}

/**
 * Fetch GoPlus data for a token.
 * @param {string} chainId - Chain ID (e.g., 'base', 'ethereum', 'bsc').
 * @param {string} contractAddress - Token contract address.
 * @returns {Object} Parsed result and calculated score.
 */
async function fetchGoPlusData(chainId, contractAddress) {
  // Skip GoPlus for Solana tokens
  if (chainId && chainId.toLowerCase() === 'solana') {
    logger.info(`Skipping GoPlus for Solana token ${contractAddress}`);
    return { info: null, score: null };
  }

  const chain = mapChainToGoPlusId(chainId);

  if (!chain) {
    logger.warn(`Unsupported chain: ${chainId}`);
    return { info: null, score: null };
  }

  const url = `${GOPLUS_BASE_URL}/${chain}?contract_addresses=${contractAddress}`;
  logger.info(`Fetching GoPlus data: ${url}`);

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

    const result =
      response.data.result?.[contractAddress.toLowerCase()] || null;

    if (!result) {
      logger.warn(`No GoPlus data for ${contractAddress} on chain ${chainId}`);
      return { info: null, score: null };
    }

    // Calculate the score
    const score = calculateScore(result);
    logger.info(`GoPlus score for ${contractAddress}: ${score}`);

    return { info: result, score };
  } catch (error) {
    logger.error(
      `Error fetching GoPlus data for ${contractAddress} on chain ${chainId}: ${error.message}`
    );
    return { info: null, score: null };
  }
}

/**
 * Update tokens with GoPlus data.
 *
 * @param {number} limit - Maximum number of tokens to process
 * @returns {number} - Number of tokens successfully processed
 */
async function updateTokensWithGoPlusData(limit = 50) {
  logger.info('[GoPlusService] Fetching watched tokens for GoPlus analysis...');

  try {
    const tokens = await TokenModel.findTokensForGoPlusAnalysis(limit);

    if (!tokens.length) {
      logger.info('[GoPlusService] No tokens to analyze at this time.');
      return 0;
    }

    logger.info(`[GoPlusService] Found ${tokens.length} tokens to analyze.`);

    let processedCount = 0;

    for (const token of tokens) {
      const { id, address, baseToken, chain } = token;

      // Skip Solana tokens for GoPlus processing
      if (chain && chain.toLowerCase() === 'solana') {
        logger.info(
          `[GoPlusService] Skipping Solana token ID ${id} (${baseToken})`
        );
        await sleep(100); // tiny delay to be gentle on loop pacing
        continue;
      }

      try {
        const { info, score } = await fetchGoPlusData(chain, baseToken);

        if (info) {
          await TokenModel.updateGoPlusResult(id, info, score);
          logger.info(
            `[GoPlusService] Updated token ID ${id} with score=${score}`
          );
          processedCount++;
        }
      } catch (error) {
        logger.error(
          `[GoPlusService] Error updating token ID ${id}: ${error.message}`
        );
      }

      // Rate limiting to avoid overloading the API
      await sleep(500); // 0.5 second delay between requests
    }

    logger.info(
      `[GoPlusService] Completed GoPlus analysis. Processed ${processedCount} tokens.`
    );
    return processedCount;
  } catch (error) {
    logger.error(`[GoPlusService] Error: ${error.message}`);
    throw error;
  }
}

module.exports = {
  updateTokensWithGoPlusData,
  fetchGoPlusData,
  calculateScore,
};
