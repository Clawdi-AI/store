import fs from 'fs-extra';
import path from 'path';

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

export class MessageContextService {
  private baseDir: string;
  private messageCache: Map<string, RawMessage[]> = new Map();

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  /**
   * Extract message IDs from any extraction unit, regardless of agent type
   */
  extractMessageIds(unit: any): number[] {
    const messageIds: number[] = [];

    // QA format
    if (unit.problem?.messageIds) {
      messageIds.push(...unit.problem.messageIds);
    }
    if (unit.solution?.messageIds) {
      messageIds.push(...unit.solution.messageIds);
    }

    // Sales format
    if (unit.conversation_context?.messageIds) {
      messageIds.push(...unit.conversation_context.messageIds);
    }

    // Remove duplicates and sort
    return [...new Set(messageIds)].sort((a, b) => a - b);
  }

  /**
   * Extract timestamp range from any extraction unit
   */
  extractTimestampRange(unit: any): { start: string; end: string } | null {
    // QA format
    if (unit.problem?.timestamp) {
      const start = unit.problem.timestamp;
      const end = unit.solution?.timestamp_range?.split(' to ')[1] || start;
      return { start, end };
    }

    // Sales format
    if (unit.conversation_context?.timestamp_range) {
      const [start, end] = unit.conversation_context.timestamp_range.split(' to ');
      return { start, end: end || start };
    }

    return null;
  }

  /**
   * Get participant information from any extraction unit
   */
  extractParticipants(unit: any): string[] {
    return unit.message_context?.participants || [];
  }

  /**
   * Load raw messages for a chat (with caching)
   */
  async loadRawMessages(chatId: string): Promise<RawMessage[]> {
    if (this.messageCache.has(chatId)) {
      return this.messageCache.get(chatId)!;
    }

    const rawFile = path.join(this.baseDir, 'data', 'raw', `${chatId}.jsonl`);
    
    if (!await fs.pathExists(rawFile)) {
      return [];
    }

    const content = await fs.readFile(rawFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const messages: RawMessage[] = [];

    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        messages.push(message);
      } catch (error) {
        // Skip invalid lines
      }
    }

    this.messageCache.set(chatId, messages);
    return messages;
  }

  /**
   * Find specific messages by IDs in a chat
   */
  async findMessagesByIds(chatId: string, messageIds: number[]): Promise<RawMessage[]> {
    const allMessages = await this.loadRawMessages(chatId);
    const messageMap = new Map(allMessages.map(msg => [msg.messageId, msg]));
    
    return messageIds
      .map(id => messageMap.get(id))
      .filter((msg): msg is RawMessage => msg !== undefined);
  }

  /**
   * Generate a standardized message context summary for any unit
   */
  async generateMessageContext(unit: any): Promise<{
    messageIds: number[];
    messageCount: number;
    participants: string[];
    timestampRange: { start: string; end: string } | null;
    messages: RawMessage[];
  }> {
    const messageIds = this.extractMessageIds(unit);
    const participants = this.extractParticipants(unit);
    const timestampRange = this.extractTimestampRange(unit);
    const messages = await this.findMessagesByIds(unit.chatId, messageIds);

    return {
      messageIds,
      messageCount: messageIds.length,
      participants,
      timestampRange,
      messages
    };
  }

  /**
   * Clear the message cache
   */
  clearCache(): void {
    this.messageCache.clear();
  }
}