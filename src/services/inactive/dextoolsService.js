/**
 * Dextools Service
 *
 * This service handles scraping and analyzing token data from Dextools.
 * Optimized for performance with batch processing and improved browser handling.
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const logger = require('../../utils/logger');
const TokenModel = require('../../models/TokenModel');
const { sleep } = require('../../utils/baseWorker');

// Configuration
const BASE_URL = process.env.DEXTOOLS_BASE_URL || 'https://www.dextools.io';

// Thresholds (can be moved to .env for flexibility)
const MIN_DEXT_SCORE = parseFloat(process.env.MIN_DEXT_SCORE);
const MIN_LIQUIDITY = parseFloat(process.env.MIN_LIQUIDITY);

// Performance configuration
const BATCH_SIZE = parseInt(process.env.DEXTOOLS_BATCH_SIZE, 10) || 3; // Reduced batch size to prevent WSL crashes
const CONCURRENT_BROWSERS =
  parseInt(process.env.DEXTOOLS_CONCURRENT_BROWSERS, 10) || 1; // Reduced to 1 concurrent browser instance to prevent WSL crashes
const REQUEST_DELAY =
  parseInt(process.env.DEXTOOLS_REQUEST_DELAY_MS, 10) || 1000; // Delay between requests in ms
const PAGE_TIMEOUT =
  parseInt(process.env.DEXTOOLS_PAGE_TIMEOUT_MS, 10) || 60000; // Page load timeout in ms

/**
 * Efficiently scrolls the page to ensure all elements load.
 * @param {Object} page - The Puppeteer Page instance.
 */
async function efficientScroll(page) {
  // Simplified scrolling approach to reduce resource usage
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      // First check the top of the page where the new DEXT score might be
      window.scrollTo(0, 0);
      console.log('Scrolled to top');

      // Wait for elements to load
      setTimeout(() => {
        // Then scroll down to where the old DEXT score might be
        window.scrollTo(0, 500);
        console.log('Scrolled to 500px');

        // Wait and scroll further down
        setTimeout(() => {
          window.scrollTo(0, 1000);
          console.log('Scrolled to 1000px');

          // Wait and scroll to bottom in one step
          setTimeout(() => {
            // Get current scroll height
            const scrollHeight = document.body.scrollHeight;
            console.log('Page scroll height:', scrollHeight);

            // Scroll directly to bottom
            window.scrollTo(0, scrollHeight);
            console.log(`Scrolled to bottom (${scrollHeight}px)`);

            // Wait at the bottom to ensure everything loads
            setTimeout(() => {
              // Check if scrollHeight has changed (indicating new content loaded)
              const newScrollHeight = document.body.scrollHeight;
              if (newScrollHeight > scrollHeight) {
                console.log(
                  `ScrollHeight increased from ${scrollHeight}px to ${newScrollHeight}px, scrolling to new bottom`
                );
                window.scrollTo(0, newScrollHeight);
              }

              // Wait before scrolling back to top
              setTimeout(() => {
                // Finally, scroll back to the top where the header score might be
                window.scrollTo(0, 0);
                console.log('Scrolled back to top');

                // Wait for everything to load before resolving
                setTimeout(resolve, 1000);
              }, 1000);
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);
    });
  });

  // Take a screenshot after scrolling only in debug mode
  if (process.env.DEBUG_MODE === 'true') {
    await page.screenshot({ path: 'after-scroll-debug.png' });
  }
}

/**
 * Extracts the DEXT score from the page.
 * Handles multiple possible HTML structures:
 * 1. New header structure (.header-dext-score .dext-value)
 * 2. Tablet layout structure (.dext-score-component.tablet-layout .dext-value)
 * 3. Old structure with strong element (.dext-value.ng-star-inserted strong)
 * 4. Old structure without strong element (.dext-value.ng-star-inserted)
 *
 * @param {Object} page - The Puppeteer Page instance.
 * @returns {number|null} - The extracted DEXT score or null if not found.
 */
async function extractDextScore(page) {
  // Maximum number of retry attempts
  const maxRetries = 3;
  let retryCount = 0;
  let extractedScore = null;

  while (retryCount < maxRetries && extractedScore === null) {
    try {
      if (retryCount > 0) {
        logger.info(
          `[DextoolsService] Retry attempt ${retryCount} to extract DEXT score`
        );
        // Wait a bit before retrying
        await sleep(2000 * retryCount); // Increase wait time with each retry
      }

      // Wait for any of the possible score elements to be available (increased timeout from 5000ms to 10000ms)
      await Promise.race([
        page
          .waitForSelector('.dext-value.ng-star-inserted', { timeout: 10000 })
          .catch(() => {}),
        page
          .waitForSelector('.header-dext-score .dext-value', { timeout: 10000 })
          .catch(() => {}),
        page
          .waitForSelector('.dext-score-component.tablet-layout .dext-value', {
            timeout: 10000,
          })
          .catch(() => {}),
        page.waitForSelector('.dext-value', { timeout: 10000 }).catch(() => {}),
      ]);

      // Add debug screenshot to see what the page looks like
      await page.screenshot({
        path: `debug-dextools-page-retry-${retryCount}.png`,
      });

      // Extract the DEXT score with more detailed debugging
      const rawScore = await page.evaluate(() => {
        // Helper function to log element details
        function logElement(selector, element) {
          console.log(
            `Selector: ${selector}, Found: ${!!element}, Text: ${element ? element.textContent.trim() : 'N/A'}`
          );
          return element;
        }

        // Try all possible selectors for the DEXT score

        // 1. Try the new structure from the example (strong element inside dext-value)
        const dextValueWithStrong = logElement(
          '.dext-value.ng-star-inserted strong',
          document.querySelector('.dext-value.ng-star-inserted strong')
        );
        if (dextValueWithStrong) {
          const scoreText = dextValueWithStrong.textContent.trim();
          console.log(`Found score in strong element: ${scoreText}`);
          return scoreText; // e.g., "84"
        }

        // 2. Try the progress-value-container which contains the SVG and dext-value
        const progressValueContainer = logElement(
          '.progress-value-container .dext-value strong',
          document.querySelector('.progress-value-container .dext-value strong')
        );
        if (progressValueContainer) {
          const scoreText = progressValueContainer.textContent.trim();
          console.log(`Found score in progress-value-container: ${scoreText}`);
          return scoreText; // e.g., "84"
        }

        // 3. Try the header structure
        const headerDextValue = logElement(
          '.header-dext-score .dext-value',
          document.querySelector('.header-dext-score .dext-value')
        );
        if (headerDextValue) {
          return headerDextValue.textContent.trim(); // e.g., "84"
        }

        // 4. Try the tablet layout structure
        const tabletDextValue = logElement(
          '.dext-score-component.tablet-layout .dext-value',
          document.querySelector(
            '.dext-score-component.tablet-layout .dext-value'
          )
        );
        if (tabletDextValue) {
          return tabletDextValue.textContent.trim(); // e.g., "84"
        }

        // 5. Try any div with class dext-value (more generic)
        const anyDextValue = logElement(
          '.dext-value',
          document.querySelector('.dext-value')
        );
        if (anyDextValue) {
          return anyDextValue.textContent.trim();
        }

        // 6. Fallback to the old method if none of the above are found
        const divEl = logElement(
          '.dext-value.ng-star-inserted',
          document.querySelector('.dext-value.ng-star-inserted')
        );
        if (divEl) {
          return divEl.textContent.trim(); // e.g., "47 /99"
        }

        // 7. Try to find the specific structure from the example HTML
        const progressContainer = logElement(
          '.progress-container',
          document.querySelector('.progress-container')
        );
        if (progressContainer) {
          const dextValueDiv = progressContainer.querySelector(
            '.progress-value-container .dext-value'
          );
          if (dextValueDiv) {
            const strongEl = dextValueDiv.querySelector('strong');
            if (strongEl) {
              const scoreText = strongEl.textContent.trim();
              console.log(
                `Found score in progress-container > progress-value-container > dext-value > strong: ${scoreText}`
              );
              return scoreText;
            } else {
              const text = dextValueDiv.textContent.trim();
              console.log(
                `Found text in progress-container > progress-value-container > dext-value: ${text}`
              );
              return text;
            }
          }
        }

        // 8. Try to find any element with class containing "dext" and "score"
        const dextScoreElements = document.querySelectorAll(
          '[class*="dext"][class*="score"]'
        );
        console.log(
          `Found ${dextScoreElements.length} elements with class containing "dext" and "score"`
        );
        for (const el of dextScoreElements) {
          const text = el.textContent.trim();
          console.log(
            `Dext score element: ${el.tagName}, class: ${el.className}, text: ${text}`
          );
          if (/\d+/.test(text)) {
            console.log(`Found potential score in dext score element: ${text}`);
            return text;
          }
        }

        // 9. Try to find any element with id containing "dext" and "score"
        const dextScoreIdElements = document.querySelectorAll(
          '[id*="dext"][id*="score"]'
        );
        console.log(
          `Found ${dextScoreIdElements.length} elements with id containing "dext" and "score"`
        );
        for (const el of dextScoreIdElements) {
          const text = el.textContent.trim();
          console.log(
            `Dext score id element: ${el.tagName}, id: ${el.id}, text: ${text}`
          );
          if (/\d+/.test(text)) {
            console.log(
              `Found potential score in dext score id element: ${text}`
            );
            return text;
          }
        }

        // 10. Try to find any element with class containing "progress-value-container"
        const progressValueElements = document.querySelectorAll(
          '.progress-value-container'
        );
        console.log(
          `Found ${progressValueElements.length} elements with class "progress-value-container"`
        );
        for (const el of progressValueElements) {
          const text = el.textContent.trim();
          console.log(`Progress value element: ${el.tagName}, text: ${text}`);
          if (/\d+/.test(text)) {
            console.log(
              `Found potential score in progress value element: ${text}`
            );
            return text;
          }
        }

        // 11. Try to find the dext-score-component element
        const dextScoreComponent = document.querySelector(
          '.dext-score-component'
        );
        if (dextScoreComponent) {
          console.log('Found dext-score-component');
          // Look for the strong element inside dext-value
          const strongElement =
            dextScoreComponent.querySelector('.dext-value strong');
          if (strongElement) {
            const scoreText = strongElement.textContent.trim();
            console.log(
              `Found score in dext-score-component > dext-value > strong: ${scoreText}`
            );
            return scoreText;
          }

          // If no strong element, try to get the text content of the dext-value
          const dextValueElement =
            dextScoreComponent.querySelector('.dext-value');
          if (dextValueElement) {
            const text = dextValueElement.textContent.trim();
            console.log(
              `Found text in dext-score-component > dext-value: ${text}`
            );
            return text;
          }
        }

        // 12. Last resort: try to find any element containing a number followed by /99
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent.trim();
          if (/\d+\s*\/\s*99/.test(text)) {
            console.log(`Found score in element: ${el.tagName}, text: ${text}`);
            // Extract just the number part
            const match = text.match(/(\d+)\s*\/\s*99/);
            if (match) {
              console.log(`Extracted number from score: ${match[1]}`);
              return match[1];
            }
            return text;
          }
        }

        // 13. Dump all text content of the page for debugging
        console.log('Dumping all text content of the page for debugging:');
        const bodyText = document.body.textContent;
        console.log(bodyText.substring(0, 1000) + '...'); // Log first 1000 chars to avoid flooding

        // 14. Look for any number in the page
        const numberMatch = bodyText.match(/\b(\d{1,2})\s*\/\s*99\b/);
        if (numberMatch) {
          console.log(`Found number in page text: ${numberMatch[0]}`);
          // Extract just the number part
          const match = numberMatch[0].match(/(\d+)/);
          if (match) {
            console.log(`Extracted number from match: ${match[1]}`);
            return match[1];
          }
          return numberMatch[0];
        }

        return null;
      });

      if (!rawScore) {
        console.log(`No raw score found on attempt ${retryCount + 1}`);
        retryCount++;
        continue; // Try again if we have retries left
      }

      console.log(`Raw score found on attempt ${retryCount + 1}:`, rawScore);

      // Handle different formats of raw score

      // Format 1: Just a number (e.g., "84")
      if (/^\d+$/.test(rawScore.trim())) {
        extractedScore = parseInt(rawScore.trim(), 10);
      }
      // Format 2: Number with /99 (e.g., "57 /99" or "57/99")
      else {
        const slashMatch = rawScore.match(/(\d+)\s*\/\s*\d+/);
        if (slashMatch) {
          extractedScore = parseInt(slashMatch[1], 10);
        }
        // Format 3: Try to extract any number from the text
        else {
          const numberMatch = rawScore.match(/(\d+)/);
          if (numberMatch) {
            extractedScore = parseInt(numberMatch[1], 10);
          }
        }
      }

      if (extractedScore === null) {
        console.log(
          `Could not parse a number from raw score on attempt ${retryCount + 1}:`,
          rawScore
        );
        retryCount++;
      } else {
        logger.info(
          `[DextoolsService] Successfully extracted DEXT score ${extractedScore} on attempt ${retryCount + 1}`
        );
      }
    } catch (err) {
      logger.debug(
        `Error extracting DEXT score on attempt ${retryCount + 1}: ${err.message}`
      );
      retryCount++;
    }
  }

  return extractedScore;
}

/**
 * Process a single token to extract its DEXT score.
 * @param {Object} page - The Puppeteer Page instance.
 * @param {Object} token - The token to process.
 * @returns {Object} - The processing result.
 */
async function processToken(page, token) {
  const { id, address, chain, liquidityUsd, dextScore } = token;

  var chainId = chain;
  if (chain === 'eth') {
    chainId = 'ether';
  }
  const dexUrl = `${BASE_URL}/app/en/${chainId}/pair-explorer/${address}`;

  console.log('Processing token URL:', dexUrl);
  logger.info(`[DextoolsService] Processing token ID ${id} at ${dexUrl}`);

  try {
    // Navigate to the token page with optimized settings
    logger.info(`[DextoolsService] Navigating to ${dexUrl}`);
    await page.goto(dexUrl, {
      waitUntil: 'networkidle2', // Changed from domcontentloaded to ensure more complete loading
      timeout: PAGE_TIMEOUT,
    });

    // Wait a shorter time after page load to ensure all elements are loaded
    logger.info(
      `[DextoolsService] Waiting for page to fully load for token ID ${id}`
    );
    await sleep(1500); // Reduced from 3 seconds to 1.5 seconds

    // Take a screenshot before scrolling (only in debug mode)
    if (process.env.DEBUG_MODE === 'true') {
      await page.screenshot({ path: `before-scroll-token-${id}.png` });
      logger.info(
        `[DextoolsService] Took screenshot before scrolling for token ID ${id}`
      );
    }

    // Efficient scrolling
    logger.info(
      `[DextoolsService] Starting efficient scroll for token ID ${id}`
    );
    await efficientScroll(page);
    logger.info(
      `[DextoolsService] Completed efficient scroll for token ID ${id}`
    );

    // Wait a shorter time after scrolling to ensure all elements are loaded
    logger.info(`[DextoolsService] Waiting after scrolling for token ID ${id}`);
    await sleep(1000); // Reduced from 2 seconds to 1 second

    // Extract the DEXT score
    logger.info(`[DextoolsService] Extracting DEXT score for token ID ${id}`);
    const newDexScore = await extractDextScore(page);
    logger.info(
      `[DextoolsService] Extracted DEXT score for token ID ${id}: ${newDexScore}`
    );

    // Use existing score if new one couldn't be extracted
    const finalDexScore = newDexScore !== null ? newDexScore : dextScore;

    if (newDexScore === null) {
      logger.warn(
        `[DextoolsService] Could not extract DEXT score for token ID ${id}, using existing score: ${dextScore}`
      );
    }

    console.log(
      'Token ID:',
      id,
      'URL:',
      dexUrl,
      'newDexScore:',
      newDexScore,
      'finalDexScore:',
      finalDexScore
    );

    // Determine if the token should remain watched
    let keepWatching = true;
    if (finalDexScore < MIN_DEXT_SCORE || liquidityUsd < MIN_LIQUIDITY) {
      keepWatching = false;
    }

    logger.info(
      `DEXT Score for token ID ${id} => ${finalDexScore} (watch: ${keepWatching})`
    );

    return {
      id,
      success: true,
      dextScore: finalDexScore,
      keepWatching,
    };
  } catch (err) {
    logger.error(
      `[DextoolsService] Error processing token ID ${id}: ${err.message}`
    );
    return {
      id,
      success: false,
      error: err.message,
    };
  }
}

/**
 * Process a batch of tokens using a single browser instance.
 * @param {Array} tokenBatch - Batch of tokens to process.
 * @param {number} batchIndex - Index of the current batch.
 * @returns {Array} - Results of processing the batch.
 */
async function processBatch(tokenBatch, batchIndex) {
  logger.info(
    `[DextoolsService] Processing batch ${batchIndex + 1} with ${tokenBatch.length} tokens`
  );

  // Launch browser with optimized settings
  const browser = await puppeteer.launch({
    headless: 'new', // Use new headless mode to reduce resource usage
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();

  // Set a realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36'
  );

  // Optimize page settings
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    // Block unnecessary resources to speed up page loading
    const resourceType = req.resourceType();
    if (
      resourceType === 'image' ||
      resourceType === 'font' ||
      resourceType === 'media'
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const results = [];

  try {
    for (const token of tokenBatch) {
      const result = await processToken(page, token);
      results.push(result);

      // Add a shorter delay between requests
      await sleep(REQUEST_DELAY);
    }
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Enrich tokens with data from Dextools using optimized batch processing.
 *
 * @param {number} limit - Maximum number of tokens to process
 * @returns {number} - Number of tokens successfully processed
 */
async function enrichTokensWithDextoolsData(limit = 50) {
  logger.info('[DextoolsService] Fetching watched tokens for enrichment...');

  // Fetch tokens that are watched and haven't been checked recently
  const tokens = await TokenModel.findWatchedDextoolsTokens(limit);

  if (!tokens.length) {
    logger.info('[DextoolsService] No tokens to enrich at this time.');
    return 0;
  }

  logger.info(`[DextoolsService] Found ${tokens.length} tokens to enrich.`);

  // Split tokens into batches
  const batches = [];
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    batches.push(tokens.slice(i, i + BATCH_SIZE));
  }

  logger.info(
    `[DextoolsService] Processing ${batches.length} batches with batch size ${BATCH_SIZE}`
  );

  let processedCount = 0;
  let successCount = 0;

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENT_BROWSERS) {
    const currentBatches = batches.slice(i, i + CONCURRENT_BROWSERS);

    // Process multiple batches concurrently
    const batchPromises = currentBatches.map((batch, index) =>
      processBatch(batch, i + index)
    );

    // Wait for all concurrent batches to complete
    const batchResults = await Promise.all(batchPromises);

    // Flatten results and update tokens in database
    const results = batchResults.flat();

    // Update tokens in database
    for (const result of results) {
      processedCount++;

      if (result.success) {
        try {
          // Calculate next check time based on score and liquidity
          let nextCheckInterval =
            parseInt(process.env.DEXTOOLS_SKIP_INTERVAL_MS, 10) || 600000; // Default 10 minutes

          // Adjust interval based on score - higher scores checked more frequently
          if (result.dextScore >= 8) {
            nextCheckInterval = nextCheckInterval * 0.5; // Check high-score tokens more frequently
          } else if (result.dextScore < 5) {
            nextCheckInterval = nextCheckInterval * 2; // Check low-score tokens less frequently
          }

          // Calculate the next check date
          const nextCheckDate = new Date(Date.now() + nextCheckInterval);

          await TokenModel.updateToken(result.id, {
            dextScore: result.dextScore,
            watch: result.keepWatching,
            dextoolsLastCheck: new Date(),
            dextoolsNextCheck: nextCheckDate,
          });

          successCount++;
        } catch (err) {
          logger.error(
            `[DextoolsService] Error updating token ID ${result.id} in database: ${err.message}`
          );
        }
      }
    }
  }

  logger.info(
    `[DextoolsService] Finished Dextools enrichment. Processed ${processedCount} tokens, ${successCount} successful.`
  );
  return successCount;
}

module.exports = {
  enrichTokensWithDextoolsData,
  efficientScroll,
  extractDextScore,
  processToken,
  processBatch,
};
