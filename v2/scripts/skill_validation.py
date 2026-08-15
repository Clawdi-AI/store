"""Agent Skills frontmatter validation for Agent v2 plugin packages."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from yaml.constructor import ConstructorError
from yaml.nodes import MappingNode

FRONTMATTER_FIELDS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
}
SKILL_NAME_RE = re.compile(r"^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


class UniqueKeySafeLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects duplicate keys at every mapping level."""

    def construct_mapping(self, node: MappingNode, deep: bool = False) -> dict[Any, Any]:
        if not isinstance(node, MappingNode):
            raise ConstructorError(
                None,
                None,
                f"expected a mapping node, but found {node.id}",
                node.start_mark,
            )
        self.flatten_mapping(node)
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            try:
                duplicate = key in mapping
            except TypeError as exc:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    "found an unhashable mapping key",
                    key_node.start_mark,
                ) from exc
            if duplicate:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"found duplicate key ({key!r})",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def _yaml_error(exc: yaml.YAMLError) -> str:
    if isinstance(exc, yaml.MarkedYAMLError) and exc.problem:
        location = ""
        if exc.problem_mark is not None:
            location = f" at frontmatter line {exc.problem_mark.line + 1}"
        return f"invalid YAML frontmatter: {exc.problem}{location}"
    return f"invalid YAML frontmatter: {exc}"


def _load_frontmatter(path: Path) -> tuple[Any | None, list[str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return None, [f"cannot read UTF-8 SKILL.md: {exc}"]
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return None, ["SKILL.md must start with YAML frontmatter"]
    try:
        end = lines.index("---", 1)
    except ValueError:
        return None, ["SKILL.md frontmatter is not closed"]
    source = "\n".join(lines[1:end]) + "\n"
    try:
        return yaml.load(source, Loader=UniqueKeySafeLoader), []
    except yaml.YAMLError as exc:
        return None, [_yaml_error(exc)]


def validate_skill_frontmatter(path: Path, expected_name: str) -> list[str]:
    """Return all Agent Skills frontmatter errors for one regular SKILL.md."""

    frontmatter, errors = _load_frontmatter(path)
    if errors:
        return errors
    if not isinstance(frontmatter, dict):
        return ["SKILL.md frontmatter must be a mapping"]

    for field_name in frontmatter:
        if not isinstance(field_name, str):
            errors.append("frontmatter field names must be strings")
        elif field_name not in FRONTMATTER_FIELDS:
            errors.append(f"unknown frontmatter field: {field_name}")

    name = frontmatter.get("name")
    if not isinstance(name, str):
        errors.append("frontmatter name is required and must be a string")
    else:
        if not 1 <= len(name) <= 64 or not SKILL_NAME_RE.fullmatch(name):
            errors.append("frontmatter name is not a valid Agent Skills name")
        if name != expected_name:
            errors.append(f"frontmatter name must match directory {expected_name!r}")

    description = frontmatter.get("description")
    if not isinstance(description, str):
        errors.append("frontmatter description is required and must be a string")
    elif not description.strip() or len(description) > 1024:
        errors.append("frontmatter description must contain 1-1024 characters")

    for field_name in ("license", "allowed-tools"):
        if field_name in frontmatter and not isinstance(frontmatter[field_name], str):
            errors.append(f"frontmatter {field_name} must be a string")

    if "compatibility" in frontmatter:
        compatibility = frontmatter["compatibility"]
        if not isinstance(compatibility, str):
            errors.append("frontmatter compatibility must be a string")
        elif not 1 <= len(compatibility) <= 500:
            errors.append("frontmatter compatibility must contain 1-500 characters")

    if "metadata" in frontmatter:
        metadata = frontmatter["metadata"]
        if not isinstance(metadata, dict) or any(
            not isinstance(key, str) or not isinstance(value, str)
            for key, value in metadata.items()
        ):
            errors.append("frontmatter metadata must map string keys to string values")

    return errors
