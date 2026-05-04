exports.up = function (knex) {
  return knex.schema.createTable('tokens', (table) => {
    table.increments('id').primary();
    table.string('chain').notNullable().defaultTo('base');
    table.string('address').notNullable();

    table.boolean('watch').notNullable().defaultTo(true);
    table.float('recommendX').notNullable().defaultTo(0.0);
    table.json('otherData');
    table.float('score').notNullable().defaultTo(0.0);

    // new columns from your request
    table.string('baseToken').nullable();
    table.string('quoteToken').nullable();
    table.string('poolType').nullable();
    table.string('poolVersion').nullable();

    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.timestamp('updatedAt').defaultTo(knex.fn.now());

    table.decimal('liquidityUsd', 20, 6).nullable();
    table.decimal('dextScore', 5, 2).nullable();

    // Unique index for upsert on chain + address
    table.unique(['chain', 'address']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tokens');
};
