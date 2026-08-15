# Agent v2 Plugins

Each immediate child directory is an Agent Plugins 1.0.0 package. The v2 Store
validator ignores this README and treats every other entry as a plugin package.

`clawdi-cloud@1.0.0` is the first-party Clawdi package. Its portable component
names are `clawdi`. The package contains no credential configuration; Hosted
authentication is applied through the existing explicit egress profile
contract. Its canonical package identity is
`sha256-tree-v1:f47e156aa043d9f09f8e5e1e7dfa58a3300fb12699a716f887b633d4a21bc38c`.

Hosted activation must reference an exact commit in the public
`https://github.com/Clawdi-AI/store` repository containing these bytes. A
private review commit or mutable ref is not a deployable source identity.
