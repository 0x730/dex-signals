// Example migration
exports.up = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    // Instead of float, use DECIMAL with enough precision & scale
    // e.g. DECIMAL(20, 6) = up to 14 digits before decimal, 6 after
    // or use bigger if you expect bigger numbers
    table.decimal('liquidityUsd', 20, 6).alter();
  });
};

exports.down = async function (knex) {
  // rollback depends on your original definition
  return knex.schema.alterTable('tokens', (table) => {
    table.float('liquidityUsd').alter();
  });
};
