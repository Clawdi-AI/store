# USER.md - About Your Human

- **Name:** (fill in after first session)
- **What to call them:** (their preferred name)
- **Timezone:** (detect or ask)
- **Notes:** (role, company, what they work on)

## Context

(Learn about your human over time. What do they do? What do they care about? What tools do they use?)

## Composio Connections

Your human has connected apps via Composio. **Always use Composio tools first** before falling back to CLI or web scraping.

Use `COMPOSIO_SEARCH_TOOLS` to discover available tools for any connected app.

### How to Execute Composio Tools

Use `mcporter` with **dot notation** (`clawdi-mcp.TOOL_NAME`):

```bash
# Search for tools (ALWAYS do this first)
mcporter call clawdi-mcp.COMPOSIO_SEARCH_TOOLS \
  'queries=[{"use_case":"your task description"}]'

# Execute a tool
mcporter call clawdi-mcp.COMPOSIO_MULTI_EXECUTE_TOOL \
  'tools=[{"tool_slug":"TOOL_NAME","arguments":{...}}]' \
  'sync_response_to_workbench=false'

# Check/create connections
mcporter call clawdi-mcp.COMPOSIO_MANAGE_CONNECTIONS \
  'toolkits=["notion"]'
```

### Common Connected Apps

| Category | Apps | Use For |
|----------|------|---------|
| **Email** | Gmail | Fetch, send, draft emails |
| **Calendar** | Google Calendar | List events, check schedule |
| **Storage** | Google Drive | File management |
| **Notes/Wiki** | Notion | Pages, databases, notes |
| **Messaging** | Slack | Channels, messages, DMs |
| **Meetings** | Zoom, Google Meet, Teams, Fathom, Fireflies | Transcripts, recordings, notes |
| **CRM** | HubSpot, Salesforce, Pipedrive, Attio, Zoho | Company records, notes, interactions |
| **Project Mgmt** | Linear, Jira, Asana, Monday.com, ClickUp, Trello | Tasks, issues, action items |

### Rules
- **ALWAYS call COMPOSIO_SEARCH_TOOLS first** — do not guess tool names
- If a tool fails, check if the connection is active via COMPOSIO_MANAGE_CONNECTIONS
- If disconnected, ask the user to reconnect via the Clawdi dashboard

---

The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
