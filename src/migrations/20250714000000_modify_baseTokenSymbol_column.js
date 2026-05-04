exports.up = function (knex) {
  return knex.schema.raw(
    'ALTER TABLE dexscreener_historical_data MODIFY baseTokenSymbol VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci, MODIFY quoteTokenSymbol VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
};

exports.down = function (knex) {
  return knex.schema.raw(
    'ALTER TABLE dexscreener_historical_data MODIFY baseTokenSymbol VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci, MODIFY quoteTokenSymbol VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci'
  );
};
