// Sync latest interaction dates to Attio CRM
// Usage: node scripts/sync_attio_interactions.cjs
//
// Reads config/crm-mappings.json for company_mappings and fireflies_to_company.
// Updates Attio company records with latest interaction dates from fbtrack data.

const fs = require('fs');
const path = require('path');

const ATTIO_API_KEY = process.env.ATTIO_API_KEY;
if (!ATTIO_API_KEY) {
  console.error('ATTIO_API_KEY not set. Set it in .env or environment.');
  process.exit(1);
}

// Load CRM mappings
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'crm-mappings.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('Missing config/crm-mappings.json. Copy from crm-mappings.json.example and fill in your mappings.');
  process.exit(1);
}

const COMPANY_MAPPINGS = config.company_mappings || {};
const FF_TO_COMPANY = config.fireflies_to_company || {};

// Load Fireflies data
let meetings = [];
try {
  const ffPath = '/tmp/fireflies_recent.json';
  if (fs.existsSync(ffPath)) {
    meetings = JSON.parse(fs.readFileSync(ffPath, 'utf8'));
  }
} catch (e) {
  console.warn('No Fireflies data found.');
}

// Load extraction data for chat-based interactions
const DATA_DIR = path.join(__dirname, '..', 'data', 'extractions');
let extractions = [];
try {
  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
        if (Array.isArray(data)) extractions.push(...data);
        else extractions.push(data);
      } catch (e) { /* skip */ }
    }
  }
} catch (e) { /* no extractions */ }

// Find latest interaction date per company
const latestDates = {};

// From meetings
for (const m of meetings) {
  if (!m.isPartnership) continue;
  const title = m.title || '';
  let company = null;

  for (const [pattern, co] of Object.entries(FF_TO_COMPANY)) {
    if (title.toLowerCase().includes(pattern.toLowerCase())) {
      company = co;
      break;
    }
  }

  if (company && COMPANY_MAPPINGS[company]) {
    const date = m.dateStr || m.date?.split('T')[0];
    if (date && (!latestDates[company] || date > latestDates[company])) {
      latestDates[company] = date;
    }
  }
}

// From chat extractions
for (const e of extractions) {
  const chatTitle = e.chatTitle || '';
  for (const [company, attioId] of Object.entries(COMPANY_MAPPINGS)) {
    if (chatTitle.toLowerCase().includes(company.toLowerCase())) {
      const date = e.date || e.timestamp?.split('T')[0];
      if (date && (!latestDates[company] || date > latestDates[company])) {
        latestDates[company] = date;
      }
    }
  }
}

async function updateAttioCompany(companyId, lastInteraction) {
  const response = await fetch(`https://api.attio.com/v2/objects/companies/records/${companyId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATTIO_API_KEY}`
    },
    body: JSON.stringify({
      data: {
        values: {
          last_interaction_date: lastInteraction
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Attio API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function main() {
  const entries = Object.entries(latestDates);
  console.log(`Found ${entries.length} companies with recent interactions.`);

  for (const [company, date] of entries) {
    const attioId = COMPANY_MAPPINGS[company];
    if (!attioId) continue;

    try {
      await updateAttioCompany(attioId, date);
      console.log(`✓ ${company}: updated to ${date}`);
    } catch (e) {
      console.error(`✗ ${company}: ${e.message}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Done.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
