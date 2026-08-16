from __future__ import annotations

import copy
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
from v2.scripts.plugin_validation import PLUGIN_SCHEMA, PluginReport

V2_ROOT = Path(__file__).resolve().parents[1]


def make_report(
    name: str,
    digest: str,
    *,
    version: str = "1.0.0",
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
    manifest = {
        "$schema": PLUGIN_SCHEMA,
        "name": name,
        "version": version,
        "description": f"{name} description",
        "keywords": [name],
        "extensions": {"ai.clawdi": extension},
    }
    return PluginReport(
        key=name,
        digest=digest,
        manifest=manifest,
        skills=[f"{name}-skill"],
        mcp_servers={f"{name}-server": "stdio"},
    )


class CatalogTests(unittest.TestCase):
    def test_generation_is_deterministic_and_validation_rejects_drift(self) -> None:
        alpha = make_report("alpha", "a" * 64)
        zulu = make_report("zulu", "f" * 64)

        catalog = generate_catalog([zulu, alpha])

        self.assertEqual(["alpha", "zulu"], [entry["name"] for entry in catalog["plugins"]])
        self.assertEqual(render_catalog(catalog), render_catalog(generate_catalog([alpha, zulu])))
        self.assertEqual([False, False], [entry["hasConfiguration"] for entry in catalog["plugins"]])
        self.assertEqual(
            {"skills": ["alpha-skill"], "mcpServers": {"alpha-server": "stdio"}},
            catalog["plugins"][0]["components"],
        )
        self.assertEqual(
            {"type": "store", "path": "./plugins/alpha"},
            catalog["plugins"][0]["source"],
        )
        self.assertEqual([], validate_catalog(catalog))

        invalid = copy.deepcopy(catalog)
        invalid["plugins"][0]["displayName"] = "bad\nname"
        self.assertIn("ASCII control characters", "\n".join(validate_catalog(invalid)))
        invalid["plugins"][0]["displayName"] = "Alpha"
        invalid["plugins"][0]["keywords"] = ["bad\x7fname"]
        self.assertIn("ASCII control characters", "\n".join(validate_catalog(invalid)))
        invalid["plugins"][0]["keywords"] = ["alpha"]
        invalid["plugins"][0]["hasConfiguration"] = True
        self.assertIn("plugins[0].hasConfiguration must equal false", validate_catalog(invalid))
        invalid["plugins"][0]["hasConfiguration"] = False
        invalid["plugins"][0]["components"]["details"] = {}
        self.assertIn("plugins[0].components has unknown field: details", validate_catalog(invalid))
        invalid["plugins"][0]["components"].pop("details")
        invalid["plugins"][0]["components"]["mcpServers"] = {"x" * 257: "stdio"}
        self.assertIn("1-256 characters", "\n".join(validate_catalog(invalid)))
        invalid["plugins"][0]["components"]["mcpServers"] = {"alpha-server": "stdio"}
        invalid["plugins"][0]["source"] = {
            "type": "github-release",
            "url": "https://example.com/plugin.tar.gz",
            "archiveDigest": "sha256:" + "a" * 64,
        }
        self.assertIn("canonical GitHub release", "\n".join(validate_catalog(invalid)))

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
        self.assertEqual([], check_version_immutability(generate_catalog([]), baseline))
        bumped = generate_catalog([make_report("alpha", "b" * 64, version="1.0.1")])
        self.assertEqual([], check_version_immutability(bumped, baseline))
        regressed = generate_catalog([make_report("alpha", "b" * 64, version="0.9.0")])
        self.assertIn(
            "alpha version did not increase",
            "\n".join(check_version_immutability(regressed, baseline)),
        )
        build_only = generate_catalog(
            [make_report("alpha", "b" * 64, version="1.0.0+build.2")]
        )
        self.assertIn(
            "alpha version did not increase",
            "\n".join(check_version_immutability(build_only, baseline)),
        )
        moved = copy.deepcopy(baseline)
        moved["plugins"][0]["source"] = {
            "type": "github-release",
            "url": "https://github.com/example/plugins/releases/download/alpha-v1.0.0/alpha.tar.gz",
            "archiveDigest": "sha256:" + "f" * 64,
        }
        self.assertIn(
            "alpha@1.0.0 changed source",
            "\n".join(check_version_immutability(moved, baseline)),
        )

        legacy_baseline = copy.deepcopy(baseline)
        legacy_baseline["schemaVersion"] = 1
        legacy_baseline["plugins"][0]["path"] = "./plugins/alpha"
        legacy_baseline["plugins"][0].pop("source")
        self.assertEqual([], check_version_immutability(baseline, legacy_baseline))


if __name__ == "__main__":
    unittest.main()
