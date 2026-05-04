/**
 * Test script for the cleanString function in geckoService
 *
 * This script tests the functionality to clean token names by removing emojis
 * and other special characters that might cause database encoding issues.
 */

const { cleanString } = require('../services/geckoService');
const logger = require('../utils/logger');

// Test cases with various emoji and special characters
const testCases = [
  { input: '🧀CHEESY / WETH', expected: 'CHEESY / WETH' },
  { input: '🚀Rocket Token', expected: 'Rocket Token' },
  { input: '💎Diamond Hands', expected: 'Diamond Hands' },
  { input: 'Normal Token', expected: 'Normal Token' },
  { input: '🔥Fire Token🔥', expected: 'Fire Token' },
  { input: '👑King of Crypto👑', expected: 'King of Crypto' },
  { input: '🌙Moon Soon🌙', expected: 'Moon Soon' },
  {
    input: 'Mixed characters: 你好 (hello)',
    expected: 'Mixed characters:  (hello)',
  },
  { input: 'Euro symbol: €100', expected: 'Euro symbol: 100' },
  { input: 'Special chars: ©®™', expected: 'Special chars: ' },
  { input: 'Math symbols: ∑∫√', expected: 'Math symbols: ' },
  { input: 'Accented chars: éèêë', expected: 'Accented chars: ' },
];

// Function to test if the result matches the expected output
function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`[DEBUG_LOG] ✅ PASS: ${message}`);
    return true;
  } else {
    console.log(`[DEBUG_LOG] ❌ FAIL: ${message}`);
    console.log(`[DEBUG_LOG]   Expected: "${expected}"`);
    console.log(`[DEBUG_LOG]   Actual: "${actual}"`);
    return false;
  }
}

// Main test function
function testCleanString() {
  console.log('[DEBUG_LOG] Starting cleanString function tests');

  let allTestsPassed = true;

  // Test each case
  testCases.forEach(({ input, expected }) => {
    console.log(`[DEBUG_LOG] Testing: "${input}"`);
    const result = cleanString(input);
    console.log(`[DEBUG_LOG] Result: "${result}"`);

    const testPassed = assertEqual(
      result,
      expected,
      `cleanString should convert "${input}" to "${expected}"`
    );

    if (!testPassed) {
      allTestsPassed = false;
    }

    console.log('[DEBUG_LOG] ---');
  });

  // Summary
  if (allTestsPassed) {
    console.log('[DEBUG_LOG] 🎉 All tests PASSED!');
  } else {
    console.log('[DEBUG_LOG] ❗ Some tests FAILED!');
  }

  console.log('[DEBUG_LOG] cleanString function tests completed');
}

// Run the test
testCleanString();
