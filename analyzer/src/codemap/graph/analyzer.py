"""Graph analysis passes: cycle detection, centrality, and degree annotation.

All operations mutate the graph in-place and return it so calls can be chained.
"""

from __future__ import annotations

import networkx as nx


def analyze(G: nx.DiGraph) -> nx.DiGraph:
    """Run all analysis passes on *G* and return it.

    Passes applied in order:

    1. **Cycle detection** — :func:`networkx.simple_cycles` finds all simple
       cycles.  Every edge that participates in at least one cycle has its
       ``is_circular`` attribute set to ``True``.  The full list of cycles is
       stored as ``G.graph['cycles']``.

    2. **Betweenness centrality** — computed with
       :func:`networkx.betweenness_centrality` and stored on each node as the
       ``centrality`` attribute.

    3. **Degree annotation** — ``in_degree`` and ``out_degree`` are stored as
       node attributes for convenient downstream access.

    Args:
        G: A directed graph, typically produced by
            :func:`~codemap.graph.builder.build_graph`.

    Returns:
        The same *G* instance after mutation.
    """
    # ------------------------------------------------------------------
    # 1. Cycle detection
    # ------------------------------------------------------------------
    cycles: list[list[str]] = list(nx.simple_cycles(G))
    G.graph["cycles"] = cycles

    for cycle in cycles:
        # simple_cycles returns nodes; edges are consecutive pairs + wrap-around.
        for i in range(len(cycle)):
            u = cycle[i]
            v = cycle[(i + 1) % len(cycle)]
            if G.has_edge(u, v):
                G[u][v]["is_circular"] = True

    # ------------------------------------------------------------------
    # 2. Betweenness centrality
    # ------------------------------------------------------------------
    centrality: dict[str, float] = nx.betweenness_centrality(G)
    for node, score in centrality.items():
        G.nodes[node]["centrality"] = score

    # ------------------------------------------------------------------
    # 3. Degree annotation
    # ------------------------------------------------------------------
    for node in G.nodes:
        G.nodes[node]["in_degree"] = G.in_degree(node)
        G.nodes[node]["out_degree"] = G.out_degree(node)

    return G
