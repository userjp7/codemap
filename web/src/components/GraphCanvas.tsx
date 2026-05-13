'use client';

import '@xyflow/react/dist/style.css';

import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';

import { useGraph } from '@/hooks/useGraph';
import { applyElkLayout } from '@/lib/layout';
import FileNode from '@/components/nodes/FileNode';
import ExportNode from '@/components/nodes/ExportNode';
import ExternalNode from '@/components/nodes/ExternalNode';
import CircularEdge from '@/components/edges/CircularEdge';
import type { FileNodeData } from '@/types/graph';
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

export default function GraphCanvas() {
  const { graph, loading, error } = useGraph();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!graph) return;

    // Build a set of node IDs that participate in any circular chain.
    const circularNodeIds = new Set(graph.cycles.flat());

    // Count how many local files import each external package.
    const importedByCount = new Map<string, number>();
    for (const e of graph.edges) {
      importedByCount.set(e.target, (importedByCount.get(e.target) ?? 0) + 1);
    }

    // Convert graph nodes → React Flow nodes (position placeholder; ELK fills it in).
    const rfNodes: Node[] = graph.nodes.map((gn) => {
      if (gn.type === 'local') {
        const data: FileNodeData & Record<string, unknown> = {
          ...gn,
          // RF node type "file" maps to the FileNode component.
          type: 'local',
          path: gn.id,
          hasCircularDep: circularNodeIds.has(gn.id),
          // Strip the leading dot so FileNode renders ".tsx" not "..tsx".
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

    // Convert graph edges → React Flow edges; generate a stable id from source+target.
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

    applyElkLayout(rawNodes, rawEdges).then((positioned) => {
      const posMap = new Map(positioned.map((p) => [p.id, p.position]));
      setNodes(rfNodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? { x: 0, y: 0 } })));
    });

    setEdges(rfEdges);
  }, [graph]);

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
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
