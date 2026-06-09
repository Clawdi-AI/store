import { logger } from '../lib/logger.js';

export interface AttioConfig {
  apiKey: string;
  baseUrl?: string;
}

// Raw Attio API response interfaces
export interface AttioRecordId {
  workspace_id: string;
  object_id: string;
  record_id: string;
}

export interface AttioStatusOption {
  id: any;
  title: string;
  is_archived: boolean;
}

export interface AttioSelectOption {
  id: any;
  title: string;
  is_archived: boolean;
}

export interface AttioValue<T = any> {
  value?: T;
  status?: AttioStatusOption;  // For status fields
  option?: AttioSelectOption;  // For select fields
  target_record_id?: string;   // For record-reference fields
  currency_value?: number;     // For currency fields
  currency_code?: string;      // For currency fields
  referenced_record_id?: AttioRecordId;
}

export interface AttioRawDeal {
  id: AttioRecordId;
  values: {
    name: AttioValue<string>[];
    stage: AttioValue<string | null>[];
    priority: AttioValue<number>[];
    service: AttioValue<string>[];
    telegram: AttioValue<string>[];
    value: AttioValue<{ amount: number; currency_code: string }>[];
    associated_company: AttioValue<null>[];
  };
}

export interface AttioRawCompany {
  id: AttioRecordId;
  values: {
    name: AttioValue<string>[];
    description: AttioValue<string>[];
    domains: AttioValue<string>[];
    team: AttioValue<null>[];
    funding_status: AttioValue<string>[];
    funding_amount: AttioValue<{ amount: number; currency_code: string }>[];
    primary_location: AttioValue<{ locality: string; region: string; country: string }>[];
    categories: AttioValue<string>[];
  };
}

// Processed interfaces for easier use
export interface AttioDeal {
  id: string;
  name: string;
  stage: string | null;
  priority?: number;
  service?: string;
  telegram?: string;
  value?: {
    amount: number;
    currency: string;
  };
  associated_company_id?: string;
}

export interface AttioCompany {
  id: string;
  name: string;
  description?: string;
  domains?: string[];
  team?: string[];
  funding_status?: string;
  funding_amount?: {
    amount: number;
    currency: string;
  };
  primary_location?: {
    locality: string;
    region: string;
    country: string;
  };
  categories?: string[];
  telegram_interaction?: string;
}

export interface AttioUpdatePayload {
  stage?: string;
  priority?: number;
  service?: string;
  telegram?: string;
  value?: {
    amount: number;
    currency_code: string;
  };
}

export class AttioClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AttioConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.attio.com';
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Attio API error: ${response.status}`, { error });
      throw new Error(`Attio API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // Utility methods for processing raw Attio responses
  private extractValue<T>(values: AttioValue<T>[] | undefined): T | undefined {
    return values?.[0]?.value;
  }


  private processDeal(raw: AttioRawDeal): AttioDeal {
    // Extract currency value from Attio's currency field format
    const valueField = raw.values.value?.[0];
    const currencyValue = valueField?.currency_value;
    const currencyCode = valueField?.currency_code;

    // Extract stage from status field (has .status.title structure)
    const stageField = raw.values.stage?.[0];
    const stage = stageField?.status?.title || null;

    // Extract service from select field (has .option.title structure)
    const serviceField = raw.values.service?.[0];
    const service = serviceField?.option?.title || serviceField?.value;

    // Extract associated company from record-reference field
    const companyField = raw.values.associated_company?.[0];
    const associatedCompanyId = companyField?.target_record_id;

    return {
      id: raw.id.record_id,  // Use record_id not object_id
      name: this.extractValue(raw.values.name) || '',
      stage,
      priority: this.extractValue(raw.values.priority),
      service,
      telegram: this.extractValue(raw.values.telegram),
      value: currencyValue ? {
        amount: currencyValue,
        currency: currencyCode || 'USD'
      } : undefined,
      associated_company_id: associatedCompanyId
    };
  }

  private processCompany(raw: AttioRawCompany): AttioCompany {
    const values = raw.values || {};
    const fundingField = values.funding_amount?.[0];
    const fundingAmount = fundingField?.currency_value;
    const fundingCurrency = fundingField?.currency_code;

    return {
      id: raw.id.record_id,  // Use record_id not object_id
      name: values.name?.[0]?.value || '',
      description: values.description?.[0]?.value,
      domains: values.domains?.map(v => v.value).filter((v): v is string => !!v),
      funding_status: values.funding_status?.[0]?.value,
      funding_amount: fundingAmount ? {
        amount: fundingAmount,
        currency: fundingCurrency || 'USD'
      } : undefined,
      primary_location: values.primary_location?.[0]?.value,
      categories: values.categories?.map(v => v.value).filter((v): v is string => !!v)
    };
  }

  // Deal operations
  async getDeal(dealId: string): Promise<AttioDeal> {
    // Single record endpoints return { data: record }
    const response = await this.request<{ data: AttioRawDeal }>(`/v2/objects/deals/records/${dealId}`);
    return this.processDeal(response.data);
  }

  async listDeals(): Promise<AttioDeal[]> {
    // Attio v2 API uses POST /query endpoint for listing records
    const allDeals: AttioDeal[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.request<{ data: AttioRawDeal[] }>('/v2/objects/deals/records/query', {
        method: 'POST',
        body: JSON.stringify({ limit, offset }),
      });

      const deals = response.data.map(deal => this.processDeal(deal));
      allDeals.push(...deals);

      if (response.data.length < limit) {
        break;
      }
      offset += limit;
    }

    return allDeals;
  }

  async updateDeal(dealId: string, updates: AttioUpdatePayload): Promise<AttioDeal> {
    logger.info(`Updating Attio deal ${dealId}`, { updates });
    
    // Convert to Attio's expected format
    const attioUpdates: Record<string, any> = {};
    
    if (updates.stage !== undefined) {
      attioUpdates.stage = updates.stage;
    }
    if (updates.priority !== undefined) {
      attioUpdates.priority = updates.priority;
    }
    if (updates.service !== undefined) {
      attioUpdates.service = updates.service;
    }
    if (updates.telegram !== undefined) {
      attioUpdates.telegram = updates.telegram;
    }
    if (updates.value !== undefined) {
      attioUpdates.value = updates.value;
    }
    
    const raw = await this.request<AttioRawDeal>(`/v2/objects/deals/records/${dealId}`, {
      method: 'PATCH',
      body: JSON.stringify(attioUpdates),
    });
    
    return this.processDeal(raw);
  }

  async createDeal(deal: Partial<AttioDeal>): Promise<AttioDeal> {
    const raw = await this.request<AttioRawDeal>('/v2/objects/deals/records', {
      method: 'POST',
      body: JSON.stringify(deal),
    });
    
    return this.processDeal(raw);
  }

  // Company operations
  async getCompany(companyId: string): Promise<AttioCompany> {
    // Single record endpoints return { data: record }
    const response = await this.request<{ data: AttioRawCompany }>(`/v2/objects/companies/records/${companyId}`);
    return this.processCompany(response.data);
  }

  async listCompanies(): Promise<AttioCompany[]> {
    // Attio v2 API uses POST /query endpoint for listing records
    const allCompanies: AttioCompany[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.request<{ data: AttioRawCompany[] }>('/v2/objects/companies/records/query', {
        method: 'POST',
        body: JSON.stringify({ limit, offset }),
      });

      const companies = response.data.map(company => this.processCompany(company));
      allCompanies.push(...companies);

      if (response.data.length < limit) {
        break;
      }
      offset += limit;
    }

    return allCompanies;
  }

  async updateCompany(companyId: string, updates: Partial<AttioCompany>): Promise<AttioCompany> {
    logger.info(`Updating Attio company ${companyId}`, { updates });
    
    const raw = await this.request<AttioRawCompany>(`/v2/objects/companies/records/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    
    return this.processCompany(raw);
  }

  async searchCompanies(query: string): Promise<AttioCompany[]> {
    const response = await this.request<{ data: AttioRawCompany[] }>(`/v2/objects/companies/records/search?q=${encodeURIComponent(query)}`);
    return response.data.map(company => this.processCompany(company));
  }

  // Webhook operations
  async createWebhook(events: string[], url: string): Promise<{ id: string; url: string }> {
    return this.request('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        events,
        url,
      }),
    });
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request(`/webhooks/${webhookId}`, {
      method: 'DELETE',
    });
  }

  // Custom field operations
  async createCustomField(objectType: string, field: {
    api_slug: string;
    title: string;
    type: string;
    options?: string[];
  }): Promise<any> {
    return this.request(`/objects/${objectType}/attributes`, {
      method: 'POST',
      body: JSON.stringify(field),
    });
  }

  // Batch operations
  async batchUpdateDeals(updates: Array<{ dealId: string; updates: AttioUpdatePayload }>): Promise<void> {
    logger.info(`Batch updating ${updates.length} deals`);
    
    // Process in parallel with rate limiting
    const batchSize = 5;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await Promise.all(
        batch.map(({ dealId, updates }) => this.updateDeal(dealId, updates))
      );
      
      // Rate limit: wait 1 second between batches
      if (i + batchSize < updates.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Utility methods
  async testConnection(): Promise<boolean> {
    try {
      // We know /v2/objects works from our test
      await this.request('/v2/objects');
      logger.info('Attio API connection successful');
      return true;
    } catch (error) {
      logger.error('Attio API connection failed', error);
      return false;
    }
  }
}