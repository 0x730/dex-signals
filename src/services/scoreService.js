/**
 * Score Service
 *
 * This service handles calculating and updating scores for tokens.
 */

require('dotenv').config();
const logger = require('../utils/logger');
const TokenModel = require('../models/TokenModel');
const {
  trackHighScoreToken,
  SCORE_THRESHOLD: TRACKING_THRESHOLD,
} = require('./trackingService');

// Configuration from .env
const SCORE_THRESHOLD = parseFloat(process.env.SCORE_THRESHOLD) || 0;

// Define scoring tiers for clearer decision making
const SCORING_TIERS = {
  EXCELLENT: 70, // Excellent investment opportunity (increased from 50 to match new scoring weights)
  GOOD: 30, // Good investment opportunity (increased from 20 to match new scoring weights)
  MODERATE: 0, // Moderate potential, watch closely
  POOR: -20, // Poor investment, not recommended (decreased from -10 to be more selective)
};

/**
 * Calculate the score based on the provided criteria, optimized for identifying tokens good for fast trading.
 *
 * Score interpretation:
 * - Score >= 70: EXCELLENT investment opportunity (highest confidence)
 * - Score >= 30: GOOD investment opportunity (recommended for investment)
 * - Score >= 0: MODERATE potential (worth watching but not immediate investment)
 * - Score < 0: POOR investment (not recommended)
 *
 * Good entry points typically have:
 * 1. High liquidity (>= $70,000 or pooledQuote >= 10)
 * 2. Good trading volume (24h volume > $50,000)
 * 3. Active recent trading (h1Sells > 10)
 * 4. No security red flags (not a honeypot, not blacklisted)
 * 5. Low taxes (combined buy/sell tax < 10%)
 * 6. Low creator percentage (< 10%)
 *
 * @param {number} gtScore - GoPlus Trust score
 * @param {number} liquidityUsd - Liquidity in USD
 * @param {number} pooledQuote - Pooled quote amount
 * @param {number} h1Sells - Number of sells in the last hour
 * @param {number} h24Sells - Number of sells in the last 24 hours
 * @param {number} h1Volume - Volume in the last hour
 * @param {number} h24Volume - Volume in the last 24 hours
 * @param {Object} goplusInfo - Detailed GoPlus information
 * @returns {number} total score
 */
function calculateScore(
  gtScore,
  liquidityUsd,
  pooledQuote,
  h1Sells,
  h24Sells,
  h1Volume,
  h24Volume,
  goplusInfo,
  chain
) {
  let score = 0;
  let securityScore = 0,
    liquidityScore = 0,
    tradingScore = 0,
    goplusScore = 0;

  // Validate inputs
  if (gtScore === null || gtScore === undefined || isNaN(parseFloat(gtScore))) {
    logger.warn(`Invalid gtScore, applying penalty: ${gtScore}`);
    score -= 10;
  }
  if (
    liquidityUsd === null ||
    liquidityUsd === undefined ||
    isNaN(parseFloat(liquidityUsd))
  ) {
    logger.warn(`Invalid liquidityUsd, applying penalty, ${liquidityUsd}`);
    score -= 20;
  }

  // === GeckoTerminal Score (Global Score) ===
  if (
    gtScore !== null &&
    gtScore !== undefined &&
    !isNaN(parseFloat(gtScore))
  ) {
    const gtScoreNum = parseFloat(gtScore);
    if (gtScoreNum > 55) score += 25;
    else if (gtScoreNum > 35) score += 15;
    else if (gtScoreNum > 15) score += 8;
    else if (gtScoreNum > 5) score += 3;
    else score -= 10;
  }

  // === Liquidity Metrics ===
  // Focus more on pooledQuote than liquidityUsd as USD value can be inaccurate
  if (
    pooledQuote !== null &&
    pooledQuote !== undefined &&
    !isNaN(parseFloat(pooledQuote))
  ) {
    const pooledQuoteNum = parseFloat(pooledQuote);
    if (pooledQuoteNum >= 50) liquidityScore += 40;
    else if (pooledQuoteNum >= 40) liquidityScore += 35;
    else if (pooledQuoteNum >= 30) liquidityScore += 30;
    else if (pooledQuoteNum >= 20) liquidityScore += 25;
    else if (pooledQuoteNum >= 10) liquidityScore += 15;
    else if (pooledQuoteNum >= 5) liquidityScore += 10;
    else if (pooledQuoteNum >= 2) liquidityScore += 7;
    else if (pooledQuoteNum < 1) liquidityScore -= 50;
  }

  // Still consider liquidityUsd but with less weight
  if (
    liquidityUsd !== null &&
    liquidityUsd !== undefined &&
    !isNaN(parseFloat(liquidityUsd))
  ) {
    const liquidityUsdNum = parseFloat(liquidityUsd);
    if (liquidityUsdNum >= 500000) liquidityScore += 20;
    else if (liquidityUsdNum >= 250000) liquidityScore += 17;
    else if (liquidityUsdNum >= 150000) liquidityScore += 15;
    else if (liquidityUsdNum >= 70000) liquidityScore += 12;
    else if (liquidityUsdNum >= 30000) liquidityScore += 8;
    else if (liquidityUsdNum >= 10000) liquidityScore += 5;
    else if (liquidityUsdNum < 5000) liquidityScore -= 20;
  }

  // === Trading Activity Metrics ===
  if (
    h24Sells !== null &&
    h24Sells !== undefined &&
    !isNaN(parseFloat(h24Sells))
  ) {
    const h24SellsNum = parseFloat(h24Sells);
    if (h24SellsNum > 100) tradingScore += 15;
    else if (h24SellsNum > 50) tradingScore += 10;
    else if (h24SellsNum > 20) tradingScore += 5;
    else if (h24SellsNum < 10) tradingScore -= 7;
  }

  if (
    h1Sells !== null &&
    h1Sells !== undefined &&
    !isNaN(parseFloat(h1Sells))
  ) {
    const h1SellsNum = parseFloat(h1Sells);
    if (h1SellsNum > 100) tradingScore += 25;
    else if (h1SellsNum > 30) tradingScore += 20;
    else if (h1SellsNum > 10) tradingScore += 10;
    else if (h1SellsNum > 5) tradingScore += 5;
    else tradingScore -= 25;
  }

  if (
    h24Volume !== undefined &&
    h24Volume !== null &&
    !isNaN(parseFloat(h24Volume))
  ) {
    const h24VolumeNum = parseFloat(h24Volume);
    if (h24VolumeNum > 500000) tradingScore += 40;
    else if (h24VolumeNum > 250000) tradingScore += 35;
    else if (h24VolumeNum > 100000) tradingScore += 30;
    else if (h24VolumeNum > 50000) tradingScore += 20;
    else if (h24VolumeNum > 20000) tradingScore += 10;
    else if (h24VolumeNum > 1000) tradingScore += 5;
    else if (h24VolumeNum < 1000) tradingScore -= 10;
  }

  if (
    h1Volume !== undefined &&
    h1Volume !== null &&
    !isNaN(parseFloat(h1Volume))
  ) {
    const h1VolumeNum = parseFloat(h1Volume);
    if (h1VolumeNum > 5000) tradingScore += 30;
    else if (h1VolumeNum > 2500) tradingScore += 25;
    else if (h1VolumeNum > 1000) tradingScore += 20;
    else if (h1VolumeNum > 500) tradingScore += 10;
    else if (h1VolumeNum > 100) tradingScore += 5;
    else if (h1VolumeNum < 10) tradingScore -= 5;
  }

  if (
    h24Volume !== undefined &&
    h24Volume !== null &&
    !isNaN(parseFloat(h24Volume)) &&
    liquidityUsd !== undefined &&
    liquidityUsd !== null &&
    !isNaN(parseFloat(liquidityUsd)) &&
    parseFloat(liquidityUsd) > 0
  ) {
    const h24VolumeNum = parseFloat(h24Volume);
    const liquidityUsdNum = parseFloat(liquidityUsd);
    const volumeToLiquidityRatio = h24VolumeNum / liquidityUsdNum;
    if (volumeToLiquidityRatio > 2) tradingScore += 30;
    else if (volumeToLiquidityRatio > 1) tradingScore += 20;
    else if (volumeToLiquidityRatio > 0.5) tradingScore += 10;
    else if (volumeToLiquidityRatio < 0.1) tradingScore -= 10;
  }

  // === Security Data (GoPlus used for non-Solana only) ===
  if (chain && chain.toLowerCase() === 'solana') {
    // Keep neutral for Solana
    goplusScore = 0;
  } else if (goplusInfo) {
    try {
      const parsedInfo =
        typeof goplusInfo === 'string' ? JSON.parse(goplusInfo) : goplusInfo;
      if (parsedInfo) {
        if (parsedInfo.is_honeypot === '1') goplusScore -= 100;
        else goplusScore += 15;
        if (parsedInfo.is_blacklisted === '1') goplusScore -= 30;
        else goplusScore += 10;
        if (parsedInfo.is_whitelisted === '1') goplusScore -= 30;

        // Safely parse numeric values from GoPlus data
        let buyTax = 0;
        if (parsedInfo.buy_tax !== undefined && parsedInfo.buy_tax !== null) {
          buyTax = !isNaN(parseFloat(parsedInfo.buy_tax))
            ? parseFloat(parsedInfo.buy_tax)
            : 0;
        }

        let sellTax = 0;
        if (parsedInfo.sell_tax !== undefined && parsedInfo.sell_tax !== null) {
          sellTax = !isNaN(parseFloat(parsedInfo.sell_tax))
            ? parseFloat(parsedInfo.sell_tax)
            : 0;
        }

        const combinedTax = buyTax + sellTax;
        if (combinedTax > 20) goplusScore -= 25;
        else if (combinedTax > 10) goplusScore -= 15;
        else if (combinedTax > 5) goplusScore -= 5;
        else if (combinedTax < 2) goplusScore += 20;
        else if (combinedTax < 5) goplusScore += 15;
        else if (combinedTax < 10) goplusScore += 10;

        let creatorPercent = 0;
        if (
          parsedInfo.creator_percent !== undefined &&
          parsedInfo.creator_percent !== null
        ) {
          creatorPercent = !isNaN(parseFloat(parsedInfo.creator_percent))
            ? parseFloat(parsedInfo.creator_percent)
            : 0;
        }

        if (creatorPercent > 50) goplusScore -= 15;
        else if (creatorPercent > 20) goplusScore -= 8;
        else if (creatorPercent > 10) goplusScore -= 3;
        else if (creatorPercent < 5) goplusScore += 10;
        else if (creatorPercent < 10) goplusScore += 5;
      }
    } catch (error) {
      logger.warn(`Error parsing goplusInfo: ${error.message}`);
      goplusScore -= 5; // Apply a small penalty for unparsable GoPlus data
    }
  } else if (!chain || chain.toLowerCase() !== 'solana') {
    // For non-Solana tokens, apply a moderate penalty for missing GoPlus data
    goplusScore -= 10;
  } else {
    goplusScore = 0; // Neutral for Solana
  }

  securityScore = goplusScore;

  score = score + securityScore + liquidityScore + tradingScore;

  // Clamp score to -150 to +150 range
  score = Math.max(-150, Math.min(150, score));

  // Good entry point check - simplified to rely primarily on score tiers
  // The tiers themselves should say enough about the token's potential
  const h1SellsNum =
    h1Sells !== null && h1Sells !== undefined && !isNaN(parseFloat(h1Sells))
      ? parseFloat(h1Sells)
      : 0;
  const pooledQuoteNum =
    pooledQuote !== null &&
    pooledQuote !== undefined &&
    !isNaN(parseFloat(pooledQuote))
      ? parseFloat(pooledQuote)
      : 0;
  const isGoodEntryPoint =
    score >= SCORING_TIERS.GOOD ||
    (score >= SCORING_TIERS.MODERATE && h1SellsNum > 5 && pooledQuoteNum >= 2);

  // Detailed logging
  logger.info(
    `Score breakdown: Security=${securityScore}, Liquidity=${liquidityScore}, Trading=${tradingScore}, GeckoTerminal=${gtScore || 0}, Total=${score}`
  );
  if (isGoodEntryPoint) {
    logger.info(`Token meets GOOD ENTRY POINT criteria with score ${score}`);
    const liquidityUsdDisplay =
      liquidityUsd !== null &&
      liquidityUsd !== undefined &&
      !isNaN(parseFloat(liquidityUsd))
        ? parseFloat(liquidityUsd)
        : 'N/A';
    const h24VolumeDisplay =
      h24Volume !== null &&
      h24Volume !== undefined &&
      !isNaN(parseFloat(h24Volume))
        ? parseFloat(h24Volume)
        : 'N/A';
    const h1SellsDisplay =
      h1Sells !== null && h1Sells !== undefined && !isNaN(parseFloat(h1Sells))
        ? parseFloat(h1Sells)
        : 'N/A';
    logger.info(
      `Entry point: Liquidity=$${liquidityUsdDisplay}, 24h Volume=$${h24VolumeDisplay}, 1h Sells=${h1SellsDisplay}`
    );
  }

  return score;
}

/**
 * Calculate and update scores for tokens.
 *
 * @returns {number} - Number of tokens processed
 */
async function calculateAndUpdateScores() {
  logger.info('[ScoreService] Starting score calculation for tokens.');

  // Log scoring tiers for clarity on what constitutes "good scoring"
  logger.info(`[ScoreService] Scoring Tiers: 
    - EXCELLENT (${SCORING_TIERS.EXCELLENT}+ points): Excellent investment opportunity (INVEST)
    - GOOD (${SCORING_TIERS.GOOD}+ points): Good investment opportunity (INVEST)
    - MODERATE (${SCORING_TIERS.MODERATE}+ points): Moderate potential, worth watching (WATCH)
    - POOR (Below ${SCORING_TIERS.MODERATE} points): Poor investment, not recommended (NOINVEST)
  `);

  try {
    // Fetch tokens that have 'dextLastCheck' present and are under watch
    const tokens = await TokenModel.findTokensWithDextLastCheck();

    if (tokens.length === 0) {
      logger.info('[ScoreService] No tokens with dextLastCheck to process.');
      return 0;
    }

    let processedCount = 0;

    for (const token of tokens) {
      const {
        id,
        gtScore,
        liquidityUsd,
        pooledQuote,
        watch,
        h1Sells,
        h24Sells,
        h1Volume,
        h24Volume,
        goplus_info,
      } = token;

      // Calculate new score with enhanced algorithm
      let newScore = calculateScore(
        gtScore,
        liquidityUsd,
        pooledQuote,
        h1Sells,
        h24Sells,
        h1Volume,
        h24Volume,
        goplus_info,
        token.chain
      );

      // Determine investment decision based on score
      let investmentDecision = 'NOINVEST';
      let scoringTier = '';

      if (newScore >= SCORING_TIERS.EXCELLENT) {
        investmentDecision = 'INVEST';
        scoringTier = 'EXCELLENT';
      } else if (newScore >= SCORING_TIERS.GOOD) {
        investmentDecision = 'INVEST';
        scoringTier = 'GOOD';
      } else if (newScore >= SCORING_TIERS.MODERATE) {
        investmentDecision = 'WATCH';
        scoringTier = 'MODERATE';
      } else {
        scoringTier = 'POOR';
      }

      // Log the investment decision with clear visibility
      logger.info(
        `[Token ID ${id}] DECISION: ${investmentDecision} | Score: ${newScore} | Tier: ${scoringTier} | Symbol: ${token.tokenName || 'Unknown'}`
      );

      let newWatchStatus = watch; // Default to current watch status

      if (newScore >= SCORE_THRESHOLD) {
        newWatchStatus = true;
      } else {
        newWatchStatus = false;
      }

      if (newWatchStatus) {
        const hasGoodPotential = newScore >= SCORING_TIERS.MODERATE;

        // Safely parse pooledQuote
        let pooledQuoteNum = 0;
        if (
          pooledQuote !== null &&
          pooledQuote !== undefined &&
          !isNaN(parseFloat(pooledQuote))
        ) {
          pooledQuoteNum = parseFloat(pooledQuote);
        }
        const hasMinimalLiquidity = pooledQuoteNum >= 1;

        // Only stop watching if it has poor potential AND doesn't meet minimal requirements
        if (!hasGoodPotential && !hasMinimalLiquidity) {
          newWatchStatus = false;
        }
      }

      // Simplified risk level determination based directly on score tiers
      // Let the tiers themselves say enough about the token's risk
      let riskLevel = 'HIGH';

      if (newScore >= SCORING_TIERS.EXCELLENT) {
        riskLevel = 'LOW';
      } else if (newScore >= SCORING_TIERS.GOOD) {
        riskLevel = 'MEDIUM';
      } else if (newScore >= SCORING_TIERS.MODERATE) {
        riskLevel = 'MEDIUM_HIGH';
      }

      // Update the token in the database with risk level
      await TokenModel.updateToken(id, {
        score: newScore,
        watch: newWatchStatus,
        riskLevel: riskLevel,
      });

      // Track tokens with high scores for price monitoring and paper trading
      if (newScore >= TRACKING_THRESHOLD) {
        // Pass the full token object with the updated score
        console.log('newScore:', newScore);
        const tokenWithNewScore = { ...token, score: newScore };
        await trackHighScoreToken(tokenWithNewScore, newScore);
      }

      processedCount++;
    }

    logger.info(
      `[ScoreService] Completed score calculations for ${processedCount} tokens.`
    );
    return processedCount;
  } catch (err) {
    logger.error(`[ScoreService] Error: ${err.message}`, err);
    throw err;
  }
}

module.exports = {
  calculateAndUpdateScores,
  calculateScore,
};
