---
name: foc-cli
description: Use when working with Filecoin Onchain Cloud, foc-cli, Synapse SDK, storing files on Filecoin, PDP datasets, USDFC payments, wallets, deposits, uploads, providers, datasets, pieces, or decentralized cloud storage on Filecoin.
---

# foc-cli — Filecoin Onchain Cloud CLI

Use the upstream `foc-cli` as the source of truth for Filecoin Onchain Cloud operations.

Source: https://github.com/FIL-Builders/foc-cli

## Operating Principle

This store skill is a lightweight catalog wrapper. Do not rely on hardcoded command details here. The upstream `FIL-Builders/foc-cli` repository and the published `foc-cli` package are the source of truth.

## Upstream Skill Location and Sync

If the host agent supports installing external skills, install the upstream skill from GitHub rather than copying its contents into this store skill:

```bash
npx --yes skills add FIL-Builders/foc-cli --skill foc-cli --yes
npx --yes skills add FIL-Builders/foc-cli --skill foc-docs --yes
```

Use `--global --yes` only when a user-level install is desired. Store the installed upstream skill in the agent's normal skills directory as managed by `skills.sh` / the host agent. Do not vendor a second copy inside project repositories unless the user explicitly asks.

Refresh the upstream skill:

- at the start of a new long-running FOC task,
- whenever a command appears missing or behavior differs from this wrapper,
- after upstream `FIL-Builders/foc-cli` releases or documentation changes,
- at least weekly for active projects.

Preferred refresh commands:

```bash
npx --yes skills update foc-cli --yes
npx --yes skills update foc-docs --yes
```

For user-level installs, add `--global`; for project-level installs, add `--project` if the host agent needs an explicit scope.

## CLI Version and Update Cadence

Prefer `npx --yes foc-cli ...` so commands resolve through the current published package instead of a stale global install.

For active FOC work, check the CLI interface at the start of each session. If using a global install, update it at least weekly and whenever command help/schema disagrees with docs:

```bash
npm install -g foc-cli@latest
foc-cli --help
```

## Discovery First

Always inspect help or schema before running an operational command:

```bash
npx --yes foc-cli --help
npx --yes foc-cli <command> -h
npx --yes foc-cli <command> --schema
```

Prefer structured output when an agent needs to parse results:

```bash
npx --yes foc-cli <command> --json
```

## Common Starting Points

```bash
npx --yes foc-cli wallet init --auto
npx --yes foc-cli wallet balance --json
npx --yes foc-cli wallet fund
npx --yes foc-cli wallet deposit <amount>
npx --yes foc-cli upload <path>
npx --yes foc-cli dataset list --json
npx --yes foc-cli provider list --json
```

## Documentation

For current Filecoin Onchain Cloud docs, use the companion `foc-docs` skill or query the CLI docs command:

```bash
npx --yes foc-cli docs --prompt "upload files"
npx --yes foc-cli docs --prompt "payments"
npx --yes foc-cli docs --prompt "PDP"
```

## Safety

Wallet, deposit, withdrawal, upload, dataset termination, and mainnet actions can affect funds or persisted data. Explain the intended action and get explicit user confirmation before executing state-changing commands, especially with `--chain 314` mainnet.
