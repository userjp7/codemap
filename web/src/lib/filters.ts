import type { Node } from '@xyflow/react';
import type { FileCategory, FileNodeData, GraphOutput } from '@/types/graph';
import type { ExternalNodeData } from '@/components/nodes/ExternalNode';

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

/** All known file categories. */
const ALL_CATEGORIES: FileCategory[] = [
  'component',
  'hook',
  'service',
  'utility',
  'config',
];

/**
 * Returns a default {@link GraphFilters} object with every filter enabled
 * and both boolean flags set to their permissive defaults.
 */
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
 * Derives the set of enabled extensions and directories from the graph, merging
 * them into an existing {@link GraphFilters} so that new values start enabled.
 */
export function syncFiltersFromGraph(
  filters: GraphFilters,
  graph: GraphOutput,
): GraphFilters {
  const extensions = new Set(filters.extensions);
  const directories = new Set(filters.directories);

  for (const node of graph.nodes) {
    if (node.type !== 'local') continue;
    if (node.extension) extensions.add(node.extension);
    const topDir = node.id.split('/')[0];
    if (topDir) directories.add(topDir);
  }

  return { ...filters, extensions, directories };
}

/**
 * Applies the active {@link GraphFilters} to a list of React Flow nodes by
 * adjusting `style.opacity` — nodes that do not pass the filters get `0.15`
 * while matching nodes get `1`.  The array length never changes, keeping the
 * ELK layout stable.
 */
export function applyFilters(nodes: Node[], filters: GraphFilters): Node[] {
  return nodes.map((node) => {
    const visible = isNodeVisible(node, filters);
    return {
      ...node,
      style: { ...node.style, opacity: visible ? 1 : 0.15 },
    };
  });
}

/**
 * Applies a text search query to a list of React Flow nodes by adjusting
 * `style.opacity`.  When `query` is empty every node is reset to full opacity.
 * Otherwise, nodes whose `filename`, `path` (local files) or `packageName`
 * (external packages) contain the query string (case-insensitive) get opacity
 * `1`; non-matching nodes get `0.15`.
 */
export function applySearch(nodes: Node[], query: string): Node[] {
  if (!query) {
    return nodes.map((node) => ({
      ...node,
      style: { ...node.style, opacity: 1 },
    }));
  }

  const q = query.toLowerCase();

  return nodes.map((node) => {
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

    return {
      ...node,
      style: { ...node.style, opacity: matches ? 1 : 0.15 },
    };
  });
}

function isNodeVisible(node: Node, filters: GraphFilters): boolean {
  const data = node.data as Partial<FileNodeData & { hasCircularDep?: boolean }>;

  // External nodes
  if (node.type === 'external') {
    return filters.showExternals;
  }

  // Local file nodes
  if (node.type === 'file') {
    if (!filters.categories.has(data.category as FileCategory)) return false;

    // Extension stored without leading dot in FileNode data (e.g. "ts" not ".ts")
    const extWithDot = data.extension
      ? data.extension.startsWith('.')
        ? data.extension
        : `.${data.extension}`
      : '';
    if (extWithDot && !filters.extensions.has(extWithDot)) return false;

    // Directory: first segment of the node id (which is the file path)
    const topDir = (node.id as string).split('/')[0];
    if (filters.directories.size > 0 && topDir && !filters.directories.has(topDir)) {
      return false;
    }

    if (filters.showCircularOnly && !data.hasCircularDep) return false;
  }

  return true;
}
