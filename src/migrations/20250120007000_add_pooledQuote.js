exports.up = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    // Add 'pooledQuote' as DECIMAL with appropriate precision and scale
    table.decimal('pooledQuote', 20, 6).defaultTo(0).notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    table.dropColumn('pooledQuote');
  });
};
