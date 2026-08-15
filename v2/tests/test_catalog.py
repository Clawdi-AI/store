from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from v2.scripts.catalog import (
    check_catalog,
    check_version_immutability,
    generate_catalog,
    render_catalog,
    validate_catalog,
)
from v2.scripts.plugin_package import compute_package_digest
from v2.scripts.plugin_validation import MCP_SCHEMA, PLUGIN_SCHEMA, PluginReport
from v2.scripts.validate import PLUGINS_ROOT, validate_store

V2_ROOT = Path(__file__).resolve().parents[1]
CLAWDI_DIGEST = "6a9c13c187de7f8a2b9e59e3a9e1ef25b39e07ad6687f92d2d6dcaf2c12a27d3"


def make_report(
    name: str,
    digest: str,
    *,
    version: str = "1.0.0",
    has_configuration: bool = False,
) -> PluginReport:
    extension = {
        "schemaVersion": 1,
        "display": {
            "name": name.title(),
            "category": "productivity",
            "languages": ["en"],
        },
        "compatibility": {"runtimes": ["openclaw"]},
    }
    if has_configuration:
        extension["configuration"] = {"secretSlots": {}}
    manifest = {
        "$schema": PLUGIN_SCHEMA,
        "name": name,
        "version": version,
        "description": f"{name} description",
        "keywords": [name],
        "extensions": {"ai.clawdi": extension},
    }
    return PluginReport(key=name, digest=digest, manifest=manifest)


class CatalogTests(unittest.TestCase):
    def test_generation_is_deterministic_and_validation_rejects_drift(self) -> None:
        alpha = make_report("alpha", "a" * 64)
        zulu = make_report("zulu", "f" * 64, has_configuration=True)

        catalog = generate_catalog([zulu, alpha])

        self.assertEqual(["alpha", "zulu"], [entry["name"] for entry in catalog["plugins"]])
        self.assertEqual(render_catalog(catalog), render_catalog(generate_catalog([alpha, zulu])))
        self.assertFalse(catalog["plugins"][0]["hasConfiguration"])
        self.assertTrue(catalog["plugins"][1]["hasConfiguration"])
        self.assertEqual([], validate_catalog(catalog))

        invalid = copy.deepcopy(catalog)
        invalid["plugins"][0]["mcpServers"] = {}
        self.assertIn("plugins[0] has unknown field: mcpServers", validate_catalog(invalid))

        with tempfile.TemporaryDirectory(prefix=".store-catalog-test-", dir=V2_ROOT) as temporary:
            path = Path(temporary) / "catalog.json"
            path.write_bytes(render_catalog(catalog))
            self.assertEqual([], check_catalog(path, catalog))

            expected = copy.deepcopy(catalog)
            expected["plugins"][0]["digest"] = "sha256-tree-v1:" + "b" * 64
            self.assertIn("catalog is stale", "\n".join(check_catalog(path, expected)))

    def test_published_name_and_version_are_digest_immutable(self) -> None:
        baseline = generate_catalog([make_report("alpha", "a" * 64)])
        changed = generate_catalog([make_report("alpha", "b" * 64)])

        errors = check_version_immutability(changed, baseline)

        self.assertIn("alpha@1.0.0 changed digest", "\n".join(errors))
        bumped = generate_catalog([make_report("alpha", "b" * 64, version="1.0.1")])
        self.assertEqual([], check_version_immutability(bumped, baseline))

    def test_clawdi_rename_marker_and_digest(self) -> None:
        report = validate_store()

        self.assertEqual([], report.errors)
        self.assertEqual(["clawdi"], [plugin.key for plugin in report.plugins])
        self.assertEqual([], report.plugins[0].errors)
        self.assertFalse((PLUGINS_ROOT / "clawdi-cloud").exists())

        package = PLUGINS_ROOT / "clawdi"
        self.assertEqual(CLAWDI_DIGEST, compute_package_digest(package))
        catalog = generate_catalog(report.plugins)
        entry = catalog["plugins"][0]
        self.assertEqual("clawdi", entry["name"])
        self.assertEqual("./plugins/clawdi", entry["path"])
        self.assertEqual("sha256-tree-v1:" + CLAWDI_DIGEST, entry["digest"])
        self.assertFalse(entry["hasConfiguration"])

        manifest = json.loads((package / "plugin.json").read_text(encoding="utf-8"))
        self.assertNotIn("tags", manifest["extensions"]["ai.clawdi"]["display"])
        mcp = json.loads((package / "mcp.json").read_text(encoding="utf-8"))
        self.assertEqual(MCP_SCHEMA, mcp["$schema"])
        self.assertEqual("clawdi", mcp["mcpServers"]["clawdi"]["headers"]["X-Clawdi-Agent-Plugin"])


if __name__ == "__main__":
    unittest.main()
