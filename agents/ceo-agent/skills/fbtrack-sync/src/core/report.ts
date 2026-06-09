import fs from 'fs-extra';
import path from 'path';
import { logger } from '../lib/logger.js';
import { Config } from '../types/config.js';
import { AgentRegistry } from '../lib/agent-registry.js';

interface ExtractedUnit {
  // Standardized format fields
  message_context?: {
    messageIds: number[];
    participants: string[];
    timestamp_range: string;
    chatId: string;
    chatTitle: string;
  };
  extraction_metadata?: {
    agent_type: string;
    agent_version: string;
    extracted_at: string;
    confidence_score?: number;
  };
  content?: any;
  
  // Old format fields
  problem?: {
    summary: string;
    details: string[];
    messageIds: number[];
    authors: string[];
    timestamp: string;
  };
  solution?: {
    summary: string;
    resolved: boolean;
    gaps_remaining: string[];
    contributors: { [username: string]: string };
    messageIds: number[];
    timestamp_range: string;
  };
  // Legacy format support
  question?: {
    summary: string;
    details: string[];
    messageIds: number[];
    authors: string[];
    timestamp: string;
  };
  answer?: {
    summary: string;
    resolved: boolean;
    gaps_remaining: string[];
    contributors: { [username: string]: string };
    messageIds: number[];
    timestamp_range: string;
  };
  // Sales fields (v2 format)
  insight_type?: string;
  deal_status?: string;
  business_summary?: string;
  customer_info?: {
    contact: string;
    company?: string;
    deal_stage?: string;
  };
  business_impact?: {
    opportunity_size?: string;
    timeline?: string;
    revenue_signals?: string[];
    decision_urgency?: string;
  };
  competitive_context?: {
    alternatives_mentioned?: string[];
    our_position?: string;
    differentiation_needed?: string[];
  };
  sales_actions?: {
    immediate_next_steps?: string[];
    follow_up_timeline?: string;
    escalation_needed?: boolean;
    recommended_resources?: string[];
  };
  conversation_context?: {
    messageIds: number[];
    participants?: string[];
    timestamp_range: string;
  };
  // Partnership-specific fields
  partnershipAnalyses?: any[];
  totalMessages?: number;
  weekOf?: string;
  activePartnerships?: number;
  // Common fields
  chatId: string;
  chatTitle: string;
}

export class ReportService {
  private config: Config;
  private baseDir: string;

  constructor(config: Config, baseDir: string = process.cwd()) {
    this.config = config;
    this.baseDir = baseDir;
  }

  async loadUnits(agentType: string, sinceDate?: Date): Promise<ExtractedUnit[]> {
    const unitsDir = path.join(this.baseDir, this.config.storage.dataDir, 'units');
    
    if (!await fs.pathExists(unitsDir)) {
      return [];
    }

    const files = await fs.readdir(unitsDir);
    const agentFiles = files.filter(file => file.endsWith(`_${agentType}.jsonl`));
    
    const allUnits: ExtractedUnit[] = [];
    
    for (const file of agentFiles) {
      const filePath = path.join(unitsDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const unit: ExtractedUnit = JSON.parse(line);
          
          // Validate unit structure based on agent type
          let isValid = false;
          let unitTimestamp: string | undefined;
          
          try {
            const handler = AgentRegistry.getHandler(agentType);
            isValid = handler.validateUnit(unit);
            
            if (isValid) {
              // Extract timestamp - all units now have standardized message_context
              if (unit.message_context?.timestamp_range) {
                unitTimestamp = unit.message_context.timestamp_range.split(' to ')[0];
              } else {
                // This should not happen with new agents, but kept as safety fallback
                console.warn('Unit missing message_context:', unit);
                if (agentType === 'qa-extractor') {
                  const content = unit.content || unit;
                  const problem = content.problem || content.question;
                  unitTimestamp = problem?.timestamp;
                } else if (agentType === 'sales-extractor') {
                  const content = unit.content || unit;
                  if (content.conversation_context?.timestamp_range) {
                    unitTimestamp = content.conversation_context.timestamp_range.split(' to ')[0];
                  }
                }
              }
            }
          } catch (error) {
            isValid = false;
          }
          
          if (!isValid) {
            logger.warn(`Invalid ${agentType} unit structure in ${file}`, { unit });
            continue;
          }
          
          // Normalize the unit format
          const normalizedUnit = this.normalizeUnit(unit, agentType);
          
          // Filter by date if specified
          if (sinceDate && unitTimestamp && new Date(unitTimestamp) < sinceDate) {
            continue;
          }
          
          allUnits.push(normalizedUnit);
        } catch (error) {
          logger.warn(`Failed to parse ${agentType} unit in ${file}`, { error, line });
        }
      }
    }

    // Sort by timestamp (newest first)
    allUnits.sort((a, b) => {
      const timeA = a.message_context?.timestamp_range 
        ? new Date(a.message_context.timestamp_range.split(' to ')[0]).getTime() 
        : 0;
      const timeB = b.message_context?.timestamp_range 
        ? new Date(b.message_context.timestamp_range.split(' to ')[0]).getTime() 
        : 0;
      
      return timeB - timeA;
    });

    return allUnits;
  }

  private normalizeUnit(unit: any, agentType: string): ExtractedUnit {
    // Handle weekly-partnership format which has a different structure
    if (agentType === 'weekly-partnership') {
      // Partnership units have weekOf, partnershipAnalyses, etc.
      const normalized = { ...unit };
      // Extract chatTitle from first partnership analysis if available
      if (unit.partnershipAnalyses?.[0]?.chatTitle) {
        normalized.chatTitle = unit.partnershipAnalyses[0].chatTitle;
      }
      return normalized;
    }

    // Only accept standardized format for other agents
    if (!unit.message_context || !unit.extraction_metadata) {
      throw new Error('Invalid unit format: missing message_context or extraction_metadata');
    }

    // Extract content from standardized format
    const content = unit.content || {};
    const normalized = { ...content, ...unit };

    // Ensure chat information is available
    normalized.chatId = unit.chatId || unit.message_context.chatId;
    normalized.chatTitle = unit.chatTitle || unit.message_context.chatTitle;

    return normalized;
  }

  async generateMarkdownReport(
    units: ExtractedUnit[],
    outputPath?: string,
    agentType: string = 'qa-extractor',
    weekInfo?: { start: Date, end: Date, weekNumber: string, year: number }
  ): Promise<string> {
    // Special handling for weekly-partnership - merge all units and generate custom report
    if (agentType === 'weekly-partnership') {
      return this.generatePartnershipReport(units, outputPath);
    }

    const dateRange = this.getDateRange(units);

    // Calculate statistics
    const stats = this.calculateStats(units, agentType);
    
    // Group by community/chat
    const groupedUnits = this.groupByCommunity(units);
    
    let markdown = '';

    // Header
    if (weekInfo) {
      const reportTitle = agentType === 'sales-extractor' ? 'Weekly Sales Insights Report' : 'Weekly Feedback Report';
      markdown += `# ${reportTitle}\n`;
      markdown += `**Week:** ${ReportService.formatWeekRange(weekInfo.start, weekInfo.end)} (${weekInfo.weekNumber})\n`;
      markdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    } else {
      const reportTitle = agentType === 'sales-extractor' ? 'Sales Insights Report' : 'Feedback Report';
      markdown += `# ${reportTitle}\n`;
      markdown += `**Generated:** ${new Date().toLocaleString()}\n`;
      markdown += `**Date Range:** ${dateRange}\n\n`;
    }
    
    // Executive Summary
    markdown += `## Executive Summary\n\n`;
    if (agentType === 'qa-extractor') {
      markdown += `- **Total Q&A Pairs:** ${stats.total}\n`;
      markdown += `- **Resolved:** ${stats.resolved} (${Math.round(stats.resolvedRate * 100)}%)\n`;
      markdown += `- **Unresolved:** ${stats.unresolved}\n`;
      markdown += `- **Unanswered:** ${stats.unanswered}\n`;
    } else if (agentType === 'sales-extractor') {
      markdown += `- **Total Sales Insights:** ${stats.total}\n`;
      markdown += `- **Lead Qualification:** ${stats.leadQualification}\n`;
      markdown += `- **Opportunity Development:** ${stats.opportunityDevelopment}\n`;
      markdown += `- **Competitive Intelligence:** ${stats.competitiveIntelligence}\n`;
      markdown += `- **Customer Expansion:** ${stats.customerExpansion}\n`;
    } else {
      markdown += `- **Total Units:** ${stats.total}\n`;
    }
    markdown += `- **Active Communities:** ${stats.activeCommunities}\n\n`;
    
    // Units by Community
    for (const [community, communityUnits] of Object.entries(groupedUnits)) {
      if (communityUnits.length === 0) continue;
      
      markdown += `## ${community}\n`;
      
      if (agentType === 'qa-extractor') {
        const resolvedCount = communityUnits.filter(u => u.solution?.resolved).length;
        const unresolvedCount = communityUnits.length - resolvedCount;
        markdown += `*${communityUnits.length} Q&A pairs (${resolvedCount} resolved, ${unresolvedCount} unresolved)*\n\n`;
      } else if (agentType === 'sales-extractor') {
        const leadCount = communityUnits.filter(u => u.insight_type === 'lead_qualification').length;
        const oppCount = communityUnits.filter(u => u.insight_type === 'opportunity_development').length;
        markdown += `*${communityUnits.length} sales insights (${leadCount} leads, ${oppCount} opportunities)*\n\n`;
      } else {
        markdown += `*${communityUnits.length} units*\n\n`;
      }
      
      // Show all units for this community
      for (const unit of communityUnits) {
        markdown += this.formatUnit(unit, agentType);
        markdown += '\n---\n\n';
      }
    }
    
    // Community Insights
    markdown += `## Community Insights\n\n`;
    
    if (agentType === 'qa-extractor') {
      markdown += `### Top Contributors\n`;
      
      const contributorStats = this.getContributorStats(units);
      for (const [contributor, count] of contributorStats.slice(0, 5)) {
        markdown += `- **${contributor}**: ${count} answers\n`;
      }
      
      markdown += `\n### Most Active Communities\n`;
      const communityStats = this.getCommunityStats(units);
      for (const [community, count] of communityStats.slice(0, 5)) {
        markdown += `- **${community}**: ${count} Q&A pairs\n`;
      }
    } else if (agentType === 'sales-extractor') {
      markdown += `### Top Sales Opportunities\n`;
      const opportunityStats = this.getOpportunityStats(units);
      for (const [type, count] of opportunityStats.slice(0, 5)) {
        markdown += `- **${type}**: ${count} insights\n`;
      }
      
      markdown += `\n### Most Active Communities\n`;
      const communityStats = this.getCommunityStats(units);
      for (const [community, count] of communityStats.slice(0, 5)) {
        markdown += `- **${community}**: ${count} sales insights\n`;
      }
    }
    
    // Save to file if path provided
    if (outputPath) {
      const reportsDir = path.dirname(outputPath);
      await fs.ensureDir(reportsDir);
      await fs.writeFile(outputPath, markdown);
      logger.info(`Report saved to ${outputPath}`);
    }
    
    return markdown;
  }

  private async generatePartnershipReport(units: ExtractedUnit[], outputPath?: string): Promise<string> {
    // Merge all partnership analyses from all units
    const allPartnershipAnalyses: any[] = [];
    let totalMessages = 0;

    for (const unit of units) {
      if (unit.partnershipAnalyses && Array.isArray(unit.partnershipAnalyses)) {
        allPartnershipAnalyses.push(...unit.partnershipAnalyses);
      }
      if (unit.totalMessages) {
        totalMessages += unit.totalMessages;
      }
    }

    // Sort by tier and message count
    const tierOrder: Record<string, number> = { 'TIER1': 3, 'TIER2': 2, 'TIER3': 1 };
    allPartnershipAnalyses.sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[b.tier] - tierOrder[a.tier];
      }
      return b.messageCount - a.messageCount;
    });

    const tier1Partners = allPartnershipAnalyses.filter(p => p.tier === 'TIER1');
    const tier2Partners = allPartnershipAnalyses.filter(p => p.tier === 'TIER2');
    const tier3Partners = allPartnershipAnalyses.filter(p => p.tier === 'TIER3');

    // Calculate date range
    const dates = allPartnershipAnalyses
      .filter(p => p.lastActivity)
      .map(p => new Date(p.lastActivity).getTime());
    const minDate = dates.length > 0 ? new Date(Math.min(...dates)) : new Date();
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();
    const weekOf = `${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`;

    // Generate markdown
    let markdown = `# Partnership Activity Report\n`;
    markdown += `## ${weekOf}\n\n`;
    markdown += `---\n\n`;

    // TLDR Summary
    markdown += `## TLDR Summary\n\n`;
    markdown += `**Active Partnerships**: ${allPartnershipAnalyses.length} partnerships showed activity in the last 10 days  \n`;
    markdown += `**Total Messages**: ${totalMessages}+ partnership-related messages  \n`;
    markdown += `\n---\n\n`;

    // Active Partners with Recent Updates
    markdown += `## Active Partners with Recent Updates\n\n`;

    if (tier1Partners.length > 0) {
      markdown += `### **TIER 1: HIGH BUSINESS IMPACT** 🔥\n\n`;
      tier1Partners.forEach((partner, index) => {
        markdown += `#### ${index + 1}. ${partner.chatTitle} (${partner.messageCount} messages)\n`;
        markdown += `**Last Activity**: ${partner.lastActivity?.split('T')[0] || 'N/A'}  \n`;
        markdown += `**Key Updates**:\n`;
        (partner.keyUpdates || []).slice(0, 4).forEach((update: string) => {
          markdown += `- ${update}\n`;
        });
        markdown += `**Follow-up Actions**:\n`;
        (partner.followUpActions || []).slice(0, 3).forEach((action: string) => {
          markdown += `- ${action}\n`;
        });
        markdown += `\n`;
      });
    }

    if (tier2Partners.length > 0) {
      markdown += `### **TIER 2: EMERGING REVENUE POTENTIAL** 💰\n\n`;
      tier2Partners.forEach((partner, index) => {
        const overallIndex = tier1Partners.length + index + 1;
        markdown += `#### ${overallIndex}. ${partner.chatTitle} (${partner.messageCount} messages)\n`;
        markdown += `**Last Activity**: ${partner.lastActivity?.split('T')[0] || 'N/A'}  \n`;
        markdown += `**Key Updates**:\n`;
        (partner.keyUpdates || []).slice(0, 4).forEach((update: string) => {
          markdown += `- ${update}\n`;
        });
        markdown += `**Follow-up Actions**:\n`;
        (partner.followUpActions || []).slice(0, 3).forEach((action: string) => {
          markdown += `- ${action}\n`;
        });
        markdown += `\n`;
      });
    }

    if (tier3Partners.length > 0) {
      markdown += `### **TIER 3: STRATEGIC DEVELOPMENT** 🚀\n\n`;
      tier3Partners.forEach((partner, index) => {
        const overallIndex = tier1Partners.length + tier2Partners.length + index + 1;
        markdown += `#### ${overallIndex}. ${partner.chatTitle} (${partner.messageCount} messages)\n`;
        markdown += `**Last Activity**: ${partner.lastActivity?.split('T')[0] || 'N/A'}  \n`;
        markdown += `**Key Updates**:\n`;
        (partner.keyUpdates || []).slice(0, 3).forEach((update: string) => {
          markdown += `- ${update}\n`;
        });
        markdown += `**Follow-up Actions**:\n`;
        (partner.followUpActions || []).slice(0, 2).forEach((action: string) => {
          markdown += `- ${action}\n`;
        });
        markdown += `\n`;
      });
    }

    // Priority Actions
    markdown += `---\n\n## Priority Actions This Week\n\n`;
    const criticalActions = allPartnershipAnalyses
      .filter(p => p.tier === 'TIER1')
      .flatMap(p => (p.followUpActions || []).slice(0, 2))
      .slice(0, 5);
    if (criticalActions.length > 0) {
      criticalActions.forEach((action, i) => {
        markdown += `${i + 1}. ${action}\n`;
      });
    } else {
      markdown += `No critical actions identified.\n`;
    }

    markdown += `\n---\n\n*Report generated: ${new Date().toISOString()}*\n`;

    // Save to file if path provided
    if (outputPath) {
      const reportsDir = path.dirname(outputPath);
      await fs.ensureDir(reportsDir);
      await fs.writeFile(outputPath, markdown);
      logger.info(`Partnership report saved to ${outputPath}`);
    }

    return markdown;
  }

  private getTelegramLink(chatId: string, messageId: number): string | null {
    // Only generate links for public supergroups (starting with -100)
    // Private groups (starting with -4xxx or other patterns) won't have accessible links
    if (chatId.startsWith('-100')) {
      const linkChatId = chatId.substring(4); // Remove '-100' prefix
      return `https://t.me/c/${linkChatId}/${messageId}`;
    }
    // For private groups, return null (no link available)
    return null;
  }

  private formatUnit(unit: ExtractedUnit, agentType: string): string {
    if (agentType === 'qa-extractor') {
      return this.formatQAUnit(unit);
    } else if (agentType === 'sales-extractor') {
      return this.formatSalesUnit(unit);
    } else {
      return this.formatGenericUnit(unit);
    }
  }

  private formatQAUnit(unit: ExtractedUnit): string {
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();
    const problem = unit.problem!; // Safe after normalization
    
    let formatted = `### Q: ${this.sanitizeMarkdown(problem.summary)}\n`;
    
    // Add Telegram link to the first message (if available)
    const firstMessageId = problem.messageIds[0];
    const telegramLink = this.getTelegramLink(unit.chatId, firstMessageId);
    
    const authors = problem.authors || [];
    formatted += `**Asked by:** ${authors.map(a => this.sanitizeMarkdown(a)).join(', ')} on ${formatDate(problem.timestamp)}`;
    
    // Add link or just message ID depending on chat type
    if (telegramLink) {
      formatted += ` <a href="${telegramLink}" target="_blank">→</a>`;
    } else {
      formatted += ` (msg #${firstMessageId})`;
    }
    formatted += '\n\n';
    
    if (unit.solution?.resolved) {
      // Show resolved answer
      formatted += `${this.sanitizeMarkdown(unit.solution.summary, true)}\n\n`;
      
      const contributors = Object.entries(unit.solution.contributors);
      if (contributors.length > 0) {
        const mainContributor = this.sanitizeMarkdown(contributors[0][0]);
        formatted += `**Answered by:** ${mainContributor} ✅\n`;
        
        if (contributors.length > 1) {
          const others = contributors.slice(1).map(([name]) => this.sanitizeMarkdown(name)).join(', ');
          formatted += `**Additional input:** ${others}\n`;
        }
      }
    } else {
      // Show problem details for unresolved/unanswered
      if (problem.details.length > 0) {
        formatted += problem.details.map(detail => `- ${this.sanitizeMarkdown(detail)}`).join('\n');
        formatted += '\n\n';
      }
      
      // If there's a solution but it's unresolved, show the partial answer and gaps
      if (unit.solution && !unit.solution.resolved) {
        formatted += `**Partial Answer:** ${this.sanitizeMarkdown(unit.solution.summary)}\n\n`;
        
        // Show contributors if any
        const contributors = Object.entries(unit.solution.contributors);
        if (contributors.length > 0) {
          const mainContributor = this.sanitizeMarkdown(contributors[0][0]);
          formatted += `**Response from:** ${mainContributor}\n\n`;
        }
        
        // Show gaps remaining
        if (unit.solution.gaps_remaining && unit.solution.gaps_remaining.length > 0) {
          formatted += `**Gaps Remaining:**\n\n`;
          formatted += unit.solution.gaps_remaining.map(gap => `- ${this.sanitizeMarkdown(gap)}`).join('\n');
          formatted += '\n\n';
        }
        
        formatted += `**Status:** ⚠️ Unresolved\n`;
      } else {
        formatted += `**Status:** ❌ Unanswered\n`;
      }
    }
    
    return formatted;
  }

  private formatSalesUnit(unit: ExtractedUnit): string {
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();
    
    // V2 format with business-focused fields
    const summary = unit.business_summary || '';
    const insightType = unit.insight_type?.replace('_', ' ').toUpperCase() || 'UNKNOWN';
    
    let formatted = `### ${insightType}: ${this.sanitizeMarkdown(summary)}\n\n`;
    
    if (unit.customer_info?.contact) {
      formatted += `**Contact:** ${this.sanitizeMarkdown(unit.customer_info.contact)}`;
      if (unit.customer_info.company) {
        formatted += ` (${unit.customer_info.company})`;
      }
      formatted += '\n\n';
    }
    
    if (unit.business_impact?.opportunity_size || unit.business_impact?.timeline) {
      formatted += `**Business Impact:**\n\n`;
      if (unit.business_impact.opportunity_size) {
        formatted += `- Opportunity Size: ${unit.business_impact.opportunity_size}\n`;
      }
      if (unit.business_impact.timeline) {
        formatted += `- Timeline: ${unit.business_impact.timeline}\n`;
      }
      if (unit.business_impact.decision_urgency) {
        formatted += `- Urgency: ${unit.business_impact.decision_urgency}\n`;
      }
      formatted += '\n';
    }
    
    if (unit.business_impact?.revenue_signals && unit.business_impact.revenue_signals.length > 0) {
      formatted += `**Revenue Signals:**\n\n`;
      unit.business_impact.revenue_signals.forEach(signal => {
        formatted += `- ${this.sanitizeMarkdown(signal)}\n`;
      });
      formatted += '\n';
    }
    
    if (unit.competitive_context?.our_position) {
      formatted += `**Competitive Position:** ${unit.competitive_context.our_position}\n\n`;
      if (unit.competitive_context.differentiation_needed && unit.competitive_context.differentiation_needed.length > 0) {
        formatted += `**Key Differentiators:**\n\n`;
        unit.competitive_context.differentiation_needed.forEach(diff => {
          formatted += `- ${this.sanitizeMarkdown(diff)}\n`;
        });
        formatted += '\n';
      }
    }
    
    if (unit.sales_actions?.immediate_next_steps && unit.sales_actions.immediate_next_steps.length > 0) {
      formatted += `**Immediate Next Steps:**\n\n`;
      unit.sales_actions.immediate_next_steps.forEach(step => {
        formatted += `- ${this.sanitizeMarkdown(step)}\n`;
      });
      formatted += '\n';
    }
    
    if (unit.sales_actions?.recommended_resources && unit.sales_actions.recommended_resources.length > 0) {
      formatted += `**Recommended Resources:**\n\n`;
      unit.sales_actions.recommended_resources.forEach(resource => {
        formatted += `- ${this.sanitizeMarkdown(resource)}\n`;
      });
      formatted += '\n';
    }
    
    if (unit.sales_actions?.follow_up_timeline) {
      formatted += `**Follow-up Timeline:** ${unit.sales_actions.follow_up_timeline}\n`;
      if (unit.sales_actions.escalation_needed) {
        formatted += `**Escalation Required:** Yes\n`;
      }
      formatted += '\n';
    }
    
    // Add timestamp and message links
    if (unit.conversation_context?.messageIds && unit.conversation_context.messageIds.length > 0) {
      const firstMessageId = unit.conversation_context.messageIds[0];
      const telegramLink = this.getTelegramLink(unit.chatId, firstMessageId);
      
      if (unit.conversation_context.timestamp_range) {
        const startTime = unit.conversation_context.timestamp_range.split(' to ')[0];
        formatted += `**Date:** ${formatDate(startTime)}`;
      }
      
      if (telegramLink) {
        formatted += ` <a href="${telegramLink}" target="_blank">→</a>`;
      } else {
        formatted += ` (msg #${firstMessageId})`;
      }
      formatted += '\n';
    }
    
    return formatted;
  }

  private formatGenericUnit(unit: ExtractedUnit): string {
    let formatted = `### ${this.sanitizeMarkdown(unit.business_summary || 'Generic Unit')}\n`;
    formatted += `**Type:** ${unit.insight_type || 'unknown'}\n`;
    formatted += `**Chat:** ${this.sanitizeMarkdown(unit.chatTitle)}\n`;
    return formatted;
  }

  private sanitizeMarkdown(text: string, preserveFormatting: boolean = false): string {
    if (!text) return '';
    
    // Minimal sanitization - only remove truly problematic characters
    let sanitized = text
      // Remove control characters but preserve newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove zero-width characters that can cause issues
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    if (!preserveFormatting) {
      // For titles and short text - only escape markdown special chars
      // Don't replace unicode typography - let the renderer handle encoding
      sanitized = sanitized
        // Escape markdown special characters that could break formatting
        .replace(/\\/g, '\\\\')     // backslash
        .replace(/\*/g, '\\*')      // asterisk (bold/italic)
        .replace(/\_/g, '\\_')      // underscore (bold/italic)
        .replace(/\`/g, '\\`')      // backtick (code)
        .replace(/\~/g, '\\~')      // tilde (strikethrough)
        .replace(/\^/g, '\\^')      // caret (superscript)
        // Handle potential markdown headers in content
        .replace(/^#+\s/gm, '\\$&')
        // Handle potential lists in content (only at start of line)
        .replace(/^[-+*]\s/gm, '\\$&')
        // Handle potential links that could break formatting
        .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '\\[$1\\]\\($2\\)')
        // Normalize whitespace for single-line content
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // For solution content - preserve formatting
      sanitized = sanitized
        // Only escape backslashes that aren't part of intentional escaping
        .replace(/\\(?![\\*_`~\[\]()#+\-.])/g, '\\\\')
        // Normalize paragraph breaks
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
    }
    
    return sanitized;
  }

  private groupByCommunity(units: ExtractedUnit[]): { [community: string]: ExtractedUnit[] } {
    const groups: { [community: string]: ExtractedUnit[] } = {};
    
    for (const unit of units) {
      const community = unit.chatTitle || 'Unknown Community';
      
      if (!groups[community]) {
        groups[community] = [];
      }
      
      groups[community].push(unit);
    }
    
    // Sort communities by number of units (descending)
    const sortedGroups: { [community: string]: ExtractedUnit[] } = {};
    const sortedKeys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    
    for (const key of sortedKeys) {
      sortedGroups[key] = groups[key];
    }
    
    return sortedGroups;
  }

  private calculateStats(units: ExtractedUnit[], agentType: string) {
    const total = units.length;
    const activeCommunities = new Set(units.map(u => u.chatTitle)).size;
    
    let stats: any = {
      total,
      activeCommunities
    };
    
    if (agentType === 'qa-extractor') {
      const resolved = units.filter(u => u.solution?.resolved === true).length;
      const unresolved = units.filter(u => u.solution?.resolved === false).length;
      const unanswered = units.filter(u => !u.solution).length;
      
      stats = {
        ...stats,
        resolved,
        unresolved,
        unanswered,
        resolvedRate: total > 0 ? resolved / total : 0
      };
    } else if (agentType === 'sales-extractor') {
      const leadQualification = units.filter(u => u.insight_type === 'lead_qualification').length;
      const opportunityDevelopment = units.filter(u => u.insight_type === 'opportunity_development').length;
      const competitiveIntelligence = units.filter(u => u.insight_type === 'competitive_intelligence').length;
      const customerExpansion = units.filter(u => u.insight_type === 'customer_expansion').length;
      
      stats = {
        ...stats,
        leadQualification,
        opportunityDevelopment,
        competitiveIntelligence,
        customerExpansion
      };
    }
    
    return stats;
  }

  private getContributorStats(units: ExtractedUnit[]): [string, number][] {
    const counts: { [contributor: string]: number } = {};
    
    for (const unit of units) {
      if (unit.solution?.contributors) {
        for (const contributor of Object.keys(unit.solution.contributors)) {
          counts[contributor] = (counts[contributor] || 0) + 1;
        }
      }
    }
    
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }

  private getCommunityStats(units: ExtractedUnit[]): [string, number][] {
    const counts: { [community: string]: number } = {};
    
    for (const unit of units) {
      const community = unit.chatTitle;
      counts[community] = (counts[community] || 0) + 1;
    }
    
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }

  private getOpportunityStats(units: ExtractedUnit[]): [string, number][] {
    const counts: { [type: string]: number } = {};
    
    for (const unit of units) {
      if (unit.insight_type) {
        const readableType = unit.insight_type.replace('_', ' ');
        counts[readableType] = (counts[readableType] || 0) + 1;
      }
    }
    
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }

  private getDateRange(units: ExtractedUnit[]): string {
    if (units.length === 0) return 'No data';

    const timestamps: number[] = [];

    for (const unit of units) {
      // All units should now have standardized message_context
      if (unit.message_context?.timestamp_range) {
        const startTime = unit.message_context.timestamp_range.split(' to ')[0];
        timestamps.push(new Date(startTime).getTime());
      } else {
        // This should not happen with new agents, but kept as safety fallback
        console.warn('Unit missing message_context in getDateRange:', unit);
        if (unit.problem?.timestamp) {
          timestamps.push(new Date(unit.problem.timestamp).getTime());
        } else if (unit.conversation_context?.timestamp_range) {
          const startTime = unit.conversation_context.timestamp_range.split(' to ')[0];
          timestamps.push(new Date(startTime).getTime());
        }
      }
    }

    if (timestamps.length === 0) return 'No dates available';

    const earliest = new Date(Math.min(...timestamps));
    const latest = new Date(Math.max(...timestamps));

    return `${earliest.toLocaleDateString()} - ${latest.toLocaleDateString()}`;
  }

  // Week calculation utilities
  static getWeekBounds(referenceDate?: Date): { start: Date, end: Date, weekNumber: string, year: number } {
    const ref = referenceDate || new Date();

    // Find Monday of the week containing referenceDate
    const monday = new Date(ref);
    monday.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const weekNumber = this.getISOWeekNumber(monday);
    const year = this.getISOWeekYear(monday);

    return {
      start: monday,
      end: sunday,
      weekNumber: `W${weekNumber.toString().padStart(2, '0')}`,
      year
    };
  }

  static getISOWeekNumber(date: Date): number {
    const target = new Date(date);
    const dayNumber = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNumber + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }

  static getISOWeekYear(date: Date): number {
    const target = new Date(date);
    const dayNumber = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNumber + 3);
    return target.getFullYear();
  }

  static formatWeekRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', options);
    const endStr = end.toLocaleDateString('en-US', options);

    if (start.getFullYear() !== end.getFullYear()) {
      return `${startStr}, ${start.getFullYear()} - ${endStr}, ${end.getFullYear()}`;
    } else if (start.getMonth() !== end.getMonth()) {
      return `${startStr} - ${endStr}, ${end.getFullYear()}`;
    } else {
      return `${startStr} - ${end.getDate()}, ${end.getFullYear()}`;
    }
  }
}