import OpenAI from 'openai';

export interface AgentConfig {
  model: string;
  baseURL?: string;
  apiKey: string;
  maxTokens?: number;
}

export abstract class AIAgent {
  protected openai: OpenAI;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  abstract getAgentType(): string;
  abstract getVersion(): string;

  // Simple token estimation (4 chars per token)
  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Format transcript with chat name header
  protected formatTranscriptWithHeader(messages: any[]): string {
    if (messages.length === 0) return '';
    
    // Get chat name from the first message
    const chatName = messages[0].chatTitle || 'Unknown Chat';
    const header = `Chat Name: ${chatName}\n\n`;
    
    const transcript = messages.map(msg => {
      const id = msg.messageId || msg.id;
      const timestamp = msg.dateISO || msg.timestamp;
      const author = msg.fromUsername || msg.author || 'unknown';
      const text = msg.text || msg.message || '';
      const replyInfo = msg.replyToMessageId ? ` (replying to #${msg.replyToMessageId})` : '';
      
      // Remove @ if already present to avoid @@username
      const cleanAuthor = author.startsWith('@') ? author.slice(1) : author;
      
      return `[#${id}] ${timestamp} @${cleanAuthor}${replyInfo}: ${text}`;
    }).join('\n');
    
    return header + transcript;
  }

  // Process messages with OpenAI
  protected async callOpenAI(prompt: string): Promise<{ result: any, usage: any }> {
    // Only use response_format for OpenAI API (not compatible with all providers)
    const isOpenAI = !this.config.baseURL || this.config.baseURL.includes('openai.com');

    const requestConfig: any = {
      model: this.config.model,
      messages: [
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: this.config.maxTokens || 12000,
      temperature: 0.1,
    };

    if (isOpenAI) {
      requestConfig.response_format = { type: 'json_object' as const };
    }
    
    // Debug logging for API requests
    if (process.env.DEBUG_API_CALLS === 'true') {
      console.log('  API Request Config:', {
        model: requestConfig.model,
        baseURL: this.openai.baseURL,
        promptLength: prompt.length,
        maxTokens: requestConfig.max_tokens,
        temperature: requestConfig.temperature,
        responseFormat: requestConfig.response_format
      });
      console.log('  Prompt preview:', prompt.substring(0, 200) + '...');
    }
    
    const response = await this.openai.chat.completions.create(requestConfig);

    let content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content received');
    }

    // Strip markdown code fences if present (common with non-OpenAI providers)
    content = content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    return {
      result: JSON.parse(content),
      usage: response.usage
    };
  }
}

export const DEFAULT_CONFIG: Partial<AgentConfig> = {
  model: 'gpt-4o-mini',
  baseURL: 'https://api.openai.com/v1',
  maxTokens: 12000,
};