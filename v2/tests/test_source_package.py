from __future__ import annotations

import gzip
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from typing import Any

from v2.scripts.plugin_validation import PLUGIN_SCHEMA
from v2.scripts.source_package import (
    SourcePackageError,
    build_source_package,
    load_recipe,
)

V2_ROOT = Path(__file__).resolve().parents[1]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def upstream_archive(*, symlink: bool = False) -> bytes:
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as archive:
            content = (
                b"---\nname: example-skill\n"
                b"description: Use when an example Skill is needed.\n---\n\n# Example\n"
            )
            skill = tarfile.TarInfo("upstream-commit/skill/SKILL.md")
            skill.size = len(content)
            skill.mode = 0o644
            archive.addfile(skill, io.BytesIO(content))
            if symlink:
                link = tarfile.TarInfo("upstream-commit/skill/escape")
                link.type = tarfile.SYMTYPE
                link.linkname = "../../outside"
                archive.addfile(link)
    return output.getvalue()


class SourcePackageTests(unittest.TestCase):
    def test_pinned_source_build_is_deterministic_and_rejects_special_entries(self) -> None:
        with tempfile.TemporaryDirectory(prefix=".source-package-test-", dir=V2_ROOT) as temporary:
            root = Path(temporary) / "example"
            write_json(
                root / "package" / "plugin.json",
                {
                    "$schema": PLUGIN_SCHEMA,
                    "name": "example",
                    "version": "0.1.0",
                    "description": "Example source package",
                    "keywords": ["example"],
                    "extensions": {
                        "ai.clawdi": {
                            "schemaVersion": 1,
                            "display": {
                                "name": "Example",
                                "category": "productivity",
                                "languages": ["en"],
                            },
                            "compatibility": {"runtimes": ["openclaw"]},
                        }
                    },
                },
            )
            write_json(
                root / "recipe.json",
                {
                    "schemaVersion": 1,
                    "artifact": {
                        "repository": "https://github.com/Clawdi-AI/store",
                        "tag": "agent-plugin-example-v0.1.0",
                        "asset": "example-0.1.0.tar.gz",
                    },
                    "upstreams": [
                        {
                            "repository": "https://github.com/example/skills",
                            "commit": "a" * 40,
                            "mappings": [
                                {"source": "skill", "target": "skills/example-skill"}
                            ],
                        }
                    ],
                },
            )
            recipe = load_recipe(root / "recipe.json")

            first = build_source_package(recipe, fetcher=lambda _: upstream_archive())
            second = build_source_package(recipe, fetcher=lambda _: upstream_archive())

            self.assertEqual(first.archive, second.archive)
            self.assertEqual(["example-skill"], first.report.skills)
            self.assertRegex(first.release["digest"], r"^sha256-tree-v1:[0-9a-f]{64}$")
            self.assertRegex(
                first.release["source"]["archiveDigest"], r"^sha256:[0-9a-f]{64}$"
            )
            with self.assertRaisesRegex(SourcePackageError, "non-regular entry"):
                build_source_package(recipe, fetcher=lambda _: upstream_archive(symlink=True))


if __name__ == "__main__":
    unittest.main()
