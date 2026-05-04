const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

test('server declares express as a direct runtime dependency', () => {
  const pkg = require(path.join(repoRoot, 'package.json'));

  assert.match(pkg.dependencies.express, /^\^?5\./);
});

test('server does not register Express-incompatible wildcard route', () => {
  const indexSource = fs.readFileSync(
    path.join(repoRoot, 'src', 'index.js'),
    'utf8'
  );

  assert.equal(indexSource.includes("app.get('*'"), false);
  assert.equal(indexSource.includes('app.get("*"'), false);
});
