# Source-built Agent Plugins

Each directory is a release recipe for a self-contained Agent Plugin artifact.
Recipes pin immutable upstream GitHub commits and map selected directories into
the standard `skills/` layout. `package/` contains only Store-maintained plugin
metadata and optional MCP configuration. `release.json` is generated and binds
the resulting archive and package-tree digests.

The Sui and Walrus packages retain the same three Walrus Sites skill names for
standalone installations. Both recipes source those skills from the same pinned
`MystenLabs/walrus-skills` commit and use identical mappings. Their packaged
skill directories must remain byte-identical, so native runtimes that deduplicate
skills by name cannot select conflicting instructions when both plugins are
installed. Update these shared mappings together and bump every changed package
version before publishing new immutable artifacts.

Schema 1 recipes preserve mapped Skill bytes. Schema 2 additionally supports
pinned package assets, explicit frontmatter normalization, and counted text
replacements for upstream packages that need a deterministic standards
projection. Unknown fields move to `upstream.<field>` metadata keys, and
no-op normalization declarations fail the build. These operations are
reproduced in `SOURCES.json`; they do not relax final package validation.

Build and verify all recipes with:

```bash
python3 v2/scripts/source_package.py --check
```

The build uses a temporary directory. Upstream Skill files are not committed to
the Store branch; published release artifacts contain the complete validated
package required by Agent Plugins 1.0.0.
