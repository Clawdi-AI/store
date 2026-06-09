---
name: fbtrack-sync
description:
  Business conversation tracking and reporting. Syncs messages from Telegram and Slack,
  fetches Fireflies meeting transcripts, extracts structured insights via AI, and generates
  weekly partnership/business reports. Integrates with Attio CRM and Notion via Composio.
metadata:
  openclaw:
    emoji: "📈"
    requires:
      bins: ["node", "npm"]
      optional_bins: []
---

# fbtrack-sync — Business Conversation Tracker

## Overview

fbtrack is a CLI tool that syncs business conversations from multiple channels, uses AI to extract structured insights, and generates comprehensive weekly reports.

**Pipeline**: Telegram + Slack + Fireflies → AI Extraction → Merged Report → Notion + CRM

---

## Setup (First Time)

### 1. Install fbtrack

```bash
# Build fbtrack from the bundled source
cd skills/fbtrack-sync
npm install --legacy-peer-deps && npm run build

# Initialize directory structure
npx fbtrack init
```

### 2. Configure API Keys

Create `.env` in the fbtrack-sync directory with your credentials:

```bash
# Required for Telegram sync (get from https://my.telegram.org)
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# AI extraction: On Clawdi, use the platform proxy (no separate key needed).
# Extract from /root/.openclaw/openclaw.json — see AGENTS.md for details.
# Only set these if running fbtrack outside of Clawdi:
# OPENAI_API_KEY=your_openai_key
# OPENAI_BASE_URL=https://api.openai.com/v1
# OPENAI_MODEL=gpt-4o-mini

# Optional: Slack sync (or use Composio)
SLACK_BOT_TOKEN=xoxb-...
SLACK_USER_TOKEN=xoxp-...

# Optional: Fireflies meeting transcripts
FIREFLIES_API_KEY=ff-...

# Optional: Attio CRM sync
ATTIO_API_KEY=your_attio_key
```

### 3. Authenticate Telegram (if using)

```bash
cd skills/fbtrack-sync
npx fbtrack login
```

### 4. Configure Chats and Mappings

Copy the example config files and customize:

```bash
cp config/chats.txt.example config/chats.txt
cp config/channel-mappings.json.example config/channel-mappings.json
cp config/crm-mappings.json.example config/crm-mappings.json
```

Edit each file with your actual chat IDs, channel names, partner-to-CRM mappings, and internal email domain.

---

## Weekly Sync Pipeline

Run these steps in order to generate a complete weekly report:

```bash
cd skills/fbtrack-sync
set -a && . .env && set +a

# ── Step 1: Pull data from ALL connected sources ──

# Composio unified sync — auto-detects Gmail, Zoom, Meet, Teams,
# Fathom, Fireflies, Slack, HubSpot, Salesforce, Pipedrive, Linear,
# Jira, Asana, ClickUp — pulls everything into data/
node scripts/composio-unified-sync.cjs --days 10

# Telegram direct sync (Composio doesn't support Telegram)
npx fbtrack sync

# Slack direct sync (richer than Composio — both can coexist)
npx fbtrack slack-sync --days 10

# Fireflies direct API (optional — richer data than Composio)
node scripts/fetch_fireflies.cjs 10

# ── Step 2: AI extraction on conversation data ──
npx fbtrack extract --all --agent sales-extractor

# ── Step 3: Generate merged report (reads ALL data/) ──
node scripts/merge_report.cjs --date-range "Mar 18 - Mar 25, 2026"
cp /tmp/merged_report.md reports/weekly-report-$(date +%Y-%m-%d).md

# ── Step 4: Write back to CRM and project tools ──
node scripts/composio-crm-sync.js
node scripts/composio-action-items-sync.js --provider linear

# ── Step 5: Push report to Notion ──
# See "Push to Notion" section below
```

### How the unified sync works

`composio-unified-sync.cjs` auto-detects ALL connected Composio apps and pulls normalized data into `data/`:

| Connected App | Data Saved To | Type |
|--------------|---------------|------|
| Gmail | `data/gmail/` | Business emails |
| Zoom, Google Meet, Teams, Fathom, Fireflies | `data/meetings/` | Meeting transcripts & notes |
| Slack | `data/slack/` | Channel messages |
| HubSpot, Salesforce, Pipedrive, Attio, Zoho | `data/crm/` | CRM activities |
| Linear, Jira, Asana, ClickUp | `data/tasks/` | Task updates |

`merge_report.cjs` reads ALL of these directories plus fbtrack extractions and generates one unified report. Users only need to connect their tools in the Clawdi dashboard — no config needed.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `fbtrack init` | Scaffold directory structure and default configs |
| `fbtrack login` | Authenticate with Telegram via MTProto |
| `fbtrack sync` | Sync messages from tracked Telegram chats |
| `fbtrack slack-sync --days N` | Sync Slack channel messages |
| `fbtrack extract --all --agent <type>` | AI extraction of structured insights |
| `fbtrack report --weekly --agent <type>` | Generate weekly report |
| `fbtrack audit --interactive --agent <type>` | Manual quality review |

### Agent Types for Extraction

| Agent | Focus |
|-------|-------|
| `qa-extractor` | Q&A pairs, technical questions and answers |
| `sales-extractor` | Business insights, deal signals, partnership updates |
| `todo-extractor` | Action items and commitments |

---

## Push Report to Notion

After generating the weekly report, push it to Notion using Composio:

```bash
mcporter call clawdi-mcp COMPOSIO_MULTI_EXECUTE_TOOL --args "$(
  jq -Rs --arg parent '<NOTION_PARENT_PAGE_ID>' '{
    tools: [
      {
        tool_slug: "NOTION_CREATE_NOTION_PAGE",
        arguments: {
          parent_id: $parent,
          title: "Weekly Report YYYY-MM-DD",
          markdown: .
        }
      }
    ]
  }' reports/weekly-report-YYYY-MM-DD.md
)"
```

Replace `<NOTION_PARENT_PAGE_ID>` with the actual Notion page ID where reports should be stored.

---

## Composio Integrations (Multi-Tool Support)

The agent supports multiple tools for each category via Composio. Users connect their preferred tools in the Clawdi dashboard.

### Meeting Transcript Sources

| Tool | Script | Notes |
|------|--------|-------|
| Fireflies.ai | `scripts/fetch_fireflies.cjs` | Direct API (needs API key) |
| Zoom | `scripts/composio-meeting-sync.js --provider zoom` | Via Composio |
| Google Meet | `scripts/composio-meeting-sync.js --provider google-meet` | Via Composio (Drive transcripts) |
| Microsoft Teams | `scripts/composio-meeting-sync.js --provider teams` | Via Composio |
| Fathom | `scripts/composio-meeting-sync.js --provider fathom` | Via Composio |
| Auto-detect | `scripts/composio-meeting-sync.js` | Tries all connected providers |

### CRM Sync

| Tool | Script | Notes |
|------|--------|-------|
| Attio | `scripts/sync_attio_interactions.cjs` | Direct API (needs API key) |
| HubSpot | `scripts/composio-crm-sync.js --provider hubspot` | Via Composio |
| Salesforce | `scripts/composio-crm-sync.js --provider salesforce` | Via Composio |
| Pipedrive | `scripts/composio-crm-sync.js --provider pipedrive` | Via Composio |
| Zoho CRM | `scripts/composio-crm-sync.js --provider zoho` | Via Composio |
| Auto-detect | `scripts/composio-crm-sync.js` | Tries first connected CRM |

### Action Items → Project Management

| Tool | Script |
|------|--------|
| Linear | `scripts/composio-action-items-sync.js --provider linear` |
| Jira | `scripts/composio-action-items-sync.js --provider jira` |
| Asana | `scripts/composio-action-items-sync.js --provider asana` |
| Monday.com | `scripts/composio-action-items-sync.js --provider monday` |
| ClickUp | `scripts/composio-action-items-sync.js --provider clickup` |
| Trello | `scripts/composio-action-items-sync.js --provider trello` |
| Notion | `scripts/composio-action-items-sync.js --provider notion` |

---

## Scanning Scripts (for heartbeat integration)

### `scripts/scan-telegram.js`
Scans recent Telegram messages for high-priority keywords (urgent, blocker, contract, payment, etc.):
```bash
node skills/fbtrack-sync/scripts/scan-telegram.js --hours 4
```

### `scripts/scan-fireflies.js`
Reads cached Fireflies meeting data for recent partnership meetings:
```bash
node skills/fbtrack-sync/scripts/scan-fireflies.js --hours 8
```

Output: JSON with scored findings, suitable for heartbeat/cron integration.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `config/chats.txt` | Telegram chats to track (one per line) |
| `config/channel-mappings.json` | Slack channel names, Telegram chat labels, Fireflies meeting→partner mappings |
| `config/crm-mappings.json` | Partner→Attio company ID mappings, internal email domain |
| `.env` | API keys (never committed) |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "config not found" | Verify `config/` files exist — copy from `.example` files |
| "session not found" | Run `fbtrack login` to authenticate Telegram |
| API key errors | Check `.env` file, source it before running |
| Slack sync fails | Verify bot/user tokens have correct scopes |
| Fireflies empty | Check API key, ensure meetings exist in date range |
