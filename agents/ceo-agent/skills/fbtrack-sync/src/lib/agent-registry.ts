import { AIAgent } from './ai-agent.js';
import { QAExtractorAgent } from '../agents/qa-extractor.js';
import { SalesExtractorAgent } from '../agents/sales-extractor.js';
import chalk from 'chalk';

export interface AgentHandler {
  createAgent(config: any, baseDir: string): AIAgent;
  getDisplayName(): string;
  getUnitTypeName(): string;
  validateUnit(unit: any): boolean;
  getAuditStatistics(units: any[]): Record<string, any>;
  displayAuditStatistics(stats: Record<string, any>): void;
  formatAuditUnit(unit: any): string;
  extractFromMessages(agent: AIAgent, messages: any[]): Promise<{ results: any[], stats: any }>;
  displayProcessingResults(results: any[]): void;
  // Standardized message association methods
  getMessageIds(unit: any): number[];
  getParticipants(unit: any): string[];
  getTimestampRange(unit: any): { start: string; end: string } | null;
}

export class QAAgentHandler implements AgentHandler {
  createAgent(config: any, baseDir: string): AIAgent {
    return new QAExtractorAgent(config, baseDir);
  }

  getDisplayName(): string {
    return 'Q&A pairs';
  }

  getUnitTypeName(): string {
    return 'Q&A pairs';
  }

  validateUnit(unit: any): boolean {
    return !!(unit.message_context && unit.extraction_metadata);
  }

  getAuditStatistics(units: any[]): Record<string, any> {
    const total = units.length;
    const resolved = units.filter(u => {
      const content = u.content || u;
      return content.solution?.resolved === true;
    }).length;
    const unresolved = units.filter(u => {
      const content = u.content || u;
      return content.solution?.resolved === false;
    }).length;
    const unanswered = units.filter(u => {
      const content = u.content || u;
      return !content.solution;
    }).length;
    
    return {
      total,
      resolved,
      unresolved,
      unanswered,
      resolvedRate: total > 0 ? resolved / total : 0
    };
  }

  displayAuditStatistics(stats: Record<string, any>): void {
    console.log(chalk.green(`   - Resolved: ${stats.resolved}`));
    console.log(chalk.yellow(`   - Unresolved: ${stats.unresolved}`));
    console.log(chalk.red(`   - Unanswered: ${stats.unanswered}`));
  }

  formatAuditUnit(unit: any): string {
    // Extract content from standardized or old format
    const content = unit.content || unit;
    const problem = content.problem || content.question;
    const solution = content.solution || content.answer;
    
    let formatted = `**Q:** ${problem.summary}\n`;
    formatted += `**Asked by:** ${problem.authors?.join(', ') || 'Unknown'}\n`;
    
    if (solution?.resolved) {
      formatted += `**Status:** ✅ Resolved\n`;
      formatted += `**A:** ${solution.summary}\n`;
    } else if (solution) {
      formatted += `**Status:** ❌ Unresolved\n`;
      formatted += `**A:** ${solution.summary}\n`;
    } else {
      formatted += `**Status:** ❓ Unanswered\n`;
    }
    
    return formatted;
  }

  async extractFromMessages(agent: AIAgent, messages: any[]): Promise<{ results: any[], stats: any }> {
    return await (agent as any).extractQA(messages);
  }

  displayProcessingResults(results: any[]): void {
    console.log(`  Q&A pairs extracted: ${results.length}`);
    
    if (results.length > 0) {
      // Count resolved vs unresolved
      const resolved = results.filter((r: any) => r.solution?.resolved === true).length;
      const unresolved = results.filter((r: any) => r.solution?.resolved === false).length;
      const unanswered = results.filter((r: any) => !r.solution).length;
      
      console.log(`  ├─ Resolved: ${resolved}`);
      console.log(`  ├─ Unresolved: ${unresolved}`);
      console.log(`  └─ Unanswered: ${unanswered}`);
    }
  }

  getMessageIds(unit: any): number[] {
    return [...unit.message_context.messageIds];
  }

  getParticipants(unit: any): string[] {
    return [...unit.message_context.participants];
  }

  getTimestampRange(unit: any): { start: string; end: string } | null {
    const [start, end] = unit.message_context.timestamp_range.split(' to ');
    return { start, end: end || start };
  }
}

export class SalesAgentHandler implements AgentHandler {
  createAgent(config: any, baseDir: string): AIAgent {
    return new SalesExtractorAgent(config, baseDir);
  }

  getDisplayName(): string {
    return 'Sales insights';
  }

  getUnitTypeName(): string {
    return 'sales insights';
  }

  validateUnit(unit: any): boolean {
    return !!(unit.message_context && unit.extraction_metadata);
  }

  getAuditStatistics(units: any[]): Record<string, any> {
    const total = units.length;
    const onTrack = units.filter(u => {
      const content = u.content || u;
      return content.deal_status?.includes('🟢');
    }).length;
    const atRisk = units.filter(u => {
      const content = u.content || u;
      return content.deal_status?.includes('🟡');
    }).length;
    const urgent = units.filter(u => {
      const content = u.content || u;
      return content.deal_status?.includes('🔴');
    }).length;
    
    const dealAccelerator = units.filter(u => {
      const content = u.content || u;
      return content.insight_type === 'deal_accelerator';
    }).length;
    const dealRisk = units.filter(u => {
      const content = u.content || u;
      return content.insight_type === 'deal_risk';
    }).length;
    const competitiveThreat = units.filter(u => {
      const content = u.content || u;
      return content.insight_type === 'competitive_threat';
    }).length;
    const expansionOpportunity = units.filter(u => {
      const content = u.content || u;
      return content.insight_type === 'expansion_opportunity';
    }).length;
    
    return {
      total,
      onTrack,
      atRisk,
      urgent,
      dealAccelerator,
      dealRisk,
      competitiveThreat,
      expansionOpportunity
    };
  }

  displayAuditStatistics(stats: Record<string, any>): void {
    console.log(chalk.green(`   - 🟢 On Track: ${stats.onTrack}`));
    console.log(chalk.yellow(`   - 🟡 At Risk: ${stats.atRisk}`));
    console.log(chalk.red(`   - 🔴 Urgent: ${stats.urgent}`));
    if (stats.total - stats.onTrack - stats.atRisk - stats.urgent > 0) {
      console.log(chalk.gray(`   - Status Unknown: ${stats.total - stats.onTrack - stats.atRisk - stats.urgent}`));
    }
  }

  formatAuditUnit(unit: any): string {
    // Extract content from standardized or old format
    const content = unit.content || unit;
    
    let formatted = `**${content.deal_status || '❓'} ${content.insight_type?.replace('_', ' ').toUpperCase()}:** ${content.business_summary}\n`;
    formatted += `**Contact:** ${content.customer_info?.contact || 'Unknown'}\n`;
    
    if (content.business_impact?.opportunity_size) {
      formatted += `**Size:** ${content.business_impact.opportunity_size}\n`;
    }
    if (content.business_impact?.timeline) {
      formatted += `**Timeline:** ${content.business_impact.timeline}\n`;
    }
    if (content.sales_actions?.escalation_needed) {
      formatted += `**Escalation Required:** Yes\n`;
    }
    
    return formatted;
  }

  async extractFromMessages(agent: AIAgent, messages: any[]): Promise<{ results: any[], stats: any }> {
    return await (agent as any).extractSales(messages);
  }

  displayProcessingResults(results: any[]): void {
    console.log(`  Sales insights extracted: ${results.length}`);
    
    if (results.length > 0) {
      // Count by status
      const onTrack = results.filter((r: any) => r.deal_status?.includes('🟢')).length;
      const atRisk = results.filter((r: any) => r.deal_status?.includes('🟡')).length;
      const urgent = results.filter((r: any) => r.deal_status?.includes('🔴')).length;
      
      console.log(`  ├─ 🟢 On Track: ${onTrack}`);
      console.log(`  ├─ 🟡 At Risk: ${atRisk}`);
      console.log(`  └─ 🔴 Urgent: ${urgent}`);
    }
  }

  getMessageIds(unit: any): number[] {
    return [...unit.message_context.messageIds];
  }

  getParticipants(unit: any): string[] {
    return [...unit.message_context.participants];
  }

  getTimestampRange(unit: any): { start: string; end: string } | null {
    const [start, end] = unit.message_context.timestamp_range.split(' to ');
    return { start, end: end || start };
  }
}

export class AgentRegistry {
  private static handlers = new Map<string, AgentHandler>([
    ['qa-extractor', new QAAgentHandler()],
    ['sales-extractor', new SalesAgentHandler()],
  ]);

  static getHandler(agentType: string): AgentHandler {
    const handler = this.handlers.get(agentType);
    if (!handler) {
      throw new Error(`Unknown agent type: ${agentType}. Available: ${Array.from(this.handlers.keys()).join(', ')}`);
    }
    return handler;
  }

  static getAvailableAgents(): string[] {
    return Array.from(this.handlers.keys());
  }
}