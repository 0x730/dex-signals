exports.up = function (knex) {
  return knex.schema.table('tokens', (table) => {
    table
      .integer('tokenSnifferScore')
      .nullable()
      .comment('Score from TokenSniffer (e.g., 70/100)');
    table
      .boolean('tokenSnifferWarning')
      .defaultTo(false)
      .comment('Flag if TokenSniffer finds similar contracts with warnings');
    table
      .timestamp('tokenSnifferLastCheck')
      .nullable()
      .comment('Last time TokenSniffer data was fetched');
  });
};

exports.down = function (knex) {
  return knex.schema.table('tokens', (table) => {
    table.dropColumn('tokenSnifferScore');
    table.dropColumn('tokenSnifferWarning');
    table.dropColumn('tokenSnifferLastCheck');
  });
};
