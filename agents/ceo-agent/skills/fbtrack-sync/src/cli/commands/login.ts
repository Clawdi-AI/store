import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';
import { TelegramService } from '../../services/telegram.js';

export const loginCommand = new Command('login')
  .description('Log in with GramJS (Telegram MTProto) and save session')
  .option('--force', 'Force re-authentication even if session exists', false)
  .action(async (options) => {
    try {
      logger.info('Login command started');
      console.log(chalk.blue('Initializing Telegram login...'));
      
      // Load config
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      // Initialize Telegram service
      const telegramService = new TelegramService(config);
      
      // Check if we already have a valid session
      if (!options.force && await telegramService.hasValidSession()) {
        console.log(chalk.green('✓ Already logged in with valid session'));
        console.log(chalk.yellow('Use --force to re-authenticate'));
        
        // Test the session by connecting
        try {
          await telegramService.initialize();
          const dialogs = await telegramService.getDialogs(5);
          console.log(chalk.blue(`Session verified - found ${dialogs.length} accessible chats`));
          await telegramService.disconnect();
          return;
        } catch (error) {
          console.log(chalk.yellow('Session exists but invalid, will re-authenticate...'));
        }
      }
      
      console.log(chalk.blue('Starting authentication process...'));
      await telegramService.initialize(options.force);
      
      console.log(chalk.green('✓ Successfully logged in to Telegram'));
      console.log(chalk.cyan('Session saved. You can now run: fbtrack sync'));
      console.log(chalk.gray(`📝 Detailed logs saved to: logs/combined.log (Run ID: ${logger.getRunId()})`));
      
      // Get basic info
      const dialogs = await telegramService.getDialogs(10);
      console.log(chalk.blue(`Found ${dialogs.length} chats/channels`));
      
      await telegramService.disconnect();
      
    } catch (error: any) {
      logger.error('Login command failed', error);
      console.error(chalk.red('Login failed:'), error.message);
      
      if (error.message.includes('TELEGRAM_API_ID') || error.message.includes('TELEGRAM_API_HASH')) {
        console.log(chalk.yellow('\nPlease update your .env file with valid Telegram API credentials:'));
        console.log(chalk.cyan('1. Go to https://my.telegram.org'));
        console.log(chalk.cyan('2. Create an application and get API ID and hash'));
        console.log(chalk.cyan('3. Update .env with TELEGRAM_API_ID and TELEGRAM_API_HASH'));
      }
      
      process.exit(1);
    }
  });