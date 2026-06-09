# Contributing

Thanks for improving the Clawdi Store. This repository contains installable
agent and skill templates, so contributions should be safe to publish and safe
for users to fork.

## Before Opening a PR

Run the validator:

```bash
python3 scripts/validate.py
```

Check that your change does not include:

- Real API keys, tokens, private keys, wallet seed phrases, cookies, or session
  files
- Populated `USER.md` profiles with personal data
- Generated databases, logs, media downloads, or build output
- Unlicensed third-party assets

## Agent Template Guidelines

- Keep `agent.json`, `IDENTITY.md`, and bundled skills in sync.
- Keep `USER.md` as a placeholder template only. Runtime or personal values
  should stay in ignored local files or platform-managed storage.
- Document required external services and permissions clearly.
- Avoid requesting broad API permissions when narrower permissions work.
- For trading or financial workflows, require explicit user confirmation before
  executing transactions or orders.

## Third-Party Code and Assets

If you add vendored JavaScript, images, model prompts, datasets, or other
third-party material, add the source and license to `NOTICE`. If the license is
not compatible with this repository, do not vendor the asset.

## Validation Scope

`scripts/validate.py` checks store structure and manifest consistency. It does
not replace security review, dependency license review, or runtime testing of an
agent workspace.
