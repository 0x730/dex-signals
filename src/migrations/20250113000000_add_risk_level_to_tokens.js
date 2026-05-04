// migrations/20250113000000_add_risk_level_to_tokens.js

exports.up = function (knex) {
  return knex.schema.table('tokens', function (table) {
    table.string('riskLevel').notNullable().defaultTo('HIGH'); // Risk Level (LOW, MEDIUM, MEDIUM_HIGH, HIGH)
  });
};

exports.down = function (knex) {
  return knex.schema.table('tokens', function (table) {
    table.dropColumn('riskLevel');
  });
};
