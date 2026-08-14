# Clawdi Agent v2 Store

This is the independent Store root for Agent Plugins 1.0.0 packages. It does
not change or share validation with the legacy `agents/` and `skills/` Stores.

## Package layout

Add one package at `v2/plugins/<plugin-key>/`:

```text
v2/plugins/example-plugin/
|-- plugin.json                 required
|-- mcp.json                    optional
|-- skills/                     optional
|   `-- summarize/
|       `-- SKILL.md            required for each Skill
`-- assets, scripts, and docs   optional package files
```

The directory name must equal `plugin.json.name`, and `plugin.json.version`
must be an exact Semantic Version. Use only these canonical identifiers:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "example-plugin",
  "version": "1.0.0",
  "extensions": {
    "ai.clawdi": {
      "schemaVersion": 1,
      "display": {
        "name": "Example Plugin",
        "category": "productivity",
        "tags": ["reports"],
        "languages": ["en"]
      },
      "compatibility": {
        "runtimes": ["openclaw"],
        "executables": ["python3"]
      }
    }
  }
}
```

If present, `mcp.json` must use
`https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`. A package must have
at least one valid immediate-child Skill or MCP server. Skill `SKILL.md`
frontmatter follows the current Agent Skills field and type contract, including
name and description limits and parent-directory equality. Its only permitted
fields are `name`, `description`, `license`, `compatibility`, `metadata`, and
`allowed-tools`; metadata keys and values must be strings.

MCP servers may use `stdio`, `streamable-http`, or `sse`. Stdio commands are
bare executables or safe executable `./` paths; every bare command must appear
in `compatibility.executables`. Remote non-loopback URLs require HTTPS. Package
paths must be in-root `./` paths. In stdio `args`, `env`, and `cwd`, clients
expand `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` once; unknown placeholder-like text
remains literal. The `command` field is never expanded. Packages cannot assign
the client-owned environment variables.

Upstream treats remote URL and header strings as literal and performs no
placeholder expansion. As a stricter Store publication rule, `${...}` text is
rejected in remote URLs and header values to prevent content that resembles
unresolved secret interpolation.

Store validation accepts all three standard transports independently of a
runtime's connection capabilities. `compatibility.runtimes` names intended
install targets; it is not a transport capability matrix or proof that every
component can run there. Installers and runtimes must gate unsupported
`streamable-http`, legacy `sse`, and secret-binding behavior without treating
the portable package as invalid. In particular, this Store contract does not
claim Hermes support for `sse` or `configuration.secretSlots`.

## Clawdi extension

`extensions["ai.clawdi"]` is a closed, author-controlled schema at
`schemaVersion: 1`:

- `display` requires `name`, `category`, `tags`, and `languages`; `icon` is an
  optional in-package `./` file.
- `configuration.secretSlots` maps slot IDs to `label`, `description`,
  `required`, and one or more MCP bindings. Bindings target an existing stdio
  environment key or remote header and may add a bounded, non-secret header
  prefix.
- `compatibility` may list only `openclaw` and `hermes` runtimes and bare
  `executables`. If either list is present, it must not be empty.

Secret values, trust or review state, featured ranking, install counts,
arbitrary settings, install hooks, OAuth registration, and dependency
installers are not author-controlled extension data. Literal credential-bearing
MCP environment or header values are rejected; declare credentials as secret
slots only for targets that implement this Clawdi extension. Agent Plugins
1.0.0 defines no portable `secretRefs` field; authentication can instead remain
entirely client-managed.

## Validation and digest

Run from the repository root:

```bash
python3 -m pip install -r v2/requirements.txt
python3 v2/scripts/validate.py
python3 -m unittest discover -s v2/tests -v
```

Validation is offline and scans only `v2/plugins`. The canonical upstream
schemas are vendored under `v2/schemas/` for source review and audit. The
validator performs explicit validation of the supported 1.0.0 contract; it is
not a general JSON Schema evaluator.

Valid packages receive a `sha256-tree-v1` digest. Files are sorted by UTF-8
bytes of their relative POSIX paths. Each digest record is
`mode NUL path NUL byte-length NUL lowercase-content-sha256 LF`, using mode
`100644` or `100755`, and the SHA-256 of all records is reported. Symlinks,
special entries, ASCII control characters or DEL in paths, path escapes,
case-folded duplicate paths, and packages beyond the validator's bounded entry,
file, and byte limits are rejected.

See [CONTRIBUTING.md](CONTRIBUTING.md) for submission checks and
[SECURITY.md](SECURITY.md) for credential handling.

## Upstream contracts

- [Agent Plugins specification](https://agent-plugins.org/specification.md)
- [Plugin schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [MCP schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- [Loading and discovery](https://agent-plugins.org/client-implementers/loading-and-discovery.md)
- [MCP runtime](https://agent-plugins.org/client-implementers/mcp-runtime.md)
- [Agent Skills specification](https://agentskills.io/specification.md)
