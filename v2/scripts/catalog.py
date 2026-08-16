#!/usr/bin/env python3
"""Generate and validate the thin Clawdi Store v2 catalog."""

from __future__ import annotations

import argparse
import copy
import json
import re
import stat
from pathlib import Path
from typing import Any, Iterable

if __package__:
    from .plugin_validation import (
        ALLOWED_RUNTIMES,
        CATEGORY_RE,
        LANGUAGE_RE,
        MAX_MCP_SERVERS,
        MAX_MCP_SERVER_NAME_LENGTH,
        PLUGIN_NAME_RE,
        SEMVER_RE,
        PluginReport,
        has_ascii_control,
    )
else:
    from plugin_validation import (
        ALLOWED_RUNTIMES,
        CATEGORY_RE,
        LANGUAGE_RE,
        MAX_MCP_SERVERS,
        MAX_MCP_SERVER_NAME_LENGTH,
        PLUGIN_NAME_RE,
        SEMVER_RE,
        PluginReport,
        has_ascii_control,
    )

if __package__:
    from .source_package import SourcePackageError, discover_recipes, load_source_releases
else:
    from source_package import SourcePackageError, discover_recipes, load_source_releases

V2_ROOT = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = V2_ROOT.parent
CATALOG_PATH = V2_ROOT / "catalog.json"
CATALOG_SCHEMA_VERSION = 2
DIGEST_PREFIX = "sha256-tree-v1:"
DIGEST_RE = re.compile(r"^sha256-tree-v1:[0-9a-f]{64}$")
ARCHIVE_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")

CATALOG_FIELDS = {"schemaVersion", "plugins"}
ENTRY_FIELDS = {
    "name",
    "version",
    "displayName",
    "description",
    "publisher",
    "category",
    "keywords",
    "languages",
    "runtimes",
    "hasConfiguration",
    "icon",
    "source",
    "digest",
    "components",
}
REQUIRED_ENTRY_FIELDS = {
    "name",
    "version",
    "displayName",
    "category",
    "keywords",
    "languages",
    "runtimes",
    "hasConfiguration",
    "source",
    "digest",
    "components",
}
COMPONENT_FIELDS = {"skills", "mcpServers"}
MCP_TRANSPORTS = {"stdio", "streamable-http", "sse"}
SOURCE_FIELDS = {"type", "path", "url", "archiveDigest"}


class CatalogError(ValueError):
    """Raised when a catalog cannot be generated or loaded safely."""


def _catalog_entry(report: PluginReport) -> dict[str, Any]:
    if report.errors or report.digest is None or report.manifest is None:
        raise CatalogError(f"plugin {report.key!r} has not passed package validation")

    manifest = report.manifest
    extension = manifest["extensions"]["ai.clawdi"]
    display = extension["display"]
    compatibility = extension.get("compatibility", {})
    entry: dict[str, Any] = {
        "name": manifest["name"],
        "version": manifest["version"],
        "displayName": display["name"],
        "category": display["category"],
        "keywords": list(manifest["keywords"]),
        "languages": list(display["languages"]),
        "runtimes": list(compatibility.get("runtimes", [])),
        "hasConfiguration": False,
        "source": {"type": "store", "path": f"./plugins/{report.key}"},
        "digest": f"{DIGEST_PREFIX}{report.digest}",
        "components": {
            "skills": list(report.skills),
            "mcpServers": dict(report.mcp_servers),
        },
    }
    if "description" in manifest:
        entry["description"] = manifest["description"]
    author = manifest.get("author")
    if isinstance(author, dict) and "name" in author:
        entry["publisher"] = author["name"]
    if "icon" in display:
        entry["icon"] = f"./plugins/{report.key}/{display['icon'][2:]}"
    return entry


def generate_catalog(
    reports: Iterable[PluginReport],
    source_releases: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    """Build a deterministic catalog from already-validated plugin reports."""

    entries = [_catalog_entry(report) for report in reports]
    for release in source_releases:
        entry = copy.deepcopy(release["catalog"])
        entry["source"] = copy.deepcopy(release["source"])
        entry["digest"] = release["digest"]
        entries.append(entry)
    entries.sort(key=lambda entry: entry["name"].encode("utf-8"))
    catalog = {"schemaVersion": CATALOG_SCHEMA_VERSION, "plugins": entries}
    errors = validate_catalog(catalog)
    if errors:
        raise CatalogError("generated invalid catalog: " + "; ".join(errors))
    return catalog


def render_catalog(catalog: dict[str, Any]) -> bytes:
    """Serialize a catalog to its canonical checked-in representation."""

    return (json.dumps(catalog, indent=2, sort_keys=True, ensure_ascii=True) + "\n").encode("utf-8")


def _semver_key(version: str) -> tuple[object, ...]:
    without_build = version.split("+", 1)[0]
    core, separator, prerelease = without_build.partition("-")
    major, minor, patch = (int(value) for value in core.split("."))
    if not separator:
        return (major, minor, patch, 1, ())
    identifiers = tuple(
        (0, int(value)) if value.isdigit() else (1, value)
        for value in prerelease.split(".")
    )
    return (major, minor, patch, 0, identifiers)


def _string_array(
    errors: list[str],
    value: Any,
    field: str,
    *,
    maximum_items: int,
    maximum_length: int,
) -> None:
    if not isinstance(value, list):
        errors.append(f"{field} must be an array")
        return
    if len(value) > maximum_items or any(
        not isinstance(item, str) or not item or len(item) > maximum_length for item in value
    ):
        errors.append(f"{field} contains invalid or too many strings")
        return
    if any(has_ascii_control(item) for item in value):
        errors.append(f"{field} contains ASCII control characters or DEL")
        return
    folded = [item.casefold() for item in value]
    if len(folded) != len(set(folded)):
        errors.append(f"{field} must not contain case-folded duplicates")


def _validate_source(errors: list[str], value: Any, context: str, name: str) -> None:
    if not isinstance(value, dict):
        errors.append(f"{context} must be an object")
        return
    for field in sorted(value.keys() - SOURCE_FIELDS):
        errors.append(f"{context} has unknown field: {field}")
    source_type = value.get("type")
    if source_type == "store":
        if set(value) != {"type", "path"}:
            errors.append(f"{context} store source must contain only type and path")
        if value.get("path") != f"./plugins/{name}":
            errors.append(f"{context}.path must equal ./plugins/{name}")
        return
    if source_type == "github-release":
        if set(value) != {"type", "url", "archiveDigest"}:
            errors.append(
                f"{context} github-release source must contain type, url, and archiveDigest"
            )
        url = value.get("url")
        if (
            not isinstance(url, str)
            or len(url) > 1000
            or re.fullmatch(
                r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/"
                r"releases/download/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\.tar\.gz",
                url,
            )
            is None
        ):
            errors.append(f"{context}.url must be a canonical GitHub release asset URL")
        archive_digest = value.get("archiveDigest")
        if not isinstance(archive_digest, str) or ARCHIVE_DIGEST_RE.fullmatch(
            archive_digest
        ) is None:
            errors.append(f"{context}.archiveDigest must be a sha256 digest")
        return
    errors.append(f"{context}.type is unsupported")


def validate_catalog(catalog: Any) -> list[str]:
    """Validate the closed Clawdi Store catalog v2 contract."""

    if not isinstance(catalog, dict):
        return ["catalog must be an object"]
    errors: list[str] = []
    for field in sorted(catalog.keys() - CATALOG_FIELDS):
        errors.append(f"unknown catalog field: {field}")
    if (
        type(catalog.get("schemaVersion")) is not int
        or catalog.get("schemaVersion") != CATALOG_SCHEMA_VERSION
    ):
        errors.append(f"schemaVersion must equal {CATALOG_SCHEMA_VERSION}")
    plugins = catalog.get("plugins")
    if not isinstance(plugins, list):
        errors.append("plugins must be an array")
        return errors
    if len(plugins) > 10_000:
        errors.append("plugins exceeds 10000 entries")
        return errors

    names: set[str] = set()
    folded_names: set[str] = set()
    ordered_names: list[str] = []
    for index, entry in enumerate(plugins):
        context = f"plugins[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{context} must be an object")
            continue
        for field in sorted(entry.keys() - ENTRY_FIELDS):
            errors.append(f"{context} has unknown field: {field}")
        for field in sorted(REQUIRED_ENTRY_FIELDS - entry.keys()):
            errors.append(f"{context} is missing field: {field}")

        name = entry.get("name")
        if not isinstance(name, str) or not PLUGIN_NAME_RE.fullmatch(name):
            errors.append(f"{context}.name is invalid")
            continue
        ordered_names.append(name)
        if name in names or name.casefold() in folded_names:
            errors.append(f"{context}.name duplicates another plugin")
        names.add(name)
        folded_names.add(name.casefold())

        version = entry.get("version")
        if not isinstance(version, str) or not SEMVER_RE.fullmatch(version):
            errors.append(f"{context}.version must be an exact Semantic Version")
        for field, maximum in (
            ("displayName", 80),
            ("description", 512),
            ("publisher", 80),
            ("category", 64),
            ("icon", 1024),
        ):
            if field in entry and (
                not isinstance(entry[field], str) or not entry[field] or len(entry[field]) > maximum
            ):
                errors.append(f"{context}.{field} must be a non-empty string of at most {maximum} characters")
            elif field in entry and has_ascii_control(entry[field]):
                errors.append(f"{context}.{field} contains ASCII control characters or DEL")
        category = entry.get("category")
        if isinstance(category, str) and not CATEGORY_RE.fullmatch(category):
            errors.append(f"{context}.category must be a lowercase slug")
        _string_array(
            errors,
            entry.get("keywords"),
            f"{context}.keywords",
            maximum_items=20,
            maximum_length=32,
        )
        _string_array(
            errors,
            entry.get("languages"),
            f"{context}.languages",
            maximum_items=20,
            maximum_length=64,
        )
        _string_array(
            errors,
            entry.get("runtimes"),
            f"{context}.runtimes",
            maximum_items=2,
            maximum_length=16,
        )
        languages = entry.get("languages")
        if isinstance(languages, list):
            for language in languages:
                if isinstance(language, str) and not LANGUAGE_RE.fullmatch(language):
                    errors.append(f"{context}.languages contains invalid tag: {language}")
        runtimes = entry.get("runtimes")
        if isinstance(runtimes, list):
            unknown_runtimes = {
                runtime for runtime in runtimes if isinstance(runtime, str)
            } - ALLOWED_RUNTIMES
            if unknown_runtimes:
                errors.append(
                    f"{context}.runtimes contains unsupported values: "
                    + ", ".join(sorted(unknown_runtimes))
                )
        if entry.get("hasConfiguration") is not False:
            errors.append(f"{context}.hasConfiguration must equal false")
        components = entry.get("components")
        if not isinstance(components, dict):
            errors.append(f"{context}.components must be an object")
        else:
            for field in sorted(components.keys() - COMPONENT_FIELDS):
                errors.append(f"{context}.components has unknown field: {field}")
            for field in sorted(COMPONENT_FIELDS - components.keys()):
                errors.append(f"{context}.components is missing field: {field}")
            _string_array(
                errors,
                components.get("skills"),
                f"{context}.components.skills",
                maximum_items=1_000,
                maximum_length=64,
            )
            servers = components.get("mcpServers")
            if not isinstance(servers, dict):
                errors.append(f"{context}.components.mcpServers must be an object")
            else:
                if len(servers) > MAX_MCP_SERVERS:
                    errors.append(
                        f"{context}.components.mcpServers exceeds {MAX_MCP_SERVERS} entries"
                    )
                for server_name, transport in servers.items():
                    if (
                        not isinstance(server_name, str)
                        or not server_name
                        or len(server_name) > MAX_MCP_SERVER_NAME_LENGTH
                        or has_ascii_control(server_name)
                    ):
                        errors.append(
                            f"{context}.components.mcpServers names must contain "
                            f"1-{MAX_MCP_SERVER_NAME_LENGTH} characters and no ASCII controls or DEL"
                        )
                    if not isinstance(transport, str) or transport not in MCP_TRANSPORTS:
                        errors.append(
                            f"{context}.components.mcpServers[{json.dumps(server_name)}] has invalid transport"
                        )
            if not components.get("skills") and not components.get("mcpServers"):
                errors.append(f"{context}.components must contain at least one component")
        _validate_source(errors, entry.get("source"), f"{context}.source", name)
        if not isinstance(entry.get("digest"), str) or not DIGEST_RE.fullmatch(entry["digest"]):
            errors.append(f"{context}.digest must be a sha256-tree-v1 digest")
        icon = entry.get("icon")
        if isinstance(icon, str):
            source = entry.get("source")
            prefix = f"./plugins/{name}/"
            suffix = icon[len(prefix) :] if icon.startswith(prefix) else ""
            if (
                not isinstance(source, dict)
                or source.get("type") != "store"
                or not suffix
                or "\\" in icon
                or suffix.startswith("/")
                or any(part in {"", ".", ".."} for part in suffix.split("/"))
                or has_ascii_control(icon)
            ):
                errors.append(f"{context}.icon must remain within its plugin path")

    if ordered_names != sorted(ordered_names, key=lambda name: name.encode("utf-8")):
        errors.append("plugins must be sorted by UTF-8 bytes of name")
    return errors


def _json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise CatalogError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def load_catalog(path: Path) -> tuple[dict[str, Any] | None, list[str]]:
    """Load a regular UTF-8 catalog file and validate its closed contract."""

    try:
        if not stat.S_ISREG(path.lstat().st_mode):
            return None, ["catalog must be a regular file"]
        catalog = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_json_object)
    except (OSError, UnicodeError, json.JSONDecodeError, CatalogError, ValueError) as exc:
        return None, [f"invalid catalog JSON: {exc}"]
    errors = validate_catalog(catalog)
    return (catalog if isinstance(catalog, dict) else None), errors


def check_catalog(path: Path, expected: dict[str, Any]) -> list[str]:
    """Reject invalid, non-canonical, or generated catalog drift."""

    catalog, errors = load_catalog(path)
    if errors or catalog is None:
        return errors
    try:
        content = path.read_bytes()
    except OSError as exc:
        return [f"cannot read catalog: {exc}"]
    if content != render_catalog(catalog):
        return ["catalog JSON is not in canonical generated form"]
    if content != render_catalog(expected):
        return ["catalog is stale; run python3 v2/scripts/catalog.py --write"]
    return []


def check_version_immutability(current: Any, baseline: Any) -> list[str]:
    """Reject changed bytes for a name and version present in the baseline."""

    errors = [f"current: {error}" for error in validate_catalog(current)]
    baseline_version = baseline.get("schemaVersion") if isinstance(baseline, dict) else None
    if baseline_version == CATALOG_SCHEMA_VERSION:
        errors.extend(f"baseline: {error}" for error in validate_catalog(baseline))
    elif baseline_version == 1:
        if not isinstance(baseline.get("plugins"), list):
            errors.append("baseline: plugins must be an array")
        else:
            for index, entry in enumerate(baseline["plugins"]):
                context = f"baseline: plugins[{index}]"
                if not isinstance(entry, dict):
                    errors.append(f"{context} must be an object")
                    continue
                if not isinstance(entry.get("name"), str) or not PLUGIN_NAME_RE.fullmatch(
                    entry["name"]
                ):
                    errors.append(f"{context}.name is invalid")
                if not isinstance(entry.get("version"), str) or not SEMVER_RE.fullmatch(
                    entry["version"]
                ):
                    errors.append(f"{context}.version must be an exact Semantic Version")
                if not isinstance(entry.get("digest"), str) or not DIGEST_RE.fullmatch(
                    entry["digest"]
                ):
                    errors.append(f"{context}.digest must be a sha256-tree-v1 digest")
    else:
        errors.append("baseline: schemaVersion must equal 1 or 2")
    if errors:
        return errors
    baseline_entries = {
        entry["name"]: entry
        for entry in baseline["plugins"]
        if isinstance(entry, dict)
        and isinstance(entry.get("name"), str)
        and isinstance(entry.get("version"), str)
        and isinstance(entry.get("digest"), str)
    }
    for entry in current["plugins"]:
        old_entry = baseline_entries.get(entry["name"])
        if old_entry is None:
            continue
        if (
            entry["version"] != old_entry["version"]
            and _semver_key(entry["version"]) <= _semver_key(old_entry["version"])
        ):
            errors.append(
                f"{entry['name']} version did not increase from "
                f"{old_entry['version']} to {entry['version']}"
            )
        elif entry["version"] == old_entry["version"]:
            if entry["digest"] != old_entry["digest"]:
                errors.append(
                    f"{entry['name']}@{entry['version']} changed digest; "
                    "publish changed bytes with a new version"
                )
            if "source" in old_entry and entry["source"] != old_entry["source"]:
                errors.append(
                    f"{entry['name']}@{entry['version']} changed source; "
                    "publish changed source identity with a new version"
                )
    return errors


def _print_store_errors(report: Any) -> int:
    messages = list(report.errors)
    for plugin in report.plugins:
        messages.extend(plugin.errors)
    for message in messages:
        print(f"ERROR {message}")
    return len(messages)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true", help="write the generated catalog")
    action.add_argument("--check", action="store_true", help="check the generated catalog")
    action.add_argument("--check-baseline", type=Path, metavar="PATH", help="check version immutability")
    args = parser.parse_args()

    if args.check_baseline is not None:
        current, current_errors = load_catalog(CATALOG_PATH)
        try:
            baseline = json.loads(
                args.check_baseline.read_text(encoding="utf-8"),
                object_pairs_hook=_json_object,
            )
            baseline_errors: list[str] = []
        except (OSError, UnicodeError, json.JSONDecodeError, CatalogError, ValueError) as exc:
            baseline = None
            baseline_errors = [f"invalid catalog JSON: {exc}"]
        errors = [f"current: {error}" for error in current_errors]
        errors.extend(f"baseline: {error}" for error in baseline_errors)
        if not errors and current is not None and baseline is not None:
            errors.extend(check_version_immutability(current, baseline))
        for error in errors:
            print(f"ERROR {error}")
        return 1 if errors else 0

    if __package__:
        from .validate import validate_store
    else:
        from validate import validate_store

    report = validate_store()
    if _print_store_errors(report):
        return 1
    try:
        source_releases = load_source_releases(discover_recipes())
    except SourcePackageError as exc:
        print(f"ERROR {exc}")
        return 1
    catalog = generate_catalog(report.plugins, source_releases)
    if args.write:
        try:
            CATALOG_PATH.write_bytes(render_catalog(catalog))
        except OSError as exc:
            print(f"ERROR cannot write {CATALOG_PATH.relative_to(REPOSITORY_ROOT)}: {exc}")
            return 1
        print(f"Wrote {CATALOG_PATH.relative_to(REPOSITORY_ROOT)}")
        return 0
    errors = check_catalog(CATALOG_PATH, catalog)
    for error in errors:
        print(f"ERROR {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
