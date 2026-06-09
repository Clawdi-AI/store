// Standardized extraction output format for consistent audit message association

export interface MessageContext {
  messageIds: number[];
  participants: string[];
  timestamp_range: string;
  chatId: string;
  chatTitle: string;
}

export interface StandardizedExtractionUnit {
  // Universal fields for all agent types
  message_context: MessageContext;
  extraction_metadata: {
    agent_type: string;
    agent_version: string;
    extracted_at: string;
    confidence_score?: number;
  };
  
  // Agent-specific content (varies by agent type)
  content: any;
  
  // Backward compatibility
  chatId: string;
  chatTitle: string;
}

// QA-specific standardized format
export interface QAExtractionUnit extends StandardizedExtractionUnit {
  content: {
    problem: {
      summary: string;
      details: string[];
      authors: string[];
      timestamp: string;
    };
    solution?: {
      summary: string;
      resolved: boolean;
      gaps_remaining: string[];
      contributors: { [username: string]: string };
      timestamp_range: string;
    };
  };
}

// Sales-specific standardized format  
export interface SalesExtractionUnit extends StandardizedExtractionUnit {
  content: {
    insight_type: string;
    deal_status: string;
    business_summary: string;
    customer_info: {
      contact: string;
      company?: string;
      deal_stage?: string;
    };
    business_impact: {
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
  };
}