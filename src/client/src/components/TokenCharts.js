import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import './TokenCharts.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

const TokenCharts = ({ historicalData }) => {
  // Skip rendering if no data
  if (!historicalData || historicalData.length === 0) {
    return null;
  }

  // Process data for charts
  const processedData = historicalData.map((item) => {
    // Handle timestamp - could be seconds or milliseconds
    const timestamp = item.timestamp
      ? item.timestamp > 10000000000
        ? item.timestamp
        : item.timestamp * 1000
      : new Date().getTime();

    // Parse JSON data if it's a string
    let extraData = {};
    if (item.extraData && typeof item.extraData === 'string') {
      try {
        extraData = JSON.parse(item.extraData);
      } catch (e) {
        console.error('Error parsing extraData:', e);
      }
    } else if (item.extraData && typeof item.extraData === 'object') {
      extraData = item.extraData;
    }

    // Ensure timestamp is valid
    if (isNaN(timestamp)) {
      console.error('Invalid timestamp:', item.timestamp);
      return null; // Skip this data point
    }

    // Helper function to ensure we have valid numbers and not NaN
    const safeParseFloat = (value, defaultValue = 0) => {
      const parsed = parseFloat(value || defaultValue);
      return isNaN(parsed) ? defaultValue : parsed;
    };

    const safeParseInt = (value, defaultValue = 0) => {
      const parsed = parseInt(value || defaultValue, 10);
      return isNaN(parsed) ? defaultValue : parsed;
    };

    // Try to extract data from different possible sources
    const dataPoint = {
      timestamp: new Date(timestamp),
      date: new Date(timestamp).toLocaleDateString(),
      time: new Date(timestamp).toLocaleTimeString(),
      priceUsd: safeParseFloat(item.priceUsd || extraData.priceUsd, 0),
      liquidityUsd: safeParseFloat(
        item.liquidityUsd || extraData.liquidityUsd,
        0
      ),
      volume1h: safeParseFloat(item.volume1h || extraData.h1Volume, 0),
      volume24h: safeParseFloat(item.volume24h || extraData.h24Volume, 0),
      txnsSells1h: safeParseInt(item.txnsSells1h || extraData.h1Sells, 0),
      txnsSells24h: safeParseInt(item.txnsSells24h || extraData.h24Sells, 0),
      txnsBuys1h: safeParseInt(item.txnsBuys1h || extraData.h1Buys, 0),
      txnsBuys24h: safeParseInt(item.txnsBuys24h || extraData.h24Buys, 0),
      priceChange1h: safeParseFloat(
        item.priceChange1h || extraData.priceChange1h,
        0
      ),
      priceChange24h: safeParseFloat(
        item.priceChange24h || extraData.priceChange24h,
        0
      ),
    };

    // Ensure all properties have valid values
    for (const key in dataPoint) {
      if (
        dataPoint[key] === undefined ||
        dataPoint[key] === null ||
        (typeof dataPoint[key] === 'number' && isNaN(dataPoint[key]))
      ) {
        console.error(`Invalid value for ${key}:`, dataPoint[key]);
        if (key === 'timestamp') {
          return null; // Skip this data point if timestamp is invalid
        }
        // Set default values for other properties
        if (typeof dataPoint[key] === 'number') {
          dataPoint[key] = 0;
        }
      }
    }

    return dataPoint;
  });

  // Filter out null or invalid data points and sort by timestamp
  const validData = processedData.filter((item) => item !== null);
  validData.sort((a, b) => a.timestamp - b.timestamp);

  // Format currency for tooltip
  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  // Extract labels (dates) for all charts
  const labels = validData.map((item) => item.date);

  // Common chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (label.includes('Price (USD)')) {
                label += `$${context.parsed.y.toFixed(6)}`;
              } else if (label.includes('Price Change')) {
                label += `${context.parsed.y.toFixed(2)}%`;
              } else if (
                label.includes('Liquidity') ||
                label.includes('Volume')
              ) {
                label += formatCurrency(context.parsed.y);
              } else {
                label += context.parsed.y;
              }
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Date',
        },
      },
    },
  };

  // Price History Chart Data
  const priceHistoryData = {
    labels,
    datasets: [
      {
        label: 'Price (USD)',
        data: validData.map((item) => item.priceUsd),
        borderColor: '#2e7d32', // Main green color
        backgroundColor: 'rgba(46, 125, 50, 0.5)',
        tension: 0.1,
      },
    ],
  };

  // Price Change Chart Data
  const priceChangeData = {
    labels,
    datasets: [
      {
        label: 'Price Change (1h)',
        data: validData.map((item) => item.priceChange1h),
        borderColor: '#2e7d32', // Main green color
        backgroundColor: 'rgba(46, 125, 50, 0.5)',
        tension: 0.1,
      },
      {
        label: 'Price Change (24h)',
        data: validData.map((item) => item.priceChange24h),
        borderColor: '#ff8042',
        backgroundColor: 'rgba(255, 128, 66, 0.5)',
        tension: 0.1,
      },
    ],
  };

  // Liquidity History Chart Data
  const liquidityHistoryData = {
    labels,
    datasets: [
      {
        label: 'Liquidity (USD)',
        data: validData.map((item) => item.liquidityUsd),
        borderColor: '#2e7d32', // Main green color
        backgroundColor: 'rgba(46, 125, 50, 0.2)',
        fill: true,
        tension: 0.1,
      },
    ],
  };

  // Volume History Chart Data
  const volumeHistoryData = {
    labels,
    datasets: [
      {
        label: 'Volume (1h)',
        data: validData.map((item) => item.volume1h),
        backgroundColor: 'rgba(46, 125, 50, 0.7)', // Main green color
      },
      {
        label: 'Volume (24h)',
        data: validData.map((item) => item.volume24h),
        backgroundColor: 'rgba(46, 125, 50, 0.4)', // Lighter green
      },
    ],
  };

  // Transactions History Chart Data
  const transactionsHistoryData = {
    labels,
    datasets: [
      {
        label: 'Buys (1h)',
        data: validData.map((item) => item.txnsBuys1h),
        backgroundColor: 'rgba(46, 125, 50, 0.7)', // Main green color
      },
      {
        label: 'Sells (1h)',
        data: validData.map((item) => item.txnsSells1h),
        backgroundColor: 'rgba(255, 128, 66, 0.7)',
      },
      {
        label: 'Buys (24h)',
        data: validData.map((item) => item.txnsBuys24h),
        backgroundColor: 'rgba(46, 125, 50, 0.4)', // Lighter green
      },
      {
        label: 'Sells (24h)',
        data: validData.map((item) => item.txnsSells24h),
        backgroundColor: 'rgba(255, 66, 66, 0.7)',
      },
    ],
  };

  // Specific options for each chart
  const priceHistoryOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Price History',
      },
    },
    scales: {
      ...commonOptions.scales,
      y: {
        title: {
          display: true,
          text: 'Price (USD)',
        },
        ticks: {
          callback: function (value) {
            return '$' + value.toFixed(6);
          },
        },
      },
    },
  };

  const priceChangeOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Price Change',
      },
    },
    scales: {
      ...commonOptions.scales,
      y: {
        title: {
          display: true,
          text: 'Change (%)',
        },
        ticks: {
          callback: function (value) {
            return value.toFixed(2) + '%';
          },
        },
      },
    },
  };

  const liquidityHistoryOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Liquidity History',
      },
    },
    scales: {
      ...commonOptions.scales,
      y: {
        title: {
          display: true,
          text: 'Liquidity (USD)',
        },
        ticks: {
          callback: function (value) {
            return formatCurrency(value);
          },
        },
      },
    },
  };

  const volumeHistoryOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Volume History',
      },
    },
    scales: {
      ...commonOptions.scales,
      y: {
        title: {
          display: true,
          text: 'Volume (USD)',
        },
        ticks: {
          callback: function (value) {
            return formatCurrency(value);
          },
        },
      },
    },
  };

  const transactionsHistoryOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Transactions History',
      },
    },
    scales: {
      ...commonOptions.scales,
      y: {
        title: {
          display: true,
          text: 'Number of Transactions',
        },
      },
    },
  };

  return (
    <div className="token-charts">
      <div className="chart-container">
        <h4>Price History</h4>
        <div style={{ height: '300px' }}>
          <Line data={priceHistoryData} options={priceHistoryOptions} />
        </div>
      </div>

      <div className="chart-container">
        <h4>Price Change</h4>
        <div style={{ height: '300px' }}>
          <Line data={priceChangeData} options={priceChangeOptions} />
        </div>
      </div>

      <div className="chart-container">
        <h4>Liquidity History</h4>
        <div style={{ height: '300px' }}>
          <Line data={liquidityHistoryData} options={liquidityHistoryOptions} />
        </div>
      </div>

      <div className="chart-container">
        <h4>Volume History</h4>
        <div style={{ height: '300px' }}>
          <Bar data={volumeHistoryData} options={volumeHistoryOptions} />
        </div>
      </div>

      <div className="chart-container">
        <h4>Transactions History</h4>
        <div style={{ height: '300px' }}>
          <Bar
            data={transactionsHistoryData}
            options={transactionsHistoryOptions}
          />
        </div>
      </div>
    </div>
  );
};

export default TokenCharts;
