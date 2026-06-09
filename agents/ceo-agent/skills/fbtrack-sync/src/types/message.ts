import { z } from 'zod';

export const RawMessageSchema = z.object({
  chatId: z.string(),
  chatTitle: z.string(),
  chatType: z.enum(['private', 'group', 'supergroup', 'channel']),
  messageId: z.number(),
  dateISO: z.string(),
  fromId: z.string().nullable(),
  fromUsername: z.string().nullable(),
  fromDisplayName: z.string().nullable(),
  text: z.string().nullable(),
  replyToMessageId: z.number().nullable(),
  topicId: z.number().nullable(),
  topicName: z.string().nullable(),
  editDateISO: z.string().nullable(),
  deleted: z.boolean().default(false),
  mediaType: z.string().nullable(),
  forwardFromId: z.string().nullable(),
});

export type RawMessage = z.infer<typeof RawMessageSchema>;

export const FeedbackUnitSchema = z.object({
  unitId: z.string(),
  type: z.enum(['bug_report', 'feature_request', 'question', 'feedback']),
  title: z.string(),
  summary: z.string(),
  evidence: z.array(z.number()),
  origin: z.object({
    chatId: z.string(),
    chatTitle: z.string(),
    authorUserId: z.string().nullable(),
    authorUsername: z.string().nullable(),
    authorDisplayName: z.string().nullable(),
    firstMessageISO: z.string(),
  }),
  llm: z.object({
    model: z.string(),
    promptVersion: z.string(),
    tokensUsed: z.number().optional(),
  }),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  createdAtISO: z.string(),
});

export type FeedbackUnit = z.infer<typeof FeedbackUnitSchema>;