"""Offline validation for Agent Plugins packages published by the Agent v2 Store."""

from __future__ import annotations

import ipaddress
import json
import os
import re
import stat
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit

if __package__:
    from .plugin_package import (
        PackageValidationError,
        compute_package_digest,
        escape_path,
        inspect_package,
    )
    from .skill_validation import validate_skill_frontmatter
else:
    from plugin_package import (
        PackageValidationError,
        compute_package_digest,
        escape_path,
        inspect_package,
    )
    from skill_validation import validate_skill_frontmatter

PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"

PLUGIN_FIELDS = {
    "$schema",
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
    "extensions",
}
AUTHOR_FIELDS = {"name", "email", "url"}
CLAWDI_FIELDS = {"schemaVersion", "display", "configuration", "compatibility"}
DISPLAY_FIELDS = {"name", "icon", "category", "languages"}
CONFIGURATION_FIELDS = {"secretSlots"}
SLOT_FIELDS = {"label", "description", "required", "bindings"}
BINDING_FIELDS = {"server", "target", "name", "prefix"}
COMPATIBILITY_FIELDS = {"runtimes", "executables"}
MCP_FIELDS = {"$schema", "mcpServers"}
STDIO_FIELDS = {"type", "command", "args", "env", "cwd"}
REMOTE_FIELDS = {"type", "url", "headers"}

PLUGIN_NAME_RE = re.compile(r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
SLOT_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
EXECUTABLE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$")
CATEGORY_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
LANGUAGE_RE = re.compile(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$")
HEADER_NAME_RE = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
PLACEHOLDER_LIKE_RE = re.compile(r"\$\{[^}]*\}")
SENSITIVE_NAME_RE = re.compile(
    r"(?:^|_)(?:ACCESS_?KEY|API_?KEY|AUTHORIZATION|AUTH_?TOKEN|"
    r"BEARER_?TOKEN|CLIENT_?SECRET|CREDENTIALS?|PASS(?:WORD|WD)?|PAT|"
    r"PRIVATE_?KEY|SECRET|TOKEN)(?:_|$)",
    re.IGNORECASE,
)
SEMVER_RE = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    r"(?:-((?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "proxy-authorization",
    "x-api-key",
    "x-auth-token",
}
ALLOWED_RUNTIMES = {"openclaw", "hermes"}
EXPANDED_CWD_PLACEHOLDERS = ("${PLUGIN_ROOT}", "${PLUGIN_DATA}")


class DuplicateKeyError(ValueError):
    """Raised when JSON contains a duplicate member name."""


@dataclass
class PluginReport:
    key: str
    errors: list[str] = field(default_factory=list)
    digest: str | None = None
    valid_skills: int = 0
    valid_servers: int = 0
    manifest: dict[str, Any] | None = field(default=None, repr=False)


def _json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise DuplicateKeyError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"invalid JSON number: {value}")


def _load_json(path: Path) -> tuple[Any | None, str | None]:
    try:
        text = path.read_text(encoding="utf-8")
        return (
            json.loads(
                text,
                object_pairs_hook=_json_object,
                parse_constant=_reject_json_constant,
            ),
            None,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        return None, str(exc)


class Validator:
    def __init__(self, root: Path, repository_root: Path) -> None:
        self.root = root
        self.repository_root = repository_root
        self.errors: list[str] = []
        self.server_types: dict[str, str] = {}
        self.configured_targets: dict[str, dict[str, set[str]]] = {}
        self.bare_commands: set[str] = set()

    def path(self, path: Path) -> str:
        try:
            shown = path.relative_to(self.repository_root).as_posix()
        except ValueError:
            shown = path.as_posix()
        return escape_path(shown)

    def error(self, path: Path, message: str) -> None:
        self.errors.append(f"{self.path(path)}: {message}")

    @staticmethod
    def server_context(name: str) -> str:
        return f"mcpServers[{json.dumps(name, ensure_ascii=True)}]"

    def closed(
        self,
        path: Path,
        value: dict[str, Any],
        allowed: set[str],
        context: str | None = None,
    ) -> None:
        for key in sorted(value.keys() - allowed):
            prefix = f"{context}: " if context else ""
            self.error(path, f"{prefix}unknown field: {key}")

    def string(
        self,
        path: Path,
        value: Any,
        field_name: str,
        *,
        required: bool = False,
        maximum: int | None = None,
    ) -> str | None:
        if not isinstance(value, str):
            self.error(path, f"{field_name} must be a string")
            return None
        if required and not value.strip():
            self.error(path, f"{field_name} must not be empty")
            return None
        if maximum is not None and len(value) > maximum:
            self.error(path, f"{field_name} exceeds {maximum} characters")
            return None
        return value

    def safe_relative(
        self,
        path: Path,
        value: str,
        field_name: str,
        *,
        expected: str,
        allow_root: bool = False,
    ) -> Path | None:
        if not value.startswith("./") or "\\" in value or "\x00" in value:
            self.error(path, f"{field_name} must be a safe plugin-relative ./ path")
            return None
        suffix = value[2:]
        if not suffix and allow_root:
            return self.root
        parts = PurePosixPath(suffix).parts
        if not suffix or suffix.startswith("/") or any(part in {"", ".", ".."} for part in parts):
            self.error(path, f"{field_name} must remain within the plugin root")
            return None
        target = self.root.joinpath(*parts)
        try:
            metadata = target.lstat()
        except OSError:
            self.error(path, f"{field_name} target does not exist: {value}")
            return None
        kind_matches = stat.S_ISREG(metadata.st_mode) if expected == "file" else stat.S_ISDIR(metadata.st_mode)
        if not kind_matches:
            self.error(path, f"{field_name} must reference a regular {expected}: {value}")
            return None
        return target

    def rooted_cwd(self, path: Path, value: str, field_name: str = "cwd") -> None:
        if value.startswith("./"):
            if any(placeholder in value for placeholder in EXPANDED_CWD_PLACEHOLDERS):
                self.error(path, f"{field_name} cannot embed an expanded plugin variable")
                return
            self.safe_relative(path, value, field_name, expected="directory", allow_root=True)
            return
        for prefix in EXPANDED_CWD_PLACEHOLDERS:
            if value == prefix:
                return
            if value.startswith(prefix + "/"):
                suffix = value[len(prefix) + 1 :]
                parts = PurePosixPath(suffix).parts
                if not suffix or suffix.startswith("/") or any(part in {"", ".", ".."} for part in parts):
                    self.error(path, f"{field_name} escapes its configured root")
                elif any(placeholder in suffix for placeholder in EXPANDED_CWD_PLACEHOLDERS):
                    self.error(path, f"{field_name} cannot embed another expanded plugin variable")
                elif prefix == "${PLUGIN_ROOT}":
                    relative = "./" + "/".join(parts)
                    self.safe_relative(path, relative, field_name, expected="directory")
                return
        self.error(path, f"{field_name} must be rooted at ./, ${{PLUGIN_ROOT}}, or ${{PLUGIN_DATA}}")

    def manifest(self) -> dict[str, Any] | None:
        path = self.root / "plugin.json"
        try:
            metadata = path.lstat()
        except OSError:
            self.error(self.root, "missing plugin.json")
            return None
        if not stat.S_ISREG(metadata.st_mode):
            self.error(path, "plugin.json must be a regular file")
            return None
        manifest, failure = _load_json(path)
        if failure is not None:
            self.error(path, f"invalid JSON: {failure}")
            return None
        if not isinstance(manifest, dict):
            self.error(path, "manifest must be an object")
            return None
        self.closed(path, manifest, PLUGIN_FIELDS)
        if manifest.get("$schema") != PLUGIN_SCHEMA:
            self.error(path, f"$schema must equal {PLUGIN_SCHEMA}")
        name = self.string(path, manifest.get("name"), "name", required=True, maximum=64)
        if name is not None:
            if not PLUGIN_NAME_RE.fullmatch(name):
                self.error(path, "name is not a valid Agent Plugins name")
            if name != self.root.name:
                self.error(path, f"name must match plugin directory {self.root.name!r}")
        version = self.string(path, manifest.get("version"), "version", required=True, maximum=256)
        if version is not None and not SEMVER_RE.fullmatch(version):
            self.error(path, "version must be exact Semantic Versioning")
        for field_name in ("description", "homepage", "repository", "license"):
            if field_name in manifest:
                maximum = 512 if field_name == "description" else None
                self.string(
                    path,
                    manifest[field_name],
                    field_name,
                    required=field_name == "description",
                    maximum=maximum,
                )
        if "author" in manifest:
            author = manifest["author"]
            if not isinstance(author, dict):
                self.error(path, "author must be an object")
            else:
                self.closed(path, author, AUTHOR_FIELDS)
                for field_name, value in author.items():
                    maximum = 80 if field_name == "name" else None
                    self.string(
                        path,
                        value,
                        f"author.{field_name}",
                        required=field_name == "name",
                        maximum=maximum,
                    )
        self.string_array(
            path,
            manifest.get("keywords"),
            "keywords",
            maximum_items=20,
            maximum_length=32,
        )
        extensions = manifest.get("extensions")
        if not isinstance(extensions, dict):
            self.error(path, "extensions must be an object containing ai.clawdi")
        else:
            for namespace, extension in extensions.items():
                if not isinstance(extension, dict):
                    self.error(path, f"extensions.{namespace} must be an object")
            clawdi = extensions.get("ai.clawdi")
            if not isinstance(clawdi, dict):
                self.error(path, "extensions.ai.clawdi is required and must be an object")
        return manifest

    def skills(self) -> int:
        skills_dir = self.root / "skills"
        try:
            metadata = skills_dir.lstat()
        except FileNotFoundError:
            return 0
        except OSError as exc:
            self.error(skills_dir, f"cannot inspect skills directory: {exc}")
            return 0
        if not stat.S_ISDIR(metadata.st_mode):
            self.error(skills_dir, "skills must be a regular directory")
            return 0
        try:
            entries = sorted(os.scandir(skills_dir), key=lambda item: os.fsencode(item.name))
        except OSError as exc:
            self.error(skills_dir, f"cannot scan skills: {exc}")
            return 0
        valid = 0
        for entry in entries:
            skill_dir = Path(entry.path)
            if entry.is_symlink() or not entry.is_dir(follow_symlinks=False):
                self.error(skill_dir, "skills/ entries must be immediate child directories")
                continue
            skill_md = skill_dir / "SKILL.md"
            try:
                metadata = skill_md.lstat()
            except OSError:
                self.error(skill_dir, "missing regular SKILL.md")
                continue
            if not stat.S_ISREG(metadata.st_mode):
                self.error(skill_md, "SKILL.md must be a regular file")
                continue
            before = len(self.errors)
            for message in validate_skill_frontmatter(skill_md, skill_dir.name):
                self.error(skill_md, message)
            if len(self.errors) == before:
                valid += 1
        return valid

    def stdio(self, path: Path, name: str, server: dict[str, Any]) -> None:
        context = self.server_context(name)
        self.closed(path, server, STDIO_FIELDS, context)
        command = self.string(
            path, server.get("command"), f"{context}.command", required=True, maximum=512
        )
        if command is not None:
            if PLACEHOLDER_LIKE_RE.search(command):
                self.error(path, f"{context}.command must not contain placeholders")
            elif command.startswith("./"):
                target = self.safe_relative(path, command, f"{context}.command", expected="file")
                if target is not None and not target.stat().st_mode & (
                    stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
                ):
                    self.error(path, f"{context}.command must reference an executable file")
            elif not EXECUTABLE_RE.fullmatch(command):
                self.error(path, f"{context}.command must be a bare executable name or safe ./ path")
            else:
                self.bare_commands.add(command)
        if "args" in server:
            args = server["args"]
            if not isinstance(args, list) or len(args) > 256 or any(not isinstance(item, str) for item in args):
                self.error(path, f"{context}.args must be an array of at most 256 strings")
        if "env" in server:
            env = server["env"]
            if not isinstance(env, dict):
                self.error(path, f"{context}.env must be an object of strings")
            else:
                folded: set[str] = set()
                for key, value in env.items():
                    if not ENV_KEY_RE.fullmatch(key):
                        self.error(path, f"{context}.env has invalid key: {key}")
                    if key.casefold() in folded:
                        self.error(path, f"{context}.env has case-folded duplicate key: {key}")
                    folded.add(key.casefold())
                    if key.upper() in {"PLUGIN_ROOT", "PLUGIN_DATA"}:
                        self.error(path, f"{context}.env.{key} is client-owned and cannot be configured")
                    if not isinstance(value, str):
                        self.error(path, f"{context}.env.{key} must be a string")
                    else:
                        if SENSITIVE_NAME_RE.search(key) or key.upper() == "AUTH" or (value and _looks_secret(value)):
                            self.error(
                                path,
                                f"{context}.env.{key} appears credential-bearing; use a secret slot binding",
                            )
        if "cwd" in server:
            cwd = server["cwd"]
            cwd_value = self.string(path, cwd, f"{context}.cwd", required=True, maximum=512)
            if cwd_value is not None:
                self.rooted_cwd(path, cwd_value, f"{context}.cwd")

    def remote(self, path: Path, name: str, server: dict[str, Any]) -> None:
        context = self.server_context(name)
        self.closed(path, server, REMOTE_FIELDS, context)
        url = self.string(path, server.get("url"), f"{context}.url", required=True, maximum=2048)
        if url is not None:
            if (
                PLACEHOLDER_LIKE_RE.search(url)
                or "\\" in url
                or any(char.isspace() or ord(char) < 0x20 for char in url)
            ):
                self.error(path, f"{context}.url must be literal and contain no placeholders or controls")
            else:
                try:
                    parsed = urlsplit(url)
                    _ = parsed.port
                except ValueError as exc:
                    self.error(path, f"{context}.url is invalid: {exc}")
                else:
                    host = parsed.hostname
                    invalid_url = (
                        parsed.scheme not in {"http", "https"}
                        or not host
                        or parsed.username is not None
                        or parsed.password is not None
                        or "#" in url
                    )
                    if invalid_url:
                        self.error(
                            path,
                            f"{context}.url must be absolute HTTP(S) without user information or a fragment",
                        )
                    elif parsed.scheme == "http" and not _is_loopback(host):
                        self.error(path, f"{context}.url must use HTTPS for non-loopback hosts")
        if "headers" in server:
            headers = server["headers"]
            if not isinstance(headers, dict):
                self.error(path, f"{context}.headers must be an object of strings")
            else:
                if len(headers) > 128:
                    self.error(path, f"{context}.headers must not exceed 128 fields")
                folded: set[str] = set()
                for key, value in headers.items():
                    if not HEADER_NAME_RE.fullmatch(key):
                        self.error(path, f"{context}.headers has invalid name: {key}")
                    if key.casefold() in folded:
                        self.error(path, f"{context}.headers has case-insensitive duplicate: {key}")
                    folded.add(key.casefold())
                    if not isinstance(value, str):
                        self.error(path, f"{context}.headers.{key} must be a string")
                    elif (
                        len(value) > 8192
                        or PLACEHOLDER_LIKE_RE.search(value)
                        or not _valid_header_value(value)
                    ):
                        self.error(path, f"{context}.headers.{key} must be a literal valid field value")
                    elif (
                        key.casefold() in SENSITIVE_HEADERS
                        or SENSITIVE_NAME_RE.search(key.replace("-", "_"))
                        or (value and _looks_secret(value))
                    ):
                        self.error(
                            path,
                            f"{context}.headers.{key} appears credential-bearing; use a secret slot binding",
                        )

    def mcp(self) -> int:
        path = self.root / "mcp.json"
        if not path.exists():
            return 0
        try:
            metadata = path.lstat()
        except OSError as exc:
            self.error(path, f"cannot inspect mcp.json: {exc}")
            return 0
        if not stat.S_ISREG(metadata.st_mode):
            self.error(path, "mcp.json must be a regular file")
            return 0
        document, failure = _load_json(path)
        if failure is not None:
            self.error(path, f"invalid JSON: {failure}")
            return 0
        if not isinstance(document, dict):
            self.error(path, "mcp.json must be an object")
            return 0
        self.closed(path, document, MCP_FIELDS)
        if document.get("$schema") != MCP_SCHEMA:
            self.error(path, f"$schema must equal {MCP_SCHEMA} and match plugin.json version")
        servers = document.get("mcpServers")
        if not isinstance(servers, dict):
            self.error(path, "mcpServers is required and must be an object")
            return 0
        valid = 0
        for name, server in servers.items():
            server_path = path
            before = len(self.errors)
            if not isinstance(server, dict):
                self.error(server_path, f"{self.server_context(name)} must be an object")
                continue
            server_type = server.get("type")
            if server_type == "stdio":
                self.stdio(server_path, name, server)
            elif server_type in {"streamable-http", "sse"}:
                self.remote(server_path, name, server)
            else:
                self.error(server_path, f"{self.server_context(name)}.type is unsupported")
            if len(self.errors) == before:
                valid += 1
                self.server_types[name] = server_type
                self.configured_targets[name] = {
                    "env": {
                        key.casefold()
                        for key in server.get("env", {})
                        if isinstance(key, str)
                    }
                    if server_type == "stdio"
                    else set(),
                    "header": {
                        key.casefold()
                        for key in server.get("headers", {})
                        if isinstance(key, str)
                    }
                    if server_type != "stdio"
                    else set(),
                }
        return valid

    def clawdi_extension(self, manifest: dict[str, Any]) -> set[str]:
        path = self.root / "plugin.json"
        extensions = manifest.get("extensions")
        if not isinstance(extensions, dict) or not isinstance(extensions.get("ai.clawdi"), dict):
            return set()
        extension = extensions["ai.clawdi"]
        self.closed(path, extension, CLAWDI_FIELDS)
        if type(extension.get("schemaVersion")) is not int or extension.get("schemaVersion") != 1:
            self.error(path, "extensions.ai.clawdi.schemaVersion must equal 1")
        display = extension.get("display")
        if not isinstance(display, dict):
            self.error(path, "extensions.ai.clawdi.display is required and must be an object")
        else:
            self.closed(path, display, DISPLAY_FIELDS)
            self.string(path, display.get("name"), "display.name", required=True, maximum=80)
            category = self.string(path, display.get("category"), "display.category", required=True, maximum=64)
            if category is not None and not CATEGORY_RE.fullmatch(category):
                self.error(path, "display.category must be a lowercase slug")
            languages = self.string_array(
                path, display.get("languages"), "display.languages", maximum_items=20, maximum_length=64
            )
            if languages is not None:
                for language in languages:
                    if not LANGUAGE_RE.fullmatch(language):
                        self.error(path, f"invalid display language tag: {language}")
            if "icon" in display:
                icon = display["icon"]
                icon_value = self.string(path, icon, "display.icon", required=True, maximum=512)
                if icon_value is not None:
                    self.safe_relative(path, icon_value, "display.icon", expected="file")

        if "configuration" in extension:
            configuration = extension["configuration"]
            if not isinstance(configuration, dict):
                self.error(path, "configuration must be an object")
            else:
                self.closed(path, configuration, CONFIGURATION_FIELDS)
                slots = configuration.get("secretSlots")
                if not isinstance(slots, dict):
                    self.error(path, "configuration.secretSlots must be an object")
                else:
                    self.secret_slots(path, slots)

        declared_executables: set[str] = set()
        if "compatibility" in extension:
            compatibility = extension["compatibility"]
            if not isinstance(compatibility, dict):
                self.error(path, "compatibility must be an object")
            else:
                self.closed(path, compatibility, COMPATIBILITY_FIELDS)
                if "runtimes" in compatibility:
                    runtimes = self.string_array(
                        path,
                        compatibility["runtimes"],
                        "compatibility.runtimes",
                        maximum_items=2,
                        maximum_length=16,
                        minimum_items=1,
                    )
                    if runtimes is not None:
                        unknown = set(runtimes) - ALLOWED_RUNTIMES
                        if unknown:
                            self.error(
                                path,
                                f"unsupported compatibility runtime(s): {', '.join(sorted(unknown))}",
                            )
                if "executables" in compatibility:
                    executables = self.string_array(
                        path,
                        compatibility["executables"],
                        "compatibility.executables",
                        maximum_items=32,
                        maximum_length=128,
                        minimum_items=1,
                    )
                    if executables is not None:
                        declared_executables.update(executables)
                        for executable in executables:
                            if not EXECUTABLE_RE.fullmatch(executable):
                                self.error(path, f"executable must be a bare name: {executable}")
        return declared_executables

    def string_array(
        self,
        path: Path,
        value: Any,
        field_name: str,
        *,
        maximum_items: int,
        maximum_length: int,
        minimum_items: int = 0,
    ) -> list[str] | None:
        if not isinstance(value, list):
            self.error(path, f"{field_name} is required and must be an array")
            return None
        if len(value) < minimum_items:
            self.error(path, f"{field_name} must contain at least {minimum_items} item(s)")
            return None
        invalid_item = any(
            not isinstance(item, str) or not item or len(item) > maximum_length for item in value
        )
        if len(value) > maximum_items or invalid_item:
            self.error(path, f"{field_name} contains invalid or too many strings")
            return None
        folded = [item.casefold() for item in value]
        if len(folded) != len(set(folded)):
            self.error(path, f"{field_name} must not contain case-folded duplicates")
        return value

    def secret_slots(self, path: Path, slots: dict[str, Any]) -> None:
        bound_targets: set[tuple[str, str, str]] = set()
        if len(slots) > 64:
            self.error(path, "configuration.secretSlots exceeds 64 entries")
        for slot_id, slot in slots.items():
            if not SLOT_ID_RE.fullmatch(slot_id):
                self.error(path, f"invalid secret slot ID: {slot_id}")
            if not isinstance(slot, dict):
                self.error(path, f"secret slot {slot_id} must be an object")
                continue
            self.closed(path, slot, SLOT_FIELDS)
            self.string(path, slot.get("label"), f"secretSlots.{slot_id}.label", required=True, maximum=80)
            self.string(
                path, slot.get("description"), f"secretSlots.{slot_id}.description", required=True, maximum=512
            )
            if type(slot.get("required")) is not bool:
                self.error(path, f"secretSlots.{slot_id}.required must be a boolean")
            bindings = slot.get("bindings")
            if not isinstance(bindings, list) or not bindings or len(bindings) > 32:
                self.error(path, f"secretSlots.{slot_id}.bindings must contain 1-32 bindings")
                continue
            for index, binding in enumerate(bindings):
                label = f"secretSlots.{slot_id}.bindings[{index}]"
                if not isinstance(binding, dict):
                    self.error(path, f"{label} must be an object")
                    continue
                self.closed(path, binding, BINDING_FIELDS)
                server = binding.get("server")
                target = binding.get("target")
                name = binding.get("name")
                if not isinstance(server, str) or server not in self.server_types:
                    self.error(path, f"{label}.server must reference a valid MCP server")
                    continue
                if target not in {"env", "header"}:
                    self.error(path, f"{label}.target must be env or header")
                    continue
                expected_type = "stdio" if target == "env" else "remote"
                actual_type = "stdio" if self.server_types[server] == "stdio" else "remote"
                if actual_type != expected_type:
                    self.error(path, f"{label} target is incompatible with MCP server transport")
                if target == "env":
                    if not isinstance(name, str) or not ENV_KEY_RE.fullmatch(name):
                        self.error(path, f"{label}.name must be a valid environment key")
                    elif name.upper() in {"PLUGIN_ROOT", "PLUGIN_DATA"}:
                        self.error(path, f"{label}.name targets a client-owned environment key")
                    if "prefix" in binding:
                        self.error(path, f"{label}.prefix is only allowed for header bindings")
                else:
                    if not isinstance(name, str) or not HEADER_NAME_RE.fullmatch(name):
                        self.error(path, f"{label}.name must be a valid HTTP header name")
                    if "prefix" in binding:
                        prefix = binding["prefix"]
                        if not isinstance(prefix, str) or len(prefix) > 64 or not _valid_header_value(prefix):
                            self.error(path, f"{label}.prefix must be a bounded non-secret header prefix")
                        elif _contains_secret_material(prefix):
                            self.error(path, f"{label}.prefix must not contain credential material")
                if isinstance(name, str):
                    if name.casefold() in self.configured_targets[server][target]:
                        self.error(path, f"{label} target must not also have a literal MCP value")
                    binding_target = (server, target, name.casefold())
                    if binding_target in bound_targets:
                        self.error(path, f"{label} duplicates another secret binding target")
                    else:
                        bound_targets.add(binding_target)


def _looks_secret(value: str) -> bool:
    lowered = value.strip().lower()
    return (
        lowered.startswith(("bearer ", "basic ", "apikey ", "api-key "))
        or "-----begin private key-----" in lowered
        or bool(re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@", value))
        or _contains_secret_material(value)
    )


def _contains_secret_material(value: str) -> bool:
    lowered = value.lower()
    return "-----begin private key-----" in lowered or bool(
        re.search(r"(?:sk|pk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]{12,}", value)
    )


def _valid_header_value(value: str) -> bool:
    return all(char == "\t" or 0x20 <= ord(char) <= 0x7E or 0x80 <= ord(char) <= 0xFF for char in value)


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def validate_plugin(root: Path, repository_root: Path) -> PluginReport:
    validator = Validator(root, repository_root)
    _, package_errors = inspect_package(root)
    for message in package_errors:
        validator.error(root, message)
    manifest = validator.manifest()
    valid_skills = validator.skills()
    valid_servers = validator.mcp()
    declared_executables = validator.clawdi_extension(manifest) if manifest is not None else set()
    missing_executables = validator.bare_commands - declared_executables
    if missing_executables:
        validator.error(
            root / "plugin.json",
            "bare MCP commands must be declared in compatibility.executables: "
            + ", ".join(sorted(missing_executables)),
        )
    if valid_skills + valid_servers == 0:
        validator.error(root, "plugin must contain at least one valid Skill or MCP server")
    digest = None
    if not validator.errors:
        try:
            digest = compute_package_digest(root)
        except (OSError, PackageValidationError) as exc:
            validator.error(root, f"cannot compute sha256-tree-v1 digest: {exc}")
    return PluginReport(
        key=root.name,
        errors=validator.errors,
        digest=digest,
        valid_skills=valid_skills,
        valid_servers=valid_servers,
        manifest=manifest if not validator.errors else None,
    )
