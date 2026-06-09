# Open Source Release Checklist

Use this checklist before making the repository public or cutting a public
release.

## Required Checks

1. Run store validation:

   ```bash
   python3 scripts/validate.py
   ```

2. Scan the current tree for secrets:

   ```bash
   rg --hidden --glob '!/.git/**' --glob '!node_modules/**' \
     '(BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})'
   ```

3. Review `NOTICE` for every vendored third-party asset.

4. Confirm all committed `USER.md` files contain placeholders only.

5. Confirm trading, wallet, exchange, and financial workflows require user
   confirmation where money, orders, swaps, or credentials are involved.

## Git History

If this repository has private development history, deleted experiments, or old
templates that should not be published, create a clean public repository from
the current tree instead of exposing the full Git history.

One safe publication pattern is:

```bash
git archive --format=tar HEAD | tar -x -C /path/to/new-public-repo
cd /path/to/new-public-repo
git init
git add .
git commit -m "Initial public release"
```

Do not use this as a substitute for secret rotation. If a real secret ever
entered Git history, revoke it even if the public release uses clean history.
