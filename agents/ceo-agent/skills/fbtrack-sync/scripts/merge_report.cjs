// Merge ALL data sources into a weekly business report
// Usage: node scripts/merge_report.cjs --date-range "Mar 18 - Mar 25, 2026"
//
// Reads from:
//   - data/all-sources.json (unified Composio sync output)
//   - data/extractions/ (fbtrack extract output)
//   - data/meetings/ (Composio meeting sync)
//   - data/gmail/ (Composio Gmail sync)
//   - data/slack/ (Composio Slack sync)
//   - data/crm/ (Composio CRM sync)
//   - data/tasks/ (Composio task sync)
//   - /tmp/fireflies_recent.json (direct Fireflies API)
//   - config/channel-mappings.json
//
// Output: /tmp/merged_report.md

const fs = require('fs');
const path = require('path');

// Parse CLI args
let dateRange = 'This Week';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--date-range' && process.argv[i + 1]) {
    dateRange = process.argv[i + 1];
    i++;
  }
}

const DATA_ROOT = path.join(__dirname, '..', 'data');

// Load config
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'channel-mappings.json');
let channelConfig = {};
try { channelConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) {}

const CRM_CONFIG_PATH = path.join(__dirname, '..', 'config', 'crm-mappings.json');
let crmConfig = {};
try { crmConfig = JSON.parse(fs.readFileSync(CRM_CONFIG_PATH, 'utf8')); } catch (e) {}

// ─── Load ALL data sources ───

function loadJsonDir(dirPath) {
  const items = [];
  try {
    if (!fs.existsSync(dirPath)) return items;
    for (const f of fs.readdirSync(dirPath).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
        if (Array.isArray(data)) items.push(...data);
        else items.push(data);
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
  return items;
}

// Unified items (from composio-unified-sync.cjs)
let allItems = [];
try {
  const allPath = path.join(DATA_ROOT, 'all-sources.json');
  if (fs.existsSync(allPath)) {
    allItems = JSON.parse(fs.readFileSync(allPath, 'utf8'));
  }
} catch (e) {}

// Also load individual directories (in case unified sync wasn't run)
const meetings = [
  ...loadJsonDir(path.join(DATA_ROOT, 'meetings')),
  ...allItems.filter(i => i.sourceType === 'meeting')
];
const emails = [
  ...loadJsonDir(path.join(DATA_ROOT, 'gmail')),
  ...allItems.filter(i => i.sourceType === 'email')
];
const chatMessages = [
  ...loadJsonDir(path.join(DATA_ROOT, 'slack')),
  ...allItems.filter(i => i.sourceType === 'chat')
];
const crmActivities = [
  ...loadJsonDir(path.join(DATA_ROOT, 'crm')),
  ...allItems.filter(i => i.sourceType === 'crm-activity')
];
const tasks = [
  ...loadJsonDir(path.join(DATA_ROOT, 'tasks')),
  ...allItems.filter(i => i.sourceType === 'task')
];
const extractions = loadJsonDir(path.join(DATA_ROOT, 'extractions'));

// Load Fireflies direct API data (backward compatible)
try {
  const ffPath = '/tmp/fireflies_recent.json';
  if (fs.existsSync(ffPath)) {
    const ffData = JSON.parse(fs.readFileSync(ffPath, 'utf8'));
    for (const m of ffData) {
      if (!meetings.find(x => x.title === m.title && x.dateStr === m.dateStr)) {
        meetings.push({
          id: m.id, source: 'fireflies', sourceType: 'meeting',
          date: m.date, dateStr: m.dateStr, title: m.title,
          body: m.overview || '', participants: m.participants || [],
          actionItems: m.action_items ? m.action_items.split('\n').filter(Boolean) : [],
          metadata: { duration: m.duration, isPartnership: m.isPartnership, isInternal: m.isInternal }
        });
      }
    }
  }
} catch (e) {}

// Dedup by id
function dedup(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = i.id || `${i.source}|${i.title}|${i.dateStr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const allMeetings = dedup(meetings);
const allEmails = dedup(emails);
const allChats = dedup(chatMessages);
const allCrm = dedup(crmActivities);
const allTasks = dedup(tasks);

// ─── Build report ───

const lines = [];
lines.push(`# Weekly Business Report`);
lines.push(`**Period**: ${dateRange}`);
lines.push(`**Generated**: ${new Date().toISOString().split('T')[0]}`);
lines.push('');

// Data sources summary
const sourceCounts = {};
for (const items of [allMeetings, allEmails, allChats, allCrm, allTasks, extractions]) {
  for (const i of items) {
    const src = i.source || 'unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }
}
if (Object.keys(sourceCounts).length > 0) {
  lines.push(`**Data sources**: ${Object.entries(sourceCounts).map(([s, c]) => `${s} (${c})`).join(', ')}`);
  lines.push('');
}

// ═══ Section 1: Meetings ═══
if (allMeetings.length > 0) {
  lines.push(`## Meetings (${allMeetings.length})`);
  lines.push('');

  // Group by source
  const bySource = {};
  for (const m of allMeetings) {
    const src = m.source || 'unknown';
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(m);
  }

  for (const [src, mList] of Object.entries(bySource)) {
    lines.push(`### ${src.charAt(0).toUpperCase() + src.slice(1)} (${mList.length})`);
    for (const m of mList.slice(0, 20)) {
      lines.push(`- **${m.title}** (${m.dateStr || ''})`);
      if (m.body) lines.push(`  - ${m.body.substring(0, 200)}${m.body.length > 200 ? '...' : ''}`);
      if (m.participants?.length > 0) lines.push(`  - Participants: ${m.participants.slice(0, 5).join(', ')}`);
      if (m.actionItems?.length > 0) {
        for (const ai of m.actionItems.slice(0, 3)) {
          lines.push(`  - **Action**: ${String(ai).substring(0, 100)}`);
        }
      }
    }
    if (mList.length > 20) lines.push(`- ... and ${mList.length - 20} more`);
    lines.push('');
  }
}

// ═══ Section 2: Email Highlights ═══
if (allEmails.length > 0) {
  lines.push(`## Email Highlights (${allEmails.length})`);
  lines.push('');

  // Show most recent / important
  for (const e of allEmails.slice(0, 15)) {
    const from = e.metadata?.from || e.participants?.[0] || '';
    lines.push(`- **${e.title}** — ${from} (${e.dateStr || ''})`);
    if (e.body) lines.push(`  - ${e.body.substring(0, 150)}${e.body.length > 150 ? '...' : ''}`);
  }
  if (allEmails.length > 15) lines.push(`- ... and ${allEmails.length - 15} more`);
  lines.push('');
}

// ═══ Section 3: Chat Conversations ═══
if (allChats.length > 0) {
  // Group by channel
  const byChannel = {};
  for (const m of allChats) {
    const ch = m.title || m.source || 'Unknown';
    if (!byChannel[ch]) byChannel[ch] = [];
    byChannel[ch].push(m);
  }

  lines.push(`## Chat Conversations (${Object.keys(byChannel).length} channels, ${allChats.length} messages)`);
  lines.push('');

  for (const [ch, msgs] of Object.entries(byChannel)) {
    lines.push(`### ${ch} (${msgs.length} messages)`);
    // Show summary — just count and date range
    const dates = msgs.map(m => m.dateStr).filter(Boolean).sort();
    if (dates.length > 0) {
      lines.push(`- Period: ${dates[0]} to ${dates[dates.length - 1]}`);
    }
    lines.push('');
  }
}

// ═══ Section 4: CRM Activity ═══
if (allCrm.length > 0) {
  lines.push(`## CRM Activity (${allCrm.length})`);
  lines.push('');

  const bySrc = {};
  for (const a of allCrm) {
    const src = a.source || 'unknown';
    if (!bySrc[src]) bySrc[src] = [];
    bySrc[src].push(a);
  }

  for (const [src, activities] of Object.entries(bySrc)) {
    lines.push(`### ${src.charAt(0).toUpperCase() + src.slice(1)} (${activities.length})`);
    for (const a of activities.slice(0, 10)) {
      lines.push(`- **${a.title}** (${a.dateStr || ''})`);
      if (a.body) lines.push(`  - ${a.body.substring(0, 150)}`);
    }
    if (activities.length > 10) lines.push(`- ... and ${activities.length - 10} more`);
    lines.push('');
  }
}

// ═══ Section 5: Task Updates ═══
if (allTasks.length > 0) {
  lines.push(`## Task Updates (${allTasks.length})`);
  lines.push('');

  const bySrc = {};
  for (const t of allTasks) {
    const src = t.source || 'unknown';
    if (!bySrc[src]) bySrc[src] = [];
    bySrc[src].push(t);
  }

  for (const [src, taskList] of Object.entries(bySrc)) {
    lines.push(`### ${src.charAt(0).toUpperCase() + src.slice(1)} (${taskList.length})`);
    for (const t of taskList.slice(0, 10)) {
      const assignee = t.metadata?.assignee || t.participants?.[0] || '';
      const status = t.tags?.[0] || '';
      lines.push(`- ${status ? `[${status}] ` : ''}**${t.title}**${assignee ? ` — ${assignee}` : ''}`);
    }
    if (taskList.length > 10) lines.push(`- ... and ${taskList.length - 10} more`);
    lines.push('');
  }
}

// ═══ Section 6: Conversation Insights (fbtrack extractions) ═══
if (extractions.length > 0) {
  lines.push(`## Conversation Insights (${extractions.length})`);
  lines.push('');

  const bySource = {};
  for (const e of extractions) {
    const source = e.chatTitle || e.source || 'Unknown';
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(e);
  }

  for (const [source, items] of Object.entries(bySource)) {
    lines.push(`### ${source}`);
    for (const item of items.slice(0, 10)) {
      if (item.summary) lines.push(`- ${item.summary}`);
      if (item.insight) lines.push(`- ${item.insight}`);
      if (item.action) lines.push(`  - **Action**: ${item.action}`);
    }
    if (items.length > 10) lines.push(`- ... and ${items.length - 10} more`);
    lines.push('');
  }
}

// ═══ Section 7: All Action Items ═══
const allActionItems = [];

// From meetings
for (const m of allMeetings) {
  if (m.actionItems?.length > 0) {
    for (const ai of m.actionItems) {
      allActionItems.push({ action: String(ai), source: m.title, date: m.dateStr });
    }
  }
}
// From extractions
for (const e of extractions) {
  if (e.action) {
    allActionItems.push({ action: e.action, source: e.chatTitle || 'Chat', date: e.date || '' });
  }
}
// From tasks
for (const t of allTasks) {
  if (t.tags?.includes('open') || !t.tags?.includes('completed')) {
    allActionItems.push({ action: t.title, source: t.source, date: t.dateStr, assignee: t.metadata?.assignee });
  }
}

if (allActionItems.length > 0) {
  lines.push(`## Action Items (${allActionItems.length})`);
  lines.push('');
  lines.push('| Owner | Action | Source | Date |');
  lines.push('|-------|--------|--------|------|');

  for (const ai of allActionItems.slice(0, 30)) {
    const owner = ai.assignee || 'TBD';
    lines.push(`| ${owner} | ${ai.action.substring(0, 80)} | ${ai.source} | ${ai.date || '-'} |`);
  }
  if (allActionItems.length > 30) lines.push(`\n*... and ${allActionItems.length - 30} more action items*`);
  lines.push('');
}

lines.push('---');
lines.push('*Report generated by CEO Agent (fbtrack + Composio)*');

const report = lines.join('\n');
const outPath = '/tmp/merged_report.md';
fs.writeFileSync(outPath, report);

const total = allMeetings.length + allEmails.length + allChats.length + allCrm.length + allTasks.length + extractions.length;
console.log(`Report written to ${outPath}`);
console.log(`Data: ${allMeetings.length} meetings, ${allEmails.length} emails, ${allChats.length} chats, ${allCrm.length} CRM, ${allTasks.length} tasks, ${extractions.length} extractions`);
console.log(`Total: ${total} items`);
