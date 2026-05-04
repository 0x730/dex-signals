exports.up = async function (knex) {
  return knex.schema.table('tokens', (table) => {
    // Stores last time we updated from Dextools
    table.timestamp('dextoolsLastCheck').nullable().defaultTo(null);
  });
};

exports.down = async function (knex) {
  return knex.schema.table('tokens', (table) => {
    table.dropColumn('dextoolsLastCheck');
  });
};
