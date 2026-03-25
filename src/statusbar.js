'use strict';

// Persistent bottom status bar using ANSI scroll regions.

class StatusBar {
  constructor(chalk) {
    this.chalk = chalk;
    this.leftText = '';
    this.rightText = '';
    this.enabled = process.stdout.isTTY || false;
    this.active = false;
  }

  activate() {
    if (!this.enabled) return;
    this.active = true;
    this._setScrollRegion();
    this._draw();

    process.stdout.on('resize', () => {
      if (this.active) {
        this._setScrollRegion();
        this._draw();
      }
    });
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    const rows = process.stdout.rows || 24;
    // Reset scroll region to full terminal
    process.stdout.write(`\x1b[1;${rows}r`);
    // Clear the status bar line
    process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
    // Move cursor back into content area
    process.stdout.write(`\x1b[${rows - 1};1H`);
  }

  update(left, right) {
    this.leftText = left || this.leftText;
    this.rightText = right || this.rightText;
    if (this.active) this._draw();
  }

  updateRight(text) {
    this.rightText = text;
    if (this.active) this._draw();
  }

  updateLeft(text) {
    this.leftText = text;
    if (this.active) this._draw();
  }

  _setScrollRegion() {
    const rows = process.stdout.rows || 24;
    // Reserve the bottom line for the status bar; scroll region is rows 1 to rows-1
    process.stdout.write(`\x1b[1;${rows - 1}r`);
    // Move cursor into the scroll region
    process.stdout.write(`\x1b[${rows - 1};1H`);
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
    process.stdout.write('\x1b7'); // save cursor
    process.stdout.write(`\x1b[${rows};1H`); // move to bottom
    process.stdout.write('\x1b[2K'); // clear line
    process.stdout.write(`\x1b[7m${bar}\x1b[0m`); // reverse video for bar
    process.stdout.write('\x1b8'); // restore cursor
  }
}

module.exports = { StatusBar };
