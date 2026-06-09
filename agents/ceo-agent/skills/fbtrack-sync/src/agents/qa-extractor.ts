import fs from 'fs-extra';
import path from 'path';
import { AIAgent } from '../lib/ai-agent.js';

export class QAExtractorAgent extends AIAgent {
  private teamMembers: string[] = [];
  private promptTemplate: string = '';

  constructor(config: any, baseDir: string) {
    super(config);
    this.loadConfigSync(baseDir);
  }

  getAgentType(): string {
    return 'qa-extractor';
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
      path.join(baseDir, 'experiments/prompts/qa-extractor.txt'), 
      'utf8'
    );
  }

  async extractQA(messages: any[]): Promise<{ results: any[], stats: any }> {
    // Group messages into conversations (existing logic from experimental script)
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
        const qaPairs = result.qa_pairs || [];
        
        // Debug logging
        if (process.env.DEBUG_EXTRACTION === 'true') {
          console.log('  Transcript preview:', transcript.substring(0, 200));
          console.log('  Response QA pairs:', qaPairs.length);
          if (qaPairs.length === 0) {
            console.log('  Raw result:', JSON.stringify(result));
          }
        }
        
        // Transform to standardized format
        const standardizedPairs = qaPairs.map((qa: any) => {
          // Extract message IDs from the original format, with fallback to batch messages
          const messageIds: number[] = [];
          if (qa.problem?.messageIds) messageIds.push(...qa.problem.messageIds);
          if (qa.solution?.messageIds) messageIds.push(...qa.solution.messageIds);
          
          // If no message IDs from AI response, use all batch message IDs as fallback
          if (messageIds.length === 0) {
            messageIds.push(...batchMessages.map(msg => msg.messageId));
          }
          
          // Extract participants with fallback to batch message authors
          const participants: string[] = [];
          if (qa.problem?.authors) participants.push(...qa.problem.authors);
          if (qa.solution?.contributors) {
            participants.push(...Object.keys(qa.solution.contributors));
          }
          
          // If no participants from AI response, extract from batch messages
          if (participants.length === 0) {
            const batchParticipants = [...new Set(batchMessages.map(msg => msg.fromUsername).filter(Boolean))];
            participants.push(...batchParticipants);
          }
          
          // Extract timestamp range with fallback to batch message timestamps
          const startTime = qa.problem?.timestamp || batchMessages[0]?.dateISO || new Date().toISOString();
          const endTime = qa.solution?.timestamp_range?.split(' to ')[1] || 
                         batchMessages[batchMessages.length - 1]?.dateISO || startTime;
          
          return {
            message_context: {
              messageIds: [...new Set(messageIds)].sort((a, b) => a - b),
              participants: [...new Set(participants)],
              timestamp_range: `${startTime} to ${endTime}`,
              chatId: batchMessages[0]?.chatId,
              chatTitle: batchMessages[0]?.chatTitle
            },
            extraction_metadata: {
              agent_type: this.getAgentType(),
              agent_version: this.getVersion(),
              extracted_at: new Date().toISOString(),
              confidence_score: 0.9
            },
            content: {
              problem: qa.problem,
              solution: qa.solution
            },
            // Backward compatibility
            chatId: batchMessages[0]?.chatId,
            chatTitle: batchMessages[0]?.chatTitle,
            ...qa // Include original fields for backward compatibility
          };
        });
        
        allResults.push(...standardizedPairs);
        
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