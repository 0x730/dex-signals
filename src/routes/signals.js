// routes/signals.js

const express = require('express');
const router = express.Router();
const TokenModel = require('../models/TokenModel');
const {
  getPaperTradingPortfolio,
  resetPaperTrading,
} = require('../services/trackingService');
const { getChainIconUrl } = require('../utils/chainIcons');
const { requireManagerAuth } = require('../middleware/managerAuth');
const axios = require('axios');
require('dotenv').config();

const score = parseInt(process.env.LOCAL_SCORE_THRESHOLD, 10) || 35;

// Middleware to parse query parameters for pagination
const parsePagination = (req, res, next) => {
  let { limit, offset } = req.query;

  limit = parseInt(limit, 10);
  offset = parseInt(offset, 10);

  // Set default values if not provided or invalid
  req.pagination = {
    limit: !isNaN(limit) && limit > 0 ? limit : 100,
    offset: !isNaN(offset) && offset >= 0 ? offset : 0,
  };

  next();
};

/**
 * GET /signals
 * Retrieves tokens with score >= 20, ordered by createdAt ascending.
 * Supports pagination through query parameters: limit and offset.
 */
router.get('/', parsePagination, async (req, res) => {
  const { limit, offset } = req.pagination;

  try {
    const signals = await TokenModel.findHighScoreSignals(limit, offset);

    const signalsWithIcons = signals.map((s) => ({
      ...s,
      chainIconUrl: getChainIconUrl(s.chain),
    }));

    res.status(200).json({
      success: true,
      data: signalsWithIcons,
      pagination: {
        limit,
        offset,
        returned: signalsWithIcons.length,
      },
    });
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching signals.',
    });
  }
});

/**
 * GET /signals/paper-trading
 * Retrieves the paper trading portfolio with performance metrics.
 */
router.get('/paper-trading', async (req, res) => {
  try {
    const portfolio = await getPaperTradingPortfolio();

    res.status(200).json({
      success: true,
      data: portfolio,
    });
  } catch (error) {
    console.error('Error fetching paper trading portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching paper trading portfolio.',
    });
  }
});

/**
 * GET /signals/paper-trading-signals
 * Retrieves paper trading tokens in the same format as regular signals.
 * No pagination - returns all tokens.
 */
router.get('/paper-trading-signals', async (req, res) => {
  try {
    // Get all paper traded tokens
    const paperTradedTokens = await TokenModel.findPaperTradedTokens();

    // Format the tokens according to the specified structure
    const formattedTokens = paperTradedTokens.map((token) => {
      // Generate timestamp
      const timestamp = token.paperInvestmentDate
        ? new Date(token.paperInvestmentDate).getTime()
        : Date.now();

      // Extract part of the address for the ID (first 7 characters after 0x)
      const addressPart = token.address.substring(2, 9);

      // Create unique ID by combining timestamp and address part
      const uniqueId = `0x730_${token.address}`;
      const chainOut = token.chain === 'eth' ? 'ethereum' : token.chain;

      return {
        id: uniqueId,
        chain: chainOut,
        chainIconUrl: getChainIconUrl(chainOut),
        address: token.baseToken,
        poolAddress: token.address,
        action: 'BUY',
        slippagePercent: 5,
        amount: 0.0004,
        watch: 1,
        watch_mode: 'usd',
        recommendX: 100,
        timestamp: timestamp / 1000,
        score: token.score || 0,
      };
    });

    res.status(200).json(formattedTokens);
  } catch (error) {
    console.error('Error fetching paper trading signals:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching paper trading signals.',
    });
  }
});

/**
 * GET /signals/paper-trading-signals
 * Retrieves paper trading tokens in the same format as regular signals.
 * No pagination - returns all tokens.
 */
router.get('/paper-trading-signals-local', async (req, res) => {
  try {
    // Get all paper traded tokens
    const paperTradedTokens = await TokenModel.findPaperTradedTokens();

    // Format the tokens according to the specified structure
    const formattedTokens = paperTradedTokens
      .map((token) => {
        const timestamp = token.paperInvestmentDate
          ? new Date(token.paperInvestmentDate).getTime()
          : Date.now();

        if (token.score >= score) {
          // Create unique ID by combining timestamp and address part
          const uniqueId = `0x730_${token.address}`;
          const chainOut = token.chain === 'eth' ? 'ethereum' : token.chain;

          return {
            id: uniqueId,
            chain: chainOut,
            chainIconUrl: getChainIconUrl(chainOut),
            address: token.baseToken,
            poolAddress: token.address,
            action: 'BUY',
            slippagePercent: 5,
            amount: 0.0004,
            watch: 1,
            watch_mode: 'usd',
            recommendX: 100,
            timestamp: timestamp / 1000,
            score: token.score || 0,
          };
        } else {
          return false;
        }
      })
      .filter((token) => token !== false);

    res.status(200).json(formattedTokens);
  } catch (error) {
    console.error('Error fetching paper trading signals:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching paper trading signals.',
    });
  }
});

/**
 * POST /signals/paper-trading/reset
 * Resets all paper trading data and restores the initial budget.
 */
async function handlePaperTradingReset(req, res) {
  try {
    const resetCount = await resetPaperTrading();

    res.status(200).json({
      success: true,
      message: `Paper trading reset successful. ${resetCount} positions were cleared.`,
      data: {
        resetCount,
      },
    });
  } catch (error) {
    console.error('Error resetting paper trading:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting paper trading.',
    });
  }
}

router.post('/paper-trading/reset', requireManagerAuth, async (req, res) => {
  return await handlePaperTradingReset(req, res);
});

/**
 * GET /signals/paper-trading-signals-external
 * Fetches paper trading signals from the external API.
 * Excludes Arbitrum tokens as the system is not yet ready for them.
 */
router.get('/paper-trading-signals-external', async (req, res) => {
  try {
    const externalSignalsUrl = process.env.EXTERNAL_PAPER_TRADING_SIGNALS_URL;
    if (!externalSignalsUrl) {
      return res.status(503).json({
        success: false,
        message: 'External paper trading signals URL is not configured.',
      });
    }

    const response = await axios.get(externalSignalsUrl);
    // Filter out Arbitrum tokens
    const filteredData = response.data.filter(
      (signal) => signal.chain !== 'arbitrum'
    );
    res.status(200).json(filteredData);
  } catch (error) {
    console.error('Error fetching external paper trading signals:', error);
    res.status(500).json({
      success: false,
      message:
        'An error occurred while fetching external paper trading signals.',
    });
  }
});

/**
 * GET /signals/paper-trading-signals-with-names
 * Retrieves paper trading tokens from the local database with token names.
 * This endpoint is used by the paper trading page.
 */
router.get('/paper-trading-signals-with-names', async (req, res) => {
  try {
    // Get all paper traded tokens from the database
    const paperTradedTokens = await TokenModel.findPaperTradedTokens();

    // Format the tokens according to the specified structure
    const formattedTokens = paperTradedTokens.map((token) => {
      // Generate timestamp
      const timestamp = token.paperInvestmentDate
        ? new Date(token.paperInvestmentDate).getTime() / 1000
        : Math.floor(Date.now() / 1000);

      // Create unique ID by combining timestamp and address part
      const uniqueId = `0x730_${token.address}`;

      return {
        id: uniqueId,
        chain: token.chain === 'eth' ? 'ethereum' : token.chain,
        address: token.baseToken,
        poolAddress: token.address,
        action: 'BUY',
        slippagePercent: 5,
        amount: token.paperInvestmentAmount || 0,
        watch: 1,
        watch_mode: 'usd',
        recommendX: 100,
        timestamp: timestamp,
        score: token.score || 0,
        tokenName: token.tokenName || 'Unknown',
        paperCurrentValue: token.paperCurrentValue,
        paperProfitLoss: token.paperProfitLoss,
        paperProfitLossPercent: token.paperProfitLossPercent,
        tokenId: token.id, // Add the token's database ID
      };
    });

    res.status(200).json(formattedTokens);
  } catch (error) {
    console.error('Error fetching paper trading signals with names:', error);
    res.status(500).json({
      success: false,
      message:
        'An error occurred while fetching paper trading signals with names.',
    });
  }
});

/**
 * Helper function to handle paper trading view requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handlePaperTradingView(req, res) {
  try {
    // Get all paper traded tokens from the database
    const paperTradedTokens = await TokenModel.findPaperTradedTokens();

    // Format the tokens according to the specified structure
    const formattedTokens = paperTradedTokens.map((token) => {
      // Generate timestamp
      const timestamp = token.paperInvestmentDate
        ? new Date(token.paperInvestmentDate).getTime() / 1000
        : Math.floor(Date.now() / 1000);

      // Create unique ID by combining timestamp and address part
      const uniqueId = `0x730_${token.address}`;

      return {
        id: uniqueId,
        chain: token.chain === 'eth' ? 'ethereum' : token.chain,
        address: token.baseToken,
        poolAddress: token.address,
        action: 'BUY',
        slippagePercent: 5,
        amount: token.paperInvestmentAmount || 0,
        watch: 1,
        watch_mode: 'usd',
        recommendX: 100,
        timestamp: timestamp,
        score: token.score || 0,
        tokenName: token.tokenName || 'Unknown',
        paperCurrentValue: token.paperCurrentValue,
        paperProfitLoss: token.paperProfitLoss,
        paperProfitLossPercent: token.paperProfitLossPercent,
        tokenId: token.id, // Add the token's database ID
      };
    });

    res.status(200).json(formattedTokens);
  } catch (error) {
    console.error('Error serving paper trading view:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while serving paper trading view.',
    });
  }
}

/**
 * GET /signals/paper-trading-view
 * Returns paper trading signals data for the React frontend.
 * Uses local database data instead of external API.
 */
router.get('/paper-trading-view', async (req, res) => {
  return await handlePaperTradingView(req, res);
});

/**
 * GET /signals/paper
 * Simplified route for paper trading view.
 * Returns paper trading signals data for the React frontend.
 */
router.get('/paper', async (req, res) => {
  return await handlePaperTradingView(req, res);
});

/**
 * GET /signals/paper/reset
 * Simplified route for resetting paper trading.
 * Resets all paper trading data and restores the initial budget.
 */
router.post('/paper/reset', requireManagerAuth, async (req, res) => {
  return await handlePaperTradingReset(req, res);
});

module.exports = router;
