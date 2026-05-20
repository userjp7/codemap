'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';

import { useGraph } from '@/hooks/useGraph';
import { applyElkLayout } from '@/lib/layout';
import FileNode from '@/components/nodes/FileNode';
import ExportNode from '@/components/nodes/ExportNode';
import ExternalNode from '@/components/nodes/ExternalNode';
import CircularEdge from '@/components/edges/CircularEdge';
import FilterSidebar from '@/components/FilterSidebar';
import SearchBar from '@/components/SearchBar';
import DetailPanel from '@/components/DetailPanel';
import { getDefaultFilters, applyFilters, applySearch } from '@/lib/filters';
import type { GraphFilters } from '@/lib/filters';
import type { FileNodeData, GraphNode } from '@/types/graph';
import type { ExternalNodeData } from '@/components/nodes/ExternalNode';

// Stable references — defined outside the component so React Flow never
// re-registers node/edge types on re-renders, which would unmount every node.
const nodeTypes = {
  file: FileNode,
  export: ExportNode,
  external: ExternalNode,
};

const edgeTypes = {
  circular: CircularEdge,
};

// ── Inner flow component ─────────────────────────────────────────────────────
// Separate component so useReactFlow() can be called inside ReactFlowProvider.

type FitViewFn = (opts?: { duration?: number; padding?: number }) => void;

interface FlowInnerProps {
  nodes: Node[];
  edges: Edge[];
  /** Shared ref the layout callback uses to call fitView after ELK resolves. */
  fitViewRef: React.MutableRefObject<FitViewFn>;
  selectedNode: GraphNode | null;
  onNodeClick: (event: MouseEvent, node: Node) => void;
  onCloseDetail: () => void;
}

function FlowInner({
  nodes,
  edges,
  fitViewRef,
  selectedNode,
  onNodeClick,
  onCloseDetail,
}: FlowInnerProps) {
  const { fitView } = useReactFlow();

  // Keep the parent's ref in sync so the layout callback always has
  // access to the latest fitView without a stale closure.
  fitViewRef.current = (opts) => { fitView(opts); };

  const handleNavigateTo = useCallback(
    (nodeId: string) => {
      fitView({ nodes: [{ id: nodeId }], duration: 400 });
    },
    [fitView],
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        style={{ width: '100%', height: '100%' }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
      <DetailPanel
        node={selectedNode}
        onClose={onCloseDetail}
        onNavigateTo={handleNavigateTo}
      />
    </>
  );
}

// ── Outer canvas component ───────────────────────────────────────────────────

export default function GraphCanvas() {
  const { graph, loading, error } = useGraph();

  // ELK-positioned nodes: written ONLY by runLayout, never touched again.
  const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // Display nodes: derived ONLY from layoutedNodes by the filter/search effect.
  const [nodes, setNodes] = useState<Node[]>([]);

  const [filters, setFilters] = useState<GraphFilters>(getDefaultFilters());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [layouting, setLayouting] = useState(false);

  // Guards the filter effect from overwriting positions before layout finishes.
  const layoutDone = useRef(false);

  // Shared so FlowInner (inside ReactFlowProvider) can expose fitView here.
  const fitViewRef = useRef<FitViewFn>(() => undefined);

  // Extracted layout function — called both on graph load and from the
  // Re-layout button.  Builds RF nodes/edges, runs ELK (or grid fallback),
  // then commits the positioned result atomically.
  const runLayout = useCallback(() => {
    if (!graph) return;

    layoutDone.current = false;
    setLayouting(true);

    const circularNodeIds = new Set(graph.cycles.flat());

    const importedByCount = new Map<string, number>();
    for (const e of graph.edges) {
      importedByCount.set(e.target, (importedByCount.get(e.target) ?? 0) + 1);
    }

    const rfNodes: Node[] = graph.nodes.map((gn) => {
      if (gn.type === 'local') {
        const data: FileNodeData & Record<string, unknown> = {
          ...gn,
          type: 'local',
          path: gn.id,
          hasCircularDep: circularNodeIds.has(gn.id),
          // Strip the leading dot so FileNode renders "tsx" not ".tsx".
          extension: gn.extension.startsWith('.') ? gn.extension.slice(1) : gn.extension,
        };
        return { id: gn.id, type: 'file', position: { x: 0, y: 0 }, data };
      } else {
        const data: ExternalNodeData & Record<string, unknown> = {
          packageName: gn.id,
          version: gn.version,
          importedBy: importedByCount.get(gn.id) ?? 0,
        };
        return { id: gn.id, type: 'external', position: { x: 0, y: 0 }, data };
      }
    });

    const rfEdges: Edge[] = graph.edges.map((ge) => ({
      id: `${ge.source}--${ge.target}`,
      source: ge.source,
      target: ge.target,
      type: ge.isCircular ? 'circular' : 'default',
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { kind: ge.kind, isCircular: ge.isCircular },
    }));

    const rawNodes = graph.nodes.map((n) => ({ id: n.id }));
    const rawEdges = graph.edges.map((e) => ({
      id: `${e.source}--${e.target}`,
      source: e.source,
      target: e.target,
    }));

    applyElkLayout(rawNodes, rawEdges)
      .then((positioned) => {
        const posMap = new Map(positioned.map((p) => [p.id, p.position]));
        setLayoutedNodes(
          rfNodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? { x: 0, y: 0 } })),
        );
        setEdges(rfEdges);
        layoutDone.current = true;
        setLayouting(false);
        // Let React flush the new positions before fitting the viewport.
        setTimeout(() => fitViewRef.current({ duration: 400 }), 50);
      })
      .catch((err: unknown) => {
        console.error('[GraphCanvas] layout error:', err);
        setLayouting(false);
      });
  }, [graph]);

  // Re-run layout whenever the graph data changes.
  useEffect(() => {
    runLayout();
  }, [runLayout]);

  // Derive display nodes from the stable layoutedNodes source of truth.
  // Positions flow through via the `...node` spread — only style.opacity is
  // ever changed here, and only after layout has completed.
  useEffect(() => {
    if (!layoutDone.current) return;
    setNodes(applySearch(applyFilters(layoutedNodes, filters), searchQuery));
  }, [layoutedNodes, filters, searchQuery]);

  const handleNodeClick = useCallback((_event: MouseEvent, node: Node) => {
    setSelectedNode(node.data as unknown as GraphNode);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Scanning codebase...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <FilterSidebar graph={graph} filters={filters} onChange={setFilters} />

      <div style={{ flex: 1, position: 'relative' }}>
        {/* Floating search bar centred at the top of the canvas */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <SearchBar onSearch={setSearchQuery} />
        </div>

        {/* Re-layout button — top-right corner */}
        <button
          type="button"
          onClick={runLayout}
          disabled={layouting}
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          Re-layout
        </button>

        {/* Semi-transparent overlay while layout is computing */}
        {layouting && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              color: 'white',
              fontSize: 16,
            }}
          >
            Computing layout…
          </div>
        )}

        {/* ReactFlowProvider lets FlowInner call useReactFlow() */}
        <ReactFlowProvider>
          <FlowInner
            nodes={nodes}
            edges={edges}
            fitViewRef={fitViewRef}
            selectedNode={selectedNode}
            onNodeClick={handleNodeClick}
            onCloseDetail={() => setSelectedNode(null)}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
