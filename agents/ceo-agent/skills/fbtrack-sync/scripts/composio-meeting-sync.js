// Fetch meeting transcripts and notes from Composio-connected meeting tools
// Supports: Zoom, Google Meet, Microsoft Teams, Fathom, Fireflies (via Composio)
//
// Usage: node scripts/composio-meeting-sync.js --days 10 [--provider zoom|google-meet|teams|fathom|fireflies]
//
// This script uses Composio tools via mcporter. Ensure the user has connected
// the relevant app in their Clawdi dashboard.
//
// Output: /tmp/meetings_recent.json

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse CLI args
let DAYS = 10;
let PROVIDER = null; // null = auto-detect all connected providers
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--days' && process.argv[i + 1]) {
    DAYS = parseInt(process.argv[i + 1], 10);
    i++;
  }
  if (process.argv[i] === '--provider' && process.argv[i + 1]) {
    PROVIDER = process.argv[i + 1];
    i++;
  }
}

const CUTOFF = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

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

function composioSearch(query) {
  try {
    const result = execSync(
      `mcporter call clawdi-mcp COMPOSIO_SEARCH_TOOLS --args '{"query": "${query}"}' --output json`,
      { encoding: 'utf8', timeout: 30000 }
    );
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

// Provider-specific fetchers
const providers = {
  zoom: {
    name: 'Zoom',
    async fetch() {
      console.log('Fetching Zoom meeting recordings...');
      const result = composioCall('ZOOM_LIST_ALL_RECORDINGS', {
        from: CUTOFF.toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      });
      if (!result) return [];

      const meetings = result.meetings || result.data?.meetings || [];
      return meetings.map(m => ({
        id: m.id || m.uuid,
        title: m.topic || m.title || 'Zoom Meeting',
        date: m.start_time || m.date,
        dateStr: new Date(m.start_time || m.date).toISOString().split('T')[0],
        duration: m.duration,
        provider: 'zoom',
        participants: m.participants || [],
        overview: m.summary || '',
        action_items: '',
        recording_url: m.share_url || m.recording_url || ''
      }));
    }
  },

  'google-meet': {
    name: 'Google Meet',
    async fetch() {
      console.log('Fetching Google Meet recordings...');
      // Google Meet transcripts are typically in Google Drive
      const result = composioCall('GOOGLEDRIVE_SEARCH_FILE', {
        query: `mimeType contains 'document' and name contains 'Meeting' and modifiedTime > '${CUTOFF.toISOString()}'`
      });
      if (!result) return [];

      const files = result.files || result.data?.files || [];
      return files.map(f => ({
        id: f.id,
        title: f.name || 'Google Meet',
        date: f.modifiedTime || f.createdTime,
        dateStr: new Date(f.modifiedTime || f.createdTime).toISOString().split('T')[0],
        duration: null,
        provider: 'google-meet',
        participants: [],
        overview: f.description || '',
        action_items: '',
        file_url: f.webViewLink || ''
      }));
    }
  },

  teams: {
    name: 'Microsoft Teams',
    async fetch() {
      console.log('Fetching Microsoft Teams meeting transcripts...');
      const result = composioCall('MICROSOFTTEAMS_LIST_MEETING_TRANSCRIPTS', {});
      if (!result) return [];

      const transcripts = result.value || result.data?.value || [];
      return transcripts
        .filter(t => new Date(t.createdDateTime) >= CUTOFF)
        .map(t => ({
          id: t.id,
          title: t.meetingOrganizer?.displayName ? `Teams: ${t.meetingOrganizer.displayName}` : 'Teams Meeting',
          date: t.createdDateTime,
          dateStr: new Date(t.createdDateTime).toISOString().split('T')[0],
          duration: null,
          provider: 'teams',
          participants: [],
          overview: t.content || '',
          action_items: ''
        }));
    }
  },

  fathom: {
    name: 'Fathom',
    async fetch() {
      console.log('Fetching Fathom meeting notes...');
      const result = composioCall('FATHOM_LIST_CALLS', {});
      if (!result) return [];

      const calls = result.calls || result.data?.calls || [];
      return calls
        .filter(c => new Date(c.created_at || c.date) >= CUTOFF)
        .map(c => ({
          id: c.id,
          title: c.title || 'Fathom Meeting',
          date: c.created_at || c.date,
          dateStr: new Date(c.created_at || c.date).toISOString().split('T')[0],
          duration: c.duration,
          provider: 'fathom',
          participants: c.participants || [],
          overview: c.summary || '',
          action_items: (c.action_items || []).join('\n')
        }));
    }
  },

  fireflies: {
    name: 'Fireflies (Composio)',
    async fetch() {
      console.log('Fetching Fireflies transcripts via Composio...');
      const result = composioCall('FIREFLIES_GET_TRANSCRIPTS', {
        limit: 50
      });
      if (!result) return [];

      const transcripts = result.transcripts || result.data?.transcripts || [];
      return transcripts
        .filter(t => new Date(t.date) >= CUTOFF)
        .map(t => ({
          id: t.id,
          title: t.title || 'Fireflies Meeting',
          date: t.date,
          dateStr: new Date(t.date).toISOString().split('T')[0],
          duration: t.duration,
          provider: 'fireflies',
          participants: t.participants || [],
          overview: t.summary?.overview || '',
          action_items: t.summary?.action_items || ''
        }));
    }
  }
};

async function main() {
  console.log(`Fetching meetings from last ${DAYS} days...`);
  console.log(`Cutoff: ${CUTOFF.toISOString()}`);

  const allMeetings = [];
  const providersToFetch = PROVIDER ? [PROVIDER] : Object.keys(providers);

  for (const key of providersToFetch) {
    const provider = providers[key];
    if (!provider) {
      console.warn(`Unknown provider: ${key}`);
      continue;
    }

    try {
      const meetings = await provider.fetch();
      if (meetings.length > 0) {
        console.log(`  ${provider.name}: ${meetings.length} meetings found`);
        allMeetings.push(...meetings);
      } else {
        console.log(`  ${provider.name}: no recent meetings (may not be connected)`);
      }
    } catch (e) {
      console.warn(`  ${provider.name}: error - ${e.message}`);
    }
  }

  // Sort by date descending
  allMeetings.sort((a, b) => new Date(b.date) - new Date(a.date));

  const outPath = '/tmp/meetings_recent.json';
  fs.writeFileSync(outPath, JSON.stringify(allMeetings, null, 2));

  console.log(`\nTotal: ${allMeetings.length} meetings across ${new Set(allMeetings.map(m => m.provider)).size} providers`);
  console.log(`Saved to ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
