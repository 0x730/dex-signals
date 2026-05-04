// index.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const logger = require('./utils/logger');
const { runGeckoWorker } = require('./workers/geckoWorker');
const { runDexScreenerWorker } = require('./workers/dexscreenerWorker');
const {
  runDexScreenerProfilesWorker,
} = require('./workers/dexscreenerProfilesWorker');
const { runGeckoScoreWorker } = require('./workers/geckoScoreWorker');
const { runScoreWorker } = require('./workers/scoreWorker');
const { runGoPlusWorker } = require('./workers/goPlusWorker');
const { runPaperTradingWorker } = require('./workers/paperTradingWorker');
const { runCleanupWorker } = require('./workers/cleanupWorker');

// Import the routers
const signalsRouter = require('./routes/signals');
const tokensRouter = require('./routes/tokens');

// Configure rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per minute
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// Apply rate limiting to all API routes
app.use('/tokens', apiLimiter);
app.use('/signals', apiLimiter);

// Middleware to parse JSON bodies (if needed)
app.use(express.json());

// Basic security middleware
app.use((req, res, next) => {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https: https://icons.llamao.fi; connect-src 'self' https://cdn.jsdelivr.net"
  );

  // Simple CORS handling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS, PUT, PATCH, DELETE'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With,content-type'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Mount the routers
app.use('/signals', signalsRouter);
app.use('/tokens', tokensRouter);

// Serve static files from the React app
const reactBuildPath = path.join(__dirname, 'client/build');
app.use(express.static(reactBuildPath));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  // Skip API routes
  if (req.url.startsWith('/signals') || req.url.startsWith('/tokens')) {
    return res
      .status(404)
      .json({ success: false, message: 'API endpoint not found' });
  }

  res.sendFile(path.join(reactBuildPath, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  logger.info(`Server is running on ${HOST}:${PORT}`);
});

// Store worker instances for proper shutdown
const workers = [];

// Start all workers concurrently and store their instances
workers.push(runGeckoWorker('eth'));
workers.push(runGeckoWorker('eth', 'trending_pools'));
workers.push(runGeckoWorker('base'));
workers.push(runGeckoWorker('base', 'trending_pools'));
workers.push(runGeckoWorker('bsc'));
workers.push(runGeckoWorker('bsc', 'trending_pools'));
workers.push(runGeckoWorker('arbitrum')); // Arbitrum worker
workers.push(runGeckoWorker('arbitrum', 'trending_pools')); // Arbitrum trending pools worker
workers.push(runGeckoWorker('solana'));
workers.push(runGeckoWorker('solana', 'trending_pools'));
workers.push(runGeckoWorker('linea'));
//workers.push(runGeckoWorker('linea', 'trending_pools'));
//workers.push(runGeckoWorker('polygon')); // Polygon worker
//workers.push(runGeckoWorker('polygon', 'trending_pools')); // Polygon trending pools worker
workers.push(runDexScreenerWorker());
workers.push(runDexScreenerProfilesWorker('eth')); // New worker for DexScreener profiles and boosts
workers.push(runDexScreenerProfilesWorker('base')); // New worker for DexScreener profiles and boosts
workers.push(runDexScreenerProfilesWorker('bsc')); // BSC profiles and boosts worker
workers.push(runDexScreenerProfilesWorker('arbitrum')); // Arbitrum profiles and boosts worker
workers.push(runDexScreenerProfilesWorker('polygon')); // Polygon profiles and boosts worker
workers.push(runDexScreenerProfilesWorker('solana')); // Solana profiles and boosts worker
workers.push(runDexScreenerProfilesWorker('linea')); // Linea profiles and boosts worker
workers.push(runGeckoScoreWorker());
workers.push(runScoreWorker());
workers.push(runGoPlusWorker());
workers.push(runCleanupWorker());
workers.push(runPaperTradingWorker());

logger.info('All workers have been started.');

// Handle graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Graceful shutdown function
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop all workers
  for (const worker of workers) {
    if (worker && typeof worker.stop === 'function') {
      try {
        await worker.stop(signal);
      } catch (error) {
        logger.error(`Error stopping worker: ${error.message}`);
      }
    }
  }

  logger.info('All workers stopped. Shutting down server...');

  // Close the Express server
  server.close(() => {
    logger.info('Server closed. Process will exit now.');
    process.exit(0);
  });

  // Force exit after timeout if server.close() doesn't complete
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}
