/**
 * Tracking Service
 *
 * This service handles tracking tokens with high scores and managing paper trading.
 */

require('dotenv').config();
const logger = require('../utils/logger');
const TokenModel = require('../models/TokenModel');

// Configuration
const PAPER_TRADING_BUDGET = 100000; // $100,000 USD for paper trading
const SCORE_THRESHOLD = parseFloat(process.env.SCORE_THRESHOLD) || 0;
const SIGNIFICANT_SCORE_INCREASE = 150; // Threshold for considering a score increase as too big
const MAX_TIME_SINCE_HIGH_SCORE_MS = 1 * 60 * 60 * 1000; // 1 hour - maximum time since high score
const PAPER_TRADING_MIN_AGE_DAYS =
  parseFloat(process.env.PAPER_TRADING_MIN_AGE_DAYS) || 3;

// Track available budget for paper trading
let availableBudget = PAPER_TRADING_BUDGET;

/**
 * Track a token that has reached a high score.
 * Records the current price and schedules checks for future price points.
 *
 * @param {Object} token - The token object
 * @param {number} score - The current score
 * @returns {Promise<void>}
 */
async function trackHighScoreToken(token, score) {
  try {
    // Consider for paper trading (score threshold already checked in scoreService)
    if (!token.paperTraded) {
      await considerForPaperTrading(token, score);
    }

    // If token already has highScoreReachedAt, it's already being tracked
    if (token.highScoreReachedAt) {
      logger.info(
        `[TrackingService] Token ID ${token.id} is already being tracked since ${token.highScoreReachedAt}`
      );
      return;
    }

    // Get current price from token
    const currentPrice = token.priceUsd;
    if (!currentPrice) {
      logger.warn(
        `[TrackingService] Cannot track token ID ${token.id} - no price data available`
      );
      return;
    }

    // Skip if price is zero (which can happen when pool is depleted)
    if (currentPrice === 0) {
      logger.warn(
        `[TrackingService] Cannot track token ID ${token.id} - price is 0, which may indicate a depleted pool`
      );
      return;
    }

    logger.info(
      `[TrackingService] Starting to track token ID ${token.id} with score ${score} at price $${currentPrice}`
    );

    // Record the high score time, price, and initial score
    await TokenModel.updateToken(token.id, {
      highScoreReachedAt: new Date(),
      priceAtHighScore: currentPrice,
      initialHighScore: score, // Store the initial high score for comparison later
    });

    // Schedule price checks at different intervals
    scheduleTokenPriceCheck(token.id, '5m', 5 * 60 * 1000);
    scheduleTokenPriceCheck(token.id, '15m', 15 * 60 * 1000);
    scheduleTokenPriceCheck(token.id, '1h', 60 * 60 * 1000);
    scheduleTokenPriceCheck(token.id, '24h', 24 * 60 * 60 * 1000);

    // Consider for paper trading (score threshold already checked in scoreService)
    considerForPaperTrading(token, score);
  } catch (error) {
    logger.error(
      `[TrackingService] Error tracking high score token: ${error.message}`,
      error
    );
  }
}

/**
 * Schedule a check for token price after a specified delay.
 *
 * @param {number} tokenId - The token ID
 * @param {string} interval - The interval name ('5m', '15m', '1h', '24h')
 * @param {number} delayMs - The delay in milliseconds
 */
function scheduleTokenPriceCheck(tokenId, interval, delayMs) {
  setTimeout(async () => {
    try {
      // Get the latest token data
      const tokens = await TokenModel.findTokensById(tokenId);
      if (!tokens || tokens.length === 0) {
        logger.warn(
          `[TrackingService] Token ID ${tokenId} not found for ${interval} price check`
        );
        return;
      }

      const token = tokens[0];
      const currentPrice = token.priceUsd;

      if (!currentPrice) {
        logger.warn(
          `[TrackingService] No price data available for token ID ${tokenId} at ${interval} check`
        );
        return;
      }

      // Check if price is zero (which can happen when pool is depleted)
      if (currentPrice === 0) {
        logger.warn(
          `[TrackingService] Token ID ${tokenId} has a price of 0 at ${interval} check, which may indicate a depleted pool. Skipping update.`
        );
        return;
      }

      // Update the appropriate price column based on the interval
      const updateData = {};
      switch (interval) {
        case '5m':
          updateData.priceAfter5m = currentPrice;
          break;
        case '15m':
          updateData.priceAfter15m = currentPrice;
          break;
        case '1h':
          updateData.priceAfter1h = currentPrice;
          break;
        case '24h':
          updateData.priceAfter24h = currentPrice;
          break;
      }

      await TokenModel.updateToken(tokenId, updateData);

      // Calculate and log price change
      const priceChange =
        ((currentPrice - token.priceAtHighScore) / token.priceAtHighScore) *
        100;
      logger.info(
        `[TrackingService] ${interval} price check for token ID ${tokenId}: $${currentPrice} (${priceChange.toFixed(2)}% change)`
      );

      // Update paper trading values if this token was traded
      if (token.paperTraded) {
        await updatePaperTradingValues(token);
      }
    } catch (error) {
      logger.error(
        `[TrackingService] Error in ${interval} price check for token ID ${tokenId}: ${error.message}`,
        error
      );
    }
  }, delayMs);
}

/**
 * Consider a token for paper trading based on its score.
 *
 * @param {Object} token - The token object
 * @param {number} score - The current score
 */
async function considerForPaperTrading(token, score) {
  try {
    // Check if token is old enough for paper trading
    if (PAPER_TRADING_MIN_AGE_DAYS > 0) {
      const tokenCreatedAt = token.createdAt || token.updatedAt;
      if (tokenCreatedAt) {
        const ageInMs = Date.now() - new Date(tokenCreatedAt).getTime();
        const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

        if (ageInDays < PAPER_TRADING_MIN_AGE_DAYS) {
          logger.info(
            `[TrackingService] Token ID ${token.id} (${token.tokenName || token.address}) is only ${ageInDays.toFixed(2)} days old (minimum: ${PAPER_TRADING_MIN_AGE_DAYS} days). Skipping paper trade.`
          );
          return;
        }
      } else {
        logger.warn(
          `[TrackingService] Token ID ${token.id} has no createdAt/updatedAt. Skipping paper trade due to age requirement.`
        );
        return;
      }
    }

    // Skip if no price data
    if (!token.priceUsd) {
      logger.warn(
        `[TrackingService] Cannot paper trade token ID ${token.id} - no price data available`
      );
      return;
    }

    // Skip if price is zero (which can happen when pool is depleted)
    if (token.priceUsd === 0) {
      logger.warn(
        `[TrackingService] Cannot paper trade token ID ${token.id} - price is 0, which may indicate a depleted pool`
      );
      return;
    }

    // Skip tokens with very high initial scores (to avoid tokens already at peak)
    // Increased threshold to allow more tokens to be considered
    if (token.initialHighScore >= SCORE_THRESHOLD + 100) {
      logger.info(
        `[TrackingService] Token ID ${token.id} has a very high initial score (${token.initialHighScore}). Skipping paper trade.`
      );
      return;
    }

    // Check if too much time has passed since the token reached a high score
    if (token.highScoreReachedAt) {
      const timeSinceHighScore =
        Date.now() - new Date(token.highScoreReachedAt).getTime();

      // Calculate when the token became eligible for paper trading
      let timeSinceEligible = timeSinceHighScore;
      if (PAPER_TRADING_MIN_AGE_DAYS > 0) {
        const tokenCreatedAt = token.createdAt || token.updatedAt;
        if (tokenCreatedAt) {
          const eligibilityTime =
            new Date(tokenCreatedAt).getTime() +
            PAPER_TRADING_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
          timeSinceEligible = Date.now() - eligibilityTime;
        }
      }

      // Log time since high score and eligibility for debugging
      const minutesSinceHighScore = Math.round(timeSinceHighScore / 60000);
      const minutesSinceEligible = Math.round(timeSinceEligible / 60000);
      logger.info(
        `[TrackingService] Token ID ${token.id} time since: high score ${minutesSinceHighScore}m, eligibility ${minutesSinceEligible}m (threshold: ${Math.round(MAX_TIME_SINCE_HIGH_SCORE_MS / 60000)}m)`
      );

      // Use the smaller of the two times to check against threshold
      // This allows tokens that just became eligible to be traded even if they hit high score long ago
      const effectiveTimeSinceThreshold = Math.min(
        timeSinceHighScore,
        timeSinceEligible
      );

      if (effectiveTimeSinceThreshold > MAX_TIME_SINCE_HIGH_SCORE_MS) {
        logger.info(
          `[TrackingService] Token ID ${token.id} reached high score too long ago (${minutesSinceHighScore} minutes) and was eligible too long ago (${minutesSinceEligible} minutes). Skipping paper trade.`
        );
        return;
      }

      // For new tokens, check if the score has increased too rapidly since reaching high score
      if (!token.paperTraded && token.priceAtHighScore) {
        const initialScore = token.initialHighScore || 0; // Use 0 if initialHighScore is not recorded
        const scoreIncrease = score - initialScore;

        // Log all score increases for debugging
        logger.info(
          `[TrackingService] Token ID ${token.id} score increase: ${scoreIncrease} (from ${initialScore} to ${score})`
        );

        if (scoreIncrease > SIGNIFICANT_SCORE_INCREASE) {
          logger.info(
            `[TrackingService] Token ID ${token.id} has a very big score increase (${scoreIncrease}) since initial tracking. Skipping new entry to avoid chasing.`
          );
          return;
        }
      }
    }

    // Check if token is already paper traded
    if (token.paperTraded) {
      // Only allow re-entry if the new score is higher than before
      if (token.score && score <= token.score) {
        logger.info(
          `[TrackingService] Token ID ${token.id} already paper traded with score ${token.score}. New score ${score} is not higher, skipping.`
        );
        return;
      }

      // Check for significant score increase
      if (token.score && score - token.score > SIGNIFICANT_SCORE_INCREASE) {
        logger.info(
          `[TrackingService] Token ID ${token.id} has a very big score increase (${score - token.score}). Skipping re-entry to avoid chasing.`
        );
        return;
      }

      logger.info(
        `[TrackingService] Token ID ${token.id} already paper traded, but new score ${score} is higher than previous ${token.score}. Considering re-entry.`
      );
    }

    // Determine investment amount based on score tier
    let newInvestmentAmount = 0;
    if (score >= 70) {
      // EXCELLENT
      newInvestmentAmount = 100; // $100 per excellent opportunity
    } else if (score >= 30) {
      // GOOD
      newInvestmentAmount = 50; // $50 per good opportunity
    } else {
      newInvestmentAmount = 25; // $25 per moderate opportunity
    }

    // Handle re-entry case
    if (token.paperTraded) {
      const currentInvestmentAmount = parseFloat(
        token.paperInvestmentAmount || 0
      );

      // If new investment amount is less than or equal to current, don't re-enter
      if (newInvestmentAmount <= currentInvestmentAmount) {
        logger.info(
          `[TrackingService] New investment amount ($${newInvestmentAmount}) is not higher than current ($${currentInvestmentAmount}) for token ID ${token.id}, skipping re-entry.`
        );
        return;
      }

      // Calculate additional investment needed
      const additionalInvestment =
        newInvestmentAmount - currentInvestmentAmount;

      // Check if we have enough budget for the additional investment
      if (additionalInvestment > availableBudget) {
        logger.info(
          `[TrackingService] Not enough budget for additional investment in token ID ${token.id}. Needed: $${additionalInvestment}, Available: $${availableBudget}`
        );
        return;
      }

      // Calculate additional tokens we can buy at current price
      const additionalTokens = additionalInvestment / token.priceUsd;
      const newTotalTokens =
        parseFloat(token.paperTokensOwned || 0) + additionalTokens;

      // Calculate new average entry price
      const newEntryPrice =
        (currentInvestmentAmount + additionalInvestment) / newTotalTokens;

      // Update the paper trade with additional investment
      await TokenModel.updateToken(token.id, {
        paperInvestmentAmount: newInvestmentAmount,
        paperEntryPrice: newEntryPrice,
        paperTokensOwned: newTotalTokens,
        paperCurrentValue: newInvestmentAmount, // Reset to new investment amount
        paperProfitLoss: 0,
        paperProfitLossPercent: 0,
        score: score, // Store the new score
        watch: true, // Ensure the token is watched to keep price updated
      });

      // Update available budget
      availableBudget -= additionalInvestment;

      logger.info(
        `[TrackingService] Added $${additionalInvestment} to paper trade for token ID ${token.id}. New total: $${newInvestmentAmount}, Total tokens: ${newTotalTokens}, New avg entry price: $${newEntryPrice}. Remaining budget: $${availableBudget}`
      );
    } else {
      // Check if we have enough budget
      if (newInvestmentAmount > availableBudget) {
        logger.info(
          `[TrackingService] Not enough budget for paper trading token ID ${token.id}. Needed: $${newInvestmentAmount}, Available: $${availableBudget}`
        );
        return;
      }

      // Calculate number of tokens we can buy
      let tokensOwned = 0;
      if (token.priceUsd > 0) {
        tokensOwned = newInvestmentAmount / token.priceUsd;
      } else {
        logger.warn(
          `[TrackingService] Cannot calculate tokens owned for token ID ${token.id} - price is 0`
        );
        return; // Exit the function if price is zero to avoid invalid calculations
      }

      // Record the paper trade
      await TokenModel.updateToken(token.id, {
        paperTraded: true,
        paperInvestmentAmount: newInvestmentAmount,
        paperInvestmentDate: new Date(),
        paperEntryPrice: token.priceUsd,
        paperTokensOwned: tokensOwned,
        paperCurrentValue: newInvestmentAmount, // Initially equal to investment
        paperProfitLoss: 0,
        paperProfitLossPercent: 0,
        score: score, // Store the score
        watch: true, // Ensure the token is watched to keep price updated
      });

      // Update available budget
      availableBudget -= newInvestmentAmount;

      logger.info(
        `[TrackingService] Paper traded token ID ${token.id} with $${newInvestmentAmount}. Bought ${tokensOwned} tokens at $${token.priceUsd}. Remaining budget: $${availableBudget}`
      );
    }
  } catch (error) {
    logger.error(
      `[TrackingService] Error in paper trading consideration: ${error.message}`,
      error
    );
  }
}

/**
 * Update paper trading values for a token based on current price.
 *
 * @param {Object} token - The token object
 * @returns {Promise<boolean>} - True if update was successful, false otherwise
 */
async function updatePaperTradingValues(token) {
  try {
    // Check if this is a paper traded token
    if (!token.paperTraded) {
      logger.info(
        `[TrackingService] Token ID ${token.id} is not paper traded, skipping update`
      );
      return false;
    }

    // Check if we have the necessary data
    if (!token.paperTokensOwned) {
      logger.warn(
        `[TrackingService] Token ID ${token.id} is marked as paper traded but has no tokens owned value`
      );
      return false;
    }

    // If price is missing, try to fetch the latest token data
    if (!token.priceUsd) {
      logger.warn(
        `[TrackingService] Token ID ${token.id} has no price data, attempting to fetch latest data`
      );

      // Get the latest token data
      const tokens = await TokenModel.findTokensById(token.id);
      if (!tokens || tokens.length === 0) {
        logger.warn(`[TrackingService] Could not find token ID ${token.id}`);
        return false;
      }

      // Update our token object with the latest data
      token = tokens[0];

      // Check if we now have price data
      if (!token.priceUsd) {
        logger.warn(
          `[TrackingService] Still no price data available for token ID ${token.id} after refresh`
        );
        return false;
      }
    }

    // Check if price is zero (which can happen when pool is depleted)
    if (token.priceUsd === 0) {
      logger.warn(
        `[TrackingService] Token ID ${token.id} has a price of 0, which may indicate a depleted pool. Skipping update to avoid incorrect calculations.`
      );
      return false;
    }

    // Calculate current value
    const currentValue = token.paperTokensOwned * token.priceUsd;

    // Calculate profit/loss
    const profitLoss = currentValue - token.paperInvestmentAmount;
    const profitLossPercent = (profitLoss / token.paperInvestmentAmount) * 100;

    // Update token with new values
    await TokenModel.updateToken(token.id, {
      paperCurrentValue: currentValue,
      paperProfitLoss: profitLoss,
      paperProfitLossPercent: profitLossPercent,
    });

    logger.info(
      `[TrackingService] Updated paper trading values for token ID ${token.id}. Current value: $${currentValue.toFixed(2)}, P/L: $${profitLoss.toFixed(2)} (${profitLossPercent.toFixed(2)}%)`
    );
    return true;
  } catch (error) {
    logger.error(
      `[TrackingService] Error updating paper trading values for token ID ${token?.id}: ${error.message}`,
      error
    );
    return false;
  }
}

/**
 * Get paper trading portfolio summary.
 *
 * @returns {Promise<Object>} Portfolio summary
 */
async function getPaperTradingPortfolio() {
  try {
    // Get all paper traded tokens
    const tokens = await TokenModel.findPaperTradedTokens();

    let totalInvested = 0;
    let totalCurrentValue = 0;
    let totalProfitLoss = 0;

    const positions = tokens.map((token) => {
      totalInvested += parseFloat(token.paperInvestmentAmount || 0);
      totalCurrentValue += parseFloat(token.paperCurrentValue || 0);
      totalProfitLoss += parseFloat(token.paperProfitLoss || 0);

      return {
        id: token.id,
        symbol: token.tokenName,
        investmentAmount: token.paperInvestmentAmount,
        investmentDate: token.paperInvestmentDate,
        entryPrice: token.paperEntryPrice,
        currentPrice: token.priceUsd,
        tokensOwned: token.paperTokensOwned,
        currentValue: token.paperCurrentValue,
        profitLoss: token.paperProfitLoss,
        profitLossPercent: token.paperProfitLossPercent,
      };
    });

    const totalProfitLossPercent =
      totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

    return {
      availableBudget,
      totalInvested,
      totalCurrentValue,
      totalProfitLoss,
      totalProfitLossPercent,
      positions,
    };
  } catch (error) {
    logger.error(
      `[TrackingService] Error getting paper trading portfolio: ${error.message}`,
      error
    );
    return {
      availableBudget,
      totalInvested: 0,
      totalCurrentValue: 0,
      totalProfitLoss: 0,
      totalProfitLossPercent: 0,
      positions: [],
    };
  }
}

/**
 * Reset paper trading - clear all paper trading data and reset budget.
 *
 * @returns {Promise<number>} - Number of tokens reset
 */
async function resetPaperTrading() {
  try {
    // Get all paper traded tokens
    const tokens = await TokenModel.findPaperTradedTokens();

    if (tokens.length === 0) {
      logger.info('[TrackingService] No paper traded tokens found to reset');
      return 0;
    }

    let resetCount = 0;

    // Reset each token's paper trading values
    for (const token of tokens) {
      await TokenModel.updateToken(token.id, {
        paperTraded: false,
        paperInvestmentAmount: null,
        paperInvestmentDate: null,
        paperEntryPrice: null,
        paperTokensOwned: null,
        paperCurrentValue: null,
        paperProfitLoss: null,
        paperProfitLossPercent: null,
        initialHighScore: null,
      });
      resetCount++;
    }

    // Reset available budget
    availableBudget = PAPER_TRADING_BUDGET;

    logger.info(
      `[TrackingService] Reset paper trading for ${resetCount} tokens. Budget reset to $${PAPER_TRADING_BUDGET}`
    );
    return resetCount;
  } catch (error) {
    logger.error(
      `[TrackingService] Error resetting paper trading: ${error.message}`,
      error
    );
    throw error;
  }
}

/**
 * Ensure all paper traded tokens have their watch flag set to true.
 * This is a one-time fix for existing paper traded tokens.
 *
 * @returns {Promise<number>} - Number of tokens updated
 */
async function ensurePaperTradedTokensAreWatched() {
  try {
    // Get all paper traded tokens
    const tokens = await TokenModel.findPaperTradedTokens();

    if (tokens.length === 0) {
      logger.info(
        '[TrackingService] No paper traded tokens found to update watch status'
      );
      return 0;
    }

    let updatedCount = 0;

    // Update each token's watch flag if needed
    for (const token of tokens) {
      if (!token.watch) {
        await TokenModel.updateToken(token.id, { watch: true });
        updatedCount++;
        logger.info(
          `[TrackingService] Updated watch flag for paper traded token ID ${token.id} (${token.tokenName || 'unknown'})`
        );
      }
    }

    if (updatedCount > 0) {
      logger.info(
        `[TrackingService] Updated watch flag for ${updatedCount} paper traded tokens`
      );
    } else {
      logger.info(
        '[TrackingService] All paper traded tokens already have watch=true'
      );
    }

    return updatedCount;
  } catch (error) {
    logger.error(
      `[TrackingService] Error ensuring paper traded tokens are watched: ${error.message}`,
      error
    );
    return 0;
  }
}

module.exports = {
  trackHighScoreToken,
  updatePaperTradingValues,
  getPaperTradingPortfolio,
  resetPaperTrading,
  ensurePaperTradedTokensAreWatched,
  SCORE_THRESHOLD,
};
