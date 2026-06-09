import { AttioClient, AttioUpdatePayload } from '../services/attio.js';
import { logger } from '../lib/logger.js';
import { RawMessage } from '../types/message.js';
import fs from 'fs-extra';
import path from 'path';

export interface ChatMapping {
  telegramChatId: string;
  telegramChatTitle: string;
  attioCompanyId: string;
  attioCompanyName: string;
  attioDealId: string;
  category: string;
  autoUpdate: boolean;
  updateRules: {
    requiresTeamConfirmation: boolean;
    teamMembers: string[];
    statusKeywords: Record<string, string[]>;
  };
}

export interface StatusDetectionResult {
  detected: boolean;
  newStatus?: string;
  confidence: number;
  matchedKeywords: string[];
  requiresConfirmation: boolean;
}

export class AttioBridge {
  private attioClient: AttioClient | null = null;
  private mappings: ChatMapping[] = [];
  private mappingFile: string;
  private auditLogFile: string;
  constructor(baseDir: string = process.cwd()) {
    this.mappingFile = path.join(baseDir, 'config', 'attio-mappings.json');
    this.auditLogFile = path.join(baseDir, 'logs', 'attio-updates.jsonl');
  }

  async initialize(): Promise<void> {
    const apiKey = process.env.ATTIO_API_KEY;
    if (!apiKey) {
      logger.warn('ATTIO_API_KEY not set, Attio integration disabled');
      return;
    }

    this.attioClient = new AttioClient({ 
      apiKey,
      baseUrl: process.env.ATTIO_BASE_URL 
    });

    // Load mappings
    await this.loadMappings();
    
    // Test Attio connection
    const connected = await this.attioClient.testConnection();
    if (!connected) {
      logger.error('Failed to connect to Attio API');
      this.attioClient = null;
      return;
    }
    
    // Ensure audit log directory exists
    await fs.ensureDir(path.dirname(this.auditLogFile));
    
    logger.info('Attio bridge initialized', {
      mappingCount: this.mappings.length,
    });
  }

  isEnabled(): boolean {
    return this.attioClient !== null;
  }

  private async loadMappings(): Promise<void> {
    if (await fs.pathExists(this.mappingFile)) {
      const data = await fs.readJson(this.mappingFile);
      this.mappings = data.mappings || [];
      logger.info(`Loaded ${this.mappings.length} Attio chat mappings`);
    } else {
      logger.debug('No Attio mapping file found');
      this.mappings = [];
    }
  }

  private async saveMappings(): Promise<void> {
    await fs.ensureDir(path.dirname(this.mappingFile));
    await fs.writeJson(this.mappingFile, { mappings: this.mappings }, { spaces: 2 });
  }

  async addMapping(mapping: ChatMapping): Promise<void> {
    const existingIndex = this.mappings.findIndex(
      m => m.telegramChatId === mapping.telegramChatId
    );
    
    if (existingIndex >= 0) {
      this.mappings[existingIndex] = mapping;
      logger.info(`Updated Attio mapping for chat ${mapping.telegramChatId}`);
    } else {
      this.mappings.push(mapping);
      logger.info(`Added new Attio mapping for chat ${mapping.telegramChatId}`);
    }
    
    await this.saveMappings();
  }

  detectStatusChange(
    message: RawMessage,
    keywords: Record<string, string[]>
  ): StatusDetectionResult {
    const text = (message.text || '').toLowerCase();
    
    for (const [status, words] of Object.entries(keywords)) {
      const matchedKeywords = words.filter(word => 
        text.includes(word.toLowerCase())
      );
      
      if (matchedKeywords.length > 0) {
        return {
          detected: true,
          newStatus: status,
          confidence: Math.min(matchedKeywords.length * 0.3, 1.0),
          matchedKeywords,
          requiresConfirmation: matchedKeywords.length === 1,
        };
      }
    }
    
    return {
      detected: false,
      confidence: 0,
      matchedKeywords: [],
      requiresConfirmation: false,
    };
  }

  async processMessage(message: RawMessage): Promise<void> {
    if (!this.isEnabled()) return;

    const mapping = this.mappings.find(
      m => m.telegramChatId === message.chatId
    );

    if (!mapping || !mapping.autoUpdate) {
      return;
    }

    // Always update telegram interaction timestamp for any message
    await this.updateTelegramInteraction(mapping, message);

    const detection = this.detectStatusChange(
      message,
      mapping.updateRules.statusKeywords
    );

    if (!detection.detected) {
      return;
    }

    // Check if team confirmation is required
    const isFromTeam = mapping.updateRules.teamMembers.some(
      member => message.fromUsername === member
    );

    if (mapping.updateRules.requiresTeamConfirmation && !isFromTeam) {
      logger.info('Attio status change detected but requires team confirmation', {
        chatId: message.chatId,
        newStatus: detection.newStatus,
        fromUser: message.fromUsername,
      });

      await this.logUpdate({
        action: 'status_change_pending',
        chatId: message.chatId,
        dealId: mapping.attioDealId,
        newStatus: detection.newStatus,
        requiresConfirmation: true,
        message: message.text,
        timestamp: message.dateISO,
      });

      return;
    }

    await this.updateDealStatus(
      mapping.attioDealId,
      detection.newStatus!,
      message,
      mapping
    );
  }

  private async updateTelegramInteraction(
    mapping: ChatMapping,
    message: RawMessage
  ): Promise<void> {
    if (!this.attioClient) return;

    try {
      // Skip if company ID is still a placeholder
      if (mapping.attioCompanyId.startsWith('pending_')) {
        return;
      }

      // Update company with telegram interaction timestamp
      await this.attioClient.updateCompany(mapping.attioCompanyId, {
        telegram_interaction: message.dateISO
      });

      logger.info('Updated telegram interaction timestamp', {
        companyId: mapping.attioCompanyId,
        chatId: mapping.telegramChatId,
        timestamp: message.dateISO,
      });

    } catch (error) {
      logger.error('Failed to update telegram interaction', {
        companyId: mapping.attioCompanyId,
        chatId: mapping.telegramChatId,
        error,
      });
    }
  }

  private async updateDealStatus(
    dealId: string,
    newStatus: string,
    message: RawMessage,
    _mapping: ChatMapping
  ): Promise<void> {
    if (!this.attioClient) return;

    try {
      const updates: AttioUpdatePayload = {
        stage: newStatus,
        telegram: `Updated from Telegram chat ${message.chatId}: ${(message.text || '').substring(0, 500)}`
      };
      
      const updatedDeal = await this.attioClient.updateDeal(dealId, updates);
      
      logger.info('Successfully updated Attio deal', {
        dealId,
        newStatus,
        chatId: message.chatId,
      });
      
      await this.logUpdate({
        action: 'deal_updated',
        chatId: message.chatId,
        dealId,
        oldStatus: updatedDeal.stage,
        newStatus,
        message: message.text,
        timestamp: message.dateISO,
        success: true,
      });
    } catch (error) {
      logger.error('Failed to update Attio deal', {
        dealId,
        error,
      });
      
      await this.logUpdate({
        action: 'deal_update_failed',
        chatId: message.chatId,
        dealId,
        newStatus,
        message: message.text,
        timestamp: message.dateISO,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async logUpdate(data: any): Promise<void> {
    const logEntry = {
      ...data,
      loggedAt: new Date().toISOString(),
    };
    
    await fs.appendFile(
      this.auditLogFile,
      JSON.stringify(logEntry) + '\n'
    );
  }

  async processBatch(messages: RawMessage[]): Promise<void> {
    if (!this.isEnabled()) return;

    logger.info(`Processing ${messages.length} messages for Attio updates`);
    
    for (const message of messages) {
      try {
        await this.processMessage(message);
      } catch (error) {
        logger.error('Error processing message for Attio', {
          chatId: message.chatId,
          messageId: message.messageId,
          error,
        });
      }
    }
  }

  getMappings(): ChatMapping[] {
    return this.mappings;
  }

  getMapping(chatId: string): ChatMapping | undefined {
    return this.mappings.find(m => m.telegramChatId === chatId);
  }

  async removeMapping(chatId: string): Promise<void> {
    this.mappings = this.mappings.filter(m => m.telegramChatId !== chatId);
    await this.saveMappings();
  }

  async toggleAutoUpdate(chatId: string, enabled: boolean): Promise<void> {
    const mapping = this.getMapping(chatId);
    if (mapping) {
      mapping.autoUpdate = enabled;
      await this.saveMappings();
    }
  }

  async importFromCategorizedChats(filePath: string): Promise<number> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let imported = 0;
    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const [chatId, chatTitle, , , category] = line.split(',');
      
      if (category === 'tracked' || category === 'partner') {
        // Extract company name from chat title
        const companyName = chatTitle.split('<>')[1]?.trim() || 
                           chatTitle.split('|')[1]?.trim() || 
                           chatTitle;
        
        const mapping: ChatMapping = {
          telegramChatId: chatId,
          telegramChatTitle: chatTitle,
          attioCompanyId: `pending_${chatId}`,
          attioCompanyName: companyName,
          attioDealId: `pending_deal_${chatId}`,
          category: category,
          autoUpdate: false,
          updateRules: {
            requiresTeamConfirmation: true,
            teamMembers: [],
            statusKeywords: category === 'fund' ? {
              due_diligence: ['DD', 'reviewing', 'analyzing'],
              term_sheet: ['term sheet', 'valuation'],
              closing: ['closing', 'wire', 'transfer'],
              portfolio: ['invested', 'portfolio'],
              passed: ['passed', 'declined']
            } : {
              initial_contact: ['intro', 'exploring'],
              negotiation: ['proposal', 'terms'],
              active: ['signed', 'live'],
              completed: ['finished'],
              on_hold: ['paused']
            }
          }
        };
        
        await this.addMapping(mapping);
        imported++;
      }
    }
    
    return imported;
  }
}