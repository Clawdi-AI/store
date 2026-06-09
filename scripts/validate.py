#!/usr/bin/env python3
"""Validate all agent and skill templates in the store repository.

Checks:
  - agent.json / skill.json schema (required + recommended fields, types)
  - IDENTITY.md exists and matches agent.json name/emoji
  - Inline skills referenced in agent.json have SKILL.md
  - No orphan skill directories (listed in skills/ but not in manifest)

Exit code 0 = all valid, 1 = errors found.
"""

import json
import os
import sys

AGENTS_DIR = "agents"
SKILLS_DIR = "skills"

AGENT_REQUIRED = {"version", "name", "emoji", "description", "category", "author", "tags", "skills"}
AGENT_RECOMMENDED = {"headline", "suggested_prompts", "featured", "trust_level", "languages"}
SKILL_REQUIRED = {"version", "name", "description", "category", "author"}

errors: list[str] = []
warnings: list[str] = []


def err(path: str, msg: str) -> None:
    errors.append(f"  ERROR {path}: {msg}")


def warn(path: str, msg: str) -> None:
    warnings.append(f"  WARN  {path}: {msg}")


def validate_agent(dirname: str) -> None:
    agent_dir = os.path.join(AGENTS_DIR, dirname)
    manifest_path = os.path.join(agent_dir, "agent.json")

    if not os.path.isfile(manifest_path):
        err(agent_dir, "missing agent.json")
        return

    try:
        m = json.loads(open(manifest_path).read())
    except json.JSONDecodeError as e:
        err(manifest_path, f"invalid JSON: {e}")
        return

    # Required fields
    for field in AGENT_REQUIRED:
        if field not in m:
            err(manifest_path, f"missing required field: {field}")

    for field in AGENT_RECOMMENDED:
        if field not in m:
            warn(manifest_path, f"missing recommended field: {field}")

    # Type checks
    if "version" in m and not isinstance(m["version"], int):
        err(manifest_path, f"version must be int, got {type(m['version']).__name__}")
    if "tags" in m and not isinstance(m["tags"], list):
        err(manifest_path, f"tags must be array, got {type(m['tags']).__name__}")
    if "suggested_prompts" in m:
        sp = m["suggested_prompts"]
        if not isinstance(sp, list):
            err(manifest_path, f"suggested_prompts must be array, got {type(sp).__name__}")
        elif len(sp) > 4:
            warn(manifest_path, f"suggested_prompts has {len(sp)} items (max 4)")

    # Skills structure
    skills_raw = m.get("skills", {})
    inline: list[str] = []
    if isinstance(skills_raw, dict):
        inline = [s for s in skills_raw.get("inline", []) if isinstance(s, str)]
    elif isinstance(skills_raw, list):
        inline = [s for s in skills_raw if isinstance(s, str)]
    else:
        err(manifest_path, f"skills must be object or array, got {type(skills_raw).__name__}")

    # Verify inline skill directories exist
    for slug in inline:
        skill_dir = os.path.join(agent_dir, "skills", slug)
        skill_md = os.path.join(skill_dir, "SKILL.md")
        if not os.path.isdir(skill_dir):
            err(manifest_path, f"inline skill directory missing: skills/{slug}/")
        elif not os.path.isfile(skill_md):
            warn(skill_dir, "missing SKILL.md")

    # Check for orphan skill directories
    skills_dir = os.path.join(agent_dir, "skills")
    if os.path.isdir(skills_dir):
        on_disk = {d for d in os.listdir(skills_dir) if os.path.isdir(os.path.join(skills_dir, d))}
        orphans = on_disk - set(inline)
        for orphan in sorted(orphans):
            warn(skills_dir, f"orphan skill directory not in manifest: {orphan}/")

    # IDENTITY.md alignment
    identity_path = os.path.join(agent_dir, "IDENTITY.md")
    if not os.path.isfile(identity_path):
        err(agent_dir, "missing IDENTITY.md")
    else:
        content = open(identity_path).read()
        name = m.get("name", "")
        emoji = m.get("emoji", "")
        if name and name not in content:
            err(identity_path, f'name "{name}" not found in IDENTITY.md')
        if emoji and emoji not in content:
            err(identity_path, f'emoji "{emoji}" not found in IDENTITY.md')


def validate_skill(dirname: str) -> None:
    skill_dir = os.path.join(SKILLS_DIR, dirname)
    manifest_path = os.path.join(skill_dir, "skill.json")

    if not os.path.isfile(manifest_path):
        err(skill_dir, "missing skill.json")
        return

    try:
        m = json.loads(open(manifest_path).read())
    except json.JSONDecodeError as e:
        err(manifest_path, f"invalid JSON: {e}")
        return

    for field in SKILL_REQUIRED:
        if field not in m:
            err(manifest_path, f"missing required field: {field}")

    if "version" in m and not isinstance(m["version"], int):
        err(manifest_path, f"version must be int, got {type(m['version']).__name__}")

    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        warn(skill_dir, "missing SKILL.md")


def main() -> int:
    print("Validating store templates...\n")

    # Agents
    if os.path.isdir(AGENTS_DIR):
        agent_dirs = sorted(d for d in os.listdir(AGENTS_DIR) if os.path.isdir(os.path.join(AGENTS_DIR, d)))
        print(f"Agents ({len(agent_dirs)}):")
        for dirname in agent_dirs:
            before = len(errors)
            validate_agent(dirname)
            status = "FAIL" if len(errors) > before else "OK"
            print(f"  {status} {dirname}")
    else:
        print("No agents/ directory found")

    # Skills
    if os.path.isdir(SKILLS_DIR):
        skill_dirs = sorted(d for d in os.listdir(SKILLS_DIR) if os.path.isdir(os.path.join(SKILLS_DIR, d)))
        print(f"\nSkills ({len(skill_dirs)}):")
        for dirname in skill_dirs:
            before = len(errors)
            validate_skill(dirname)
            status = "FAIL" if len(errors) > before else "OK"
            print(f"  {status} {dirname}")

    # Summary
    print()
    if warnings:
        print("Warnings:")
        for w in warnings:
            print(w)
        print()

    if errors:
        print("Errors:")
        for e in errors:
            print(e)
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        return 1

    print(f"All valid. {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
