'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const CONFIG_DIR = path.join(os.homedir(), '.marsai');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  }
}

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
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function getApiKey() {
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  const config = loadConfig();
  return config.apiKey || null;
}

function getModel() {
  const config = loadConfig();
  return process.env.MARSAI_MODEL || config.model || 'openrouter/free';
}

function getSystemPrompt() {
  const config = loadConfig();
  if (config.systemPrompt) return config.systemPrompt;

  const os = require('os');
  const sysInfo = `${os.type()} ${os.release()} (${os.arch()})`;
  const user = os.userInfo().username;
  const cwd = process.cwd();
  const shell = process.env.SHELL || '/bin/bash';

  return `You are MarsAI, an AI-powered CLI assistant with direct access to the user's terminal environment.

System: ${sysInfo}
User: ${user}
Shell: ${shell}
Working directory: ${cwd}

You can execute commands on the user's system. When you want to run a command, wrap it in <run_command> tags like this:
<run_command>command here</run_command>

Rules for command execution:
- The user will be asked to confirm before any command runs.
- You can run multiple commands by using multiple <run_command> tags.
- After a command runs, you will receive its output. Analyze it and respond. Do NOT re-run the same command.
- Only use <run_command> tags when the user asks you to execute something. Never include them in follow-up analysis.
- Always explain what a command does before running it.
- For destructive or elevated commands (rm -rf, sudo, etc.), warn the user clearly.
- Use markdown formatting for explanations. Keep responses focused and practical.`;
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

// ── Session persistence ──────────────────────────────────────────

function generateSessionId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

function sessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function saveSession(sessionId, data) {
  ensureDirs();
  fs.writeFileSync(sessionPath(sessionId), JSON.stringify(data, null, 2), { mode: 0o600 });
}

function loadSession(sessionId) {
  const p = sessionPath(sessionId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function listSessions() {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  return files
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
        return {
          id: f.replace('.json', ''),
          model: data.model || 'unknown',
          messageCount: (data.messages || []).filter((m) => m.role === 'user').length,
          preview: getSessionPreview(data.messages || []),
          updatedAt: data.updatedAt || null,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function getSessionPreview(messages) {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '(empty)';
  return firstUser.content.length > 60 ? firstUser.content.slice(0, 60) + '...' : firstUser.content;
}

function getLastSessionId() {
  const sessions = listSessions();
  return sessions.length > 0 ? sessions[0].id : null;
}

module.exports = {
  loadConfig, saveConfig, getApiKey, getModel, getSystemPrompt, promptForApiKey,
  generateSessionId, saveSession, loadSession, listSessions, getLastSessionId,
  CONFIG_DIR, CONFIG_FILE, SESSIONS_DIR,
};
