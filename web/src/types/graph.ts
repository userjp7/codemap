/** Whether a graph node represents a local source file or an external npm package. */
export type NodeKind = "local" | "external";

/** How a symbol is exported from a module. */
export type ExportKind = "named" | "default" | "reexport" | "type";

/** How a module is imported. */
export type ImportKind = "static" | "dynamic" | "reexport";

/** High-level role of a file inferred from its path and contents. */
export type FileCategory = "component" | "hook" | "service" | "utility" | "config";

/** Graph node representing a local source file in the scanned project. */
export interface FileGraphNode {
  /** Unique node identifier — the file's relative path from the project root. */
  id: string;
  /** Discriminant — always `"local"` for this variant. */
  type: "local";
  /** Base file name without extension (e.g. `"useAuth"`). */
  filename: string;
  /** File extension including the leading dot (e.g. `".ts"`, `".tsx"`). */
  extension: string;
  /** Inferred category of the file based on its role in the project. */
  category: FileCategory;
  /** Whether this file is a project entry point. */
  isEntry: boolean;
  /** Whether this file re-exports symbols without adding logic (barrel file). */
  isBarrel: boolean;
  /** Total number of import statements in this file. */
  importCount: number;
  /** Total number of exported symbols from this file. */
  exportCount: number;
  /** Number of other nodes that import this file (fan-in). */
  inDegree: number;
  /** Number of modules this file imports (fan-out). */
  outDegree: number;
  /** Betweenness/degree centrality score. */
  centrality: number;
}

/** Graph node representing an external npm package. */
export interface ExternalGraphNode {
  /** Unique node identifier — the npm package name. */
  id: string;
  /** Discriminant — always `"external"` for this variant. */
  type: "external";
  /** Installed version string (e.g. `"^18.2.0"`). */
  version: string;
}

/** A node in the dependency graph. */
export type GraphNode = FileGraphNode | ExternalGraphNode;

/** A directed edge in the dependency graph. */
export interface GraphEdge {
  /** ID of the importing node. */
  source: string;
  /** ID of the imported node. */
  target: string;
  /** How the import is performed in the source file. */
  kind: ImportKind;
  /** Whether this edge is part of a circular dependency cycle. */
  isCircular: boolean;
}

/** Summary of a directory within the scanned project. */
export interface DirectoryEntry {
  path: string;
  fileCount: number;
  exportCount: number;
}

/** Aggregate statistics computed over the entire scanned graph. */
export interface GraphStats {
  totalFiles: number;
  totalEdges: number;
  totalExternalPackages: number;
  cycleCount: number;
  barrelCount: number;
  entryCount: number;
}

/** Root object returned by the analyzer API. */
export interface GraphOutput {
  version: string;
  scannedAt: string;
  root: string;
  stats: GraphStats;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Each inner array is an ordered list of node IDs forming one circular dependency chain. */
  cycles: string[][];
  directories: DirectoryEntry[];
}

// ---------------------------------------------------------------------------
// React Flow node data types
// ---------------------------------------------------------------------------

/** Data carried by a FileNode React Flow custom node. */
export interface FileNodeData extends FileGraphNode {
  /** Relative path from the project root (same as id, surfaced for the footer). */
  path: string;
  /** Whether this file participates in at least one circular dependency chain. */
  hasCircularDep: boolean;
  /** Called when the user expands this node; the canvas can add child nodes in response. */
  onExpand?: (id: string) => void;
}
