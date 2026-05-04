exports.up = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    // Add gtScore as DECIMAL with appropriate precision and scale
    table.decimal('gtScore', 10, 4).defaultTo(0).notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable('tokens', (table) => {
    table.dropColumn('gtScore');
  });
};
