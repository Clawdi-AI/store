# Source-built Agent Plugins

Each directory is a release recipe for a self-contained Agent Plugin artifact.
Recipes pin immutable upstream GitHub commits and map selected directories into
the standard `skills/` layout. `package/` contains only Store-maintained plugin
metadata and optional MCP configuration. `release.json` is generated and binds
the resulting archive and package-tree digests.

Build and verify all recipes with:

```bash
python3 v2/scripts/source_package.py --check
```

The build uses a temporary directory. Upstream Skill files are not committed to
the Store branch; published release artifacts contain the complete validated
package required by Agent Plugins 1.0.0.
