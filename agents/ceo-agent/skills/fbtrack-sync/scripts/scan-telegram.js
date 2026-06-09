// Scan recent Telegram messages for high-priority keywords
// Usage: node scripts/scan-telegram.js --hours 4
//
// Reads fbtrack data stores for recent messages and scores them by urgency.
// Output: JSON with scored findings, suitable for heartbeat/cron integration.

const fs = require('fs');
const path = require('path');

const HOURS = parseInt((process.argv.find((a, i) => process.argv[i - 1] === '--hours') || '4'), 10);
const CUTOFF = Date.now() - (HOURS * 60 * 60 * 1000);

const KEYWORDS = {
  critical: { words: ['urgent', 'blocker', 'down', 'outage', 'incident', 'broken'], weight: 10 },
  business: { words: ['contract', 'payment', 'invoice', 'deal', 'signed', 'budget', 'pricing'], weight: 7 },
  action: { words: ['deadline', 'asap', 'eod', 'by tomorrow', 'need by', 'overdue'], weight: 5 },
  partnership: { words: ['partner', 'integration', 'collaboration', 'onboarding', 'launch'], weight: 3 }
};

// Look for synced messages in data directory
const DATA_DIR = path.join(__dirname, '..', 'data', 'messages');
const findings = [];

try {
  if (fs.existsSync(DATA_DIR)) {
    const chatDirs = fs.readdirSync(DATA_DIR);
    for (const chatDir of chatDirs) {
      const chatPath = path.join(DATA_DIR, chatDir);
      if (!fs.statSync(chatPath).isDirectory()) continue;

      const files = fs.readdirSync(chatPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const messages = JSON.parse(fs.readFileSync(path.join(chatPath, file), 'utf8'));
          const msgList = Array.isArray(messages) ? messages : (messages.messages || []);

          for (const msg of msgList) {
            const ts = msg.date ? new Date(msg.date).getTime() : 0;
            if (ts < CUTOFF) continue;

            const text = (msg.text || msg.message || '').toLowerCase();
            if (!text) continue;

            let score = 0;
            const matched = [];

            for (const [category, config] of Object.entries(KEYWORDS)) {
              for (const word of config.words) {
                if (text.includes(word)) {
                  score += config.weight;
                  matched.push(`${category}:${word}`);
                }
              }
            }

            if (score > 0) {
              findings.push({
                chatId: chatDir,
                date: msg.date,
                score,
                keywords: matched,
                preview: (msg.text || msg.message || '').substring(0, 200),
                sender: msg.from || msg.sender_id || 'unknown'
              });
            }
          }
        } catch (e) { /* skip malformed */ }
      }
    }
  }
} catch (e) {
  console.error('Error scanning messages:', e.message);
}

// Sort by score descending
findings.sort((a, b) => b.score - a.score);

const result = {
  scannedAt: new Date().toISOString(),
  hours: HOURS,
  totalFindings: findings.length,
  critical: findings.filter(f => f.score >= 10).length,
  findings: findings.slice(0, 50)
};

console.log(JSON.stringify(result, null, 2));
