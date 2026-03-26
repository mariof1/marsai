'use strict';

const https = require('https');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRequest(apiKey, model, messages, stream) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      stream,
      route: 'fallback',
      provider: { allow_fallbacks: true },
    });
    const url = new URL(OPENROUTER_API_URL);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/mariof1/marsai',
        'X-Title': 'MarsAI CLI',
      },
    }, (res) => {
      resolve(res);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function collectBody(res) {
  return new Promise((resolve) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => resolve(data));
  });
}

function parseErrorMessage(statusCode, body) {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed.error?.message || parsed.error?.metadata?.raw || JSON.stringify(parsed.error) || body;
    return `API error (${statusCode}): ${msg}`;
  } catch {
    return `API error (${statusCode}): ${body}`;
  }
}

// onRetry(reason, delaySecs, attempt, maxRetries) - called before each retry wait
async function streamChat(apiKey, model, messages, onChunk, onRetry) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await makeRequest(apiKey, model, messages, true);

    if (res.statusCode === 200) {
      return new Promise((resolve, reject) => {
        let buffer = '';
        let fullResponse = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch {
              // skip malformed chunks
            }
          }
        });

        res.on('end', () => resolve(fullResponse));
        res.on('error', reject);
      });
    }

    const body = await collectBody(res);

    // Don't retry on permanent rate limits (daily/quota exhausted)
    if (res.statusCode === 429 && /per-day|daily|quota/i.test(body)) {
      throw new Error(parseErrorMessage(res.statusCode, body));
    }

    // Retry on 429 (per-minute) or 5xx server errors
    if ((res.statusCode === 429 || res.statusCode >= 500) && attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt] || 10000;
      const secs = (delay / 1000).toFixed(0);
      const reason = res.statusCode === 429 ? 'Rate limited' : 'Server error';
      if (onRetry) onRetry(reason, secs, attempt + 1, MAX_RETRIES);
      await sleep(delay);
      continue;
    }

    throw new Error(parseErrorMessage(res.statusCode, body));
  }
}

function fetchKeyInfo(apiKey) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/key',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).data || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

module.exports = { streamChat, fetchKeyInfo };
