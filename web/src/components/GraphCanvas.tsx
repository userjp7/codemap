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
import { FolderOpen } from 'lucide-react';

import { useGraph } from '@/hooks/useGraph';
import { applyElkLayout } from '@/lib/layout';
import FileNode from '@/components/nodes/FileNode';
import ExportNode from '@/components/nodes/ExportNode';
import ExternalNode from '@/components/nodes/ExternalNode';
import CircularEdge from '@/components/edges/CircularEdge';
import FilterSidebar from '@/components/FilterSidebar';
import SearchBar from '@/components/SearchBar';
import DetailPanel from '@/components/DetailPanel';
import FolderPicker from '@/components/FolderPicker';
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
  const { graph, loading, error, refetch } = useGraph();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [filters, setFilters] = useState<GraphFilters>(getDefaultFilters());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showPicker, setShowPicker] = useState(false);

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
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Scanning codebase…</p>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950">
          <p className="text-sm text-zinc-500">{error}</p>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            <FolderOpen className="h-4 w-4" />
            Select Project Folder
          </button>
        </div>
        {showPicker && (
          <FolderPicker
            showCancel
            onCancel={() => setShowPicker(false)}
            onSelect={() => {
              setShowPicker(false);
              refetch();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
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

          {/* Change folder button */}
          <button
            onClick={() => setShowPicker(true)}
            title="Change project folder"
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-white"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Change folder
          </button>

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

      {showPicker && (
        <FolderPicker
          showCancel
          onCancel={() => setShowPicker(false)}
          onSelect={() => {
            setShowPicker(false);
            refetch();
          }}
        />
      )}
    </>
  );
}
