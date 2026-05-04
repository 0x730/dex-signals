exports.up = async function (knex) {
  return knex.schema.table('tokens', (table) => {
    // Stores the next time we should check this token with Dextools
    table.timestamp('dextoolsNextCheck').nullable().defaultTo(null);
  });
};

exports.down = async function (knex) {
  return knex.schema.table('tokens', (table) => {
    table.dropColumn('dextoolsNextCheck');
  });
};
