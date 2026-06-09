// Sync action items from meetings to project management tools via Composio
// Supports: Linear, Jira, Asana, Monday.com, ClickUp, Trello, Notion
//
// Usage: node scripts/composio-action-items-sync.js [--provider linear|jira|asana|monday|clickup|trello|notion]
//
// Reads: /tmp/merged_report.md and /tmp/meetings_recent.json
// Creates tasks/issues for action items found in meeting notes.

const { execSync } = require('child_process');
const fs = require('fs');

// Parse CLI args
let PROVIDER = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--provider' && process.argv[i + 1]) {
    PROVIDER = process.argv[i + 1];
    i++;
  }
}

function composioCall(toolSlug, args) {
  const argsJson = JSON.stringify({ tools: [{ tool_slug: toolSlug, arguments: args }] });
  try {
    const result = execSync(
      `mcporter call clawdi-mcp COMPOSIO_MULTI_EXECUTE_TOOL --args '${argsJson.replace(/'/g, "'\\''")}' --output json`,
      { encoding: 'utf8', timeout: 60000 }
    );
    return JSON.parse(result);
  } catch (e) {
    console.warn(`Composio call failed for ${toolSlug}: ${e.message}`);
    return null;
  }
}

// Load meetings
let meetings = [];
for (const p of ['/tmp/meetings_recent.json', '/tmp/fireflies_recent.json']) {
  try {
    if (fs.existsSync(p)) {
      meetings.push(...JSON.parse(fs.readFileSync(p, 'utf8')));
    }
  } catch (e) { /* skip */ }
}

// Extract action items from meetings
function extractActionItems(meetings) {
  const items = [];
  for (const m of meetings) {
    if (!m.action_items) continue;
    const lines = m.action_items.split('\n').filter(l => l.trim());
    for (const line of lines) {
      items.push({
        title: line.trim().replace(/^[-*•]\s*/, '').substring(0, 200),
        description: `From meeting: ${m.title} (${m.dateStr})\n\nFull overview: ${(m.overview || '').substring(0, 500)}`,
        source: m.title,
        date: m.dateStr,
        provider: m.provider || 'unknown'
      });
    }
  }
  return items;
}

// Provider implementations
const pmProviders = {
  linear: {
    name: 'Linear',
    async createTask(item) {
      return composioCall('LINEAR_CREATE_LINEAR_ISSUE', {
        title: item.title,
        description: item.description
      });
    }
  },
  jira: {
    name: 'Jira',
    async createTask(item) {
      return composioCall('JIRA_CREATE_ISSUE', {
        summary: item.title,
        description: item.description,
        issuetype: { name: 'Task' }
      });
    }
  },
  asana: {
    name: 'Asana',
    async createTask(item) {
      return composioCall('ASANA_CREATE_A_TASK', {
        name: item.title,
        notes: item.description
      });
    }
  },
  monday: {
    name: 'Monday.com',
    async createTask(item) {
      return composioCall('MONDAY_CREATE_ITEM', {
        item_name: item.title,
        column_values: JSON.stringify({ status: 'Working on it' })
      });
    }
  },
  clickup: {
    name: 'ClickUp',
    async createTask(item) {
      return composioCall('CLICKUP_CREATE_TASK', {
        name: item.title,
        description: item.description
      });
    }
  },
  trello: {
    name: 'Trello',
    async createTask(item) {
      return composioCall('TRELLO_CREATE_A_NEW_CARD', {
        name: item.title,
        desc: item.description
      });
    }
  },
  notion: {
    name: 'Notion',
    async createTask(item) {
      return composioCall('NOTION_CREATE_NOTION_PAGE', {
        title: item.title,
        markdown: item.description
      });
    }
  }
};

async function main() {
  const actionItems = extractActionItems(meetings);
  console.log(`Found ${actionItems.length} action items from ${meetings.length} meetings.`);

  if (actionItems.length === 0) {
    console.log('No action items to sync.');
    return;
  }

  const providersToTry = PROVIDER ? [PROVIDER] : Object.keys(pmProviders);
  let activePm = null;

  for (const key of providersToTry) {
    const pm = pmProviders[key];
    if (!pm) continue;
    activePm = { key, ...pm };
    console.log(`Using ${pm.name} for action item tracking.`);
    break;
  }

  if (!activePm) {
    console.error('No project management tool specified. Use --provider to select one.');
    process.exit(1);
  }

  let created = 0;
  for (const item of actionItems) {
    try {
      const result = await activePm.createTask(item);
      if (result) {
        console.log(`  ✓ Created: ${item.title.substring(0, 60)}...`);
        created++;
      }
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nCreated ${created}/${actionItems.length} tasks in ${activePm.name}.`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
