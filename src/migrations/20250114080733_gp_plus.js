exports.up = function (knex) {
  return knex.schema.table('tokens', (table) => {
    table.json('goplus_info').nullable(); // Column to store the full JSON response
    table.float('goplus_score').defaultTo(null); // Column to store the calculated score
  });
};

exports.down = function (knex) {
  return knex.schema.table('tokens', (table) => {
    table.dropColumn('goplus_info');
    table.dropColumn('goplus_score');
  });
};
