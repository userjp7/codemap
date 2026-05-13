"""File discovery for TypeScript and JavaScript source files.

Walks a directory tree and returns project-relative paths for all .ts, .tsx,
.js, and .jsx files, respecting .gitignore patterns and user-supplied excludes.
"""

from __future__ import annotations

import os
from pathlib import Path

import pathspec

_JS_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}

_ALWAYS_EXCLUDED_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".cache",
    "coverage",
}


def discover_files(root: str, exclude: list[str] | None = None) -> list[str]:
    """Walk *root* and return project-relative paths for JS/TS source files.

    Args:
        root: Absolute (or relative) path to the project root directory.
        exclude: Optional list of additional glob patterns to exclude.
            Patterns follow the same syntax as .gitignore lines.

    Returns:
        Sorted list of file paths relative to *root*, using forward slashes,
        for every .ts, .tsx, .js, or .jsx file that is not excluded.
    """
    root_path = Path(root).resolve()

    # Build a combined pathspec from .gitignore + caller-supplied patterns.
    patterns: list[str] = list(exclude or [])
    gitignore = root_path / ".gitignore"
    if gitignore.is_file():
        patterns.extend(gitignore.read_text(encoding="utf-8").splitlines())

    spec = pathspec.PathSpec.from_lines("gitignore", patterns) if patterns else None

    results: list[str] = []

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Prune hard-excluded directories in-place so os.walk skips them.
        dirnames[:] = [
            d for d in dirnames
            if d not in _ALWAYS_EXCLUDED_DIRS
        ]

        current = Path(dirpath)
        rel_dir = current.relative_to(root_path)

        # Also prune directories matched by the combined spec.
        if spec is not None:
            dirnames[:] = [
                d for d in dirnames
                if not spec.match_file(str(rel_dir / d) + "/")
                and not spec.match_file(str(rel_dir / d))
            ]

        for filename in filenames:
            if Path(filename).suffix not in _JS_EXTENSIONS:
                continue

            rel_file = rel_dir / filename
            rel_str = rel_file.as_posix()

            if spec is not None and spec.match_file(rel_str):
                continue

            results.append(rel_str)

    return sorted(results)
