import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { Config, ConfigSchema, TeamConfig, TeamConfigSchema } from '../types/config.js';
import dotenv from 'dotenv';

export class ConfigManager {
  private config: Config | null = null;
  private teamConfig: TeamConfig | null = null;
  private configPath: string;
  private teamConfigPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.configPath = path.join(baseDir, 'config', 'config.json');
    this.teamConfigPath = path.join(baseDir, 'config', 'team.json');
    
    // Load environment variables
    dotenv.config();
  }

  async loadConfig(): Promise<Config> {
    if (this.config) return this.config;

    try {
      const configExists = await fs.pathExists(this.configPath);
      if (!configExists) {
        throw new Error(`Config file not found at ${this.configPath}. Run 'fbtrack init' first.`);
      }

      const rawConfig = await fs.readJson(this.configPath);
      
      // Validate with Zod
      const validated = ConfigSchema.parse(rawConfig);
      
      // Check for required environment variables
      if (validated.llm.provider === 'openai') {
        const apiKey = process.env[validated.llm.apiKeyEnv];
        if (!apiKey) {
          throw new Error(`Environment variable ${validated.llm.apiKeyEnv} is not set`);
        }
      }

      this.config = validated;
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid config: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  }

  async loadTeamConfig(): Promise<TeamConfig> {
    if (this.teamConfig) return this.teamConfig;

    try {
      const exists = await fs.pathExists(this.teamConfigPath);
      if (!exists) {
        // Return default if team config doesn't exist
        return TeamConfigSchema.parse({});
      }

      const rawConfig = await fs.readJson(this.teamConfigPath);
      const validated = TeamConfigSchema.parse(rawConfig);
      
      this.teamConfig = validated;
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid team config: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      throw error;
    }
  }

  async saveConfig(config: Partial<Config>): Promise<void> {
    const existing = await this.loadConfig().catch(() => ConfigSchema.parse({}));
    const merged = { ...existing, ...config };
    const validated = ConfigSchema.parse(merged);
    
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, validated, { spaces: 2 });
    this.config = validated;
  }

  async saveTeamConfig(teamConfig: Partial<TeamConfig>): Promise<void> {
    const existing = await this.loadTeamConfig().catch(() => TeamConfigSchema.parse({}));
    const merged = { ...existing, ...teamConfig };
    const validated = TeamConfigSchema.parse(merged);
    
    await fs.ensureDir(path.dirname(this.teamConfigPath));
    await fs.writeJson(this.teamConfigPath, validated, { spaces: 2 });
    this.teamConfig = validated;
  }

  async createDefaultConfig(): Promise<void> {
    const defaultConfig = {
      telegram: {
        sessionPath: 'secrets/telegram.session',
      },
      sync: {
        defaultLookbackDays: 30,
        maxMessagesPerChatPerRun: 50000,
        batchSize: 100,
      },
      llm: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKeyEnv: 'OPENAI_API_KEY',
        maxConcurrency: 4,
      },
      summarize: {
        windowMinutes: 45,
        promptVersion: 'v1',
      },
      extract: {
        reprocessWindowHours: 6,
      },
      storage: {
        dataDir: 'data',
        stateDir: 'state',
        configDir: 'config',
        secretsDir: 'secrets',
      },
    };

    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, defaultConfig, { spaces: 2 });
  }

  async createDefaultTeamConfig(): Promise<void> {
    const defaultTeamConfig: TeamConfig = {
      teamUsernames: [],
      teamUserIds: [],
      displayNameMap: {},
    };

    await fs.ensureDir(path.dirname(this.teamConfigPath));
    await fs.writeJson(this.teamConfigPath, defaultTeamConfig, { spaces: 2 });
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  getTeamConfig(): TeamConfig {
    if (!this.teamConfig) {
      throw new Error('Team config not loaded. Call loadTeamConfig() first.');
    }
    return this.teamConfig;
  }
}