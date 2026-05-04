/**
 * Token Sniffer Service
 *
 * This service handles scraping and analyzing token data from DexScreener using ScraperAPI.
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('../../utils/logger');
const TokenModel = require('../../models/TokenModel');
const { withRetry, sleep } = require('../../utils/baseWorker');
const { JSDOM } = require('jsdom');

// API configuration
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;
const SCRAPERAPI_BASE_URL = 'http://api.scraperapi.com/';
if (!SCRAPERAPI_KEY) {
  throw new Error(
    'SCRAPERAPI_KEY is not defined in your environment variables.'
  );
}

const BASE_URL = 'https://dexscreener.com';

/**
 * Fetch page content via ScraperAPI.
 * @param {string} url - The URL to scrape.
 * @returns {string} - HTML content of the page.
 */
async function fetchPageContent(url) {
  try {
    const response = await withRetry(
      async () => {
        return await axios.get(SCRAPERAPI_BASE_URL, {
          params: {
            api_key: SCRAPERAPI_KEY,
            url: url,
            render: true, // Enable rendering to fetch dynamic content
          },
        });
      },
      {
        maxRetries: 3,
        initialDelay: 2000,
      }
    );
    return response.data;
  } catch (error) {
    logger.error(`Failed to fetch page content: ${error.message}`);
    throw error;
  }
}

/**
 * Extract token data from HTML content.
 * @param {string} html - HTML content of the page.
 * @returns {Object} - Extracted token data.
 */
function extractTokenData(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  let score = null;
  let riskLevel = false;

  // Predefined SVG content for comparison
  const OK_SVG =
    'M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z';
  const RISK_SVG =
    'M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z';
  const PENDING_SVG =
    'M360 0H24C10.745 0 0 10.745 0 24v16c0 13.255 10.745 24 24 24 0 90.965 51.016 167.734 120.842 192C75.016 280.266 24 357.035 24 448c-13.255 0-24 10.745-24 24v16c0 13.255 10.745 24 24 24h336c13.255 0 24-10.745 24-24v-16c0-13.255-10.745-24-24-24 0-90.965-51.016-167.734-120.842-192C308.984 231.734 360 154.965 360 64c13.255 0 24-10.745 24-24V24c0-13.255-10.745-24-24-24zm-75.078 384H99.08c17.059-46.797 52.096-80 92.92-80 40.821 0 75.862 33.196 92.922 80zm.019-256H99.078C91.988 108.548 88 86.748 88 64h208c0 22.805-3.987 44.587-11.059 64z';

  const flagManually = 'Flagged manually';

  // Locate the "Token Sniffer" div
  const tokenSnifferDiv = Array.from(document.querySelectorAll('div')).find(
    (div) => div.textContent.trim() === 'Token Sniffer'
  );

  const flagManuallyDiv = Array.from(document.querySelectorAll('div')).find(
    (div) => div.textContent.trim().indexOf(flagManually) != -1
  );

  if (flagManuallyDiv) {
    riskLevel = true;
    score = '0/99';
  } else if (tokenSnifferDiv) {
    // Find the parent container of "Token Sniffer" to access related content
    const parentContainer = tokenSnifferDiv.parentElement;

    if (parentContainer) {
      // Extract the score from the sibling span element
      const scoreElement = parentContainer.querySelector('span.chakra-text');
      score = scoreElement ? scoreElement.textContent.trim() : null;

      // Check if the risk SVG exists and compare its content
      const riskSVG = parentContainer.querySelector('svg.chakra-icon');
      if (riskSVG) {
        const pathElement = riskSVG.querySelector('path');
        if (pathElement) {
          const pathD = pathElement.getAttribute('d').trim(); // Extract the 'd' attribute
          logger.debug(`Extracted path: ${pathD}`);
          if (pathD === PENDING_SVG) {
            riskLevel = false;
            score = '-1/99';
          } else if (pathD === RISK_SVG) {
            riskLevel = true;
          } else if (pathD === OK_SVG) {
            riskLevel = false;
          } else {
            riskLevel = false;
            score = '-1/99';
          }
        }
      }
    }
  }

  return {
    score: score ? parseInt(score.split('/')[0], 10) : -1,
    tokenSnifferWarning: riskLevel,
  };
}

/**
 * Fetch and process token data.
 * @param {string} address - Token address.
 * @param {string} chain - Blockchain chain (default: 'base').
 * @returns {Object} - Token analysis data.
 */
async function fetchTokenData(address, chain = 'base') {
  const tokenUrl = `${BASE_URL}/${chain}/${address}`;
  logger.info(`Fetching data for token: ${tokenUrl}`);

  try {
    const html = await fetchPageContent(tokenUrl);
    const tokenData = extractTokenData(html);
    logger.info(`Extracted token data: ${JSON.stringify(tokenData)}`);
    return tokenData;
  } catch (error) {
    logger.error(`Error fetching data for token ${address}: ${error.message}`);
    throw error;
  }
}

/**
 * Enrich tokens with data from Token Sniffer.
 *
 * @param {number} limit - Maximum number of tokens to process
 * @returns {number} - Number of tokens successfully processed
 */
async function enrichTokensWithTokenSniffer(limit = 50) {
  logger.info(
    '[TokenSnifferService] Fetching watched tokens for enrichment...'
  );

  const tokens = await TokenModel.findTokensForTokenSnifferAnalysis(limit);

  if (!tokens.length) {
    logger.info('[TokenSnifferService] No tokens to enrich at this time.');
    return 0;
  }

  logger.info(`[TokenSnifferService] Found ${tokens.length} tokens to enrich.`);

  let processedCount = 0;

  for (const token of tokens) {
    const { id, address, chain = 'base' } = token;

    try {
      const { score, tokenSnifferWarning } = await fetchTokenData(
        address,
        chain
      );
      if (score !== -1) {
        await TokenModel.updateTokenSnifferResult(
          id,
          score,
          tokenSnifferWarning
        );
        logger.info(
          `[TokenSnifferService] Updated token ID ${id} with score=${score}, warning=${tokenSnifferWarning}`
        );
        processedCount++;
      }
    } catch (err) {
      logger.error(
        `[TokenSnifferService] Error enriching token ID ${id}: ${err.message}`
      );
    }

    // Rate limiting to avoid overloading the API
    await sleep(2000); // 2 second delay between requests
  }

  logger.info(
    `[TokenSnifferService] Finished TokenSniffer enrichment. Processed ${processedCount} tokens.`
  );
  return processedCount;
}

module.exports = {
  enrichTokensWithTokenSniffer,
  fetchTokenData,
  extractTokenData,
  fetchPageContent,
};
