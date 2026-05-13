"""Reads tsconfig / jsconfig path aliases for a TypeScript or JavaScript project.

Parses ``compilerOptions.paths`` and returns a flat prefix-to-directory
mapping that the path resolver can use to expand alias imports such as
``@/components/Button`` into project-relative paths.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# Matches a leading /* suffix so it can be stripped from both keys and values.
_GLOB_SUFFIX = re.compile(r"/\*$")

_DEFAULT_ALIASES: dict[str, str] = {
    "@/": "src/",
    "~/": "src/",
}

_CONFIG_NAMES = ("tsconfig.json", "jsconfig.json")


def _strip_glob(s: str) -> str:
    """Remove a trailing ``/*`` from *s* and ensure it ends with ``/``."""
    s = _GLOB_SUFFIX.sub("", s).rstrip("/")
    return s + "/" if s else s


def load_aliases(project_root: str) -> dict[str, str]:
    """Read path aliases from ``tsconfig.json`` or ``jsconfig.json``.

    Looks for ``compilerOptions.paths`` in the first config file found at
    *project_root* (``tsconfig.json`` is tried before ``jsconfig.json``).
    Each entry ``"@alias/*": ["dir/*"]`` is flattened to ``"@alias/": "dir/"``.
    Only the first mapping target is used when multiple targets are listed.

    Args:
        project_root: Absolute or relative path to the project root directory.

    Returns:
        A dict mapping alias prefix strings (e.g. ``'@/'``) to project-relative
        directory strings (e.g. ``'src/'``).  If no config file exists or
        ``compilerOptions.paths`` is absent, returns the default mapping
        ``{'@/': 'src/', '~/': 'src/'}``.
    """
    root = Path(project_root)

    for name in _CONFIG_NAMES:
        config_path = root / name
        if not config_path.is_file():
            continue
        try:
            raw = json.loads(config_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        paths: object = raw.get("compilerOptions", {}).get("paths")
        if not isinstance(paths, dict):
            continue

        aliases: dict[str, str] = {}
        for alias_key, targets in paths.items():
            if not isinstance(targets, list) or not targets:
                continue
            first_target: object = targets[0]
            if not isinstance(first_target, str):
                continue
            clean_key = _strip_glob(alias_key)
            clean_val = _strip_glob(first_target)
            if clean_key:
                aliases[clean_key] = clean_val
        return aliases

    return dict(_DEFAULT_ALIASES)
