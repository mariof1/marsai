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

function displayResult(chalk, result) {
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

module.exports = { extractCommands, stripCommandTags, executeCommand, displayResult, buildCommandResultMessage };
