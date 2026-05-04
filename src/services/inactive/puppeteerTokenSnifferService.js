/**
 * Puppeteer Token Sniffer Service
 *
 * This service handles scraping and analyzing token data from DexScreener using Puppeteer.
 * It replaces the ScraperAPI-based implementation with an in-house solution to reduce costs.
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const logger = require('../../utils/logger');
const TokenModel = require('../../models/TokenModel');
const { withRetry, sleep } = require('../../utils/baseWorker');

// Base URL for DexScreener
const BASE_URL = 'https://dexscreener.com';

/**
 * Fetch page content using Puppeteer.
 * @param {string} url - The URL to scrape.
 * @returns {string} - HTML content of the page.
 */
async function fetchPageContent(url) {
  let browser = null;
  try {
    // Launch a visible browser (works better than headless)
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Open a new page
    const page = await browser.newPage();

    // Set a user agent to avoid being blocked
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 100000 });

    // Wait for the content to load
    await page.waitForSelector('div', { timeout: 100000 });

    // Get the page content
    const content = await page.content();

    return content;
  } catch (error) {
    console.log(url);
    logger.error(`Failed to fetch page content: ${error.message}`);
    throw error;
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extract token data from HTML content.
 * @param {string} html - HTML content of the page.
 * @returns {Object} - Extracted token data.
 */
function extractTokenData(html) {
  const { JSDOM } = require('jsdom');
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

  // Get all divs for analysis
  const allDivs = Array.from(document.querySelectorAll('div'));

  // Find divs containing 'Token Sniffer' with various search methods
  // First, try to find by specific class name from the issue description
  const customClassDivs = allDivs.filter(
    (div) =>
      div.className &&
      (div.className.includes('custom-7bktj8') ||
        (div.className.includes('custom-') &&
          div.textContent.trim() === 'Token Sniffer'))
  );

  // If found by class, use those, otherwise fall back to text content search
  let tokenSnifferDivs =
    customClassDivs.length > 0
      ? customClassDivs
      : allDivs.filter((div) =>
          div.textContent.trim().toLowerCase().includes('token sniffer')
        );

  // Enhanced debugging
  console.log(
    `Found ${tokenSnifferDivs.length} divs containing 'Token Sniffer':`
  );
  tokenSnifferDivs.forEach((div, index) => {
    console.log(
      `Div ${index + 1}: "${div.textContent.trim().substring(0, 50)}...", class: "${div.className}"`
    );
  });

  // Use the first div that contains 'Token Sniffer' if available
  let tokenSnifferDiv =
    tokenSnifferDivs.length > 0 ? tokenSnifferDivs[0] : null;
  console.log(
    'Selected tokenSnifferDiv:',
    tokenSnifferDiv ? tokenSnifferDiv.outerHTML.substring(0, 100) : 'null'
  );

  const flagManuallyDiv = allDivs.find(
    (div) => div.textContent.trim().indexOf(flagManually) != -1
  );

  if (flagManuallyDiv) {
    riskLevel = true;
    score = '0/99';
  } else if (tokenSnifferDiv) {
    // Find the parent container of "Token Sniffer" to access related content
    // First, try to navigate up to find a container with more elements
    let parentContainer = tokenSnifferDiv;

    // Navigate up to find a suitable parent container
    for (let i = 0; i < 3; i++) {
      // Try up to 3 levels up
      if (parentContainer && parentContainer.parentElement) {
        parentContainer = parentContainer.parentElement;
      }
    }

    console.log(
      'Parent container found:',
      parentContainer ? parentContainer.outerHTML.substring(0, 150) : 'null'
    );

    if (parentContainer) {
      // Look for score in spans with various classes
      const scoreSelectors = [
        'span.chakra-text',
        'span.custom-2ygcmq',
        'span[class*="custom-"]',
      ];

      let scoreElement = null;
      for (const selector of scoreSelectors) {
        const elements = parentContainer.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent.trim();
          // Check if the text matches a score pattern (e.g., "70/100")
          if (/^\d+\/\d+$/.test(text) || /^\d+$/.test(text)) {
            scoreElement = el;
            break;
          }
        }
        if (scoreElement) break;
      }

      score = scoreElement ? scoreElement.textContent.trim() : null;
      console.log('Extracted score:', score);

      // Check for risk indicators in SVG elements
      const svgSelectors = ['svg.chakra-icon', 'svg[class*="custom-"]'];

      let riskSVG = null;
      for (const selector of svgSelectors) {
        const elements = parentContainer.querySelectorAll(selector);
        if (elements.length > 0) {
          riskSVG = elements[0];
          break;
        }
      }

      if (riskSVG) {
        const pathElement = riskSVG.querySelector('path');
        if (pathElement) {
          const pathD = pathElement.getAttribute('d')?.trim(); // Extract the 'd' attribute
          logger.debug(`Extracted path: ${pathD}`);
          if (pathD === PENDING_SVG) {
            riskLevel = false;
            score = '-1/99';
          } else if (pathD === RISK_SVG) {
            riskLevel = true;
          } else if (pathD === OK_SVG) {
            riskLevel = false;
          } else {
            // If we can't determine from SVG, check if score is warning-like
            if (score && parseInt(score.split('/')[0], 10) < 50) {
              riskLevel = true;
            } else {
              riskLevel = false;
            }
          }
        }
      } else {
        // If no SVG found, try to determine risk from the score
        if (score) {
          const scoreValue = parseInt(score.split('/')[0], 10);
          riskLevel = scoreValue < 50;
        }
      }
    }
  } else {
    // Fallback: First try to find any div that might be the Token Sniffer section based on class structure
    console.log(
      'No Token Sniffer div found directly, trying alternative detection methods'
    );

    // Look for divs with class patterns from the issue description
    const potentialTokenSnifferContainers = allDivs.filter((div) => {
      // Check for divs with custom classes that might contain Token Sniffer info
      return (
        div.className &&
        (div.className.includes('custom-1jog9dc') ||
          div.className.includes('custom-1x9gpkp') ||
          div.className.includes('chakra-stack'))
      );
    });

    console.log(
      `Found ${potentialTokenSnifferContainers.length} potential Token Sniffer containers`
    );

    // Check these containers for score information
    let foundTokenSnifferInfo = false;
    for (const container of potentialTokenSnifferContainers) {
      // Look for score pattern in any span
      const spans = container.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        // Match both "70/100" format and just "70" format
        if (/^\d+\/\d+$/.test(text) || /^\d+$/.test(text)) {
          console.log(`Found potential score: ${text} in container`);
          score = text;

          // Determine risk level based on score
          let scoreValue;
          if (text.includes('/')) {
            scoreValue = parseInt(text.split('/')[0], 10);
          } else {
            scoreValue = parseInt(text, 10);
          }

          riskLevel = scoreValue < 50;

          foundTokenSnifferInfo = true;
          console.log(
            'Found Token Sniffer information via alternative detection'
          );
          break;
        }
      }

      if (foundTokenSnifferInfo) break; // Exit the loop if we found a score
    }

    // If we still don't have a score, look for any security-related information
    if (!foundTokenSnifferInfo) {
      console.log(
        'No Token Sniffer score found, looking for general security indicators'
      );

      // Look for any divs that might contain security information
      const securityDivs = allDivs.filter((div) => {
        const text = div.textContent.trim().toLowerCase();
        return (
          text.includes('security') ||
          text.includes('risk') ||
          text.includes('warning') ||
          text.includes('audit')
        );
      });

      console.log(`Found ${securityDivs.length} security-related divs`);

      // If we found any security-related divs, check if they indicate a risk
      if (securityDivs.length > 0) {
        const hasRiskIndicator = securityDivs.some((div) => {
          const text = div.textContent.trim().toLowerCase();
          return (
            text.includes('high risk') ||
            text.includes('warning') ||
            text.includes('scam') ||
            text.includes('honeypot')
          );
        });

        if (hasRiskIndicator) {
          riskLevel = true;
          score = '0/99'; // Assume worst score if risk indicators are found
          console.log('Found risk indicators in security-related divs');
        } else {
          riskLevel = false;
          score = '50/99'; // Assume moderate score if no clear risk indicators
          console.log(
            'No clear risk indicators found in security-related divs'
          );
        }
      } else {
        // If we couldn't find any security information, set default values
        riskLevel = false;
        score = '-1/99'; // Unknown score
        console.log('No security information found on the page');
      }
    }
  }

  // Normalize the score format
  let normalizedScore = -1;
  if (score) {
    const parts = score.split('/');
    if (parts.length === 2) {
      // Extract the numerator (score value)
      normalizedScore = parseInt(parts[0], 10);
    } else if (/^\d+$/.test(score)) {
      // If it's just a number without denominator
      normalizedScore = parseInt(score, 10);
    }
  }

  console.log(
    `Final normalized score: ${normalizedScore}, risk level: ${riskLevel}`
  );

  return {
    score: normalizedScore,
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
  // Normalize chain name to ensure compatibility with DexScreener URL format
  const normalizedChain = chain.toLowerCase();

  // Map of common chain name variations to their DexScreener format
  const chainMap = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    bsc: 'bsc',
    binance: 'bsc',
    polygon: 'polygon',
    matic: 'polygon',
    avalanche: 'avalanche',
    avax: 'avalanche',
    fantom: 'fantom',
    ftm: 'fantom',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    base: 'base',
  };

  // Use mapped chain name if available, otherwise use the normalized chain name
  const dexScreenerChain = chainMap[normalizedChain] || normalizedChain;

  const tokenUrl = `${BASE_URL}/${dexScreenerChain}/${address}`;
  logger.info(
    `Fetching data for token: ${tokenUrl} (original chain: ${chain})`
  );

  try {
    const maxRetries = parseInt(process.env.PUPPETEER_MAX_RETRIES, 10) || 3;
    const retryDelay =
      parseInt(process.env.PUPPETEER_RETRY_DELAY_MS, 10) || 2000;

    const html = await withRetry(async () => await fetchPageContent(tokenUrl), {
      maxRetries,
      initialDelay: retryDelay,
    });
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
    '[PuppeteerTokenSnifferService] Fetching watched tokens for enrichment...'
  );

  const tokens = await TokenModel.findTokensForTokenSnifferAnalysis(limit);

  if (!tokens.length) {
    logger.info(
      '[PuppeteerTokenSnifferService] No tokens to enrich at this time.'
    );
    return 0;
  }

  logger.info(
    `[PuppeteerTokenSnifferService] Found ${tokens.length} tokens to enrich.`
  );

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
          `[PuppeteerTokenSnifferService] Updated token ID ${id} with score=${score}, warning=${tokenSnifferWarning}`
        );
        processedCount++;
      }
    } catch (err) {
      logger.error(
        `[PuppeteerTokenSnifferService] Error enriching token ID ${id}: ${err.message}`
      );
    }

    // Rate limiting to avoid overloading the website and getting blocked
    const requestDelay =
      parseInt(process.env.PUPPETEER_REQUEST_DELAY_MS, 10) || 5000;
    await sleep(requestDelay);
  }

  logger.info(
    `[PuppeteerTokenSnifferService] Finished TokenSniffer enrichment. Processed ${processedCount} tokens.`
  );
  return processedCount;
}

module.exports = {
  enrichTokensWithTokenSniffer,
  fetchTokenData,
  extractTokenData,
  fetchPageContent,
};
