# Contributing to the Agent v2 Store

Keep each contribution inside one `v2/plugins/<plugin-key>/` package. Do not
add catalog metadata outside the supported `plugin.json`, `mcp.json`, and
`extensions["ai.clawdi"]` contracts. Include licenses and attribution for
third-party package assets where required.

Before opening a pull request, run:

```bash
python3 -m pip install -r v2/requirements.txt
python3 v2/scripts/validate.py
python3 -m unittest discover -s v2/tests -v
```

Review the reported `sha256-tree-v1` digest when package contents or executable
modes change. Validation does not replace dependency, license, or runtime
security review.
