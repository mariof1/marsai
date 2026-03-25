'use strict';

const https = require('https');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function streamChat(apiKey, model, messages, onChunk) {
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
          try {
            const parsed = JSON.parse(data);
            reject(new Error(`API error (${res.statusCode}): ${parsed.error?.message || data}`));
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
