'use strict';

const readline = require('readline');
const https = require('https');
const { streamChat } = require('./api');
const { getModel, getSystemPrompt } = require('./config');
const { renderMarkdown } = require('./render');

const COMMANDS = {
  '/help': 'Show available commands',
  '/clear': 'Clear conversation history',
  '/model': 'Show or set model (e.g. /model google/gemini-2.0-flash-exp:free)',
  '/models': 'List available free models from OpenRouter',
  '/system': 'Show current system prompt',
  '/history': 'Show conversation history',
  '/exit': 'Exit MarsAI',
};

class Chat {
  constructor(apiKey, chalk) {
    this.apiKey = apiKey;
    this.chalk = chalk;
    this.model = getModel();
    this.systemPrompt = getSystemPrompt();
    this.messages = [{ role: 'system', content: this.systemPrompt }];
  }

  handleCommand(input) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case '/help':
        console.log(this.chalk.cyan('\nAvailable commands:'));
        for (const [k, v] of Object.entries(COMMANDS)) {
          console.log(`  ${this.chalk.yellow(k.padEnd(12))} ${v}`);
        }
        console.log();
        return true;

      case '/clear':
        this.messages = [{ role: 'system', content: this.systemPrompt }];
        console.log(this.chalk.green('Conversation cleared.\n'));
        return true;

      case '/model':
        if (parts.length > 1) {
          this.model = parts[1];
          console.log(this.chalk.green(`Model set to: ${this.model}\n`));
        } else {
          console.log(this.chalk.cyan(`Current model: ${this.model}\n`));
        }
        return true;

      case '/models':
        this.listFreeModels();
        return true;

      case '/system':
        console.log(this.chalk.cyan(`System prompt: ${this.systemPrompt}\n`));
        return true;

      case '/history':
        const userMsgs = this.messages.filter((m) => m.role !== 'system');
        if (userMsgs.length === 0) {
          console.log(this.chalk.dim('No conversation history.\n'));
        } else {
          for (const m of userMsgs) {
            const label = m.role === 'user' ? this.chalk.green('You') : this.chalk.magenta('MarsAI');
            const preview = m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content;
            console.log(`  ${label}: ${preview}`);
          }
          console.log();
        }
        return true;

      case '/exit':
      case '/quit':
      case '/q':
        return 'exit';

      default:
        return false;
    }
  }

  listFreeModels() {
    console.log(this.chalk.cyan('\n  Fetching free models...\n'));
    https.get('https://openrouter.ai/api/v1/models', (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const models = JSON.parse(data).data || [];
          const free = models
            .filter((m) => m.pricing?.prompt === '0' && m.pricing?.completion === '0')
            .sort((a, b) => a.id.localeCompare(b.id));
          if (free.length === 0) {
            console.log(this.chalk.yellow('  No free models found.\n'));
            return;
          }
          for (const m of free) {
            const ctx = m.context_length ? ` (${(m.context_length / 1024).toFixed(0)}k ctx)` : '';
            console.log(`  ${this.chalk.yellow(m.id)}${this.chalk.dim(ctx)}`);
          }
          console.log(this.chalk.dim(`\n  ${free.length} free models. Use /model <id> to switch.\n`));
        } catch {
          console.log(this.chalk.red('  Failed to fetch models.\n'));
        }
      });
    }).on('error', () => {
      console.log(this.chalk.red('  Failed to fetch models.\n'));
    });
  }

  async sendMessage(content) {
    this.messages.push({ role: 'user', content });

    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinIdx = 0;
    let chunks = 0;

    process.stdout.write(this.chalk.magenta('\n  MarsAI ') + this.chalk.dim('› '));
    const spinTimer = setInterval(() => {
      if (chunks === 0) {
        process.stdout.write(`\r  ${this.chalk.magenta(spinner[spinIdx++ % spinner.length])} ${this.chalk.dim('Thinking...')}`);
      }
    }, 80);

    try {
      const response = await streamChat(this.apiKey, this.model, this.messages, (chunk) => {
        if (chunks === 0) {
          // Clear spinner line on first chunk
          process.stdout.write('\r\x1b[K');
        }
        chunks++;
      });

      clearInterval(spinTimer);
      // Clear any spinner remnant and render formatted response
      process.stdout.write('\r\x1b[K');
      const formatted = renderMarkdown(response);
      // Indent each line for consistent look
      const indented = formatted
        .split('\n')
        .map((line) => '  ' + line)
        .join('\n');
      process.stdout.write(this.chalk.magenta('  MarsAI ') + this.chalk.dim('›\n'));
      process.stdout.write(indented + '\n');

      this.messages.push({ role: 'assistant', content: response });
    } catch (err) {
      clearInterval(spinTimer);
      process.stdout.write('\r\x1b[K');
      console.error(this.chalk.red(`  Error: ${err.message}\n`));
      this.messages.pop();
    }
  }

  async startLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.chalk.green('  You ') + this.chalk.dim('› '),
      terminal: true,
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      if (input.startsWith('/')) {
        const result = this.handleCommand(input);
        if (result === 'exit') {
          console.log(this.chalk.dim('Goodbye! 👋\n'));
          rl.close();
          return;
        }
        rl.prompt();
        return;
      }

      // Pause readline while processing
      rl.pause();
      await this.sendMessage(input);
      rl.resume();
      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    rl.on('SIGINT', () => {
      console.log(this.chalk.dim('\nGoodbye! 👋\n'));
      rl.close();
    });
  }
}

module.exports = { Chat };
