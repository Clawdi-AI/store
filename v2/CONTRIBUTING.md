# Contributing to the Agent v2 Store

Keep authored package data inside one `v2/plugins/<plugin-key>/` package. Use
top-level `plugin.json.keywords` for search and discovery; do not duplicate it
with extension tags. Never edit `v2/catalog.json` by hand: regenerate its
normalized projection after package changes. Include licenses and attribution
for third-party package assets where required.

Before opening a pull request, run:

```bash
python3 -m pip install -r v2/requirements.txt
python3 v2/scripts/catalog.py --write
python3 v2/scripts/validate.py
python3 -m unittest discover -s v2/tests -v
```

Review the reported `sha256-tree-v1` digest when package contents or executable
modes change. Once a `name` and `version` appear in the baseline catalog, their
digest is immutable; bump `plugin.json.version` before publishing changed
bytes. Validation does not replace dependency, license, or runtime security
review.
