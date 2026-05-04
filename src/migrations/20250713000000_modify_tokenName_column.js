exports.up = function (knex) {
  return knex.schema.raw(
    'ALTER TABLE tokens MODIFY tokenName VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ""'
  );
};

exports.down = function (knex) {
  return knex.schema.raw(
    'ALTER TABLE tokens MODIFY tokenName VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT ""'
  );
};
