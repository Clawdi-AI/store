import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';
import { TelegramService } from '../../services/telegram.js';

interface ActivityResult {
  chatId: string;
  chatTitle: string;
  lastActivity: string | null;
  dealId: string;
}

export const queryActivityCommand = new Command('query-activity')
  .description('Query Telegram for last activity date of chats')
  .option('--output <path>', 'Output JSON file path', '/tmp/telegram_activity.json')
  .action(async (options) => {
    let telegram: TelegramService | null = null;

    try {
      logger.info('Query activity command started');

      // Load config
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      // Load Attio mappings
      const mappingsPath = path.join(process.cwd(), 'config', 'attio-mappings.json');
      if (!await fs.pathExists(mappingsPath)) {
        console.error(chalk.red('No attio-mappings.json found'));
        process.exit(1);
      }

      const mappingsData = await fs.readJSON(mappingsPath);
      const mappings = mappingsData.mappings || [];

      // Filter for valid mappings with autoUpdate
      const validMappings = mappings.filter((m: any) =>
        m.attioDealId &&
        !m.attioDealId.startsWith('pending_deal_') &&
        m.autoUpdate
      );

      console.log(chalk.blue(`Found ${validMappings.length} valid mappings to query`));

      // Initialize Telegram
      telegram = new TelegramService(config, process.cwd());
      await telegram.initialize();

      const results: ActivityResult[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (const mapping of validMappings) {
        const chatId = mapping.telegramChatId;
        const chatTitle = mapping.telegramChatTitle || 'Unknown';

        try {
          const info = await telegram.getLatestMessageInfo(chatId);

          if (info) {
            console.log(chalk.green(`✓ ${chatTitle}: ${info.date.toISOString().split('T')[0]}`));
            results.push({
              chatId,
              chatTitle,
              lastActivity: info.date.toISOString(),
              dealId: mapping.attioDealId
            });
            successCount++;
          } else {
            console.log(chalk.yellow(`⚠ ${chatTitle}: no messages`));
            results.push({
              chatId,
              chatTitle,
              lastActivity: null,
              dealId: mapping.attioDealId
            });
          }

          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (e: any) {
          console.log(chalk.red(`✗ ${chatTitle}: ${e.message}`));
          results.push({
            chatId,
            chatTitle,
            lastActivity: null,
            dealId: mapping.attioDealId
          });
          errorCount++;
        }
      }

      // Save results
      await fs.writeJSON(options.output, results, { spaces: 2 });

      console.log(chalk.green(`\n=== Summary ===`));
      console.log(`Total: ${validMappings.length}`);
      console.log(`Success: ${successCount}`);
      console.log(`Errors: ${errorCount}`);
      console.log(chalk.blue(`Results saved to: ${options.output}`));

    } catch (error: any) {
      logger.error('Query activity command failed', error);
      console.error(chalk.red('Failed:'), error.message);
      process.exit(1);
    } finally {
      if (telegram) {
        await telegram.disconnect();
      }
    }
  });
