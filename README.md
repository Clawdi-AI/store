# Clawdi Store

Template store for **agents** and **skills** on the [Clawdi](https://clawdi.ai) platform.

## Structure

```
agents/           Agent templates (agent.json + workspace files)
skills/           Standalone skill templates (skill.json + SKILL.md)
scripts/          CI validation scripts
```

## Adding an Agent

1. Create `agents/your-agent-name/` directory
2. Add `agent.json` manifest (see schema below)
3. Add `IDENTITY.md` with name + emoji (must match agent.json)
4. Add `SOUL.md` with agent personality
5. Add skills under `skills/your-skill/SKILL.md`
6. Submit a PR — CI validates automatically

### agent.json Schema

```json
{
  "version": 1,
  "name": "My Agent",
  "emoji": "🤖",
  "description": "What this agent does (shown in catalog card)",
  "headline": "Short one-liner (shown in catalog list)",
  "category": "productivity",
  "author": "Your Name",
  "tags": ["tag1", "tag2"],
  "featured": false,
  "trust_level": "community",
  "languages": [],
  "suggested_prompts": [
    "How can you help me?",
    "Show me what you can do"
  ],
  "model": "claude-sonnet-4-6",
  "skills": {
    "inline": ["my-bundled-skill"],
    "remote": [
      {
        "slug": "external-skill",
        "source": "git",
        "url": "https://github.com/owner/repo",
        "subdir": "skills/external-skill"
      }
    ]
  }
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `version` | yes | int | Increment on updates. Frontend detects available upgrades. |
| `name` | yes | string | Display name (must match IDENTITY.md) |
| `emoji` | yes | string | Display emoji (must match IDENTITY.md) |
| `description` | yes | string | Full description for catalog detail page |
| `headline` | recommended | string | Short one-liner for catalog card |
| `category` | yes | string | e.g. `productivity`, `finance`, `marketing` |
| `author` | yes | string | Creator name |
| `tags` | yes | string[] | Searchable tags |
| `suggested_prompts` | recommended | string[] | Chat welcome prompts (max 4) |
| `featured` | recommended | bool | Show in featured section |
| `trust_level` | recommended | string | `community`, `verified`, or `official` |
| `languages` | recommended | string[] | Language codes, empty = all |
| `model` | optional | string | Suggested LLM model |
| `skills.inline` | optional | string[] | Skill directories under `skills/` |
| `skills.remote` | optional | object[] | External skill references |

### IDENTITY.md

Must contain name and emoji matching `agent.json`:

```markdown
- Name: My Agent
- Emoji: 🤖
```

### Directory Layout

```
agents/my-agent/
├── agent.json          # Manifest (required)
├── IDENTITY.md         # Name + emoji (required, must match agent.json)
├── SOUL.md             # Agent personality (recommended)
├── USER.md             # User context
├── README.md           # Shown on catalog detail page
├── skills/
│   └── my-skill/
│       ├── SKILL.md    # Skill definition (required per skill)
│       └── scripts/    # Implementation files
└── ...
```

## Adding a Skill (Standalone)

1. Create `skills/your-skill-name/` directory
2. Add `skill.json` manifest
3. Add `SKILL.md` with skill definition
4. Submit a PR

### skill.json Schema

```json
{
  "version": 1,
  "name": "Web Search",
  "emoji": "🔍",
  "description": "Search the web",
  "category": "productivity",
  "author": "Clawdi"
}
```

## How It Works

The Clawdi backend maintains a local shallow clone of this repo. Every 5 minutes:

1. `git pull` to fetch latest changes
2. Scan `agents/*/agent.json` → upsert agent catalog DB
3. Scan `skills/*/skill.json` → upsert skill catalog DB

Agent installation tars the entire directory and extracts it to the CVM workspace in a single RPC call.

## CI Validation

Every push and PR runs `scripts/validate.py` which checks:
- Required fields in agent.json / skill.json
- Type correctness (version=int, tags=array, etc.)
- IDENTITY.md exists and matches agent.json name/emoji
- Inline skills have SKILL.md
- No orphan skill directories

See `CONTRIBUTING.md` for contribution requirements and
`OPEN_SOURCE_RELEASE.md` for the public release checklist.

## Security and Publishing

- Keep committed `USER.md` files as placeholders only. Do not commit populated
  runtime profiles, credentials, wallet data, session files, local databases, or
  generated logs.
- Review `NOTICE` when adding vendored third-party assets.
- See `SECURITY.md` for vulnerability reporting, secret handling, and financial
  workflow guidance.

## License

MIT. See `LICENSE` and `NOTICE`.
