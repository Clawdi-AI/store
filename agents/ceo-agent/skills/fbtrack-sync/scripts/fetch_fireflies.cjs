// Fetch recent Fireflies meetings and categorize them
// Usage: node scripts/fetch_fireflies.cjs [days=10]
//
// Output: /tmp/fireflies_recent.json
//
// Reads config/crm-mappings.json for internal_email_domain to classify
// internal vs partnership meetings.

const fs = require('fs');
const path = require('path');

const FF_API = 'https://api.fireflies.ai/graphql';
const FF_KEY = process.env.FIREFLIES_API_KEY;

if (!FF_KEY) {
  console.error('FIREFLIES_API_KEY not set. Set it in .env or environment.');
  process.exit(1);
}

// Load config for internal email domain
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'crm-mappings.json');
let INTERNAL_DOMAIN = null;
try {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  INTERNAL_DOMAIN = config.internal_email_domain || null;
} catch (e) {
  console.warn('No crm-mappings.json found. Meeting categorization will be basic (no internal/external split).');
}

const DAYS = parseInt(process.argv[2] || '10', 10);
const CUTOFF = Date.now() - (DAYS * 24 * 60 * 60 * 1000);

const QUERY = `{
  transcripts(limit: 50, skip: SKIP_VAL) {
    id
    title
    date
    organizer_email
    participants
    duration
    summary {
      action_items
      overview
      shorthand_bullet
    }
  }
}`;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(skip) {
  const query = QUERY.replace('SKIP_VAL', String(skip));
  const maxAttempts = 5;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(FF_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + FF_KEY
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if ([429, 500, 502, 503, 504, 520, 522, 524].includes(response.status)) {
          const waitMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
          console.warn(`Fireflies transient error ${response.status} (skip=${skip}, attempt ${attempt}/${maxAttempts}), retrying in ${waitMs}ms...`);
          await sleep(waitMs);
          continue;
        }
        throw new Error('Fireflies API error: ' + response.status);
      }

      const data = await response.json();
      return data.data?.transcripts || [];
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message ? e.message : e);
      if (attempt < maxAttempts) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        console.warn(`Fireflies fetch exception (skip=${skip}, attempt ${attempt}/${maxAttempts}): ${msg}; retrying in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }
    }
  }

  throw new Error(`Fireflies fetch failed after retries (skip=${skip}): ${lastErr ? lastErr.message || String(lastErr) : 'unknown error'}`);
}

function categorize(meeting) {
  if (!INTERNAL_DOMAIN) {
    return { ...meeting, isInternal: false, isPartnership: false, internalAttendees: [], externalAttendees: meeting.participants || [] };
  }

  const participants = meeting.participants || [];
  const domainSuffix = '@' + INTERNAL_DOMAIN;
  const internalEmails = participants.filter(p => p.endsWith(domainSuffix));
  const externalEmails = participants.filter(p => !p.endsWith(domainSuffix));

  return {
    ...meeting,
    isInternal: externalEmails.length === 0 && internalEmails.length > 0,
    isPartnership: externalEmails.length > 0,
    internalAttendees: internalEmails.map(e => e.split('@')[0]),
    externalAttendees: externalEmails
  };
}

async function main() {
  console.log(`Fetching Fireflies meetings from last ${DAYS} days...`);
  console.log(`Cutoff: ${new Date(CUTOFF).toISOString()}`);

  const allMeetings = [];
  let skip = 0;

  while (true) {
    const page = await fetchPage(skip);
    if (page.length === 0) break;

    for (const t of page) {
      const ts = typeof t.date === 'string' ? new Date(t.date).getTime() : t.date;
      if (ts >= CUTOFF) {
        const dateObj = new Date(ts);
        allMeetings.push({
          id: t.id,
          title: t.title,
          date: dateObj.toISOString(),
          dateStr: dateObj.toISOString().split('T')[0],
          duration: t.duration,
          organizer: t.organizer_email,
          participants: t.participants || [],
          overview: t.summary?.overview || '',
          action_items: t.summary?.action_items || '',
          shorthand: t.summary?.shorthand_bullet || ''
        });
      }
    }

    const oldestOnPage = Math.min(...page.map(t => {
      const ts = typeof t.date === 'string' ? new Date(t.date).getTime() : t.date;
      return ts;
    }));

    if (oldestOnPage < CUTOFF || page.length < 50) break;
    skip += 50;
    await new Promise(r => setTimeout(r, 300));
  }

  // Deduplicate by title+date
  const seen = new Set();
  const unique = [];
  for (const m of allMeetings) {
    const key = m.title + '|' + m.dateStr;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(categorize(m));
    }
  }

  unique.sort((a, b) => new Date(b.date) - new Date(a.date));

  const fetchedAt = new Date().toISOString();
  const outTmp = '/tmp/fireflies_recent.json';
  const outMetaTmp = '/tmp/fireflies_recent.meta.json';

  fs.writeFileSync(outTmp, JSON.stringify(unique, null, 2));
  fs.writeFileSync(outMetaTmp, JSON.stringify({ fetchedAt, count: unique.length, days: DAYS }, null, 2));

  // Best-effort persistent write to data/ directory
  const dataDir = path.join(__dirname, '..', 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'fireflies_recent.json'), JSON.stringify(unique, null, 2));
    fs.writeFileSync(path.join(dataDir, 'fireflies_recent.meta.json'), JSON.stringify({ fetchedAt, count: unique.length, days: DAYS }, null, 2));
  } catch (e) {
    console.warn('Warning: failed to write persistent fireflies snapshot:', e.message || e);
  }

  const partnership = unique.filter(m => m.isPartnership);
  const internal = unique.filter(m => m.isInternal);
  const uncategorized = unique.filter(m => !m.isPartnership && !m.isInternal);

  console.log(`\nTotal: ${unique.length} meetings`);
  console.log(`Partnership: ${partnership.length}`);
  console.log(`Internal: ${internal.length}`);
  console.log(`Uncategorized: ${uncategorized.length}`);

  const organizers = [...new Set(unique.map(m => m.organizer))];
  console.log(`\nOrganizers: ${organizers.join(', ')}`);
  console.log(`\nSaved to ${outTmp}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
