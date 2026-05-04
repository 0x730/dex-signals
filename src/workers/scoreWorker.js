require('dotenv').config();
const logger = require('../utils/logger');
const { createWorker } = require('../utils/baseWorker');
const { calculateAndUpdateScores } = require('../services/scoreService');

/**
 * Creates and starts a worker to calculate and update token scores
 * @returns {Object} - Worker control object with stop method
 */
function runScoreWorker() {
  const intervalMs =
    parseInt(process.env.SCORE_WORKER_INTERVAL_MS, 10) || 600000; // Default: 10 minutes

  // Create the worker with the task to calculate and update scores
  const worker = createWorker({
    name: 'ScoreWorker',
    task: async () => {
      return await calculateAndUpdateScores();
    },
    intervalMs,
    retryOptions: {
      maxRetries: 3,
      initialDelay: 5000,
    },
    runImmediately: true,
  });

  // Start the worker
  return worker.start();
}

if (require.main === module) {
  runScoreWorker();
}

module.exports = {
  runScoreWorker,
};
