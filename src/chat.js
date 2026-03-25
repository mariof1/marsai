'use strict';

const readline = require('readline');
const https = require('https');
const { streamChat, fetchKeyInfo } = require('./api');
const { getModel, getSystemPrompt, generateSessionId, saveSession, loadSession, listSessions, getLastSessionId } = require('./config');
const { renderMarkdown } = require('./render');
const { StatusBar } = require('./statusbar');
const { extractCommands, stripCommandTags, executeCommand, displayResult, buildCommandResultMessage } = require('./executor');

const COMMANDS = {
  '/help': 'Show available commands',
  '/clear': 'Clear conversation history',
  '/model': 'Show or set model (e.g. /model google/gemini-2.0-flash-exp:free)',
  '/models': 'List available free models from OpenRouter',
  '/resume': 'Resume last session (or /resume <id>)',
  '/sessions': 'List saved sessions',
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
    this.sessionId = generateSessionId();
    this.cachedModels = [];
    this.keyInfo = null;
    this.statusBar = new StatusBar(chalk);
    this.rl = null;
  }

  askConfirmation(command) {
    return new Promise((resolve) => {
      console.log();
      console.log(this.chalk.yellow('  ⚡ MarsAI wants to run:'));
      console.log(this.chalk.cyan(`  $ ${command}`));
      this.rl.question(
        this.chalk.yellow('  Run this command? ') + this.chalk.dim('[Y/n] '),
        (answer) => {
          const a = answer.trim().toLowerCase();
          resolve(a === '' || a === 'y' || a === 'yes');
        }
      );
    });
  }

  writeStatusBar() {
    if (!this.keyInfo) return;
    const info = this.keyInfo;

    const parts = [];
    if (info.is_free_tier) parts.push('Free tier');
    if (info.limit_remaining !== null && info.limit_remaining !== undefined) {
      parts.push(`Credits: $${info.limit_remaining.toFixed(4)}`);
    }
    parts.push(`Today: $${(info.usage_daily || 0).toFixed(4)}`);

    this.statusBar.update(undefined, parts.join(' │ '));
  }

  async refreshKeyInfo() {
    const info = await fetchKeyInfo(this.apiKey);
    if (info) {
      this.keyInfo = info;
      this.writeStatusBar();
    }
  }

  async handleCommand(input) {
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
        this.sessionId = generateSessionId();
        console.log(this.chalk.green('Conversation cleared. New session started.\n'));
        return true;

      case '/model':
        if (parts.length > 1) {
          this.model = parts[1];
          console.log(this.chalk.green(`  Model set to: ${this.model}\n`));
        } else {
          console.log(this.chalk.cyan(`  Current model: ${this.model}\n`));
        }
        return true;

      case '/models':
        await this.listFreeModels();
        return true;

      case '/resume':
        this.resumeSession(parts[1] || null);
        return true;

      case '/sessions':
        this.showSessions();
        return true;

      case '/system':
        console.log(this.chalk.cyan(`  System prompt: ${this.systemPrompt}\n`));
        return true;

      case '/history':
        const userMsgs = this.messages.filter((m) => m.role !== 'system');
        if (userMsgs.length === 0) {
          console.log(this.chalk.dim('  No conversation history.\n'));
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
        this.persistSession();
        return 'exit';

      default:
        console.log(this.chalk.yellow(`  Unknown command: ${cmd}. Type /help for available commands.\n`));
        return true;
    }
  }

  fetchModels() {
    return new Promise((resolve) => {
      https.get('https://openrouter.ai/api/v1/models', (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const models = JSON.parse(data).data || [];
            const free = models
              .filter((m) => m.pricing?.prompt === '0' && m.pricing?.completion === '0')
              .sort((a, b) => a.id.localeCompare(b.id));
            this.cachedModels = free.map((m) => m.id);
            resolve(free);
          } catch {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });
  }

  async listFreeModels() {
    process.stdout.write(this.chalk.cyan('  Fetching free models...'));
    const free = await this.fetchModels();
    process.stdout.write('\r\x1b[K');

    if (free.length === 0) {
      console.log(this.chalk.yellow('  No free models found.\n'));
      return;
    }
    console.log();
    for (const m of free) {
      const ctx = m.context_length ? ` (${(m.context_length / 1024).toFixed(0)}k ctx)` : '';
      console.log(`  ${this.chalk.yellow(m.id)}${this.chalk.dim(ctx)}`);
    }
    console.log(this.chalk.dim(`\n  ${free.length} free models. Use /model <id> to switch.\n`));
  }

  persistSession() {
    const userMsgs = this.messages.filter((m) => m.role === 'user');
    if (userMsgs.length === 0) return;
    saveSession(this.sessionId, {
      model: this.model,
      messages: this.messages,
      updatedAt: new Date().toISOString(),
    });
  }

  resumeSession(id) {
    const sessionId = id || getLastSessionId();
    if (!sessionId) {
      console.log(this.chalk.yellow('  No saved sessions found.\n'));
      return;
    }
    const data = loadSession(sessionId);
    if (!data) {
      console.log(this.chalk.red(`  Session "${sessionId}" not found.\n`));
      return;
    }
    this.sessionId = sessionId;
    this.messages = data.messages || [];
    this.model = data.model || this.model;

    const userMsgs = this.messages.filter((m) => m.role === 'user');
    console.log(this.chalk.green(`  Resumed session: ${sessionId}`));
    console.log(this.chalk.dim(`  ${userMsgs.length} messages, model: ${this.model}\n`));

    const lastUser = [...this.messages].reverse().find((m) => m.role === 'user');
    const lastAssistant = [...this.messages].reverse().find((m) => m.role === 'assistant');
    if (lastUser) {
      const preview = lastUser.content.length > 100 ? lastUser.content.slice(0, 100) + '...' : lastUser.content;
      console.log(this.chalk.dim(`  Last message: "${preview}"`));
    }
    if (lastAssistant) {
      const preview = lastAssistant.content.length > 100 ? lastAssistant.content.slice(0, 100) + '...' : lastAssistant.content;
      console.log(this.chalk.dim(`  Last reply: "${preview}"`));
    }
    console.log();
  }

  showSessions() {
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log(this.chalk.dim('  No saved sessions.\n'));
      return;
    }
    console.log(this.chalk.cyan('\n  Saved sessions:\n'));
    for (const s of sessions.slice(0, 15)) {
      const active = s.id === this.sessionId ? this.chalk.green(' (active)') : '';
      const date = s.updatedAt ? s.updatedAt.slice(0, 16).replace('T', ' ') : '';
      console.log(`  ${this.chalk.yellow(s.id)}${active}`);
      console.log(`    ${this.chalk.dim(date)} · ${s.messageCount} messages · ${s.preview}`);
    }
    if (sessions.length > 15) {
      console.log(this.chalk.dim(`  ... and ${sessions.length - 15} more`));
    }
    console.log(this.chalk.dim('\n  Use /resume <id> to resume a session.\n'));
  }

  async sendMessage(content) {
    this.messages.push({ role: 'user', content });
    await this._getResponse();
  }

  async _getResponse() {
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
          process.stdout.write('\r\x1b[K');
        }
        chunks++;
      });

      clearInterval(spinTimer);
      process.stdout.write('\r\x1b[K');

      // Display the text portion (without command tags)
      const displayText = stripCommandTags(response);
      if (displayText) {
        const formatted = renderMarkdown(displayText);
        const indented = formatted
          .split('\n')
          .map((line) => '  ' + line)
          .join('\n');
        process.stdout.write(this.chalk.magenta('  MarsAI ') + this.chalk.dim('›\n'));
        process.stdout.write(indented + '\n');
      }

      this.messages.push({ role: 'assistant', content: response });

      // Check for commands to execute
      const commands = extractCommands(response);
      if (commands.length > 0) {
        const results = [];
        for (const cmd of commands) {
          this.rl.resume();
          const confirmed = await this.askConfirmation(cmd);
          this.rl.pause();

          if (!confirmed) {
            console.log(this.chalk.dim('  Skipped.\n'));
            results.push({ command: cmd, skipped: true });
            continue;
          }

          console.log(this.chalk.dim('  Running...\n'));
          const result = executeCommand(cmd);
          displayResult(this.chalk, result);
          results.push({ command: cmd, ...result });
        }

        if (results.some((r) => !r.skipped)) {
          const resultMsg = buildCommandResultMessage(results);
          this.messages.push({
            role: 'user',
            content: `[COMMAND OUTPUT - Do NOT re-run the same commands. Analyze the output and respond to the user.]\n\n${resultMsg}`,
          });
          await this._getResponse();
          return;
        }
      }

      this.persistSession();
      this.refreshKeyInfo().catch(() => {});
    } catch (err) {
      clearInterval(spinTimer);
      process.stdout.write('\r\x1b[K');
      console.error(this.chalk.red(`  Error: ${err.message}\n`));
      // Remove the last message that caused the error
      if (this.messages.length > 1) {
        this.messages.pop();
      }
    }
  }

  async startLoop() {
    const commandNames = Object.keys(COMMANDS);

    // Activate persistent bottom status bar
    this.statusBar.activate();

    const leftHints = ' /help Commands  /model Switch model  /resume Resume  Ctrl+C Exit';
    this.statusBar.update(leftHints, '');

    // Pre-fetch models and key info in background for tab completion and status
    this.fetchModels().catch(() => {});
    this.refreshKeyInfo().catch(() => {});

    const completer = (line) => {
      const lower = line.toLowerCase();

      if (lower.startsWith('/model ')) {
        const partial = line.slice(7);
        const hits = this.cachedModels.filter((m) => m.startsWith(partial));
        return [hits.length ? hits : this.cachedModels, partial];
      }

      if (lower.startsWith('/resume ')) {
        const partial = line.slice(8);
        const ids = listSessions().map((s) => s.id);
        const hits = ids.filter((id) => id.startsWith(partial));
        return [hits.length ? hits : ids, partial];
      }

      if (lower.startsWith('/')) {
        const hits = commandNames.filter((c) => c.startsWith(lower));
        return [hits.length ? hits : commandNames, line];
      }

      return [[], line];
    };

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.chalk.green('  You ') + this.chalk.dim('› '),
      terminal: true,
      completer,
    });

    this.rl = rl;

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      if (input.startsWith('/')) {
        rl.pause();
        const result = await this.handleCommand(input);
        if (result === 'exit') {
          this.statusBar.deactivate();
          console.log(this.chalk.dim('Goodbye! 👋\n'));
          rl.close();
          return;
        }
        rl.resume();
        rl.prompt();
        return;
      }

      rl.pause();
      await this.sendMessage(input);
      rl.resume();
      rl.prompt();
    });

    rl.on('close', () => {
      this.statusBar.deactivate();
      process.exit(0);
    });

    rl.on('SIGINT', () => {
      this.persistSession();
      this.statusBar.deactivate();
      console.log(this.chalk.dim('\nGoodbye! 👋\n'));
      rl.close();
    });
  }
}

module.exports = { Chat };
