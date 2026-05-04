const path = require('path');

module.exports = {
  apps: [
    {
      name: 'dexy-dev-signals',
      script: path.resolve(__dirname, 'src', 'index.js'),
      cwd: path.resolve(__dirname),
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
        // Include other environment variables as needed
      },
    },
    {
      name: 'continuous-backfill',
      script: path.resolve(
        __dirname,
        'src',
        'workers',
        'continuousBackfillWorker.js'
      ),
      cwd: path.resolve(__dirname),
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'gecko-worker',
      script: path.resolve(__dirname, 'src', 'workers', 'geckoWorker.js'),
      cwd: path.resolve(__dirname),
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
