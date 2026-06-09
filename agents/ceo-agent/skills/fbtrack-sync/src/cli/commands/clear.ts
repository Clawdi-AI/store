import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';
import { DatabaseManager } from '../../db/database.js';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';

export const clearCommand = new Command('clear')
  .description('Clear sync checkpoint and data for debugging')
  .option('--chat <chatId>', 'Clear specific chat only')
  .option('--all', 'Clear all chats (requires confirmation)')
  .option('--force', 'Skip confirmation prompts')
  .action(async (options) => {
    try {
      logger.info('Clear command started', { options });
      
      // Load config
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      // Initialize database
      const baseDir = process.cwd();
      const db = new DatabaseManager(baseDir);
      await db.initialize();
      
      if (options.all) {
        // Clear all data
        if (!options.force) {
          const confirmed = await promptConfirmation('Are you sure you want to clear ALL chat data and checkpoints? (yes/no): ');
          if (!confirmed) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }
        
        console.log(chalk.blue('Clearing all chat data...'));
        
        // Clear all checkpoints from database
        await db.clearAllCheckpoints();
        
        // Clear all JSONL files
        const rawDir = path.join(baseDir, config.storage.dataDir, 'raw');
        const unitsDir = path.join(baseDir, config.storage.dataDir, 'units');
        
        if (await fs.pathExists(rawDir)) {
          const files = await fs.readdir(rawDir);
          for (const file of files) {
            if (file.endsWith('.jsonl')) {
              await fs.remove(path.join(rawDir, file));
              console.log(chalk.gray(`  Deleted: ${file}`));
            }
          }
        }
        
        if (await fs.pathExists(unitsDir)) {
          const files = await fs.readdir(unitsDir);
          for (const file of files) {
            if (file.endsWith('.jsonl')) {
              await fs.remove(path.join(unitsDir, file));
              console.log(chalk.gray(`  Deleted: ${file}`));
            }
          }
        }
        
        console.log(chalk.green('✓ All chat data and checkpoints cleared'));
        
      } else if (options.chat) {
        // Clear specific chat
        const chatId = options.chat;
        console.log(chalk.blue(`Clearing data for chat: ${chatId}`));
        
        // Clear checkpoint from database
        await db.clearChatCheckpoint(chatId);
        
        // Delete JSONL files
        const rawFile = path.join(baseDir, config.storage.dataDir, 'raw', `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}.jsonl`);
        const unitsFile = path.join(baseDir, config.storage.dataDir, 'units', `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}.jsonl`);
        
        if (await fs.pathExists(rawFile)) {
          await fs.remove(rawFile);
          console.log(chalk.gray(`  Deleted raw messages: ${rawFile}`));
        }
        
        if (await fs.pathExists(unitsFile)) {
          await fs.remove(unitsFile);
          console.log(chalk.gray(`  Deleted units: ${unitsFile}`));
        }
        
        // Clear from messages table
        await db.clearChatMessages(chatId);
        
        console.log(chalk.green(`✓ Cleared data for chat ${chatId}`));
        
      } else {
        console.log(chalk.yellow('Please specify --chat <chatId> or --all'));
        console.log(chalk.gray('\nExamples:'));
        console.log(chalk.gray('  fbtrack clear --chat -1001234567890'));
        console.log(chalk.gray('  fbtrack clear --all'));
        console.log(chalk.gray('  fbtrack clear --all --force'));
      }
      
      await db.close();
      
    } catch (error: any) {
      logger.error('Clear command failed', error);
      console.error(chalk.red('Clear failed:'), error.message);
      process.exit(1);
    }
  });

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}