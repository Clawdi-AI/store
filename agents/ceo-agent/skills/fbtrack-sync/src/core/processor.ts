import fs from 'fs-extra';
import path from 'path';
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import { AIAgent } from '../lib/ai-agent.js';
import { AgentRegistry } from '../lib/agent-registry.js';

interface AgentCheckpoint {
  agentType: string;
  chatId: string;
  lastProcessedMessageId: number;
  lastProcessedDate: string;
  agentVersion: string;
  metadata: any;
  reprocessWindowHours?: number;
}

export class AgentProcessor {
  private db: Database | null = null;
  private baseDir: string;
  private defaultReprocessWindowHours: number;

  constructor(baseDir: string, defaultReprocessWindowHours: number = 6) {
    this.baseDir = baseDir;
    this.defaultReprocessWindowHours = defaultReprocessWindowHours;
  }

  private async getDB(): Promise<Database> {
    if (!this.db) {
      const { open } = await import('sqlite');
      this.db = await open({
        filename: path.join(this.baseDir, 'data/feedback.db'),
        driver: sqlite3.Database
      });
    }
    return this.db;
  }

  async initializeCheckpoints(): Promise<void> {
    const db = await this.getDB();

    // Create checkpoints table for agents if it doesn't exist
    await db.run(`
      CREATE TABLE IF NOT EXISTS agent_checkpoints (
        agent_type TEXT,
        chat_id TEXT,
        last_processed_message_id INTEGER,
        last_processed_date TEXT,
        agent_version TEXT,
        metadata TEXT,
        reprocess_window_hours INTEGER DEFAULT 6,
        PRIMARY KEY (agent_type, chat_id)
      )
    `);

    // Add reprocess_window_hours column if it doesn't exist (migration)
    try {
      await db.run(`ALTER TABLE agent_checkpoints ADD COLUMN reprocess_window_hours INTEGER DEFAULT 6`);
    } catch (error: any) {
      // Column already exists, ignore the error
      if (!error.message.includes('duplicate column name')) {
        throw error;
      }
    }
  }

  async getCheckpoint(agentType: string, chatId: string): Promise<AgentCheckpoint | null> {
    const db = await this.getDB();
    const row = await db.get(`
      SELECT * FROM agent_checkpoints 
      WHERE agent_type = ? AND chat_id = ?
    `, [agentType, chatId]);

    if (!row) return null;

    return {
      agentType: row.agent_type,
      chatId: row.chat_id,
      lastProcessedMessageId: row.last_processed_message_id,
      lastProcessedDate: row.last_processed_date,
      agentVersion: row.agent_version,
      metadata: JSON.parse(row.metadata || '{}'),
      reprocessWindowHours: row.reprocess_window_hours || 6,
    };
  }

  async saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void> {
    const db = await this.getDB();
    await db.run(`
      INSERT OR REPLACE INTO agent_checkpoints
      (agent_type, chat_id, last_processed_message_id, last_processed_date, agent_version, metadata, reprocess_window_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      checkpoint.agentType,
      checkpoint.chatId,
      checkpoint.lastProcessedMessageId,
      checkpoint.lastProcessedDate,
      checkpoint.agentVersion,
      JSON.stringify(checkpoint.metadata),
      checkpoint.reprocessWindowHours || 6,
    ]);
  }

  async discoverChats(): Promise<string[]> {
    const rawDir = path.join(this.baseDir, 'data/raw');
    
    if (!await fs.pathExists(rawDir)) {
      return [];
    }
    
    const files = await fs.readdir(rawDir);
    const chatIds = files
      .filter(file => file.endsWith('.jsonl'))
      .map(file => {
        // Convert back from sanitized filename
        const baseName = file.replace('.jsonl', '');
        // Handle both Telegram group IDs (negative numbers) and Slack channels (slack_C...)
        if (baseName.startsWith('slack_')) {
          return baseName; // Keep Slack channel IDs as-is
        }
        return baseName.startsWith('-') ? baseName : `-${baseName}`;
      })
      .filter(chatId => chatId.startsWith('-') || chatId.startsWith('slack_')); // Process Telegram groups and Slack channels

    return chatIds;
  }

  async getChatTitle(chatId: string): Promise<string> {
    const messages = await this.loadMessages(chatId);
    if (messages.length > 0 && messages[0].chatTitle) {
      return messages[0].chatTitle;
    }
    return `Chat ${chatId}`; // Fallback if no title found
  }

  async loadMessages(chatId: string, since?: Date): Promise<any[]> {
    const filePath = path.join(this.baseDir, 'data/raw', `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}.jsonl`);
    
    if (!await fs.pathExists(filePath)) {
      return [];
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const messages = lines.map(line => JSON.parse(line));
    
    if (since) {
      return messages.filter(msg => new Date(msg.dateISO) >= since);
    }
    
    return messages;
  }

  async getNewMessages(agent: AIAgent, chatId: string, resummarize: boolean = false): Promise<any[]> {
    const checkpoint = resummarize ? null : await this.getCheckpoint(agent.getAgentType(), chatId);
    const allMessages = await this.loadMessages(chatId);

    if (!checkpoint) {
      return allMessages;
    }

    const checkpointDate = new Date(checkpoint.lastProcessedDate);

    // First, check if there are any truly new messages after the checkpoint
    const newMessages = allMessages.filter(msg => new Date(msg.dateISO) > checkpointDate);

    // If no new messages, return empty array (don't rerun old messages)
    if (newMessages.length === 0) {
      return [];
    }

    // If there are new messages, include reprocess window to catch conversation context
    const reprocessHours = checkpoint.reprocessWindowHours || this.defaultReprocessWindowHours;
    const reprocessCutoff = new Date(Date.now() - reprocessHours * 60 * 60 * 1000);

    // Use either checkpoint date or reprocess window, whichever is earlier
    const startTime = checkpointDate < reprocessCutoff ? checkpointDate : reprocessCutoff;

    // Return all messages since the start time (includes reprocess window)
    return allMessages.filter(msg => new Date(msg.dateISO) >= startTime);
  }

  async writeUnits(agentType: string, chatId: string, units: any[], overwrite: boolean = false): Promise<void> {
    const outputDir = path.join(this.baseDir, 'data/units');
    await fs.ensureDir(outputDir);

    const outputFile = path.join(outputDir, `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}_${agentType}.jsonl`);

    if (units.length === 0 && overwrite) {
      // For reprocessing: clear the file if no results found
      await fs.writeFile(outputFile, '');
      return;
    }

    if (units.length > 0) {
      // Write or append units to JSONL file
      const lines = units.map(unit => JSON.stringify(unit)).join('\n') + '\n';
      if (overwrite) {
        await fs.writeFile(outputFile, lines);
      } else {
        await fs.appendFile(outputFile, lines);
      }
    }
  }

  async loadExistingUnits(agentType: string, chatId: string): Promise<any[]> {
    const outputDir = path.join(this.baseDir, 'data/units');
    const outputFile = path.join(outputDir, `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}_${agentType}.jsonl`);

    if (!await fs.pathExists(outputFile)) {
      return [];
    }

    const content = await fs.readFile(outputFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line));
  }

  async writeUnitsWithDeduplication(agentType: string, chatId: string, newUnits: any[], reprocessedMessages: any[]): Promise<void> {
    const existingUnits = await this.loadExistingUnits(agentType, chatId);

    // Get message IDs from reprocessed messages
    const reprocessedMessageIds = new Set(reprocessedMessages.map(msg => msg.messageId));

    // Keep existing units that don't overlap with reprocessed messages
    const preservedUnits = existingUnits.filter(unit => {
      const unitMessageIds = unit.messageIds || [];
      return !unitMessageIds.some((id: number) => reprocessedMessageIds.has(id));
    });

    // Add timestamps to new units
    const timestampedNewUnits = newUnits.map(unit => ({
      ...unit,
      extractedAt: new Date().toISOString()
    }));

    // Combine and save all units
    const allUnits = [...preservedUnits, ...timestampedNewUnits];

    const outputDir = path.join(this.baseDir, 'data/units');
    await fs.ensureDir(outputDir);
    const outputFile = path.join(outputDir, `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}_${agentType}.jsonl`);

    if (allUnits.length > 0) {
      const lines = allUnits.map(unit => JSON.stringify(unit)).join('\n') + '\n';
      await fs.writeFile(outputFile, lines);
    } else {
      await fs.writeFile(outputFile, '');
    }
  }

  async processChat(agent: AIAgent, chatId: string, resummarize: boolean = false): Promise<{ cost: number } | null> {
    await this.initializeCheckpoints();

    const messages = await this.getNewMessages(agent, chatId, resummarize);

    if (messages.length === 0) {
      console.log(`No new messages to process for ${agent.getAgentType()} in chat ${chatId}`);
      return null;
    }

    console.log(`Processing ${messages.length} messages with ${agent.getAgentType()}`);

    // Process messages using the agent registry
    const handler = AgentRegistry.getHandler(agent.getAgentType());
    const { results, stats } = await handler.extractFromMessages(agent, messages);

    // Always save checkpoint, even if no results found
    const lastMessage = messages[messages.length - 1];
    const checkpoint = await this.getCheckpoint(agent.getAgentType(), chatId);
    await this.saveCheckpoint({
      agentType: agent.getAgentType(),
      chatId,
      lastProcessedMessageId: lastMessage.messageId,
      lastProcessedDate: lastMessage.dateISO,
      agentVersion: agent.getVersion(),
      metadata: stats || {},
      reprocessWindowHours: checkpoint?.reprocessWindowHours || this.defaultReprocessWindowHours
    });

    // Save results with deduplication (or clear file if reprocessing)
    if (resummarize) {
      await this.writeUnits(agent.getAgentType(), chatId, results, true);
    } else {
      await this.writeUnitsWithDeduplication(agent.getAgentType(), chatId, results, messages);
    }

    // Display appropriate statistics using agent registry
    handler.displayProcessingResults(results);

    if (stats) {
      console.log(`  Tokens: ${stats.totalTokens?.toLocaleString() || 0} ($${stats.estimatedCost?.toFixed(4) || '0.0000'})`);
    }

    return { cost: stats?.estimatedCost || 0 };
  }
}