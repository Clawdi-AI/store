import { logger } from '../lib/logger.js';
import { Config } from '../types/config.js';
import { RawMessage } from '../types/message.js';
import { TelegramService } from '../services/telegram.js';
import { DatabaseManager } from '../db/database.js';
import fs from 'fs-extra';
import path from 'path';

export class SyncService {
  private config: Config;
  private telegram: TelegramService;
  private db: DatabaseManager;
  private baseDir: string;

  constructor(config: Config, baseDir: string = process.cwd()) {
    this.config = config;
    this.baseDir = baseDir;
    this.telegram = new TelegramService(config, baseDir);
    this.db = new DatabaseManager(baseDir);
  }

  async initialize(): Promise<void> {
    // Check if we have a valid session before initializing
    const hasSession = await this.telegram.hasValidSession();
    if (!hasSession) {
      throw new Error('No valid Telegram session found. Please run "fbtrack login" first.');
    }
    
    await this.telegram.initialize();
    await this.db.initialize();
  }

  async syncChat(chatId: string): Promise<{ newMessages: number; totalMessages: number }> {
    const chatLogger = logger.child({ chatId });
    chatLogger.info('Starting chat sync');

    try {
      // Get chat info and store it
      const chatInfo = await this.telegram.getChatInfo(chatId);
      await this.db.upsertChat(chatId, chatInfo.title, chatInfo.type, chatInfo.memberCount);
      
      chatLogger.info('Chat info updated', chatInfo);

      // Calculate date range (last 24 hours by default)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (this.config.sync.defaultLookbackDays * 24 * 60 * 60 * 1000));
      
      chatLogger.info('Fetching messages', { startDate: startDate.toISOString(), endDate: endDate.toISOString() });

      // Get existing checkpoint
      const checkpoint = await this.db.getSyncCheckpoint(chatId);
      let minId = 0;
      
      if (checkpoint) {
        minId = checkpoint.lastMessageId;
        chatLogger.info('Found existing checkpoint', { lastMessageId: minId });
        
        // Smart sync: check if there are any new messages before doing full sync
        chatLogger.info('Checking for new messages...');
        const latestInfo = await this.telegram.getLatestMessageInfo(chatId);
        
        if (latestInfo) {
          chatLogger.info('Latest message info', { 
            latestMessageId: latestInfo.messageId, 
            latestDate: latestInfo.date.toISOString(),
            checkpointMessageId: checkpoint.lastMessageId 
          });
          
          // If the latest message is not newer than our checkpoint, skip sync
          if (latestInfo.messageId <= checkpoint.lastMessageId) {
            chatLogger.info('No new messages since last sync, skipping');
            return { newMessages: 0, totalMessages: 0 };
          }
          
          // If latest message is outside our date range, skip sync
          if (latestInfo.date < startDate) {
            chatLogger.info('Latest message is outside sync date range, skipping');
            return { newMessages: 0, totalMessages: 0 };
          }
          
          chatLogger.info('New messages detected, proceeding with sync');
        } else {
          chatLogger.info('Could not get latest message info, proceeding with full sync');
        }
      }

      // Fetch messages from Telegram
      const messages = await this.telegram.getMessagesInDateRange(
        chatId,
        startDate,
        endDate,
        this.config.sync.batchSize,
        this.config.sync.maxMessagesPerChatPerRun
      );

      if (messages.length === 0) {
        chatLogger.info('No new messages found');
        return { newMessages: 0, totalMessages: 0 };
      }

      // Filter out messages we already have
      const newMessages = checkpoint 
        ? messages.filter(msg => msg.messageId > checkpoint.lastMessageId)
        : messages;

      chatLogger.info(`Processing ${newMessages.length} new messages out of ${messages.length} total`);

      if (newMessages.length === 0) {
        return { newMessages: 0, totalMessages: messages.length };
      }

      // Store messages in JSONL file and index in database
      await this.storeMessages(chatId, newMessages);

      // Update checkpoint
      if (newMessages.length > 0) {
        const latestMessage = newMessages[newMessages.length - 1];
        await this.db.updateSyncCheckpoint(chatId, {
          lastMessageId: latestMessage.messageId,
          lastDateISO: latestMessage.dateISO,
          processedCount: (checkpoint?.processedCount || 0) + newMessages.length,
          version: '1'
        });
      }

      chatLogger.info('Sync completed', { newMessages: newMessages.length, totalMessages: messages.length });
      return { newMessages: newMessages.length, totalMessages: messages.length };

    } catch (error) {
      chatLogger.error('Chat sync failed', error);
      throw error;
    }
  }

  private async storeMessages(chatId: string, messages: RawMessage[]): Promise<void> {
    const dataDir = path.join(this.baseDir, this.config.storage.dataDir, 'raw');
    await fs.ensureDir(dataDir);

    const fileName = `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}.jsonl`;
    const filePath = path.join(dataDir, fileName);

    // Read existing messages if file exists
    let allMessages: RawMessage[] = [];
    if (await fs.pathExists(filePath)) {
      const existingContent = await fs.readFile(filePath, 'utf8');
      const existingLines = existingContent.split('\n').filter(line => line.trim());
      allMessages = existingLines.map(line => JSON.parse(line));
    }

    // Add new messages
    allMessages.push(...messages);

    // Sort all messages by date to maintain chronological order
    allMessages.sort((a, b) => {
      const dateA = new Date(a.dateISO).getTime();
      const dateB = new Date(b.dateISO).getTime();
      return dateA - dateB;
    });

    // Rewrite the entire file with sorted messages
    const sortedLines = allMessages.map(msg => JSON.stringify(msg)).join('\n') + '\n';
    await fs.writeFile(filePath, sortedLines);

    // Re-index all messages in database
    let fileOffset = 0;
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      const msgJson = JSON.stringify(msg);
      
      await this.db.indexMessage(
        msg,
        filePath,
        fileOffset,
        i + 1
      );

      fileOffset += Buffer.byteLength(msgJson + '\n');
    }

    logger.info(`Stored ${messages.length} new messages to ${fileName}, total ${allMessages.length} messages in file`);
  }

  async syncTrackedChats(): Promise<{ [chatId: string]: { newMessages: number; totalMessages: number } }> {
    const results: { [chatId: string]: { newMessages: number; totalMessages: number } } = {};
    const selectedChatIds = await this.getSelectedChatIds();

    for (const chatId of selectedChatIds) {
      try {
        results[chatId] = await this.syncChat(chatId);
      } catch (error) {
        logger.error(`Failed to sync chat ${chatId}`, error);
        results[chatId] = { newMessages: 0, totalMessages: 0 };
      }
    }

    return results;
  }

  async discoverChats(): Promise<void> {
    logger.info('Discovering available chats');

    try {
      const dialogs = await this.telegram.getDialogs(100);
      let totalChats = 0;
      let matchingChats = 0;
      
      logger.info(`Found ${dialogs.length} total dialogs`);
      
      for (const dialog of dialogs) {
        const entity = (dialog as any).entity;
        if (!entity) continue;

        let chatId = '';
        let title = '';
        let type = '';

        if ('id' in entity) {
          chatId = entity.id.toString();
          if ('title' in entity) {
            title = entity.title;
            type = 'broadcast' in entity && entity.broadcast ? 'channel' : 'supergroup';
            totalChats++;
            
            logger.info(`Found chat: "${title}" (${chatId}) [${type}]`);
          }
        }

        if (chatId && title) {
          // Add all chats (no filtering since we use chats.txt for selection)
          await this.db.upsertChat(chatId, title, type);
          logger.info(`✓ Found chat: ${title} (${chatId})`);
          matchingChats++;
        }
      }
      
      logger.info(`Discovery complete: Found ${matchingChats} chats out of ${totalChats} total`);

    } catch (error) {
      logger.error('Chat discovery failed', error);
      throw error;
    }
  }

  async getDialogs(limit: number = 100): Promise<any[]> {
    return await this.telegram.getDialogs(limit);
  }

  async getSelectedChatIds(): Promise<string[]> {
    const chatsFilePath = path.join(this.baseDir, this.config.storage.configDir, 'chats.txt');
    
    // Only use chats.txt as source of truth
    if (!await fs.pathExists(chatsFilePath)) {
      logger.warn('No chats.txt found. Please create config/chats.txt to specify which chats to sync.');
      return [];
    }
    
    try {
      const content = await fs.readFile(chatsFilePath, 'utf8');
      const lines = content.split('\n');
      const selectedChatIds: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and header comments
        if (trimmed === '' || trimmed.startsWith('# Chat Selection File') || 
            trimmed.startsWith('# Uncomment') || trimmed.startsWith('# Format:')) {
          continue;
        }
        
        // Skip commented lines (disabled chats)
        if (trimmed.startsWith('#')) {
          continue;
        }
        
        // Parse CSV format: chatId,chatTitle,chatType,memberCount
        const parts = trimmed.split(',');
        if (parts.length >= 1) {
          const chatId = parts[0].trim();
          
          if (chatId && chatId.match(/^-?\d+$/)) {
            selectedChatIds.push(chatId);
          }
        }
      }
      
      logger.info(`Found ${selectedChatIds.length} selected chats in chats.txt`);
      return selectedChatIds;
      
    } catch (error) {
      logger.error('Failed to read chats.txt', error);
      throw new Error('Could not load chat selection from chats.txt. Please check the file exists and is readable.');
    }
  }

  async disconnect(): Promise<void> {
    await this.telegram.disconnect();
    await this.db.close();
  }
}