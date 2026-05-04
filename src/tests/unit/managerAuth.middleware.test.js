const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requireManagerAuth,
  getProvidedManagerKey,
  safeEqual,
} = require('../../middleware/managerAuth');
const logger = require('../../utils/logger');

function mockReq(headers = {}) {
  return {
    get(name) {
      return headers[name.toLowerCase()] || null;
    },
  };
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function restoreEnvVar(key, previousValue) {
  if (typeof previousValue === 'undefined') {
    delete process.env[key];
    return;
  }
  process.env[key] = previousValue;
}

test('safeEqual compares equal strings and rejects mismatches', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('abc', null), false);
});

test('getProvidedManagerKey reads x-manager-key first', () => {
  const req = mockReq({
    'x-manager-key': 'manager-secret',
    authorization: 'Bearer ignored-token',
  });
  assert.equal(getProvidedManagerKey(req), 'manager-secret');
});

test('getProvidedManagerKey reads bearer token fallback', () => {
  const req = mockReq({
    authorization: 'Bearer manager-secret',
  });
  assert.equal(getProvidedManagerKey(req), 'manager-secret');
});

test('requireManagerAuth blocks when MANAGER_API_KEY is missing', () => {
  const previous = process.env.MANAGER_API_KEY;
  const previousLoggerSilent = logger.silent;
  delete process.env.MANAGER_API_KEY;
  logger.silent = true;

  try {
    const req = mockReq({ 'x-manager-key': 'anything' });
    const res = mockRes();
    let nextCalled = false;

    requireManagerAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
  } finally {
    logger.silent = previousLoggerSilent;
    restoreEnvVar('MANAGER_API_KEY', previous);
  }
});

test('requireManagerAuth blocks invalid manager key', () => {
  const previous = process.env.MANAGER_API_KEY;
  process.env.MANAGER_API_KEY = 'expected-secret';

  const req = mockReq({ 'x-manager-key': 'wrong-secret' });
  const res = mockRes();
  let nextCalled = false;

  requireManagerAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);

  restoreEnvVar('MANAGER_API_KEY', previous);
});

test('requireManagerAuth allows valid manager key', () => {
  const previous = process.env.MANAGER_API_KEY;
  process.env.MANAGER_API_KEY = 'expected-secret';

  const req = mockReq({ 'x-manager-key': 'expected-secret' });
  const res = mockRes();
  let nextCalled = false;

  requireManagerAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);

  restoreEnvVar('MANAGER_API_KEY', previous);
});
