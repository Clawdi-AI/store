#!/usr/bin/env python3
"""Build deterministic Agent Plugin release artifacts from pinned GitHub sources."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import stat
import tarfile
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable
from urllib.parse import quote, urlsplit

import yaml

if __package__:
    from .plugin_package import inspect_package
    from .plugin_validation import PluginReport, validate_plugin
    from .skill_validation import FRONTMATTER_FIELDS, UniqueKeySafeLoader
else:
    from plugin_package import inspect_package
    from plugin_validation import PluginReport, validate_plugin
    from skill_validation import FRONTMATTER_FIELDS, UniqueKeySafeLoader

V2_ROOT = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = V2_ROOT.parent
SOURCE_PACKAGES_ROOT = V2_ROOT / "source-packages"

RECIPE_FILE = "recipe.json"
RELEASE_FILE = "release.json"
PACKAGE_TEMPLATE_DIRECTORY = "package"
RECIPE_SCHEMA_VERSIONS = {1, 2}
RELEASE_SCHEMA_VERSION = 1

MAX_UPSTREAM_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_UPSTREAM_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_UPSTREAM_FILE_BYTES = 50 * 1024 * 1024
MAX_UPSTREAM_ARCHIVE_ENTRIES = 10_000
MAX_RECIPE_BYTES = 1024 * 1024
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
RELEASE_COMPONENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
RELEASE_REPOSITORY_URL = "https://github.com/Clawdi-AI/store"

JsonObject = dict[str, Any]
ArchiveFetcher = Callable[[str], bytes]


class SourcePackageError(ValueError):
    """Raised when a source recipe or generated package is invalid."""


@dataclass(frozen=True)
class FrontmatterNormalization:
    unknown_fields: str | None
    metadata_values: str | None


@dataclass(frozen=True)
class TextReplacement:
    path: str
    old: str
    new: str
    count: int


@dataclass(frozen=True)
class SourceMapping:
    source: str
    target: str
    exclude: tuple[str, ...]
    frontmatter: FrontmatterNormalization | None
    replacements: tuple[TextReplacement, ...]


@dataclass(frozen=True)
class SourceAsset:
    source: str
    target: str


@dataclass(frozen=True)
class UpstreamSource:
    repository: str
    commit: str
    mappings: tuple[SourceMapping, ...]
    assets: tuple[SourceAsset, ...]


@dataclass(frozen=True)
class ArtifactTarget:
    repository: str
    tag: str
    asset: str

    @property
    def download_url(self) -> str:
        return f"{self.repository}/releases/download/{quote(self.tag)}/{quote(self.asset)}"


@dataclass(frozen=True)
class SourceRecipe:
    root: Path
    schema_version: int
    artifact: ArtifactTarget
    upstreams: tuple[UpstreamSource, ...]


@dataclass(frozen=True)
class BuiltSourcePackage:
    recipe: SourceRecipe
    report: PluginReport
    archive: bytes
    release: JsonObject


def _json_object(pairs: list[tuple[str, Any]]) -> JsonObject:
    value: JsonObject = {}
    for key, item in pairs:
        if key in value:
            raise SourcePackageError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def _load_json(path: Path, *, maximum_bytes: int = MAX_RECIPE_BYTES) -> Any:
    try:
        mode = path.lstat().st_mode
        if not stat.S_ISREG(mode):
            raise SourcePackageError("must be a regular file")
        content = path.read_bytes()
        if len(content) > maximum_bytes:
            raise SourcePackageError(f"exceeds {maximum_bytes} bytes")
        return json.loads(content.decode("utf-8"), object_pairs_hook=_json_object)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        if isinstance(exc, SourcePackageError):
            raise
        raise SourcePackageError(str(exc)) from exc


def _canonical_json(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n").encode("utf-8")


def _closed_object(value: Any, *, fields: set[str], context: str) -> JsonObject:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise SourcePackageError(f"{context} must be an object")
    unknown = sorted(value.keys() - fields)
    if unknown:
        raise SourcePackageError(f"{context} has unknown field: {unknown[0]}")
    return value


def _canonical_github_repository(value: Any, *, context: str) -> str:
    if not isinstance(value, str) or len(value) > 500:
        raise SourcePackageError(f"{context} must be a canonical GitHub repository URL")
    try:
        parsed = urlsplit(value)
        parsed.port
    except ValueError as exc:
        raise SourcePackageError(f"{context} must be a canonical GitHub repository URL") from exc
    segments = parsed.path.split("/")
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or len(segments) != 3
        or any(not segment for segment in segments[1:])
        or any(not re.fullmatch(r"[A-Za-z0-9_.-]+", segment) for segment in segments[1:])
        or value != f"https://github.com{parsed.path}"
    ):
        raise SourcePackageError(f"{context} must be a canonical GitHub repository URL")
    return value


def _safe_relative_path(value: Any, *, context: str) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 500:
        raise SourcePackageError(f"{context} must be a safe relative path")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or str(path) != value
        or any(part in {"", ".", ".."} for part in path.parts)
        or "\\" in value
        or any(ord(character) < 0x20 or ord(character) == 0x7F for character in value)
    ):
        raise SourcePackageError(f"{context} must be a safe relative path")
    return value


def _bounded_text(value: Any, *, context: str, allow_empty: bool = False) -> str:
    if (
        not isinstance(value, str)
        or (not allow_empty and not value)
        or len(value.encode("utf-8")) > 10_000
        or "\x00" in value
    ):
        qualifier = "a bounded string" if allow_empty else "a non-empty bounded string"
        raise SourcePackageError(f"{context} must be {qualifier}")
    return value


def _target_overlaps(target: str, targets: set[str]) -> bool:
    folded = target.casefold()
    return any(
        folded == existing
        or folded.startswith(f"{existing}/")
        or existing.startswith(f"{folded}/")
        for existing in targets
    )


def load_recipe(path: Path) -> SourceRecipe:
    """Load one closed source-package recipe."""

    document = _closed_object(
        _load_json(path),
        fields={"schemaVersion", "artifact", "upstreams"},
        context=path.as_posix(),
    )
    schema_version = document.get("schemaVersion")
    if schema_version not in RECIPE_SCHEMA_VERSIONS or type(schema_version) is not int:
        raise SourcePackageError(f"{path.as_posix()}: schemaVersion must equal 1 or 2")

    artifact_document = _closed_object(
        document.get("artifact"),
        fields={"repository", "tag", "asset"},
        context=f"{path.as_posix()}.artifact",
    )
    repository = _canonical_github_repository(
        artifact_document.get("repository"), context=f"{path.as_posix()}.artifact.repository"
    )
    if repository != RELEASE_REPOSITORY_URL:
        raise SourcePackageError(
            f"{path.as_posix()}.artifact.repository must equal {RELEASE_REPOSITORY_URL}"
        )
    tag = artifact_document.get("tag")
    asset = artifact_document.get("asset")
    if not isinstance(tag, str) or RELEASE_COMPONENT_RE.fullmatch(tag) is None:
        raise SourcePackageError(f"{path.as_posix()}.artifact.tag is invalid")
    if (
        not isinstance(asset, str)
        or RELEASE_COMPONENT_RE.fullmatch(asset) is None
        or not asset.endswith(".tar.gz")
    ):
        raise SourcePackageError(f"{path.as_posix()}.artifact.asset is invalid")

    upstream_documents = document.get("upstreams")
    if not isinstance(upstream_documents, list) or not 1 <= len(upstream_documents) <= 20:
        raise SourcePackageError(f"{path.as_posix()}.upstreams must contain 1-20 entries")
    upstreams: list[UpstreamSource] = []
    targets: set[str] = set()
    for upstream_index, raw_upstream in enumerate(upstream_documents):
        upstream_context = f"{path.as_posix()}.upstreams[{upstream_index}]"
        upstream_document = _closed_object(
            raw_upstream,
            fields={"repository", "commit", "mappings", "assets"}
            if schema_version == 2
            else {"repository", "commit", "mappings"},
            context=upstream_context,
        )
        upstream_repository = _canonical_github_repository(
            upstream_document.get("repository"), context=f"{upstream_context}.repository"
        )
        commit = upstream_document.get("commit")
        if not isinstance(commit, str) or COMMIT_RE.fullmatch(commit) is None:
            raise SourcePackageError(f"{upstream_context}.commit must be a lowercase 40-hex commit")
        mapping_documents = upstream_document.get("mappings")
        if not isinstance(mapping_documents, list) or not 1 <= len(mapping_documents) <= 1_000:
            raise SourcePackageError(f"{upstream_context}.mappings must contain 1-1000 entries")
        mappings: list[SourceMapping] = []
        for mapping_index, raw_mapping in enumerate(mapping_documents):
            mapping_context = f"{upstream_context}.mappings[{mapping_index}]"
            mapping_document = _closed_object(
                raw_mapping,
                fields={"source", "target", "exclude", "frontmatter", "replacements"}
                if schema_version == 2
                else {"source", "target", "exclude"},
                context=mapping_context,
            )
            source = _safe_relative_path(
                mapping_document.get("source"), context=f"{mapping_context}.source"
            )
            target = _safe_relative_path(
                mapping_document.get("target"), context=f"{mapping_context}.target"
            )
            if not target.startswith("skills/"):
                raise SourcePackageError(f"{mapping_context}.target must be under skills/")
            if _target_overlaps(target, targets):
                raise SourcePackageError(f"{mapping_context}.target overlaps another target")
            targets.add(target.casefold())
            raw_exclude = mapping_document.get("exclude", [])
            if not isinstance(raw_exclude, list) or len(raw_exclude) > 100:
                raise SourcePackageError(f"{mapping_context}.exclude must be an array")
            exclude = tuple(
                _safe_relative_path(item, context=f"{mapping_context}.exclude")
                for item in raw_exclude
            )
            if len({item.casefold() for item in exclude}) != len(exclude):
                raise SourcePackageError(f"{mapping_context}.exclude contains duplicates")

            frontmatter: FrontmatterNormalization | None = None
            raw_frontmatter = mapping_document.get("frontmatter")
            if raw_frontmatter is not None:
                frontmatter_document = _closed_object(
                    raw_frontmatter,
                    fields={"unknownFields", "metadataValues"},
                    context=f"{mapping_context}.frontmatter",
                )
                unknown_fields = frontmatter_document.get("unknownFields")
                metadata_values = frontmatter_document.get("metadataValues")
                if unknown_fields not in {None, "metadata"}:
                    raise SourcePackageError(
                        f"{mapping_context}.frontmatter.unknownFields must equal metadata"
                    )
                if metadata_values not in {None, "json-string"}:
                    raise SourcePackageError(
                        f"{mapping_context}.frontmatter.metadataValues must equal json-string"
                    )
                if unknown_fields is None and metadata_values is None:
                    raise SourcePackageError(f"{mapping_context}.frontmatter must not be empty")
                frontmatter = FrontmatterNormalization(
                    unknown_fields=unknown_fields,
                    metadata_values=metadata_values,
                )

            raw_replacements = mapping_document.get("replacements", [])
            if not isinstance(raw_replacements, list) or len(raw_replacements) > 100:
                raise SourcePackageError(f"{mapping_context}.replacements must be an array")
            replacements: list[TextReplacement] = []
            for replacement_index, raw_replacement in enumerate(raw_replacements):
                replacement_context = (
                    f"{mapping_context}.replacements[{replacement_index}]"
                )
                replacement_document = _closed_object(
                    raw_replacement,
                    fields={"path", "old", "new", "count"},
                    context=replacement_context,
                )
                replacement_path = _safe_relative_path(
                    replacement_document.get("path"),
                    context=f"{replacement_context}.path",
                )
                old = _bounded_text(
                    replacement_document.get("old"), context=f"{replacement_context}.old"
                )
                new = _bounded_text(
                    replacement_document.get("new"),
                    context=f"{replacement_context}.new",
                    allow_empty=True,
                )
                count = replacement_document.get("count", 1)
                if type(count) is not int or not 1 <= count <= 1_000:
                    raise SourcePackageError(
                        f"{replacement_context}.count must be an integer from 1 to 1000"
                    )
                if old == new:
                    raise SourcePackageError(f"{replacement_context}.old and new must differ")
                replacements.append(
                    TextReplacement(
                        path=replacement_path,
                        old=old,
                        new=new,
                        count=count,
                    )
                )
            mappings.append(
                SourceMapping(
                    source=source,
                    target=target,
                    exclude=exclude,
                    frontmatter=frontmatter,
                    replacements=tuple(replacements),
                )
            )

        raw_assets = upstream_document.get("assets", [])
        if not isinstance(raw_assets, list) or len(raw_assets) > 100:
            raise SourcePackageError(f"{upstream_context}.assets must be an array")
        assets: list[SourceAsset] = []
        for asset_index, raw_asset in enumerate(raw_assets):
            asset_context = f"{upstream_context}.assets[{asset_index}]"
            asset_document = _closed_object(
                raw_asset,
                fields={"source", "target"},
                context=asset_context,
            )
            asset_source = _safe_relative_path(
                asset_document.get("source"), context=f"{asset_context}.source"
            )
            asset_target = _safe_relative_path(
                asset_document.get("target"), context=f"{asset_context}.target"
            )
            if asset_target == "skills" or asset_target.startswith("skills/"):
                raise SourcePackageError(f"{asset_context}.target must not be under skills/")
            if asset_target.casefold() in {"plugin.json", "mcp.json", "sources.json"}:
                raise SourcePackageError(f"{asset_context}.target is reserved")
            if _target_overlaps(asset_target, targets):
                raise SourcePackageError(f"{asset_context}.target overlaps another target")
            targets.add(asset_target.casefold())
            assets.append(SourceAsset(source=asset_source, target=asset_target))
        upstreams.append(
            UpstreamSource(
                repository=upstream_repository,
                commit=commit,
                mappings=tuple(mappings),
                assets=tuple(assets),
            )
        )
    return SourceRecipe(
        root=path.parent,
        schema_version=schema_version,
        artifact=ArtifactTarget(repository=repository, tag=tag, asset=asset),
        upstreams=tuple(upstreams),
    )


def discover_recipes(root: Path = SOURCE_PACKAGES_ROOT) -> list[SourceRecipe]:
    """Return all recipes in deterministic directory-name order."""

    try:
        entries = sorted(os.scandir(root), key=lambda entry: os.fsencode(entry.name))
    except OSError as exc:
        raise SourcePackageError(f"cannot scan {root.as_posix()}: {exc}") from exc
    recipes: list[SourceRecipe] = []
    folded: set[str] = set()
    artifact_names: set[str] = set()
    artifact_urls: set[str] = set()
    for entry in entries:
        mode = entry.stat(follow_symlinks=False).st_mode
        if entry.name == "README.md" and stat.S_ISREG(mode):
            continue
        if not stat.S_ISDIR(mode):
            raise SourcePackageError(f"{entry.path}: source package entries must be directories")
        if entry.name.casefold() in folded:
            raise SourcePackageError(f"{entry.path}: case-folded source package name collision")
        folded.add(entry.name.casefold())
        recipe = load_recipe(Path(entry.path) / RECIPE_FILE)
        if recipe.artifact.asset.casefold() in artifact_names:
            raise SourcePackageError(f"{entry.path}: release asset name duplicates another recipe")
        if recipe.artifact.download_url in artifact_urls:
            raise SourcePackageError(f"{entry.path}: release asset URL duplicates another recipe")
        artifact_names.add(recipe.artifact.asset.casefold())
        artifact_urls.add(recipe.artifact.download_url)
        recipes.append(recipe)
    return recipes


def _default_fetcher(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "clawdi-store-v2/1"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 - URL is validated.
            content = response.read(MAX_UPSTREAM_ARCHIVE_BYTES + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise SourcePackageError(f"cannot download pinned upstream archive: {exc}") from exc
    if len(content) > MAX_UPSTREAM_ARCHIVE_BYTES:
        raise SourcePackageError("pinned upstream archive exceeds 100 MB")
    return content


def _upstream_archive_url(upstream: UpstreamSource) -> str:
    parsed = urlsplit(upstream.repository)
    owner, repository = parsed.path.strip("/").split("/")
    return f"https://codeload.github.com/{owner}/{repository}/tar.gz/{upstream.commit}"


def _archive_files(archive: bytes) -> dict[str, tuple[bytes, int]]:
    files: dict[str, tuple[bytes, int]] = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as source:
            members = source.getmembers()
            if len(members) > MAX_UPSTREAM_ARCHIVE_ENTRIES:
                raise SourcePackageError("pinned upstream archive exceeds 10000 entries")
            roots: set[str] = set()
            expanded_bytes = 0
            for member in members:
                path = PurePosixPath(member.name)
                if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
                    raise SourcePackageError("pinned upstream archive contains an unsafe path")
                roots.add(path.parts[0])
            if len(roots) != 1:
                raise SourcePackageError("pinned upstream archive must contain one repository root")
            root = next(iter(roots))
            for member in members:
                path = PurePosixPath(member.name)
                if len(path.parts) == 1 or member.isdir():
                    continue
                relative = PurePosixPath(*path.parts[1:]).as_posix()
                if not member.isfile():
                    raise SourcePackageError(
                        f"pinned upstream archive contains a non-regular entry: {relative}"
                    )
                if member.size < 0 or member.size > MAX_UPSTREAM_FILE_BYTES:
                    raise SourcePackageError("pinned upstream archive contains an oversized file")
                expanded_bytes += member.size
                if expanded_bytes > MAX_UPSTREAM_EXPANDED_BYTES:
                    raise SourcePackageError("pinned upstream archive exceeds the expansion limit")
                stream = source.extractfile(member)
                if stream is None:
                    raise SourcePackageError(f"cannot read pinned upstream file: {relative}")
                content = stream.read()
                if len(content) != member.size:
                    raise SourcePackageError(f"truncated pinned upstream file: {relative}")
                if relative in files:
                    raise SourcePackageError(f"duplicate pinned upstream path: {relative}")
                mode = 0o755 if member.mode & 0o111 else 0o644
                files[relative] = (content, mode)
    except (tarfile.TarError, OSError) as exc:
        raise SourcePackageError(f"invalid pinned upstream archive: {exc}") from exc
    return files


def _excluded(relative: str, exclusions: Iterable[str]) -> bool:
    return any(relative == exclusion or relative.startswith(f"{exclusion}/") for exclusion in exclusions)


def _write_regular_file(root: Path, relative: str, content: bytes, mode: int) -> None:
    destination = root / relative
    try:
        destination.relative_to(root)
    except ValueError as exc:
        raise SourcePackageError(f"generated path escapes package root: {relative}") from exc
    if destination.exists() or destination.is_symlink():
        raise SourcePackageError(f"generated package path collision: {relative}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    destination.chmod(mode)


def _copy_template(recipe: SourceRecipe, package_root: Path) -> None:
    template = recipe.root / PACKAGE_TEMPLATE_DIRECTORY
    files, errors = inspect_package(template)
    if errors:
        raise SourcePackageError("invalid package template: " + "; ".join(errors))
    for source in sorted(files, key=lambda path: path.relative_to(template).as_posix().encode("utf-8")):
        relative = source.relative_to(template).as_posix()
        mode = 0o755 if source.lstat().st_mode & 0o111 else 0o644
        _write_regular_file(package_root, relative, source.read_bytes(), mode)


def _metadata_string(value: Any, *, context: str) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    except (TypeError, ValueError) as exc:
        raise SourcePackageError(f"{context} cannot be represented as canonical JSON") from exc


def _normalize_skill_frontmatter(
    content: bytes,
    normalization: FrontmatterNormalization,
    *,
    context: str,
) -> bytes:
    try:
        text = content.decode("utf-8")
    except UnicodeError as exc:
        raise SourcePackageError(f"{context} must be UTF-8 for frontmatter normalization") from exc
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\r\n") != "---":
        raise SourcePackageError(f"{context} must start with YAML frontmatter")
    try:
        end = next(
            index for index, line in enumerate(lines[1:], start=1) if line.rstrip("\r\n") == "---"
        )
    except StopIteration as exc:
        raise SourcePackageError(f"{context} frontmatter is not closed") from exc
    try:
        frontmatter = yaml.load("".join(lines[1:end]), Loader=UniqueKeySafeLoader)
    except yaml.YAMLError as exc:
        raise SourcePackageError(f"{context} has invalid YAML frontmatter: {exc}") from exc
    if not isinstance(frontmatter, dict):
        raise SourcePackageError(f"{context} frontmatter must be a mapping")

    raw_metadata = frontmatter.get("metadata")
    if raw_metadata is None:
        metadata: dict[str, Any] = {}
    elif isinstance(raw_metadata, dict) and all(isinstance(key, str) for key in raw_metadata):
        metadata = dict(raw_metadata)
    else:
        raise SourcePackageError(f"{context} metadata must be a string-keyed mapping")

    changed = False
    if normalization.unknown_fields == "metadata":
        for field_name in list(frontmatter):
            if not isinstance(field_name, str):
                raise SourcePackageError(f"{context} frontmatter field names must be strings")
            if field_name in FRONTMATTER_FIELDS:
                continue
            metadata_name = f"upstream.{field_name}"
            if metadata_name in metadata:
                raise SourcePackageError(f"{context} metadata already contains {metadata_name!r}")
            metadata[metadata_name] = _metadata_string(
                frontmatter.pop(field_name), context=f"{context}.{field_name}"
            )
            changed = True

    if normalization.metadata_values == "json-string":
        changed = changed or any(not isinstance(value, str) for value in metadata.values())
        metadata = {
            key: _metadata_string(value, context=f"{context}.metadata.{key}")
            for key, value in metadata.items()
        }

    if not changed:
        raise SourcePackageError(f"{context} frontmatter normalization did not change any fields")

    if metadata:
        frontmatter["metadata"] = metadata
    elif "metadata" in frontmatter:
        frontmatter.pop("metadata")

    rendered = yaml.safe_dump(
        frontmatter,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=10_000,
    )
    body = "".join(lines[end + 1 :])
    return f"---\n{rendered}---\n{body}".encode("utf-8")


def _transform_mapping_content(
    mapping: SourceMapping,
    relative: str,
    content: bytes,
    *,
    context: str,
) -> bytes:
    transformed = content
    if mapping.frontmatter is not None and relative == "SKILL.md":
        transformed = _normalize_skill_frontmatter(
            transformed,
            mapping.frontmatter,
            context=context,
        )
    relevant = [replacement for replacement in mapping.replacements if replacement.path == relative]
    if not relevant:
        return transformed
    try:
        text = transformed.decode("utf-8")
    except UnicodeError as exc:
        raise SourcePackageError(f"{context} must be UTF-8 for text replacement") from exc
    for replacement in relevant:
        actual = text.count(replacement.old)
        if actual != replacement.count:
            raise SourcePackageError(
                f"{context} replacement expected {replacement.count} occurrence(s), found {actual}"
            )
        text = text.replace(replacement.old, replacement.new, replacement.count)
    return text.encode("utf-8")


def _copy_upstream(
    package_root: Path,
    upstream: UpstreamSource,
    archive: bytes,
) -> None:
    files = _archive_files(archive)
    for mapping in upstream.mappings:
        prefix = f"{mapping.source}/"
        selected = 0
        selected_paths: set[str] = set()
        for source_path in sorted(files, key=lambda value: value.encode("utf-8")):
            if source_path == mapping.source:
                relative = PurePosixPath(source_path).name
            elif source_path.startswith(prefix):
                relative = source_path[len(prefix) :]
            else:
                continue
            if _excluded(relative, mapping.exclude):
                continue
            content, mode = files[source_path]
            context = f"{upstream.repository}@{upstream.commit}:{source_path}"
            transformed = _transform_mapping_content(
                mapping,
                relative,
                content,
                context=context,
            )
            _write_regular_file(
                package_root,
                f"{mapping.target}/{relative}",
                transformed,
                mode,
            )
            selected_paths.add(relative)
            selected += 1
        if selected == 0:
            raise SourcePackageError(
                "pinned source path is missing or empty: "
                f"{upstream.repository}@{upstream.commit}:{mapping.source}"
            )
        if mapping.frontmatter is not None and "SKILL.md" not in selected_paths:
            raise SourcePackageError(
                "frontmatter normalization target is missing: "
                f"{upstream.repository}@{upstream.commit}:{mapping.source}/SKILL.md"
            )
        for replacement in mapping.replacements:
            if replacement.path not in selected_paths:
                raise SourcePackageError(
                    f"replacement target is missing: {upstream.repository}@{upstream.commit}:"
                    f"{mapping.source}/{replacement.path}"
                )

    for asset in upstream.assets:
        if asset.source in files:
            content, mode = files[asset.source]
            _write_regular_file(package_root, asset.target, content, mode)
            continue
        prefix = f"{asset.source}/"
        selected = 0
        for source_path in sorted(files, key=lambda value: value.encode("utf-8")):
            if not source_path.startswith(prefix):
                continue
            relative = source_path[len(prefix) :]
            content, mode = files[source_path]
            _write_regular_file(package_root, f"{asset.target}/{relative}", content, mode)
            selected += 1
        if selected == 0:
            raise SourcePackageError(
                "pinned asset path is missing or empty: "
                f"{upstream.repository}@{upstream.commit}:{asset.source}"
            )


def _source_provenance(recipe: SourceRecipe) -> JsonObject:
    def mapping_document(mapping: SourceMapping) -> JsonObject:
        document: JsonObject = {
            "source": mapping.source,
            "target": mapping.target,
            **({"exclude": list(mapping.exclude)} if mapping.exclude else {}),
        }
        if mapping.frontmatter is not None:
            document["frontmatter"] = {
                **(
                    {"unknownFields": mapping.frontmatter.unknown_fields}
                    if mapping.frontmatter.unknown_fields is not None
                    else {}
                ),
                **(
                    {"metadataValues": mapping.frontmatter.metadata_values}
                    if mapping.frontmatter.metadata_values is not None
                    else {}
                ),
            }
        if mapping.replacements:
            document["replacements"] = [
                {
                    "path": replacement.path,
                    "old": replacement.old,
                    "new": replacement.new,
                    "count": replacement.count,
                }
                for replacement in mapping.replacements
            ]
        return document

    return {
        "schemaVersion": recipe.schema_version,
        "sources": [
            {
                "repository": upstream.repository,
                "commit": upstream.commit,
                "mappings": [mapping_document(mapping) for mapping in upstream.mappings],
                **(
                    {
                        "assets": [
                            {"source": asset.source, "target": asset.target}
                            for asset in upstream.assets
                        ]
                    }
                    if upstream.assets
                    else {}
                ),
            }
            for upstream in recipe.upstreams
        ],
    }


def _build_archive(package_root: Path, plugin_name: str) -> bytes:
    files, errors = inspect_package(package_root)
    if errors:
        raise SourcePackageError("cannot archive generated package: " + "; ".join(errors))
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.GNU_FORMAT) as archive:
            for source in sorted(
                files, key=lambda path: path.relative_to(package_root).as_posix().encode("utf-8")
            ):
                relative = source.relative_to(package_root).as_posix()
                content = source.read_bytes()
                info = tarfile.TarInfo(f"{plugin_name}/{relative}")
                info.size = len(content)
                info.mode = 0o755 if source.lstat().st_mode & 0o111 else 0o644
                info.mtime = 0
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                archive.addfile(info, io.BytesIO(content))
    return output.getvalue()


def _catalog_projection(report: PluginReport) -> JsonObject:
    if report.manifest is None or report.digest is None or report.errors:
        raise SourcePackageError("generated package did not pass validation")
    manifest = report.manifest
    extension = manifest["extensions"]["ai.clawdi"]
    display = extension["display"]
    compatibility = extension.get("compatibility", {})
    entry: JsonObject = {
        "name": manifest["name"],
        "version": manifest["version"],
        "displayName": display["name"],
        "category": display["category"],
        "keywords": list(manifest["keywords"]),
        "languages": list(display["languages"]),
        "runtimes": list(compatibility.get("runtimes", [])),
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
    return entry


def build_source_package(
    recipe: SourceRecipe,
    *,
    fetcher: ArchiveFetcher = _default_fetcher,
) -> BuiltSourcePackage:
    """Materialize, validate, and archive one pinned source package."""

    with tempfile.TemporaryDirectory(prefix=".source-package-", dir=V2_ROOT) as temporary:
        package_root = Path(temporary) / recipe.root.name
        package_root.mkdir()
        _copy_template(recipe, package_root)
        for upstream in recipe.upstreams:
            _copy_upstream(package_root, upstream, fetcher(_upstream_archive_url(upstream)))
        _write_regular_file(
            package_root,
            "SOURCES.json",
            _canonical_json(_source_provenance(recipe)),
            0o644,
        )
        report = validate_plugin(package_root, REPOSITORY_ROOT)
        if report.errors:
            raise SourcePackageError("; ".join(report.errors))
        if report.key != recipe.root.name:
            raise SourcePackageError("generated package name does not match its recipe directory")
        archive = _build_archive(package_root, report.key)
        archive_digest = hashlib.sha256(archive).hexdigest()
        release: JsonObject = {
            "schemaVersion": RELEASE_SCHEMA_VERSION,
            "source": {
                "type": "github-release",
                "url": recipe.artifact.download_url,
                "archiveDigest": f"sha256:{archive_digest}",
            },
            "digest": f"sha256-tree-v1:{report.digest}",
            "catalog": _catalog_projection(report),
        }
        return BuiltSourcePackage(
            recipe=recipe,
            report=report,
            archive=archive,
            release=release,
        )


def load_release(path: Path) -> JsonObject:
    """Load one canonical generated source-package release lock."""

    document = _closed_object(
        _load_json(path),
        fields={"schemaVersion", "source", "digest", "catalog"},
        context=path.as_posix(),
    )
    if document.get("schemaVersion") != RELEASE_SCHEMA_VERSION:
        raise SourcePackageError(f"{path.as_posix()}: schemaVersion must equal 1")
    source = _closed_object(
        document.get("source"),
        fields={"type", "url", "archiveDigest"},
        context=f"{path.as_posix()}.source",
    )
    if source.get("type") != "github-release":
        raise SourcePackageError(f"{path.as_posix()}.source.type must equal github-release")
    url = source.get("url")
    if not isinstance(url, str) or len(url) > 1000:
        raise SourcePackageError(f"{path.as_posix()}.source.url is invalid")
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.query
        or parsed.fragment
        or not re.fullmatch(r"/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\.tar\.gz", parsed.path)
        or url != f"https://github.com{parsed.path}"
    ):
        raise SourcePackageError(f"{path.as_posix()}.source.url is not a canonical GitHub release asset")
    if not isinstance(source.get("archiveDigest"), str) or SHA256_RE.fullmatch(
        source["archiveDigest"]
    ) is None:
        raise SourcePackageError(f"{path.as_posix()}.source.archiveDigest is invalid")
    digest = document.get("digest")
    if not isinstance(digest, str) or re.fullmatch(r"sha256-tree-v1:[0-9a-f]{64}", digest) is None:
        raise SourcePackageError(f"{path.as_posix()}.digest is invalid")
    if not isinstance(document.get("catalog"), dict):
        raise SourcePackageError(f"{path.as_posix()}.catalog must be an object")
    if path.read_bytes() != _canonical_json(document):
        raise SourcePackageError(f"{path.as_posix()} is not canonical generated JSON")
    return document


def load_source_releases(recipes: Iterable[SourceRecipe]) -> list[JsonObject]:
    """Load release locks for already-discovered recipes."""

    return [load_release(recipe.root / RELEASE_FILE) for recipe in recipes]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true", help="write generated release locks")
    action.add_argument("--check", action="store_true", help="check generated release locks")
    parser.add_argument("--artifacts", type=Path, help="write deterministic release artifacts")
    args = parser.parse_args()

    try:
        recipes = discover_recipes()
        built = [build_source_package(recipe) for recipe in recipes]
        errors: list[str] = []
        if args.artifacts is not None:
            args.artifacts.mkdir(parents=True, exist_ok=True)
        for package in built:
            release_path = package.recipe.root / RELEASE_FILE
            expected = _canonical_json(package.release)
            if args.write:
                release_path.write_bytes(expected)
            else:
                try:
                    actual = release_path.read_bytes()
                except OSError as exc:
                    errors.append(f"{release_path.as_posix()}: {exc}")
                else:
                    if actual != expected:
                        errors.append(
                            f"{release_path.as_posix()} is stale; run python3 v2/scripts/source_package.py --write"
                        )
            if args.artifacts is not None:
                (args.artifacts / package.recipe.artifact.asset).write_bytes(package.archive)
            print(
                f"OK {package.report.key}@{package.report.manifest['version']} "
                f"{package.release['digest']} {package.release['source']['archiveDigest']}"
            )
        for error in errors:
            print(f"ERROR {error}")
        return 1 if errors else 0
    except (OSError, SourcePackageError) as exc:
        print(f"ERROR {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
