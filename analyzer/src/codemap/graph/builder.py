"""Builds a NetworkX dependency graph from a set of TypeScript/JavaScript files.

Each local file becomes a node; each import becomes a directed edge.  External
packages get their own ``type='external'`` nodes so the graph remains complete
even for third-party dependencies.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import networkx as nx

from codemap.parser.export_extractor import extract_declarations, extract_exports
from codemap.parser.import_extractor import extract_imports
from codemap.resolver.alias_resolver import load_aliases
from codemap.resolver.path_resolver import resolve_import

# ---------------------------------------------------------------------------
# Category classification
# ---------------------------------------------------------------------------

_ENTRY_STEMS = {"index", "main", "app", "_app"}


def _category(filename: str) -> str:
    """Derive a broad category label from *filename*.

    Rules applied in priority order:

    * Stem starts with ``use`` (case-sensitive) → ``'hook'``
    * Extension is ``.tsx`` → ``'component'``
    * Stem contains ``service`` or ``Service`` → ``'service'``
    * Anything else → ``'utility'``

    Args:
        filename: The file's stem (no directory, no extension).

    Returns:
        One of ``'hook'``, ``'component'``, ``'service'``, or ``'utility'``.
    """
    if filename.startswith("use"):
        return "hook"
    return "utility"


def _category_from_path(stem: str, ext: str) -> str:
    """Return a category label derived from both stem and extension.

    Args:
        stem: File stem without extension.
        ext: File extension including the dot (e.g. ``'.tsx'``).

    Returns:
        One of ``'hook'``, ``'component'``, ``'service'``, or ``'utility'``.
    """
    if stem.startswith("use"):
        return "hook"
    if ext == ".tsx":
        return "component"
    if "service" in stem or "Service" in stem:
        return "service"
    return "utility"


# ---------------------------------------------------------------------------
# Package version lookup
# ---------------------------------------------------------------------------

def _load_pkg_versions(project_root: str) -> dict[str, str]:
    """Read ``dependencies`` and ``devDependencies`` from ``package.json``.

    Args:
        project_root: Absolute or relative path to the project root directory.

    Returns:
        A dict mapping package name to version string.  Empty if no
        ``package.json`` exists or it cannot be parsed.
    """
    pkg_path = Path(project_root) / "package.json"
    if not pkg_path.is_file():
        return {}
    try:
        data: dict[str, Any] = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    versions: dict[str, str] = {}
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        block = data.get(section)
        if isinstance(block, dict):
            for pkg, ver in block.items():
                if isinstance(ver, str) and pkg not in versions:
                    versions[pkg] = ver
    return versions


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_graph(project_root: str, files: list[str]) -> nx.DiGraph:
    """Build a directed dependency graph for the given source files.

    Each file in *files* becomes a node.  An edge ``(A, B)`` means file *A*
    imports from file *B*.  External packages get their own node with
    ``type='external'``.

    Node attributes (local files):

    * ``filename`` — stem of the file (no directory, no extension)
    * ``extension`` — file extension including dot (e.g. ``'.tsx'``)
    * ``category`` — one of ``'hook'``, ``'component'``, ``'service'``, ``'utility'``
    * ``export_count`` — number of :class:`~codemap.parser.export_extractor.ExportRecord`
    * ``import_count`` — number of resolved local + external imports
    * ``is_barrel`` — ``True`` when all exports are re-exports and the file
      declares no functions or classes
    * ``is_entry`` — ``True`` when the stem is one of ``index``, ``main``,
      ``app``, or ``_app``
    * ``type`` — ``'local'``

    Node attributes (external packages):

    * ``type`` — ``'external'``
    * ``version`` — version string from ``package.json``, or ``''``

    Edge attributes:

    * ``kind`` — one of ``'static'``, ``'dynamic'``, ``'reexport'``
    * ``is_circular`` — initially ``False``; set by
      :func:`~codemap.graph.analyzer.analyze`

    Args:
        project_root: Absolute path to the project root directory.
        files: List of project-relative file paths to process.

    Returns:
        A :class:`networkx.DiGraph` representing the import graph.
    """
    aliases = load_aliases(project_root)
    pkg_versions = _load_pkg_versions(project_root)
    root = Path(project_root)

    G: nx.DiGraph = nx.DiGraph()

    # First pass: add all local file nodes so edges to not-yet-processed
    # files can still be created.
    for rel_path in files:
        p = Path(rel_path)
        stem = p.stem
        ext = p.suffix
        G.add_node(
            rel_path,
            type="local",
            filename=stem,
            extension=ext,
            category=_category_from_path(stem, ext),
            export_count=0,
            import_count=0,
            is_barrel=False,
            is_entry=stem.lower() in _ENTRY_STEMS,
        )

    # Second pass: parse each file and populate attributes + edges.
    for rel_path in files:
        abs_path = root / rel_path
        try:
            source_bytes = abs_path.read_bytes()
        except OSError:
            continue

        imports = extract_imports(rel_path, source_bytes)
        exports = extract_exports(rel_path, source_bytes)
        decls = extract_declarations(rel_path, source_bytes)

        reexport_count = sum(1 for e in exports if e.kind == "reexport")
        is_barrel = bool(exports) and reexport_count == len(exports) and not decls

        G.nodes[rel_path]["export_count"] = len(exports)
        G.nodes[rel_path]["import_count"] = len(imports)
        G.nodes[rel_path]["is_barrel"] = is_barrel

        for imp in imports:
            if imp.raw_path == "<dynamic>":
                continue
            resolved = resolve_import(rel_path, imp.raw_path, project_root, aliases)

            if resolved.kind == "external":
                pkg = resolved.resolved
                if not G.has_node(pkg):
                    G.add_node(
                        pkg,
                        type="external",
                        version=pkg_versions.get(pkg, ""),
                    )
                if not G.has_edge(rel_path, pkg):
                    G.add_edge(rel_path, pkg, kind=imp.kind, is_circular=False)
            else:
                target = resolved.resolved
                if not G.has_node(target):
                    # File referenced but not in the files list (e.g. not discovered).
                    t_path = Path(target)
                    G.add_node(
                        target,
                        type="local",
                        filename=t_path.stem,
                        extension=t_path.suffix,
                        category=_category_from_path(t_path.stem, t_path.suffix),
                        export_count=0,
                        import_count=0,
                        is_barrel=False,
                        is_entry=t_path.stem.lower() in _ENTRY_STEMS,
                    )
                if not G.has_edge(rel_path, target):
                    G.add_edge(rel_path, target, kind=imp.kind, is_circular=False)

    return G
