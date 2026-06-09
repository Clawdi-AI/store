---
name: foc-docs
description: Use when looking up current Filecoin Onchain Cloud documentation, Synapse SDK APIs, storage guides, payments, PDP concepts, Filecoin Pay, session keys, React integration, or FOC reference material.
---

# foc-docs — Filecoin Onchain Cloud Documentation

Use the upstream `foc-cli docs` command as the source of truth for Filecoin Onchain Cloud documentation.

Source: https://github.com/FIL-Builders/foc-cli

## Upstream Skill Location and Sync

If the host agent supports installing external skills, install the upstream docs skill from GitHub:

```bash
npx --yes skills add FIL-Builders/foc-cli --skill foc-docs --yes
```

Use `--global --yes` only when a user-level install is desired. Store it in the agent's normal skills directory as managed by `skills.sh` / the host agent. This store skill should remain a lightweight catalog wrapper, not a copied documentation bundle.

Refresh the upstream docs skill:

- at the start of a new long-running FOC documentation or implementation task,
- whenever docs output seems stale or incomplete,
- after upstream `FIL-Builders/foc-cli` or Filecoin Onchain Cloud docs changes,
- at least weekly for active projects.

Preferred refresh command:

```bash
npx --yes skills update foc-docs --yes
```

For user-level installs, add `--global`; for project-level installs, add `--project` if the host agent needs an explicit scope. Use `npx --yes foc-cli docs ...` for live documentation lookup so results track the current published CLI/docs integration.

## Search First

Search by prompt when you need current docs:

```bash
npx --yes foc-cli docs --prompt "upload files"
npx --yes foc-cli docs --prompt "payments"
npx --yes foc-cli docs --prompt "PDP"
npx --yes foc-cli docs --prompt "Synapse SDK"
```

When a specific page is known, fetch it directly:

```bash
npx --yes foc-cli docs --url <url>
npx --yes foc-cli docs --url <url> --maxDepth 6
```

## Agent Guidance

- Treat the docs command output as authoritative over this wrapper.
- Use `--maxDepth 6` when API details or full examples are needed.
- Use `foc-cli` for operational commands after documentation lookup.
