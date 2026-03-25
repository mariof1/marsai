'use strict';

const readline = require('readline');
const { streamChat } = require('./api');
const { getModel, getSystemPrompt } = require('./config');

const COMMANDS = {
  '/help': 'Show available commands',
  '/clear': 'Clear conversation history',
  '/model': 'Show or set model (e.g. /model google/gemini-2.0-flash-exp:free)',
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

  async sendMessage(content) {
    this.messages.push({ role: 'user', content });

    process.stdout.write(this.chalk.magenta('\n  MarsAI ') + this.chalk.dim('› '));

    try {
      const response = await streamChat(this.apiKey, this.model, this.messages, (chunk) => {
        process.stdout.write(chunk);
      });
      process.stdout.write('\n\n');
      this.messages.push({ role: 'assistant', content: response });
    } catch (err) {
      process.stdout.write('\n');
      console.error(this.chalk.red(`  Error: ${err.message}\n`));
      // Remove the failed user message
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
