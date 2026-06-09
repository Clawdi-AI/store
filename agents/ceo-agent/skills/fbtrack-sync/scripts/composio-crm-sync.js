// Sync meeting notes and interaction dates to CRM via Composio
// Supports: HubSpot, Salesforce, Pipedrive, Attio, Zoho CRM
//
// Usage: node scripts/composio-crm-sync.js [--provider hubspot|salesforce|pipedrive|attio|zoho]
//
// Reads: /tmp/merged_report.md and /tmp/meetings_recent.json (or /tmp/fireflies_recent.json)
// Creates notes/activities on matched company records in the CRM.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse CLI args
let PROVIDER = null; // auto-detect
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--provider' && process.argv[i + 1]) {
    PROVIDER = process.argv[i + 1];
    i++;
  }
}

// Load config
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'crm-mappings.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.warn('No crm-mappings.json found. Will attempt to match by company name.');
}

function composioCall(toolSlug, args) {
  const argsJson = JSON.stringify({ tools: [{ tool_slug: toolSlug, arguments: args }] });
  try {
    const result = execFileSync(
      'mcporter',
      ['call', 'clawdi-mcp', 'COMPOSIO_MULTI_EXECUTE_TOOL', '--args', argsJson, '--output', 'json'],
      { encoding: 'utf8', timeout: 60000 }
    );
    return JSON.parse(result);
  } catch (e) {
    console.warn(`Composio call failed for ${toolSlug}: ${e.message}`);
    return null;
  }
}

function soqlStringLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Load meetings data
let meetings = [];
for (const p of ['/tmp/meetings_recent.json', '/tmp/fireflies_recent.json']) {
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      meetings.push(...(Array.isArray(data) ? data : []));
    }
  } catch (e) { /* skip */ }
}

// Deduplicate by title+date
const seen = new Set();
meetings = meetings.filter(m => {
  const key = `${m.title}|${m.dateStr}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`Loaded ${meetings.length} meetings to sync.`);

// CRM provider implementations
const crmProviders = {

  hubspot: {
    name: 'HubSpot',
    async searchCompany(name) {
      const result = composioCall('HUBSPOT_SEARCH_CRM_OBJECTS', {
        objectType: 'companies',
        filterGroups: [{ filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: name }] }],
        limit: 3
      });
      const results = result?.results || result?.data?.results || [];
      return results.length > 0 ? results[0] : null;
    },
    async createNote(companyId, title, content) {
      return composioCall('HUBSPOT_CREATE_ENGAGEMENT', {
        engagement: { type: 'NOTE', timestamp: Date.now() },
        associations: { companyIds: [companyId] },
        metadata: { body: `**${title}**\n\n${content}` }
      });
    },
    async updateLastActivity(companyId, date) {
      return composioCall('HUBSPOT_UPDATE_COMPANY', {
        companyId,
        properties: { notes_last_updated: date }
      });
    }
  },

  salesforce: {
    name: 'Salesforce',
    async searchCompany(name) {
      const safeName = soqlStringLiteral(name);
      const result = composioCall('SALESFORCE_SOQL_QUERY', {
        query: `SELECT Id, Name FROM Account WHERE Name LIKE '%${safeName}%' LIMIT 3`
      });
      const records = result?.records || result?.data?.records || [];
      return records.length > 0 ? records[0] : null;
    },
    async createNote(companyId, title, content) {
      return composioCall('SALESFORCE_CREATE_RECORD', {
        objectType: 'Note',
        fields: { ParentId: companyId, Title: title, Body: content }
      });
    },
    async updateLastActivity(companyId, date) {
      return composioCall('SALESFORCE_UPDATE_RECORD', {
        objectType: 'Account',
        recordId: companyId,
        fields: { Last_Interaction_Date__c: date }
      });
    }
  },

  pipedrive: {
    name: 'Pipedrive',
    async searchCompany(name) {
      const result = composioCall('PIPEDRIVE_SEARCH_ORGANIZATIONS', {
        term: name, limit: 3
      });
      const items = result?.data?.items || [];
      return items.length > 0 ? items[0].item : null;
    },
    async createNote(companyId, title, content) {
      return composioCall('PIPEDRIVE_ADD_A_NOTE', {
        org_id: companyId,
        content: `**${title}**\n\n${content}`
      });
    },
    async updateLastActivity(_companyId, _date) {
      // Pipedrive auto-tracks activity dates
      return null;
    }
  },

  attio: {
    name: 'Attio',
    async searchCompany(name) {
      // Check config for direct mapping first
      const mappings = config.company_mappings || {};
      if (mappings[name]) {
        return { id: mappings[name], name };
      }
      // Fall back to API search
      const result = composioCall('ATTIO_SEARCH_RECORDS', {
        object: 'companies',
        query: name,
        limit: 3
      });
      const records = result?.data || [];
      return records.length > 0 ? records[0] : null;
    },
    async createNote(companyId, title, content) {
      return composioCall('ATTIO_CREATE_NOTE', {
        parent_object: 'companies',
        parent_record_id: companyId,
        title,
        content_plaintext: content
      });
    },
    async updateLastActivity(companyId, date) {
      return composioCall('ATTIO_UPDATE_RECORD', {
        object: 'companies',
        record_id: companyId,
        values: { last_interaction_date: date }
      });
    }
  },

  zoho: {
    name: 'Zoho CRM',
    async searchCompany(name) {
      const result = composioCall('ZOHOCRM_SEARCH_RECORDS', {
        module: 'Accounts',
        criteria: `(Account_Name:contains:${name})`,
        per_page: 3
      });
      const records = result?.data || [];
      return records.length > 0 ? records[0] : null;
    },
    async createNote(companyId, title, content) {
      return composioCall('ZOHOCRM_CREATE_RECORD', {
        module: 'Notes',
        data: [{ Parent_Id: companyId, Note_Title: title, Note_Content: content }]
      });
    },
    async updateLastActivity(companyId, date) {
      return composioCall('ZOHOCRM_UPDATE_RECORD', {
        module: 'Accounts',
        record_id: companyId,
        data: [{ Last_Activity_Time: date }]
      });
    }
  }
};

// Extract company names from meetings
function extractCompanyName(meeting) {
  const title = meeting.title || '';
  // Common patterns: "Company <> OurOrg", "Weekly: Company", "Company Sync"
  const patterns = [
    /^(.+?)\s*[<>|]\s*.+$/i,
    /^.+?\s*[<>|]\s*(.+)$/i,
    /weekly[:\s]+(.+)/i,
    /sync[:\s]+(.+)/i,
    /^(.+?)\s+(?:sync|standup|weekly|meeting|call)/i
  ];
  for (const p of patterns) {
    const match = title.match(p);
    if (match && match[1] && match[1].length > 2) {
      return match[1].trim();
    }
  }
  return null;
}

async function main() {
  const providersToTry = PROVIDER ? [PROVIDER] : Object.keys(crmProviders);
  let activeCrm = null;

  // Find first connected CRM
  for (const key of providersToTry) {
    const crm = crmProviders[key];
    if (!crm) continue;

    // Quick test: try searching for a common term
    console.log(`Testing ${crm.name} connection...`);
    const test = await crm.searchCompany('test');
    if (test !== null || PROVIDER === key) {
      activeCrm = { key, ...crm };
      console.log(`Using ${crm.name} as CRM provider.`);
      break;
    }
  }

  if (!activeCrm) {
    console.error('No CRM connected. Connect one via your Clawdi dashboard: HubSpot, Salesforce, Pipedrive, Attio, or Zoho CRM.');
    process.exit(1);
  }

  let synced = 0;
  let skipped = 0;

  for (const meeting of meetings) {
    if (!meeting.isPartnership && !meeting.externalAttendees?.length) {
      // Skip internal meetings
      continue;
    }

    const companyName = extractCompanyName(meeting);
    if (!companyName) {
      skipped++;
      continue;
    }

    try {
      const company = await activeCrm.searchCompany(companyName);
      if (!company) {
        console.log(`  ? ${companyName}: not found in ${activeCrm.name}`);
        skipped++;
        continue;
      }

      const companyId = company.id || company.Id || company.record_id;
      const noteTitle = `Meeting: ${meeting.title} (${meeting.dateStr})`;
      const noteContent = [
        meeting.overview || '',
        meeting.action_items ? `\nAction Items:\n${meeting.action_items}` : ''
      ].filter(Boolean).join('\n');

      if (noteContent.trim()) {
        await activeCrm.createNote(companyId, noteTitle, noteContent);
      }

      if (meeting.dateStr) {
        await activeCrm.updateLastActivity(companyId, meeting.dateStr);
      }

      console.log(`  ✓ ${companyName}: synced to ${activeCrm.name}`);
      synced++;
    } catch (e) {
      console.error(`  ✗ ${companyName}: ${e.message}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nSynced ${synced} meetings to ${activeCrm.name}. Skipped ${skipped}.`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
