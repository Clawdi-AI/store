#!/usr/bin/env node
// Unified Composio sync — auto-detects all connected apps and pulls data
// into fbtrack's data pipeline. This is the single entry point for all
// Composio-sourced data.
//
// Usage: node scripts/composio-unified-sync.cjs --days 10
//
// Auto-detects and syncs from:
//   - Gmail → business emails (saves to data/gmail/)
//   - Google Meet / Zoom / Teams / Fathom / Fireflies → meeting notes (saves to data/meetings/)
//   - Slack → channel messages (saves to data/slack/)
//   - HubSpot / Salesforce / Pipedrive / Attio / Zoho → CRM activity (saves to data/crm/)
//   - Linear / Jira / Asana / ClickUp → task updates (saves to data/tasks/)
//
// All data is saved in a normalized JSON format that merge_report.cjs can consume.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse CLI args
let DAYS = 10;
let DRY_RUN = false;
let VERBOSE = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--days' && process.argv[i + 1]) { DAYS = parseInt(process.argv[i + 1], 10); i++; }
  if (process.argv[i] === '--dry-run') DRY_RUN = true;
  if (process.argv[i] === '--verbose') VERBOSE = true;
}

const CUTOFF = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directories
for (const sub of ['gmail', 'meetings', 'slack', 'crm', 'tasks']) {
  fs.mkdirSync(path.join(DATA_DIR, sub), { recursive: true });
}

// ─── Composio helpers ───

function composioExec(toolSlug, args) {
  const payload = JSON.stringify({ tools: [{ tool_slug: toolSlug, arguments: args }] });
  // Escape single quotes for shell
  const escaped = payload.replace(/'/g, "'\\''");
  try {
    const raw = execSync(
      `mcporter call clawdi-mcp.COMPOSIO_MULTI_EXECUTE_TOOL '${escaped}'`,
      { encoding: 'utf8', timeout: 90000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(raw);
    // Composio wraps results: {data:{results:[{output:...}]}} or {successful:true,data:{results:[...]}}
    const results = parsed?.data?.results || parsed?.results || [];
    if (Array.isArray(results) && results[0]?.output) return results[0].output;
    if (Array.isArray(results) && results[0]?.data) return results[0].data;
    if (parsed?.tools?.[0]?.output) return parsed.tools[0].output;
    if (parsed?.data) return parsed.data;
    return parsed;
  } catch (e) {
    if (VERBOSE) console.warn(`  [composio] ${toolSlug} failed: ${e.message}`);
    return null;
  }
}

function composioSearch(query) {
  try {
    const raw = execSync(
      `mcporter call clawdi-mcp.COMPOSIO_SEARCH_TOOLS 'queries=["${query}"]'`,
      { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function isConnected(toolkit) {
  try {
    const raw = execSync(
      `mcporter call clawdi-mcp.COMPOSIO_MANAGE_CONNECTIONS 'toolkits=["${toolkit}"]'`,
      { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(raw);
    // Check if connection is active — COMPOSIO_MANAGE_CONNECTIONS returns {data:{results:{toolkit:{has_active_connection:bool}}}}
    const results = parsed?.data?.results || parsed?.results || {};
    const info = results[toolkit] || Object.values(results)[0] || {};
    return info?.has_active_connection === true || parsed?.connected === true || parsed?.status === 'active';
  } catch (e) {
    return false;
  }
}

// ─── Normalized data format ───
// Every source outputs items in this shape:
// {
//   id, source, sourceType, date, dateStr, title, body, participants,
//   actionItems[], tags[], metadata{}
// }

function normalize(item) {
  return {
    id: item.id || `${item.source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: item.source || 'unknown',
    sourceType: item.sourceType || 'unknown',
    date: item.date || new Date().toISOString(),
    dateStr: item.dateStr || new Date(item.date || Date.now()).toISOString().split('T')[0],
    title: item.title || '',
    body: item.body || '',
    participants: item.participants || [],
    actionItems: item.actionItems || [],
    tags: item.tags || [],
    metadata: item.metadata || {}
  };
}

// ─── Source fetchers ───

const sources = {

  // ═══ Gmail ═══
  gmail: {
    toolkit: 'gmail',
    name: 'Gmail',
    async fetch() {
      const afterDate = CUTOFF.toISOString().split('T')[0].replace(/-/g, '/');
      const result = composioExec('GMAIL_FETCH_EMAILS', {
        max_results: 50,
        query: `after:${afterDate} -category:promotions -category:social`
      });
      if (!result) return [];

      const emails = result.messages || result.emails || [];
      return emails.map(e => normalize({
        id: e.id || e.messageId,
        source: 'gmail',
        sourceType: 'email',
        date: e.date || e.internalDate,
        title: e.subject || '(no subject)',
        body: (e.snippet || e.body || '').substring(0, 2000),
        participants: [e.from, ...(e.to || '').split(',')].filter(Boolean).map(p => p.trim()),
        tags: (e.labelIds || []).map(l => l.toLowerCase()),
        metadata: { threadId: e.threadId, from: e.from, to: e.to }
      }));
    }
  },

  // ═══ Slack (via Composio — complements fbtrack's direct Slack sync) ═══
  slack: {
    toolkit: 'slack',
    name: 'Slack',
    async fetch() {
      // Get recent channel messages
      const result = composioExec('SLACK_LIST_CONVERSATIONS', { limit: 20 });
      if (!result) return [];

      const channels = result.channels || [];
      const allMessages = [];

      for (const ch of channels.slice(0, 10)) {
        const oldest = Math.floor(CUTOFF.getTime() / 1000);
        const msgs = composioExec('SLACK_GET_CHANNEL_HISTORY', {
          channel: ch.id,
          oldest: String(oldest),
          limit: 50
        });
        if (!msgs) continue;

        const messages = msgs.messages || [];
        for (const m of messages) {
          allMessages.push(normalize({
            id: `slack-${ch.id}-${m.ts}`,
            source: `slack:${ch.name || ch.id}`,
            sourceType: 'chat',
            date: new Date(parseFloat(m.ts) * 1000).toISOString(),
            title: ch.name || ch.id,
            body: m.text || '',
            participants: [m.user].filter(Boolean),
            metadata: { channel: ch.name, channelId: ch.id, ts: m.ts }
          }));
        }
      }

      return allMessages;
    }
  },

  // ═══ Google Meet ═══
  'google-meet': {
    toolkit: 'googlemeet',
    name: 'Google Meet',
    async fetch() {
      // Google Meet notes end up in Google Drive or Calendar
      const result = composioExec('GOOGLECALENDAR_LIST_EVENTS', {
        time_min: CUTOFF.toISOString(),
        time_max: new Date().toISOString(),
        max_results: 50
      });
      if (!result) return [];

      const events = (result.items || result.events || [])
        .filter(e => e.conferenceData || (e.description || '').includes('meet.google.com'));

      return events.map(e => normalize({
        id: e.id,
        source: 'google-meet',
        sourceType: 'meeting',
        date: e.start?.dateTime || e.start?.date,
        title: e.summary || 'Google Meet',
        body: e.description || '',
        participants: (e.attendees || []).map(a => a.email).filter(Boolean),
        metadata: {
          meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri,
          status: e.status,
          organizer: e.organizer?.email
        }
      }));
    }
  },

  // ═══ Zoom ═══
  zoom: {
    toolkit: 'zoom',
    name: 'Zoom',
    async fetch() {
      const result = composioExec('ZOOM_LIST_ALL_RECORDINGS', {
        from: CUTOFF.toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      });
      if (!result) return [];

      const meetings = result.meetings || [];
      return meetings.map(m => normalize({
        id: m.id || m.uuid,
        source: 'zoom',
        sourceType: 'meeting',
        date: m.start_time,
        title: m.topic || 'Zoom Meeting',
        body: m.summary || '',
        participants: (m.participants || []).map(p => p.email || p.name).filter(Boolean),
        actionItems: [],
        metadata: { duration: m.duration, recording_url: m.share_url }
      }));
    }
  },

  // ═══ Microsoft Teams ═══
  teams: {
    toolkit: 'microsoftteams',
    name: 'Microsoft Teams',
    async fetch() {
      const result = composioExec('MICROSOFTTEAMS_LIST_JOINED_TEAMS', {});
      if (!result) return [];

      const teams = result.value || [];
      const allMessages = [];

      for (const team of teams.slice(0, 5)) {
        const channels = composioExec('MICROSOFTTEAMS_LIST_CHANNELS', { team_id: team.id });
        if (!channels) continue;

        for (const ch of (channels.value || []).slice(0, 3)) {
          const msgs = composioExec('MICROSOFTTEAMS_GET_CHANNEL_MESSAGES', {
            team_id: team.id,
            channel_id: ch.id
          });
          if (!msgs) continue;

          for (const m of (msgs.value || [])) {
            if (new Date(m.createdDateTime) < CUTOFF) continue;
            allMessages.push(normalize({
              id: m.id,
              source: `teams:${team.displayName}/${ch.displayName}`,
              sourceType: 'chat',
              date: m.createdDateTime,
              title: `${team.displayName} / ${ch.displayName}`,
              body: m.body?.content || '',
              participants: [m.from?.user?.displayName].filter(Boolean),
              metadata: { teamId: team.id, channelId: ch.id }
            }));
          }
        }
      }

      return allMessages;
    }
  },

  // ═══ Fathom ═══
  fathom: {
    toolkit: 'fathom',
    name: 'Fathom',
    async fetch() {
      const result = composioExec('FATHOM_LIST_CALLS', {});
      if (!result) return [];

      return (result.calls || [])
        .filter(c => new Date(c.created_at || c.date) >= CUTOFF)
        .map(c => normalize({
          id: c.id,
          source: 'fathom',
          sourceType: 'meeting',
          date: c.created_at || c.date,
          title: c.title || 'Fathom Meeting',
          body: c.summary || '',
          participants: c.participants || [],
          actionItems: c.action_items || [],
          metadata: { duration: c.duration }
        }));
    }
  },

  // ═══ Fireflies (via Composio) ═══
  fireflies: {
    toolkit: 'fireflies',
    name: 'Fireflies',
    async fetch() {
      const result = composioExec('FIREFLIES_GET_TRANSCRIPTS', { limit: 50 });
      if (!result) return [];

      return (result.transcripts || [])
        .filter(t => new Date(t.date) >= CUTOFF)
        .map(t => normalize({
          id: t.id,
          source: 'fireflies',
          sourceType: 'meeting',
          date: t.date,
          title: t.title || 'Meeting',
          body: t.summary?.overview || '',
          participants: t.participants || [],
          actionItems: t.summary?.action_items ? t.summary.action_items.split('\n').filter(Boolean) : [],
          metadata: { duration: t.duration, organizer: t.organizer_email }
        }));
    }
  },

  // ═══ HubSpot ═══
  hubspot: {
    toolkit: 'hubspot',
    name: 'HubSpot',
    async fetch() {
      // Fetch recent engagements (calls, meetings, notes)
      const result = composioExec('HUBSPOT_LIST_ENGAGEMENTS', {
        limit: 50
      });
      if (!result) return [];

      const engagements = result.results || [];
      return engagements
        .filter(e => new Date(e.properties?.hs_timestamp || e.createdAt) >= CUTOFF)
        .map(e => normalize({
          id: e.id,
          source: 'hubspot',
          sourceType: 'crm-activity',
          date: e.properties?.hs_timestamp || e.createdAt,
          title: e.properties?.hs_engagement_type || 'HubSpot Activity',
          body: e.properties?.hs_body_preview || e.metadata?.body || '',
          participants: (e.associations?.contacts || []).map(c => c.id),
          metadata: {
            type: e.properties?.hs_engagement_type,
            companyIds: e.associations?.companies?.map(c => c.id) || []
          }
        }));
    }
  },

  // ═══ Salesforce ═══
  salesforce: {
    toolkit: 'salesforce',
    name: 'Salesforce',
    async fetch() {
      const cutoffStr = CUTOFF.toISOString();
      const result = composioExec('SALESFORCE_SOQL_QUERY', {
        query: `SELECT Id, Subject, Description, ActivityDate, WhoId, WhatId, Status FROM Task WHERE CreatedDate >= ${cutoffStr} ORDER BY CreatedDate DESC LIMIT 50`
      });
      if (!result) return [];

      return (result.records || []).map(r => normalize({
        id: r.Id,
        source: 'salesforce',
        sourceType: 'crm-activity',
        date: r.ActivityDate || r.CreatedDate,
        title: r.Subject || 'Salesforce Task',
        body: r.Description || '',
        tags: [r.Status].filter(Boolean),
        metadata: { whoId: r.WhoId, whatId: r.WhatId, status: r.Status }
      }));
    }
  },

  // ═══ Pipedrive ═══
  pipedrive: {
    toolkit: 'pipedrive',
    name: 'Pipedrive',
    async fetch() {
      const result = composioExec('PIPEDRIVE_GET_ALL_ACTIVITIES', {
        start: 0, limit: 50,
        start_date: CUTOFF.toISOString().split('T')[0]
      });
      if (!result) return [];

      return (result.data || []).map(a => normalize({
        id: String(a.id),
        source: 'pipedrive',
        sourceType: 'crm-activity',
        date: a.due_date || a.add_time,
        title: a.subject || 'Pipedrive Activity',
        body: a.note || '',
        participants: [a.person_name, a.org_name].filter(Boolean),
        metadata: { type: a.type, done: a.done, dealId: a.deal_id, orgName: a.org_name }
      }));
    }
  },

  // ═══ Linear ═══
  linear: {
    toolkit: 'linear',
    name: 'Linear',
    async fetch() {
      const result = composioExec('LINEAR_LIST_LINEAR_ISSUES', {
        first: 50,
        filter: { updatedAt: { gte: CUTOFF.toISOString() } }
      });
      if (!result) return [];

      const issues = result.nodes || result.issues || [];
      return issues.map(i => normalize({
        id: i.id || i.identifier,
        source: 'linear',
        sourceType: 'task',
        date: i.updatedAt || i.createdAt,
        title: `${i.identifier || ''} ${i.title}`.trim(),
        body: i.description || '',
        participants: [i.assignee?.name].filter(Boolean),
        tags: [i.state?.name, i.priority ? `P${i.priority}` : null].filter(Boolean),
        metadata: {
          state: i.state?.name,
          priority: i.priority,
          assignee: i.assignee?.name,
          teamName: i.team?.name,
          url: i.url
        }
      }));
    }
  },

  // ═══ Jira ═══
  jira: {
    toolkit: 'jira',
    name: 'Jira',
    async fetch() {
      const cutoffStr = CUTOFF.toISOString().split('T')[0];
      const result = composioExec('JIRA_JQL_SEARCH', {
        jql: `updated >= "${cutoffStr}" ORDER BY updated DESC`,
        maxResults: 50
      });
      if (!result) return [];

      return (result.issues || []).map(i => normalize({
        id: i.key,
        source: 'jira',
        sourceType: 'task',
        date: i.fields?.updated || i.fields?.created,
        title: `${i.key} ${i.fields?.summary}`,
        body: i.fields?.description || '',
        participants: [i.fields?.assignee?.displayName, i.fields?.reporter?.displayName].filter(Boolean),
        tags: [i.fields?.status?.name, i.fields?.priority?.name].filter(Boolean),
        metadata: {
          status: i.fields?.status?.name,
          priority: i.fields?.priority?.name,
          assignee: i.fields?.assignee?.displayName
        }
      }));
    }
  },

  // ═══ Asana ═══
  asana: {
    toolkit: 'asana',
    name: 'Asana',
    async fetch() {
      const result = composioExec('ASANA_SEARCH_TASKS_IN_A_WORKSPACE', {
        'modified_since': CUTOFF.toISOString(),
        limit: 50
      });
      if (!result) return [];

      return (result.data || []).map(t => normalize({
        id: t.gid,
        source: 'asana',
        sourceType: 'task',
        date: t.modified_at || t.created_at,
        title: t.name || 'Asana Task',
        body: t.notes || '',
        participants: [t.assignee?.name].filter(Boolean),
        tags: [t.completed ? 'completed' : 'open'].filter(Boolean),
        metadata: { completed: t.completed, assignee: t.assignee?.name, projectName: t.projects?.[0]?.name }
      }));
    }
  },

  // ═══ ClickUp ═══
  clickup: {
    toolkit: 'clickup',
    name: 'ClickUp',
    async fetch() {
      const result = composioExec('CLICKUP_GET_TASKS', {
        date_updated_gt: CUTOFF.getTime()
      });
      if (!result) return [];

      return (result.tasks || []).map(t => normalize({
        id: t.id,
        source: 'clickup',
        sourceType: 'task',
        date: t.date_updated || t.date_created,
        title: t.name || 'ClickUp Task',
        body: t.description || '',
        participants: (t.assignees || []).map(a => a.username || a.email).filter(Boolean),
        tags: [t.status?.status].filter(Boolean),
        metadata: { status: t.status?.status, priority: t.priority?.priority }
      }));
    }
  }
};

// ─── Main sync loop ───

async function main() {
  console.log(`\n🔄 Composio Unified Sync — last ${DAYS} days`);
  console.log(`   Cutoff: ${CUTOFF.toISOString()}\n`);

  const syncResults = {};
  let totalItems = 0;
  const disconnected = [];

  for (const [key, source] of Object.entries(sources)) {
    process.stdout.write(`  ${source.name}... `);

    if (DRY_RUN) {
      console.log('(dry run, skipped)');
      continue;
    }

    // Check connection first
    if (!isConnected(source.toolkit)) {
      console.log('⚠ not connected');
      disconnected.push(source.name);
      continue;
    }

    try {
      const items = await source.fetch();
      if (items && items.length > 0) {
        // Save to data/<sourceType>/<source>.json
        const outDir = path.join(DATA_DIR, items[0].sourceType === 'email' ? 'gmail' :
          items[0].sourceType === 'meeting' ? 'meetings' :
          items[0].sourceType === 'chat' ? 'slack' :
          items[0].sourceType === 'crm-activity' ? 'crm' :
          items[0].sourceType === 'task' ? 'tasks' : 'other');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
          path.join(outDir, `${key}.json`),
          JSON.stringify(items, null, 2)
        );

        syncResults[key] = items.length;
        totalItems += items.length;
        console.log(`✓ ${items.length} items`);
      } else {
        console.log('- no data (not connected or empty)');
      }
    } catch (e) {
      console.log(`✗ error: ${e.message}`);
    }
  }

  // Write sync metadata
  const meta = {
    syncedAt: new Date().toISOString(),
    days: DAYS,
    cutoff: CUTOFF.toISOString(),
    sources: syncResults,
    totalItems
  };
  fs.writeFileSync(path.join(DATA_DIR, 'sync-meta.json'), JSON.stringify(meta, null, 2));

  console.log(`\n📊 Total: ${totalItems} items from ${Object.keys(syncResults).length} sources`);
  console.log(`   Data saved to: ${DATA_DIR}/`);

  if (disconnected.length > 0) {
    console.log(`\n⚠ Not connected (${disconnected.length}): ${disconnected.join(', ')}`);
    console.log(`  → Connect these apps in the Clawdi dashboard (Composio settings) to include them in reports.`);
  }

  // Also write a combined file for merge_report.cjs
  const allItems = [];
  for (const sub of ['gmail', 'meetings', 'slack', 'crm', 'tasks']) {
    const dir = path.join(DATA_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (Array.isArray(data)) allItems.push(...data);
      } catch (e) { /* skip */ }
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'all-sources.json'), JSON.stringify(allItems, null, 2));
  console.log(`   Combined: ${allItems.length} items in data/all-sources.json\n`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
