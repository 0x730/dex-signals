const test = require('node:test');
const assert = require('node:assert/strict');

const signalsRouter = require('../../routes/signals');

function findRoute(path, method) {
  return signalsRouter.stack
    .filter((layer) => layer.route)
    .find((layer) => layer.route.path === path && layer.route.methods[method]);
}

test('paper trading reset routes require manager auth', () => {
  const protectedRoutes = [
    ['/paper-trading/reset', 'post'],
    ['/paper/reset', 'post'],
  ];

  for (const [path, method] of protectedRoutes) {
    const route = findRoute(path, method);
    assert.ok(route, `${method.toUpperCase()} ${path} is registered`);
    assert.equal(route.route.stack[0].name, 'requireManagerAuth');
  }
});

test('paper trading reset routes are POST-only', () => {
  assert.equal(findRoute('/paper-trading/reset', 'get'), undefined);
  assert.equal(findRoute('/paper/reset', 'get'), undefined);
});

test('external paper trading route has no hardcoded private host', () => {
  const route = findRoute('/paper-trading-signals-external', 'get');
  assert.ok(route, 'GET /paper-trading-signals-external is registered');
  const privateHostMarker = ['dexy', 'sig'].join('-');
  assert.equal(
    route.route.stack[0].handle.toString().includes(privateHostMarker),
    false
  );
});
