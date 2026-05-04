exports.up = async function (knex) {
  await knex.schema.alterTable('tokens', (table) => {
    table.timestamp('dexscreenerLastCheck').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tokens', (table) => {
    table.dropColumn('dexscreenerLastCheck');
  });
};
