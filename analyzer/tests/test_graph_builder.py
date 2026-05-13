"""Tests for codemap.graph.builder and codemap.graph.analyzer."""

from __future__ import annotations

from pathlib import Path

import networkx as nx
import pytest

from codemap.graph.analyzer import analyze
from codemap.graph.builder import build_graph

SAMPLE = Path(__file__).parent / "fixtures" / "sample_project"
FILES = [
    "src/index.ts",
    "src/hooks/useAuth.ts",
    "src/utils/token.ts",
]


@pytest.fixture(scope="module")
def G() -> nx.DiGraph:
    g = build_graph(str(SAMPLE), FILES)
    analyze(g)
    return g


# ---------------------------------------------------------------------------
# Node counts and presence
# ---------------------------------------------------------------------------


class TestNodes:
    def test_total_node_count(self, G: nx.DiGraph) -> None:
        # 3 local files + 1 external (react)
        assert G.number_of_nodes() == 4

    def test_local_nodes_present(self, G: nx.DiGraph) -> None:
        for f in FILES:
            assert G.has_node(f), f"Missing node {f}"

    def test_react_external_node_present(self, G: nx.DiGraph) -> None:
        assert G.has_node("react")

    def test_react_type_is_external(self, G: nx.DiGraph) -> None:
        assert G.nodes["react"]["type"] == "external"

    def test_react_version_from_package_json(self, G: nx.DiGraph) -> None:
        assert G.nodes["react"]["version"] == "^18.2.0"


# ---------------------------------------------------------------------------
# Node attributes
# ---------------------------------------------------------------------------


class TestNodeAttributes:
    def test_index_is_entry(self, G: nx.DiGraph) -> None:
        assert G.nodes["src/index.ts"]["is_entry"] is True

    def test_useauth_is_not_entry(self, G: nx.DiGraph) -> None:
        assert G.nodes["src/hooks/useAuth.ts"]["is_entry"] is False

    def test_useauth_category_is_hook(self, G: nx.DiGraph) -> None:
        assert G.nodes["src/hooks/useAuth.ts"]["category"] == "hook"

    def test_token_category_is_utility(self, G: nx.DiGraph) -> None:
        assert G.nodes["src/utils/token.ts"]["category"] == "utility"

    def test_index_import_count(self, G: nx.DiGraph) -> None:
        assert G.nodes["src/index.ts"]["import_count"] == 2

    def test_local_nodes_have_type_local(self, G: nx.DiGraph) -> None:
        for f in FILES:
            assert G.nodes[f]["type"] == "local"


# ---------------------------------------------------------------------------
# Edges
# ---------------------------------------------------------------------------


class TestEdges:
    def test_index_to_useauth_edge_exists(self, G: nx.DiGraph) -> None:
        assert G.has_edge("src/index.ts", "src/hooks/useAuth.ts")

    def test_index_to_react_edge_exists(self, G: nx.DiGraph) -> None:
        assert G.has_edge("src/index.ts", "react")

    def test_useauth_to_token_edge_exists(self, G: nx.DiGraph) -> None:
        assert G.has_edge("src/hooks/useAuth.ts", "src/utils/token.ts")

    def test_token_to_useauth_edge_exists(self, G: nx.DiGraph) -> None:
        assert G.has_edge("src/utils/token.ts", "src/hooks/useAuth.ts")

    def test_edge_kind_is_static(self, G: nx.DiGraph) -> None:
        assert G["src/index.ts"]["src/hooks/useAuth.ts"]["kind"] == "static"


# ---------------------------------------------------------------------------
# Cycle detection
# ---------------------------------------------------------------------------


class TestCycles:
    def test_cycles_stored_on_graph(self, G: nx.DiGraph) -> None:
        assert "cycles" in G.graph

    def test_one_cycle_found(self, G: nx.DiGraph) -> None:
        assert len(G.graph["cycles"]) == 1

    def test_cycle_contains_useauth_and_token(self, G: nx.DiGraph) -> None:
        cycle = G.graph["cycles"][0]
        assert "src/hooks/useAuth.ts" in cycle
        assert "src/utils/token.ts" in cycle

    def test_useauth_to_token_is_circular(self, G: nx.DiGraph) -> None:
        assert G["src/hooks/useAuth.ts"]["src/utils/token.ts"]["is_circular"] is True

    def test_token_to_useauth_is_circular(self, G: nx.DiGraph) -> None:
        assert G["src/utils/token.ts"]["src/hooks/useAuth.ts"]["is_circular"] is True

    def test_non_cycle_edge_not_circular(self, G: nx.DiGraph) -> None:
        assert G["src/index.ts"]["src/hooks/useAuth.ts"]["is_circular"] is False


# ---------------------------------------------------------------------------
# Analyzer attributes
# ---------------------------------------------------------------------------


class TestAnalyzer:
    def test_centrality_on_all_nodes(self, G: nx.DiGraph) -> None:
        for node in G.nodes:
            assert "centrality" in G.nodes[node], f"Missing centrality on {node}"

    def test_in_degree_attribute(self, G: nx.DiGraph) -> None:
        # useAuth is imported by both index and token
        assert G.nodes["src/hooks/useAuth.ts"]["in_degree"] == 2

    def test_out_degree_attribute(self, G: nx.DiGraph) -> None:
        # index imports useAuth + react
        assert G.nodes["src/index.ts"]["out_degree"] == 2

    def test_react_in_degree(self, G: nx.DiGraph) -> None:
        assert G.nodes["react"]["in_degree"] == 1

    def test_react_out_degree(self, G: nx.DiGraph) -> None:
        assert G.nodes["react"]["out_degree"] == 0
