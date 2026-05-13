"""Tests for codemap.graph.serializer."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from codemap.graph.analyzer import analyze
from codemap.graph.builder import build_graph
from codemap.graph.serializer import (
    GraphOutput,
    read_json,
    serialize,
    write_json,
)

SAMPLE = Path(__file__).parent / "fixtures" / "sample_project"
FILES = [
    "src/index.ts",
    "src/hooks/useAuth.ts",
    "src/utils/token.ts",
]


@pytest.fixture(scope="module")
def output() -> GraphOutput:
    G = build_graph(str(SAMPLE), FILES)
    analyze(G)
    return serialize(G, str(SAMPLE))


@pytest.fixture()
def roundtrip(output: GraphOutput, tmp_path: Path) -> GraphOutput:
    path = str(tmp_path / "graph.json")
    write_json(output, path)
    return read_json(path)


@pytest.fixture()
def raw_json(output: GraphOutput, tmp_path: Path) -> dict:
    path = str(tmp_path / "graph.json")
    write_json(output, path)
    return json.loads(Path(path).read_text())


# ---------------------------------------------------------------------------
# GraphOutput model fields
# ---------------------------------------------------------------------------


class TestSerializeOutput:
    def test_version_is_one(self, output: GraphOutput) -> None:
        assert output.version == "1"

    def test_root_set(self, output: GraphOutput) -> None:
        assert output.root == str(SAMPLE)

    def test_scanned_at_is_utc_iso(self, output: GraphOutput) -> None:
        # Must be a non-empty ISO string containing 'T' and timezone info.
        assert "T" in output.scanned_at
        assert output.scanned_at.endswith("+00:00") or output.scanned_at.endswith("Z")

    def test_node_count(self, output: GraphOutput) -> None:
        assert len(output.nodes) == 4  # 3 local + 1 external

    def test_edge_count(self, output: GraphOutput) -> None:
        assert len(output.edges) == 4

    def test_cycles_match(self, output: GraphOutput) -> None:
        assert len(output.cycles) == 1
        cycle = output.cycles[0]
        assert "src/hooks/useAuth.ts" in cycle
        assert "src/utils/token.ts" in cycle

    def test_directories_present(self, output: GraphOutput) -> None:
        dir_paths = {d.path for d in output.directories}
        assert "src" in dir_paths
        assert "src/hooks" in dir_paths
        assert "src/utils" in dir_paths

    def test_directory_file_counts(self, output: GraphOutput) -> None:
        by_path = {d.path: d for d in output.directories}
        assert by_path["src"].file_count == 1
        assert by_path["src/hooks"].file_count == 1
        assert by_path["src/utils"].file_count == 1


class TestStats:
    def test_total_files(self, output: GraphOutput) -> None:
        assert output.stats.total_files == 3

    def test_total_edges(self, output: GraphOutput) -> None:
        assert output.stats.total_edges == 4

    def test_total_external_packages(self, output: GraphOutput) -> None:
        assert output.stats.total_external_packages == 1

    def test_cycle_count(self, output: GraphOutput) -> None:
        assert output.stats.cycle_count == 1

    def test_entry_count(self, output: GraphOutput) -> None:
        assert output.stats.entry_count == 1  # src/index.ts


class TestNodeModels:
    def test_react_node_is_external(self, output: GraphOutput) -> None:
        from codemap.graph.serializer import ExternalNodeOutput
        react = next((n for n in output.nodes if n.id == "react"), None)
        assert react is not None
        assert isinstance(react, ExternalNodeOutput)
        assert react.type == "external"

    def test_react_version(self, output: GraphOutput) -> None:
        react = next(n for n in output.nodes if n.id == "react")
        assert react.version == "^18.2.0"

    def test_local_node_attributes(self, output: GraphOutput) -> None:
        from codemap.graph.serializer import FileNodeOutput
        index = next(
            (n for n in output.nodes if n.id == "src/index.ts"), None
        )
        assert index is not None
        assert isinstance(index, FileNodeOutput)
        assert index.type == "local"
        assert index.is_entry is True
        assert index.filename == "index"

    def test_useauth_category(self, output: GraphOutput) -> None:
        hook = next(n for n in output.nodes if n.id == "src/hooks/useAuth.ts")
        assert hook.category == "hook"  # type: ignore[union-attr]


class TestEdgeModels:
    def test_circular_edge_flagged(self, output: GraphOutput) -> None:
        circular = [e for e in output.edges if e.is_circular]
        sources = {e.source for e in circular}
        targets = {e.target for e in circular}
        assert "src/hooks/useAuth.ts" in sources | targets
        assert "src/utils/token.ts" in sources | targets

    def test_non_circular_edge(self, output: GraphOutput) -> None:
        edge = next(
            e for e in output.edges
            if e.source == "src/index.ts" and e.target == "src/hooks/useAuth.ts"
        )
        assert edge.is_circular is False
        assert edge.kind == "static"


# ---------------------------------------------------------------------------
# JSON shape (camelCase)
# ---------------------------------------------------------------------------


class TestJsonShape:
    def test_version_field_in_json(self, raw_json: dict) -> None:
        assert raw_json["version"] == "1"

    def test_top_level_keys_are_camel_case(self, raw_json: dict) -> None:
        assert "scannedAt" in raw_json
        assert "scanned_at" not in raw_json

    def test_node_keys_are_camel_case(self, raw_json: dict) -> None:
        local_node = next(n for n in raw_json["nodes"] if n["type"] == "local")
        assert "exportCount" in local_node
        assert "isBarrel" in local_node
        assert "isEntry" in local_node
        assert "inDegree" in local_node

    def test_edge_keys_are_camel_case(self, raw_json: dict) -> None:
        assert "isCircular" in raw_json["edges"][0]

    def test_stats_keys_are_camel_case(self, raw_json: dict) -> None:
        stats = raw_json["stats"]
        assert "totalFiles" in stats
        assert "totalEdges" in stats
        assert "cycleCount" in stats


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------


class TestRoundtrip:
    def test_node_count_preserved(self, roundtrip: GraphOutput) -> None:
        assert len(roundtrip.nodes) == 4

    def test_edge_count_preserved(self, roundtrip: GraphOutput) -> None:
        assert len(roundtrip.edges) == 4

    def test_cycles_preserved(self, roundtrip: GraphOutput) -> None:
        assert len(roundtrip.cycles) == 1
        cycle = roundtrip.cycles[0]
        assert "src/hooks/useAuth.ts" in cycle
        assert "src/utils/token.ts" in cycle

    def test_version_preserved(self, roundtrip: GraphOutput) -> None:
        assert roundtrip.version == "1"

    def test_stats_preserved(self, roundtrip: GraphOutput) -> None:
        assert roundtrip.stats.total_files == 3
        assert roundtrip.stats.cycle_count == 1

    def test_type_discrimination_preserved(self, roundtrip: GraphOutput) -> None:
        from codemap.graph.serializer import ExternalNodeOutput, FileNodeOutput
        types = {type(n) for n in roundtrip.nodes}
        assert FileNodeOutput in types
        assert ExternalNodeOutput in types
