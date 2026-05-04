/**
 * Create the dexscreener_historical_data table
 * This table will store historical data from DexScreener for each pool
 *
 * @param {object} knex - The Knex.js instance
 * @returns {Promise} A promise that resolves when the migration is complete
 */
exports.up = function (knex) {
  return knex.schema.createTable('dexscreener_historical_data', (table) => {
    table.increments('id').primary();
    table.string('chain').notNullable();
    table.string('poolAddress').notNullable();
    table.bigInteger('timestamp').notNullable();

    // Liquidity data
    table.decimal('liquidityUsd', 24, 2).nullable();
    table.decimal('liquidityQuote', 24, 12).nullable();

    // Price data
    table.decimal('priceUsd', 24, 12).nullable();
    table.decimal('priceNative', 24, 12).nullable();

    // Price change data (stored as percentages)
    table.decimal('priceChange1h', 10, 2).nullable();
    table.decimal('priceChange6h', 10, 2).nullable();
    table.decimal('priceChange24h', 10, 2).nullable();

    // Volume data
    table.decimal('volume1h', 24, 2).nullable();
    table.decimal('volume6h', 24, 2).nullable();
    table.decimal('volume24h', 24, 2).nullable();

    // Transaction data
    table.integer('txnsBuys1h').nullable();
    table.integer('txnsSells1h').nullable();
    table.integer('txnsBuys6h').nullable();
    table.integer('txnsSells6h').nullable();
    table.integer('txnsBuys24h').nullable();
    table.integer('txnsSells24h').nullable();

    // Additional metadata
    table.string('baseTokenAddress').nullable();
    table.string('baseTokenSymbol').nullable();
    table.string('quoteTokenAddress').nullable();
    table.string('quoteTokenSymbol').nullable();

    // Raw data for future use
    table.json('rawData').nullable();

    // Timestamps
    table.timestamps(true, true);

    // Indexes for faster queries
    table.index(['chain', 'poolAddress']);
    table.index('timestamp');
  });
};

/**
 * Drop the dexscreener_historical_data table
 *
 * @param {object} knex - The Knex.js instance
 * @returns {Promise} A promise that resolves when the migration is complete
 */
exports.down = function (knex) {
  return knex.schema.dropTable('dexscreener_historical_data');
};
