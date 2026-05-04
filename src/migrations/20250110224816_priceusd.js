// migrations/XXXXXXXXXXXX_add_priceUsd_to_tokens.js

exports.up = function (knex) {
  return knex.schema.table('tokens', function (table) {
    table.decimal('priceUsd', 30, 18).notNullable().defaultTo(0); // Latest fetched price
  });
};

exports.down = function (knex) {
  return knex.schema.table('tokens', function (table) {
    table.dropColumn('priceUsd');
  });
};
