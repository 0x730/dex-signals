exports.up = async function (knex) {
  await knex.schema.table('tokens', (table) => {
    table.json('gtInfo').nullable().comment('GeckoTerminal token info');
  });
};

exports.down = async function (knex) {
  await knex.schema.table('tokens', (table) => {
    table.dropColumn('gtInfo');
  });
};
