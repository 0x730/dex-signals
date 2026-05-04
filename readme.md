# Token Monitor

Token Monitor tracks and scores tokens across multiple chains, exposes signal APIs, and includes a React dashboard for browsing tokens and paper trading performance.

## Features

- Track tokens across multiple blockchains (Ethereum, Base, BSC, Arbitrum, Polygon, Solana, and Linea)
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

- Node.js 20 or newer
- npm 10 or newer
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

### Configuration

The application is configured through `.env`. Start from [.env.example](.env.example).

Required local values:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`: MySQL connection.
- `HOST`: API bind host. The service defaults to `127.0.0.1`.
- `PORT`: API port. The code default is `3000`; `.env.example` uses `4100` to avoid common local conflicts.
- `MANAGER_API_KEY`: Required for manager-only reset routes.

Optional integration values:

- `BASESCAN_API_KEY`: Used by source-code download tooling.
- `SCRAPERAPI_KEY`: Used by inactive scraper integrations.
- `OPENAI_API_KEY`: Only needed for archived/inactive analyzer experiments.
- `EXTERNAL_PAPER_TRADING_SIGNALS_URL`: Enables `/signals/paper-trading-signals-external`.

### Running the Application

#### Development Mode

For development, you'll need to run both the backend server and the React client separately:

1. Start the backend server:

   ```bash
   npm run dev
   ```

   This starts the Express server with hot reloading enabled. Use `PORT` in `.env` to choose the local API port.

2. In a separate terminal, start the React client:

   ```bash
   npm run client-dev
   ```

   This will start the React development server on port 3001 with hot reloading enabled.

3. Access the application:
   - Backend API: use the `HOST` and `PORT` configured in `.env`
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

   This uses PM2 to start the server, which serves both the API and the React frontend on the configured `HOST` and `PORT`.

3. Access the application at the configured `HOST` and `PORT`.

#### Deployment

For deploying to a production server, follow these steps from a clean checkout:

```bash
# Install dependencies and build the application
npm ci
npm run client-install
npm run client-build

# Run database migrations
npm run migrate

# Start the application
npm start
```

This process installs dependencies, builds the React client, updates the database schema, and starts the server with PM2.

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
npm start            # Start the production server and serve the built client
```

> **Note:** `npm start` starts the main server process, which also starts the workers wired in `src/index.js`. Standalone worker scripts are available when you want to run a worker separately.

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
npm test
npm run format:check
npm run lint
npm run check:public
```

To create or publish a clean public GitHub snapshot with no private Git history,
see [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md).

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

- **Port conflicts**: Change the port by setting the `PORT` environment variable:

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
