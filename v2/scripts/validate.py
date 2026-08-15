#!/usr/bin/env python3
"""Validate the independent Agent v2 Store rooted at v2/plugins."""

from __future__ import annotations

import os
import stat
from dataclasses import dataclass, field
from pathlib import Path

if __package__:
    from .catalog import CATALOG_PATH, check_catalog, generate_catalog
    from .plugin_package import escape_path
    from .plugin_validation import PluginReport, validate_plugin
else:
    from catalog import CATALOG_PATH, check_catalog, generate_catalog
    from plugin_package import escape_path
    from plugin_validation import PluginReport, validate_plugin

V2_ROOT = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = V2_ROOT.parent
PLUGINS_ROOT = V2_ROOT / "plugins"
IGNORED_STORE_FILE = "README.md"


@dataclass
class StoreReport:
    errors: list[str] = field(default_factory=list)
    plugins: list[PluginReport] = field(default_factory=list)


def _display_path(path: Path, repository_root: Path) -> str:
    try:
        shown = path.relative_to(repository_root).as_posix()
    except ValueError:
        shown = path.as_posix()
    return escape_path(shown)


def validate_store(
    plugins_root: Path = PLUGINS_ROOT,
    repository_root: Path = REPOSITORY_ROOT,
) -> StoreReport:
    """Validate immediate plugin packages in one Agent v2 Store root."""

    report = StoreReport()

    def error(path: Path, message: str) -> None:
        report.errors.append(f"{_display_path(path, repository_root)}: {message}")

    try:
        root_mode = plugins_root.lstat().st_mode
    except OSError as exc:
        error(plugins_root, f"cannot inspect plugins root: {exc}")
        return report
    if not stat.S_ISDIR(root_mode):
        error(plugins_root, "plugins root must be a directory and must not be a symlink")
        return report

    try:
        entries = sorted(os.scandir(plugins_root), key=lambda item: os.fsencode(item.name))
    except OSError as exc:
        error(plugins_root, f"cannot scan plugins root: {exc}")
        return report

    folded_names: dict[str, str] = {}
    for entry in entries:
        path = Path(entry.path)
        folded = entry.name.casefold()
        previous = folded_names.get(folded)
        if previous is not None:
            error(path, f"case-folded Store entry duplicates {previous}")
        else:
            folded_names[folded] = entry.name

        try:
            mode = entry.stat(follow_symlinks=False).st_mode
        except OSError as exc:
            error(path, f"cannot inspect Store entry: {exc}")
            continue
        if entry.name == IGNORED_STORE_FILE and stat.S_ISREG(mode):
            continue
        if not stat.S_ISDIR(mode):
            error(path, "Store entries must be plugin directories")
            continue
        report.plugins.append(validate_plugin(path, repository_root))

    return report


def main() -> int:
    report = validate_store()
    for message in report.errors:
        print(f"ERROR {message}")
    for plugin in report.plugins:
        if plugin.errors:
            for message in plugin.errors:
                print(f"ERROR {message}")
        else:
            print(f"OK {plugin.key} sha256-tree-v1:{plugin.digest}")

    error_count = len(report.errors) + sum(len(plugin.errors) for plugin in report.plugins)
    if not error_count:
        for message in check_catalog(CATALOG_PATH, generate_catalog(report.plugins)):
            print(f"ERROR v2/catalog.json: {message}")
            error_count += 1
    if error_count:
        print(f"Agent v2 Store validation failed with {error_count} error(s).")
        return 1
    print(f"Agent v2 Store validation passed ({len(report.plugins)} plugin(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
