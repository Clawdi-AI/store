import { z } from 'zod';

export const ConfigSchema = z.object({
  telegram: z.object({
    sessionPath: z.string().default('secrets/telegram.session'),
  }),
  sync: z.object({
    defaultLookbackDays: z.number().positive().default(30),
    maxMessagesPerChatPerRun: z.number().positive().default(50000),
    batchSize: z.number().positive().default(100),
  }),
  llm: z.object({
    provider: z.enum(['openai', 'ollama', 'azure']).default('openai'),
    model: z.string().default('gpt-4o-mini'),
    apiKeyEnv: z.string().default('OPENAI_API_KEY'),
    baseUrl: z.string().optional(),
    maxConcurrency: z.number().positive().default(4),
    maxTokensPerRequest: z.number().positive().default(4000),
    temperature: z.number().min(0).max(2).default(0.7),
  }),
  summarize: z.object({
    windowMinutes: z.number().positive().default(45),
    promptVersion: z.string().default('v1'),
    minMessagesPerWindow: z.number().positive().default(2),
    maxWindowsPerRun: z.number().positive().default(100),
  }),
  extract: z.object({
    reprocessWindowHours: z.number().positive().default(6),
  }).optional(),
  storage: z.object({
    dataDir: z.string().default('data'),
    stateDir: z.string().default('state'),
    configDir: z.string().default('config'),
    secretsDir: z.string().default('secrets'),
    maxFileSize: z.number().positive().default(100 * 1024 * 1024), // 100MB
    rotateFiles: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const TeamConfigSchema = z.object({
  teamUsernames: z.array(z.string()).default([]),
  teamUserIds: z.array(z.string()).default([]),
  displayNameMap: z.record(z.string(), z.string()).default({}),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;

export const CheckpointSchema = z.object({
  lastMessageId: z.number(),
  lastDateISO: z.string(),
  processedCount: z.number().default(0),
  version: z.string().default('1'),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;