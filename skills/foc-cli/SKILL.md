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
npx skills add FIL-Builders/foc-cli --skill foc-cli
npx skills add FIL-Builders/foc-cli --skill foc-docs
```

Store the installed upstream skill in the agent's normal skills directory as managed by `skills.sh` / the host agent. Do not vendor a second copy inside project repositories unless the user explicitly asks.

Refresh the upstream skill:

- at the start of a new long-running FOC task,
- whenever a command appears missing or behavior differs from this wrapper,
- after upstream `FIL-Builders/foc-cli` releases or documentation changes,
- at least weekly for active projects.

Use the same install command to refresh unless the host agent documents a more specific update command.

## CLI Version and Update Cadence

Prefer `npx foc-cli ...` so commands resolve through the current published package instead of a stale global install.

For active FOC work, check the CLI interface at the start of each session. If using a global install, update it at least weekly and whenever command help/schema disagrees with docs:

```bash
npm install -g foc-cli@latest
foc-cli --help
```

## Discovery First

Always inspect help or schema before running an operational command:

```bash
npx foc-cli --help
npx foc-cli <command> -h
npx foc-cli <command> --schema
```

Prefer structured output when an agent needs to parse results:

```bash
npx foc-cli <command> --json
```

## Common Starting Points

```bash
npx foc-cli wallet init --auto
npx foc-cli wallet balance --json
npx foc-cli wallet fund
npx foc-cli wallet deposit <amount>
npx foc-cli upload <path>
npx foc-cli dataset list --json
npx foc-cli provider list --json
```

## Documentation

For current Filecoin Onchain Cloud docs, use the companion `foc-docs` skill or query the CLI docs command:

```bash
npx foc-cli docs --prompt "upload files"
npx foc-cli docs --prompt "payments"
npx foc-cli docs --prompt "PDP"
```

## Safety

Wallet, deposit, withdrawal, upload, dataset termination, and mainnet actions can affect funds or persisted data. Explain the intended action and get explicit user confirmation before executing state-changing commands, especially with `--chain 314` mainnet.
