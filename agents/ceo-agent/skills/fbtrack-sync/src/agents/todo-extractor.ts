import fs from 'fs-extra';
import path from 'path';
import { AIAgent } from '../lib/ai-agent.js';

export class TodoExtractorAgent extends AIAgent {
  private teamMembers: string[] = [];
  private promptTemplate: string = '';

  constructor(config: any, baseDir: string) {
    super(config);
    this.loadConfigSync(baseDir);
  }

  getAgentType(): string {
    return 'todo-extractor';
  }

  getVersion(): string {
    return '1.0.0';
  }

  private loadConfigSync(baseDir: string): void {
    // Load team members
    const teamConfig = fs.readJsonSync(path.join(baseDir, 'config/team.json'));
    this.teamMembers = teamConfig.teamUsernames || [];

    // Load prompt template
    this.promptTemplate = fs.readFileSync(
      path.join(baseDir, 'experiments/prompts/todo-extractor.txt'), 
      'utf8'
    );
  }

  async extractTodos(messages: any[]): Promise<{ results: any[], stats: any }> {
    // Group messages into conversations
    const conversations = this.groupConversations(messages);
    
    // Create token-based batches
    const batches = this.createTokenBatches(conversations);
    
    const allResults: any[] = [];
    const stats = {
      totalBatches: batches.length,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0
    };

    for (let i = 0; i < batches.length; i++) {
      console.log(`Processing batch ${i + 1}/${batches.length}`);
      
      const batchMessages = batches[i].flat();
      const transcript = this.formatTranscriptWithHeader(batchMessages);
      
      const prompt = this.promptTemplate
        .replace('{{TEAM_MEMBERS}}', this.teamMembers.join(', '))
        .replace('{{TRANSCRIPT}}', transcript);

      try {
        const { result, usage } = await this.callOpenAI(prompt);
        const todoItems = result.todo_items || [];
        
        // Debug logging
        if (process.env.DEBUG_EXTRACTION === 'true') {
          console.log('  Transcript preview:', transcript.substring(0, 200));
          console.log('  Response TODO items:', todoItems.length);
          if (todoItems.length === 0) {
            console.log('  Raw result:', JSON.stringify(result));
          }
        }
        
        // Add chat metadata to each TODO item
        todoItems.forEach((todo: any) => {
          todo.chatId = batchMessages[0]?.chatId;
          todo.chatTitle = batchMessages[0]?.chatTitle;
        });
        
        allResults.push(...todoItems);
        
        // Update token stats
        if (usage) {
          stats.inputTokens += usage.prompt_tokens || 0;
          stats.outputTokens += usage.completion_tokens || 0;
          stats.totalTokens += usage.total_tokens || 0;
        }
        
        // Rate limiting between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error processing batch ${i + 1}:`, error);
      }
    }

    // Calculate estimated cost using configured pricing or defaults
    const inputPrice = parseFloat(process.env.OPENAI_INPUT_PRICE || '0.15');  // per 1M tokens
    const outputPrice = parseFloat(process.env.OPENAI_OUTPUT_PRICE || '0.60'); // per 1M tokens
    
    stats.estimatedCost = (stats.inputTokens * inputPrice / 1_000_000) + 
                          (stats.outputTokens * outputPrice / 1_000_000);

    return { results: allResults, stats };
  }

  private groupConversations(messages: any[], windowMinutes: number = 30): any[][] {
    if (messages.length === 0) return [];
    
    const conversations: any[][] = [];
    let currentConversation: any[] = [messages[0]];
    let lastTimestamp = new Date(messages[0].dateISO);
    
    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];
      const msgTime = new Date(msg.dateISO);
      const timeDiff = (msgTime.getTime() - lastTimestamp.getTime()) / (1000 * 60);
      
      if (timeDiff > windowMinutes && !msg.replyToMessageId) {
        conversations.push(currentConversation);
        currentConversation = [msg];
      } else {
        currentConversation.push(msg);
      }
      
      lastTimestamp = msgTime;
    }
    
    if (currentConversation.length > 0) {
      conversations.push(currentConversation);
    }
    
    return conversations;
  }

  private createTokenBatches(conversations: any[][], maxTokens: number = 12000): any[][][] {
    const batches: any[][][] = [];
    let currentBatch: any[][] = [];
    let currentTokens = 0;
    
    for (const conversation of conversations) {
      const conversationText = conversation.map(m => `${m.text || m.message || ''}`).join(' ');
      const tokens = this.estimateTokens(conversationText);
      
      if (currentTokens + tokens > maxTokens && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [conversation];
        currentTokens = tokens;
      } else {
        currentBatch.push(conversation);
        currentTokens += tokens;
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    return batches;
  }

}