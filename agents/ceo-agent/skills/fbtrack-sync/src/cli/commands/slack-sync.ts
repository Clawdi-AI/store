import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';
import { SlackService } from '../../services/slack.js';
import { DatabaseManager } from '../../db/database.js';

export const slackSyncCommand = new Command('slack-sync')
  .description('Sync messages from Slack channels')
  .option('--channel <channelId>', 'Sync specific Slack channel ID')
  .option('--discover', 'Discover available Slack channels')
  .option('--days <number>', 'Number of days to look back', '10')
  .action(async (options) => {
    try {
      logger.info('Slack sync command started', { options });

      // Check for Slack token
      const slackToken = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
      if (!slackToken) {
        console.log(chalk.red('Error: SLACK_BOT_TOKEN or SLACK_USER_TOKEN not set in .env'));
        console.log(chalk.yellow('\nTo set up Slack integration:'));
        console.log('1. Go to https://api.slack.com/apps');
        console.log('2. Create a new app or use an existing one');
        console.log('3. Add the following Bot Token Scopes:');
        console.log('   - channels:read');
        console.log('   - channels:history');
        console.log('   - groups:read');
        console.log('   - groups:history');
        console.log('   - users:read');
        console.log('4. Install the app to your workspace');
        console.log('5. Copy the Bot User OAuth Token to .env as SLACK_BOT_TOKEN');
        return;
      }

      const slack = new SlackService();

      // Test connection
      console.log(chalk.blue('Testing Slack connection...'));
      const connected = await slack.testConnection();
      if (!connected) {
        console.log(chalk.red('Failed to connect to Slack. Please check your token.'));
        return;
      }
      console.log(chalk.green('✓ Connected to Slack'));

      // Discover channels
      if (options.discover) {
        console.log(chalk.blue('\nDiscovering Slack channels...'));
        const channels = await slack.listChannels(200);

        console.log(chalk.green(`\nFound ${channels.length} channels:\n`));

        // Save to slack-channels.txt
        const configManager = new ConfigManager();
        const config = await configManager.loadConfig();
        const slackChannelsPath = path.join(config.storage.configDir, 'slack-channels.txt');

        let content = '# Slack Channel Selection File\n';
        content += '# Format: channelId,channelName,isPrivate,memberCount\n';
        content += '# Uncomment lines to enable syncing for specific channels\n\n';

        for (const channel of channels) {
          const line = `# ${channel.id},${channel.name},${channel.is_private},${channel.num_members || 0}`;
          content += line + '\n';
          console.log(`  ${channel.is_private ? '🔒' : '#'} ${channel.name} (${channel.id}) - ${channel.num_members || '?'} members`);
        }

        await fs.writeFile(slackChannelsPath, content);
        console.log(chalk.green(`\n✓ Saved channel list to ${slackChannelsPath}`));
        console.log(chalk.cyan('Edit the file and uncomment channels you want to sync'));
        return;
      }

      // Load config
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      // Get channels to sync
      let channelsToSync: { id: string; name: string }[] = [];

      if (options.channel) {
        const channelInfo = await slack.getChannelInfo(options.channel);
        if (channelInfo) {
          channelsToSync.push({ id: channelInfo.id, name: channelInfo.name });
        } else {
          console.log(chalk.red(`Channel ${options.channel} not found`));
          return;
        }
      } else {
        // Read from slack-channels.txt
        const slackChannelsPath = path.join(config.storage.configDir, 'slack-channels.txt');
        if (await fs.pathExists(slackChannelsPath)) {
          const content = await fs.readFile(slackChannelsPath, 'utf8');
          const lines = content.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const parts = trimmed.split(',');
            if (parts.length >= 2) {
              channelsToSync.push({ id: parts[0], name: parts[1] });
            }
          }
        }

        if (channelsToSync.length === 0) {
          console.log(chalk.yellow('No Slack channels configured for syncing.'));
          console.log(chalk.cyan('Run "fbtrack slack-sync --discover" to find channels'));
          console.log(chalk.cyan('Then edit config/slack-channels.txt to select channels'));
          return;
        }
      }

      console.log(chalk.blue(`\nSyncing ${channelsToSync.length} Slack channel(s)...`));

      const lookbackDays = parseInt(options.days) || 10;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (lookbackDays * 24 * 60 * 60 * 1000));

      // Initialize database for indexing
      const db = new DatabaseManager();
      await db.initialize();

      const results: { [channelId: string]: { newMessages: number } } = {};

      for (const channel of channelsToSync) {
        console.log(chalk.blue(`\n[${channel.name}] Fetching messages...`));

        try {
          const messages = await slack.getMessages(
            channel.id,
            channel.name,
            startDate,
            endDate,
            5000
          );

          // Save to JSONL file
          const rawDir = path.join(config.storage.dataDir, 'raw');
          await fs.ensureDir(rawDir);

          const chatId = `slack_${channel.id}`;
          const filePath = path.join(rawDir, `${chatId}.jsonl`);
          const jsonlContent = messages.map(m => JSON.stringify(m)).join('\n');

          if (messages.length > 0) {
            await fs.writeFile(filePath, jsonlContent + '\n');

            // Index messages to database
            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i];
              await db.indexMessage(msg, filePath, 0, i + 1);
            }

            // Update chat metadata
            await db.upsertChat(chatId, `[Slack] ${channel.name}`, 'channel', 0);
          }

          results[channel.id] = { newMessages: messages.length };
          console.log(chalk.green(`  ✓ ${messages.length} messages saved and indexed`));
        } catch (error: any) {
          console.log(chalk.red(`  ✗ Error: ${error.message}`));
          results[channel.id] = { newMessages: 0 };
        }
      }

      // Summary
      console.log(chalk.green('\n✓ Slack sync completed!'));
      const totalMessages = Object.values(results).reduce((sum, r) => sum + r.newMessages, 0);
      console.log(chalk.blue(`Total messages synced: ${totalMessages}`));

    } catch (error: any) {
      logger.error('Slack sync command failed', error);
      console.error(chalk.red('Slack sync failed:'), error.message);
      process.exit(1);
    }
  });
