'use strict';

// Persistent bottom status bar using ANSI scroll regions.

class StatusBar {
  constructor(chalk) {
    this.chalk = chalk;
    this.leftText = '';
    this.rightText = '';
    this.enabled = process.stdout.isTTY || false;
    this.active = false;
    this._resizeHandler = null;
  }

  activate() {
    if (!this.enabled) return;
    this.active = true;
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
    // Clear the status bar line
    process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
    // Move cursor up
    process.stdout.write(`\x1b[${rows - 1};1H`);

    if (this._resizeHandler) {
      process.stdout.removeListener('resize', this._resizeHandler);
    }
  }

  update(left, right) {
    if (left !== undefined) this.leftText = left;
    if (right !== undefined) this.rightText = right;
    if (this.active) this._draw();
  }

  // Position cursor at bottom of scroll region (just above status bar)
  cursorToBottom() {
    if (!this.enabled) return;
    const rows = process.stdout.rows || 24;
    process.stdout.write(`\x1b[${rows - 1};1H`);
  }

  _setup() {
    const rows = process.stdout.rows || 24;
    // Set scroll region to exclude last line
    process.stdout.write(`\x1b[1;${rows - 1}r`);
    this._draw();
  }

  _draw() {
    if (!this.active) return;
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;

    const left = this.leftText || '';
    const right = this.rightText || '';

    // Strip ANSI for length calculation
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const leftLen = stripAnsi(left).length;
    const rightLen = stripAnsi(right).length;
    const gap = Math.max(1, cols - leftLen - rightLen);

    const bar = left + ' '.repeat(gap) + right;

    // Save cursor, move to bottom row, draw bar, restore cursor
    process.stdout.write('\x1b[s'); // save cursor position
    process.stdout.write(`\x1b[${rows};1H`); // move to last row
    process.stdout.write('\x1b[2K'); // clear line
    process.stdout.write(`\x1b[7m${bar}\x1b[0m`); // reverse video
    process.stdout.write('\x1b[u'); // restore cursor position
  }
}

module.exports = { StatusBar };
