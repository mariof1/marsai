'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const CONFIG_DIR = path.join(os.homedir(), '.marsai');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function getApiKey() {
  // Priority: env var > config file
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  const config = loadConfig();
  return config.apiKey || null;
}

function getModel() {
  const config = loadConfig();
  return process.env.MARSAI_MODEL || config.model || 'meta-llama/llama-3.3-70b-instruct:free';
}

function getSystemPrompt() {
  const config = loadConfig();
  return config.systemPrompt || 'You are MarsAI, a helpful and concise CLI assistant. Provide clear, actionable answers. Use markdown formatting when helpful. Keep responses focused and practical.';
}

function promptForApiKey() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question('Enter your OpenRouter API key: ', (key) => {
      rl.close();
      const trimmed = key.trim();
      if (trimmed) {
        const config = loadConfig();
        config.apiKey = trimmed;
        saveConfig(config);
      }
      resolve(trimmed || null);
    });
  });
}

module.exports = { loadConfig, saveConfig, getApiKey, getModel, getSystemPrompt, promptForApiKey, CONFIG_DIR, CONFIG_FILE };
