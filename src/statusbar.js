'use strict';

// Persistent bottom area: directory line + status bar using ANSI scroll regions.

class StatusBar {
  constructor(chalk) {
    this.chalk = chalk;
    this.leftText = '';
    this.rightText = '';
    this.cwdText = '';
    this.enabled = process.stdout.isTTY || false;
    this.active = false;
    this._resizeHandler = null;
  }

  activate() {
    if (!this.enabled) return;
    this.active = true;
    this.updateCwd();
    this._setup();
    this.cursorToBottom();

    this._resizeHandler = () => {
      if (this.active) {
        this._setup();
        this.cursorToBottom();
      }
    };
    process.stdout.on('resize', this._resizeHandler);
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    const rows = process.stdout.rows || 24;
    // Reset scroll region to full terminal
    process.stdout.write(`\x1b[1;${rows}r`);
    // Clear both bottom lines
    process.stdout.write(`\x1b[${rows - 1};1H\x1b[2K`);
    process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
    // Move cursor up
    process.stdout.write(`\x1b[${rows - 2};1H`);

    if (this._resizeHandler) {
      process.stdout.removeListener('resize', this._resizeHandler);
    }
  }

  update(left, right) {
    if (left !== undefined) this.leftText = left;
    if (right !== undefined) this.rightText = right;
    if (this.active) this._draw();
  }

  updateCwd() {
    const cwd = process.cwd();
    const home = require('os').homedir();
    this.cwdText = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
    if (this.active) this._draw();
  }

  // Position cursor at bottom of scroll region (just above the 2 reserved lines)
  cursorToBottom() {
    if (!this.enabled) return;
    const rows = process.stdout.rows || 24;
    process.stdout.write(`\x1b[${rows - 2};1H`);
    this._draw();
  }

  _setup() {
    const rows = process.stdout.rows || 24;
    // Reserve bottom 2 lines: cwd line + status bar
    process.stdout.write(`\x1b[1;${rows - 2}r`);
    this._draw();
  }

  _draw() {
    if (!this.active) return;
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;

    // Build cwd line
    const cwdLine = this.chalk ? this.chalk.dim(` 📂 ${this.cwdText}`) : ` 📂 ${this.cwdText}`;

    // Build status bar
    const left = this.leftText || '';
    const right = this.rightText || '';
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const leftLen = stripAnsi(left).length;
    const rightLen = stripAnsi(right).length;
    const gap = Math.max(1, cols - leftLen - rightLen);
    const bar = left + ' '.repeat(gap) + right;

    // Write everything in a single atomic operation to prevent flickering
    const buf =
      '\x1b[s' +                              // save cursor
      `\x1b[${rows - 1};1H\x1b[2K` + cwdLine + // cwd line
      `\x1b[${rows};1H\x1b[2K` +              // clear status line
      `\x1b[7m${bar}\x1b[0m` +                // status bar (reverse video)
      '\x1b[u';                                // restore cursor
    process.stdout.write(buf);
  }
}

module.exports = { StatusBar };
