exports.up = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    table.index('dextoolsLastCheck');
    table.index('dextScore');
    table.index('gtScore');
    table.index('liquidityUsd');
    // Add more indexes as needed
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    table.dropIndex('dextoolsLastCheck');
    table.dropIndex('dextScore');
    table.dropIndex('gtScore');
    table.dropIndex('liquidityUsd');
    // Drop more indexes as needed
  });
};
