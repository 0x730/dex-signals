import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './PaperTrading.css';

const PaperTrading = () => {
  const [signals, setSignals] = useState([]);
  const [filteredSignals, setFilteredSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    chain: '',
    search: '',
  });
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    fetchSignals();
    fetchPortfolio();
  }, []);

  useEffect(() => {
    filterSignals();
  }, [signals, filter]);

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        '/signals/paper-trading-signals-with-names'
      );
      setSignals(response.data);
      setFilteredSignals(response.data);
    } catch (err) {
      // Check if it's a network error (like "Et")
      if (err.name === 'Error' && err.message === 'Network Error') {
        setError(
          'Network error: Unable to connect to the server. Please check your connection and try again.'
        );
      } else {
        setError('An error occurred while fetching paper trading signals');
      }
      console.error('Error fetching signals:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async () => {
    try {
      // Use the /signals/paper endpoint which is working
      const response = await axios.get('/signals/paper');
      if (response.data && response.data.length > 0) {
        // Calculate portfolio metrics from the signals data
        let totalInvested = 0;
        let totalCurrentValue = 0;
        let totalProfitLoss = 0;

        const positions = response.data.map((signal) => {
          const investmentAmount = parseFloat(signal.amount) || 0;
          const currentValue =
            parseFloat(signal.paperCurrentValue) || investmentAmount;
          const profitLoss = parseFloat(signal.paperProfitLoss) || 0;

          totalInvested += investmentAmount;
          totalCurrentValue += currentValue;
          totalProfitLoss += profitLoss;

          return {
            id: signal.id,
            symbol: signal.tokenName,
            investmentAmount: investmentAmount,
            currentValue: currentValue,
            profitLoss: profitLoss,
          };
        });

        const profitLossPercent =
          totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

        setPortfolio({
          initialInvestment: totalInvested,
          totalValue: totalCurrentValue,
          profitLoss: profitLossPercent,
          positions: positions,
        });
      }
    } catch (err) {
      // Check if it's a network error (like "Et")
      if (err.name === 'Error' && err.message === 'Network Error') {
        // For network errors, we should inform the user
        setError(
          'Network error: Unable to connect to the server. Portfolio data may be unavailable.'
        );
      }
      console.error('Error fetching portfolio:', err);
      // For other errors, don't set an error, just log it - we still have the signals data
    }
  };

  const filterSignals = () => {
    let filtered = [...signals];

    // Apply chain filter
    if (filter.chain) {
      filtered = filtered.filter((signal) => signal.chain === filter.chain);
    }

    // Apply search filter
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      filtered = filtered.filter((signal) => {
        const searchableText =
          (signal.tokenName || '') +
          (signal.id || '') +
          (signal.chain || '') +
          (signal.action || '') +
          (signal.address || '');

        return searchableText.toLowerCase().includes(searchTerm);
      });
    }

    setFilteredSignals(filtered);
  };

  const handleChainFilterChange = (e) => {
    setFilter((prev) => ({ ...prev, chain: e.target.value }));
  };

  const handleSearchChange = (e) => {
    setFilter((prev) => ({ ...prev, search: e.target.value }));
  };

  const handleResetPaperTrading = async () => {
    if (
      window.confirm(
        'Are you sure you want to reset paper trading? This will clear all positions.'
      )
    ) {
      try {
        setLoading(true);
        // Use the new /signals/paper/reset endpoint
        const response = await axios.get('/signals/paper/reset');
        if (response.data.success) {
          alert('Paper trading reset successful');
          fetchSignals();
          fetchPortfolio();
        } else {
          setError('Failed to reset paper trading');
        }
      } catch (err) {
        // Check if it's a network error (like "Et")
        if (err.name === 'Error' && err.message === 'Network Error') {
          setError(
            'Network error: Unable to connect to the server. Please check your connection and try again.'
          );
        } else {
          setError('An error occurred while resetting paper trading');
        }
        console.error('Error resetting paper trading:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const getScoreClass = (score) => {
    if (score >= 50) return 'score-high';
    if (score >= 20) return 'score-medium';
    return 'score-low';
  };

  const getChainClass = (chain) => {
    switch (chain) {
      case 'base':
        return 'chain-base';
      case 'arbitrum':
        return 'chain-arbitrum';
      case 'ethereum':
      case 'eth':
        return 'chain-ethereum';
      case 'polygon':
        return 'chain-polygon';
      case 'bsc':
        return 'chain-ethereum';
      case 'solana':
        return 'chain-solana';
      default:
        return '';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="container-fluid">
      <h1>Paper Trading Signals</h1>

      {portfolio && (
        <div className="portfolio-summary">
          <div className="row">
            <div className="col-md-3">
              <div className="portfolio-card">
                <div className="portfolio-value">
                  ${portfolio.totalValue.toFixed(2)}
                </div>
                <div className="portfolio-label">Total Value</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="portfolio-card">
                <div className="portfolio-value">
                  ${portfolio.initialInvestment.toFixed(2)}
                </div>
                <div className="portfolio-label">Initial Investment</div>
              </div>
            </div>
            <div className="col-md-3">
              <div
                className={`portfolio-card ${portfolio.profitLoss >= 0 ? 'profit' : 'loss'}`}
              >
                <div className="portfolio-value">
                  {portfolio.profitLoss >= 0 ? '+' : ''}
                  {portfolio.profitLoss.toFixed(2)}%
                </div>
                <div className="portfolio-label">Profit/Loss</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="portfolio-card">
                <div className="portfolio-value">
                  {portfolio.positions.length}
                </div>
                <div className="portfolio-label">Active Positions</div>
              </div>
            </div>
          </div>
          <div className="text-end mt-3">
            <button
              className="btn btn-danger"
              onClick={handleResetPaperTrading}
              disabled={loading}
            >
              Reset Paper Trading
            </button>
          </div>
        </div>
      )}

      <div className="filters">
        <div className="row w-100">
          <div className="col-md-4 mb-2">
            <label htmlFor="chain-filter">Chain:</label>
            <select
              id="chain-filter"
              className="form-select"
              value={filter.chain}
              onChange={handleChainFilterChange}
            >
              <option value="">All Chains</option>
              <option value="base">Base</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="ethereum">Ethereum</option>
              <option value="polygon">Polygon</option>
              <option value="bsc">BSC</option>
              <option value="solana">Solana</option>
            </select>
          </div>
          <div className="col-md-8 mb-2">
            <label htmlFor="search">Search:</label>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="input-group">
                <input
                  type="text"
                  id="search"
                  className="form-control"
                  placeholder="Search signals..."
                  value={filter.search}
                  onChange={handleSearchChange}
                />
                <button type="submit" className="btn btn-search">
                  <i className="fas fa-search"></i> Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {error && (
        <div className="error">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading signals...</div>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Token Name</th>
                <th>Chain</th>
                <th>Action</th>
                <th>Score</th>
                <th>Timestamp</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center">
                    No signals found
                  </td>
                </tr>
              ) : (
                filteredSignals.map((signal) => (
                  <tr key={signal.id}>
                    <td>
                      <strong>{signal.tokenName || 'Unknown'}</strong>
                    </td>
                    <td>
                      <span
                        className={`chain-badge ${getChainClass(signal.chain)}`}
                      >
                        {signal.chain}
                      </span>
                    </td>
                    <td>{signal.action || 'N/A'}</td>
                    <td>
                      <span
                        className={`score-badge ${getScoreClass(signal.score)}`}
                      >
                        {signal.score || 'N/A'}
                      </span>
                    </td>
                    <td>{formatDate(signal.timestamp)}</td>
                    <td>{signal.amount || 'N/A'}</td>
                    <td>
                      {signal.id && (
                        <Link
                          to={`/tokens/${signal.tokenId}`}
                          className="btn btn-sm btn-outline-primary"
                        >
                          View Details
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PaperTrading;
