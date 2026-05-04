/**
 * Test script for Secure Solidity Downloader Worker
 *
 * This script tests if the secure solidity downloader worker is functioning correctly.
 * It runs the worker with a small limit and waits for it to complete its first run.
 */

require('dotenv').config();
const logger = require('../utils/logger');
const {
  runSecureSolidityDownloaderWorker,
} = require('../workers/inactive/secureWorkers/secureSolidityDownloader');

// Test function
async function runTest() {
  logger.info('Starting Secure Solidity Downloader Worker test');

  // Run the worker with a small limit (5 tokens)
  const worker = runSecureSolidityDownloaderWorker(5);

  logger.info(
    'Worker started. Waiting for 30 seconds to allow for first run...'
  );

  // Wait for 30 seconds to give the worker time to complete its first run
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Stop the worker
  if (worker && typeof worker.stop === 'function') {
    await worker.stop();
    logger.info('Worker stopped successfully');
  } else {
    logger.error('Failed to stop worker - worker object may be invalid');
  }

  logger.info(
    'Test completed. Check logs for any errors during worker execution.'
  );
}

// Run the test
runTest().catch((error) => {
  logger.error(`Test failed: ${error.message}`);
});
