import fs from 'fs-extra';
import path from 'path';
import { Command } from 'commander';
import { RawMessage } from '../../types/message.js';
import { logger } from '../../lib/logger.js';
import chalk from 'chalk';

interface ExportOptions {
  chat: string;
}

export const exportChatCommand = new Command()
  .command('export-chat')
  .description('Export full chat history to text files (one per topic for forum groups)')
  .requiredOption('--chat <chatId>', 'Chat ID to export')
  .action(async (options: ExportOptions) => {
    try {
      const baseDir = process.cwd();
      await exportChat(baseDir, options);
    } catch (error: any) {
      logger.error('Export failed:', error);
      console.error(chalk.red('Export failed:'), error.message);
      process.exit(1);
    }
  });

async function exportChat(baseDir: string, options: ExportOptions) {
  const chatId = options.chat;
  console.log(`Exporting chat ${chatId}...`);

  // Load all messages from the chat
  const messages = await loadMessages(baseDir, chatId);

  if (messages.length === 0) {
    console.log(`No messages found for chat ${chatId}`);
    return;
  }

  // Get chat title from first message
  const chatTitle = messages[0].chatTitle || `Chat ${chatId}`;
  const sanitizedTitle = sanitizeFilename(chatTitle);

  // Group messages by topic
  const messagesByTopic = groupMessagesByTopic(messages);

  // Create export directory
  const exportDir = path.join(baseDir, 'data/exports', sanitizedTitle);
  await fs.ensureDir(exportDir);

  console.log(`Found ${messagesByTopic.size} topic(s) in ${chatTitle}`);
  console.log(`Exporting to: ${exportDir}`);

  // Export each topic to a separate file
  for (const [topicKey, topicMessages] of messagesByTopic) {
    const { topicId, topicName } = parseTopicKey(topicKey);
    await exportTopic(exportDir, topicMessages, topicId, topicName, chatTitle);
  }

  console.log(`\nExport complete! ${messages.length} messages exported across ${messagesByTopic.size} file(s)`);
}

async function loadMessages(baseDir: string, chatId: string): Promise<RawMessage[]> {
  const filePath = path.join(baseDir, 'data/raw', `${chatId.replace(/[^a-zA-Z0-9-]/g, '_')}.jsonl`);

  if (!await fs.pathExists(filePath)) {
    return [];
  }

  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  return lines.map(line => JSON.parse(line) as RawMessage);
}

function groupMessagesByTopic(messages: RawMessage[]): Map<string, RawMessage[]> {
  const grouped = new Map<string, RawMessage[]>();

  for (const message of messages) {
    // Create a key based on topicId (or null for general/no topic)
    const topicKey = message.topicId
      ? `${message.topicId}:${message.topicName || 'Unknown Topic'}`
      : 'general:General';

    if (!grouped.has(topicKey)) {
      grouped.set(topicKey, []);
    }
    grouped.get(topicKey)!.push(message);
  }

  return grouped;
}

function parseTopicKey(key: string): { topicId: number | null, topicName: string } {
  const [id, ...nameParts] = key.split(':');
  return {
    topicId: id === 'general' ? null : parseInt(id),
    topicName: nameParts.join(':')
  };
}

async function exportTopic(
  exportDir: string,
  messages: RawMessage[],
  topicId: number | null,
  topicName: string,
  chatTitle: string
) {
  // Sort messages chronologically
  messages.sort((a, b) => a.messageId - b.messageId);

  // Create filename based on topic
  const filename = topicId
    ? `topic_${topicId}_${sanitizeFilename(topicName)}.txt`
    : 'general.txt';

  const filepath = path.join(exportDir, filename);

  // Format the transcript
  const transcript = formatTranscript(messages, chatTitle, topicName);

  // Write to file
  await fs.writeFile(filepath, transcript, 'utf8');

  const topicLabel = topicId ? `Topic #${topicId} (${topicName})` : 'General';
  console.log(`  - ${topicLabel}: ${messages.length} messages → ${filename}`);
}

function formatTranscript(messages: RawMessage[], chatTitle: string, topicName: string): string {
  const lines: string[] = [];

  // Add header
  lines.push('=' .repeat(80));
  lines.push(`Chat: ${chatTitle}`);
  lines.push(`Topic: ${topicName}`);
  lines.push(`Messages: ${messages.length}`);
  lines.push(`Date Range: ${messages[0]?.dateISO} to ${messages[messages.length - 1]?.dateISO}`);
  lines.push('=' .repeat(80));
  lines.push('');

  // Format each message
  for (const msg of messages) {
    const id = msg.messageId;
    const timestamp = msg.dateISO;
    const author = msg.fromUsername || msg.fromDisplayName || 'unknown';
    const text = msg.text || '[media/deleted]';
    const replyInfo = msg.replyToMessageId ? ` (replying to #${msg.replyToMessageId})` : '';

    // Clean up author (remove @ if present to avoid @@)
    const cleanAuthor = author.startsWith('@') ? author.slice(1) : author;

    // Format the message
    const formattedMessage = `[#${id}] ${timestamp} @${cleanAuthor}${replyInfo}:\n${text}\n`;
    lines.push(formattedMessage);
  }

  return lines.join('\n');
}

function sanitizeFilename(name: string): string {
  // Replace problematic characters with underscores
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100); // Limit length
}