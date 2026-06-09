// Sync meeting notes and conversation summaries to Attio CRM as notes
// Usage: node scripts/sync_attio_notes.cjs
//
// Reads config/crm-mappings.json for company_mappings.
// Creates notes on Attio company records from meeting overviews and extraction summaries.

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

function matchCompany(title) {
  for (const [pattern, company] of Object.entries(FF_TO_COMPANY)) {
    if (title.toLowerCase().includes(pattern.toLowerCase())) {
      return company;
    }
  }
  return null;
}

async function createAttioNote(companyId, title, content) {
  const response = await fetch('https://api.attio.com/v2/notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATTIO_API_KEY}`
    },
    body: JSON.stringify({
      data: {
        parent_object: 'companies',
        parent_record_id: companyId,
        title: title,
        content_plaintext: content
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
  let synced = 0;

  for (const m of meetings) {
    if (!m.isPartnership) continue;
    const company = matchCompany(m.title || '');
    if (!company || !COMPANY_MAPPINGS[company]) continue;

    const attioId = COMPANY_MAPPINGS[company];
    const noteTitle = `Meeting: ${m.title} (${m.dateStr})`;
    const noteContent = [
      m.overview || '',
      m.action_items ? `\nAction Items:\n${m.action_items}` : ''
    ].filter(Boolean).join('\n');

    if (!noteContent.trim()) continue;

    try {
      await createAttioNote(attioId, noteTitle, noteContent);
      console.log(`✓ ${company}: "${m.title}" (${m.dateStr})`);
      synced++;
    } catch (e) {
      console.error(`✗ ${company}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nSynced ${synced} meeting notes.`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
