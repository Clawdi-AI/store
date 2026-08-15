# Agent v2 Plugins

Each immediate child directory is an Agent Plugins 1.0.0 package. The v2 Store
validator ignores this README and treats every other entry as a plugin package.

`clawdi@1.0.0` is the first-party Clawdi package. Its package, Skill, MCP server,
and `X-Clawdi-Agent-Plugin` marker use the canonical name `clawdi`. The package
contains no credential configuration; Hosted
authentication is applied through the existing explicit egress profile
contract. Its canonical package identity is
`sha256-tree-v1:6a9c13c187de7f8a2b9e59e3a9e1ef25b39e07ad6687f92d2d6dcaf2c12a27d3`.

Hosted activation must reference an exact commit in the public
`https://github.com/Clawdi-AI/store` repository containing these bytes. A
private review commit or mutable ref is not a deployable source identity.
The generated Store index intentionally omits that commit; consumers bind it
from the externally resolved snapshot.
