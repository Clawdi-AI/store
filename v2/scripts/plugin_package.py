"""Safe Agent v2 package-tree inspection and sha256-tree-v1 digests."""

from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path

MAX_PACKAGE_ENTRIES = 2_000
MAX_PACKAGE_FILES = 1_000
MAX_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_PATH_BYTES = 512


class PackageValidationError(ValueError):
    """Raised when a digest cannot be computed for a safe package tree."""


def escape_path(path: str) -> str:
    """Escape path characters that would make line-oriented diagnostics ambiguous."""

    pieces: list[str] = []
    for character in path:
        codepoint = ord(character)
        if codepoint < 0x20 or codepoint == 0x7F:
            pieces.append(f"\\x{codepoint:02x}")
        elif character == "\\":
            pieces.append("\\\\")
        else:
            pieces.append(character)
    return "".join(pieces).encode("utf-8", "backslashreplace").decode("utf-8")


def inspect_package(root: Path) -> tuple[list[Path], list[str]]:
    """Return regular package files and all package-boundary errors."""

    files: list[Path] = []
    errors: list[str] = []
    try:
        root_mode = root.lstat().st_mode
    except OSError as exc:
        return files, [f"cannot inspect package root: {exc}"]
    if not stat.S_ISDIR(root_mode):
        return files, ["package root must be a regular directory"]

    folded_paths: dict[str, str] = {}
    entries = 0
    total_bytes = 0
    stopped = False

    def walk(directory: Path) -> None:
        nonlocal entries, stopped, total_bytes
        if stopped:
            return
        try:
            children = sorted(os.scandir(directory), key=lambda item: os.fsencode(item.name))
        except OSError as exc:
            errors.append(f"cannot scan directory: {exc}")
            return
        for child in children:
            if stopped:
                return
            if entries >= MAX_PACKAGE_ENTRIES:
                errors.append(f"package exceeds {MAX_PACKAGE_ENTRIES} entries")
                stopped = True
                return
            entries += 1
            path = Path(child.path)
            relative = path.relative_to(root).as_posix()
            shown = escape_path(relative)
            try:
                encoded = relative.encode("utf-8")
            except UnicodeEncodeError:
                errors.append(f"{shown}: path is not valid UTF-8")
                encoded = b""
            if len(encoded) > MAX_PATH_BYTES:
                errors.append(f"{shown}: path exceeds {MAX_PATH_BYTES} UTF-8 bytes")
            if any(ord(character) < 0x20 or ord(character) == 0x7F for character in relative):
                errors.append(f"{shown}: path contains ASCII control characters or DEL")
            folded = relative.casefold()
            previous = folded_paths.get(folded)
            if previous is not None:
                errors.append(f"{shown}: case-folded path duplicates {previous}")
            else:
                folded_paths[folded] = shown
            try:
                metadata = child.stat(follow_symlinks=False)
            except OSError as exc:
                errors.append(f"{shown}: cannot stat entry: {exc}")
                continue
            if stat.S_ISDIR(metadata.st_mode):
                walk(path)
            elif stat.S_ISREG(metadata.st_mode):
                files.append(path)
                if len(files) > MAX_PACKAGE_FILES:
                    errors.append(f"package exceeds {MAX_PACKAGE_FILES} files")
                    stopped = True
                    return
                total_bytes += metadata.st_size
                if metadata.st_size > MAX_FILE_BYTES:
                    errors.append(f"{shown}: file exceeds {MAX_FILE_BYTES} bytes")
            else:
                errors.append(f"{shown}: package entries must be regular files or directories")

    walk(root)
    if total_bytes > MAX_PACKAGE_BYTES:
        errors.append(f"package contains {total_bytes} bytes; maximum is {MAX_PACKAGE_BYTES}")
    return files, errors


def compute_package_digest(root: Path) -> str:
    """Return the deterministic sha256-tree-v1 digest for a plugin directory."""

    files, errors = inspect_package(root)
    if errors:
        raise PackageValidationError("; ".join(errors))
    tree_hash = hashlib.sha256()
    ordered = sorted(files, key=lambda path: path.relative_to(root).as_posix().encode("utf-8"))
    for path in ordered:
        relative = path.relative_to(root).as_posix()
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode):
            raise PackageValidationError(f"{relative}: package entry is not a regular file")
        content = path.read_bytes()
        executable = metadata.st_mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        mode = "100755" if executable else "100644"
        record = (
            f"{mode}\0{relative}\0{len(content)}\0"
            f"{hashlib.sha256(content).hexdigest()}\n"
        )
        tree_hash.update(record.encode("utf-8"))
    return tree_hash.hexdigest()
