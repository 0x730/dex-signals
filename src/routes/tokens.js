const express = require('express');
const router = express.Router();
const TokenModel = require('../models/TokenModel');
const logger = require('../utils/logger');
const path = require('path');
const { getChainIconUrl } = require('../utils/chainIcons');
const {
  fetchHistoricalDataForToken,
} = require('../services/dexscreenerService');

// Middleware to parse query parameters for pagination and filtering
const parseQueryParams = (req, res, next) => {
  let { limit, offset, chain, search, highScoreFilter, minScore } = req.query;

  // Validate and sanitize limit and offset
  limit = parseInt(limit, 10);
  offset = parseInt(offset, 10);

  // Set default values if not provided or invalid
  req.pagination = {
    limit: !isNaN(limit) && limit > 0 && limit <= 500 ? limit : 100, // Add upper limit for security
    offset: !isNaN(offset) && offset >= 0 ? offset : 0,
  };

  // Validate and normalize chain parameter
  const validChains = [
    'base',
    'ethereum',
    'arbitrum',
    'eth',
    'polygon',
    'bsc',
    'solana',
    'linea',
  ];
  let normalizedChain = null;
  if (chain) {
    const lc = chain.toLowerCase();
    if (!validChains.includes(lc)) {
      logger.warn(`Invalid chain parameter: ${chain}`);
    } else {
      // Normalize 'ethereum' -> 'eth' to match how it's stored on chain
      normalizedChain = lc === 'ethereum' ? 'eth' : lc;
    }
  }

  // Sanitize search parameter to prevent SQL injection
  if (search) {
    // Remove any potentially harmful characters
    search = search.replace(/[;'"\\]/g, '');

    // Limit search length for security
    if (search.length > 100) {
      search = search.substring(0, 100);
      logger.warn(`Search parameter truncated to 100 characters`);
    }
  }

  // Validate highScoreFilter parameter
  if (highScoreFilter && !['null', 'withValue'].includes(highScoreFilter)) {
    highScoreFilter = null; // Reset to null if invalid
    logger.warn(`Invalid highScoreFilter parameter: ${highScoreFilter}`);
  }

  // Validate and parse minScore parameter
  minScore = parseFloat(minScore);
  if (isNaN(minScore)) {
    minScore = null;
  }

  // Set filters if provided
  req.filter = {
    chain: normalizedChain,
    search: search || null,
    highScoreFilter: highScoreFilter || null,
    minScore: minScore,
  };

  next();
};

/**
 * GET /tokens
 * Retrieves tokens sorted by highScoreReachedAt and score in descending order.
 * Supports pagination through query parameters: limit and offset.
 * Supports filtering by chain through query parameter: chain.
 * Supports searching by token name or address through query parameter: search.
 * Returns JSON data for the React frontend.
 */
router.get('/', parseQueryParams, async (req, res) => {
  const { limit, offset } = req.pagination;
  const { chain, search, highScoreFilter, minScore } = req.filter;

  try {
    // Create a query to fetch tokens
    let query = TokenModel.findTokensByHighScore(
      limit,
      offset,
      chain,
      search,
      highScoreFilter,
      minScore
    );
    const tokens = await query;

    // Enhance tokens with chainIconUrl for UI display
    const tokensWithIcons = tokens.map((t) => ({
      ...t,
      chainIconUrl: getChainIconUrl(t.chain),
      chainIcon: getChainIconUrl(t.chain),
    }));

    // Return JSON response
    res.status(200).json({
      success: true,
      data: tokensWithIcons,
      pagination: {
        limit,
        offset,
        returned: tokensWithIcons.length,
      },
      filter: {
        chain,
        search,
        highScoreFilter,
        minScore,
      },
    });
  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching tokens.',
    });
  }
});

/**
 * GET /tokens/api
 * API endpoint for fetching tokens data.
 * Used by the frontend to get data for the table.
 * Supports searching by token name or address through query parameter: search.
 */
router.get('/api', parseQueryParams, async (req, res) => {
  const { limit, offset } = req.pagination;
  const { chain, search, highScoreFilter, minScore } = req.filter;

  try {
    // Create a query to fetch tokens
    let query = TokenModel.findTokensByHighScore(
      limit,
      offset,
      chain,
      search,
      highScoreFilter,
      minScore
    );
    const tokens = await query;

    // Enhance tokens with chainIconUrl for UI display
    const tokensWithIcons = tokens.map((t) => ({
      ...t,
      chainIconUrl: getChainIconUrl(t.chain),
      chainIcon: getChainIconUrl(t.chain),
    }));

    // Return JSON response
    res.status(200).json({
      success: true,
      data: tokensWithIcons,
      pagination: {
        limit,
        offset,
        returned: tokensWithIcons.length,
      },
      filter: {
        chain,
        search,
        highScoreFilter,
        minScore,
      },
    });
  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching tokens.',
    });
  }
});

/**
 * GET /tokens/historical-data
 * Retrieves historical data for a specific asset based on chain, address, and poolAddress.
 * Supports pagination through query parameters: limit and offset.
 *
 * @param {string} chain - The blockchain network (e.g., base, ethereum)
 * @param {string} address - The base token address
 * @param {string} poolAddress - The pool address
 * @param {number} limit - Maximum number of records to return (default: 100)
 * @param {number} offset - Number of records to skip (default: 0)
 * @returns {Array} - Array of historical data records
 */
// Return aggregated counts by chain with icon URLs for use by the webapp filter bar
// Example response: [{ chain: 'base', displayName: 'Base', count: 42, iconUrl: 'https://...' }]
router.get('/chains', parseQueryParams, async (req, res) => {
  try {
    const validChains = [
      'eth',
      'base',
      'arbitrum',
      'polygon',
      'bsc',
      'solana',
      'linea',
    ];
    const displayNames = {
      eth: 'Ethereum',
      base: 'Base',
      arbitrum: 'Arbitrum',
      polygon: 'Polygon',
      bsc: 'BSC',
      solana: 'Solana',
      linea: 'Linea',
    };

    const counts = await TokenModel.getCountsByChain(req.filter);
    const countsMap = counts.reduce((acc, { chain, count }) => {
      acc[chain] = count;
      return acc;
    }, {});

    const data = validChains.map((c) => ({
      chain: c,
      displayName: displayNames[c] || c,
      count: countsMap[c] || 0,
      iconUrl: getChainIconUrl(c),
      icon: getChainIconUrl(c),
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching counts by chain:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching counts by chain.',
    });
  }
});

router.get('/historical-data', async (req, res) => {
  const { chain, address, poolAddress, limit, offset } = req.query;

  // Validate required parameters
  if (!chain || !poolAddress) {
    return res.status(400).json({
      success: false,
      message:
        'Missing required parameters: chain and poolAddress are required',
    });
  }

  // Validate chain parameter
  const validChains = [
    'base',
    'ethereum',
    'arbitrum',
    'eth',
    'polygon',
    'bsc',
    'solana',
    'linea',
  ];
  if (!validChains.includes(chain.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message:
        'Invalid chain parameter. Supported chains: base, ethereum, arbitrum, polygon, bsc, solana',
    });
  }

  // Validate poolAddress format: EVM-style for EVM chains; allow base58 for Solana (skip regex here)
  const isEvmChain = [
    'base',
    'ethereum',
    'eth',
    'arbitrum',
    'polygon',
    'bsc',
    'linea',
  ].includes(chain.toLowerCase());
  if (isEvmChain) {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(poolAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid poolAddress format. Must be a valid EVM address',
      });
    }
  }

  try {
    // Parse and validate pagination parameters
    let parsedLimit = parseInt(limit, 10) || 100;
    let parsedOffset = parseInt(offset, 10) || 0;

    // Apply security limits
    if (parsedLimit > 500) {
      parsedLimit = 500;
      logger.warn(`Limit parameter capped at 500 for security`);
    }

    if (parsedOffset < 0) {
      parsedOffset = 0;
    }

    // Fetch historical data
    const historicalData = await fetchHistoricalDataForToken(
      chain,
      poolAddress,
      parsedLimit,
      parsedOffset
    );

    // Return the data
    res.status(200).json({
      success: true,
      data: historicalData,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        returned: historicalData.length,
      },
    });
  } catch (error) {
    logger.error(`Error fetching historical data: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching historical data.',
    });
  }
});

/**
 * GET /tokens/:id
 * Retrieves a single token by ID or address and returns JSON data.
 * First tries to find by ID, then by address if no token is found.
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    let tokens = [];

    // First try to fetch the token by ID (if id is a number)
    if (!isNaN(parseInt(id))) {
      tokens = await TokenModel.findTokensById(parseInt(id));
    }

    // If no token found by ID, try to fetch by address
    if (tokens.length === 0) {
      tokens = await TokenModel.findTokensByAddress(id);
    }

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Token not found',
      });
    }

    const token = tokens[0];

    // Return JSON response
    res.status(200).json({
      success: true,
      data: token,
    });
  } catch (error) {
    logger.error('Error fetching token:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the token.',
    });
  }
});

/**
 * GET /tokens/:id/historical-data
 * Retrieves historical data for a specific token
 * First tries to find token by ID, then by address if no token is found.
 * Results are ordered from newest to oldest.
 * Default limit is 20 entries when no pagination is specified.
 */
router.get('/:id/historical-data', async (req, res) => {
  const { id } = req.params;
  let { limit = 20, offset = 0 } = req.query;

  // Validate id parameter
  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Token ID or address is required',
    });
  }

  // Sanitize id parameter if it's an address
  let sanitizedId = id;
  if (typeof id === 'string' && id.startsWith('0x')) {
    // Check if it's a valid Ethereum address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address format. Must be a valid Ethereum address',
      });
    }
  }

  // Parse and validate pagination parameters
  limit = parseInt(limit, 10) || 20;
  offset = parseInt(offset, 10) || 0;

  // Apply security limits
  if (limit > 500) {
    limit = 500;
    logger.warn(`Limit parameter capped at 500 for security`);
  }

  if (offset < 0) {
    offset = 0;
  }

  try {
    let tokens = [];

    // First try to fetch the token by ID (if id is a number)
    if (!isNaN(parseInt(sanitizedId))) {
      tokens = await TokenModel.findTokensById(parseInt(sanitizedId));
    }

    // If no token found by ID, try to fetch by address
    if (tokens.length === 0) {
      tokens = await TokenModel.findTokensByAddress(sanitizedId);
    }

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Token not found',
      });
    }

    const token = tokens[0];
    const { chain, address: poolAddress } = token;

    // Fetch historical data for the token
    const historicalData = await fetchHistoricalDataForToken(
      chain,
      poolAddress,
      limit, // Already parsed and validated
      offset // Already parsed and validated
    );

    // Return the historical data
    return res.json({
      success: true,
      data: historicalData,
    });
  } catch (error) {
    logger.error(
      `Error fetching historical data for token ${id}: ${error.message}`
    );
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching historical data.',
    });
  }
});

module.exports = router;
