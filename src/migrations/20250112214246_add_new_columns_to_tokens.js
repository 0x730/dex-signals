// migrations/20250112123501_add_new_columns_to_tokens.js

exports.up = function (knex) {
  return knex.schema.table('tokens', function (table) {
    table.string('tokenName').notNullable().defaultTo(''); // Token Name
    table.timestamp('poolCreatedAt').defaultTo(knex.fn.now()); // Pool Creation Time
    table.integer('h24Sells').notNullable().defaultTo(0); // Last 24 Hours Sells
    table.integer('h1Sells').notNullable().defaultTo(0); // Last 1 Hour Sells
    table.decimal('h24Volume', 20, 8).notNullable().defaultTo(0); // Last 24 Hours Volume
    table.decimal('h1Volume', 20, 8).notNullable().defaultTo(0); // Last 1 Hour Volume
  });
};

exports.down = function (knex) {
  return knex.schema.table('tokens', function (table) {
    table.dropColumn('tokenName');
    table.dropColumn('poolCreatedAt');
    table.dropColumn('h24Sells');
    table.dropColumn('h1Sells');
    table.dropColumn('h24Volume');
    table.dropColumn('h1Volume');
  });
};
