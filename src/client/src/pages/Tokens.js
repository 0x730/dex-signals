import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Tokens.css';
import ScrollToTop from '../components/ScrollToTop';

const Tokens = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    limit: 100,
    offset: 0,
    total: 0,
  });
  const [filter, setFilter] = useState({
    chain: '',
    search: '',
    highScoreFilter: '',
    minScore: '',
  });

  useEffect(() => {
    fetchTokens();
  }, [
    pagination.offset,
    pagination.limit,
    filter.chain,
    filter.search,
    filter.highScoreFilter,
    filter.minScore,
  ]);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/tokens', {
        params: {
          limit: pagination.limit,
          offset: pagination.offset,
          chain: filter.chain || undefined,
          search: filter.search || undefined,
          highScoreFilter: filter.highScoreFilter || undefined,
          minScore: filter.minScore || undefined,
        },
      });

      if (response.data.success) {
        setTokens(response.data.data);
        setPagination((prev) => ({
          ...prev,
          total: response.data.pagination?.total || 0,
          returned: response.data.pagination?.returned || 0,
        }));
      } else {
        setError('Failed to fetch tokens');
      }
    } catch (err) {
      // Check if it's a network error (like "Et")
      if (err.name === 'Error' && err.message === 'Network Error') {
        setError(
          'Network error: Unable to connect to the server. Please check your connection and try again.'
        );
      } else {
        setError('An error occurred while fetching tokens');
      }
      console.error('Error fetching tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChainFilterChange = (e) => {
    setFilter((prev) => ({ ...prev, chain: e.target.value }));
    setPagination((prev) => ({ ...prev, offset: 0 })); // Reset to first page
  };

  const handleSearchChange = (e) => {
    setFilter((prev) => ({ ...prev, search: e.target.value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, offset: 0 })); // Reset to first page when searching
  };

  const handleHighScoreFilterChange = (e) => {
    setFilter((prev) => ({ ...prev, highScoreFilter: e.target.value }));
    setPagination((prev) => ({ ...prev, offset: 0 })); // Reset to first page
  };

  const handleMinScoreChange = (e) => {
    setFilter((prev) => ({ ...prev, minScore: e.target.value }));
    setPagination((prev) => ({ ...prev, offset: 0 })); // Reset to first page
  };

  const handleLimitChange = (e) => {
    setPagination((prev) => ({
      ...prev,
      limit: parseInt(e.target.value, 10),
      offset: 0, // Reset to first page when changing limit
    }));
  };

  const handlePrevPage = () => {
    if (pagination.offset - pagination.limit >= 0) {
      setPagination((prev) => ({ ...prev, offset: prev.offset - prev.limit }));
    }
  };

  const handleNextPage = () => {
    setPagination((prev) => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  // Filter tokens by search term
  const filteredTokens = tokens.filter((token) => {
    if (!filter.search) return true;

    const searchTerm = filter.search.toLowerCase();
    return (
      (token.tokenName && token.tokenName.toLowerCase().includes(searchTerm)) ||
      (token.address && token.address.toLowerCase().includes(searchTerm)) ||
      (token.baseToken && token.baseToken.toLowerCase().includes(searchTerm))
    );
  });

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
      case 'linea':
        return 'chain-linea';
      default:
        return '';
    }
  };

  return (
    <div className="container-fluid">
      <ScrollToTop />
      <div className="homepage-header">
        <div className="mb-3">
          <h1 className="mb-0">Latest Tokens</h1>
          <p className="lead">
            Explore the latest tokens across different blockchains and track
            their performance.
          </p>
        </div>
        <div className="homepage-stats">
          <div className="stat-card">
            <i className="fas fa-chart-line stat-icon"></i>
            <div className="stat-info">
              <span className="stat-value">{tokens.length}</span>
              <span className="stat-label">Tokens Available</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg'}
              alt="Ethereum"
            />
            <div className="stat-info">
              <span className="stat-value">
                {
                  tokens.filter(
                    (t) => t.chain === 'ethereum' || t.chain === 'eth'
                  ).length
                }
              </span>
              <span className="stat-label">Ethereum Tokens</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg'}
              alt="Arbitrum"
            />
            <div className="stat-info">
              <span className="stat-value">
                {tokens.filter((t) => t.chain === 'arbitrum').length}
              </span>
              <span className="stat-label">Arbitrum Tokens</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_base.jpg'}
              alt="Base"
            />
            <div className="stat-info">
              <span className="stat-value">
                {tokens.filter((t) => t.chain === 'base').length}
              </span>
              <span className="stat-label">Base Tokens</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg'}
              alt="Polygon"
            />
            <div className="stat-info">
              <span className="stat-value">
                {tokens.filter((t) => t.chain === 'polygon').length}
              </span>
              <span className="stat-label">Polygon Tokens</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_binance.jpg'}
              alt="BSC"
            />
            <div className="stat-info">
              <span className="stat-value">
                {tokens.filter((t) => t.chain === 'bsc').length}
              </span>
              <span className="stat-label">BSC Tokens</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_solana.jpg'}
              alt="Solana"
            />
            <div className="stat-info">
              <span className="stat-value">
                {tokens.filter((t) => t.chain === 'solana').length}
              </span>
              <span className="stat-label">Solana Tokens</span>
            </div>
          </div>
          <div className="stat-card">
            <img
              className="stat-icon"
              src={'https://icons.llamao.fi/icons/chains/rsz_linea.jpg'}
              alt="Linea"
            />
            <div className="stat-info">
              <span className="stat-value">
                {tokens.filter((t) => t.chain === 'linea').length}
              </span>
              <span className="stat-label">Linea Tokens</span>
            </div>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="row w-100">
          <div className="col-md-3 mb-2">
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
              <option value="linea">Linea</option>
            </select>
          </div>
          <div className="col-md-3 mb-2">
            <label htmlFor="items-per-page">Items per page:</label>
            <select
              id="items-per-page"
              className="form-select"
              value={pagination.limit}
              onChange={handleLimitChange}
            >
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="300">300</option>
            </select>
          </div>
          <div className="col-md-3 mb-2">
            <label htmlFor="highscore-filter">High Score Status:</label>
            <select
              id="highscore-filter"
              className="form-select"
              value={filter.highScoreFilter}
              onChange={handleHighScoreFilterChange}
            >
              <option value="">All</option>
              <option value="null">No High Score</option>
              <option value="withValue">Has High Score</option>
            </select>
          </div>
          <div className="col-md-3 mb-2">
            <label htmlFor="min-score">Minimum Score:</label>
            <input
              id="min-score"
              type="number"
              className="form-control"
              placeholder="Min score..."
              value={filter.minScore}
              onChange={handleMinScoreChange}
              min="0"
            />
          </div>
          <div className="col-md-12 mb-2">
            <label htmlFor="search-input">Search:</label>
            <form onSubmit={handleSearch}>
              <div className="input-group">
                <input
                  id="search-input"
                  type="text"
                  className="form-control"
                  placeholder="Search tokens..."
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
          <div className="loading-text">Loading tokens...</div>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Token Name</th>
                  <th>Chain</th>
                  <th>Score</th>
                  <th>High Score Reached At</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center">
                      No tokens found
                    </td>
                  </tr>
                ) : (
                  filteredTokens.map((token) => (
                    <tr key={token.id || token.address}>
                      <td>
                        <strong>{token.tokenName || 'Unknown'}</strong>
                        <div className="text-muted small d-flex align-items-center">
                          <span className="me-2">{token.address}</span>
                          {token.address && (
                            <>
                              <button
                                className="btn btn-sm btn-outline-secondary me-1"
                                onClick={() => {
                                  navigator.clipboard.writeText(token.address);
                                  alert('Address copied to clipboard!');
                                }}
                                title="Copy to clipboard"
                              >
                                <i className="fas fa-copy"></i>
                              </button>
                              <a
                                href={`https://dexscreener.com/${token.chain === 'ethereum' || token.chain === 'eth' ? 'ethereum' : token.chain === 'bsc' ? 'bsc' : token.chain === 'polygon' ? 'polygon' : token.chain}/${token.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-outline-secondary"
                                title="View on DexScreener"
                              >
                                <i className="fas fa-external-link-alt"></i>
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          {(token.chainIcon || token.chainIconUrl) && (
                            <img
                              className="chain-icon-inline me-2"
                              src={token.chainIcon || token.chainIconUrl}
                              alt={`${token.chain} icon`}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <span
                            className={`chain-badge ${getChainClass(token.chain)}`}
                          >
                            {token.chain}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`score-badge ${getScoreClass(token.score)}`}
                        >
                          {token.score || 'N/A'}
                        </span>
                      </td>
                      <td>
                        {token.highScoreReachedAt
                          ? new Date(token.highScoreReachedAt).toLocaleString()
                          : 'N/A'}
                      </td>
                      <td>
                        {token.createdAt
                          ? new Date(token.createdAt).toLocaleString()
                          : 'N/A'}
                      </td>
                      <td>
                        <Link
                          to={`/tokens/${token.id}`}
                          className="btn btn-sm btn-outline-primary"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              className="btn btn-secondary"
              onClick={handlePrevPage}
              disabled={pagination.offset === 0}
            >
              Previous
            </button>
            <span>
              Page {Math.floor(pagination.offset / pagination.limit) + 1}
            </span>
            <button
              className="btn btn-secondary"
              onClick={handleNextPage}
              disabled={filteredTokens.length < pagination.limit}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Tokens;
