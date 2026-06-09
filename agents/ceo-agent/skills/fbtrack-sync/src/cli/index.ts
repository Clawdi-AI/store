#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../lib/logger.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { discoverCommand } from './commands/discover.js';
import { syncCommand } from './commands/sync.js';
import { extractCommand } from './commands/extract.js';
import { reportCommand } from './commands/report.js';
import { auditCommand } from './commands/audit.js';
import { clearCommand } from './commands/clear.js';
import { attioCommand } from './commands/attio.js';
import { exportChatCommand } from './commands/export-chat.js';
import { slackSyncCommand } from './commands/slack-sync.js';
import { workflowCommand } from './commands/workflow.js';
import { queryActivityCommand } from './commands/query-activity.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Read package.json for version
  const packageJson = await fs.readJson(path.join(__dirname, '../../package.json'));
  
  const program = new Command();

  program
    .name('fbtrack')
    .description('CLI tool for syncing Telegram messages and extracting structured feedback')
    .version(packageJson.version);

  // Add commands
  program.addCommand(initCommand);
  program.addCommand(loginCommand);
  program.addCommand(discoverCommand);
  program.addCommand(syncCommand);
  program.addCommand(extractCommand);
  program.addCommand(reportCommand);
  program.addCommand(auditCommand);
  program.addCommand(clearCommand);
  program.addCommand(attioCommand);
  program.addCommand(exportChatCommand);
  program.addCommand(slackSyncCommand);
  program.addCommand(workflowCommand);
  program.addCommand(queryActivityCommand);

  // Global error handling
  program.exitOverride();

  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'commander.help' || error.code === 'commander.version' || error.code === 'commander.helpDisplayed') {
      process.exit(0);
    }
    if (error.exitCode === 0 || error.message === '(outputHelp)') {
      process.exit(0);
    }
    
    logger.error('Command failed', error);
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', error);
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Fatal error', error);
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});