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

/** Maximum node count before ELK is skipped in favour of the grid fallback. */
const ELK_NODE_LIMIT = 200;

/** ELK layout timeout in milliseconds before the grid fallback is used. */
const ELK_TIMEOUT_MS = 5000;

/**
 * Simple deterministic grid layout used when the graph exceeds
 * {@link ELK_NODE_LIMIT} nodes or when ELK times out.  Nodes are arranged
 * left-to-right, top-to-bottom in a square-ish grid.
 *
 * @param nodes  Nodes to position (only `id` is required).
 * @returns      Each node's id paired with its computed `{ x, y }` position.
 */
export function gridLayout(nodes: RawNode[]): PositionedNode[] {
  const COLS = Math.ceil(Math.sqrt(nodes.length));
  const H_GAP = 280;
  const V_GAP = 120;
  return nodes.map((n, i) => ({
    id: n.id,
    position: {
      x: (i % COLS) * H_GAP,
      y: Math.floor(i / COLS) * V_GAP,
    },
  }));
}

/**
 * Lay out `nodes` and `edges` with ELK's layered algorithm and return each
 * node's absolute position.
 *
 * Falls back to {@link gridLayout} automatically when:
 * - The graph has more than {@link ELK_NODE_LIMIT} nodes (ELK is too slow).
 * - ELK does not resolve within {@link ELK_TIMEOUT_MS} milliseconds.
 *
 * Every child node must carry explicit `width` and `height` or ELK returns
 * zero/undefined positions — we default to 220 × 80 when the caller omits them.
 *
 * @param nodes     Nodes to position; width/height fall back to 220×80.
 * @param edges     Directed edges expressed as `{ source, target }` pairs.
 * @param direction Layout flow: "TB" = top→bottom (default), "LR" = left→right.
 * @returns         Each node's id paired with its computed `{ x, y }` position.
 */
export async function applyElkLayout(
  nodes: RawNode[],
  edges: RawEdge[],
  direction: "TB" | "LR" = "TB",
): Promise<PositionedNode[]> {
  if (nodes.length > ELK_NODE_LIMIT) {
    console.log(`[ELK] ${nodes.length} nodes exceeds limit — using grid layout`);
    return gridLayout(nodes);
  }

  const elk = new ELK();
  const elkDirection = direction === "LR" ? "RIGHT" : "DOWN";

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection,
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
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

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), ELK_TIMEOUT_MS),
  );

  const result = await Promise.race([elk.layout(graph), timeoutPromise]);

  if (!result) {
    console.warn(`[ELK] layout timed out after ${ELK_TIMEOUT_MS}ms — using grid layout`);
    return gridLayout(nodes);
  }

  const positioned = (result.children ?? []).map((child) => ({
    id: child.id,
    position: { x: child.x ?? 0, y: child.y ?? 0 },
  }));

  console.log(
    "[ELK] layout resolved —",
    positioned.length,
    "nodes:",
    positioned.map((n) => `${n.id}@(${Math.round(n.position.x)},${Math.round(n.position.y)})`).join(", "),
  );

  return positioned;
}
