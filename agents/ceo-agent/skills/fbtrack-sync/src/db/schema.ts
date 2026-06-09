export const SCHEMA_VERSION = 1;

export const CREATE_TABLES = `
  -- Messages index table
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    date_iso TEXT NOT NULL,
    from_id TEXT,
    from_username TEXT,
    from_display_name TEXT,
    text_preview TEXT,
    reply_to_message_id INTEGER,
    file_path TEXT NOT NULL,
    file_offset INTEGER NOT NULL,
    file_line INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(chat_id, message_id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(chat_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_chat_message ON messages(chat_id, message_id);
  CREATE INDEX IF NOT EXISTS idx_messages_from_id ON messages(from_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

  -- Chats metadata table
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    member_count INTEGER,
    is_tracked BOOLEAN DEFAULT 0,
    first_seen_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_sync_at INTEGER,
    last_message_id INTEGER,
    last_message_date TEXT,
    metadata TEXT -- JSON field for additional data
  );

  CREATE INDEX IF NOT EXISTS idx_chats_tracked ON chats(is_tracked);

  -- Feedback units table
  CREATE TABLE IF NOT EXISTS feedback_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id TEXT UNIQUE NOT NULL,
    chat_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence TEXT NOT NULL, -- JSON array of message IDs
    origin TEXT NOT NULL, -- JSON object with origin info
    severity TEXT,
    priority TEXT,
    tags TEXT, -- JSON array of tags
    llm_model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    tokens_used INTEGER,
    created_at_iso TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    processed BOOLEAN DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_chat ON feedback_units(chat_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_units(type);
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_units(created_at);
  CREATE INDEX IF NOT EXISTS idx_feedback_processed ON feedback_units(processed);

  -- Sync checkpoints table
  CREATE TABLE IF NOT EXISTS sync_checkpoints (
    chat_id TEXT PRIMARY KEY,
    last_message_id INTEGER NOT NULL,
    last_date_iso TEXT NOT NULL,
    processed_count INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- Summarization checkpoints table
  CREATE TABLE IF NOT EXISTS summarize_checkpoints (
    chat_id TEXT PRIMARY KEY,
    last_processed_message_id INTEGER NOT NULL,
    prompt_version TEXT NOT NULL,
    processed_count INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- Processing windows table (for deduplication)
  CREATE TABLE IF NOT EXISTS processing_windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    start_message_id INTEGER NOT NULL,
    end_message_id INTEGER NOT NULL,
    window_hash TEXT NOT NULL,
    processed_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(chat_id, window_hash)
  );

  CREATE INDEX IF NOT EXISTS idx_windows_chat ON processing_windows(chat_id);

  -- Schema version table
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
`;