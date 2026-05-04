require('dotenv').config();
const db = require('../db');
const TokenModel = require('../models/TokenModel');
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');

/**
 * Continuous Backfill Worker
 *
 * Every 10 minutes, this worker selects up to 5 tokens that haven't been paper traded
 * and adds them to paper trading.
 */

async function processContinuousBackfill() {
  logger.info('[ContinuousBackfillWorker] Starting full backfill process');

  try {
    const minScore =
      parseFloat(process.env.CONTINUOUS_BACKFILL_MIN_SCORE) || 30;
    const batchSize =
      parseInt(process.env.CONTINUOUS_BACKFILL_BATCH_SIZE, 10) || 5;
    const intervalMinutes =
      parseInt(process.env.CONTINUOUS_BACKFILL_INTERVAL_MINUTES, 10) || 10;
    const chain = process.env.CONTINUOUS_BACKFILL_CHAIN;

    // 1. Query ALL tokens matching criteria
    let query = db('tokens')
      .where('paperTraded', false)
      .where('score', '>=', minScore)
      .where('priceUsd', '>', 0)
      .whereNotNull('priceUsd');

    if (chain) {
      query = query.where('chain', chain);
    }

    // Order by score descending, then by createdAt descending
    const allTokens = await query
      .orderBy('score', 'desc')
      .orderBy('createdAt', 'desc');

    if (allTokens.length === 0) {
      logger.info(
        '[ContinuousBackfillWorker] No new tokens found matching criteria'
      );
      return { processed: 0 };
    }

    logger.info(
      `[ContinuousBackfillWorker] Found total of ${allTokens.length} tokens to process in batches of ${batchSize}`
    );

    let totalProcessed = 0;

    // Process in batches
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);
      logger.info(
        `[ContinuousBackfillWorker] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} tokens)`
      );

      for (const token of batch) {
        // Determine investment amount based on score tier
        let investmentAmount = 0;
        if (token.score >= 70) {
          investmentAmount = 100;
        } else if (token.score >= 30) {
          investmentAmount = 50;
        } else {
          investmentAmount = 25;
        }

        // Check for historical price at high score, otherwise use current
        const useHistorical =
          token.priceAtHighScore && token.highScoreReachedAt;
        const entryPrice = useHistorical
          ? parseFloat(token.priceAtHighScore)
          : token.priceUsd;
        const entryDate = useHistorical
          ? new Date(token.highScoreReachedAt)
          : new Date();

        const tokensOwned = investmentAmount / entryPrice;

        logger.info(
          `[ContinuousBackfillWorker] Processing token ${token.address} (${token.tokenName}): Score ${token.score}, Investment $${investmentAmount}`
        );

        await TokenModel.updateToken(token.id, {
          paperTraded: true,
          paperInvestmentAmount: investmentAmount,
          paperInvestmentDate: entryDate,
          paperEntryPrice: entryPrice,
          paperTokensOwned: tokensOwned,
          paperCurrentValue: tokensOwned * token.priceUsd,
          paperProfitLoss: tokensOwned * token.priceUsd - investmentAmount,
          paperProfitLossPercent:
            ((tokensOwned * token.priceUsd - investmentAmount) /
              investmentAmount) *
            100,
          watch: true, // Ensure it's watched for price updates
        });

        totalProcessed++;
      }

      logger.info(
        `[ContinuousBackfillWorker] Batch completed. Total processed so far: ${totalProcessed}/${allTokens.length}`
      );

      // If there are more tokens to process, wait for the interval
      if (i + batchSize < allTokens.length) {
        logger.info(
          `[ContinuousBackfillWorker] Waiting ${intervalMinutes} minutes before next batch...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, intervalMinutes * 60 * 1000)
        );
      }
    }

    logger.info(
      `[ContinuousBackfillWorker] All ${totalProcessed} tokens processed. Finished.`
    );
    return { processed: totalProcessed };
  } catch (error) {
    logger.error(
      `[ContinuousBackfillWorker] Error during backfill: ${error.message}`,
      error
    );
    return { processed: 0, error: error.message };
  }
}

async function runContinuousBackfillWorker() {
  logger.info(`[ContinuousBackfillWorker] Worker started manually`);

  try {
    await processContinuousBackfill();
  } catch (err) {
    logger.error(`[ContinuousBackfillWorker] Fatal error: ${err.message}`);
  } finally {
    logger.info(`[ContinuousBackfillWorker] Process finished, exiting.`);
    process.exit(0);
  }
}

if (require.main === module) {
  runContinuousBackfillWorker();
}

module.exports = {
  runContinuousBackfillWorker,
  processContinuousBackfill,
};
