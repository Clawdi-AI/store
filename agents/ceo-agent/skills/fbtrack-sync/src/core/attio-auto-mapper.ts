import { OpenAI } from 'openai';
import { AttioCompany, AttioDeal, AttioSyncService } from './attio-sync.js';
import { ChatMapping } from './attio-bridge.js';
import { logger } from '../lib/logger.js';
import fs from 'fs-extra';
import path from 'path';

export interface TelegramChat {
  chatId: string;
  chatTitle: string;
  category: string;
  memberCount?: number;
}

export interface MappingSuggestion {
  telegramChat: TelegramChat;
  attioCompany: AttioCompany;
  attioDeal: AttioDeal | null;
  confidence: number;
  reasoning: string;
  matchType: 'exact' | 'fuzzy' | 'keyword' | 'manual';
}

export interface AutoMapperConfig {
  openaiApiKey: string;
  model?: string;
  temperature?: number;
  maxSuggestions?: number;
  confidenceThreshold?: number;
}

export class AttioAutoMapper {
  private openai: OpenAI;
  private attioSync: AttioSyncService;
  private baseDir: string;
  private config: AutoMapperConfig;
  private suggestionsFile: string;

  constructor(attioSync: AttioSyncService, config: AutoMapperConfig, _baseDir: string = process.cwd()) {
    this.attioSync = attioSync;
    this.baseDir = _baseDir;
    this.config = {
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxSuggestions: 100,
      confidenceThreshold: 0.6,
      ...config
    };
    
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    this.suggestionsFile = path.join(this.baseDir, 'data', 'attio', 'mapping-suggestions.json');
  }

  async generateMappingSuggestions(telegramChats: TelegramChat[]): Promise<MappingSuggestion[]> {
    logger.info(`Generating mapping suggestions for ${telegramChats.length} Telegram chats`);
    
    // Get Attio companies with deals
    const attioCompanies = await this.attioSync.getCompaniesWithDeals();
    const attioDeals = await this.attioSync.getDeals();
    
    logger.info(`Found ${attioCompanies.length} companies with ${attioDeals.length} deals in Attio`);
    
    const suggestions: MappingSuggestion[] = [];
    
    // Process each Telegram chat
    for (const chat of telegramChats) {
      try {
        const chatSuggestions = await this.findMatchingCompanies(chat, attioCompanies, attioDeals);
        suggestions.push(...chatSuggestions);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Error processing chat ${chat.chatId}`, error);
      }
    }
    
    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    // Save suggestions
    await this.saveSuggestions(suggestions);
    
    logger.info(`Generated ${suggestions.length} mapping suggestions`);
    return suggestions;
  }

  private async findMatchingCompanies(
    chat: TelegramChat, 
    companies: AttioCompany[], 
    deals: AttioDeal[]
  ): Promise<MappingSuggestion[]> {
    const suggestions: MappingSuggestion[] = [];
    
    // 1. Exact name matching
    const exactMatches = this.findExactMatches(chat, companies);
    for (const company of exactMatches) {
      const primaryDeal = this.findPrimaryDeal(company, deals);
      suggestions.push({
        telegramChat: chat,
        attioCompany: company,
        attioDeal: primaryDeal,
        confidence: 0.95,
        reasoning: `Exact name match found in chat title`,
        matchType: 'exact'
      });
    }
    
    // 2. Fuzzy matching using AI
    if (exactMatches.length === 0) {
      const aiMatches = await this.findAIMatches(chat, companies, deals);
      suggestions.push(...aiMatches);
    }
    
    return suggestions.filter(s => s.confidence >= (this.config.confidenceThreshold || 0.6));
  }

  private findExactMatches(chat: TelegramChat, companies: AttioCompany[]): AttioCompany[] {
    const chatTitle = chat.chatTitle.toLowerCase();
    const matches: AttioCompany[] = [];
    
    for (const company of companies) {
      const companyName = company.name.toLowerCase();
      
      // Check if company name appears in chat title
      if (chatTitle.includes(companyName) || companyName.includes(this.extractCompanyFromTitle(chatTitle))) {
        matches.push(company);
      }
      
      // Check domain matching
      if (company.domains?.length) {
        for (const domain of company.domains) {
          const cleanDomain = domain.toLowerCase().replace(/\.(com|io|org|net)$/, '');
          if (chatTitle.includes(cleanDomain)) {
            matches.push(company);
            break;
          }
        }
      }
    }
    
    return matches;
  }

  private extractCompanyFromTitle(chatTitle: string): string {
    // Extract company name from patterns like "YourOrg <> CompanyName" or "CompanyName | YourOrg"
    const patterns = [
      /.*?[<>|]\s*([^<>|]+)/i,
      /([^<>|]+)\s*[<>|]/i,
      /([a-zA-Z0-9]+)\s*[<>]/i
    ];
    
    for (const pattern of patterns) {
      const match = chatTitle.match(pattern);
      if (match && match[1]) {
        return match[1].trim().toLowerCase();
      }
    }
    
    return '';
  }

  private async findAIMatches(
    chat: TelegramChat, 
    companies: AttioCompany[], 
    deals: AttioDeal[]
  ): Promise<MappingSuggestion[]> {
    try {
      const prompt = this.buildMatchingPrompt(chat, companies);
      
      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'system',
            content: `You are an expert at matching Telegram chat names with company names. 
            Analyze the chat title and find the most likely company matches from the provided list.
            Consider:
            - Company names that appear in the chat title
            - Common abbreviations and variations
            - Partnership/collaboration indicators
            - Industry context
            
            Return matches as JSON array with confidence scores (0.0 to 1.0).`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"matches": []}');
      const suggestions: MappingSuggestion[] = [];

      for (const match of result.matches || []) {
        const company = companies.find(c => c.id === match.companyId);
        if (company && match.confidence >= (this.config.confidenceThreshold || 0.6)) {
          const primaryDeal = this.findPrimaryDeal(company, deals);
          
          suggestions.push({
            telegramChat: chat,
            attioCompany: company,
            attioDeal: primaryDeal,
            confidence: match.confidence,
            reasoning: match.reasoning || 'AI-powered fuzzy matching',
            matchType: 'fuzzy'
          });
        }
      }

      return suggestions;
    } catch (error) {
      logger.error('AI matching failed', error);
      return [];
    }
  }

  private buildMatchingPrompt(chat: TelegramChat, companies: AttioCompany[]): string {
    const companiesList = companies.slice(0, 50).map(c => ({
      id: c.id,
      name: c.name,
      domains: c.domains,
      categories: c.categories,
      dealCount: c.dealCount
    }));

    return `Chat to match:
Title: "${chat.chatTitle}"
Category: ${chat.category}

Available companies (showing top 50 by deal count):
${JSON.stringify(companiesList, null, 2)}

Find the most likely company matches for this Telegram chat. Return JSON:
{
  "matches": [
    {
      "companyId": "company_id_here",
      "confidence": 0.85,
      "reasoning": "Company name 'Example Corp' appears in chat title 'MyOrg <> Example Corp'"
    }
  ]
}

Only include matches with confidence > 0.6. Maximum 3 matches per chat.`;
  }

  private findPrimaryDeal(company: AttioCompany, deals: AttioDeal[]): AttioDeal | null {
    const companyDeals = deals.filter(d => d.associated_company_id === company.id);
    
    if (companyDeals.length === 0) return null;
    
    // Prefer active deals, then by value, then by recency
    const sortedDeals = companyDeals.sort((a, b) => {
      // Sort by stage (non-null stages first)
      if (a.stage && !b.stage) return -1;
      if (b.stage && !a.stage) return 1;
      
      // Higher value deals
      const aValue = a.value?.amount || 0;
      const bValue = b.value?.amount || 0;
      if (aValue !== bValue) return bValue - aValue;
      
      // More recent activity
      const aActivity = a.lastUpdated || '';
      const bActivity = b.lastUpdated || '';
      return bActivity.localeCompare(aActivity);
    });
    
    return sortedDeals[0];
  }

  private async saveSuggestions(suggestions: MappingSuggestion[]): Promise<void> {
    await fs.ensureDir(path.dirname(this.suggestionsFile));
    await fs.writeJson(this.suggestionsFile, {
      generatedAt: new Date().toISOString(),
      totalSuggestions: suggestions.length,
      suggestions: suggestions
    }, { spaces: 2 });
  }

  async loadSuggestions(): Promise<MappingSuggestion[]> {
    try {
      if (await fs.pathExists(this.suggestionsFile)) {
        const data = await fs.readJson(this.suggestionsFile);
        return data.suggestions || [];
      }
    } catch (error) {
      logger.error('Failed to load suggestions', error);
    }
    return [];
  }

  async approveSuggestion(suggestion: MappingSuggestion): Promise<ChatMapping> {
    // Convert suggestion to mapping format
    const mapping: ChatMapping = {
      telegramChatId: suggestion.telegramChat.chatId,
      telegramChatTitle: suggestion.telegramChat.chatTitle,
      attioCompanyId: suggestion.attioCompany.id,
      attioCompanyName: suggestion.attioCompany.name,
      attioDealId: suggestion.attioDeal?.id || `no_deal_${suggestion.attioCompany.id}`,
      category: suggestion.telegramChat.category,
      autoUpdate: false, // Start disabled
      updateRules: {
        requiresTeamConfirmation: true,
        teamMembers: ['@marvin', '@hang'],
        statusKeywords: this.getDefaultKeywords(suggestion.telegramChat.category)
      }
    };

    return mapping;
  }

  private getDefaultKeywords(category: string): Record<string, string[]> {
    switch (category) {
      case 'fund':
        return {
          due_diligence: ['DD', 'due diligence', 'reviewing', 'analyzing'],
          term_sheet: ['term sheet', 'valuation', 'investment terms'],
          closing: ['closing', 'wire transfer', 'SAFT'],
          portfolio: ['invested', 'portfolio company'],
          passed: ['passed', 'declined']
        };
      
      default: // partner, etc.
        return {
          initial_contact: ['intro', 'introduction', 'exploring'],
          negotiation: ['proposal', 'discussing terms', 'negotiating'],
          active: ['signed', 'confirmed', 'launched', 'live'],
          completed: ['finished', 'delivered', 'completed'],
          on_hold: ['paused', 'blocked', 'waiting for']
        };
    }
  }

  async generateReport(): Promise<string> {
    const suggestions = await this.loadSuggestions();
    
    const report = [
      '# Attio-Telegram Auto-Mapping Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      `## Summary`,
      `- Total suggestions: ${suggestions.length}`,
      `- High confidence (>0.8): ${suggestions.filter(s => s.confidence > 0.8).length}`,
      `- Medium confidence (0.6-0.8): ${suggestions.filter(s => s.confidence >= 0.6 && s.confidence <= 0.8).length}`,
      '',
      '## Top Suggestions',
      ''
    ];

    // Group by confidence level
    const highConf = suggestions.filter(s => s.confidence > 0.8).slice(0, 20);
    const medConf = suggestions.filter(s => s.confidence >= 0.6 && s.confidence <= 0.8).slice(0, 10);

    report.push('### High Confidence Matches (>0.8)');
    for (const s of highConf) {
      report.push(`- **${s.telegramChat.chatTitle}** → **${s.attioCompany.name}** (${(s.confidence * 100).toFixed(0)}%)`);
      report.push(`  - Deal: ${s.attioDeal?.name || 'No primary deal'}`);
      report.push(`  - Reason: ${s.reasoning}`);
      report.push('');
    }

    report.push('### Medium Confidence Matches (0.6-0.8)');
    for (const s of medConf) {
      report.push(`- **${s.telegramChat.chatTitle}** → **${s.attioCompany.name}** (${(s.confidence * 100).toFixed(0)}%)`);
      report.push(`  - Reason: ${s.reasoning}`);
      report.push('');
    }

    return report.join('\n');
  }
}