import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../lib/logger.js';
import { ConfigManager } from '../../core/config.js';

export const initCommand = new Command('init')
  .description('Scaffold directories and default config/prompt files')
  .option('-f, --force', 'Overwrite existing files', false)
  .action(async (options) => {
    try {
      logger.info('Initializing feedback-tracker project');
      
      const baseDir = process.cwd();
      const force = options.force;

      // Define directory structure
      const directories = [
        'config',
        'config/prompts',
        'data/raw',
        'data/units',
        'data/reports',
        'state/checkpoints/sync',
        'state/checkpoints/summarize',
        'state/discovery',
        'secrets',
        'logs'
      ];

      // Create directories
      console.log(chalk.blue('Creating directory structure...'));
      for (const dir of directories) {
        const dirPath = path.join(baseDir, dir);
        await fs.ensureDir(dirPath);
        logger.debug(`Created directory: ${dir}`);
      }

      // Create config files
      const configManager = new ConfigManager(baseDir);
      
      // Check if config exists
      const configPath = path.join(baseDir, 'config', 'config.json');
      const configExists = await fs.pathExists(configPath);
      
      if (!configExists || force) {
        console.log(chalk.blue('Creating default configuration...'));
        await configManager.createDefaultConfig();
        logger.info('Created config/config.json');
        
        // Add example .env file
        const envExample = `# Telegram API credentials (get from https://my.telegram.org)
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# LLM API keys
OPENAI_API_KEY=your_openai_api_key

# Optional: Azure OpenAI
# AZURE_OPENAI_API_KEY=your_azure_key
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# Optional: Local Ollama
# OLLAMA_BASE_URL=http://localhost:11434

# Logging
LOG_LEVEL=info
`;
        
        const envPath = path.join(baseDir, '.env.example');
        await fs.writeFile(envPath, envExample);
        logger.info('Created .env.example');
      } else {
        console.log(chalk.yellow('Config already exists, skipping...'));
      }

      // Create team config
      const teamConfigPath = path.join(baseDir, 'config', 'team.json');
      const teamConfigExists = await fs.pathExists(teamConfigPath);
      
      if (!teamConfigExists || force) {
        await configManager.createDefaultTeamConfig();
        logger.info('Created config/team.json');
      }

      // Create default prompts
      await createDefaultPrompts(baseDir, force);

      // Create .gitignore
      const gitignorePath = path.join(baseDir, '.gitignore');
      const gitignoreExists = await fs.pathExists(gitignorePath);
      
      if (!gitignoreExists || force) {
        const gitignoreContent = `# Dependencies
node_modules/

# Build output
dist/
*.js
*.js.map
*.d.ts

# Secrets and sessions
secrets/
.env
.env.local
*.session

# Data files
data/
state/
logs/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test coverage
coverage/
.nyc_output/
`;
        
        await fs.writeFile(gitignorePath, gitignoreContent);
        logger.info('Created .gitignore');
      }

      // Create state files
      const knownChatsPath = path.join(baseDir, 'state', 'known_chats.json');
      if (!await fs.pathExists(knownChatsPath)) {
        await fs.writeJson(knownChatsPath, { chats: [], lastUpdated: new Date().toISOString() });
      }

      console.log(chalk.green('✓ Initialization complete!'));
      console.log('\nNext steps:');
      console.log(chalk.cyan('1. Copy .env.example to .env and fill in your credentials'));
      console.log(chalk.cyan('2. Update config/config.json with your Telegram API credentials'));
      console.log(chalk.cyan('3. Run: fbtrack login'));
      
    } catch (error: any) {
      logger.error('Init command failed', error);
      console.error(chalk.red('Initialization failed:'), error.message);
      process.exit(1);
    }
  });

async function createDefaultPrompts(baseDir: string, force: boolean) {
  const promptsDir = path.join(baseDir, 'config', 'prompts');
  
  // Default summarization prompt
  const summarizePrompt = `You are a product feedback analyst. Extract Q&A, bug reports, and feature suggestions from the conversation transcript.

Instructions:
1. Identify distinct feedback units (bugs, feature requests, questions, general feedback)
2. For each unit, provide a clear title and summary
3. Include evidence (message IDs) that support each unit
4. Always preserve origin information (chat, author, timestamps)
5. Assess severity for bugs (low/medium/high/critical)
6. Suggest priority for features (p0/p1/p2/p3)

Return ONLY valid JSON matching this schema:

{
  "units": [
    {
      "type": "bug_report|feature_request|question|feedback",
      "title": "Short descriptive title",
      "summary": "Detailed description of the issue or request",
      "evidence": [messageId1, messageId2],
      "severity": "low|medium|high|critical",
      "priority": "p0|p1|p2|p3",
      "tags": ["category1", "category2"]
    }
  ]
}

Context:
Chat: {{chatTitle}} (ID: {{chatId}})
Time Range: {{startTime}} to {{endTime}}
Messages: {{messageCount}}

Transcript:
{{transcript}}`;

  const promptPath = path.join(promptsDir, 'summarize_v1.txt');
  if (!await fs.pathExists(promptPath) || force) {
    await fs.writeFile(promptPath, summarizePrompt);
    logger.info('Created default summarization prompt');
  }

  // Classification prompt for determining feedback type
  const classifyPrompt = `Classify the following message into one of these categories:
- bug_report: User reporting a problem or error
- feature_request: User requesting new functionality
- question: User asking for help or clarification
- feedback: General feedback or opinion
- none: Not feedback-related

Message:
{{message}}

Return only the category name.`;

  const classifyPath = path.join(promptsDir, 'classify_v1.txt');
  if (!await fs.pathExists(classifyPath) || force) {
    await fs.writeFile(classifyPath, classifyPrompt);
    logger.info('Created classification prompt');
  }
}