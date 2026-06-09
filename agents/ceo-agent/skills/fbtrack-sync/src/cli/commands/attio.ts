import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../lib/logger.js';
import { AttioBridge } from '../../core/attio-bridge.js';
import { AttioSyncService } from '../../core/attio-sync.js';
import { AttioAutoMapper } from '../../core/attio-auto-mapper.js';
import { DatabaseManager } from '../../db/database.js';
import path from 'path';
import fs from 'fs-extra';

export const attioCommand = new Command('attio')
  .description('Manage Attio CRM integration')
  .addCommand(
    new Command('init')
      .description('Initialize Attio integration and test connection')
      .action(async () => {
        const spinner = ora('Initializing Attio integration...').start();
        
        try {
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          if (bridge.isEnabled()) {
            spinner.succeed('Attio integration initialized successfully');
            console.log(chalk.green('✓'), 'Connected to Attio API');
          } else {
            spinner.warn('Attio integration not configured');
            console.log(chalk.yellow('⚠'), 'Set ATTIO_API_KEY in .env to enable integration');
          }
        } catch (error) {
          spinner.fail('Failed to initialize Attio integration');
          logger.error('Attio init error', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('import')
      .description('Import mappings from categorized chats')
      .option('-f, --file <path>', 'Path to chats-categorized.txt', './config/chats-categorized.txt')
      .action(async (options) => {
        const spinner = ora('Importing chat mappings...').start();
        
        try {
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          if (!bridge.isEnabled()) {
            spinner.warn('Attio integration not configured');
            console.log(chalk.yellow('⚠'), 'Set ATTIO_API_KEY in .env to enable integration');
            return;
          }
          
          const filePath = path.resolve(options.file);
          if (!await fs.pathExists(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }
          
          const imported = await bridge.importFromCategorizedChats(filePath);
          spinner.succeed(`Imported ${imported} mappings`);
          
          console.log(chalk.yellow('⚠'), 'Note: Attio company and deal IDs are placeholders');
          console.log(chalk.blue('ℹ'), 'Update them with real IDs using:', chalk.cyan('fbtrack attio mapping'));
        } catch (error) {
          spinner.fail('Failed to import mappings');
          logger.error('Import error', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all configured mappings')
      .action(async () => {
        try {
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          const mappings = bridge.getMappings();
          
          if (mappings.length === 0) {
            console.log(chalk.yellow('No mappings configured'));
            console.log(chalk.blue('ℹ'), 'Import mappings using:', chalk.cyan('fbtrack attio import'));
            return;
          }
          
          console.log(chalk.bold('\n📋 Configured Attio Mappings:\n'));
          
          // Group by category
          const byCategory = mappings.reduce((acc, m) => {
            if (!acc[m.category]) acc[m.category] = [];
            acc[m.category].push(m);
            return acc;
          }, {} as Record<string, typeof mappings>);
          
          for (const [category, categoryMappings] of Object.entries(byCategory)) {
            console.log(chalk.blue.bold(`\n${category} (${categoryMappings.length} chats)`));
            console.log('─'.repeat(50));
            
            for (const mapping of categoryMappings) {
              const status = mapping.autoUpdate ? chalk.green('✓') : chalk.gray('○');
              const dealStatus = mapping.attioDealId.startsWith('pending_') ? 
                chalk.yellow('[PENDING]') : chalk.green('[LINKED]');
              
              console.log(`${status} ${chalk.bold(mapping.telegramChatTitle)}`);
              console.log(`   Chat ID: ${chalk.gray(mapping.telegramChatId)}`);
              console.log(`   Company: ${mapping.attioCompanyName} ${dealStatus}`);
              console.log(`   Deal ID: ${chalk.gray(mapping.attioDealId)}`);
            }
          }
          
          console.log('\n' + chalk.gray('─'.repeat(50)));
          console.log(chalk.blue('Total:'), mappings.length, 'mappings');
          console.log(chalk.green('Active:'), mappings.filter(m => m.autoUpdate).length);
          console.log(chalk.yellow('Pending:'), mappings.filter(m => m.attioDealId.startsWith('pending_')).length);
        } catch (error) {
          console.error(chalk.red('Failed to list mappings:'), error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('sync')
      .description('Process messages and update Attio deals')
      .option('-c, --chat <chatId>', 'Process specific chat')
      .option('-l, --limit <n>', 'Limit messages to process', '100')
      .action(async (options) => {
        const spinner = ora('Processing messages for Attio updates...').start();
        
        try {
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          if (!bridge.isEnabled()) {
            spinner.warn('Attio integration not configured');
            return;
          }
          
          // Get messages from database
          const db = new DatabaseManager();
          await db.initialize();
          
          const limit = parseInt(options.limit);
          const messages = options.chat ?
            await db.getMessagesByChat(options.chat, limit) :
            await db.getMessagesByChat('', limit); // All chats
          
          spinner.text = `Processing ${messages.length} messages...`;
          await bridge.processBatch(messages);
          
          spinner.succeed(`Processed ${messages.length} messages`);
          
          // Show summary
          const mappings = bridge.getMappings();
          const activeMappings = mappings.filter(m => m.autoUpdate);
          console.log(chalk.blue('ℹ'), `Active mappings: ${activeMappings.length}`);
          
          await db.close();
        } catch (error) {
          spinner.fail('Failed to process messages');
          logger.error('Sync error', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('toggle')
      .description('Enable/disable auto-update for a chat')
      .argument('<chatId>', 'Telegram chat ID')
      .argument('<enabled>', 'true or false')
      .action(async (chatId, enabled) => {
        try {
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          const isEnabled = enabled === 'true';
          await bridge.toggleAutoUpdate(chatId, isEnabled);
          
          console.log(chalk.green('✓'), `Auto-update ${isEnabled ? 'enabled' : 'disabled'} for chat ${chatId}`);
        } catch (error) {
          console.error(chalk.red('Failed to toggle auto-update:'), error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('mapping')
      .description('Update mapping for a chat')
      .option('-c, --chat <chatId>', 'Telegram chat ID')
      .option('-d, --deal <dealId>', 'Attio deal ID')
      .option('-o, --company <companyId>', 'Attio company ID')
      .action(async (options) => {
        try {
          if (!options.chat) {
            console.error(chalk.red('Chat ID is required'));
            process.exit(1);
          }
          
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          const mapping = bridge.getMapping(options.chat);
          if (!mapping) {
            console.error(chalk.red(`No mapping found for chat ${options.chat}`));
            process.exit(1);
          }
          
          if (options.deal) {
            mapping.attioDealId = options.deal;
          }
          if (options.company) {
            mapping.attioCompanyId = options.company;
          }
          
          await bridge.addMapping(mapping);
          console.log(chalk.green('✓'), 'Mapping updated successfully');
        } catch (error) {
          console.error(chalk.red('Failed to update mapping:'), error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('fetch')
      .description('Sync companies and deals from Attio workspace')
      .option('--companies-only', 'Only sync companies with deals')
      .option('--deals-only', 'Only sync deals')
      .action(async () => {
        const spinner = ora('Syncing data from Attio...').start();
        
        try {
          const apiKey = process.env.ATTIO_API_KEY;
          if (!apiKey) {
            spinner.fail('ATTIO_API_KEY not set');
            return;
          }

          const attioSync = new AttioSyncService(apiKey);
          await attioSync.initialize();
          
          const result = await attioSync.syncCompaniesWithDeals();
          
          spinner.succeed('Attio data sync completed');
          console.log(chalk.green('✓'), `Synced ${result.companies} companies with ${result.deals} deals`);
          
          const companies = await attioSync.getCompaniesWithDeals();
          const topCompanies = companies
            .sort((a, b) => b.dealCount - a.dealCount)
            .slice(0, 10);
          
          console.log(chalk.blue('\n📊 Top 10 Companies by Deal Count:'));
          for (const company of topCompanies) {
            console.log(`  ${company.name}: ${company.dealCount} deals`);
          }
        } catch (error) {
          spinner.fail('Failed to sync Attio data');
          logger.error('Attio fetch error', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('auto-map')
      .description('Generate AI-powered mapping suggestions')
      .option('-f, --file <path>', 'Path to chats file', './config/chats-categorized.txt')
      .option('--categories <categories>', 'Comma-separated categories to process', 'partner,tracked')
      .option('--confidence <threshold>', 'Minimum confidence threshold', '0.6')
      .action(async (options) => {
        const spinner = ora('Generating mapping suggestions...').start();
        
        try {
          const apiKey = process.env.ATTIO_API_KEY;
          const openaiKey = process.env.OPENAI_API_KEY;
          
          if (!apiKey || !openaiKey) {
            spinner.fail('ATTIO_API_KEY and OPENAI_API_KEY must be set');
            return;
          }

          // Read Telegram chats
          const content = await fs.readFile(options.file, 'utf-8');
          const categories = options.categories.split(',').map((c: string) => c.trim());
          const confidenceThreshold = parseFloat(options.confidence);
          
          const telegramChats = content.split('\n')
            .filter(line => !line.startsWith('#') && line.trim())
            .map(line => {
              const [chatId, chatTitle, , , category] = line.split(',');
              return { chatId, chatTitle, category };
            })
            .filter(chat => categories.includes(chat.category));

          spinner.text = `Processing ${telegramChats.length} chats...`;

          const attioSync = new AttioSyncService(apiKey);
          await attioSync.initialize();
          
          const autoMapper = new AttioAutoMapper(attioSync, {
            openaiApiKey: openaiKey,
            confidenceThreshold
          });
          
          const suggestions = await autoMapper.generateMappingSuggestions(telegramChats);
          
          spinner.succeed('Mapping suggestions generated');
          
          console.log(chalk.green('✓'), `Generated ${suggestions.length} mapping suggestions`);
          console.log(chalk.blue('ℹ'), 'High confidence:', suggestions.filter(s => s.confidence > 0.8).length);
          console.log(chalk.yellow('ℹ'), 'Medium confidence:', suggestions.filter(s => s.confidence >= 0.6 && s.confidence <= 0.8).length);
          
          console.log(chalk.blue('\n🎯 Top 5 Suggestions:'));
          const top5 = suggestions.slice(0, 5);
          for (const s of top5) {
            console.log(`  ${chalk.bold(s.telegramChat.chatTitle)} → ${chalk.green(s.attioCompany.name)}`);
            console.log(`    Confidence: ${(s.confidence * 100).toFixed(0)}% | Deal: ${s.attioDeal?.name || 'No primary deal'}`);
          }
          
          console.log(chalk.gray('\n📄 Full report saved to: data/attio/mapping-suggestions.json'));
          console.log(chalk.gray('📝 Review suggestions with: fbtrack attio review'));
        } catch (error) {
          spinner.fail('Failed to generate mapping suggestions');
          logger.error('Auto-map error', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('review')
      .description('Review and approve mapping suggestions')
      .option('--min-confidence <threshold>', 'Minimum confidence to show', '0.7')
      .option('--auto-approve <threshold>', 'Auto-approve above this confidence', '0.9')
      .action(async (options) => {
        try {
          const apiKey = process.env.ATTIO_API_KEY || 'dummy';
          const attioSync = new AttioSyncService(apiKey);
          const autoMapper = new AttioAutoMapper(attioSync, { openaiApiKey: 'dummy' });
          
          const suggestions = await autoMapper.loadSuggestions();
          const minConfidence = parseFloat(options.minConfidence);
          const autoApproveThreshold = parseFloat(options.autoApprove || '2.0'); // Disabled by default
          
          const filteredSuggestions = suggestions.filter(s => s.confidence >= minConfidence);
          
          if (filteredSuggestions.length === 0) {
            console.log(chalk.yellow('No suggestions found above confidence threshold'));
            console.log(chalk.blue('ℹ'), 'Generate suggestions first:', chalk.cyan('fbtrack attio auto-map'));
            return;
          }
          
          console.log(chalk.bold(`\n📋 Mapping Suggestions (${filteredSuggestions.length} total)\n`));
          
          let approved = 0;
          const bridge = new AttioBridge();
          await bridge.initialize();
          
          for (const suggestion of filteredSuggestions) {
            const conf = (suggestion.confidence * 100).toFixed(0);
            console.log(chalk.blue('─'.repeat(60)));
            console.log(chalk.bold(`📱 ${suggestion.telegramChat.chatTitle}`));
            console.log(chalk.gray(`   Chat ID: ${suggestion.telegramChat.chatId}`));
            console.log(chalk.green(`🏢 ${suggestion.attioCompany.name}`));
            console.log(chalk.gray(`   Company ID: ${suggestion.attioCompany.id}`));
            console.log(chalk.cyan(`💼 ${suggestion.attioDeal?.name || 'No primary deal'}`));
            if (suggestion.attioDeal) {
              console.log(chalk.gray(`   Deal ID: ${suggestion.attioDeal.id}`));
            }
            console.log(chalk.yellow(`🎯 Confidence: ${conf}%`));
            console.log(chalk.gray(`   Reason: ${suggestion.reasoning}`));
            
            if (suggestion.confidence >= autoApproveThreshold) {
              console.log(chalk.green('✓ Auto-approved (high confidence)'));
              const mapping = await autoMapper.approveSuggestion(suggestion);
              await bridge.addMapping(mapping);
              approved++;
            } else {
              console.log(chalk.yellow('⏸  Requires manual review'));
            }
            console.log();
          }
          
          console.log(chalk.green(`✓ ${approved} mappings auto-approved`));
          console.log(chalk.yellow(`⏸  ${filteredSuggestions.length - approved} require manual review`));
          
          if (approved > 0) {
            console.log(chalk.blue('\nℹ  View all mappings:'), chalk.cyan('fbtrack attio list'));
          }
        } catch (error) {
          console.error(chalk.red('Failed to review suggestions:'), error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('report')
      .description('Generate mapping report')
      .action(async () => {
        try {
          const apiKey = process.env.ATTIO_API_KEY || 'dummy';
          const attioSync = new AttioSyncService(apiKey);
          const autoMapper = new AttioAutoMapper(attioSync, { openaiApiKey: 'dummy' });
          
          const report = await autoMapper.generateReport();
          console.log(report);
        } catch (error) {
          console.error(chalk.red('Failed to generate report:'), error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('companies')
      .description('List companies with deals from Attio')
      .option('--limit <n>', 'Number of companies to show', '20')
      .option('--search <term>', 'Search by company name')
      .action(async (options) => {
        try {
          const apiKey = process.env.ATTIO_API_KEY;
          if (!apiKey) {
            console.error(chalk.red('ATTIO_API_KEY not set'));
            return;
          }

          const attioSync = new AttioSyncService(apiKey);
          await attioSync.initialize();
          
          let companies = options.search 
            ? await attioSync.searchCompaniesByName(options.search)
            : await attioSync.getCompaniesWithDeals();
          
          companies = companies.slice(0, parseInt(options.limit));
          
          if (companies.length === 0) {
            console.log(chalk.yellow('No companies found'));
            console.log(chalk.blue('ℹ'), 'Fetch companies first:', chalk.cyan('fbtrack attio fetch'));
            return;
          }
          
          console.log(chalk.bold(`\n🏢 Companies with Deals (${companies.length} shown)\n`));
          
          for (const company of companies) {
            console.log(chalk.green(`${company.name} (${company.dealCount} deals)`));
            console.log(chalk.gray(`  ID: ${company.id}`));
            if (company.domains?.length) console.log(chalk.gray(`  Domains: ${company.domains.join(', ')}`));
            if (company.categories?.length) console.log(chalk.gray(`  Categories: ${company.categories.join(', ')}`));
            console.log();
          }
        } catch (error) {
          console.error(chalk.red('Failed to list companies:'), error);
          process.exit(1);
        }
      })
  );