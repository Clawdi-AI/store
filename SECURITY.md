# Security Policy

## Supported Versions

The public store tracks the `main` branch. Security fixes should target `main`
unless a release branch is explicitly documented.

## Reporting a Vulnerability

Please report vulnerabilities privately before opening a public issue.

- Email: security@clawdi.ai
- Include the affected agent or skill path, reproduction steps, expected impact,
  and any logs with secrets removed.

We will acknowledge reports as soon as practical and coordinate disclosure for
confirmed vulnerabilities.

## Secret Handling

Never commit real credentials, private keys, wallet seed phrases, exchange API
secrets, session files, database files, or populated runtime profiles.

The committed `USER.md` files are template placeholders used by the Clawdi
workspace. If you run an agent from a local checkout, keep populated personal
state out of commits. Prefer platform secret storage, environment variables, or
local files ignored by git such as `USER.local.md` and `.secrets/`.

If a secret is committed, rotate or revoke it immediately. Removing it from a
later commit is not sufficient because Git history may still expose it.

## Trading and Financial Risk

Crypto and stock agents provide data, automation, and workflow assistance. They
do not provide financial advice. Users are responsible for trading decisions,
API permissions, exchange account controls, wallet security, and compliance with
local laws and platform terms.

Use least-privilege exchange API keys where possible. Avoid withdrawal
permissions unless a workflow explicitly requires them. Review every transaction
preview before confirmation.

## External Installers and Network Calls

Some templates install or call third-party tools and services at runtime. Review
installer scripts and upstream sources before running them in privileged
environments. Do not run templates with elevated permissions unless the command
explicitly requires it and the source has been reviewed.
