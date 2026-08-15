# Agent v2 Store Security

Never commit credentials, private keys, cookies, session data, populated local
profiles, or generated databases and logs. Secret values belong in
client-managed storage, not `plugin.json`, `mcp.json`, Skill content, or package
assets. Targets that implement the Clawdi extension may inject them through
`extensions["ai.clawdi"].configuration.secretSlots`; the extension is not a
portable Agent Plugins credential-reference mechanism.

Review bundled executables and dependencies before publishing. Plugin packages
cannot declare installers, install hooks, OAuth registration, trust state, or
other privileged author-controlled behavior. Follow the repository root
`SECURITY.md` for private vulnerability reporting and incident response.
