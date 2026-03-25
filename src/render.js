'use strict';

const { marked } = require('marked');
const { markedTerminal } = require('marked-terminal');

marked.use(markedTerminal({
  tab: 2,
  showSectionPrefix: false,
  reflowText: true,
  width: Math.min(process.stdout.columns || 80, 100) - 4,
}));

function renderMarkdown(text) {
  try {
    // marked adds trailing newlines; trim them but keep one
    return marked(text).replace(/\n+$/, '\n');
  } catch {
    return text;
  }
}

module.exports = { renderMarkdown };
