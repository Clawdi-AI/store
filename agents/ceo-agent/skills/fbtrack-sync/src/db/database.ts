import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../lib/logger.js';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema.js';
import { RawMessage, FeedbackUnit } from '../types/message.js';
import { Checkpoint } from '../types/config.js';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.dbPath = path.join(baseDir, 'state', 'feedback-tracker.db');
  }

  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.dbPath));

      // Open database
      this.db = new Database(this.dbPath);
      
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      
      // Create tables
      this.db.exec(CREATE_TABLES);
      
      // Check schema version
      const versionRow = this.db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
      
      if (versionRow && versionRow.version !== SCHEMA_VERSION) {
        logger.warn(`Schema version mismatch. DB: ${versionRow.version}, Expected: ${SCHEMA_VERSION}`);
        // TODO: Implement migrations
      }
      
      logger.info('Database initialized', { path: this.dbPath });
    } catch (error) {
      logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // Message operations
  async indexMessage(message: RawMessage, filePath: string, fileOffset: number, fileLine: number): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO messages (
        chat_id, message_id, timestamp, date_iso, from_id,
        from_username, from_display_name, text_preview,
        reply_to_message_id, file_path, file_offset, file_line
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const timestamp = Math.floor(new Date(message.dateISO).getTime() / 1000);
    const textPreview = message.text ? message.text.substring(0, 100) : null;

    stmt.run(
      message.chatId,
      message.messageId,
      timestamp,
      message.dateISO,
      message.fromId,
      message.fromUsername,
      message.fromDisplayName,
      textPreview,
      message.replyToMessageId,
      filePath,
      fileOffset,
      fileLine
    );
  }

  async getMessagesByChat(chatId: string, limit?: number): Promise<any[]> {
    const db = this.getDb();
    
    let query = 'SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC';
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    
    const stmt = db.prepare(query);
    return stmt.all(chatId);
  }

  async getMessagesBetweenIds(chatId: string, startId: number, endId: number): Promise<any[]> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE chat_id = ? AND message_id >= ? AND message_id <= ?
      ORDER BY message_id
    `);
    
    return stmt.all(chatId, startId, endId);
  }

  // Chat operations
  async upsertChat(chatId: string, title: string, type: string, memberCount?: number): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      INSERT INTO chats (chat_id, title, type, member_count)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        title = excluded.title,
        type = excluded.type,
        member_count = excluded.member_count
    `);
    
    stmt.run(chatId, title, type, memberCount);
  }

  async markChatAsTracked(chatId: string, tracked: boolean): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare('UPDATE chats SET is_tracked = ? WHERE chat_id = ?');
    stmt.run(tracked ? 1 : 0, chatId);
  }

  async getTrackedChats(): Promise<any[]> {
    const db = this.getDb();
    
    const stmt = db.prepare('SELECT * FROM chats WHERE is_tracked = 1');
    return stmt.all();
  }

  // Checkpoint operations
  async getSyncCheckpoint(chatId: string): Promise<Checkpoint | null> {
    const db = this.getDb();
    
    const stmt = db.prepare('SELECT * FROM sync_checkpoints WHERE chat_id = ?');
    const row = stmt.get(chatId) as any;
    
    if (!row) return null;
    
    return {
      lastMessageId: row.last_message_id,
      lastDateISO: row.last_date_iso,
      processedCount: row.processed_count,
      version: '1'
    };
  }

  async updateSyncCheckpoint(chatId: string, checkpoint: Checkpoint): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      INSERT INTO sync_checkpoints (chat_id, last_message_id, last_date_iso, processed_count)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        last_message_id = excluded.last_message_id,
        last_date_iso = excluded.last_date_iso,
        processed_count = excluded.processed_count,
        updated_at = strftime('%s', 'now')
    `);
    
    stmt.run(
      chatId,
      checkpoint.lastMessageId,
      checkpoint.lastDateISO,
      checkpoint.processedCount
    );
  }

  async getSummarizeCheckpoint(chatId: string): Promise<any | null> {
    const db = this.getDb();
    
    const stmt = db.prepare('SELECT * FROM summarize_checkpoints WHERE chat_id = ?');
    return stmt.get(chatId);
  }

  async updateSummarizeCheckpoint(chatId: string, lastProcessedId: number, promptVersion: string): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      INSERT INTO summarize_checkpoints (chat_id, last_processed_message_id, prompt_version)
      VALUES (?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        last_processed_message_id = excluded.last_processed_message_id,
        prompt_version = excluded.prompt_version,
        updated_at = strftime('%s', 'now')
    `);
    
    stmt.run(chatId, lastProcessedId, promptVersion);
  }

  // Feedback unit operations
  async insertFeedbackUnit(unit: FeedbackUnit): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO feedback_units (
        unit_id, chat_id, type, title, summary, evidence, origin,
        severity, priority, tags, llm_model, prompt_version,
        tokens_used, created_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      unit.unitId,
      unit.origin.chatId,
      unit.type,
      unit.title,
      unit.summary,
      JSON.stringify(unit.evidence),
      JSON.stringify(unit.origin),
      unit.severity || null,
      unit.priority || null,
      JSON.stringify([]), // TODO: Add tags support
      unit.llm.model,
      unit.llm.promptVersion,
      unit.llm.tokensUsed || null,
      unit.createdAtISO
    );
  }

  async getFeedbackUnits(filters?: { chatId?: string; type?: string; since?: string }): Promise<FeedbackUnit[]> {
    const db = this.getDb();
    
    let query = 'SELECT * FROM feedback_units WHERE 1=1';
    const params: any[] = [];
    
    if (filters?.chatId) {
      query += ' AND chat_id = ?';
      params.push(filters.chatId);
    }
    
    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters?.since) {
      query += ' AND created_at_iso >= ?';
      params.push(filters.since);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    
    return rows.map((row: any) => ({
      unitId: row.unit_id,
      type: row.type,
      title: row.title,
      summary: row.summary,
      evidence: JSON.parse(row.evidence),
      origin: JSON.parse(row.origin),
      llm: {
        model: row.llm_model,
        promptVersion: row.prompt_version,
        tokensUsed: row.tokens_used
      },
      severity: row.severity,
      priority: row.priority,
      createdAtISO: row.created_at_iso
    }));
  }

  // Window tracking for deduplication
  async hasProcessedWindow(chatId: string, windowHash: string): Promise<boolean> {
    const db = this.getDb();
    
    const stmt = db.prepare('SELECT 1 FROM processing_windows WHERE chat_id = ? AND window_hash = ?');
    const result = stmt.get(chatId, windowHash);
    
    return !!result;
  }

  async markWindowProcessed(chatId: string, startId: number, endId: number, windowHash: string): Promise<void> {
    const db = this.getDb();
    
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO processing_windows (chat_id, start_message_id, end_message_id, window_hash)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(chatId, startId, endId, windowHash);
  }

  async clearChatCheckpoint(chatId: string): Promise<void> {
    const db = this.getDb();
    
    db.prepare('DELETE FROM sync_checkpoints WHERE chat_id = ?').run(chatId);
    db.prepare('DELETE FROM summarize_checkpoints WHERE chat_id = ?').run(chatId);
    
    logger.info(`Cleared checkpoints for chat ${chatId}`);
  }
  
  async clearAllCheckpoints(): Promise<void> {
    const db = this.getDb();
    
    db.prepare('DELETE FROM sync_checkpoints').run();
    db.prepare('DELETE FROM summarize_checkpoints').run();
    
    logger.info('Cleared all checkpoints');
  }
  
  async clearChatMessages(chatId: string): Promise<void> {
    const db = this.getDb();
    
    db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
    
    logger.info(`Cleared indexed messages for chat ${chatId}`);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.debug('Database connection closed');
    }
  }

  // Transaction wrapper
  async transaction<T>(fn: () => T): Promise<T> {
    const db = this.getDb();
    return db.transaction(fn)();
  }
}