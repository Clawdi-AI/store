---
name: foc-cli
description: Use when working with Filecoin Onchain Cloud, foc-cli, Synapse SDK, storing files on Filecoin, PDP datasets, USDFC payments, wallets, deposits, uploads, providers, datasets, pieces, or decentralized cloud storage on Filecoin.
---

# foc-cli — Filecoin Onchain Cloud CLI

Use the upstream `foc-cli` as the source of truth for Filecoin Onchain Cloud operations.

Source: https://github.com/FIL-Builders/foc-cli

## Operating Principle

This store skill is a lightweight catalog wrapper. Do not rely on hardcoded command details here. Before taking action, discover the current upstream interface from the CLI itself.

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
