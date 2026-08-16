# Clawdi Agent v2 Store

This is the independent Store root for Agent Plugins 1.0.0 packages. It does
not change or share validation with the legacy `agents/` and `skills/` Stores.
Clawdi's first-party Skill and MCP capabilities are built into its Cloud/runtime
projection, not distributed as an installable Agent Plugin, and therefore do
not appear in this Store catalog.

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
  "keywords": ["reports"],
  "extensions": {
    "ai.clawdi": {
      "schemaVersion": 1,
      "display": {
        "name": "Example Plugin",
        "category": "productivity",
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
`streamable-http` and legacy `sse` behavior without treating the portable
package as invalid. In particular, this Store contract does not claim Hermes
support for `sse`.

## Clawdi extension

`extensions["ai.clawdi"]` is a closed, author-controlled schema at
`schemaVersion: 1`:

- `display` requires `name`, `category`, and `languages`; `icon` is an optional
  in-package `./` file. The Store requires the standard top-level `keywords`
  field for search and discovery instead of duplicating tags in the extension.
- `compatibility` may list only `openclaw` and `hermes` runtimes and bare
  `executables`. If either list is present, it must not be empty.

Secret values, trust or review state, featured ranking, install counts,
arbitrary settings, configuration, install hooks, OAuth registration, and
dependency installers are not author-controlled extension data. Values
committed in standard MCP `env` or `headers` fields must be public and
non-secret. For protected remote MCP servers, standard MCP Authorization is
performed by the MCP client and managed by its host/runtime, not declared as
Store package authentication metadata.

## Source-built packages

Third-party Skills may be packaged from immutable upstream GitHub commits
without checking their files into this branch. A closed recipe under
`v2/source-packages/<name>/` maps selected upstream directories into a standard,
self-contained Agent Plugin. CI downloads the pinned commit, rejects unsafe
archive entries, validates the complete package, and reproduces a deterministic
`.tar.gz` artifact. `release.json` binds its GitHub Release URL, archive SHA-256,
package `sha256-tree-v1` digest, and catalog projection.

Published release assets are immutable. The publish workflow creates a missing
asset, treats an existing byte-identical asset as a no-op, and fails rather than
overwriting different bytes. Runtime clients verify both digests before native
installation. Upstream source files exist in the release artifact because Agent
Plugins 1.0.0 packages must be self-contained; they are not retained in Store
main or a developer checkout.

## Generated Store index

`v2/catalog.json` is a Clawdi Store index, not an Agent Plugins standard field.
It is generated only from packages that pass the validation above:

```bash
python3 v2/scripts/catalog.py --write
```

The closed `schemaVersion: 2` entry is a normalized listing and resolution
projection. It contains package `name` and `version`; `displayName`, optional
`description` and `publisher`, `category`, standard `keywords`, and `languages`;
declared `runtimes`; a closed `source` and optional in-Store `icon`; the
`sha256-tree-v1` `digest`;
`hasConfiguration`; and a closed `components` summary. `components.skills`
contains exact Skill names, while `components.mcpServers` maps exact server
names to declared `stdio`, `streamable-http`, or `sse` transports. It contains
no Skill bodies or descriptions and no MCP URLs, headers, commands, or
configuration data. Catalog-facing human strings and array items cannot
contain ASCII control characters or DEL.

`hasConfiguration` is retained for catalog schema compatibility and is always
`false`. Packages cannot declare `extensions["ai.clawdi"].configuration`.

For authored packages, `source.type: "store"` contains a path relative to the
directory containing `v2/catalog.json`; consumers bind it to the resolved Store
commit. For source-built packages, `source.type: "github-release"` contains a
canonical asset URL and archive SHA-256. Consumers persist the complete source
object and the tree digest. The index exposes one current published version per
plugin; it is not a multi-version registry. Existing installs remain pinned to
their original source and digests after a listing changes or is removed.

CI rejects generated-file drift. Its separate baseline check also rejects a
version regression or a changed digest for a `name` and `version` already
present in both catalogs; changed package bytes require a newer version. A
removed listing is intentionally absent from that comparison because it does
not change the package identity at its historical commit.

## Validation and digest

Run from the repository root:

```bash
python3 -m pip install -r v2/requirements.txt
python3 v2/scripts/source_package.py --check
python3 v2/scripts/catalog.py --write
python3 v2/scripts/validate.py
python3 -m unittest discover -s v2/tests -v
```

Local-package validation is offline. Source-package reproduction downloads only
the immutable GitHub commits declared by recipes, then compares generated locks
and catalog bytes. The canonical upstream
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

As audited on 2026-08-15, authoritative upstream `main` is
[`bd383552095128f6effe895b9257cfd580a6d179`](https://github.com/agentplugins/agent-plugins-spec/commit/bd383552095128f6effe895b9257cfd580a6d179).
The live and repository schemas are byte-identical to the vendored files:
plugin SHA-256 `0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883`
and MCP SHA-256 `6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb`.
The adopted 1.0.0 contract defines no catalog, marketplace, registry, source,
integrity, or trust fields. Marketplace guidance remains unadopted
([issue 41](https://github.com/agentplugins/agent-plugins-spec/issues/41),
[discussion 42](https://github.com/agentplugins/agent-plugins-spec/discussions/42));
proposed top-level `displayName` and `icon` fields remain open and conflicting
([PR 17](https://github.com/agentplugins/agent-plugins-spec/pull/17),
[PR 19](https://github.com/agentplugins/agent-plugins-spec/pull/19)). Therefore
display metadata remains under `extensions["ai.clawdi"]` and catalog fields are
explicitly Clawdi-owned.

- [Agent Plugins specification](https://agent-plugins.org/specification.md)
- [Plugin schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [MCP schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- [Loading and discovery](https://agent-plugins.org/client-implementers/loading-and-discovery.md)
- [MCP runtime](https://agent-plugins.org/client-implementers/mcp-runtime.md)
- [MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Agent Skills specification](https://agentskills.io/specification.md)
