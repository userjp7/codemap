"""Pydantic models and I/O helpers for the codemap graph JSON format.

The canonical output format is versioned JSON (``version: "1"``) containing
nodes, edges, cycles, per-directory summaries, and aggregate stats.  Local
file nodes and external-package nodes share the same ``nodes`` list,
distinguished by a ``type`` discriminator field.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal, Union

import networkx as nx
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# ---------------------------------------------------------------------------
# Base config — all models serialise to / from camelCase JSON
# ---------------------------------------------------------------------------


class _Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ---------------------------------------------------------------------------
# Component models
# ---------------------------------------------------------------------------


class StatsOutput(_Base):
    """Aggregate statistics for the scanned project.

    Attributes:
        total_files: Number of local source files in the graph.
        total_edges: Number of directed import edges (local + external).
        total_external_packages: Number of unique external-package nodes.
        cycle_count: Number of simple import cycles detected.
        barrel_count: Number of files whose every export is a re-export.
        entry_count: Number of entry-point files (index / main / app / _app).
    """

    total_files: int
    total_edges: int
    total_external_packages: int
    cycle_count: int
    barrel_count: int
    entry_count: int


class FileNodeOutput(_Base):
    """A local source file in the dependency graph.

    Attributes:
        id: Project-relative path, e.g. ``'src/hooks/useAuth.ts'``.
        type: Always ``'local'``.
        filename: File stem without extension.
        extension: File extension including dot, e.g. ``'.tsx'``.
        category: One of ``'hook'``, ``'component'``, ``'service'``, ``'utility'``.
        export_count: Number of exported symbols.
        import_count: Number of import statements in the file.
        is_barrel: ``True`` when all exports are re-exports and no declarations exist.
        is_entry: ``True`` when the file stem is ``index``, ``main``, ``app``, or ``_app``.
        centrality: Betweenness centrality score.
        in_degree: Number of files that import this file.
        out_degree: Number of files this file imports.
    """

    id: str
    type: Literal["local"] = "local"
    filename: str
    extension: str
    category: str
    export_count: int
    import_count: int
    is_barrel: bool
    is_entry: bool
    centrality: float
    in_degree: int
    out_degree: int


class ExternalNodeOutput(_Base):
    """An external npm package referenced by the project.

    Attributes:
        id: Package name, e.g. ``'react'`` or ``'@scope/pkg'``.
        type: Always ``'external'``.
        version: Version string from ``package.json``, or ``''`` if not found.
    """

    id: str
    type: Literal["external"] = "external"
    version: str


# Discriminated union keyed on the ``type`` literal for correct round-trip
# deserialisation through Pydantic.
NodeOutput = Annotated[
    Union[FileNodeOutput, ExternalNodeOutput],
    Field(discriminator="type"),
]


class EdgeOutput(_Base):
    """A directed import dependency between two nodes.

    Attributes:
        source: ``id`` of the importing node.
        target: ``id`` of the imported node.
        kind: One of ``'static'``, ``'dynamic'``, or ``'reexport'``.
        is_circular: ``True`` when this edge participates in an import cycle.
    """

    source: str
    target: str
    kind: str
    is_circular: bool


class DirectoryOutput(_Base):
    """Summary for one directory in the project tree.

    Attributes:
        path: Directory path relative to the project root, e.g. ``'src/hooks'``.
            The root directory is represented as ``'.'``.
        file_count: Number of local source files directly inside this directory.
        export_count: Sum of ``export_count`` for all files in this directory.
    """

    path: str
    file_count: int
    export_count: int


class GraphOutput(_Base):
    """Top-level output model for a serialised codemap graph.

    Attributes:
        version: Format version string, currently ``'1'``.
        scanned_at: UTC ISO-8601 timestamp of when the scan ran.
        root: Absolute path of the scanned project root.
        stats: Aggregate statistics.
        nodes: All nodes (local files and external packages).
        edges: All directed import edges.
        cycles: Each cycle as an ordered list of node ``id`` strings.
        directories: Per-directory summaries for all local file nodes.
    """

    version: str = "1"
    scanned_at: str
    root: str
    stats: StatsOutput
    nodes: list[NodeOutput]
    edges: list[EdgeOutput]
    cycles: list[list[str]]
    directories: list[DirectoryOutput]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def serialize(G: nx.DiGraph, project_root: str) -> GraphOutput:
    """Convert an analysed NetworkX graph into a :class:`GraphOutput` model.

    The graph is expected to have been produced by
    :func:`~codemap.graph.builder.build_graph` and then annotated by
    :func:`~codemap.graph.analyzer.analyze` (so that ``centrality``,
    ``in_degree``, ``out_degree``, and ``G.graph['cycles']`` are present).

    Args:
        G: Analysed directed dependency graph.
        project_root: Absolute path to the scanned project root (stored
            verbatim on the output).

    Returns:
        A fully populated :class:`GraphOutput` instance ready for
        serialisation.
    """
    scanned_at = datetime.now(timezone.utc).isoformat()
    cycles: list[list[str]] = G.graph.get("cycles", [])

    # ------------------------------------------------------------------
    # Build node outputs
    # ------------------------------------------------------------------
    node_outputs: list[NodeOutput] = []
    dir_accumulator: dict[str, dict[str, int]] = {}  # path → {file_count, export_count}

    local_count = 0
    external_count = 0
    barrel_count = 0
    entry_count = 0

    for node_id, attrs in G.nodes(data=True):
        ntype = attrs.get("type", "local")
        if ntype == "local":
            local_count += 1
            if attrs.get("is_barrel"):
                barrel_count += 1
            if attrs.get("is_entry"):
                entry_count += 1

            file_node = FileNodeOutput(
                id=node_id,
                filename=attrs.get("filename", ""),
                extension=attrs.get("extension", ""),
                category=attrs.get("category", "utility"),
                export_count=attrs.get("export_count", 0),
                import_count=attrs.get("import_count", 0),
                is_barrel=attrs.get("is_barrel", False),
                is_entry=attrs.get("is_entry", False),
                centrality=attrs.get("centrality", 0.0),
                in_degree=attrs.get("in_degree", 0),
                out_degree=attrs.get("out_degree", 0),
            )
            node_outputs.append(file_node)

            # Accumulate directory stats.
            dir_path = str(Path(node_id).parent)
            acc = dir_accumulator.setdefault(dir_path, {"file_count": 0, "export_count": 0})
            acc["file_count"] += 1
            acc["export_count"] += attrs.get("export_count", 0)

        else:
            external_count += 1
            ext_node = ExternalNodeOutput(
                id=node_id,
                version=attrs.get("version", ""),
            )
            node_outputs.append(ext_node)

    # ------------------------------------------------------------------
    # Build edge outputs
    # ------------------------------------------------------------------
    edge_outputs = [
        EdgeOutput(
            source=u,
            target=v,
            kind=attrs.get("kind", "static"),
            is_circular=attrs.get("is_circular", False),
        )
        for u, v, attrs in G.edges(data=True)
    ]

    # ------------------------------------------------------------------
    # Directories
    # ------------------------------------------------------------------
    directories = [
        DirectoryOutput(
            path=dir_path,
            file_count=acc["file_count"],
            export_count=acc["export_count"],
        )
        for dir_path, acc in sorted(dir_accumulator.items())
    ]

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------
    stats = StatsOutput(
        total_files=local_count,
        total_edges=G.number_of_edges(),
        total_external_packages=external_count,
        cycle_count=len(cycles),
        barrel_count=barrel_count,
        entry_count=entry_count,
    )

    return GraphOutput(
        scanned_at=scanned_at,
        root=project_root,
        stats=stats,
        nodes=node_outputs,
        edges=edge_outputs,
        cycles=cycles,
        directories=directories,
    )


def write_json(output: GraphOutput, path: str) -> None:
    """Serialise *output* to a JSON file at *path*.

    Uses Pydantic's ``model_dump_json`` with camelCase field aliases and
    2-space indentation.

    Args:
        output: The graph output model to write.
        path: Destination file path.  Parent directories must exist.
    """
    Path(path).write_text(
        output.model_dump_json(indent=2, by_alias=True),
        encoding="utf-8",
    )


def read_json(path: str) -> GraphOutput:
    """Deserialise a JSON file at *path* back into a :class:`GraphOutput` model.

    Accepts both camelCase and snake_case field names (``populate_by_name``
    is enabled on all models).

    Args:
        path: Path to a JSON file previously written by :func:`write_json`.

    Returns:
        A validated :class:`GraphOutput` instance.

    Raises:
        pydantic.ValidationError: If the JSON does not match the schema.
        FileNotFoundError: If *path* does not exist.
    """
    return GraphOutput.model_validate_json(
        Path(path).read_text(encoding="utf-8")
    )
