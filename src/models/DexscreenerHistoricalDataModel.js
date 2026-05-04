const db = require('../db');

/**
 * Model for the dexscreener_historical_data table
 * This table stores historical data from DexScreener for each pool
 */
class DexscreenerHistoricalDataModel {
  static tableName = 'dexscreener_historical_data';

  /**
   * Insert historical data from DexScreener
   *
   * @param {Object} data - The data to insert
   * @returns {Promise} - A promise that resolves when the insert is complete
   */
  static async insertHistoricalData(data) {
    return db(this.tableName).insert({
      ...data,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  }

  /**
   * Delete historical data older than the specified number of days
   *
   * @param {number} days - The number of days to keep data for
   * @returns {Promise} - A promise that resolves when the delete is complete
   */
  static async deleteOldData(days = 30) {
    // Calculate the cutoff timestamp (current time - days in seconds)
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    return db(this.tableName).where('timestamp', '<', cutoffTimestamp).del();
  }

  /**
   * Find historical data for a specific pool
   *
   * @param {string} chain - The blockchain network
   * @param {string} poolAddress - The pool address
   * @param {number} limit - Maximum number of records to return
   * @param {number} offset - Number of records to skip
   * @returns {Promise<Array>} - Array of historical data records
   */
  static async findHistoricalDataForPool(
    chain,
    poolAddress,
    limit = 100,
    offset = 0
  ) {
    return db(this.tableName)
      .where({ chain, poolAddress })
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .offset(offset);
  }

  /**
   * Find the most recent historical data for a specific pool
   *
   * @param {string} chain - The blockchain network
   * @param {string} poolAddress - The pool address
   * @returns {Promise<Object>} - The most recent historical data record
   */
  static async findMostRecentDataForPool(chain, poolAddress) {
    return db(this.tableName)
      .where({ chain, poolAddress })
      .orderBy('timestamp', 'desc')
      .first();
  }
}

module.exports = DexscreenerHistoricalDataModel;
