# Agent v2 Store Security

Never commit credentials, private keys, cookies, session data, populated local
profiles, or generated databases and logs. Secret values belong in
client-managed storage, not `plugin.json`, `mcp.json`, Skill content, or package
assets. Values committed in standard MCP `env` and `headers` fields must be
public and non-secret. Protected remote MCP authorization is performed by the
MCP client and managed by its host/runtime.

Review bundled executables and dependencies before publishing. Plugin packages
cannot declare installers, install hooks, OAuth registration, trust state, or
other privileged author-controlled behavior. Follow the repository root
`SECURITY.md` for private vulnerability reporting and incident response.
