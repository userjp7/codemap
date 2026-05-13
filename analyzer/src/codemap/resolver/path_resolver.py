"""Resolves raw import paths to either project-relative file paths or package names.

Handles relative imports, path-alias imports (``@/…``, ``~/…``), and bare
external package specifiers.  Extension probing follows TypeScript module
resolution order.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Literal

# Probe order mirrors TypeScript's classic module resolution.
_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")
_INDEX_NAMES = tuple(f"index{ext}" for ext in _EXTENSIONS)


@dataclass
class ResolvedImport:
    """The result of resolving a single raw import specifier.

    Attributes:
        raw_path: The specifier exactly as written in the source file,
            e.g. ``'../utils/token'``.
        kind: ``'local'`` when the import points to a file inside the project,
            ``'external'`` when it refers to a third-party package.
        resolved: For ``kind='local'``, a project-relative path using forward
            slashes (e.g. ``'src/utils/token.ts'``).  For ``kind='external'``,
            the canonical package name (e.g. ``'react'``, ``'@scope/pkg'``).
    """

    raw_path: str
    kind: Literal["local", "external"]
    resolved: str


def _package_name(specifier: str) -> str:
    """Extract the npm package name from a bare specifier.

    Scoped packages (``@scope/name/…``) are returned as ``@scope/name``.
    Unscoped packages (``lodash/fp``) are returned as ``lodash``.

    Args:
        specifier: A bare module specifier such as ``'react'``,
            ``'@scope/pkg/sub'``, or ``'lodash/fp'``.

    Returns:
        The canonical package name string.
    """
    if specifier.startswith("@"):
        parts = specifier.split("/", 2)
        return "/".join(parts[:2])
    return specifier.split("/")[0]


def _probe_extensions(base: Path) -> Path | None:
    """Return the first existing file found by appending known extensions.

    Tries ``base + ext`` for each extension, then ``base/index + ext``.

    Args:
        base: Filesystem path without an extension, e.g.
            ``Path('/project/src/utils/token')``.

    Returns:
        A :class:`~pathlib.Path` to the first existing file, or ``None``.
    """
    for ext in _EXTENSIONS:
        candidate = base.with_suffix(ext)
        if candidate.is_file():
            return candidate
    # Also check if *base* itself is already a file with an extension
    # (caller may have passed a full path like "token.ts").
    if base.is_file():
        return base
    index_dir = base
    for name in _INDEX_NAMES:
        candidate = index_dir / name
        if candidate.is_file():
            return candidate
    return None


def resolve_import(
    source_file: str,
    raw_path: str,
    project_root: str,
    aliases: dict[str, str],
) -> ResolvedImport:
    """Resolve *raw_path* to a project-relative path or an external package name.

    Resolution order:

    1. **Alias expansion** — if *raw_path* begins with a key from *aliases*,
       the prefix is replaced with the corresponding directory.
    2. **Relative resolution** — paths starting with ``.`` or ``..`` are
       resolved relative to *source_file*'s directory.
    3. **Extension probing** — ``.ts``, ``.tsx``, ``.js``, ``.jsx`` are tried
       in order, then ``/index`` variants of each.
    4. If a match exists on disk, ``kind='local'`` is returned with the
       project-relative path.
    5. If no match is found and *raw_path* is not relative, ``kind='external'``
       is returned with the npm package name.
    6. If no match is found and *raw_path* is relative (or alias-expanded),
       ``kind='local'`` is returned with a best-guess ``.ts`` path.

    Args:
        source_file: Project-relative path of the file containing the import
            (e.g. ``'src/hooks/useAuth.ts'``).
        raw_path: The import specifier exactly as written in source.
        project_root: Absolute path to the project root on disk.
        aliases: Mapping of alias prefix → directory, as returned by
            :func:`~codemap.resolver.alias_resolver.load_aliases`.

    Returns:
        A :class:`ResolvedImport` describing where the import points.
    """
    root = Path(project_root).resolve()
    source_abs = (root / source_file).resolve()
    source_dir = source_abs.parent

    # ------------------------------------------------------------------
    # Step 1 — alias expansion
    # ------------------------------------------------------------------
    expanded: str | None = None
    for prefix, directory in aliases.items():
        if raw_path.startswith(prefix):
            tail = raw_path[len(prefix):]
            expanded = directory + tail
            break

    is_relative = raw_path.startswith(".") or raw_path.startswith("..")

    # ------------------------------------------------------------------
    # Step 2 & 3 — build an absolute candidate path and probe
    # ------------------------------------------------------------------
    if expanded is not None:
        # Alias-expanded paths are relative to the project root.
        candidate_abs = root / expanded
        found = _probe_extensions(candidate_abs)
        if found:
            rel = found.relative_to(root)
            return ResolvedImport(raw_path, "local", rel.as_posix())
        # Best guess: .ts variant
        guess = PurePosixPath(expanded).with_suffix(".ts")
        return ResolvedImport(raw_path, "local", str(guess))

    if is_relative:
        candidate_abs = (source_dir / raw_path).resolve()
        found = _probe_extensions(candidate_abs)
        if found:
            rel = found.relative_to(root)
            return ResolvedImport(raw_path, "local", rel.as_posix())
        # Best guess: .ts variant of the relative path
        guess_abs = candidate_abs.with_suffix(".ts")
        try:
            rel = guess_abs.relative_to(root)
            return ResolvedImport(raw_path, "local", rel.as_posix())
        except ValueError:
            return ResolvedImport(raw_path, "local", str(guess_abs))

    # ------------------------------------------------------------------
    # Step 4 — external package
    # ------------------------------------------------------------------
    return ResolvedImport(raw_path, "external", _package_name(raw_path))
