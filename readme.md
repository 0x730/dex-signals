# Token Monitor

Token Monitor is a powerful tool for tracking and analyzing tokens across multiple blockchains. The application provides real-time data, scoring, and risk assessment to help you make informed decisions.

## Features

- Track tokens across multiple blockchains (Base, Arbitrum, Ethereum)
- Score tokens based on various metrics
- Paper trading simulation
- Security analysis with GoPlus
- Historical data tracking

## Architecture

The application consists of two main parts:

1. **Backend API**: An Express.js server that provides REST endpoints for token data and runs various workers to collect and process data.
2. **React Frontend**: A modern, responsive user interface built with React.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- MySQL database

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install client dependencies:
   ```bash
   npm run client-install
   ```
4. Set up environment variables (copy `.env.example` to `.env` and fill in the values)
5. Run database migrations:
   ```bash
   npm run migrate
   ```

### Running the Application

#### Development Mode

For development, you'll need to run both the backend server and the React client separately:

1. Start the backend server:

   ```bash
   npm run dev
   ```

   This will start the Express server on port 3000 with hot reloading enabled.

2. In a separate terminal, start the React client:

   ```bash
   npm run client-dev
   ```

   This will start the React development server on port 3001 with hot reloading enabled.

3. Access the application:
   - Backend API: http://localhost:3000
   - React frontend: http://localhost:3001

#### Production Mode

For production, you'll build the React client and then start the server which will serve both the API and the React frontend:

1. Build the React client:

   ```bash
   npm run client-build
   ```

   This creates an optimized production build of the React app in the `src/client/build` directory.

2. Start the application:

   ```bash
   npm start
   ```

   This uses PM2 to start the server which will serve both the API and the React frontend on port 3000.

3. Access the application at http://localhost:3000

#### Deployment

For deploying to a production server, follow these steps:

```bash
# Navigate to your project directory
cd bots-signals

# Stash any local changes and pull the latest code
git stash --include-untracked
git pull --rebase origin main

# Install dependencies and build the application
npm i
npm run client-install
npm run client-build

# Run database migrations
npm run migrate

# Start the application
npm start
```

This process will update your code, install any new dependencies, build the React client, update the database schema, and start the server with PM2.

#### Running Everything (Complete Setup)

To set up and run the entire application from scratch:

```bash
# Install dependencies
npm install
npm run client-install

# Set up the database
npm run migrate

# For development
npm run dev          # Terminal 1: Backend server
npm run client-dev   # Terminal 2: React client

# For production
npm run client-build # Build the React client
npm start            # Start the production server (API only)
```

> **Note:** `npm start` now only starts the main API process. Workers must be started manually if you wish to run them in the background.

#### Running Workers

The application includes several data collection workers that can be run separately:

```bash
# Run the Gecko worker
npm run gecko-worker

# Run the Continuous Backfill worker (adds tokens to paper trading every 10 mins)
npm run continuous-backfill

# Other available workers
npm run dextools-worker
npm run tokensniffer-worker
```

### Utility Scripts

#### Public Release Check

Before publishing or opening a pull request, run:

```bash
npm run release:public:prepare
```

This prepares a clean public snapshot with no private Git history. For a full
GitHub release flow, see [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md).

#### Continuous Backfill Worker

This worker selects all tokens that haven't been paper traded yet and meet the minimum score threshold. It then processes them in bulks (batches) every X minutes until all selected tokens are finished, then it stops the process.

**Running in foreground:**

```bash
npm run continuous-backfill
```

**Running in background (using PM2):**
To run this worker as a background process that continues after you close your SSH session:

```bash
pm2 start ecosystem.api.config.js --only continuous-backfill
```

The process will automatically stop and be marked as `stopped` in PM2 once it finishes processing all tokens.
You can check the status and logs with:

```bash
pm2 status
pm2 logs continuous-backfill
```

**Note on Boot Persistence:**
If you want to ensure this worker (or any other) does **not** start automatically when the server boots:

1. Start the process manually using the command above.
2. Do **NOT** run `pm2 save` while the worker is running if you have PM2 startup configured.
3. If you already ran `pm2 save`, you can stop the worker and run `pm2 save` again to update the list of processes that start on boot.

**Configuration (.env):**

- `CONTINUOUS_BACKFILL_INTERVAL_MINUTES`: Frequency of the worker (default: `10`).
- `CONTINUOUS_BACKFILL_BATCH_SIZE`: Number of tokens to add per run (default: `5`).
- `CONTINUOUS_BACKFILL_MIN_SCORE`: Minimum score required (default: `30`).

#### Backfill Paper Trading

This script allows you to retrospectively add tokens to paper trading based on historical high scores and a specific chain. This is useful if you want to include past scans that weren't automatically added to paper trading because of the 1-hour time limit.

It uses `priceAtHighScore` and `highScoreReachedAt` as entry price and date if available, otherwise it falls back to current price.

**Usage:**

```bash
node src/scripts/backfillPaperTrading.js <chain> <minScore> [--dry-run]
```

**Parameters:**

- `chain`: The blockchain network (e.g., `base`, `ethereum`, `solana`).
- `minScore`: Minimum score threshold for tokens to be included.
- `--dry-run`: (Optional) Preview which tokens will be added without modifying the database.

**Example:**

```bash
# Preview tokens on Base with score >= 30
node src/scripts/backfillPaperTrading.js base 30 --dry-run

# Apply changes
node src/scripts/backfillPaperTrading.js base 30
```

#### Troubleshooting

If you encounter issues running the application, try these solutions:

- **Port conflicts**: If port 3000 is already in use, you can change the port by setting the `PORT` environment variable:

  ```bash
  PORT=3001 npm run dev
  ```

- **Database connection issues**: Ensure your MySQL database is running and that the connection details in your `.env` file are correct.

- **Missing dependencies**: If you encounter errors about missing dependencies, try running:

  ```bash
  npm install
  npm run client-install
  ```

- **Build errors**: If the client build fails, check for errors in your React code and ensure all dependencies are installed:

  ```bash
  cd src/client
  npm install
  ```

- **PM2 errors**: If you encounter issues with PM2, ensure it's installed globally:
  ```bash
  npm install -g pm2
  ```

## API Endpoints

- `/tokens`: Get token information
- `/signals`: Get trading signals
- `/signals/paper-trading-signals-external`: Get paper trading signals from `EXTERNAL_PAPER_TRADING_SIGNALS_URL` when configured.
- Manager-protected reset routes:
  - `POST /signals/paper-trading/reset`
  - `POST /signals/paper/reset`
  - Provide `x-manager-key: <MANAGER_API_KEY>` (or `Authorization: Bearer <MANAGER_API_KEY>`).

## React Client

The React client provides a user-friendly interface for interacting with the Token Monitor API. See the [client README](src/client/README.md) for more details.

## Development Roadmap

- DONE: ~~GeckoScore - not so often.. and lastGeckoScoreDate check.~~
- DONE: ~~- Desxscreener - lastCheck date added~~
- TODO: maybe similar for Dextools Score
- TODO: Dextools API - fetch score and audit
- DOING: listen also on last updated info GeckoTerminal endpoint.
- TDB: look also on de.fi scanner...
- TODO: check hardcoded params and hardcoded "base" in code.

## Supported Blockchains

The chain_id of the blockchain.

- "1" means Ethereum
- "10" means Optimism
- "25" means Cronos
- "56" means BSC
- "100" means Gnosis
- "128" means HECO
- "137" means Polygon
- "250" means Fantom
- "321" means KCC
- "324" means zkSync Era
- "10001" means ETHW
- "201022" means FON
- "42161" means Arbitrum
- "43114" means Avalanche
- "59144" means Linea Mainnet
- "8453" Base
- "tron" means Tron
- "534352" means Scroll
- "204" means opBNB
- "5000" means Mantle
- "42766" means ZKFair
- "81457" means Blast
- "169" means Manta Pacific
- "80085" means Berachain Artio Testnet
- "4200" means Merlin
- "200901" means Bitlayer Mainnet
- "810180" means zkLink Nova
- "196" means X Layer Mainnet
