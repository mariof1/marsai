'use strict';

const { execSync } = require('child_process');

const COMMAND_REGEX = /<run_command>([\s\S]*?)<\/run_command>/g;

function extractCommands(text) {
  const commands = [];
  let match;
  while ((match = COMMAND_REGEX.exec(text)) !== null) {
    commands.push(match[1].trim());
  }
  COMMAND_REGEX.lastIndex = 0;
  return commands;
}

function stripCommandTags(text) {
  return text.replace(COMMAND_REGEX, '').trim();
}

function askConfirmation(chalk, command) {
  return new Promise((resolve) => {
    console.log();
    console.log(chalk.yellow('  ⚡ MarsAI wants to run:'));
    console.log(chalk.cyan(`  $ ${command}`));
    process.stdout.write(chalk.yellow('  Run this command? ') + chalk.dim('[Y/n] '));

    // Use raw mode to capture a single keypress without interfering with main readline
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();

    stdin.once('data', (data) => {
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      const key = data.toString().trim().toLowerCase();

      // Handle Ctrl+C
      if (data[0] === 3) {
        process.stdout.write('\n');
        resolve(false);
        return;
      }

      process.stdout.write(key === 'n' ? 'n\n' : 'y\n');
      resolve(key !== 'n');
    });
  });
}

function executeCommand(command, timeout = 60000) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.env.SHELL || '/bin/bash',
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5,
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    const output = [stdout, stderr].filter(Boolean).join('\n') || err.message;
    return { success: false, output, code: err.status };
  }
}

async function processCommandsInResponse(chalk, response) {
  const commands = extractCommands(response);
  if (commands.length === 0) return null;

  const results = [];
  for (const cmd of commands) {
    const confirmed = await askConfirmation(chalk, cmd);
    if (!confirmed) {
      console.log(chalk.dim('  Skipped.\n'));
      results.push({ command: cmd, skipped: true });
      continue;
    }

    console.log(chalk.dim('  Running...\n'));
    const result = executeCommand(cmd);

    if (result.output) {
      const lines = result.output.split('\n');
      const maxLines = 50;
      const display = lines.length > maxLines
        ? [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines)`]
        : lines;
      for (const line of display) {
        console.log(chalk.dim('  │ ') + line);
      }
      console.log();
    }

    if (result.success) {
      console.log(chalk.green('  ✓ Command completed successfully.\n'));
    } else {
      console.log(chalk.red(`  ✗ Command failed (exit code ${result.code}).\n`));
    }

    results.push({ command: cmd, ...result });
  }

  return results;
}

function buildCommandResultMessage(results) {
  const parts = results.map((r) => {
    if (r.skipped) return `Command \`${r.command}\` was skipped by the user.`;
    const status = r.success ? 'completed successfully' : `failed with exit code ${r.code}`;
    const output = r.output
      ? `\nOutput:\n\`\`\`\n${r.output.slice(0, 4000)}\n\`\`\``
      : '\n(no output)';
    return `Command \`${r.command}\` ${status}.${output}`;
  });
  return parts.join('\n\n');
}

module.exports = { extractCommands, stripCommandTags, processCommandsInResponse, buildCommandResultMessage };
