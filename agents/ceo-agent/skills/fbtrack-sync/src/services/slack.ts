import { logger } from '../lib/logger.js';
import { RawMessage } from '../types/message.js';

interface SlackMessage {
  type: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: { name: string; count: number; users: string[] }[];
  files?: { name: string; mimetype: string; url_private: string }[];
}

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_member: boolean;
  num_members?: number;
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
}

export class SlackService {
  private token: string;
  private baseUrl = 'https://slack.com/api';
  private userCache: Map<string, SlackUser> = new Map();

  constructor() {
    this.token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN || '';
    if (!this.token) {
      logger.warn('SLACK_BOT_TOKEN or SLACK_USER_TOKEN not set - Slack integration disabled');
    }
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  private async apiCall<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${method}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json() as { ok: boolean; error?: string } & T;
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
    return data;
  }

  async listChannels(limit: number = 200): Promise<SlackChannel[]> {
    const allChannels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string | number> = {
        types: 'public_channel,private_channel',
        limit: Math.min(limit, 200),
        exclude_archived: 'true',
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const result = await this.apiCall<{
        channels: SlackChannel[];
        response_metadata?: { next_cursor?: string };
      }>('conversations.list', params);

      allChannels.push(...result.channels);
      cursor = result.response_metadata?.next_cursor;

      if (allChannels.length >= limit) break;
    } while (cursor);

    return allChannels.slice(0, limit);
  }

  private async getUser(userId: string): Promise<SlackUser | null> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    try {
      const result = await this.apiCall<{ user: SlackUser }>('users.info', { user: userId });
      this.userCache.set(userId, result.user);
      return result.user;
    } catch (error) {
      logger.debug(`Failed to get user info for ${userId}`);
      return null;
    }
  }

  async getMessages(
    channelId: string,
    channelName: string,
    startDate: Date,
    endDate: Date,
    limit: number = 1000
  ): Promise<RawMessage[]> {
    const messages: RawMessage[] = [];
    let cursor: string | undefined;
    const oldest = Math.floor(startDate.getTime() / 1000).toString();
    const latest = Math.floor(endDate.getTime() / 1000).toString();

    let messageCounter = 0;

    do {
      const params: Record<string, string | number> = {
        channel: channelId,
        oldest,
        latest,
        limit: Math.min(limit - messages.length, 200),
        inclusive: 'true',
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const result = await this.apiCall<{
        messages: SlackMessage[];
        has_more: boolean;
        response_metadata?: { next_cursor?: string };
      }>('conversations.history', params);

      for (const msg of result.messages) {
        if (msg.type !== 'message' || !msg.text) continue;

        const user = msg.user ? await this.getUser(msg.user) : null;
        const displayName = user?.profile?.display_name || user?.real_name || user?.name || null;

        // Generate a numeric message ID from the timestamp
        messageCounter++;
        const messageId = Math.floor(parseFloat(msg.ts) * 1000000) + messageCounter;

        // Parse thread reply
        const replyToId = msg.thread_ts && msg.thread_ts !== msg.ts
          ? Math.floor(parseFloat(msg.thread_ts) * 1000000)
          : null;

        const rawMessage: RawMessage = {
          messageId: messageId,
          chatId: `slack_${channelId}`,
          chatTitle: `[Slack] ${channelName}`,
          chatType: 'channel', // Use 'channel' as closest match
          fromId: msg.user || null,
          fromUsername: user?.name || null,
          fromDisplayName: displayName,
          text: msg.text,
          dateISO: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          replyToMessageId: replyToId,
          topicId: null,
          topicName: null,
          editDateISO: null,
          deleted: false,
          mediaType: msg.files?.[0]?.mimetype || null,
          forwardFromId: null,
        };

        messages.push(rawMessage);
      }

      cursor = result.response_metadata?.next_cursor;
      if (messages.length >= limit) break;
    } while (cursor);

    // Sort chronologically (oldest first) using dateISO
    messages.sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
    return messages;
  }

  async getChannelInfo(channelId: string): Promise<SlackChannel | null> {
    try {
      const result = await this.apiCall<{ channel: SlackChannel }>('conversations.info', {
        channel: channelId,
      });
      return result.channel;
    } catch (error) {
      logger.error(`Failed to get channel info for ${channelId}`, error);
      return null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.apiCall<{ user_id: string; team_id: string }>('auth.test');
      return true;
    } catch (error) {
      logger.error('Slack connection test failed', error);
      return false;
    }
  }
}
