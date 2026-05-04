// migrations/20250503120000_add_solidity_last_check_to_tokens.js

exports.up = function (knex) {
  return knex.schema.alterTable('tokens', function (table) {
    table
      .timestamp('solidityLastCheck')
      .nullable()
      .comment('Timestamp of the last Solidity code download');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tokens', function (table) {
    table.dropColumn('solidityLastCheck');
  });
};
