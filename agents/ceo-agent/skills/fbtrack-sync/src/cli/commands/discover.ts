import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';
import { SyncService } from '../../core/sync.js';
import fs from 'fs-extra';
import path from 'path';

export const discoverCommand = new Command('discover')
  .description('Discover available chats and create editable selection file')
  .option('--limit <number>', 'Number of chats to discover', '200')
  .action(async (options) => {
    let syncService: SyncService | null = null;
    
    try {
      const limit = parseInt(options.limit) || 200;
      logger.info('Discover command started', { limit });
      console.log(chalk.blue(`Discovering up to ${limit} recent chats...`));
      
      // Load config
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      
      // Initialize sync service
      syncService = new SyncService(config);
      await syncService.initialize();
      
      // Get dialogs from Telegram
      const dialogs = await syncService.getDialogs(limit);
      
      if (dialogs.length === 0) {
        console.log(chalk.yellow('No chats found'));
        return;
      }
      
      console.log(chalk.green(`Found ${dialogs.length} chats`));
      
      // Create chats selection file
      const configDir = path.join(process.cwd(), config.storage.configDir);
      await fs.ensureDir(configDir);
      const chatsFilePath = path.join(configDir, 'chats.txt');
      
      // Parse existing file to preserve uncommented lines
      const existingChats = new Map<string, string>(); // chatId -> full line
      const existingCommentedChats = new Set<string>(); // chatId set for deduplication
      
      if (await fs.pathExists(chatsFilePath)) {
        const existingContent = await fs.readFile(chatsFilePath, 'utf8');
        const existingLines = existingContent.split('\n');
        
        for (const line of existingLines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed.startsWith('# Chat Selection File') || 
              trimmed.startsWith('# Uncomment lines') || trimmed.startsWith('# Format:')) {
            continue; // Skip header comments
          }
          
          if (trimmed.startsWith('#')) {
            // Extract chat ID from commented line
            const match = trimmed.match(/^#\s*(-?\d+),/);
            if (match) {
              existingCommentedChats.add(match[1]);
            }
          } else {
            // Preserve uncommented line
            const match = trimmed.match(/^(-?\d+),/);
            if (match) {
              existingChats.set(match[1], line);
            }
          }
        }
      }
      
      // Generate content for editable file
      const lines: string[] = [
        '# Chat Selection File',
        '# Uncomment lines to enable tracking for specific chats',
        '# Format: chatId,chatTitle,chatType,memberCount',
        '',
      ];
      
      // Add preserved uncommented lines first
      for (const line of existingChats.values()) {
        lines.push(line);
      }
      
      // Add new chats as commented lines
      for (const dialog of dialogs) {
        const entity = (dialog as any).entity;
        if (!entity || !('id' in entity) || !('title' in entity)) continue;
        
        // Format chat ID correctly for Telegram API
        let chatId: string;
        const rawId = entity.id.toString();
        
        if ('broadcast' in entity && entity.broadcast) {
          // Channel
          chatId = `-100${rawId}`;
        } else if ('megagroup' in entity && entity.megagroup) {
          // Supergroup
          chatId = `-100${rawId}`;
        } else {
          // Regular group or other
          chatId = `-${rawId}`;
        }
        
        // Skip if already exists (either uncommented or commented)
        if (existingChats.has(chatId) || existingCommentedChats.has(chatId)) {
          continue;
        }
        
        const title = entity.title.replace(/,/g, ';'); // Escape commas in title
        const type = 'broadcast' in entity && entity.broadcast ? 'channel' : 'supergroup';
        const memberCount = entity.participantsCount || '';
        
        // Add as commented line (opt-in)
        lines.push(`# ${chatId},${title},${type},${memberCount}`);
      }
      
      await fs.writeFile(chatsFilePath, lines.join('\n'));
      
      console.log(chalk.green(`\n✓ Chat discovery completed!`));
      console.log(chalk.blue(`\nUpdated: ${chatsFilePath}`));
      console.log(chalk.gray(`${existingChats.size} chats enabled, ${existingCommentedChats.size + dialogs.length - existingChats.size} available`));
      console.log(chalk.cyan('\nNext steps:'));
      console.log(chalk.cyan('1. Edit the file and uncomment lines (remove #) for chats you want to track'));
      console.log(chalk.cyan('2. Run "fbtrack sync" to sync selected chats'));
      
    } catch (error: any) {
      logger.error('Discover command failed', error);
      console.error(chalk.red('Discovery failed:'), error.message);
      
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