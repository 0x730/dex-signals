// Test script for dextools selectors (modified to run without Jest)
require('dotenv').config();
const puppeteer = require('puppeteer');
const { extractDextScore } = require('../services/inactive/dextoolsService');

// Simple assertion function
function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`[PASS] ${message}`);
    return true;
  } else {
    console.log(`[FAIL] ${message} - Expected ${expected}, got ${actual}`);
    return false;
  }
}

async function runTests() {
  let browser;
  let oldStructurePage;
  let newStructurePage;
  let allTestsPassed = true;

  try {
    console.log('[DEBUG_LOG] Starting Dextools selectors tests');

    // Launch a browser for the tests
    browser = await puppeteer.launch({
      headless: 'new', // Use headless mode for CI environment
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Create pages for different HTML structures
    oldStructurePage = await browser.newPage();
    newStructurePage = await browser.newPage();

    // Create a simple HTML page with the old structure
    const oldHtml = `
      <html>
        <body>
          <div id="scoreExplanation" class="ng-tns-c3405918929-20">
            <app-dext-score class="ng-tns-c3405918929-20" _nghost-ng-c2478364600="">
              <div class="dext-score-component ng-star-inserted">
                <div id="progressDext" class="progress-container">
                  <div class="progress-value-container">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50">
                      <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="100%" class="ng-star-inserted">
                        <stop offset="0%" stop-color="#008A00"></stop>
                        <stop offset="100%" stop-color="#008A00"></stop>
                      </linearGradient>
                      <path d="M 8.169 40 A 31.831,31.831 0, 0, 1 71.831 40" fill="none" class="muted"></path>
                      <path id="dextValue" fill="none" d="M 8.169 40 A 31.831,31.831 0, 0, 1 71.831 40" class="dext-value" style="stroke-dashoffset: 42;"></path>
                    </svg>
                    <div class="dext-value ng-star-inserted">
                      <strong> 57 </strong>
                      <span>/99</span>
                    </div>
                  </div>
                </div>
              </div>
            </app-dext-score>
          </div>
        </body>
      </html>
    `;

    // Create a simple HTML page with the new structure from the issue description
    const newHtml = `
      <html>
        <body>
          <div _ngcontent-ng-c3405918929="" tabindex="0" class="header-dext-score ng-tns-c3405918929-2 ng-star-inserted" style="">
            <app-dext-score-chart _ngcontent-ng-c3405918929="" size="big" class="ng-tns-c3405918929-2" _nghost-ng-c3925651669="">
              <div _ngcontent-ng-c3925651669="" class="dext-score-component tablet-layout big ng-star-inserted">
                <div _ngcontent-ng-c3925651669="" class="progress-container" id="progressDext_1">
                  <div _ngcontent-ng-c3925651669="" class="progress-value-container">
                    <svg _ngcontent-ng-c3925651669="" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50">
                      <linearGradient _ngcontent-ng-c3925651669="" x1="0" y1="0" x2="0" y2="100%" id="gradient_1" class="ng-star-inserted">
                        <stop _ngcontent-ng-c3925651669="" offset="0%" stop-color="#00B8D8"></stop>
                        <stop _ngcontent-ng-c3925651669="" offset="100%" stop-color="#00B8D8"></stop>
                      </linearGradient>
                      <path _ngcontent-ng-c3925651669="" d="M 8.169 40 A 31.831,31.831 0, 0, 1 71.831 40" fill="none" class="muted"></path>
                      <path _ngcontent-ng-c3925651669="" fill="none" d="M 8.169 40 A 31.831,31.831 0, 0, 1 71.831 40" class="dext-value" id="dextValue_1" stroke="url(#gradient_1)" style="stroke-dashoffset: 15;"></path>
                    </svg>
                    <div _ngcontent-ng-c3925651669="" class="dext-value"> 84 </div>
                  </div>
                </div>
              </div>
            </app-dext-score-chart>
          </div>
        </body>
      </html>
    `;

    // Set the page content for each page
    await oldStructurePage.setContent(oldHtml);
    await newStructurePage.setContent(newHtml);
    console.log('[DEBUG_LOG] Test pages created with sample HTML structures');

    // Test 1: Old HTML structure
    console.log('[DEBUG_LOG] Starting test for old dextools structure');
    const oldScore = await extractDextScore(oldStructurePage);
    console.log(
      `[DEBUG_LOG] Extracted DEXT score from old structure: ${oldScore}`
    );
    const oldTestPassed = assertEqual(
      oldScore,
      57,
      'Old structure DEXT score extraction'
    );
    if (!oldTestPassed) allTestsPassed = false;

    // Test 2: New HTML structure
    console.log('[DEBUG_LOG] Starting test for new dextools structure');
    const newScore = await extractDextScore(newStructurePage);
    console.log(
      `[DEBUG_LOG] Extracted DEXT score from new structure: ${newScore}`
    );
    const newTestPassed = assertEqual(
      newScore,
      84,
      'New structure DEXT score extraction'
    );
    if (!newTestPassed) allTestsPassed = false;

    // Summary
    if (allTestsPassed) {
      console.log(
        '[DEBUG_LOG] All tests PASSED! The DEXT score extraction is working correctly.'
      );
    } else {
      console.log(
        '[DEBUG_LOG] Some tests FAILED. Please check the logs above for details.'
      );
    }
  } catch (error) {
    console.error('[ERROR] Test execution failed:', error);
    allTestsPassed = false;
  } finally {
    // Close the browser
    if (browser) {
      await browser.close();
    }
    console.log('[DEBUG_LOG] Tests completed');

    // Return the test result
    return allTestsPassed;
  }
}

// Run the tests
runTests()
  .then((success) => {
    console.log(
      `[DEBUG_LOG] Test execution ${success ? 'succeeded' : 'failed'}`
    );
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('[ERROR] Unhandled error during test execution:', error);
    process.exit(1);
  });
