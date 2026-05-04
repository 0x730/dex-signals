const crypto = require('crypto');
const logger = require('../utils/logger');

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function getProvidedManagerKey(req) {
  const explicitHeader = req.get('x-manager-key');
  if (explicitHeader) {
    return explicitHeader;
  }

  const authHeader = req.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
}

function requireManagerAuth(req, res, next) {
  const configuredKey = process.env.MANAGER_API_KEY;
  if (!configuredKey) {
    logger.error('Manager route called but MANAGER_API_KEY is not configured');
    return res.status(503).json({
      success: false,
      message: 'Manager authentication is not configured on this server.',
    });
  }

  const providedKey = getProvidedManagerKey(req);
  if (!safeEqual(configuredKey, providedKey)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. Manager credentials are required.',
    });
  }

  return next();
}

module.exports = {
  requireManagerAuth,
  getProvidedManagerKey,
  safeEqual,
};
