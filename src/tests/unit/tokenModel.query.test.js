const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../db');
const TokenModel = require('../../models/TokenModel');

test('applyCaseInsensitiveSearch uses LOWER + LIKE (MySQL compatible)', () => {
  const sql = TokenModel.applyCaseInsensitiveSearch(
    db(TokenModel.tableName),
    'AbC'
  ).toSQL();

  assert.equal(sql.sql.toLowerCase().includes('ilike'), false);
  assert.equal(sql.sql.toLowerCase().includes('lower('), true);
  assert.deepEqual(sql.bindings.slice(-3), ['%abc%', '%abc%', '%abc%']);
});

test('applyPooledQuoteStaleCheck keeps stale/null checks grouped with pooledQuote', () => {
  const sql = TokenModel.applyPooledQuoteStaleCheck(
    db(TokenModel.tableName),
    1,
    'geckoScoreLastCheck',
    new Date('2025-01-01T00:00:00.000Z')
  ).toSQL();
  const normalized = sql.sql.toLowerCase().replace(/\s+/g, ' ');

  assert.match(
    normalized,
    /`pooledquote` > \? and \(`geckoscorelastcheck` is null or `geckoscorelastcheck` < \?\)/
  );
});
