/** Whether a graph node represents a local source file or an external npm package. */
export type NodeKind = "file" | "external";

/** How a symbol is exported from a module: named export, default export, re-export, or type-only export. */
export type ExportKind = "named" | "default" | "reexport" | "type";

/** How a module is imported: statically at the top of the file, dynamically via `import()`, or re-exported from another module. */
export type ImportKind = "static" | "dynamic" | "reexport";

/** High-level role of a file inferred from its path and contents. */
export type FileCategory = "component" | "hook" | "service" | "utility" | "config";

/** A single export symbol emitted by a file node, including how many other nodes consume it. */
export interface ExportEntry {
  /** Exported symbol name (e.g. `"default"`, `"useAuth"`). */
  name: string;
  /** How the symbol is exported. */
  kind: ExportKind;
  /** Number of other nodes that import this specific export. */
  consumedBy: number;
}

/** Graph node representing a local source file in the scanned project. */
export interface FileGraphNode {
  /** Unique node identifier (typically the file's relative path). */
  id: string;
  /** Discriminant — always `"file"` for this variant. */
  type: "file";
  /** Base file name including extension (e.g. `"useAuth.ts"`). */
  filename: string;
  /** File extension without the leading dot (e.g. `"ts"`, `"tsx"`). */
  extension: string;
  /** Inferred category of the file based on its role in the project. */
  category: FileCategory;
  /** Relative path from the project root (e.g. `"src/hooks/useAuth.ts"`). */
  path: string;
  /** Whether this file is a project entry point (e.g. `index.ts`, `main.tsx`). */
  isEntry: boolean;
  /** Whether this file re-exports symbols from other modules without adding logic (barrel file). */
  isBarrel: boolean;
  /** Total number of import statements in this file. */
  importCount: number;
  /** Total number of exported symbols from this file. */
  exportCount: number;
  /** Number of other nodes that import this file (fan-in). */
  inDegree: number;
  /** Number of modules this file imports (fan-out). */
  outDegree: number;
  /** Betweenness/degree centrality score indicating how central the file is in the graph. */
  centrality: number;
  /** Whether this file participates in at least one circular dependency chain. */
  hasCircularDep: boolean;
  /** All symbols exported by this file. */
  exports: ExportEntry[];
}

/** Graph node representing an external npm package depended on by the project. */
export interface ExternalGraphNode {
  /** Unique node identifier (typically the package name). */
  id: string;
  /** Discriminant — always `"external"` for this variant. */
  type: "external";
  /** npm package name as it appears in `package.json` (e.g. `"react"`, `"@tanstack/query"`). */
  packageName: string;
  /** Installed version string resolved from `node_modules` (e.g. `"18.3.1"`). */
  version: string;
  /** Number of local file nodes that import this package. */
  importedBy: number;
}

/** A node in the dependency graph — either a local file or an external package. */
export type GraphNode = FileGraphNode | ExternalGraphNode;

/** A directed edge in the dependency graph representing one module importing another. */
export interface GraphEdge {
  /** Unique edge identifier. */
  id: string;
  /** ID of the importing node (the file that contains the import statement). */
  source: string;
  /** ID of the imported node (the file or package being imported). */
  target: string;
  /** How the import is performed in the source file. */
  kind: ImportKind;
  /** Whether this edge is part of a circular dependency cycle. */
  isCircular: boolean;
}

/** Summary of a directory within the scanned project. */
export interface DirectoryEntry {
  /** Unique directory identifier (typically its relative path). */
  id: string;
  /** Relative path of the directory from the project root. */
  path: string;
  /** Number of source files directly contained in this directory. */
  fileCount: number;
  /** Total number of exported symbols from files in this directory. */
  exportCount: number;
}

/** Aggregate statistics computed over the entire scanned graph. */
export interface GraphStats {
  /** Total number of local file nodes in the graph. */
  totalFiles: number;
  /** Total number of directed import edges in the graph. */
  totalEdges: number;
  /** Number of distinct circular dependency chains detected. */
  circularChains: number;
  /** Number of unique external packages imported by the project. */
  externalPackages: number;
  /** Number of entry-point files, if computed by the analyzer. */
  entryCount?: number;
}

/** Root object of the `graph.json` file produced by the Python analyzer. */
export interface GraphOutput {
  /** Schema version of the output format (e.g. `"1.0"`). */
  version: string;
  /** ISO 8601 timestamp of when the scan was performed. */
  scannedAt: string;
  /** Absolute path to the project root that was scanned. */
  root: string;
  /** High-level summary statistics for the graph. */
  stats: GraphStats;
  /** All nodes in the graph (file nodes and external package nodes). */
  nodes: GraphNode[];
  /** All directed import edges in the graph. */
  edges: GraphEdge[];
  /** Each inner array is an ordered list of node IDs forming one circular dependency chain. */
  cycles: string[][];
  /** Directory-level summaries for the scanned project tree. */
  directories: DirectoryEntry[];
}
