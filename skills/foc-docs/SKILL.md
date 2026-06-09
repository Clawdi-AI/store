---
name: foc-docs
description: Use when looking up current Filecoin Onchain Cloud documentation, Synapse SDK APIs, storage guides, payments, PDP concepts, Filecoin Pay, session keys, React integration, or FOC reference material.
---

# foc-docs — Filecoin Onchain Cloud Documentation

Use the upstream `foc-cli docs` command as the source of truth for Filecoin Onchain Cloud documentation.

Source: https://github.com/FIL-Builders/foc-cli

## Search First

Search by prompt when you need current docs:

```bash
npx foc-cli docs --prompt "upload files"
npx foc-cli docs --prompt "payments"
npx foc-cli docs --prompt "PDP"
npx foc-cli docs --prompt "Synapse SDK"
```

When a specific page is known, fetch it directly:

```bash
npx foc-cli docs --url <url>
npx foc-cli docs --url <url> --maxDepth 6
```

## Agent Guidance

- Treat the docs command output as authoritative over this wrapper.
- Use `--maxDepth 6` when API details or full examples are needed.
- Use `foc-cli` for operational commands after documentation lookup.
