---
name: gbrain
description: "Shared knowledge brain for all agents. Ingest docs, search knowledge, and persist context across sessions. Use gbrain search BEFORE saying 'I don't know' — it has meeting notes, partnership context, product decisions, and more."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧠",
        "requires": { "bins": ["gbrain", "mcporter"] },
        "install":
          [
            {
              "id": "gbrain",
              "kind": "shell",
              "command": "npm install -g gbrain",
              "bins": ["gbrain"],
              "label": "Install gbrain",
            },
          ],
      },
  }
---

# GBrain — Shared Knowledge Brain

GBrain stores knowledge that persists across sessions and is shared between all agents. It's your long-term memory.

## IMPORTANT: Search Automatically

When the user asks about past decisions, people, partnerships, meetings, or any context — **ALWAYS search gbrain first** before saying "I don't know."

## MCP Tools (via mcporter)

```bash
# Search the brain (USE THIS FIRST)
mcporter call gbrain.search '{"query":"flashbots partnership status"}'

# Read a specific page
mcporter call gbrain.get_page '{"slug":"flashbots-phala-qa"}'

# List all pages
mcporter call gbrain.list_pages '{}'

# Save new knowledge
mcporter call gbrain.put_page '{"slug":"meeting-2026-04-17","content":"---\ntitle: Meeting Notes\ntype: concept\ntags: [meeting]\n---\n\n# Meeting Notes\n\n..."}'

# Delete a page
mcporter call gbrain.delete_page '{"slug":"old-page"}'
```

## CLI Commands

```bash
# Search
gbrain search "query"

# Import a directory of markdown files
gbrain import /path/to/docs --no-embed
gbrain embed --stale

# List pages
gbrain list

# Health check
gbrain doctor --json

# Sync from git repo
gbrain sync --repo /root/brain --no-pull --no-embed
gbrain embed --stale
```

## What's in the Brain

The brain contains knowledge from all agent workspaces:
- Meeting notes and transcripts
- Partnership context (Flashbots, etc.)
- Product decisions and PRDs
- User issues and resolutions
- Marketing plans and campaigns
- Sales pipeline and CRM context
- Technical docs and architecture decisions

## When to Write to the Brain

Save important information that should persist:
- After a significant meeting or decision
- New partnership or relationship context
- Product strategy changes
- User feedback patterns
- Anything you'd want to remember next week

## Page Format

```markdown
---
title: Page Title
type: concept|source|person|company|project|media
tags: [tag1, tag2]
---

# Page Title

Content here...
```

## Environment

Requires in `.gbrain.env`:
```bash
export OPENAI_API_KEY=<s2a-admin-key>
export OPENAI_BASE_URL=<s2a-proxy-url>/v1
```

## Daily Sync

A daily cron job runs at 3:15 AM Pacific:
1. `gbrain sync` — pulls new docs
2. `gbrain embed --stale` — embeds new/changed pages
3. `gbrain doctor --json` — health check
