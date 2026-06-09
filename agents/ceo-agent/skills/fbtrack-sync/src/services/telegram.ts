import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../lib/logger.js';
import { Config } from '../types/config.js';
import { RawMessage } from '../types/message.js';
import readline from 'readline';

export class TelegramService {
  private client: TelegramClient | null = null;
  private sessionPath: string;

  constructor(config: Config, baseDir: string = process.cwd()) {
    this.sessionPath = path.join(baseDir, config.telegram.sessionPath);
  }
  
  async hasValidSession(): Promise<boolean> {
    try {
      if (!await fs.pathExists(this.sessionPath)) {
        return false;
      }
      
      const sessionString = await fs.readFile(this.sessionPath, 'utf8');
      const trimmed = sessionString.trim();
      return trimmed.length > 0;
    } catch (error) {
      logger.debug('Error checking session validity');
      return false;
    }
  }

  async initialize(forceLogin: boolean = false): Promise<void> {
    try {
      // Load existing session or create new one
      let sessionString = '';
      let hasExistingSession = false;
      
      if (!forceLogin && await fs.pathExists(this.sessionPath)) {
        sessionString = await fs.readFile(this.sessionPath, 'utf8');
        hasExistingSession = !!sessionString.trim();
        if (hasExistingSession) {
          logger.info('Loading existing Telegram session');
        }
      }
      
      if (!hasExistingSession) {
        logger.info('Creating new Telegram session');
      }

      const session = new StringSession(sessionString);
      
      // Get credentials from environment variables
      const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
      const apiHash = process.env.TELEGRAM_API_HASH || '';
      
      if (!apiId || !apiHash) {
        throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in environment variables');
      }
      
      this.client = new TelegramClient(
        session,
        apiId,
        apiHash,
        {
          connectionRetries: 5,
          retryDelay: 1000,
        }
      );

      logger.info('Connecting to Telegram...');
      
      // Only prompt for auth if we don't have a valid session
      if (hasExistingSession) {
        await this.client.connect();
        
        // Test if session is still valid by making a simple API call
        try {
          await this.client.getMe();
          logger.info('Successfully connected with existing session');
          return; // Success - no need to re-authenticate
        } catch (error) {
          logger.warn('Existing session invalid, will re-authenticate');
          await this.client.disconnect();
          // Fall through to re-authentication
        }
      }
      
      // Need to authenticate
      await this.client.start({
        phoneNumber: async () => await this.promptInput('Enter your phone number: '),
        password: async () => await this.promptInput('Enter your password: '),
        phoneCode: async () => await this.promptInput('Enter the code you received: '),
        onError: (err) => logger.error('Telegram auth error', err),
      });

      // Save session
      await fs.ensureDir(path.dirname(this.sessionPath));
      const sessionData = (this.client.session.save() as unknown) as string;
      await fs.writeFile(this.sessionPath, sessionData);
      
      logger.info('Successfully authenticated and session saved');
    } catch (error) {
      logger.error('Failed to initialize Telegram client', error);
      throw error;
    }
  }

  private async promptInput(message: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async getClient(): Promise<TelegramClient> {
    if (!this.client) {
      throw new Error('Telegram client not initialized. Call initialize() first.');
    }
    
    if (!this.client.connected) {
      logger.info('Reconnecting to Telegram...');
      await this.client.connect();
    }
    
    return this.client;
  }

  async getDialogs(limit: number = 100): Promise<any[]> {
    const client = await this.getClient();
    
    const result = await client.getDialogs({ limit });
    return result.filter(dialog => dialog.isChannel || dialog.isGroup);
  }

  async getChatInfo(chatId: string): Promise<{ title: string; type: string; memberCount?: number }> {
    const client = await this.getClient();
    
    try {
      const entity = await client.getEntity(chatId);
      
      if (entity instanceof Api.Channel) {
        return {
          title: entity.title,
          type: entity.broadcast ? 'channel' : 'supergroup',
          memberCount: entity.participantsCount,
        };
      } else if (entity instanceof Api.Chat) {
        return {
          title: entity.title,
          type: 'group',
          memberCount: entity.participantsCount,
        };
      } else {
        return {
          title: 'Private Chat',
          type: 'private',
        };
      }
    } catch (error) {
      logger.error(`Failed to get chat info for ${chatId}`, error);
      throw error;
    }
  }

  async getLatestMessageInfo(chatId: string): Promise<{ messageId: number; date: Date } | null> {
    const client = await this.getClient();
    
    try {
      const entity = await client.getEntity(chatId);
      const messages = await client.getMessages(entity, { limit: 1 });
      
      if (messages.length === 0) {
        return null;
      }
      
      const latestMessage = messages[0];
      return {
        messageId: latestMessage.id,
        date: new Date(latestMessage.date * 1000),
      };
    } catch (error) {
      logger.error(`Failed to get latest message info for ${chatId}`, error);
      throw error;
    }
  }

  async getMessages(
    chatId: string,
    options: {
      limit?: number;
      offsetDate?: Date;
      minId?: number;
      offsetId?: number;
    } = {}
  ): Promise<RawMessage[]> {
    const client = await this.getClient();
    const { limit = 100, offsetDate, minId, offsetId } = options;

    try {
      const requestParams = {
        limit,
        offsetDate: offsetDate ? Math.floor(offsetDate.getTime() / 1000) : undefined,
        minId,
        offsetId,
      };
      
      logger.debug(`Fetching messages from chat ${chatId}`, requestParams);

      const entity = await client.getEntity(chatId);
      const chatInfo = await this.getChatInfo(chatId);

      const messages = await client.getMessages(entity, requestParams);


      const rawMessages: RawMessage[] = [];
      
      // Cache for topic names to avoid redundant API calls
      const topicNames = new Map<number, string>();
      
      // Cache for user info to avoid redundant API calls
      const userCache = new Map<string, { username?: string; displayName?: string } | null>();
      
      // Collect unique user IDs first
      const uniqueUserIds = new Set<string>();
      for (const msg of messages) {
        if (msg instanceof Api.Message && msg.fromId) {
          const userId = this.extractUserId(msg.fromId);
          if (userId) {
            uniqueUserIds.add(userId);
          }
        }
      }
      
      // Batch fetch user info for all unique users
      for (const userId of uniqueUserIds) {
        try {
          const userInfo = await this.getUserInfo(userId);
          userCache.set(userId, userInfo);
        } catch (error) {
          logger.debug(`Failed to get user info for ${userId}`);
          userCache.set(userId, null);
        }
      }

      for (const msg of messages) {
        if (msg instanceof Api.Message) {
          const userId = msg.fromId ? this.extractUserId(msg.fromId) : null;
          const fromUser = userId ? userCache.get(userId) : null;
          
          // Get topic name if message is in a forum topic
          let topicName: string | null = null;
          let topicId: number | null = null;
          
          // In forum groups, messages can be:
          // 1. Direct replies to topic (replyToTopId is null, but forumTopic is true)
          // 2. Replies within topic (replyToTopId has the topic ID)
          if (msg.replyTo && msg.replyTo.forumTopic) {
            topicId = msg.replyTo.replyToTopId || msg.replyTo.replyToMsgId || null;
          }
          
          if (topicId && entity instanceof Api.Channel && entity.forum) {
            if (!topicNames.has(topicId)) {
              try {
                // Use the proper API to get forum topics
                const topicsResult = await client.invoke(
                  new Api.channels.GetForumTopics({
                    channel: entity,
                    offsetDate: 0,
                    offsetId: 0,
                    offsetTopic: 0,
                    limit: 100,
                  })
                );
                
                // Cache all topics from this request
                for (const topic of topicsResult.topics) {
                  if (topic instanceof Api.ForumTopic) {
                    topicNames.set(topic.id, topic.title);
                  }
                }
              } catch (error) {
                logger.debug('Failed to fetch forum topics', { error });
              }
            }
            topicName = topicNames.get(topicId) || null;
          }
          
          const rawMessage: RawMessage = {
            chatId: chatId,
            chatTitle: chatInfo.title,
            chatType: chatInfo.type as any,
            messageId: msg.id,
            dateISO: new Date(msg.date * 1000).toISOString(),
            fromId: msg.fromId ? this.extractUserId(msg.fromId) : null,
            fromUsername: fromUser?.username ? `@${fromUser.username}` : null,
            fromDisplayName: fromUser?.displayName || null,
            text: msg.message || null,
            replyToMessageId: msg.replyTo?.replyToMsgId || null,
            topicId: topicId,
            topicName: topicName,
            editDateISO: msg.editDate ? new Date(msg.editDate * 1000).toISOString() : null,
            deleted: false,
            mediaType: msg.media ? this.getMediaType(msg.media) : null,
            forwardFromId: msg.fwdFrom?.fromId ? this.extractUserId(msg.fwdFrom.fromId) : null,
          };

          rawMessages.push(rawMessage);
        }
      }

      logger.info(`Fetched ${rawMessages.length} messages from chat ${chatId}`);
      return rawMessages.reverse(); // Return chronological order
      
    } catch (error) {
      logger.error(`Failed to fetch messages from chat ${chatId}`, error);
      throw error;
    }
  }

  private async getUserInfo(userId: any): Promise<{ username?: string; displayName?: string } | null> {
    try {
      const client = await this.getClient();
      const user = await client.getEntity(userId);
      
      if (user instanceof Api.User) {
        return {
          username: user.username,
          displayName: user.firstName + (user.lastName ? ` ${user.lastName}` : ''),
        };
      }
      return null;
    } catch (error) {
      logger.debug('Failed to get user info');
      return null;
    }
  }

  private extractUserId(fromId: any): string | null {
    try {
      // Handle different Telegram API peer types
      if (fromId.userId) {
        return fromId.userId.toString();
      }
      if (fromId.channelId) {
        return `-100${fromId.channelId.toString()}`;
      }
      if (fromId.chatId) {
        return `-${fromId.chatId.toString()}`;
      }
      // Fallback: try direct conversion
      return fromId.toString();
    } catch (error) {
      logger.debug('Failed to extract user ID from fromId object');
      return null;
    }
  }

  private getMediaType(media: any): string {
    if (media instanceof Api.MessageMediaPhoto) return 'photo';
    if (media instanceof Api.MessageMediaDocument) return 'document';
    if (media instanceof Api.MessageMediaContact) return 'contact';
    if (media instanceof Api.MessageMediaGeo) return 'location';
    if (media instanceof Api.MessageMediaVenue) return 'venue';
    if (media instanceof Api.MessageMediaWebPage) return 'webpage';
    return 'unknown';
  }

  async getMessagesInDateRange(
    chatId: string,
    startDate: Date,
    endDate: Date = new Date(),
    batchSize: number = 100,
    maxMessages: number = 1000
  ): Promise<RawMessage[]> {
    const allMessages: RawMessage[] = [];
    const seenMessageIds = new Set<number>();
    let offsetId: number | undefined = undefined;
    let hasMore = true;
    let batchCount = 0;
    let consecutiveEmptyBatches = 0;

    logger.info(`Starting message fetch: date range ${startDate.toISOString()} to ${endDate.toISOString()}, batch size ${batchSize}`);

    while (hasMore) {
      batchCount++;
      const messages = await this.getMessages(chatId, {
        limit: batchSize,
        offsetDate: batchCount === 1 ? endDate : undefined,
        offsetId: offsetId,
      });

      if (messages.length === 0) {
        break;
      }

      // IMPORTANT: messages are returned in chronological order (oldest to newest) after reverse()
      // For pagination: we need the OLDEST message ID to continue fetching further back in time
      const firstMessage = messages[0];  // Chronologically oldest message in this batch
      const lastMessage = messages[messages.length - 1];  // Chronologically newest message in this batch
      const firstMessageDate = new Date(firstMessage.dateISO);
      
      // Debug logging to understand the message range in this batch
      logger.info(`Batch ${batchCount} range: ${firstMessage.messageId} (${firstMessage.dateISO}) → ${lastMessage.messageId} (${lastMessage.dateISO})`);
      
      // Filter messages within date range AND not already seen
      const filteredMessages = messages.filter(msg => {
        const msgDate = new Date(msg.dateISO);
        const inRange = msgDate >= startDate && msgDate <= endDate;
        const notSeen = !seenMessageIds.has(msg.messageId);
        
        logger.debug(`Message ${msg.messageId}: date=${msgDate.toISOString()}, inRange=${inRange}, notSeen=${notSeen}`);
        
        if (inRange && notSeen) {
          seenMessageIds.add(msg.messageId);
          return true;
        }
        return false;
      });

      allMessages.push(...filteredMessages);

      // Track consecutive empty batches for early termination
      if (filteredMessages.length === 0) {
        consecutiveEmptyBatches++;
      } else {
        consecutiveEmptyBatches = 0;
      }

      logger.info(`Batch ${batchCount}: fetched ${messages.length}, ${filteredMessages.length} in range, ${allMessages.length} total collected`);
      
      // Set offsetId for next batch: excludes messages with ID >= offsetId
      // Use the chronologically oldest message ID to continue fetching further back in time
      offsetId = firstMessage.messageId;
      logger.debug(`Next batch will fetch messages older than ID ${offsetId}`);
      
      // Primary exit conditions (in order of priority):
      
      // 1. Reached start date boundary - we're done with the requested range
      if (firstMessageDate < startDate) {
        logger.info(`Reached start date boundary (first message: ${firstMessageDate.toISOString()})`);
        hasMore = false;
        continue; // Skip other checks
      }
      
      // 2. Safety limit to prevent runaway fetching
      if (allMessages.length > maxMessages * 5) {
        logger.warn(`Safety limit reached: ${allMessages.length} messages. Stopping.`);
        hasMore = false;
        continue;
      }
      
      // 3. End of available messages
      if (messages.length < batchSize) {
        logger.info('Reached end of available messages');
        hasMore = false;
        continue;
      }
      
      // 4. Too many consecutive empty batches (likely past our date range)
      if (consecutiveEmptyBatches >= 3 && allMessages.length > 0) {
        logger.info(`Stopping: ${consecutiveEmptyBatches} consecutive empty batches`);
        hasMore = false;
        continue;
      }
      
      // Rate limiting removed for faster testing
    }

    logger.info(`Collected ${allMessages.length} messages from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Messages are already in chronological order since:
    // 1. getMessages() returns them chronologically after reverse()  
    // 2. We append filtered messages sequentially from newest to oldest batches
    // No final sorting needed
    return allMessages;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      logger.info('Telegram client disconnected');
    }
  }
}