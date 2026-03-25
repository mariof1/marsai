'use strict';

const https = require('https');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 8000, 15000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function streamChat(apiKey, model, messages, onChunk, retries = 0) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      stream: true,
    });

    const url = new URL(OPENROUTER_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/mariof1/marsai',
        'X-Title': 'MarsAI CLI',
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          // Retry on rate limit (429) or server errors (5xx)
          if ((res.statusCode === 429 || res.statusCode >= 500) && retries < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retries] || 5000;
            const secs = (delay / 1000).toFixed(0);
            onChunk(`\n  ⏳ Rate limited — retrying in ${secs}s (${retries + 1}/${MAX_RETRIES})...`);
            sleep(delay)
              .then(() => streamChat(apiKey, model, messages, onChunk, retries + 1))
              .then(resolve)
              .catch(reject);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const msg = parsed.error?.message || data;
            if (res.statusCode === 429) {
              reject(new Error(`Rate limited. Free-tier models have usage caps. Try again in a minute or switch model with /model`));
            } else {
              reject(new Error(`API error (${res.statusCode}): ${msg}`));
            }
          } catch {
            reject(new Error(`API error (${res.statusCode}): ${data}`));
          }
        });
        return;
      }

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

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { streamChat };
