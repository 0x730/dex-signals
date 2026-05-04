const {
  fetchGoPlusData,
  calculateScore,
} = require('../services/goPlusService');

/**
 * Test script for GoPlus Service
 *
 * This script tests the enhanced GoPlus service functionality:
 * 1. Tests the calculateScore function with sample data
 * 2. Tests the fetchGoPlusData function with real tokens on different chains
 */

// Sample data based on the issue description
const sampleData = {
  anti_whale_modifiable: '0',
  buy_tax: '0',
  can_take_back_ownership: '0',
  cannot_buy: '0',
  cannot_sell_all: '0',
  creator_address: '0x721d09419d625414b4fabcaae5313e73e7c3ddb2',
  creator_balance: '5545.9395911111075',
  creator_percent: '0.000000',
  dex: [
    {
      liquidity_type: 'UniV2',
      name: 'UniswapV2',
      liquidity: '48023.40279691',
      pair: '0x8c07e1dfede38b1908698988b4202a87e0d7a0f7',
    },
  ],
  external_call: '0',
  hidden_owner: '0',
  holder_count: '34488',
  holders: [
    {
      address: '0x5d1ea0cf8dda27d3f53ef8e531a2446488ccab17',
      tag: '',
      is_contract: 1,
      balance: '1475240100',
      percent: '0.078008419238686078',
      is_locked: 0,
    },
    {
      address: '0xdba68f07d1b7ca219f78ae8582c213d975c25caf',
      tag: 'Unicrypt: Token Vesting',
      is_contract: 1,
      balance: '585000000',
      percent: '0.030933896966759076',
      is_locked: 1,
      locked_detail: [
        {
          amount: '292500000',
          end_time: '2025-07-15T15:00:00+00:00',
          opt_time: '',
        },
        {
          amount: '292500000',
          end_time: '2026-01-15T15:00:00+00:00',
          opt_time: '',
        },
      ],
    },
  ],
  honeypot_with_same_creator: '0',
  is_anti_whale: '0',
  is_blacklisted: '0',
  is_honeypot: '0',
  is_in_dex: '1',
  is_mintable: '0',
  is_open_source: '1',
  is_proxy: '0',
  is_whitelisted: '0',
  lp_holder_count: '80',
  lp_holders: [
    {
      address: '0x812ba6b4c6f3678abf971726f17c5c03584a4c98',
      tag: '',
      is_contract: 0,
      balance: '3782.800811336611637388',
      percent: '0.334559026143498652',
      is_locked: 0,
    },
    {
      address: '0xdb04f1d5eac4f6927054cca212cc83a1b096e277',
      tag: '',
      is_contract: 0,
      balance: '174.523064441426252047',
      percent: '0.015435194553231515',
      is_locked: 0,
    },
  ],
  lp_total_supply: '11306.826346732899944186',
  owner_address: '0x721d09419d625414b4fabcaae5313e73e7c3ddb2',
  owner_balance: '5545.9395911111075',
  owner_change_balance: '0',
  owner_percent: '0.000000',
  personal_slippage_modifiable: '0',
  selfdestruct: '0',
  sell_tax: '0',
  slippage_modifiable: '0',
  token_name: 'SIDUS',
  token_symbol: 'SIDUS',
  total_supply: '18911293350.095167928879049705',
  trading_cooldown: '0',
  transfer_pausable: '0',
  transfer_tax: '0',
};

// Test the calculateScore function
function testCalculateScore() {
  console.log('Testing calculateScore function...');

  // Test with the sample data
  const score = calculateScore(sampleData);
  console.log(`Score for sample data: ${score}`);

  // Test with modified data to check penalties
  const honeypotData = { ...sampleData, is_honeypot: '1' };
  const honeypotScore = calculateScore(honeypotData);
  console.log(`Score for honeypot token: ${honeypotScore}`);

  const highTaxData = { ...sampleData, buy_tax: '10', sell_tax: '15' };
  const highTaxScore = calculateScore(highTaxData);
  console.log(`Score for high tax token: ${highTaxScore}`);

  // Test with modified data to check bonuses
  const lockedLPData = {
    ...sampleData,
    lp_holders: [
      { ...sampleData.lp_holders[0], is_locked: 1 },
      sampleData.lp_holders[1],
    ],
  };
  const lockedLPScore = calculateScore(lockedLPData);
  console.log(`Score for token with locked LP: ${lockedLPScore}`);
}

// Test the fetchGoPlusData function
async function testFetchGoPlusData() {
  console.log('\nTesting fetchGoPlusData function...');

  // Test with Ethereum token
  const ethToken = '0x549020a9cb845220d66d3e9c6d9f9ef61c981102'; // SIDUS token from sample
  console.log(`Fetching data for Ethereum token: ${ethToken}`);
  const ethResult = await fetchGoPlusData('ethereum', ethToken);
  console.log(
    `Ethereum token result: ${ethResult.score !== null ? 'Success' : 'Failed'}`
  );
  if (ethResult.score !== null) {
    console.log(`Score: ${ethResult.score}`);
  }

  // Test with Base token
  const baseToken = '0x4200000000000000000000000000000000000006'; // WETH on Base
  console.log(`\nFetching data for Base token: ${baseToken}`);
  const baseResult = await fetchGoPlusData('base', baseToken);
  console.log(
    `Base token result: ${baseResult.score !== null ? 'Success' : 'Failed'}`
  );
  if (baseResult.score !== null) {
    console.log(`Score: ${baseResult.score}`);
  }

  // Test with unsupported chain
  console.log('\nTesting with unsupported chain');
  const invalidResult = await fetchGoPlusData('invalid_chain', ethToken);
  console.log(
    `Invalid chain result: ${invalidResult.score === null ? 'Correctly handled' : 'Failed'}`
  );
}

// Run the tests
async function runTests() {
  try {
    testCalculateScore();
    await testFetchGoPlusData();
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

runTests();
