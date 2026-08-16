# Agent v2 Plugins

Each immediate child directory is an Agent Plugins 1.0.0 package. The v2 Store
validator ignores this README and treats every other entry as a plugin package.

Clawdi's first-party Skill and MCP capabilities are built into its Cloud/runtime
projection and are not installable Agent Plugin packages. Protected remote MCP
servers use standard MCP Authorization through the MCP client; authorization
and credentials are managed by the host/runtime rather than portable Store
package metadata.
