'use strict';

const chalk = require('chalk');
const { getApiKey, promptForApiKey } = require('./config');
const { Chat } = require('./chat');

const BANNER = `
  ╔══════════════════════════════════════╗
  ║          🚀  MarsAI  CLI            ║
  ║    AI-powered terminal assistant     ║
  ╚══════════════════════════════════════╝
`;

async function run() {
  // Handle --version
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const pkg = require('../package.json');
    console.log(`marsai v${pkg.version}`);
    return;
  }

  // Handle --help
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
  Usage: marsai [options]

  Options:
    -v, --version     Show version
    -h, --help        Show this help
    --set-key <key>   Save OpenRouter API key to ~/.marsai/config.json
    --model <model>   Set model for this session

  Environment Variables:
    OPENROUTER_API_KEY   Your OpenRouter API key (takes priority over config file)
    MARSAI_MODEL         Override the default model

  In-chat Commands:
    /help      Show commands
    /clear     Clear conversation
    /model     Show or change model
    /history   Show conversation history
    /exit      Exit
`);
    return;
  }

  // Handle --set-key
  const setKeyIdx = process.argv.indexOf('--set-key');
  if (setKeyIdx !== -1) {
    const key = process.argv[setKeyIdx + 1];
    if (!key) {
      console.error(chalk.red('Error: --set-key requires a value'));
      process.exit(1);
    }
    const { saveConfig, loadConfig } = require('./config');
    const config = loadConfig();
    config.apiKey = key;
    saveConfig(config);
    console.log(chalk.green('API key saved to ~/.marsai/config.json'));
    return;
  }

  // Get API key
  let apiKey = getApiKey();
  if (!apiKey) {
    console.log(chalk.yellow('\n  No OpenRouter API key found.'));
    console.log(chalk.dim('  Set via: export OPENROUTER_API_KEY=sk-... or marsai --set-key sk-...\n'));
    apiKey = await promptForApiKey();
    if (!apiKey) {
      console.error(chalk.red('  API key is required. Exiting.\n'));
      process.exit(1);
    }
    console.log(chalk.green('  API key saved!\n'));
  }

  // Print banner
  console.log(chalk.magenta(BANNER));
  console.log(chalk.dim('  Type /help for commands, /exit or Ctrl+C to quit.\n'));

  // Handle --model override
  const modelIdx = process.argv.indexOf('--model');
  const chat = new Chat(apiKey, chalk);
  if (modelIdx !== -1 && process.argv[modelIdx + 1]) {
    chat.model = process.argv[modelIdx + 1];
    console.log(chalk.cyan(`  Using model: ${chat.model}\n`));
  } else {
    console.log(chalk.dim(`  Model: ${chat.model}\n`));
  }

  await chat.startLoop();
}

module.exports = { run };
