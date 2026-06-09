// Scan cached Fireflies meeting data for recent partnership meetings
// Usage: node scripts/scan-fireflies.js --hours 8
//
// Reads /tmp/fireflies_recent.json (from fetch_fireflies.cjs).
// Output: JSON with scored findings, suitable for heartbeat/cron integration.

const fs = require('fs');

const HOURS = parseInt((process.argv.find((a, i) => process.argv[i - 1] === '--hours') || '8'), 10);
const CUTOFF = Date.now() - (HOURS * 60 * 60 * 1000);

let meetings = [];
try {
  const ffPath = '/tmp/fireflies_recent.json';
  if (fs.existsSync(ffPath)) {
    meetings = JSON.parse(fs.readFileSync(ffPath, 'utf8'));
  }
} catch (e) {
  console.error('No Fireflies data found. Run fetch_fireflies.cjs first.');
  process.exit(1);
}

const recent = meetings.filter(m => {
  const ts = new Date(m.date).getTime();
  return ts >= CUTOFF;
});

const partnershipMeetings = recent.filter(m => m.isPartnership);

const result = {
  scannedAt: new Date().toISOString(),
  hours: HOURS,
  totalRecent: recent.length,
  partnershipMeetings: partnershipMeetings.length,
  meetings: partnershipMeetings.map(m => ({
    title: m.title,
    date: m.dateStr,
    duration: m.duration,
    externalAttendees: m.externalAttendees || [],
    hasActionItems: !!(m.action_items && m.action_items.trim()),
    overviewPreview: (m.overview || '').substring(0, 200)
  }))
};

console.log(JSON.stringify(result, null, 2));
