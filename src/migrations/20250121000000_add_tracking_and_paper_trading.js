exports.up = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    // Columns for tracking tokens with scores > 30
    table.timestamp('highScoreReachedAt').nullable();
    table.decimal('priceAtHighScore', 30, 15).nullable();
    table.decimal('priceAfter5m', 30, 15).nullable();
    table.decimal('priceAfter15m', 30, 15).nullable();
    table.decimal('priceAfter1h', 30, 15).nullable();
    table.decimal('priceAfter24h', 30, 15).nullable();

    // Columns for paper trading system
    table.boolean('paperTraded').defaultTo(false);
    table.decimal('paperInvestmentAmount', 15, 5).nullable();
    table.timestamp('paperInvestmentDate').nullable();
    table.decimal('paperEntryPrice', 30, 15).nullable();
    table.decimal('paperTokensOwned', 30, 15).nullable();
    table.decimal('paperCurrentValue', 15, 5).nullable();
    table.decimal('paperProfitLoss', 15, 5).nullable();
    table.decimal('paperProfitLossPercent', 10, 2).nullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    // Drop tracking columns
    table.dropColumn('highScoreReachedAt');
    table.dropColumn('priceAtHighScore');
    table.dropColumn('priceAfter5m');
    table.dropColumn('priceAfter15m');
    table.dropColumn('priceAfter1h');
    table.dropColumn('priceAfter24h');

    // Drop paper trading columns
    table.dropColumn('paperTraded');
    table.dropColumn('paperInvestmentAmount');
    table.dropColumn('paperInvestmentDate');
    table.dropColumn('paperEntryPrice');
    table.dropColumn('paperTokensOwned');
    table.dropColumn('paperCurrentValue');
    table.dropColumn('paperProfitLoss');
    table.dropColumn('paperProfitLossPercent');
  });
};
