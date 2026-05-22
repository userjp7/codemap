import type { Node } from '@xyflow/react';
import type { FileCategory, FileNodeData, GraphOutput } from '@/types/graph';
import type { ExternalNodeData } from '@/components/nodes/ExternalNode';
import { ALL_CATEGORIES } from '@/lib/constants';

/** Active filter state for the graph canvas. */
export interface GraphFilters {
  /** Which file categories are currently visible. */
  categories: Set<FileCategory>;
  /** Which file extensions are currently visible (e.g. `".ts"`, `".tsx"`). */
  extensions: Set<string>;
  /** Which top-level directories are currently visible. */
  directories: Set<string>;
  /** Whether external (npm) nodes are shown. */
  showExternals: boolean;
  /** Whether only nodes that participate in a circular dependency are shown. */
  showCircularOnly: boolean;
}

/** Returns the default filter state with all categories and common extensions enabled. */
export function getDefaultFilters(): GraphFilters {
  return {
    categories: new Set<FileCategory>(ALL_CATEGORIES),
    extensions: new Set<string>(['.ts', '.tsx', '.js', '.jsx']),
    directories: new Set<string>(),
    showExternals: true,
    showCircularOnly: false,
  };
}

/**
 * Merges extensions and directories discovered in the graph into existing filters.
 * Returns the same `filters` reference when nothing new was found, avoiding re-renders.
 */
export function syncFiltersFromGraph(
  filters: GraphFilters,
  graph: GraphOutput,
): GraphFilters {
  let changed = false;
  const extensions = new Set(filters.extensions);
  const directories = new Set(filters.directories);

  for (const node of graph.nodes) {
    if (node.type !== 'local') continue;
    if (node.extension) {
      const ext = node.extension.startsWith('.') ? node.extension : `.${node.extension}`;
      if (!extensions.has(ext)) { extensions.add(ext); changed = true; }
    }
    const topDir = node.id.split('/')[0];
    if (topDir && !directories.has(topDir)) { directories.add(topDir); changed = true; }
  }

  return changed ? { ...filters, extensions, directories } : filters;
}

/** Adjusts `style.opacity` for each node based on filter state. Array length is preserved to keep the ELK layout stable. */
export function applyFilters(nodes: Node[], filters: GraphFilters): Node[] {
  let dirty = false;
  const next = nodes.map((node) => {
    const opacity = isNodeVisible(node, filters) ? 1 : 0.15;
    if ((node.style?.opacity ?? 1) === opacity) return node;
    dirty = true;
    return { ...node, style: { ...node.style, opacity } };
  });
  return dirty ? next : nodes;
}

/** Adjusts `style.opacity` based on a case-insensitive match against filename/path (local) or packageName (external). Returns `nodes` unchanged when `query` is empty. */
export function applySearch(nodes: Node[], query: string): Node[] {
  if (!query) return nodes;

  const q = query.toLowerCase();
  let dirty = false;

  const next = nodes.map((node) => {
    let matches = false;

    if (node.type === 'file') {
      const data = node.data as Partial<FileNodeData>;
      matches =
        (data.filename?.toLowerCase().includes(q) ?? false) ||
        (data.path?.toLowerCase().includes(q) ?? false);
    } else if (node.type === 'external') {
      const data = node.data as Partial<ExternalNodeData>;
      matches = data.packageName?.toLowerCase().includes(q) ?? false;
    }

    const opacity = matches ? 1 : 0.15;
    if ((node.style?.opacity ?? 1) === opacity) return node;
    dirty = true;
    return { ...node, style: { ...node.style, opacity } };
  });

  return dirty ? next : nodes;
}

function isNodeVisible(node: Node, filters: GraphFilters): boolean {
  const data = node.data as Partial<FileNodeData>;

  if (node.type === 'external') return filters.showExternals;

  if (node.type === 'file') {
    if (!filters.categories.has(data.category as FileCategory)) return false;

    // Node data stores extension without leading dot (stripped in GraphCanvas); re-add before lookup.
    const extWithDot = data.extension
      ? data.extension.startsWith('.') ? data.extension : `.${data.extension}`
      : '';
    if (extWithDot && !filters.extensions.has(extWithDot)) return false;

    const topDir = (node.id as string).split('/')[0];
    if (filters.directories.size > 0 && topDir && !filters.directories.has(topDir)) return false;

    if (filters.showCircularOnly && !data.hasCircularDep) return false;
  }

  return true;
}
