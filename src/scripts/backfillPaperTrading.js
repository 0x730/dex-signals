/**
 * Backfill Paper Trading Script
 *
 * This script selects tokens on a specific chain with a score higher than a threshold
 * and adds them to paper trading, even if they were scanned long ago.
 *
 * Usage: node src/scripts/backfillPaperTrading.js <chain> <minScore> [--dry-run]
 */

const db = require('../db');
const TokenModel = require('../models/TokenModel');
const logger = require('../utils/logger');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const chain = process.argv[2];
const minScore = parseFloat(process.argv[3]);

if (!chain || isNaN(minScore)) {
  console.log(
    'Usage: node src/scripts/backfillPaperTrading.js <chain> <minScore> [--dry-run]'
  );
  console.log('Example: node src/scripts/backfillPaperTrading.js base 30');
  process.exit(1);
}

async function backfill() {
  try {
    console.log(
      `Starting backfill for chain: ${chain}, minScore: ${minScore}${DRY_RUN ? ' (DRY RUN)' : ''}`
    );

    // 1. Query tokens matching criteria
    const tokens = await db('tokens')
      .where('chain', chain)
      .where('score', '>=', minScore)
      .where('priceUsd', '>', 0)
      .whereNotNull('priceUsd');

    console.log(`Found ${tokens.length} tokens matching criteria.`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const token of tokens) {
      // Determine investment amount based on score tier (matching trackingService logic)
      let investmentAmount = 0;
      if (token.score >= 70) {
        investmentAmount = 100;
      } else if (token.score >= 30) {
        investmentAmount = 50;
      } else {
        investmentAmount = 25;
      }

      // Check if already paper traded and if we should skip or update
      // For this one-time backfill, we might want to only add new ones or re-invest
      // User said "i want to select for paper trading, but one time"
      // which implies they want to include these tokens in the portfolio now.

      if (token.paperTraded) {
        console.log(`Token ${token.address} already paper traded. Skipping.`);
        skippedCount++;
        continue;
      }

      const useHistorical = token.priceAtHighScore && token.highScoreReachedAt;
      const entryPrice = useHistorical
        ? parseFloat(token.priceAtHighScore)
        : token.priceUsd;
      const entryDate = useHistorical
        ? new Date(token.highScoreReachedAt)
        : new Date();

      const tokensOwned = investmentAmount / entryPrice;

      console.log(`Processing token ${token.address} (${token.tokenName}):`);
      console.log(`  Score: ${token.score}`);
      console.log(
        `  Entry Price: $${entryPrice} ${useHistorical ? '(Historical)' : '(Current)'}`
      );
      console.log(`  Entry Date: ${entryDate.toISOString()}`);
      console.log(`  Investment: $${investmentAmount}`);

      if (!DRY_RUN) {
        await TokenModel.updateToken(token.id, {
          paperTraded: true,
          paperInvestmentAmount: investmentAmount,
          paperInvestmentDate: entryDate,
          paperEntryPrice: entryPrice,
          paperTokensOwned: tokensOwned,
          paperCurrentValue: tokensOwned * token.priceUsd, // Calculate current value based on current price
          paperProfitLoss: tokensOwned * token.priceUsd - investmentAmount,
          paperProfitLossPercent:
            ((tokensOwned * token.priceUsd - investmentAmount) /
              investmentAmount) *
            100,
          watch: true, // Ensure it's watched for price updates
        });
      }

      processedCount++;
    }

    console.log(`Backfill completed.`);
    console.log(`Processed: ${processedCount}`);
    console.log(`Skipped: ${skippedCount}`);
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await db.destroy();
  }
}

backfill();
