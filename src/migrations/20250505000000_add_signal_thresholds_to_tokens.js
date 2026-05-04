// migrations/20250505000000_add_signal_thresholds_to_tokens.js

exports.up = function (knex) {
  return knex.schema.alterTable('tokens', function (table) {
    table
      .jsonb('signalThresholds')
      .nullable()
      .comment(
        'JSON array of score thresholds at which signals have been sent'
      );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tokens', function (table) {
    table.dropColumn('signalThresholds');
  });
};
