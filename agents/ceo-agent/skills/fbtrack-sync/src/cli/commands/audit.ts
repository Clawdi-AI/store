import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import { ConfigManager } from '../../core/config.js';
import { logger } from '../../lib/logger.js';
import { AgentRegistry } from '../../lib/agent-registry.js';
import { MessageContextService } from '../../lib/message-context.js';

interface RawMessage {
  chatId: string;
  chatTitle: string;
  messageId: number;
  dateISO: string;
  fromUsername: string;
  fromDisplayName: string;
  text: string;
  replyToMessageId?: number;
}

interface ExtractedUnit {
  // QA fields
  problem?: {
    summary: string;
    details: string[];
    messageIds: number[];
    authors: string[];
    timestamp: string;
  };
  solution?: {
    summary: string;
    resolved: boolean;
    gaps_remaining: string[];
    contributors: { [username: string]: string };
    messageIds: number[];
    timestamp_range: string;
  };
  // Sales fields - v2 format
  insight_type?: string;
  summary?: string;
  deal_status?: string;
  business_summary?: string;
  customer_info?: {
    contact: string;
    company?: string;
    deal_stage?: string;
  };
  business_impact?: {
    opportunity_size?: string;
    timeline?: string;
    revenue_signals?: string[];
    decision_urgency?: string;
  };
  sales_actions?: {
    immediate_next_steps?: string[];
    follow_up_timeline?: string;
    escalation_needed?: boolean;
    recommended_resources?: string[];
  };
  conversation_context?: {
    messageIds: number[];
    timestamp_range: string;
  };
  // Common fields
  chatId: string;
  chatTitle: string;
}

export const auditCommand = new Command('audit')
  .description('Audit extraction results by comparing input messages with extracted outputs')
  .option('-c, --chat <chatId>', 'Audit specific chat (e.g., -1002346033512)')
  .option('--agent <type>', 'Agent type to audit (qa-extractor, sales-extractor)', 'qa-extractor')
  .option('--list-chats', 'List available chats with extraction data')
  .option('--interactive', 'Interactive mode for detailed review', false)
  .option('--trace-messages', 'Show detailed message traceability for each unit', false)
  .option('--since <date>', 'Show only units extracted since date (YYYY-MM-DD or "last-run")')
  .option('--show-run-history', 'Show extraction run timestamps', false)
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      const baseDir = process.cwd();
      
      const rawDir = path.join(baseDir, config.storage.dataDir, 'raw');
      const unitsDir = path.join(baseDir, config.storage.dataDir, 'units');
      
      // List available chats if requested
      if (options.listChats) {
        await listAvailableChats(unitsDir, options.agent);
        return;
      }
      
      // Get chat to audit
      const chatId = options.chat;
      if (!chatId) {
        console.log(chalk.yellow('Please specify a chat ID with --chat or use --list-chats to see available chats'));
        return;
      }
      
      // Load raw messages and extracted units
      const rawMessages = await loadRawMessages(rawDir, chatId);
      let extractedUnits = await loadExtractedUnits(unitsDir, chatId, options.agent);
      
      // Filter by date if specified
      if (options.since) {
        extractedUnits = await filterUnitsByDate(extractedUnits, options.since, chatId, options.agent);
      }
      
      // Show extraction run history if requested
      if (options.showRunHistory) {
        await showExtractionHistory(unitsDir, chatId, options.agent);
        return;
      }
      
      if (rawMessages.length === 0) {
        console.log(chalk.red(`No raw messages found for chat ${chatId}`));
        return;
      }
      
      console.log(chalk.blue(`\n🔍 Auditing Chat: ${rawMessages[0]?.chatTitle || chatId}`));
      console.log(chalk.gray(`Raw messages: ${rawMessages.length}, ${options.agent} units: ${extractedUnits.length}\n`));
      
      if (options.interactive) {
        await interactiveAudit(rawMessages, extractedUnits, options.agent);
      } else {
        await quickAudit(rawMessages, extractedUnits, options.chat, options.agent, options, baseDir);
      }
      
    } catch (error: any) {
      logger.error('Audit failed', error);
      console.error(chalk.red('Audit failed:'), error.message);
      process.exit(1);
    }
  });

async function listAvailableChats(unitsDir: string, agentType: string): Promise<void> {
  if (!await fs.pathExists(unitsDir)) {
    console.log(chalk.yellow('No extraction data found. Run "fbtrack extract" first.'));
    return;
  }
  
  const files = await fs.readdir(unitsDir);
  const extractorFiles = files.filter(file => file.endsWith(`_${agentType}.jsonl`));
  
  if (extractorFiles.length === 0) {
    console.log(chalk.yellow(`No ${agentType} extraction files found.`));
    return;
  }
  
  console.log(chalk.blue('Available chats with extraction data:\n'));
  
  for (const file of extractorFiles) {
    const chatId = file.replace(`_${agentType}.jsonl`, '');
    const filePath = path.join(unitsDir, file);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length > 0) {
      const firstUnit: ExtractedUnit = JSON.parse(lines[0]);
      console.log(chalk.green(`  ${chatId}`));
      console.log(chalk.gray(`    Title: ${firstUnit.chatTitle}`));
      console.log(chalk.gray(`    ${agentType} units: ${lines.length}`));
      console.log();
    }
  }
  
  console.log(chalk.blue('Usage: fbtrack audit --chat <chatId>'));
}

async function loadRawMessages(rawDir: string, chatId: string): Promise<RawMessage[]> {
  const filePath = path.join(rawDir, `${chatId}.jsonl`);
  
  if (!await fs.pathExists(filePath)) {
    return [];
  }
  
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.map(line => {
    const msg = JSON.parse(line);
    return {
      chatId: msg.chatId,
      chatTitle: msg.chatTitle,
      messageId: msg.messageId,
      dateISO: msg.dateISO,
      fromUsername: msg.fromUsername || '@unknown',
      fromDisplayName: msg.fromDisplayName || 'Unknown',
      text: msg.text || '',
      replyToMessageId: msg.replyToMessageId
    };
  });
}

async function loadExtractedUnits(unitsDir: string, chatId: string, agentType: string): Promise<ExtractedUnit[]> {
  const filePath = path.join(unitsDir, `${chatId}_${agentType}.jsonl`);
  
  if (!await fs.pathExists(filePath)) {
    return [];
  }
  
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.map(line => JSON.parse(line));
}

async function quickAudit(rawMessages: RawMessage[], extractedUnits: ExtractedUnit[], chatId: string, agentType: string, options: any, baseDir: string): Promise<void> {
  console.log(chalk.blue('📋 Quick Audit Summary\n'));
  
  // Show extraction coverage
  const extractedMessageIds = new Set<number>();
  extractedUnits.forEach(unit => {
    // For QA units
    if (unit.problem?.messageIds) {
      unit.problem.messageIds.forEach(id => extractedMessageIds.add(id));
    }
    if (unit.solution?.messageIds) {
      unit.solution.messageIds.forEach(id => extractedMessageIds.add(id));
    }
    // For sales units
    if (unit.conversation_context?.messageIds) {
      unit.conversation_context.messageIds.forEach(id => extractedMessageIds.add(id));
    }
  });
  
  const totalMessages = rawMessages.length;
  const extractedMessages = extractedMessageIds.size;
  const coverage = totalMessages > 0 ? (extractedMessages / totalMessages * 100).toFixed(1) : '0';
  
  console.log(chalk.green(`✅ Extraction Coverage: ${extractedMessages}/${totalMessages} messages (${coverage}%)`));
  
  // Show units summary using registry
  try {
    const handler = AgentRegistry.getHandler(agentType);
    const stats = handler.getAuditStatistics(extractedUnits);
    
    console.log(chalk.green(`✅ ${agentType} Units: ${stats.total} total`));
    
    handler.displayAuditStatistics(stats);
  } catch (error) {
    console.log(chalk.green(`✅ ${agentType} Units: ${extractedUnits.length} total`));
  }
  
  // Show recent extractions with standardized message association
  console.log(chalk.blue(`\n📝 Recent ${agentType} Extractions:\n`));
  
  const handler = AgentRegistry.getHandler(agentType);
  const messageService = new MessageContextService(baseDir);
  
  for (let i = 0; i < Math.min(3, extractedUnits.length); i++) {
    const unit = extractedUnits[i];
    
    // Use agent handler to format unit consistently
    const formattedUnit = handler.formatAuditUnit(unit);
    console.log(chalk.green(`${i + 1}. `) + formattedUnit.split('\n')[0]);
    
    // Show standardized message association
    const messageIds = handler.getMessageIds(unit);
    const participants = handler.getParticipants(unit);
    const timestampRange = handler.getTimestampRange(unit);
    
    console.log(chalk.gray(`   Messages: ${messageIds.slice(0, 5).join(', ')}${messageIds.length > 5 ? ` (+${messageIds.length - 5} more)` : ''}`));
    console.log(chalk.gray(`   Participants: ${participants.join(', ')}`));
    
    if (timestampRange) {
      const start = new Date(timestampRange.start).toLocaleDateString();
      const end = new Date(timestampRange.end).toLocaleDateString();
      console.log(chalk.gray(`   Time Range: ${start}${start !== end ? ` - ${end}` : ''}`));
    }
    
    // Show detailed message tracing if requested
    if (options.traceMessages && messageIds.length > 0) {
      console.log(chalk.cyan(`   🔍 Message Trace (showing first 3):`));
      try {
        const messages = await messageService.findMessagesByIds(unit.chatId, messageIds.slice(0, 3));
        messages.forEach((msg, idx) => {
          const preview = msg.text.substring(0, 60).replace(/\n/g, ' ');
          console.log(chalk.cyan(`     ${idx + 1}. [${msg.messageId}] ${msg.fromUsername}: ${preview}...`));
        });
      } catch (error) {
        console.log(chalk.red(`     Error loading messages: ${error}`));
      }
    }
    console.log();
  }
  
  console.log(chalk.blue('💡 Run with --interactive for detailed message-by-message review'));
  
  // Show extraction coverage in regular audit too
  await showExtractionCoverage(chatId, agentType);
}

async function interactiveAudit(rawMessages: RawMessage[], extractedUnits: ExtractedUnit[], agentType: string): Promise<void> {
  console.log(chalk.blue('🔍 Interactive Audit Mode\n'));
  console.log(chalk.gray(`Showing each ${agentType} unit with corresponding input messages...\n`));
  
  for (let i = 0; i < extractedUnits.length; i++) {
    const unit = extractedUnits[i];
    
    console.log(chalk.blue(`\n═══ ${agentType} Unit ${i + 1}/${extractedUnits.length} ═══`));
    
    // Handle different unit types
    let allMessageIds: number[] = [];
    if (unit.problem) {
      console.log(chalk.green(`Problem: ${unit.problem.summary}`));
      allMessageIds = [...unit.problem.messageIds, ...(unit.solution?.messageIds || [])];
    } else if (unit.business_summary || unit.summary) {
      const summary = unit.business_summary || unit.summary;
      const status = unit.deal_status || '';
      console.log(chalk.green(`${status} [${unit.insight_type}] ${summary}`));
      allMessageIds = unit.conversation_context?.messageIds || [];
    }
    
    // Show input messages
    console.log(chalk.yellow('\n📥 Input Messages:'));
    
    if (allMessageIds.length === 0) {
      console.log(chalk.gray('  No specific messages referenced (business-level insight)'));
    } else {
      const relatedMessages = rawMessages.filter(msg => allMessageIds.includes(msg.messageId));
      
      if (relatedMessages.length === 0) {
        console.log(chalk.gray('  Referenced messages not found in chat history'));
      } else {
        relatedMessages.forEach(msg => {
          const timestamp = new Date(msg.dateISO).toLocaleString();
          let prefix = '💬';
          
          // For QA units
          if (unit.problem) {
            const isQuestion = unit.problem.messageIds.includes(msg.messageId);
            const isAnswer = unit.solution?.messageIds.includes(msg.messageId);
            prefix = isQuestion ? '❓' : isAnswer ? '💡' : '💬';
          }
          // For sales units, all messages are business context
          else if (unit.business_summary || unit.summary) {
            prefix = '💼';
          }
          
          console.log(chalk.gray(`  ${prefix} [${msg.messageId}] ${timestamp}`));
          console.log(chalk.gray(`     ${msg.fromUsername}: ${msg.text.substring(0, 100)}...`));
        });
      }
    }
    
    // Show extracted output
    console.log(chalk.yellow('\n📤 Extracted Output:'));
    
    if (unit.problem) {
      // QA unit output
      console.log(chalk.gray(`  Problem Details: ${unit.problem.details.join(', ')}`));
      
      if (unit.solution) {
        console.log(chalk.gray(`  Solution: ${unit.solution.summary.substring(0, 100)}...`));
        console.log(chalk.gray(`  Resolved: ${unit.solution.resolved ? '✅' : '❌'}`));
        console.log(chalk.gray(`  Contributors: ${Object.keys(unit.solution.contributors).join(', ')}`));
        
        if (unit.solution.gaps_remaining.length > 0) {
          console.log(chalk.red(`  Gaps: ${unit.solution.gaps_remaining.join(', ')}`));
        }
      } else {
        console.log(chalk.red('  No solution found'));
      }
    } else if (unit.business_summary || unit.summary) {
      // Sales unit output - show business-focused information
      const summary = unit.business_summary || unit.summary || '';
      console.log(chalk.gray(`  Type: ${unit.insight_type}`));
      console.log(chalk.gray(`  Status: ${unit.deal_status || 'Unknown'}`));
      console.log(chalk.gray(`  Summary: ${summary.substring(0, 100)}...`));
      
      if (unit.customer_info?.contact) {
        console.log(chalk.gray(`  Contact: ${unit.customer_info.contact}`));
      }
      
      if (unit.business_impact?.opportunity_size) {
        console.log(chalk.gray(`  Opportunity: ${unit.business_impact.opportunity_size} (${unit.business_impact.timeline || 'unknown timeline'})`));
      }
      
      if (unit.sales_actions?.immediate_next_steps && unit.sales_actions.immediate_next_steps.length > 0) {
        console.log(chalk.gray(`  Next Steps: ${unit.sales_actions.immediate_next_steps.slice(0, 2).join(', ')}`));
      }
      
      if (unit.sales_actions?.escalation_needed) {
        console.log(chalk.red(`  ⚠️  Escalation Required`));
      }
    }
    
    // Pause for review
    if (i < extractedUnits.length - 1) {
      console.log(chalk.blue(`\nPress Enter to continue to next ${agentType} unit...`));
      await waitForEnter();
    }
  }
  
  console.log(chalk.green('\n✅ Interactive audit complete!'));
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.on('line', () => {
      rl.close();
      resolve();
    });
  });
}

async function filterUnitsByDate(units: ExtractedUnit[], sinceOption: string, chatId: string, agentType: string): Promise<ExtractedUnit[]> {
  if (sinceOption === 'last-run') {
    // Get the timestamp of the last extraction run
    const lastRunTime = await getLastExtractionRunTime(chatId, agentType);
    if (!lastRunTime) {
      console.log(chalk.yellow('No extraction run history found. Showing all units.'));
      return units;
    }
    
    console.log(chalk.blue(`Filtering units since last run: ${new Date(lastRunTime).toLocaleString()}`));
    
    // Filter units that were likely extracted in the last run
    // We'll use a heuristic: units with timestamps after the last run start
    return units.filter(unit => {
      let unitTime: number;
      if (unit.problem) {
        unitTime = new Date(unit.problem.timestamp).getTime();
      } else if (unit.conversation_context?.timestamp_range) {
        // For sales units, use the start of the timestamp range
        const startTime = unit.conversation_context.timestamp_range.split(' to ')[0];
        unitTime = new Date(startTime).getTime();
      } else {
        return true; // Include if we can't determine timestamp
      }
      return unitTime >= lastRunTime;
    });
  } else {
    // Parse date string
    const sinceDate = new Date(sinceOption);
    if (isNaN(sinceDate.getTime())) {
      console.log(chalk.red('Invalid date format. Use YYYY-MM-DD or "last-run"'));
      return units;
    }
    
    console.log(chalk.blue(`Filtering ${agentType} units since: ${sinceDate.toLocaleDateString()}`));
    
    return units.filter(unit => {
      let unitTime: Date;
      if (unit.problem) {
        unitTime = new Date(unit.problem.timestamp);
      } else if (unit.conversation_context?.timestamp_range) {
        // For sales units, use the start of the timestamp range
        const startTime = unit.conversation_context.timestamp_range.split(' to ')[0];
        unitTime = new Date(startTime);
      } else {
        return true; // Include if we can't determine timestamp
      }
      return unitTime >= sinceDate;
    });
  }
}

async function getLastExtractionRunTime(chatId: string, agentType: string): Promise<number | null> {
  try {
    // Use same database as AgentProcessor
    const sqlite3 = await import('sqlite3');
    const { open } = await import('sqlite');
    const db = await open({
      filename: path.join(process.cwd(), 'data/feedback.db'),
      driver: sqlite3.default.Database
    });
    
    const row = await db.get(`
      SELECT last_processed_date, last_processed_message_id 
      FROM agent_checkpoints 
      WHERE agent_type = ? AND chat_id = ?
    `, [agentType, chatId]);

    if (row && row.last_processed_date) {
      return new Date(row.last_processed_date).getTime();
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function showExtractionHistory(unitsDir: string, chatId: string, agentType: string): Promise<void> {
  const filePath = path.join(unitsDir, `${chatId}_${agentType}.jsonl`);
  
  if (!await fs.pathExists(filePath)) {
    console.log(chalk.red('No extraction data found'));
    return;
  }
  
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  // Group extracted units by extraction date (heuristic based on problem timestamps)
  const extractionDays = new Map<string, ExtractedUnit[]>();
  
  lines.forEach(line => {
    const unit: ExtractedUnit = JSON.parse(line);
    let timestamp: string;
    if (unit.problem) {
      timestamp = unit.problem.timestamp;
    } else if (unit.conversation_context?.timestamp_range) {
      // For sales units, use the start of the timestamp range
      timestamp = unit.conversation_context.timestamp_range.split(' to ')[0];
    } else {
      // Fallback to current date if no timestamp available
      timestamp = new Date().toISOString();
    }
    const day = new Date(timestamp).toDateString();
    
    if (!extractionDays.has(day)) {
      extractionDays.set(day, []);
    }
    extractionDays.get(day)!.push(unit);
  });
  
  console.log(chalk.blue('\n📅 Extraction History by Date:\n'));
  
  // Sort by date (newest first)
  const sortedDays = Array.from(extractionDays.entries())
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime());
  
  sortedDays.forEach(([day, units]) => {
    console.log(chalk.green(`${day}: ${units.length} ${agentType} units`));
    
    // Show first few summaries
    units.slice(0, 2).forEach(unit => {
      if (unit.problem) {
        console.log(chalk.gray(`  - ${unit.problem.summary.substring(0, 60)}...`));
      } else if (unit.summary) {
        console.log(chalk.gray(`  - [${unit.insight_type}] ${unit.summary.substring(0, 60)}...`));
      }
    });
    
    if (units.length > 2) {
      console.log(chalk.gray(`  ... and ${units.length - 2} more`));
    }
    console.log();
  });
  
  // Show extraction coverage and freshness
  await showExtractionCoverage(chatId, agentType);
}

async function showExtractionCoverage(chatId: string, agentType: string): Promise<void> {
  try {
    // Load raw messages to get the latest message date
    const rawDir = path.join(process.cwd(), 'data/raw');
    const rawMessages = await loadRawMessages(rawDir, chatId);
    
    // Get checkpoint info from database
    console.log(chalk.blue('📊 Extraction Coverage:\n'));
    
    if (rawMessages.length > 0) {
      const latestMessage = rawMessages[rawMessages.length - 1];
      const oldestMessage = rawMessages[0];
      
      console.log(chalk.gray(`  Chat message range: ${new Date(oldestMessage.dateISO).toLocaleDateString()} - ${new Date(latestMessage.dateISO).toLocaleDateString()}`));
      console.log(chalk.gray(`  Latest message: #${latestMessage.messageId} on ${new Date(latestMessage.dateISO).toLocaleString()}`));
    }
    
    // Get checkpoint from database (same as AgentProcessor uses)
    const sqlite3 = await import('sqlite3');
    const { open } = await import('sqlite');
    const db = await open({
      filename: path.join(process.cwd(), 'data/feedback.db'),
      driver: sqlite3.default.Database
    });
    
    const row = await db.get(`
      SELECT last_processed_date, last_processed_message_id 
      FROM agent_checkpoints 
      WHERE agent_type = ? AND chat_id = ?
    `, [agentType, chatId]);
    
    if (row) {
      
      console.log(chalk.blue('\n🎯 Last Extraction Run:'));
      console.log(chalk.gray(`  Last processed message: #${row.last_processed_message_id || 'None'}`));
      console.log(chalk.gray(`  Checkpoint time: ${row.last_processed_date ? new Date(row.last_processed_date).toLocaleString() : 'Unknown'}`));
      
      // Calculate freshness gap if we have the data
      if (rawMessages.length > 0 && row.last_processed_message_id) {
        const lastProcessedMessage = rawMessages.find(msg => msg.messageId === row.last_processed_message_id);
        const latestMessage = rawMessages[rawMessages.length - 1];
        
        if (lastProcessedMessage && latestMessage) {
          const processedDate = new Date(lastProcessedMessage.dateISO);
          const latestDate = new Date(latestMessage.dateISO);
          const daysDiff = Math.ceil((latestDate.getTime() - processedDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff > 0) {
            console.log(chalk.yellow(`  Gap: ${daysDiff} day(s) of unprocessed messages (${new Date(lastProcessedMessage.dateISO).toLocaleDateString()} → ${latestDate.toLocaleDateString()})`));
          } else {
            console.log(chalk.green(`  ✅ Up to date (last message processed: ${processedDate.toLocaleDateString()})`));
          }
        }
      }
    } else {
      console.log(chalk.yellow('  No extraction checkpoint found'));
    }
    
  } catch (error: any) {
    console.log(chalk.red('  Could not determine extraction coverage'));
    console.log(chalk.gray(`  Error: ${error.message}`));
  }
}