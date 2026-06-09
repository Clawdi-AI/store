import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../lib/logger.js';
import { AgentProcessor } from '../../core/processor.js';
import { AgentRegistry } from '../../lib/agent-registry.js';
import { DEFAULT_CONFIG } from '../../lib/ai-agent.js';
import { ConfigManager } from '../../core/config.js';

export const extractCommand = new Command('extract')
  .description('Run AI agents to extract structured data from raw messages')
  .option('--since <date>', 'Process messages since this date (YYYY-MM-DD)')
  .option('--reprocess', 'Force reprocessing of already processed messages', false)
  .option('--agent <type>', 'Agent type to run (qa-extractor, sales-extractor)', 'qa-extractor')
  .option('--chat <chatId>', 'Process specific chat ID')
  .option('--all', 'Process all available chats', false)
  .option('--limit <number>', 'Maximum number of chats to process', parseInt)
  .action(async (options) => {
    try {
      logger.info('Extract command started', { options });
      
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red('OPENAI_API_KEY environment variable is required'));
        process.exit(1);
      }

      const baseDir = process.cwd();

      // Load configuration
      const configManager = new ConfigManager(baseDir);
      const config = await configManager.loadConfig();
      const reprocessWindowHours = config.extract?.reprocessWindowHours || 6;

      const processor = new AgentProcessor(baseDir, reprocessWindowHours);

      // Configure agent
      const agentConfig = {
        ...DEFAULT_CONFIG,
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      };

      // Create agent using registry
      let agent;
      try {
        const handler = AgentRegistry.getHandler(options.agent);
        agent = handler.createAgent(agentConfig, baseDir);
      } catch (error: any) {
        console.error(chalk.red(error.message));
        console.error(chalk.gray(`Available agents: ${AgentRegistry.getAvailableAgents().join(', ')}`));
        process.exit(1);
      }

      // Process specific chat, all chats, or limited batch
      if (options.chat) {
        const chatTitle = await processor.getChatTitle(options.chat);
        console.log(chalk.blue(`Processing ${chatTitle} (${options.chat})`));
        await processor.processChat(agent, options.chat, options.reprocess);
      } else if (options.all || options.limit) {
        const availableChats = await processor.discoverChats();
        console.log(chalk.blue(`Found ${availableChats.length} available chats`));
        
        if (availableChats.length === 0) {
          console.log(chalk.yellow('No chat files found in data/raw/'));
          return;
        }

        // If using --limit, filter for chats that actually need processing
        let chatsToProcess: string[] = [];
        let totalCost = 0;
        let processedCount = 0;

        if (options.limit) {
          console.log(chalk.blue(`Looking for ${options.limit} chats with new messages...\n`));
          
          for (const chatId of availableChats) {
            if (processedCount >= options.limit) break;
            
            const newMessages = await processor.getNewMessages(agent, chatId, options.reprocess);
            const chatTitle = await processor.getChatTitle(chatId);
            
            if (newMessages.length > 0) {
              console.log(chalk.gray(`  ✓ ${chatTitle}: ${newMessages.length} new messages`));
              chatsToProcess.push(chatId);
              processedCount++;
            } else {
              console.log(chalk.gray(`  - ${chatTitle}: no new messages (skipped)`));
            }
          }
          
          if (chatsToProcess.length === 0) {
            console.log(chalk.yellow('No chats have new messages to process'));
            return;
          }
        } else {
          // Process all chats
          chatsToProcess = availableChats;
        }

        console.log(chalk.blue(`Processing ${chatsToProcess.length} chats...\n`));

        for (let i = 0; i < chatsToProcess.length; i++) {
          const chatId = chatsToProcess[i];
          const chatTitle = await processor.getChatTitle(chatId);
          console.log(chalk.gray(`[${i + 1}/${chatsToProcess.length}] ${chatTitle} (${chatId})`));
          
          try {
            const result = await processor.processChat(agent, chatId, options.reprocess);

            // Only add cost if actual processing occurred
            if (result && result.cost) {
              totalCost += result.cost;
            }

          } catch (error: any) {
            console.error(chalk.red(`  Error processing chat ${chatId}:`), error.message);
          }
        }

        console.log(chalk.green(`\nBatch Processing Complete:`));
        console.log(`  Chats processed: ${chatsToProcess.length}`);
        console.log(`  Total estimated cost: $${totalCost.toFixed(4)}`);
      } else {
        console.log(chalk.yellow('No processing target specified'));
        console.log(chalk.gray('Options:'));
        console.log(chalk.gray('  --chat <chatId>   Process specific chat'));
        console.log(chalk.gray('  --all             Process all available chats'));
        console.log(chalk.gray('  --limit <n>       Process first N chats'));
      }

      console.log(chalk.green('Extraction completed successfully'));
    } catch (error: any) {
      logger.error('Extract command failed', error);
      console.error(chalk.red('Extraction failed:'), error.message);
      process.exit(1);
    }
  });