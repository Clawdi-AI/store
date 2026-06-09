import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';
import { SyncService } from '../../core/sync.js';

export const syncCommand = new Command('sync')
  .description('Sync messages from selected chats with incremental checkpoints')
  .option('--chat <chatId>', 'Sync specific chat ID only')
  .action(async (options) => {
    let syncService: SyncService | null = null;
    
    try {
      logger.info('Sync command started', { options });
      console.log(chalk.blue('Initializing sync...'));
      
      // Load config
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      // Initialize sync service
      syncService = new SyncService(config);
      await syncService.initialize();
      
      // Sync messages
      let results: { [chatId: string]: { newMessages: number; totalMessages: number } };
      
      if (options.chat) {
        console.log(chalk.blue(`Syncing chat: ${options.chat}`));
        const result = await syncService.syncChat(options.chat);
        results = { [options.chat]: result };
      } else {
        console.log(chalk.blue('Syncing selected chats...'));
        const selectedChatIds = await syncService.getSelectedChatIds();
        if (selectedChatIds.length === 0) {
          console.log(chalk.yellow('No chats selected for tracking.'));
          console.log(chalk.cyan('Run "fbtrack discover" to select chats to track'));
          return;
        }
        console.log(chalk.blue(`Found ${selectedChatIds.length} selected chats`));
        results = await syncService.syncTrackedChats();
      }
      
      // Display results
      console.log(chalk.green('\n✓ Sync completed!'));
      console.log('\nResults:');
      
      for (const [chatId, result] of Object.entries(results)) {
        const { newMessages, totalMessages } = result;
        if (newMessages > 0) {
          console.log(chalk.green(`  ${chatId}: ${newMessages} new messages (${totalMessages} total in range)`));
        } else {
          console.log(chalk.gray(`  ${chatId}: No new messages (${totalMessages} total in range)`));
        }
      }
      
      const totalNew = Object.values(results).reduce((sum, r) => sum + r.newMessages, 0);
      const totalProcessed = Object.values(results).reduce((sum, r) => sum + r.totalMessages, 0);
      
      console.log(chalk.blue(`\nSummary: ${totalNew} new messages synced, ${totalProcessed} total processed`));
      console.log(chalk.gray(`📝 Detailed logs saved to: logs/combined.log (Run ID: ${logger.getRunId()})`));
      
      if (totalNew > 0) {
        console.log(chalk.cyan('\nNext step: Run fbtrack summarize to extract feedback from synced messages'));
      }
      
    } catch (error: any) {
      logger.error('Sync command failed', error);
      console.error(chalk.red('Sync failed:'), error.message);
      
      if (error.message.includes('not initialized')) {
        console.log(chalk.yellow('\nPlease run fbtrack login first to authenticate with Telegram'));
      }
      
      process.exit(1);
    } finally {
      if (syncService) {
        await syncService.disconnect();
      }
    }
  });