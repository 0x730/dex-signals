// Utility to provide chain icon URLs for use in the webapp
// We use the DefiLlama icons CDN which hosts chain icons under predictable slugs.
// Example: https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg
// CSP in src/index.js already allows external https images.

/**
 * Map various chain identifiers used in our system to icon slugs used by the CDN.
 * @param {string} chainId - chain identifier from DB or API (e.g., 'eth', 'ethereum', 'base')
 * @returns {string} slug used by the CDN
 */
function toIconSlug(chainId) {
  if (!chainId) return 'unknown';
  const lc = String(chainId).toLowerCase();
  switch (lc) {
    case 'eth':
    case 'ethereum':
      return 'ethereum';
    case 'bsc':
    case 'binance-smart-chain':
    case 'binance':
      return 'binance';
    case 'polygon':
    case 'matic':
      return 'polygon';
    case 'arbitrum':
      return 'arbitrum';
    case 'base':
      return 'base';
    case 'linea':
      return 'linea';
    case 'solana':
    case 'sol':
      return 'solana';
    default:
      return lc;
  }
}

/**
 * Return the icon URL for a given chain.
 * Uses a stable public CDN and falls back to a generic placeholder.
 * @param {string} chainId
 * @returns {string} icon URL
 */
function getChainIconUrl(chainId) {
  const slug = toIconSlug(chainId);
  // Primary: DeFiLlama icons
  const llamaUrl = `https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg`;
  // We provide a data URL placeholder as absolute last resort. Most UIs won't hit this if slug exists.
  const fallback = 'https://via.placeholder.com/24?text=%F0%9F%94%97';
  // We do not prefetch/test availability here; clients can render broken image fallback via onError.
  return llamaUrl || fallback;
}

module.exports = { getChainIconUrl };
