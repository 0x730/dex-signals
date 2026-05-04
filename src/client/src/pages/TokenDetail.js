import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './TokenDetail.css';
import TokenCharts from '../components/TokenCharts';
import ScrollToTop from '../components/ScrollToTop';

const TokenDetail = () => {
  const { id } = useParams();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [parsedOtherData, setParsedOtherData] = useState(null);
  const [parsedGtInfo, setParsedGtInfo] = useState(null);
  const [parsedGoPlusInfo, setParsedGoPlusInfo] = useState(null);

  useEffect(() => {
    fetchTokenDetails();
  }, [id]);

  // Parse historical data from dexscreener sample if no data is returned from API
  useEffect(() => {
    if (historicalData.length === 0 && token) {
      try {
        // Check if we have dexscreener data in the token object
        if (token.dexscreenerData) {
          const parsedData =
            typeof token.dexscreenerData === 'object'
              ? token.dexscreenerData
              : JSON.parse(token.dexscreenerData);

          if (parsedData && Array.isArray(parsedData)) {
            setHistoricalData(parsedData);
          }
        }
      } catch (error) {
        console.error('Error parsing dexscreener data:', error);
      }
    }
  }, [historicalData, token]);

  const fetchTokenDetails = async () => {
    setLoading(true);
    try {
      // Fetch token details
      const response = await axios.get(`/tokens/${id}`);

      if (response.data.success) {
        const tokenData = response.data.data;
        setToken(tokenData);

        // Parse otherData if it exists
        if (tokenData && tokenData.otherData) {
          try {
            // Check if otherData is already an object
            const parsedData =
              typeof tokenData.otherData === 'object' &&
              tokenData.otherData !== null
                ? tokenData.otherData
                : JSON.parse(tokenData.otherData);
            setParsedOtherData(parsedData);
            console.log('Parsed otherData:', parsedData);
          } catch (parseErr) {
            console.error('Error parsing otherData:', parseErr);
            // Don't set an error, just log it
          }
        }

        // Parse gtInfo if it exists
        if (tokenData && tokenData.gtInfo) {
          try {
            // Check if gtInfo is already an object
            const parsedGtData =
              typeof tokenData.gtInfo === 'object' && tokenData.gtInfo !== null
                ? tokenData.gtInfo
                : JSON.parse(tokenData.gtInfo);
            setParsedGtInfo(parsedGtData);
            console.log('Parsed gtInfo:', parsedGtData);
          } catch (parseErr) {
            console.error('Error parsing gtInfo:', parseErr);
            // Don't set an error, just log it
          }
        }

        // Parse goplus_info if it exists
        if (tokenData && tokenData.goplus_info) {
          try {
            // Check if goplus_info is already an object
            const parsedGoPlusData =
              typeof tokenData.goplus_info === 'object' &&
              tokenData.goplus_info !== null
                ? tokenData.goplus_info
                : JSON.parse(tokenData.goplus_info);
            setParsedGoPlusInfo(parsedGoPlusData);
            console.log('Parsed goplus_info:', parsedGoPlusData);
          } catch (parseErr) {
            console.error('Error parsing goplus_info:', parseErr);
            // Don't set an error, just log it
          }
        }

        // If we have a token, try to fetch historical data
        if (tokenData) {
          try {
            const historyResponse = await axios.get(
              `/tokens/${id}/historical-data`
            );
            if (historyResponse.data.success) {
              setHistoricalData(historyResponse.data.data || []);
            }
          } catch (historyErr) {
            // Check if it's a network error (like "Et")
            if (
              historyErr.name === 'Error' &&
              historyErr.message === 'Network Error'
            ) {
              console.error(
                'Network error while fetching historical data:',
                historyErr
              );
              // We don't set the main error state for historical data issues,
              // but we could display a specific message for historical data if needed
            } else {
              console.error('Error fetching historical data:', historyErr);
            }
            // Don't set an error, just log it - we still have the token data
          }
        }
      } else {
        setError('Failed to fetch token details');
      }
    } catch (err) {
      // Check if it's a network error (like "Et")
      if (err.name === 'Error' && err.message === 'Network Error') {
        setError(
          'Network error: Unable to connect to the server. Please check your connection and try again.'
        );
      } else {
        setError('An error occurred while fetching token details');
      }
      console.error('Error fetching token details:', err);
    } finally {
      setLoading(false);
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  // Format currency values
  const formatCurrency = (value) => {
    if (value === undefined || value === null) return 'N/A';

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numValue)) return 'N/A';

    // Format based on size
    if (numValue >= 1000000000) {
      return `$${(numValue / 1000000000).toFixed(2)}B`;
    } else if (numValue >= 1000000) {
      return `$${(numValue / 1000000).toFixed(2)}M`;
    } else if (numValue >= 1000) {
      return `$${(numValue / 1000).toFixed(2)}K`;
    } else {
      return `$${numValue.toFixed(2)}`;
    }
  };

  // Format percentage values
  const formatPercentage = (value) => {
    if (value === undefined || value === null) return 'N/A';

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numValue)) return 'N/A';

    return `${numValue > 0 ? '+' : ''}${numValue.toFixed(2)}%`;
  };

  // Get CSS class for percentage values
  const getPercentageClass = (value) => {
    if (value === undefined || value === null) return '';

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numValue)) return '';

    return numValue > 0 ? 'text-success' : numValue < 0 ? 'text-danger' : '';
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading token details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid">
        <div className="error">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
        </div>
        <div className="text-center mt-4">
          <Link to="/tokens" className="btn btn-primary">
            Back to Tokens
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="container-fluid">
        <div className="alert alert-warning">
          <i className="fas fa-exclamation-triangle me-2"></i>
          Token not found
        </div>
        <div className="text-center mt-4">
          <Link to="/tokens" className="btn btn-primary">
            Back to Tokens
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <ScrollToTop />
      <div className="token-header">
        <div className="d-flex align-items-center">
          {parsedGtInfo && parsedGtInfo.image && parsedGtInfo.image.thumb && (
            <img
              src={parsedGtInfo.image.thumb}
              alt={parsedGtInfo.name || token.tokenName}
              className="token-logo me-3"
              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            />
          )}
          <h1>{parsedGtInfo?.name || token.tokenName || 'Unknown Token'}</h1>
          {parsedGtInfo?.symbol && (
            <span className="token-symbol ms-2">({parsedGtInfo.symbol})</span>
          )}
        </div>
        <div className="token-meta">
          <span className={`chain-badge ${getChainClass(token.chain)}`}>
            {token.chain}
          </span>
          <span className={`score-badge ${getScoreClass(token.score)}`}>
            Score: {token.score || 'N/A'}
          </span>
        </div>
      </div>

      {/* Actions Section */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2">
            <Link to="/tokens" className="btn btn-outline-primary">
              Back to Tokens
            </Link>

            {token.chain === 'base' && token.address && (
              <a
                href={`https://basescan.org/address/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-secondary"
              >
                View on BaseScan
              </a>
            )}

            {token.chain === 'arbitrum' && token.address && (
              <a
                href={`https://arbiscan.io/address/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-secondary"
              >
                View on ArbiScan
              </a>
            )}

            {token.address && token.chain === 'solana' && (
              <a
                href={`https://solscan.io/account/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-secondary"
              >
                View on Solscan
              </a>
            )}
            {token.address &&
              [
                'ethereum',
                'eth',
                'base',
                'arbitrum',
                'polygon',
                'bsc',
              ].includes(token.chain) && (
                <a
                  href={`https://${token.chain === 'ethereum' || token.chain === 'eth' ? 'etherscan.io' : token.chain === 'base' ? 'basescan.org' : token.chain === 'arbitrum' ? 'arbiscan.io' : token.chain === 'polygon' ? 'polygonscan.com' : token.chain === 'bsc' ? 'bscscan.com' : 'etherscan.io'}/address/${token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary"
                >
                  View on Explorer
                </a>
              )}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-12">
          <div className="card mb-4">
            <div className="card-header">
              <h3>Token Information</h3>
            </div>
            <div className="card-body">
              <div className="token-info-grid">
                <div className="info-item">
                  <div className="info-label">Address</div>
                  <div className="info-value d-flex align-items-center">
                    <code className="me-2">{token.address}</code>
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
                  </div>
                </div>

                {token.baseToken && (
                  <div className="info-item">
                    <div className="info-label">Base Token</div>
                    <div className="info-value">
                      <code>{token.baseToken}</code>
                    </div>
                  </div>
                )}

                <div className="info-item">
                  <div className="info-label">Created At</div>
                  <div className="info-value">
                    {formatDate(token.createdAt)}
                  </div>
                </div>

                {token.highScoreReachedAt && (
                  <div className="info-item">
                    <div className="info-label">High Score Reached At</div>
                    <div className="info-value">
                      {formatDate(token.highScoreReachedAt)}
                    </div>
                  </div>
                )}

                {token.paperInvestmentDate && (
                  <div className="info-item">
                    <div className="info-label">Paper Investment Date</div>
                    <div className="info-value">
                      {formatDate(token.paperInvestmentDate)}
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Token Information from gtInfo */}
              {parsedGtInfo && (
                <div className="mt-4">
                  {/* Token Overview Section */}
                  <div className="token-overview mb-4">
                    <div className="d-flex align-items-center mb-3">
                      {parsedGtInfo.image && parsedGtInfo.image.small && (
                        <img
                          src={parsedGtInfo.image.small}
                          alt={parsedGtInfo.name || token.tokenName}
                          className="token-logo me-3"
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                          }}
                        />
                      )}
                      <div>
                        <h3 className="mb-1">
                          {parsedGtInfo.name || token.tokenName}
                        </h3>
                        {parsedGtInfo.symbol && (
                          <div className="token-symbol">
                            {parsedGtInfo.symbol}
                          </div>
                        )}
                        {parsedGtInfo.gt_score && (
                          <div className="mt-2">
                            <span
                              className={`score-badge ${getScoreClass(parsedGtInfo.gt_score)}`}
                            >
                              Score:{' '}
                              {parseFloat(parsedGtInfo.gt_score).toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Token Description */}
                    {parsedGtInfo.description && (
                      <div className="mb-4">
                        <h4 className="border-bottom pb-2">Description</h4>
                        <p className="token-description">
                          {parsedGtInfo.description}
                        </p>
                      </div>
                    )}

                    {/* Categories */}
                    {parsedGtInfo.categories &&
                      parsedGtInfo.categories.length > 0 && (
                        <div className="mb-4">
                          <h4 className="border-bottom pb-2">Categories</h4>
                          <div className="categories-container">
                            {parsedGtInfo.categories.map((category, index) => (
                              <span
                                key={index}
                                className="badge bg-success me-2 mb-2 p-2"
                              >
                                {category}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Holders Information */}
                    {parsedGtInfo.holders && (
                      <div className="mb-4">
                        <h4 className="border-bottom pb-2">
                          Holders Information
                        </h4>
                        <div className="row align-items-center">
                          <div className="col-md-4">
                            <div className="card text-center p-3 mb-3">
                              <h5 className="text-muted">Total Holders</h5>
                              <h3>
                                {parsedGtInfo.holders.count?.toLocaleString() ||
                                  'N/A'}
                              </h3>
                              <small className="text-muted">
                                Last updated:{' '}
                                {parsedGtInfo.holders.last_updated
                                  ? new Date(
                                      parsedGtInfo.holders.last_updated
                                    ).toLocaleDateString()
                                  : 'N/A'}
                              </small>
                            </div>
                          </div>

                          {parsedGtInfo.holders.distribution_percentage && (
                            <div className="col-md-8">
                              <h5>Distribution</h5>
                              <div className="distribution-chart mb-3">
                                <div
                                  className="progress"
                                  style={{ height: '30px' }}
                                >
                                  <div
                                    className="progress-bar bg-danger"
                                    style={{
                                      width: `${parsedGtInfo.holders.distribution_percentage.top_10}%`,
                                    }}
                                    title={`Top 10: ${parsedGtInfo.holders.distribution_percentage.top_10}%`}
                                  >
                                    Top 10
                                  </div>
                                  <div
                                    className="progress-bar bg-warning"
                                    style={{
                                      width: `${parsedGtInfo.holders.distribution_percentage['11_30']}%`,
                                    }}
                                    title={`11-30: ${parsedGtInfo.holders.distribution_percentage['11_30']}%`}
                                  >
                                    11-30
                                  </div>
                                  <div
                                    className="progress-bar bg-info"
                                    style={{
                                      width: `${parsedGtInfo.holders.distribution_percentage['31_50']}%`,
                                    }}
                                    title={`31-50: ${parsedGtInfo.holders.distribution_percentage['31_50']}%`}
                                  >
                                    31-50
                                  </div>
                                  <div
                                    className="progress-bar bg-success"
                                    style={{
                                      width: `${parsedGtInfo.holders.distribution_percentage.rest}%`,
                                    }}
                                    title={`Rest: ${parsedGtInfo.holders.distribution_percentage.rest}%`}
                                  >
                                    Rest
                                  </div>
                                </div>
                              </div>
                              <div className="row">
                                <div className="col-md-3 mb-2">
                                  <span className="badge bg-danger me-1"></span>
                                  <small>
                                    Top 10:{' '}
                                    {
                                      parsedGtInfo.holders
                                        .distribution_percentage.top_10
                                    }
                                    %
                                  </small>
                                </div>
                                <div className="col-md-3 mb-2">
                                  <span className="badge bg-warning me-1"></span>
                                  <small>
                                    11-30:{' '}
                                    {
                                      parsedGtInfo.holders
                                        .distribution_percentage['11_30']
                                    }
                                    %
                                  </small>
                                </div>
                                <div className="col-md-3 mb-2">
                                  <span className="badge bg-info me-1"></span>
                                  <small>
                                    31-50:{' '}
                                    {
                                      parsedGtInfo.holders
                                        .distribution_percentage['31_50']
                                    }
                                    %
                                  </small>
                                </div>
                                <div className="col-md-3 mb-2">
                                  <span className="badge bg-success me-1"></span>
                                  <small>
                                    Rest:{' '}
                                    {
                                      parsedGtInfo.holders
                                        .distribution_percentage.rest
                                    }
                                    %
                                  </small>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* GT Score Details */}
                    {parsedGtInfo.gt_score_details && (
                      <div className="mb-4">
                        <h4 className="border-bottom pb-2">Score Details</h4>
                        <div className="row">
                          {Object.entries(parsedGtInfo.gt_score_details).map(
                            ([key, value]) => (
                              <div className="col-md-3 col-6 mb-3" key={key}>
                                <div className="card text-center p-2">
                                  <h6 className="text-capitalize">{key}</h6>
                                  <h4>{value}</h4>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {(parsedOtherData || parsedGtInfo) && (
            <div className="card mb-4">
              <div className="card-header">
                <h3>Market Information</h3>
              </div>
              <div className="card-body">
                {/* Market Overview Cards */}
                <div className="row mb-4">
                  {/* Price Card */}
                  <div className="col-md-3 col-sm-6 mb-3">
                    <div className="card h-100 market-card">
                      <div className="card-body text-center">
                        <h5 className="text-muted mb-3">Current Price</h5>
                        {parsedOtherData &&
                        parsedOtherData.base_token_price_usd ? (
                          <h3 className="mb-2">
                            $
                            {parseFloat(
                              parsedOtherData.base_token_price_usd
                            ).toFixed(8)}
                          </h3>
                        ) : parsedGtInfo &&
                          parsedGtInfo.market_data &&
                          parsedGtInfo.market_data.current_price &&
                          parsedGtInfo.market_data.current_price.usd ? (
                          <h3 className="mb-2">
                            $
                            {parseFloat(
                              parsedGtInfo.market_data.current_price.usd
                            ).toFixed(8)}
                          </h3>
                        ) : (
                          <h3 className="mb-2">N/A</h3>
                        )}
                        {parsedOtherData &&
                        parsedOtherData.price_change_percentage &&
                        parsedOtherData.price_change_percentage.h24 ? (
                          <div
                            className={getPercentageClass(
                              parsedOtherData.price_change_percentage.h24
                            )}
                          >
                            <i
                              className={`fas fa-arrow-${parseFloat(parsedOtherData.price_change_percentage.h24) >= 0 ? 'up' : 'down'} me-1`}
                            ></i>
                            {formatPercentage(
                              parsedOtherData.price_change_percentage.h24
                            )}{' '}
                            (24h)
                          </div>
                        ) : parsedGtInfo &&
                          parsedGtInfo.market_data &&
                          parsedGtInfo.market_data
                            .price_change_percentage_24h ? (
                          <div
                            className={getPercentageClass(
                              parsedGtInfo.market_data
                                .price_change_percentage_24h
                            )}
                          >
                            <i
                              className={`fas fa-arrow-${parseFloat(parsedGtInfo.market_data.price_change_percentage_24h) >= 0 ? 'up' : 'down'} me-1`}
                            ></i>
                            {formatPercentage(
                              parsedGtInfo.market_data
                                .price_change_percentage_24h
                            )}{' '}
                            (24h)
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Market Cap Card */}
                  <div className="col-md-3 col-sm-6 mb-3">
                    <div className="card h-100 market-card">
                      <div className="card-body text-center">
                        <h5 className="text-muted mb-3">Market Cap</h5>
                        <h3 className="mb-2">
                          {parsedOtherData && parsedOtherData.market_cap_usd
                            ? formatCurrency(parsedOtherData.market_cap_usd)
                            : parsedOtherData && parsedOtherData.fdv_usd
                              ? formatCurrency(parsedOtherData.fdv_usd) +
                                ' (FDV)'
                              : parsedGtInfo &&
                                  parsedGtInfo.market_data &&
                                  parsedGtInfo.market_data.market_cap &&
                                  parsedGtInfo.market_data.market_cap.usd
                                ? formatCurrency(
                                    parsedGtInfo.market_data.market_cap.usd
                                  )
                                : 'N/A'}
                        </h3>
                        <div className="text-muted small">
                          {parsedOtherData &&
                            parsedOtherData.pool_created_at && (
                              <>
                                Pool created:{' '}
                                {new Date(
                                  parsedOtherData.pool_created_at
                                ).toLocaleDateString()}
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Liquidity Card */}
                  <div className="col-md-3 col-sm-6 mb-3">
                    <div className="card h-100 market-card">
                      <div className="card-body text-center">
                        <h5 className="text-muted mb-3">Liquidity</h5>
                        <h3 className="mb-2">
                          {parsedOtherData && parsedOtherData.reserve_in_usd
                            ? formatCurrency(parsedOtherData.reserve_in_usd)
                            : parsedGtInfo &&
                                parsedGtInfo.market_data &&
                                parsedGtInfo.market_data.total_liquidity
                              ? formatCurrency(
                                  parsedGtInfo.market_data.total_liquidity
                                )
                              : 'N/A'}
                        </h3>
                        <div className="text-muted small">
                          {parsedOtherData &&
                            parsedOtherData.quote_token_price_usd && (
                              <>
                                Quote token: $
                                {parseFloat(
                                  parsedOtherData.quote_token_price_usd
                                ).toFixed(2)}
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Volume Card */}
                  <div className="col-md-3 col-sm-6 mb-3">
                    <div className="card h-100 market-card">
                      <div className="card-body text-center">
                        <h5 className="text-muted mb-3">24h Volume</h5>
                        <h3 className="mb-2">
                          {parsedOtherData &&
                          parsedOtherData.volume_usd &&
                          parsedOtherData.volume_usd.h24
                            ? formatCurrency(parsedOtherData.volume_usd.h24)
                            : parsedGtInfo &&
                                parsedGtInfo.market_data &&
                                parsedGtInfo.market_data.total_volume &&
                                parsedGtInfo.market_data.total_volume.usd
                              ? formatCurrency(
                                  parsedGtInfo.market_data.total_volume.usd
                                )
                              : 'N/A'}
                        </h3>
                        <div className="text-muted small">
                          {parsedOtherData &&
                            parsedOtherData.transactions &&
                            parsedOtherData.transactions.h24 && (
                              <>
                                Txns:{' '}
                                {parsedOtherData.transactions.h24.buys || 0}{' '}
                                buys,{' '}
                                {parsedOtherData.transactions.h24.sells || 0}{' '}
                                sells
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Price Change Section */}
                {((parsedOtherData &&
                  parsedOtherData.price_change_percentage) ||
                  (parsedGtInfo &&
                    parsedGtInfo.market_data &&
                    parsedGtInfo.market_data.price_change_percentage_24h)) && (
                  <div className="mb-4">
                    <h4 className="border-bottom pb-2">Price Change</h4>
                    <div className="row">
                      {/* 1h Price Change */}
                      {parsedOtherData &&
                        parsedOtherData.price_change_percentage &&
                        parsedOtherData.price_change_percentage.h1 &&
                        parseFloat(
                          parsedOtherData.price_change_percentage.h1
                        ) !== 0 && (
                          <div className="col-md-4 mb-3">
                            <div className="card">
                              <div className="card-body">
                                <div className="d-flex justify-content-between align-items-center">
                                  <h5 className="mb-0">1 Hour</h5>
                                  <span
                                    className={`badge ${parseFloat(parsedOtherData.price_change_percentage.h1) >= 0 ? 'bg-success' : 'bg-danger'} p-2`}
                                  >
                                    {formatPercentage(
                                      parsedOtherData.price_change_percentage.h1
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* 6h Price Change */}
                      {parsedOtherData &&
                        parsedOtherData.price_change_percentage &&
                        parsedOtherData.price_change_percentage.h6 &&
                        parseFloat(
                          parsedOtherData.price_change_percentage.h6
                        ) !== 0 && (
                          <div className="col-md-4 mb-3">
                            <div className="card">
                              <div className="card-body">
                                <div className="d-flex justify-content-between align-items-center">
                                  <h5 className="mb-0">6 Hours</h5>
                                  <span
                                    className={`badge ${parseFloat(parsedOtherData.price_change_percentage.h6) >= 0 ? 'bg-success' : 'bg-danger'} p-2`}
                                  >
                                    {formatPercentage(
                                      parsedOtherData.price_change_percentage.h6
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* 24h Price Change */}
                      {parsedOtherData &&
                      parsedOtherData.price_change_percentage &&
                      parsedOtherData.price_change_percentage.h24 &&
                      parseFloat(
                        parsedOtherData.price_change_percentage.h24
                      ) !== 0 ? (
                        <div className="col-md-4 mb-3">
                          <div className="card">
                            <div className="card-body">
                              <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">24 Hours</h5>
                                <span
                                  className={`badge ${parseFloat(parsedOtherData.price_change_percentage.h24) >= 0 ? 'bg-success' : 'bg-danger'} p-2`}
                                >
                                  {formatPercentage(
                                    parsedOtherData.price_change_percentage.h24
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        parsedGtInfo &&
                        parsedGtInfo.market_data &&
                        parsedGtInfo.market_data.price_change_percentage_24h &&
                        parseFloat(
                          parsedGtInfo.market_data.price_change_percentage_24h
                        ) !== 0 && (
                          <div className="col-md-4 mb-3">
                            <div className="card">
                              <div className="card-body">
                                <div className="d-flex justify-content-between align-items-center">
                                  <h5 className="mb-0">24 Hours</h5>
                                  <span
                                    className={`badge ${parseFloat(parsedGtInfo.market_data.price_change_percentage_24h) >= 0 ? 'bg-success' : 'bg-danger'} p-2`}
                                  >
                                    {formatPercentage(
                                      parsedGtInfo.market_data
                                        .price_change_percentage_24h
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Volume Data */}
                {parsedOtherData && parsedOtherData.volume_usd && (
                  <div className="mb-4">
                    <h4 className="border-bottom pb-2">Volume</h4>
                    <div className="row">
                      {/* 1h Volume */}
                      {parsedOtherData.volume_usd.h1 && (
                        <div className="col-md-4 mb-3">
                          <div className="card">
                            <div className="card-body">
                              <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">1 Hour</h5>
                                <span className="fw-bold">
                                  {formatCurrency(
                                    parsedOtherData.volume_usd.h1
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 6h Volume */}
                      {parsedOtherData.volume_usd.h6 && (
                        <div className="col-md-4 mb-3">
                          <div className="card">
                            <div className="card-body">
                              <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">6 Hours</h5>
                                <span className="fw-bold">
                                  {formatCurrency(
                                    parsedOtherData.volume_usd.h6
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 24h Volume */}
                      {parsedOtherData.volume_usd.h24 && (
                        <div className="col-md-4 mb-3">
                          <div className="card">
                            <div className="card-body">
                              <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">24 Hours</h5>
                                <span className="fw-bold">
                                  {formatCurrency(
                                    parsedOtherData.volume_usd.h24
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Transaction Data */}
                {parsedOtherData && parsedOtherData.transactions && (
                  <div className="mb-4">
                    <h4 className="border-bottom pb-2">Transactions</h4>
                    <div className="row">
                      {/* 1h Transactions */}
                      {parsedOtherData.transactions.h1 && (
                        <div className="col-md-4 mb-3">
                          <div className="card h-100">
                            <div className="card-header bg-light">
                              <h5 className="mb-0">1 Hour</h5>
                            </div>
                            <div className="card-body">
                              <div className="row text-center">
                                <div className="col-6 mb-3">
                                  <div className="text-success">
                                    <i className="fas fa-arrow-up mb-2"></i>
                                    <h4>
                                      {parsedOtherData.transactions.h1.buys ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">Buys</div>
                                  </div>
                                </div>
                                <div className="col-6 mb-3">
                                  <div className="text-danger">
                                    <i className="fas fa-arrow-down mb-2"></i>
                                    <h4>
                                      {parsedOtherData.transactions.h1.sells ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">
                                      Sells
                                    </div>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div>
                                    <h4>
                                      {parsedOtherData.transactions.h1.buyers ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">
                                      Buyers
                                    </div>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div>
                                    <h4>
                                      {parsedOtherData.transactions.h1
                                        .sellers || 0}
                                    </h4>
                                    <div className="small text-muted">
                                      Sellers
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 6h Transactions */}
                      {parsedOtherData.transactions.h6 && (
                        <div className="col-md-4 mb-3">
                          <div className="card h-100">
                            <div className="card-header bg-light">
                              <h5 className="mb-0">6 Hours</h5>
                            </div>
                            <div className="card-body">
                              <div className="row text-center">
                                <div className="col-6 mb-3">
                                  <div className="text-success">
                                    <i className="fas fa-arrow-up mb-2"></i>
                                    <h4>
                                      {parsedOtherData.transactions.h6.buys ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">Buys</div>
                                  </div>
                                </div>
                                <div className="col-6 mb-3">
                                  <div className="text-danger">
                                    <i className="fas fa-arrow-down mb-2"></i>
                                    <h4>
                                      {parsedOtherData.transactions.h6.sells ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">
                                      Sells
                                    </div>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div>
                                    <h4>
                                      {parsedOtherData.transactions.h6.buyers ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">
                                      Buyers
                                    </div>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div>
                                    <h4>
                                      {parsedOtherData.transactions.h6
                                        .sellers || 0}
                                    </h4>
                                    <div className="small text-muted">
                                      Sellers
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 24h Transactions */}
                      {parsedOtherData.transactions.h24 && (
                        <div className="col-md-4 mb-3">
                          <div className="card h-100">
                            <div className="card-header bg-light">
                              <h5 className="mb-0">24 Hours</h5>
                            </div>
                            <div className="card-body">
                              <div className="row text-center">
                                <div className="col-6 mb-3">
                                  <div className="text-success">
                                    <i className="fas fa-arrow-up mb-2"></i>
                                    <h4>
                                      {parsedOtherData.transactions.h24.buys ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">Buys</div>
                                  </div>
                                </div>
                                <div className="col-6 mb-3">
                                  <div className="text-danger">
                                    <i className="fas fa-arrow-down mb-2"></i>
                                    <h4>
                                      {parsedOtherData.transactions.h24.sells ||
                                        0}
                                    </h4>
                                    <div className="small text-muted">
                                      Sells
                                    </div>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div>
                                    <h4>
                                      {parsedOtherData.transactions.h24
                                        .buyers || 0}
                                    </h4>
                                    <div className="small text-muted">
                                      Buyers
                                    </div>
                                  </div>
                                </div>
                                <div className="col-6">
                                  <div>
                                    <h4>
                                      {parsedOtherData.transactions.h24
                                        .sellers || 0}
                                    </h4>
                                    <div className="small text-muted">
                                      Sellers
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Market Information */}
                <div className="row">
                  {parsedOtherData && parsedOtherData.name && (
                    <div className="col-md-6 mb-3">
                      <div className="info-item">
                        <div className="info-label">Pair Name</div>
                        <div className="info-value">{parsedOtherData.name}</div>
                      </div>
                    </div>
                  )}

                  {parsedOtherData && parsedOtherData.address && (
                    <div className="col-md-6 mb-3">
                      <div className="info-item">
                        <div className="info-label">Pair Address</div>
                        <div className="info-value d-flex align-items-center">
                          <code className="me-2">
                            {parsedOtherData.address}
                          </code>
                          <button
                            className="btn btn-sm btn-outline-secondary me-1"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                parsedOtherData.address
                              );
                              alert('Pair address copied to clipboard!');
                            }}
                            title="Copy to clipboard"
                          >
                            <i className="fas fa-copy"></i>
                          </button>
                          <a
                            href={`https://dexscreener.com/${token.chain === 'ethereum' || token.chain === 'eth' ? 'ethereum' : token.chain}/${parsedOtherData.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary"
                            title="View on DexScreener"
                          >
                            <i className="fas fa-external-link-alt"></i>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {parsedGoPlusInfo && (
            <div className="card mb-4">
              <div className="card-header">
                <h3>Security Information</h3>
              </div>
              <div className="card-body">
                {/* Security Score Card */}
                <div className="row mb-4">
                  <div className="col-12">
                    <div className="security-score-card p-3 text-center">
                      <h4 className="mb-3">Security Assessment</h4>
                      <div className="d-flex justify-content-center mb-3">
                        {/* Security Indicators */}
                        <div className="security-indicators">
                          {/* Honeypot Check */}
                          <div className="security-indicator me-4">
                            <div
                              className={`indicator-icon ${parsedGoPlusInfo.is_honeypot === '0' ? 'bg-success' : 'bg-danger'}`}
                            >
                              <i
                                className={`fas fa-${parsedGoPlusInfo.is_honeypot === '0' ? 'check' : 'times'}`}
                              ></i>
                            </div>
                            <div className="indicator-label">Honeypot</div>
                            <div
                              className={`indicator-status ${parsedGoPlusInfo.is_honeypot === '0' ? 'text-success' : 'text-danger'}`}
                            >
                              {parsedGoPlusInfo.is_honeypot === '0'
                                ? 'Safe'
                                : 'Risk'}
                            </div>
                          </div>

                          {/* Open Source Check */}
                          <div className="security-indicator me-4">
                            <div
                              className={`indicator-icon ${parsedGoPlusInfo.is_open_source === '1' ? 'bg-success' : 'bg-danger'}`}
                            >
                              <i
                                className={`fas fa-${parsedGoPlusInfo.is_open_source === '1' ? 'check' : 'times'}`}
                              ></i>
                            </div>
                            <div className="indicator-label">Open Source</div>
                            <div
                              className={`indicator-status ${parsedGoPlusInfo.is_open_source === '1' ? 'text-success' : 'text-danger'}`}
                            >
                              {parsedGoPlusInfo.is_open_source === '1'
                                ? 'Yes'
                                : 'No'}
                            </div>
                          </div>

                          {/* Proxy Check */}
                          <div className="security-indicator me-4">
                            <div
                              className={`indicator-icon ${parsedGoPlusInfo.is_proxy === '0' ? 'bg-success' : 'bg-warning'}`}
                            >
                              <i
                                className={`fas fa-${parsedGoPlusInfo.is_proxy === '0' ? 'check' : 'exclamation'}`}
                              ></i>
                            </div>
                            <div className="indicator-label">Proxy</div>
                            <div
                              className={`indicator-status ${parsedGoPlusInfo.is_proxy === '0' ? 'text-success' : 'text-warning'}`}
                            >
                              {parsedGoPlusInfo.is_proxy === '0' ? 'No' : 'Yes'}
                            </div>
                          </div>

                          {/* Mintable Check */}
                          <div className="security-indicator">
                            <div
                              className={`indicator-icon ${parsedGoPlusInfo.is_mintable === '0' ? 'bg-success' : 'bg-warning'}`}
                            >
                              <i
                                className={`fas fa-${parsedGoPlusInfo.is_mintable === '0' ? 'check' : 'exclamation'}`}
                              ></i>
                            </div>
                            <div className="indicator-label">Mintable</div>
                            <div
                              className={`indicator-status ${parsedGoPlusInfo.is_mintable === '0' ? 'text-success' : 'text-warning'}`}
                            >
                              {parsedGoPlusInfo.is_mintable === '0'
                                ? 'No'
                                : 'Yes'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tax Information */}
                      {(parsedGoPlusInfo.buy_tax !== undefined ||
                        parsedGoPlusInfo.sell_tax !== undefined) && (
                        <div className="tax-info mb-3">
                          <h5 className="mb-2">Transaction Taxes</h5>
                          <div className="d-flex justify-content-center">
                            {parsedGoPlusInfo.buy_tax !== undefined && (
                              <div className="tax-card me-4 p-3 text-center">
                                <div className="tax-label">Buy Tax</div>
                                <div
                                  className={`tax-value ${parseFloat(parsedGoPlusInfo.buy_tax) > 10 ? 'text-danger' : parseFloat(parsedGoPlusInfo.buy_tax) > 5 ? 'text-warning' : 'text-success'}`}
                                >
                                  {parsedGoPlusInfo.buy_tax}%
                                </div>
                              </div>
                            )}

                            {parsedGoPlusInfo.sell_tax !== undefined && (
                              <div className="tax-card p-3 text-center">
                                <div className="tax-label">Sell Tax</div>
                                <div
                                  className={`tax-value ${parseFloat(parsedGoPlusInfo.sell_tax) > 10 ? 'text-danger' : parseFloat(parsedGoPlusInfo.sell_tax) > 5 ? 'text-warning' : 'text-success'}`}
                                >
                                  {parsedGoPlusInfo.sell_tax}%
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Token Details and Ownership */}
                <div className="row mb-4">
                  <div className="col-md-6 mb-3">
                    <div className="card h-100">
                      <div className="card-header">
                        <h4 className="mb-0">Token Details</h4>
                      </div>
                      <div className="card-body">
                        <ul className="list-group list-group-flush">
                          {parsedGoPlusInfo.token_name && (
                            <li className="list-group-item d-flex justify-content-between align-items-center">
                              <span>Name</span>
                              <span className="fw-bold">
                                {parsedGoPlusInfo.token_name}
                              </span>
                            </li>
                          )}

                          {parsedGoPlusInfo.token_symbol && (
                            <li className="list-group-item d-flex justify-content-between align-items-center">
                              <span>Symbol</span>
                              <span className="fw-bold">
                                {parsedGoPlusInfo.token_symbol}
                              </span>
                            </li>
                          )}

                          {parsedGoPlusInfo.total_supply && (
                            <li className="list-group-item d-flex justify-content-between align-items-center">
                              <span>Total Supply</span>
                              <span className="fw-bold">
                                {parsedGoPlusInfo.total_supply
                                  ? parseFloat(
                                      parsedGoPlusInfo.total_supply
                                    ).toLocaleString()
                                  : 'N/A'}
                              </span>
                            </li>
                          )}

                          {parsedGoPlusInfo.holder_count && (
                            <li className="list-group-item d-flex justify-content-between align-items-center">
                              <span>Holder Count</span>
                              <span className="fw-bold">
                                {parsedGoPlusInfo.holder_count}
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6 mb-3">
                    <div className="card h-100">
                      <div className="card-header">
                        <h4 className="mb-0">Ownership</h4>
                      </div>
                      <div className="card-body">
                        <ul className="list-group list-group-flush">
                          {parsedGoPlusInfo.owner_address && (
                            <li className="list-group-item">
                              <div className="d-flex justify-content-between">
                                <span>Owner</span>
                                <span className="badge bg-info">
                                  {parsedGoPlusInfo.owner_percent}%
                                </span>
                              </div>
                              <div className="mt-1">
                                <code className="small">
                                  {parsedGoPlusInfo.owner_address}
                                </code>
                              </div>
                            </li>
                          )}

                          {parsedGoPlusInfo.creator_address && (
                            <li className="list-group-item">
                              <div className="d-flex justify-content-between">
                                <span>Creator</span>
                                <span className="badge bg-info">
                                  {parsedGoPlusInfo.creator_percent}%
                                </span>
                              </div>
                              <div className="mt-1">
                                <code className="small">
                                  {parsedGoPlusInfo.creator_address}
                                </code>
                              </div>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DEX Information */}
                {parsedGoPlusInfo.dex && parsedGoPlusInfo.dex.length > 0 && (
                  <div className="mb-4">
                    <h4 className="border-bottom pb-2">DEX Information</h4>
                    <div className="row">
                      {parsedGoPlusInfo.dex.map((dex, index) => (
                        <div className="col-md-6 mb-3" key={index}>
                          <div className="card">
                            <div className="card-body">
                              <h5 className="card-title">{dex.name}</h5>
                              <div className="mb-2">
                                <span className="text-muted">Pair:</span>
                                <code className="ms-2 small">{dex.pair}</code>
                              </div>
                              <div className="d-flex justify-content-between">
                                <div>
                                  <span className="text-muted">Liquidity:</span>
                                  <span className="ms-2">
                                    $
                                    {dex.liquidity
                                      ? parseFloat(
                                          dex.liquidity
                                        ).toLocaleString()
                                      : 'N/A'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted">Type:</span>
                                  <span className="ms-2">
                                    {dex.liquidity_type}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Holders */}
                {parsedGoPlusInfo.holders &&
                  parsedGoPlusInfo.holders.length > 0 && (
                    <div className="mb-4">
                      <h4 className="border-bottom pb-2">Top Holders</h4>
                      <div className="table-responsive">
                        <table className="table table-hover">
                          <thead className="table-light">
                            <tr>
                              <th>Rank</th>
                              <th>Address</th>
                              <th>Tag</th>
                              <th>Balance</th>
                              <th>Percent</th>
                              <th>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedGoPlusInfo.holders.map((holder, index) => (
                              <tr key={index}>
                                <td>#{index + 1}</td>
                                <td>
                                  <code className="small">
                                    {holder.address}
                                  </code>
                                </td>
                                <td>
                                  {holder.tag ? (
                                    <span className="badge bg-info">
                                      {holder.tag}
                                    </span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td>
                                  {holder.balance
                                    ? parseFloat(
                                        holder.balance
                                      ).toLocaleString()
                                    : 'N/A'}
                                </td>
                                <td>
                                  <div className="d-flex align-items-center">
                                    <div
                                      className="progress flex-grow-1 me-2"
                                      style={{ height: '8px' }}
                                    >
                                      <div
                                        className="progress-bar bg-success"
                                        style={{
                                          width: `${parseFloat(holder.percent) * 100}%`,
                                        }}
                                      ></div>
                                    </div>
                                    <span>
                                      {(
                                        parseFloat(holder.percent) * 100
                                      ).toFixed(2)}
                                      %
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  {holder.is_contract === '1' ? (
                                    <span className="badge bg-secondary">
                                      Contract
                                    </span>
                                  ) : (
                                    <span className="badge bg-primary">
                                      Wallet
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                {/* Additional Security Flags */}
                <div className="row mb-3">
                  <div className="col-12">
                    <h4 className="border-bottom pb-2">
                      Additional Security Flags
                    </h4>
                    <div className="security-flags">
                      {Object.entries(parsedGoPlusInfo).map(([key, value]) => {
                        // Only show boolean flags (0 or 1) that aren't already displayed
                        if (
                          (value === '0' || value === '1') &&
                          ![
                            'is_honeypot',
                            'is_open_source',
                            'is_proxy',
                            'is_mintable',
                          ].includes(key)
                        ) {
                          const isPositive = value === '0';
                          // Format the key for display
                          const displayKey = key
                            .replace(/_/g, ' ')
                            .replace(/^is /, '');

                          return (
                            <div key={key} className="security-flag">
                              <span
                                className={`flag-indicator ${isPositive ? 'positive' : 'negative'}`}
                              >
                                <i
                                  className={`fas fa-${isPositive ? 'check' : 'times'}`}
                                ></i>
                              </span>
                              <span className="flag-label text-capitalize">
                                {displayKey}
                              </span>
                              <span
                                className={`flag-value ${isPositive ? 'text-success' : 'text-danger'}`}
                              >
                                {isPositive ? 'No' : 'Yes'}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add custom CSS for security section */}
          <style jsx="true">{`
            .security-score-card {
              background-color: #f8f9fa;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            }
            .security-indicators {
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
            }
            .security-indicator {
              text-align: center;
              margin-bottom: 15px;
            }
            .indicator-icon {
              width: 50px;
              height: 50px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 10px;
              color: white;
              font-size: 20px;
            }
            .indicator-label {
              font-size: 14px;
              color: #6c757d;
              margin-bottom: 5px;
            }
            .indicator-status {
              font-weight: bold;
            }
            .tax-card {
              background-color: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
              min-width: 120px;
            }
            .tax-label {
              font-size: 14px;
              color: #6c757d;
              margin-bottom: 5px;
            }
            .tax-value {
              font-size: 24px;
              font-weight: bold;
            }
            .security-flags {
              display: flex;
              flex-wrap: wrap;
              gap: 15px;
              margin-top: 15px;
            }
            .security-flag {
              display: flex;
              align-items: center;
              background-color: #f8f9fa;
              padding: 8px 15px;
              border-radius: 20px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .flag-indicator {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 10px;
              color: white;
              font-size: 12px;
            }
            .flag-indicator.positive {
              background-color: #28a745;
            }
            .flag-indicator.negative {
              background-color: #dc3545;
            }
            .flag-label {
              margin-right: 10px;
            }
          `}</style>

          {token.goPlusData && (
            <div className="card mb-4">
              <div className="card-header">
                <h3>Additional Security Information</h3>
              </div>
              <div className="card-body">
                <pre className="security-data">
                  {JSON.stringify(token.goPlusData, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="col-md-4">
          {token.paperTraded && (
            <div className="card mb-4 paper-trading-card">
              <div className="card-header">
                <h3>Paper Trading</h3>
              </div>
              <div className="card-body">
                <div className="info-item">
                  <div className="info-label">Status</div>
                  <div className="info-value">
                    <span className="badge bg-success">Active</span>
                  </div>
                </div>

                {token.paperInvestmentAmount && (
                  <div className="info-item">
                    <div className="info-label">Investment Amount</div>
                    <div className="info-value">
                      ${token.paperInvestmentAmount}
                    </div>
                  </div>
                )}

                {token.paperCurrentValue && (
                  <div className="info-item">
                    <div className="info-label">Current Value</div>
                    <div className="info-value">${token.paperCurrentValue}</div>
                  </div>
                )}

                {token.paperProfitLoss && (
                  <div className="info-item">
                    <div className="info-label">Profit/Loss</div>
                    <div
                      className={`info-value ${token.paperProfitLoss >= 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {token.paperProfitLoss >= 0 ? '+' : ''}
                      {token.paperProfitLoss}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {historicalData.length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <h3>Historical Data</h3>
          </div>
          <div className="card-body">
            <TokenCharts historicalData={historicalData} />

            <div className="mt-4">
              <h4>Historical Data Table</h4>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Price (USD)</th>
                      <th>Price Change (1h)</th>
                      <th>Price Change (24h)</th>
                      <th>Volume (24h)</th>
                      <th>Liquidity (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData.map((item, index) => {
                      // Extract data from item or extraData
                      let extraData = {};
                      if (
                        item.extraData &&
                        typeof item.extraData === 'string'
                      ) {
                        try {
                          extraData = JSON.parse(item.extraData);
                        } catch (e) {
                          console.error('Error parsing extraData:', e);
                        }
                      } else if (
                        item.extraData &&
                        typeof item.extraData === 'object'
                      ) {
                        extraData = item.extraData;
                      }

                      const priceUsd = parseFloat(
                        item.priceUsd || extraData.priceUsd || 0
                      );
                      const priceChange1h = parseFloat(
                        item.priceChange1h || extraData.priceChange1h || 0
                      );
                      const priceChange24h = parseFloat(
                        item.priceChange24h || extraData.priceChange24h || 0
                      );
                      const volume24h = parseFloat(
                        item.volume24h || extraData.h24Volume || 0
                      );
                      const liquidityUsd = parseFloat(
                        item.liquidityUsd || extraData.liquidityUsd || 0
                      );

                      // Handle timestamp - could be seconds or milliseconds
                      const timestamp = item.timestamp
                        ? item.timestamp > 10000000000
                          ? item.timestamp
                          : item.timestamp * 1000
                        : new Date().getTime();

                      return (
                        <tr key={index}>
                          <td>{formatDate(timestamp)}</td>
                          <td>${priceUsd.toFixed(6)}</td>
                          <td
                            className={
                              priceChange1h >= 0
                                ? 'text-success'
                                : 'text-danger'
                            }
                          >
                            {priceChange1h >= 0 ? '+' : ''}
                            {priceChange1h.toFixed(2)}%
                          </td>
                          <td
                            className={
                              priceChange24h >= 0
                                ? 'text-success'
                                : 'text-danger'
                            }
                          >
                            {priceChange24h >= 0 ? '+' : ''}
                            {priceChange24h.toFixed(2)}%
                          </td>
                          <td>{formatCurrency(volume24h)}</td>
                          <td>{formatCurrency(liquidityUsd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Display a message if no historical data is available */}
      {historicalData.length === 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <h3>Historical Data</h3>
          </div>
          <div className="card-body">
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              No historical data is available for this token. This could be
              because the token is new or because the data hasn't been indexed
              yet.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenDetail;
