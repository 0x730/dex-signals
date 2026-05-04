/**
 * Test script for Secure Slither Analyzer Worker
 *
 * This script tests if the secure slither analyzer worker is functioning correctly.
 * It runs the worker with a small limit and waits for it to complete its first run.
 */

require('dotenv').config();
const logger = require('../utils/logger');
const {
  runSecureSlitherAnalyzerWorker,
} = require('../workers/inactive/secureWorkers/secureSlitherAnalyzer');

// Test function
async function runTest() {
  logger.info('Starting Secure Slither Analyzer Worker test');

  // Run the worker with a small limit (5 tokens)
  const worker = runSecureSlitherAnalyzerWorker(5);

  logger.info(
    'Worker started. Waiting for 60 seconds to allow for first run...'
  );

  // Wait for 60 seconds to give the worker time to complete its first run
  // Slither analysis might take longer than Solidity download
  await new Promise((resolve) => setTimeout(resolve, 60000));

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
