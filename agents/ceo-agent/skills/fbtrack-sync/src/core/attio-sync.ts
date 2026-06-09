import { AttioClient } from '../services/attio.js';
import { logger } from '../lib/logger.js';
import fs from 'fs-extra';
import path from 'path';

export interface AttioCompany {
  id: string;
  name: string;
  description?: string;
  domains?: string[];
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
  dealCount: number;
  lastUpdated: string;
}

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
  companyName?: string;
  lastUpdated: string;
}

export class AttioSyncService {
  private attioClient: AttioClient;
  private baseDir: string;
  private companiesFile: string;
  private dealsFile: string;
  private checkpointFile: string;

  constructor(attioApiKey: string, _baseDir: string = process.cwd()) {
    this.attioClient = new AttioClient({ apiKey: attioApiKey });
    this.baseDir = _baseDir;
    this.companiesFile = path.join(this.baseDir, 'data', 'attio', 'companies.jsonl');
    this.dealsFile = path.join(this.baseDir, 'data', 'attio', 'deals.jsonl');
    this.checkpointFile = path.join(this.baseDir, 'state', 'attio-sync-checkpoint.json');
  }

  async initialize(): Promise<void> {
    // Ensure directories exist
    await fs.ensureDir(path.dirname(this.companiesFile));
    await fs.ensureDir(path.dirname(this.checkpointFile));
    
    // Test connection
    const connected = await this.attioClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Attio API');
    }
    
    logger.info('Attio sync service initialized');
  }

  async syncCompaniesWithDeals(): Promise<{ companies: number; deals: number }> {
    logger.info('Starting sync of companies with deals from Attio');
    
    await this.loadCheckpoint(); // For future use
    const companiesWithDeals = new Map<string, AttioCompany>();
    const allDeals: AttioDeal[] = [];
    
    // First, fetch all deals to identify companies with deals
    logger.info('Fetching all deals...');
    const deals = await this.attioClient.listDeals();
    
    logger.info(`Found ${deals.length} total deals`);
    
    // Process deals and group by company
    const companyDealCount = new Map<string, number>();
    for (const deal of deals) {
      const processedDeal: AttioDeal = {
        ...deal,
        lastUpdated: new Date().toISOString()
      };
      
      if (deal.associated_company_id) {
        companyDealCount.set(deal.associated_company_id, (companyDealCount.get(deal.associated_company_id) || 0) + 1);
      }
      allDeals.push(processedDeal);
    }
    
    logger.info(`Found ${companyDealCount.size} unique companies with deals`);
    
    // Fetch detailed company info for companies with deals
    let processed = 0;
    for (const [companyId, dealCount] of companyDealCount.entries()) {
      try {
        const serviceCompany = await this.attioClient.getCompany(companyId);
        if (serviceCompany) {
          const company: AttioCompany = {
            ...serviceCompany,
            dealCount,
            lastUpdated: new Date().toISOString()
          };
          companiesWithDeals.set(companyId, company);
        }
        
        processed++;
        if (processed % 50 === 0) {
          logger.info(`Processed ${processed}/${companyDealCount.size} companies`);
        }
        
        // Rate limiting - 1 request per 100ms
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Failed to fetch company ${companyId}`, error);
      }
    }
    
    // Write data to files
    await this.writeCompanies(Array.from(companiesWithDeals.values()));
    await this.writeDeals(allDeals);
    
    // Update checkpoint
    await this.saveCheckpoint({
      lastSync: new Date().toISOString(),
      companiesCount: companiesWithDeals.size,
      dealsCount: allDeals.length
    });
    
    logger.info(`Sync completed: ${companiesWithDeals.size} companies, ${allDeals.length} deals`);
    
    return {
      companies: companiesWithDeals.size,
      deals: allDeals.length
    };
  }

  // This method is no longer needed as we use the AttioClient directly

  // This method is no longer needed as we use the AttioClient directly

  // This method is no longer needed as custom field handling is done in AttioClient

  private async writeCompanies(companies: AttioCompany[]): Promise<void> {
    const jsonlContent = companies.map(company => JSON.stringify(company)).join('\n');
    await fs.writeFile(this.companiesFile, jsonlContent);
    logger.info(`Wrote ${companies.length} companies to ${this.companiesFile}`);
  }

  private async writeDeals(deals: AttioDeal[]): Promise<void> {
    const jsonlContent = deals.map(deal => JSON.stringify(deal)).join('\n');
    await fs.writeFile(this.dealsFile, jsonlContent);
    logger.info(`Wrote ${deals.length} deals to ${this.dealsFile}`);
  }

  private async loadCheckpoint(): Promise<any> {
    try {
      if (await fs.pathExists(this.checkpointFile)) {
        return await fs.readJson(this.checkpointFile);
      }
    } catch (error) {
      logger.debug('No checkpoint file found');
    }
    return {};
  }

  private async saveCheckpoint(checkpoint: any): Promise<void> {
    await fs.writeJson(this.checkpointFile, checkpoint, { spaces: 2 });
  }

  async getCompaniesWithDeals(): Promise<AttioCompany[]> {
    if (!await fs.pathExists(this.companiesFile)) {
      return [];
    }
    
    const content = await fs.readFile(this.companiesFile, 'utf-8');
    return content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  async getDeals(): Promise<AttioDeal[]> {
    if (!await fs.pathExists(this.dealsFile)) {
      return [];
    }
    
    const content = await fs.readFile(this.dealsFile, 'utf-8');
    return content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  async getCompanyById(companyId: string): Promise<AttioCompany | null> {
    const companies = await this.getCompaniesWithDeals();
    return companies.find(c => c.id === companyId) || null;
  }

  async searchCompaniesByName(searchTerm: string): Promise<AttioCompany[]> {
    const companies = await this.getCompaniesWithDeals();
    const term = searchTerm.toLowerCase();
    
    return companies.filter(company => {
      const nameMatch = company.name.toLowerCase().includes(term);
      const domainMatch = company.domains?.some(domain => domain.toLowerCase().includes(term));
      return nameMatch || domainMatch;
    });
  }
}