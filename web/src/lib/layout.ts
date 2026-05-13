/**
 * Graph layout utilities powered by ELK (Eclipse Layout Kernel).
 *
 * We import from "elkjs/lib/elk.bundled.js" rather than the default entry
 * point so that ELK runs synchronously in the same thread instead of spawning
 * a Web Worker. Next.js cannot bundle worker URLs at build time, so the
 * worker-based default import breaks in both SSR and the browser bundle.
 */
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";

export interface RawNode {
  id: string;
  width?: number;
  height?: number;
}

export interface RawEdge {
  id: string;
  source: string;
  target: string;
}

export interface PositionedNode {
  id: string;
  position: { x: number; y: number };
}

const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 80;

/**
 * Lay out `nodes` and `edges` with ELK's layered algorithm and return each
 * node's absolute position.
 *
 * ELK's `layout()` is async because the non-bundled build delegates work to a
 * Web Worker via `postMessage`. The bundled build used here still returns a
 * Promise for API consistency — `await` it normally.
 *
 * Top-level nodes are children of the synthetic root node that ELK creates
 * internally, so their `x`/`y` values in the result are absolute coordinates
 * and can be passed directly to React Flow (or any canvas library).
 *
 * @param nodes     Nodes to position; width/height fall back to 220×80.
 * @param edges     Directed edges expressed as `{ source, target }` pairs.
 * @param direction Layout flow: "TB" = top→bottom (default), "LR" = left→right.
 * @returns         Each node's id paired with its computed { x, y } position.
 */
export async function applyElkLayout(
  nodes: RawNode[],
  edges: RawEdge[],
  direction: "TB" | "LR" = "TB",
): Promise<PositionedNode[]> {
  const elk = new ELK();

  const elkDirection = direction === "LR" ? "RIGHT" : "DOWN";

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection,
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width ?? DEFAULT_WIDTH,
      height: n.height ?? DEFAULT_HEIGHT,
    })),
    edges: edges.map(
      (e): ElkExtendedEdge => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      }),
    ),
  };

  const laid = await elk.layout(graph);

  return (laid.children ?? []).map((child) => ({
    id: child.id,
    position: { x: child.x ?? 0, y: child.y ?? 0 },
  }));
}
