import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../../lib/logger.js';

interface WorkflowOptions {
  days?: string;
  skipDiscovery?: boolean;
  skipSlack?: boolean;
  skipReport?: boolean;
  skipAttio?: boolean;
  skipInteractionUpdate?: boolean;
  agent?: string;
}

// Helper to run a command and return promise
function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${cmd} ${args.join(' ')}" exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

export const workflowCommand = new Command('workflow')
  .description('Run full weekly workflow: discover → sync → extract → report → attio')
  .option('--days <number>', 'Number of days to look back', '10')
  .option('--skip-discovery', 'Skip new chat discovery')
  .option('--skip-slack', 'Skip Slack sync')
  .option('--skip-report', 'Skip report generation')
  .option('--skip-attio', 'Skip Attio update')
  .option('--skip-interaction-update', 'Skip telegram interaction update to Attio')
  .option('--agent <type>', 'Agent type for extraction/report', 'sales-extractor')
  .action(async (options: WorkflowOptions) => {
    try {
      console.log(chalk.bold.blue('\n🚀 Starting Daily Workflow\n'));
      const days = parseInt(options.days || '10', 10);

      const configDir = path.join(process.cwd(), 'config');
      const categorizedPath = path.join(configDir, 'chats-categorized.txt');
      const chatsPath = path.join(configDir, 'chats.txt');

      // Step 1: Discover new Telegram chats
      if (!options.skipDiscovery) {
        console.log(chalk.cyan('📡 Step 1: Discovering new Telegram chats...'));
        try {
          await runCommand('npx', ['fbtrack', 'discover']);
          console.log(chalk.green('  ✓ Discovery completed'));
        } catch (err: any) {
          console.log(chalk.yellow(`  ⚠ Discovery skipped: ${err.message}`));
        }
      } else {
        console.log(chalk.gray('📡 Step 1: Skipping discovery (--skip-discovery)'));
      }

      // Step 2: Regenerate chats.txt from categorized
      console.log(chalk.cyan('\n📝 Step 2: Regenerating chats.txt...'));
      try {
        await regenerateChatsFile(categorizedPath, chatsPath);
        const enabledCount = await countEnabledChats(chatsPath);
        console.log(chalk.green(`  ✓ Generated chats.txt with ${enabledCount} tracked chats enabled`));
      } catch (err: any) {
        console.log(chalk.yellow(`  ⚠ chats.txt regeneration: ${err.message}`));
      }

      // Step 3: Sync Telegram messages
      console.log(chalk.cyan('\n📨 Step 3: Syncing Telegram messages...'));
      try {
        await runCommand('npx', ['fbtrack', 'sync']);
        console.log(chalk.green('  ✓ Telegram sync completed'));
      } catch (err: any) {
        console.log(chalk.yellow(`  ⚠ Telegram sync error: ${err.message}`));
      }

      // Step 4: Sync Slack messages
      if (!options.skipSlack) {
        console.log(chalk.cyan('\n💬 Step 4: Syncing Slack messages...'));
        try {
          await runCommand('npx', ['fbtrack', 'slack-sync', '--days', days.toString()]);
          console.log(chalk.green('  ✓ Slack sync completed'));
        } catch (err: any) {
          console.log(chalk.yellow(`  ⚠ Slack sync error: ${err.message}`));
        }
      } else {
        console.log(chalk.gray('\n💬 Step 4: Skipping Slack (--skip-slack)'));
      }

      // Step 5: Run extraction
      console.log(chalk.cyan('\n🤖 Step 5: Running AI extraction...'));
      try {
        await runCommand('npx', ['fbtrack', 'extract', '--all', '--agent', options.agent || 'sales-extractor']);
        console.log(chalk.green('  ✓ Extraction completed'));
      } catch (err: any) {
        console.log(chalk.yellow(`  ⚠ Extraction error: ${err.message}`));
      }

      // Step 6: Generate report
      if (!options.skipReport) {
        console.log(chalk.cyan('\n📊 Step 6: Generating report...'));
        try {
          await runCommand('npx', ['fbtrack', 'report', '--agent', options.agent || 'sales-extractor']);
          console.log(chalk.green('  ✓ Report generated'));
        } catch (err: any) {
          console.log(chalk.yellow(`  ⚠ Report generation error: ${err.message}`));
        }
      } else {
        console.log(chalk.gray('\n📊 Step 6: Skipping report (--skip-report)'));
      }

      // Step 7: Update Attio deals
      if (!options.skipAttio) {
        console.log(chalk.cyan('\n🔄 Step 7: Updating Attio deals...'));
        try {
          await runCommand('npx', ['fbtrack', 'attio', 'sync']);
          console.log(chalk.green('  ✓ Attio deals updated'));
        } catch (err: any) {
          console.log(chalk.yellow(`  ⚠ Attio update error: ${err.message}`));
        }
      } else {
        console.log(chalk.gray('\n🔄 Step 7: Skipping Attio (--skip-attio)'));
      }

      // Step 8: Update telegram_interaction in Attio companies
      if (!options.skipInteractionUpdate) {
        console.log(chalk.cyan('\n📅 Step 8: Updating Telegram interaction dates in Attio...'));
        try {
          // First query Telegram for last activity dates
          await runCommand('npx', ['fbtrack', 'query-activity']);
          console.log(chalk.green('  ✓ Queried Telegram activity dates'));

          // Then run the sync script
          const syncScriptPath = path.join(process.cwd(), 'scripts', 'sync_all_telegram_interaction.js');
          if (await fs.pathExists(syncScriptPath)) {
            await runCommand('node', [syncScriptPath]);
            console.log(chalk.green('  ✓ Updated Attio companies with interaction dates'));
          } else {
            console.log(chalk.yellow('  ⚠ Sync script not found at scripts/sync_all_telegram_interaction.js'));
          }
        } catch (err: any) {
          console.log(chalk.yellow(`  ⚠ Interaction update error: ${err.message}`));
        }
      } else {
        console.log(chalk.gray('\n📅 Step 8: Skipping interaction update (--skip-interaction-update)'));
      }

      console.log(chalk.bold.green('\n✅ Workflow completed!\n'));

    } catch (error: any) {
      logger.error('Workflow failed', error);
      console.error(chalk.red(`\nWorkflow failed: ${error.message}\n`));
      process.exit(1);
    }
  });

// Helper functions

async function regenerateChatsFile(categorizedPath: string, chatsPath: string): Promise<void> {
  if (!await fs.pathExists(categorizedPath)) {
    throw new Error('chats-categorized.txt not found');
  }

  const content = await fs.readFile(categorizedPath, 'utf-8');
  const byCategory: Record<string, string[]> = {};

  for (const line of content.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',');
    if (parts.length >= 5) {
      const category = parts[4];
      const chatLine = parts.slice(0, 4).join(',');
      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(chatLine);
    }
  }

  const output: string[] = [
    '# Chat Selection File',
    '# Uncomment lines to enable tracking for specific chats',
    '# Format: chatId,chatTitle,chatType,memberCount',
    `# Generated from chats-categorized.txt on ${new Date().toISOString().split('T')[0]}`,
    '',
    '# ====== TRACKED CHATS (enabled) ======'
  ];

  // Add tracked chats (enabled) - uses first category found
  for (const chat of byCategory['tracked'] || byCategory[Object.keys(byCategory)[0]] || []) {
    output.push(chat);
  }
  output.push('');

  // Add other categories (commented out)
  output.push('# ====== OTHER CATEGORIES (disabled) ======');
  output.push('');

  const otherCategories = ['investor', 'fund', 'dev', 'community', 'internal', 'other'];
  for (const cat of otherCategories) {
    if (byCategory[cat]?.length) {
      output.push(`# --- ${cat} ---`);
      for (const chat of byCategory[cat]) {
        output.push('# ' + chat);
      }
      output.push('');
    }
  }

  await fs.writeFile(chatsPath, output.join('\n'));
}

async function countEnabledChats(chatsPath: string): Promise<number> {
  const content = await fs.readFile(chatsPath, 'utf-8');
  return content.split('\n').filter(line => line && !line.startsWith('#')).length;
}
