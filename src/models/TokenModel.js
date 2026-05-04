const db = require('../db');

class TokenModel {
  static tableName = 'tokens';

  /**
   * Apply case-insensitive token search using SQL compatible with MySQL and PostgreSQL.
   * We avoid ILIKE because this project uses mysql2 in development/production.
   */
  static applyCaseInsensitiveSearch(query, search) {
    const searchTerm = `%${search.toLowerCase()}%`;
    return query.where(function () {
      this.whereRaw('LOWER(??) LIKE ?', ['tokenName', searchTerm])
        .orWhereRaw('LOWER(??) LIKE ?', ['address', searchTerm])
        .orWhereRaw('LOWER(??) LIKE ?', ['baseToken', searchTerm]);
    });
  }

  /**
   * Apply stale-or-never-checked filter with explicit grouping.
   */
  static applyPooledQuoteStaleCheck(
    query,
    minPooledQuote,
    lastCheckColumn,
    lastUpdateCutoff
  ) {
    return query
      .where('pooledQuote', '>', minPooledQuote)
      .andWhere(function () {
        this.whereNull(lastCheckColumn).orWhere(
          lastCheckColumn,
          '<',
          lastUpdateCutoff
        );
      });
  }

  /**
   * Check if a token with the given chain and address exists.
   * @param {string} chain - The blockchain network.
   * @param {string} address - The token address.
   * @returns {Promise<boolean>} True if the token exists, false otherwise.
   */
  static async existsByAddress(chain, baseToken) {
    const result = await db(this.tableName).where({ chain, baseToken }).first();

    return !!result; // Returns true if a result is found, false otherwise
  }

  /**
   * Insert or update a token based on (chain, address).
   * Avoid overwriting existing dextScore and gtScore during upserts from Gecko Service.
   */
  static async upsertToken(data) {
    // Build the full insert payload (includes dextScore and gtScore for new rows)
    const insertPayload = { ...data };

    // Build the merge payload but REMOVE dextScore and gtScore to prevent overwriting
    const mergePayload = {
      updatedAt: db.fn.now(),
      otherData: data.otherData,
      tokenName: data.tokenName,
      poolCreatedAt: data.poolCreatedAt,
      baseToken: data.baseToken,
      quoteToken: data.quoteToken,
      poolType: data.poolType,
      poolVersion: data.poolVersion,
      watch: data.watch, // Allow Gecko Service to update the watch flag
      recommendX: data.recommendX,
      //score: data.score,
      liquidityUsd: data.liquidityUsd,
      pooledQuote: data.pooledQuote,
      priceUsd: data.priceUsd,
      gtInfo: data.gtInfo,
      //mythril: data.mythril, // Allow updates if provided
      //slither: data.slither, // Allow updates if provided
      //analysis: data.analysis, // Allow updates if provided,
      // Avoid overwriting these fields
      //tokenSnifferScore: data.tokenSnifferScore,
      //tokenSnifferWarning: data.tokenSnifferWarning,
      //tokenSnifferLastCheck: data.tokenSnifferLastChec
      // dextScore and gtScore are omitted to prevent overwriting
    };

    return db(this.tableName)
      .insert(insertPayload)
      .onConflict(['chain', 'address'])
      .merge(mergePayload);
  }

  /**
   * Find up to `limit` tokens which are being watched and need to be checked
   * based on their nextCheck time or priority.
   *
   * This method uses the dextoolsNextCheck field to determine which tokens
   * need to be checked, falling back to priority-based selection for tokens
   * that don't have a nextCheck time set.
   *
   * @param {number} limit - Maximum number of tokens to return
   * @returns {Promise<Array>} Array of tokens that need checking
   */
  static async findWatchedDextoolsTokens(limit) {
    // Current timestamp for calculations
    const now = new Date();

    // Age limit for tokens
    const notOlderThan = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
    const ageCutoff = new Date(Date.now() - notOlderThan * 24 * 60 * 60 * 1000);

    // Base skip interval from environment (used as fallback)
    const baseSkipInterval =
      parseInt(process.env.DEXTOOLS_SKIP_INTERVAL_MS, 10) || 600000;
    const fallbackCutoff = new Date(Date.now() - baseSkipInterval);

    // Build the query using dextoolsNextCheck as the primary criteria
    return (
      db(this.tableName)
        /*.where(function () {
          this.where(function () {
            // Tokens that have a nextCheck time that has passed
            this.where('dextoolsNextCheck', '<=', now);
          })
            .orWhere(function () {
              // Tokens that don't have a nextCheck time but have a lastCheck time
              // that's older than the fallback cutoff
              this.whereNull('dextoolsNextCheck').andWhere(
                'dextoolsLastCheck',
                '<',
                fallbackCutoff
              );
            })
            .orWhere(function () {
              // Tokens that have never been checked
              this.whereNull('dextoolsNextCheck').whereNull(
                'dextoolsLastCheck'
              );
            });
        })*/
        // Filter by token quality criteria
        .where(function () {
          this.where('watch', true) // Explicitly watched tokens
            .orWhere(function () {
              // High quality tokens
              this.where(
                'liquidityUsd',
                '>=',
                parseInt(process.env.MIN_LIQUIDITY, 10) || 10000
              )
                .andWhere('liquidityUsd', '<', 5000000)
                .andWhere('pooledQuote', '>=', 1);
            });
        })
        // Common criteria for all tokens
        //.andWhere(function () {
        //  this.where('tokenSnifferScore', '>=', 0).orWhereNull(
        //    'tokenSnifferScore'
        //  );
        //})
        //.andWhere('poolCreatedAt', '>=', ageCutoff)
        // Order by priority and next check time
        .orderBy([
          // First priority: tokens that have never been checked
          {
            column: db.raw('CASE WHEN ?? IS NULL THEN 0 ELSE 1 END', [
              'dextoolsLastCheck',
            ]),
          },
          { column: 'score', order: 'asc' },
          // Second priority: tokens that are explicitly watched
          { column: 'watch', order: 'desc' },
          // Third priority: tokens with higher scores
          // Fourth priority: tokens with higher liquidity
          { column: 'liquidityUsd', order: 'desc' },
          // Fifth priority: tokens that need to be checked sooner
          { column: 'dextoolsNextCheck', order: 'asc', nulls: 'first' },
          // Last priority: tokens that were checked longer ago
          { column: 'dextoolsLastCheck', order: 'asc', nulls: 'first' },
        ])
        .limit(limit)
    );
  }

  static async findTokensForTokenSnifferAnalysis(limit = 10) {
    const notOlderThan = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
    const cutoffDate = new Date(
      Date.now() - notOlderThan * 24 * 60 * 60 * 1000
    );
    return (
      db(this.tableName)
        .whereNull('tokenSnifferLastCheck')
        //.andWhere('watch', true)
        .andWhere(
          'score',
          '>=',
          parseInt(process.env.SCORE_THRESHOLD, 10) || 15
        )
        .andWhere('poolCreatedAt', '>=', cutoffDate)
        .orderBy('id', 'desc')
        .limit(limit)
    );
  }

  /**
   * Find tokens needing GoPlus analysis.
   * Criteria:
   * - goplus_info is null (not analyzed yet).
   * @param {number} limit - Maximum number of tokens to fetch.
   * @returns {Array} List of tokens.
   */
  static async findTokensForGoPlusAnalysis(limit = 10) {
    const notOlderThan = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
    const cutoffDate = new Date(
      Date.now() - notOlderThan * 24 * 60 * 60 * 1000
    );

    return db(this.tableName)
      .whereNull('goplus_info')
      .andWhere('pooledQuote', '>', 1)
      .andWhere('poolCreatedAt', '>=', cutoffDate)
      .andWhere('chain', '<>', 'solana')
      .orderBy('id', 'desc')
      .limit(limit);
  }

  /**
   * Find all tokens that are being watched.
   */
  static async findDexscreenerWatchedTokens(skipIntervalMinutes) {
    const modelClass = this;
    const lastUpdateDateOff = new Date(
      Date.now() - skipIntervalMinutes * 60 * 1000
    );

    const notOlderThan = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
    const cutoffDate = new Date(
      Date.now() - notOlderThan * 24 * 60 * 60 * 1000
    );
    return (
      db(this.tableName)
        .where(function () {
          // Grouping the watch and score conditions
          this.where('watch', true).orWhere(function () {
            //this.where('score', '>=', 1)
            //this.where('liquidityUsd', '>', 3000);
            modelClass.applyPooledQuoteStaleCheck(
              this,
              0,
              'dexscreenerLastCheck',
              lastUpdateDateOff
            );
          });
        })
        //.andWhere('poolCreatedAt', '>=', cutoffDate)
        .limit(500)
        .orderBy('id', 'desc')
    ); // TODO: watch DESC, score DESC, poolCreatedAt DESC, pooledQuote DESC
  }

  /**
   * Find tokens that need Gecko score analysis.
   * Skip tokens where geckoScoreLastCheck is within the skip interval.
   * @param {number} skipIntervalMinutes - The interval in minutes to skip tokens.
   * @param {number} limit - Maximum number of tokens to return.
   */
  static async findTokensForGeckoScoreAnalysis(
    skipIntervalMinutes,
    limit = 50
  ) {
    const modelClass = this;
    const lastUpdateDateOff = new Date(
      Date.now() - skipIntervalMinutes * 60 * 1000
    );

    // Use environment variable for limit if available
    const maxTokens =
      parseInt(process.env.GECKO_MAX_TOKENS_PER_RUN, 10) || limit;

    const notOlderThan = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
    const cutoffDate = new Date(
      Date.now() - notOlderThan * 24 * 60 * 60 * 1000
    );

    return (
      db(this.tableName)
        .where(function () {
          // Grouping the watch and score conditions
          this.where('watch', true).orWhere(function () {
            //this.where('score', '>=', 1)
            modelClass.applyPooledQuoteStaleCheck(
              this,
              1,
              'geckoScoreLastCheck',
              lastUpdateDateOff
            );
          });
        })
        /*.andWhere(function () {
        // Grouping the token sniffer conditions
        this.where('tokenSnifferScore', '>=', 0).orWhereNull(
          'tokenSnifferScore'
        );
      })*/
        //.andWhere('poolCreatedAt', '>=', cutoffDate)
        .limit(maxTokens)
        .orderBy([
          // Prioritize tokens that have never been checked
          {
            column: db.raw('CASE WHEN ?? IS NULL THEN 0 ELSE 1 END', [
              'geckoScoreLastCheck',
            ]),
          },
          // Then prioritize by how long ago they were checked
          { column: 'geckoScoreLastCheck', order: 'asc', nulls: 'first' },
          // Finally by ID (newest first)
          { column: 'id', order: 'desc' },
        ])
    );
  }

  /**
   * Find tokens that have 'dextLastCheck' present.
   */
  static async findTokensWithDextLastCheck() {
    return (
      db(this.tableName)
        //.whereNotNull('dextoolsLastCheck')
        .orderBy('id', 'desc')
    );
  }

  /**
   * Find tokens with score >= 20, ordered by createdAt ascending.
   * @param {number} limit - Number of records to retrieve.
   * @param {number} offset - Number of records to skip.
   * @returns {Array} Array of token objects.
   */
  static async findHighScoreSignals(limit = 100, offset = 0) {
    const cutoffDate = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000 // TODO: hardcoded 3 Days values...
    );
    return (
      db(this.tableName)
        .where(
          'score',
          '>=',
          parseInt(process.env.HIGH_SCORE_THRESHOLD, 10) || 17
        )
        //.where('chain', '=', 'base') // TODO: hardcoded for now!!!
        .andWhere(function () {
          this.where('tokenSnifferScore', '>=', 0);
        })
        //.andWhere(function () {
        //  this.where('tokenSnifferWarning', false);
        //})
        .andWhere('poolCreatedAt', '>=', cutoffDate)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .offset(offset)
    );
  }

  /**
   * Find tokens that need Solidity code download.
   * Criteria:
   * - Score >= X (e.g., 20)
   * - Chain is 'base'
   * - solidityLastCheck is null (not yet downloaded) OR solidityLastCheck is older than SKIP_INTERVAL
   */
  static async findTokensForSourceDownloadAnalysis(limit = 100) {
    const scoreThreshold =
      parseFloat(process.env.DOWNLOAD_SCORE_THRESHOLD) || 20;
    const skipIntervalMs =
      parseInt(process.env.SOLIDITY_SKIP_INTERVAL_MS, 10) || 3600000; // 1 hour default
    const lastCheckDate = new Date(Date.now() - skipIntervalMs);

    return db(this.tableName)
      .where('chain', 'base')
      .andWhere('score', '>=', scoreThreshold)
      .andWhere(function () {
        this.whereNull('solidityLastCheck').orWhere(
          'solidityLastCheck',
          '<',
          lastCheckDate
        );
      })
      .orderBy('id', 'desc')
      .limit(limit);
  }

  /**
   * Find tokens that need Mythril analysis.
   * Criteria:
   * - Score >= X (e.g., 20)
   * - Chain is 'base'
   * - mythril is null (not yet analyzed) OR mythrilLastCheck is older than SKIP_INTERVAL
   */
  static async findTokensForMythrilAnalysis(limit = 100) {
    const scoreThreshold =
      parseFloat(process.env.MYTHRIL_SCORE_THRESHOLD) || 20;
    const skipIntervalMs =
      parseInt(process.env.MYTHRIL_SKIP_INTERVAL_MS, 10) || 3600000; // 1 hour default
    const lastCheckDate = new Date(Date.now() - skipIntervalMs);

    return db(this.tableName)
      .where('chain', 'base')
      .andWhere('score', '>=', scoreThreshold)
      .andWhere(function () {
        this.whereNull('mythril').orWhere(
          'mythrilLastCheck',
          '<',
          lastCheckDate
        );
      })
      .orderBy('id', 'desc')
      .limit(limit);
  }

  /**
   * Find tokens that need Slither analysis.
   * Criteria:
   * - Score >= X (e.g., 20)
   * - Chain is 'base'
   * - slither is null (not yet analyzed) OR slitherLastCheck is older than SKIP_INTERVAL
   */
  static async findTokensForSlitherAnalysis(limit = 100) {
    const scoreThreshold =
      parseFloat(process.env.SLITHER_SCORE_THRESHOLD) || 20;
    const skipIntervalMs =
      parseInt(process.env.SLITHER_SKIP_INTERVAL_MS, 10) || 3600000; // 1 hour default
    const lastCheckDate = new Date(Date.now() - skipIntervalMs);

    return db(this.tableName)
      .where('chain', 'base')
      .andWhere('score', '>=', scoreThreshold)
      .andWhere(function () {
        this.whereNull('slither').orWhere(
          'slitherLastCheck',
          '<',
          lastCheckDate
        );
      })
      .orderBy('id', 'desc')
      .limit(limit);
  }

  /**
   * Delete tokens based on criteria:
   * - Not marked for watch
   * - liquidityUsd = 0 OR pooledQuote = 0
   * - Created more than 1 hour ago
   */
  static async deleteOldInactiveTokens() {
    const minTime = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour in milliseconds
    const notOlderThan = parseInt(process.env.NOT_OLDER_DAYS, 10) || 10;
    const cutoffDate = new Date(
      Date.now() - notOlderThan * 24 * 60 * 60 * 1000
    );

    return (
      db(this.tableName)
        .where(function () {
          this.where('liquidityUsd', '<', 5000).orWhere('pooledQuote', '<', 2);
        })
        //.andWhere('dexscreenerLastCheck', '<', cutoffDate)
        .andWhere('poolCreatedAt', '<', minTime)
        .del()
    );
  }

  /**
   * Update token's Mythril analysis result.
   *
   * @param {number} id - Token ID.
   * @param {Object[]} mythrilResults - Array of Mythril detected issues.
   */
  static async updateMythrilResult(id, mythrilResults) {
    return db(this.tableName)
      .where({ id })
      .update({
        mythril: JSON.stringify(mythrilResults),
        mythrilLastCheck: db.fn.now(),
        updatedAt: db.fn.now(),
      });
  }

  static async updateSlitherResultWithSummary(id, analysisResult) {
    return db(this.tableName).where({ id }).update({
      slither: analysisResult, // Assuming a JSON column for detailed analysis
      slitherLastCheck: db.fn.now(),
      updatedAt: db.fn.now(),
    });
  }

  /**
   * Update token's Solidity download status.
   *
   * @param {number} id - Token ID.
   * @returns {Promise} - Database update promise.
   */
  static async updateSolidityDownloadStatus(id) {
    return db(this.tableName).where({ id }).update({
      solidityLastCheck: db.fn.now(),
      updatedAt: db.fn.now(),
    });
  }

  static async updateTokenSnifferResult(id, score, warning) {
    return db(this.tableName).where({ id }).update({
      tokenSnifferScore: score,
      tokenSnifferWarning: warning,
      tokenSnifferLastCheck: new Date(),
      updatedAt: db.fn.now(),
    });
  }

  /**
   * Update token with GoPlus result and calculated score.
   * @param {number} id - Token ID.
   * @param {Object} info - JSON response from GoPlus.
   * @param {number} score - Calculated score.
   */
  static async updateGoPlusResult(id, info, score) {
    return db(this.tableName)
      .where({ id })
      .update({
        goplus_info: JSON.stringify(info),
        goplus_score: score,
        updatedAt: db.fn.now(),
      });
  }

  /**
   * Update token by primary key (id).
   */
  static async updateToken(id, updates) {
    return db(this.tableName)
      .where({ id })
      .update({ ...updates, updatedAt: db.fn.now() });
  }

  /**
   * Find a token by ID.
   * @param {number} id - The token ID.
   * @returns {Promise<Array>} Array containing the token if found.
   */
  static async findTokensById(id) {
    return db(this.tableName).where({ id });
  }

  /**
   * Find tokens by address (either pool address or base token address).
   * @param {string} address - The token address.
   * @returns {Promise<Array>} Array containing the tokens if found.
   */
  static async findTokensByAddress(address) {
    return db(this.tableName)
      .where('address', address)
      .orWhere('baseToken', address);
  }

  /**
   * Find all tokens that have been paper traded.
   * @returns {Promise<Array>} Array of paper traded tokens.
   */
  static async findPaperTradedTokens() {
    const minAgeDays = parseFloat(process.env.PAPER_TRADING_MIN_AGE_DAYS) || 3;
    const query = db(this.tableName).where('paperTraded', true);

    if (minAgeDays > 0) {
      const cutoffDate = new Date(
        Date.now() - minAgeDays * 24 * 60 * 60 * 1000
      );
      query.andWhere('createdAt', '<=', cutoffDate);
    }

    return query.orderBy('paperInvestmentDate', 'desc');
  }
  /**
   * Find tokens sorted by highScoreReachedAt in ascending order and score in descending order.
   * @param {number} limit - Maximum number of tokens to return.
   * @param {number} offset - Number of tokens to skip.
   * @param {string} chain - Optional chain filter (e.g., 'base', 'ethereum').
   * @param {string} search - Optional search term for token name or address.
   * @param {string} highScoreFilter - Optional filter for highScoreReachedAt ('null' or 'withValue').
   * @param {number} minScore - Optional minimum score value.
   * @returns {Promise<Array>} Array of token objects.
   */
  static async findTokensByHighScore(
    limit = 100,
    offset = 0,
    chain = null,
    search = null,
    highScoreFilter = null,
    minScore = null
  ) {
    // Start building the query
    let query = db(this.tableName)
      // No longer filtering out null highScoreReachedAt values
      .orderBy([
        // Sort null highScoreReachedAt values first, then non-null values in ascending order
        {
          column: db.raw('CASE WHEN ?? IS NULL THEN 0 ELSE 1 END', [
            'highScoreReachedAt',
          ]),
          order: 'asc',
        },
        { column: 'highScoreReachedAt', order: 'asc', nulls: 'first' }, // Sort by highScoreReachedAt ascending
        { column: 'score', order: 'desc' }, // Then by score descending
      ]);

    // Apply chain filter if provided
    if (chain) {
      query = query.where('chain', chain);
    }

    // Apply search filter if provided
    if (search) {
      query = this.applyCaseInsensitiveSearch(query, search);
    }

    // Apply highScoreReachedAt filter if provided
    if (highScoreFilter === 'null') {
      query = query.whereNull('highScoreReachedAt');
    } else if (highScoreFilter === 'withValue') {
      query = query.whereNotNull('highScoreReachedAt');
    }

    // Apply minimum score filter if provided
    if (minScore !== null && !isNaN(minScore)) {
      query = query.where('score', '>=', minScore);
    }

    // Apply pagination
    return query.limit(limit).offset(offset);
  }

  /**
   * Get token counts grouped by chain with optional filters.
   * Mirrors filters used elsewhere (chain, search, highScoreFilter, minScore).
   * @param {{chain?: string|null, search?: string|null, highScoreFilter?: string|null, minScore?: number|null}} filters
   * @returns {Promise<Array<{chain: string, count: number}>>}
   */
  static async getCountsByChain(filters = {}) {
    const { chain, search, highScoreFilter, minScore } = filters;

    let query = db(this.tableName)
      .select('chain')
      .count('* as count')
      .groupBy('chain');

    if (chain) {
      query = query.where('chain', chain);
    }

    if (search) {
      query = this.applyCaseInsensitiveSearch(query, search);
    }

    if (highScoreFilter === 'null') {
      query = query.whereNull('highScoreReachedAt');
    } else if (highScoreFilter === 'withValue') {
      query = query.whereNotNull('highScoreReachedAt');
    }

    if (minScore !== null && !isNaN(minScore)) {
      query = query.where('score', '>=', minScore);
    }

    const rows = await query;
    return rows.map((r) => ({
      chain: String(r.chain).toLowerCase(),
      count: parseInt(r.count, 10) || 0,
    }));
  }
}

module.exports = TokenModel;
