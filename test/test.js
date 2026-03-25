'use strict';

// Basic smoke tests
const { loadConfig, getModel, getSystemPrompt } = require('../src/config');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

console.log('\nMarsAI Tests\n');

// Config tests
assert(typeof loadConfig() === 'object', 'loadConfig returns object');
assert(typeof getModel() === 'string', 'getModel returns string');
assert(getModel().length > 0, 'getModel returns non-empty string');
assert(typeof getSystemPrompt() === 'string', 'getSystemPrompt returns string');

// API module loads
const api = require('../src/api');
assert(typeof api.streamChat === 'function', 'streamChat is a function');

// Chat module loads
const { Chat } = require('../src/chat');
assert(typeof Chat === 'function', 'Chat is a constructor');

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
