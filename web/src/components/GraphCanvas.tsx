'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
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
import { getDefaultFilters, syncFiltersFromGraph, applyFilters, applySearch } from '@/lib/filters';
import type { GraphFilters } from '@/lib/filters';
import type { FileNodeData, GraphNode } from '@/types/graph';
import type { ExternalNodeData } from '@/components/nodes/ExternalNode';

// Defined outside the component so React Flow never re-registers node/edge types
// on re-renders, which would unmount and remount every node in the graph.
const nodeTypes = {
  file: FileNode,
  export: ExportNode,
  external: ExternalNode,
};

const edgeTypes = {
  circular: CircularEdge,
};

// Separate component so useReactFlow() runs inside ReactFlowProvider.
interface FlowInnerProps {
  nodes: Node[];
  edges: Edge[];
  selectedNode: GraphNode | null;
  onNodeClick: (event: MouseEvent, node: Node) => void;
  onCloseDetail: () => void;
}

function FlowInner({
  nodes,
  edges,
  selectedNode,
  onNodeClick,
  onCloseDetail,
}: FlowInnerProps) {
  const { fitView } = useReactFlow();

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
        fitView
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

export default function GraphCanvas() {
  const { graph, loading, error } = useGraph();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [filters, setFilters] = useState<GraphFilters>(getDefaultFilters());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const visibleNodes = useMemo(
    () => applySearch(applyFilters(nodes, filters), searchQuery),
    [nodes, filters, searchQuery],
  );

  useEffect(() => {
    if (!graph) return;

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
          type: 'external' as const,
          packageName: gn.id,
          version: gn.version,
          importedBy: importedByCount.get(gn.id) ?? 0,
        };
        return { id: gn.id, type: 'external', position: { x: 0, y: 0 }, data };
      }
    });

    const rfEdges: Edge[] = graph.edges.map((ge) => ({
      id: `${ge.source}--${ge.target}--${ge.kind}`,
      source: ge.source,
      target: ge.target,
      type: ge.isCircular ? 'circular' : 'default',
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { kind: ge.kind, isCircular: ge.isCircular },
    }));

    const rawNodes = graph.nodes.map((n) => ({ id: n.id }));
    const rawEdges = graph.edges.map((e) => ({
      id: `${e.source}--${e.target}--${e.kind}`,
      source: e.source,
      target: e.target,
    }));

    applyElkLayout(rawNodes, rawEdges).then((positioned) => {
      const posMap = new Map(positioned.map((p) => [p.id, p.position]));
      setNodes(rfNodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? { x: 0, y: 0 } })));
    });

    setEdges(rfEdges);
    setFilters((prev) => syncFiltersFromGraph(prev, graph));
  }, [graph]);

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

        {/* ReactFlowProvider lets FlowInner call useReactFlow() */}
        <ReactFlowProvider>
          <FlowInner
            nodes={visibleNodes}
            edges={edges}
            selectedNode={selectedNode}
            onNodeClick={handleNodeClick}
            onCloseDetail={() => setSelectedNode(null)}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
