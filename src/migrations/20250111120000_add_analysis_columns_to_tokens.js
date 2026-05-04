// migrations/20250111120000_add_analysis_columns_to_tokens.js

exports.up = function (knex) {
  return knex.schema.alterTable('tokens', function (table) {
    table.jsonb('mythril').nullable().comment('Mythril analysis results');
    table.jsonb('slither').nullable().comment('Slither analysis results');
    table
      .jsonb('analysis')
      .nullable()
      .comment('Combined analysis results from multiple tools');

    table
      .timestamp('mythrilLastCheck')
      .nullable()
      .comment('Timestamp of the last Mythril analysis');
    table
      .timestamp('slitherLastCheck')
      .nullable()
      .comment('Timestamp of the last Slither analysis');
    table
      .timestamp('analysisLastCheck')
      .nullable()
      .comment('Timestamp of the last combined analysis');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tokens', function (table) {
    table.dropColumn('mythril');
    table.dropColumn('slither');
    table.dropColumn('analysis');
    table.dropColumn('mythrilLastCheck');
    table.dropColumn('slitherLastCheck');
    table.dropColumn('analysisLastCheck');
  });
};
