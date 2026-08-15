from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Callable

from v2.scripts.plugin_package import (
    PackageValidationError,
    compute_package_digest,
    inspect_package,
)
from v2.scripts.plugin_validation import (
    MCP_SCHEMA,
    PLUGIN_SCHEMA,
    validate_plugin,
)
from v2.scripts.validate import validate_store
from v2.scripts.skill_validation import validate_skill_frontmatter

V2_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = V2_ROOT.parent


def temporary_directory(prefix: str) -> tempfile.TemporaryDirectory[str]:
    return tempfile.TemporaryDirectory(prefix=prefix, dir=V2_ROOT)


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def make_plugin(parent: Path) -> Path:
    root = parent / "example-plugin"
    (root / "skills" / "summarize").mkdir(parents=True)
    (root / "config").mkdir()
    (root / "skills" / "summarize" / "SKILL.md").write_text(
        "---\nname: summarize\ndescription: Summarizes reports when users need concise findings.\n---\n\n# Summarize\n",
        encoding="utf-8",
    )
    (root / "config" / "settings.json").write_text("{}\n", encoding="utf-8")
    write_json(
        root / "plugin.json",
        {
            "$schema": PLUGIN_SCHEMA,
            "name": "example-plugin",
            "version": "1.2.3-beta.1+build.4",
            "description": "Example package",
            "keywords": ["reports", "summary"],
            "extensions": {
                "ai.clawdi": {
                    "schemaVersion": 1,
                    "display": {
                        "name": "Example Plugin",
                        "category": "productivity",
                        "languages": ["en", "zh-CN"],
                    },
                    "configuration": {
                        "secretSlots": {
                            "service-token": {
                                "label": "Service token",
                                "description": "Token used by both MCP services.",
                                "required": True,
                                "bindings": [
                                    {"server": "local", "target": "env", "name": "SERVICE_TOKEN"},
                                    {
                                        "server": "remote",
                                        "target": "header",
                                        "name": "Authorization",
                                        "prefix": "Bearer ",
                                    },
                                ],
                            }
                        }
                    },
                    "compatibility": {
                        "runtimes": ["openclaw", "hermes"],
                        "executables": ["python3"],
                    },
                }
            },
        },
    )
    write_json(
        root / "mcp.json",
        {
            "$schema": MCP_SCHEMA,
            "mcpServers": {
                "local": {
                    "type": "stdio",
                    "command": "python3",
                    "args": ["-m", "example", "--root", "${PLUGIN_ROOT}"],
                    "env": {"CONFIG_PATH": "${PLUGIN_ROOT}/config/settings.json"},
                    "cwd": "${PLUGIN_ROOT}/config",
                },
                "remote": {
                    "type": "streamable-http",
                    "url": "https://mcp.example.com/service",
                    "headers": {"X-Client": "clawdi-store"},
                },
            },
        },
    )
    return root


class PluginValidationTests(unittest.TestCase):
    def test_valid_skill_stdio_remote_and_secret_bindings(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            root = make_plugin(Path(temporary))
            report = validate_plugin(root, Path(temporary))

            self.assertEqual([], report.errors)
            self.assertEqual(1, report.valid_skills)
            self.assertEqual(2, report.valid_servers)
            self.assertRegex(report.digest or "", r"^[0-9a-f]{64}$")

    def test_portable_mcp_transports_names_and_url_fragments(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            root = make_plugin(Path(temporary))
            manifest = read_json(root / "plugin.json")
            manifest["extensions"]["ai.clawdi"]["configuration"]["secretSlots"][
                "service-token"
            ]["bindings"][1]["server"] = "Remote Tools"
            write_json(root / "plugin.json", manifest)
            document = read_json(root / "mcp.json")
            document["mcpServers"]["Remote Tools"] = document["mcpServers"].pop("remote")
            document["mcpServers"]["Legacy SSE"] = {
                "type": "sse",
                "url": "http://127.0.0.1:3000/sse",
            }
            document["mcpServers"]["invalid\nname"] = {"type": "unknown"}
            write_json(root / "mcp.json", document)

            report = validate_plugin(root, Path(temporary))
            self.assertEqual(1, len(report.errors))
            self.assertIn("name must be non-empty and contain no ASCII controls or DEL", report.errors[0])
            self.assertEqual(3, report.valid_servers)

            del document["mcpServers"]["invalid\nname"]

            document["mcpServers"]["Remote Tools"]["url"] += "#"
            write_json(root / "mcp.json", document)
            errors = "\n".join(validate_plugin(root, Path(temporary)).errors)
            self.assertIn("without user information or a fragment", errors)

    def test_unknown_stdio_placeholders_remain_literal(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            root = make_plugin(Path(temporary))
            (root / "config" / "${UNKNOWN}").mkdir()
            document = read_json(root / "mcp.json")
            local = document["mcpServers"]["local"]
            local["args"].append("prefix-${UNKNOWN}")
            local["env"]["LITERAL_REFERENCE"] = "${HOME}/settings"
            local["cwd"] = "${PLUGIN_ROOT}/config/${UNKNOWN}"
            write_json(root / "mcp.json", document)

            report = validate_plugin(root, Path(temporary))

            self.assertEqual([], report.errors)
            self.assertEqual(2, report.valid_servers)

    def test_store_validator_discovers_plugins_and_reports_digest(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            plugins_root = Path(temporary) / "plugins"
            make_plugin(plugins_root)
            (plugins_root / "README.md").write_text("ignored\n", encoding="utf-8")

            report = validate_store(plugins_root, V2_ROOT)

            self.assertEqual([], report.errors)
            self.assertEqual(1, len(report.plugins))
            self.assertEqual([], report.plugins[0].errors)
            self.assertRegex(report.plugins[0].digest or "", r"^[0-9a-f]{64}$")

            result = subprocess.run(
                [sys.executable, str(V2_ROOT / "scripts" / "validate.py")],
                cwd=REPOSITORY_ROOT,
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )

            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertIn("Agent v2 Store validation passed (1 plugin(s)).", result.stdout)

    def test_store_scanner_rejects_non_directory_entries(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            plugins_root = Path(temporary) / "plugins"
            plugins_root.mkdir()
            (plugins_root / "unexpected.json").write_text("{}\n", encoding="utf-8")
            os.symlink("missing", plugins_root / "linked-plugin")

            errors = "\n".join(validate_store(plugins_root, V2_ROOT).errors)

            self.assertIn("unexpected.json: Store entries must be plugin directories", errors)
            self.assertIn("linked-plugin: Store entries must be plugin directories", errors)

    def test_high_risk_policy_rejections(self) -> None:
        def invalid_version(root: Path) -> None:
            document = read_json(root / "plugin.json")
            document["version"] = "01.2.3"
            write_json(root / "plugin.json", document)

        def unsafe_cwd(root: Path) -> None:
            document = read_json(root / "mcp.json")
            document["mcpServers"]["local"]["cwd"] = "${PLUGIN_ROOT}/../outside"
            write_json(root / "mcp.json", document)

        def literal_secret(root: Path) -> None:
            document = read_json(root / "mcp.json")
            document["mcpServers"]["local"]["env"]["API_TOKEN"] = "committed-value"
            write_json(root / "mcp.json", document)

        def author_trust(root: Path) -> None:
            document = read_json(root / "plugin.json")
            document["extensions"]["ai.clawdi"]["trust"] = "verified"
            write_json(root / "plugin.json", document)

        def wrong_schema(root: Path) -> None:
            document = read_json(root / "mcp.json")
            document["$schema"] = "https://agent-plugins.org/schemas/2.0.0/mcp.schema.json"
            write_json(root / "mcp.json", document)

        def mixed_transport_fields(root: Path) -> None:
            document = read_json(root / "mcp.json")
            document["mcpServers"]["local"]["url"] = "https://example.com/mcp"
            write_json(root / "mcp.json", document)

        def null_optional_field(root: Path) -> None:
            document = read_json(root / "mcp.json")
            document["mcpServers"]["remote"]["headers"] = None
            write_json(root / "mcp.json", document)

        def reserved_environment(root: Path) -> None:
            document = read_json(root / "mcp.json")
            document["mcpServers"]["local"]["env"]["PLUGIN_DATA"] = "./data"
            write_json(root / "mcp.json", document)

        def incompatible_binding(root: Path) -> None:
            document = read_json(root / "plugin.json")
            binding = document["extensions"]["ai.clawdi"]["configuration"]["secretSlots"]["service-token"][
                "bindings"
            ][0]
            binding["target"] = "header"
            binding["name"] = "Authorization"
            write_json(root / "plugin.json", document)

        def bad_skill_name(root: Path) -> None:
            skill = root / "skills" / "summarize" / "SKILL.md"
            skill.write_text(
                skill.read_text(encoding="utf-8").replace("name: summarize", "name: other"),
                encoding="utf-8",
            )

        cases: list[tuple[str, Callable[[Path], None], str]] = [
            ("semver", invalid_version, "exact Semantic Versioning"),
            ("cwd escape", unsafe_cwd, "cwd escapes"),
            ("literal secret", literal_secret, "secret slot binding"),
            ("author trust", author_trust, "unknown field: trust"),
            ("canonical schema", wrong_schema, "$schema must equal"),
            ("closed transport", mixed_transport_fields, "unknown field: url"),
            ("null optional", null_optional_field, "headers must be an object"),
            ("reserved environment", reserved_environment, "client-owned"),
            ("binding transport", incompatible_binding, "incompatible with MCP server transport"),
            ("skill directory", bad_skill_name, "frontmatter name must match"),
        ]
        for label, mutate, expected in cases:
            with self.subTest(label=label), temporary_directory(".store-plugin-test-") as temporary:
                root = make_plugin(Path(temporary))
                mutate(root)
                errors = "\n".join(validate_plugin(root, Path(temporary)).errors)
                self.assertIn(expected, errors)

    def test_symlink_and_case_folded_duplicate_are_rejected(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            root = make_plugin(Path(temporary))
            (root / "README.md").write_text("one\n", encoding="utf-8")
            (root / "readme.MD").write_text("two\n", encoding="utf-8")
            os.symlink("plugin.json", root / "manifest-link.json")

            errors = "\n".join(validate_plugin(root, Path(temporary)).errors)
            self.assertIn("case-folded path duplicates", errors)
            self.assertIn("regular files or directories", errors)
            with self.assertRaises(PackageValidationError):
                compute_package_digest(root)

    def test_sse_loopback_server_is_validated_independently(self) -> None:
        with temporary_directory(".store-plugin-test-") as temporary:
            root = make_plugin(Path(temporary))
            document = read_json(root / "mcp.json")
            document["mcpServers"]["remote"]["type"] = "sse"
            document["mcpServers"]["remote"]["url"] = "http://127.0.0.1:3000/sse"
            write_json(root / "mcp.json", document)

            report = validate_plugin(root, Path(temporary))
            self.assertEqual([], report.errors)
            self.assertEqual(2, report.valid_servers)

    def test_present_compatibility_allowlists_must_not_be_empty(self) -> None:
        for field_name in ("runtimes", "executables"):
            with self.subTest(field=field_name), temporary_directory(
                ".store-plugin-test-"
            ) as temporary:
                root = make_plugin(Path(temporary))
                document = read_json(root / "plugin.json")
                compatibility = document["extensions"]["ai.clawdi"]["compatibility"]
                compatibility[field_name] = []
                write_json(root / "plugin.json", document)

                errors = "\n".join(validate_plugin(root, Path(temporary)).errors)

                self.assertIn(
                    f"compatibility.{field_name} must contain at least 1 item(s)",
                    errors,
                )


class SkillFrontmatterTests(unittest.TestCase):
    def test_complete_optional_frontmatter_contract_and_boundaries(self) -> None:
        with temporary_directory(".store-skill-test-") as temporary:
            skill_dir = Path(temporary) / "summarize"
            skill_dir.mkdir()
            skill_md = skill_dir / "SKILL.md"
            skill_md.write_text(
                "---\n"
                "name: summarize\n"
                "description: Summarizes reports.\n"
                "license: Apache-2.0\n"
                f"compatibility: {'x' * 500}\n"
                "metadata:\n"
                "  author: example-org\n"
                '  version: "1.0"\n'
                "allowed-tools: Bash(git:*)\n"
                "---\n",
                encoding="utf-8",
            )

            self.assertEqual([], validate_skill_frontmatter(skill_md, "summarize"))

            skill_md.write_text(
                "---\n"
                "name: summarize\n"
                "description: Summarizes reports.\n"
                "license: false\n"
                f"compatibility: {'x' * 501}\n"
                "metadata:\n"
                "  retries: 2\n"
                "allowed-tools:\n"
                "  - Bash\n"
                "extra-field: value\n"
                "---\n",
                encoding="utf-8",
            )
            errors = "\n".join(validate_skill_frontmatter(skill_md, "summarize"))
            self.assertIn("frontmatter license must be a string", errors)
            self.assertIn("frontmatter compatibility must contain 1-500 characters", errors)
            self.assertIn("frontmatter metadata must map string keys to string values", errors)
            self.assertIn("frontmatter allowed-tools must be a string", errors)
            self.assertIn("unknown frontmatter field: extra-field", errors)

            skill_md.write_text(
                "---\n"
                "name: summarize\n"
                "description: Summarizes reports.\n"
                'compatibility: ""\n'
                "---\n",
                encoding="utf-8",
            )
            self.assertIn(
                "frontmatter compatibility must contain 1-500 characters",
                validate_skill_frontmatter(skill_md, "summarize"),
            )

    def test_duplicate_yaml_keys_are_rejected(self) -> None:
        with temporary_directory(".store-skill-test-") as temporary:
            skill_dir = Path(temporary) / "summarize"
            skill_dir.mkdir()
            skill_md = skill_dir / "SKILL.md"
            skill_md.write_text(
                "---\n"
                "name: summarize\n"
                "description: Summarizes reports.\n"
                "metadata:\n"
                "  author: first\n"
                "  author: second\n"
                "---\n",
                encoding="utf-8",
            )

            errors = "\n".join(validate_skill_frontmatter(skill_md, "summarize"))

            self.assertIn("duplicate key ('author')", errors)


class DigestTests(unittest.TestCase):
    def test_sha256_tree_v1_bytes_and_modes(self) -> None:
        with temporary_directory(".store-digest-test-") as temporary:
            root = Path(temporary)
            (root / "a.txt").write_bytes(b"alpha\n")
            (root / "run").write_bytes(b"#!/bin/sh\n")
            (root / "run").chmod(0o755)
            alpha_hash = hashlib.sha256(b"alpha\n").hexdigest()
            script_hash = hashlib.sha256(b"#!/bin/sh\n").hexdigest()
            lines = [
                "\0".join(("100644", "a.txt", "6", alpha_hash)) + "\n",
                "\0".join(("100755", "run", "10", script_hash)) + "\n",
            ]
            expected = hashlib.sha256("".join(lines).encode()).hexdigest()

            self.assertEqual(expected, compute_package_digest(root))

    def test_control_characters_in_paths_are_rejected_and_escaped(self) -> None:
        with temporary_directory(".store-digest-test-") as temporary:
            root = Path(temporary)
            (root / "line\nbreak.txt").write_text("unsafe\n", encoding="utf-8")

            _, errors = inspect_package(root)

            self.assertIn(
                "line\\x0abreak.txt: path contains ASCII control characters or DEL",
                errors,
            )
            with self.assertRaises(PackageValidationError):
                compute_package_digest(root)

    def test_vendored_schemas_match_supported_canonical_files(self) -> None:
        schema_dir = V2_ROOT / "schemas" / "agent-plugins" / "1.0.0"
        expected = {
            "plugin.schema.json": (PLUGIN_SCHEMA, "0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883"),
            "mcp.schema.json": (MCP_SCHEMA, "6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb"),
        }
        for filename, (identifier, digest) in expected.items():
            content = (schema_dir / filename).read_bytes()
            self.assertEqual(identifier, json.loads(content)["$id"])
            self.assertEqual(digest, hashlib.sha256(content).hexdigest())


if __name__ == "__main__":
    unittest.main()
