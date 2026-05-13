# Codemap — Project Blueprint

A codebase visualization tool that parses JS/TS projects and renders
interactive dependency graphs in the browser.

**Stack:** Python (analyzer) + Next.js + TypeScript + React Flow (frontend)

---

## 1. Functional Requirements

### 1.1 Python Analyzer (CLI)

- Discover all `.js`, `.ts`, `.jsx`, `.tsx` files under a given root directory,
  respecting `.gitignore` and a configurable exclude list.
- Parse every discovered file using `tree-sitter` and extract:
  - Static `import` declarations and their resolved paths
  - `export` declarations (named, default, re-export)
  - Top-level function and class declarations
  - `import()` dynamic expressions (flagged, not resolved)
- Resolve relative import paths to absolute project-relative paths.
- Read `tsconfig.json` / `jsconfig.json` to resolve path aliases
  (e.g. `@/utils/auth` → `src/utils/auth.ts`).
- Build a directed graph (NetworkX `DiGraph`) with files as nodes and
  imports as edges.
- Detect circular dependency chains and annotate them in the output.
- Compute per-file metrics: in-degree, out-degree, betweenness centrality.
- Serialize the graph to a versioned JSON contract consumed by the frontend.
- Expose a `watch` mode that reruns the scan on file changes.
- Expose a `serve` mode that hosts the JSON over HTTP for the frontend to poll.

### 1.2 CLI Commands

| Command | Description |
|---|---|
| `codemap scan <path>` | Full scan, write `graph.json` |
| `codemap tree <path>` | Rich terminal file tree with stats |
| `codemap cycles <path>` | List all circular import chains |
| `codemap rank <path>` | Rank files by dependency centrality |
| `codemap inspect <file>` | Show one file's imports, exports, consumers |
| `codemap watch <path>` | Scan + re-emit on file change |
| `codemap serve <path>` | Scan + serve JSON on `localhost:7331` |

### 1.3 Web Frontend (Next.js)

- Load the graph JSON from a local file, API route, or the `serve` endpoint.
- Render all nodes on a React Flow canvas with automatic ELK layout.
- Support five custom node types: `FileNode`, `ExportNode`, `DirectoryNode`,
  `ExternalNode`, and circular-dependency-highlighted variants.
- `FileNode` expands on click to show child `ExportNode`s.
- `DirectoryNode` collapses all children into a summary on click.
- Sidebar: filter by directory, file extension, and category (hook/component/
  service/utility).
- Searchbar: highlight matching nodes, grey out the rest.
- Click any node to open a detail panel: file path, full import list,
  full export list, circular dependency warnings.
- Minimap in the bottom-right corner.
- Live reload when the `serve` endpoint pushes a new graph version.

---

## 2. Non-Functional Requirements

- **Performance:** Full scan of a 500-file project must complete in under 3 s.
  React Flow canvas must remain interactive (60 fps pan/zoom) up to 400 nodes
  without virtualization. Beyond 400 nodes, enable clustering by directory.
- **Accuracy:** All static imports correctly resolved, including barrel files.
  Dynamic imports flagged but not silently dropped.
- **Correctness:** Circular dependency detection must be exhaustive (not just
  the first cycle found).
- **Portability:** CLI runs on Linux (Python 3.10+). Frontend runs in any
  modern browser.
- **Extensibility:** Parser layer designed so adding a new language grammar
  (e.g. Python imports) requires only a new extractor module, not changes to
  the graph builder or CLI.

---

## 3. Known Problems & Mitigations

### 3.1 Path Alias Resolution

**Problem:** Imports like `@/components/Button` or `~/utils/cn` are not
filesystem paths. Without resolving them, the graph has hundreds of broken
edges.

**Mitigation:** At startup, read `tsconfig.json` (and `jsconfig.json`) from
the project root and parse the `compilerOptions.paths` map. Build an alias
resolver that is applied to every import string before path normalization.
If no config is found, fall back to a heuristic that treats `@/` as `src/`.
Emit a warning in the CLI output for every import that could not be resolved.

---

### 3.2 Barrel Files Exploding the Graph

**Problem:** A `src/components/index.ts` that re-exports 30 components causes
30 edges from every consumer to that barrel, making the graph unreadable.

**Mitigation:** Detect barrel files (files whose exports are all re-exports,
no own declarations). In the graph, replace the barrel node with a
"pass-through" and route edges directly to the original source files. Expose
a `--no-barrel-flatten` flag to disable this for users who want the raw graph.

---

### 3.3 Circular Dependency Rendering

**Problem:** NetworkX finds cycles correctly, but rendering them in React Flow
creates arrows that visually loop back, breaking the top-to-bottom layout.

**Mitigation:** After ELK layout, post-process any edge whose target node has
a `y` position less than its source node (i.e. a back-edge). Render these as
`CircularEdge` — a curved self-loop or a highlighted return path — using a
distinct red/coral color and a warning label. Never remove them from the
graph; make them unmissable.

---

### 3.4 Dynamic Imports

**Problem:** `const mod = await import(variable)` — the path is a runtime
value and cannot be statically resolved.

**Mitigation:** tree-sitter can detect the `import()` call expression even
when the argument is not a string literal. Emit a special `DynamicImportNode`
with a warning marker. Do not attempt to resolve it. Expose a `codemap cycles`
warning that lists files containing unresolved dynamic imports.

---

### 3.5 Large Codebases (500+ nodes)

**Problem:** React Flow DOM rendering becomes sluggish past ~400 nodes.

**Mitigation:** Implement two-level rendering. By default, show only
`DirectoryNode`s (one per folder). The user expands a folder to materialize
its `FileNode`s. Only files in "expanded" directories exist in the React Flow
graph at any time. Add a `--flat` mode to the scan command that pre-groups
files and includes cluster metadata in the JSON.

---

### 3.6 `.d.ts` and `node_modules`

**Problem:** Importing from a package like `import { useState } from 'react'`
has no local source file. Naively following this creates thousands of external
nodes from `node_modules`.

**Mitigation:** Any import whose resolved path falls outside the project root
(or is a bare specifier that doesn't resolve to a local file) becomes an
`ExternalNode`. Read `package.json` to look up the version. Limit external
nodes to direct dependencies only (not transitive). `node_modules` is never
walked.

---

### 3.7 Mixed JS + TS Projects

**Problem:** A project may have `.js` files imported by `.ts` files, or
`.cjs`/`.mjs` modules.

**Mitigation:** When resolving an import like `./utils`, attempt extensions in
this order: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`.
The first match wins. This mirrors Node.js and TypeScript module resolution
closely enough for static analysis.

---

### 3.8 Watch Mode Accuracy

**Problem:** Full rescans on every file save are slow on large projects.

**Mitigation:** Use `watchdog` to get filesystem events. On a change event,
only re-parse the changed file and its direct consumers (files that import it).
Patch the graph incrementally rather than rebuilding it. Only trigger a full
rescan when `tsconfig.json`, `package.json`, or any `index.ts` barrel file
changes.

---

## 4. JSON Contract (Python → Frontend)

All fields are required unless marked optional.

```json
{
  "version": "1",
  "scannedAt": "2026-05-12T10:30:00Z",
  "root": "/home/jp7/projects/myapp",
  "stats": {
    "totalFiles": 142,
    "totalEdges": 389,
    "circularChains": 2,
    "externalPackages": 18
  },
  "nodes": [
    {
      "id": "src/components/auth/AuthForm.tsx",
      "type": "file",
      "filename": "AuthForm",
      "extension": ".tsx",
      "category": "component",
      "path": "src/components/auth/AuthForm.tsx",
      "isEntry": false,
      "isBarrel": false,
      "importCount": 4,
      "exportCount": 2,
      "inDegree": 3,
      "outDegree": 4,
      "centrality": 0.042,
      "hasCircularDep": false,
      "exports": [
        { "name": "AuthForm", "kind": "default", "consumedBy": 3 },
        { "name": "AuthFormProps", "kind": "type", "consumedBy": 1 }
      ]
    },
    {
      "id": "react",
      "type": "external",
      "packageName": "react",
      "version": "^18.2.0",
      "importedBy": 31
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "src/components/auth/AuthForm.tsx",
      "target": "src/hooks/useAuth.ts",
      "kind": "static",
      "isCircular": false
    },
    {
      "id": "e2",
      "source": "src/utils/token.ts",
      "target": "src/utils/http.ts",
      "kind": "dynamic",
      "isCircular": false
    }
  ],
  "cycles": [
    ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"]
  ],
  "directories": [
    {
      "id": "src/components/auth",
      "path": "src/components/auth",
      "fileCount": 6,
      "exportCount": 14
    }
  ]
}
```

---

## 5. Micro Tasks

Tasks are tagged **[P]** (Python analyzer) or **[W]** (web frontend).
Size: **S** = under 2 h, **M** = 2–4 h, **L** = 4–8 h.

---

### Phase 0 — Repository Setup

```
P-00  [S]  Create Python package with pyproject.toml (hatch or uv),
           src/codemap/ layout, ruff + mypy config.

P-01  [S]  Create tests/ directory, configure pytest, add a smoke test
           that imports the package without errors.

W-00  [S]  Scaffold Next.js 14 app with TypeScript, Tailwind, and
           src/app layout. Commit with ESLint + Prettier config.

W-01  [S]  Install @xyflow/react, elkjs, @types/elkjs, shadcn/ui.
           Confirm React Flow renders an empty canvas without errors.

R-00  [S]  Write top-level README.md with project overview, quick-start,
           and architecture diagram placeholder.
```

---

### Phase 1 — File Discovery

```
P-02  [S]  Write src/codemap/discovery.py: walk a root directory,
           return all paths matching [.ts, .tsx, .js, .jsx].
           Exclude node_modules, .git, dist, build by default.

P-03  [S]  Read .gitignore in the project root and exclude those patterns
           from discovery. Use the `pathspec` library.

P-04  [S]  Add unit tests: correct files discovered, excluded paths not
           returned, .gitignore patterns respected.
```

---

### Phase 2 — Import & Export Extraction

```
P-05  [M]  Write src/codemap/parser/import_extractor.py using tree-sitter.
           Extract all static import declaration paths from a source file.
           Return List[str] of raw import strings.

P-06  [S]  Handle `export { x } from './y'` re-exports in the same
           extractor — they carry both an export and an implicit import.

P-07  [M]  Write src/codemap/parser/export_extractor.py. Extract:
           named exports, default export, re-exports, type-only exports.
           Return List[ExportRecord] dataclass.

P-08  [S]  Write src/codemap/parser/declaration_extractor.py. Extract
           top-level function and class names declared in the file.

P-09  [S]  Flag dynamic import() call expressions. Return them in a
           separate List[str] from import_extractor, marked as dynamic.

P-10  [M]  Write unit tests for each extractor using real fixture .ts/.tsx
           files stored under tests/fixtures/. Cover edge cases:
           multiline imports, type-only imports, namespace imports,
           default + named in one statement.
```

---

### Phase 3 — Path Resolution

```
P-11  [M]  Write src/codemap/resolver/alias_resolver.py. Read
           tsconfig.json compilerOptions.paths and build a mapping
           from alias prefix to filesystem path. Apply it to raw import
           strings before further resolution.

P-12  [M]  Write src/codemap/resolver/path_resolver.py. Given a source
           file path and a raw import string, return the absolute project-
           relative path of the imported file. Try extensions in order:
           .ts > .tsx > .js > .jsx > /index.ts > /index.tsx.

P-13  [S]  Classify imports: if the resolved path falls outside the
           project root, or the raw string is a bare specifier that
           couldn't be resolved, mark it as "external" and extract the
           package name (first path segment).

P-14  [S]  Write unit tests for resolver: relative paths, alias paths,
           barrel index resolution, external package classification.
```

---

### Phase 4 — Graph Builder

```
P-15  [M]  Write src/codemap/graph/builder.py. Iterate all discovered
           files, run all extractors + resolver, and construct a
           NetworkX DiGraph. Nodes carry file metadata as attributes.
           Edges carry import kind (static/dynamic/reexport).

P-16  [S]  Add barrel file detection: a node is a barrel if all its
           exports are re-exports and it has zero own declarations.
           Store isBarrel=True in node attributes.

P-17  [S]  Implement barrel flattening: for each barrel node, redirect
           incoming edges to point to the original source files.
           Keep the barrel node but mark it visually distinct.

P-18  [M]  Write src/codemap/graph/analyzer.py.
           - nx.simple_cycles() for circular dependency detection
           - nx.betweenness_centrality() for importance ranking
           - in_degree / out_degree per node

P-19  [S]  Read package.json to look up version strings for external
           package nodes.

P-20  [M]  Write unit tests for graph builder using a synthetic fixture
           project (a small directory of .ts files). Assert correct node
           count, edge count, cycle detection, centrality scores.
```

---

### Phase 5 — JSON Serializer

```
P-21  [M]  Write src/codemap/graph/serializer.py. Serialize the NetworkX
           graph to the JSON contract defined in section 4. Use Python
           dataclasses + dacite or Pydantic for schema validation.

P-22  [S]  Write the inverse: a deserializer that reads graph.json back
           into Python dataclasses. Used in tests and for incremental
           patching in watch mode.

P-23  [S]  Validate the output JSON against a JSON Schema file stored at
           docs/graph-schema.json. Fail loudly if the output is invalid.
```

---

### Phase 6 — CLI

```
P-24  [M]  Wire up src/codemap/cli.py using Typer. Implement the `scan`
           command: discover → parse → resolve → build → serialize →
           write graph.json. Show a Rich progress bar during scanning.

P-25  [S]  Implement `tree` command: print a Rich Tree of the project
           directory with file counts and export counts per folder.

P-26  [S]  Implement `cycles` command: print all circular chains as a
           Rich Table with file paths and chain length. Exit code 1 if
           any cycles found (useful in CI).

P-27  [S]  Implement `rank` command: print top-N files by betweenness
           centrality as a Rich Table. Default N=10.

P-28  [S]  Implement `inspect` command: print one file's imports,
           exports, consumers, and circular warnings. Use Rich Panels.

P-29  [M]  Implement `watch` command using watchdog. On file change,
           re-parse the changed file and its direct consumers only.
           Patch graph.json incrementally. Print a Rich Live update line.

P-30  [M]  Implement `serve` command: run a simple HTTP server
           (http.server or FastAPI) that serves graph.json at
           GET /graph and accepts a WebSocket connection that pushes
           updated JSON on file change.
```

---

### Phase 7 — Frontend: Types & Data Layer

```
W-02  [S]  Write src/types/graph.ts — TypeScript interfaces that exactly
           mirror the JSON contract in section 4. Export all types.

W-03  [S]  Write src/lib/api.ts: fetchGraph() function that reads from
           either a local API route or the serve endpoint URL set in
           NEXT_PUBLIC_ANALYZER_URL env variable.

W-04  [S]  Create /api/graph route in Next.js that reads graph.json from
           the filesystem (path configured via env var) and returns it.

W-05  [S]  Write a useGraph() React hook that fetches, parses, and
           caches the graph. Re-fetches every 2 s when in watch mode
           (poll the ETag). Exposes loading and error states.
```

---

### Phase 8 — Custom Node Components

```
W-06  [M]  Implement FileNode.tsx. Left border color by category. Shows
           filename, extension badge, category badge, import/export counts,
           file path. Chevron toggles expanded state.

W-07  [M]  Implement ExportNode.tsx. Compact card with kind badge
           (fn/class/type/const), export name in monospace, consumer count.
           Rendered as child nodes when parent FileNode expands.

W-08  [S]  Implement DirectoryNode.tsx using React Flow Group node.
           Dashed border, folder icon, file and export counts, collapse
           toggle.

W-09  [S]  Implement ExternalNode.tsx. Dashed border, package icon,
           name, version badge, "imported by N files" count. No top handle.

W-10  [S]  Implement CircularEdge.tsx. Curved path in coral/red,
           animated dash offset, small ⚠ label at midpoint.

W-11  [S]  Register all node and edge types in the nodeTypes and
           edgeTypes objects passed to <ReactFlow />.
```

---

### Phase 9 — Layout & Canvas

```
W-12  [M]  Write src/lib/layout.ts. Accept nodes + edges from the graph
           JSON, run elkjs layered layout (top-to-bottom), return nodes
           with x/y positions. Handle ELK's async API correctly.

W-13  [M]  Build the main <GraphCanvas /> component. Loads graph via
           useGraph(), runs layout, passes result to <ReactFlow />.
           Shows a skeleton loader while layout is computing.

W-14  [S]  Add minimap, Background (dots), and Controls components from
           @xyflow/react.

W-15  [M]  Implement FileNode expand/collapse. On expand: add that file's
           ExportNode children to the React Flow nodes array and connect
           them with short smoothstep edges. On collapse: remove them.
           Run a partial layout only on the affected subtree.

W-16  [S]  Implement DirectoryNode collapse: replace all child FileNodes
           with a summary and remove their edges from the canvas.
```

---

### Phase 10 — Sidebar & Interaction

```
W-17  [M]  Build <FilterSidebar /> component. Checkboxes for category
           (component, hook, service, utility), file extension, and
           directory. Filtering greys out non-matching nodes (opacity 0.2)
           without removing them from the graph.

W-18  [S]  Build <SearchBar />. On input, match against filename and path.
           Matching nodes get a highlight ring; others grey out.

W-19  [M]  Build <DetailPanel />. Slides in from the right when a node
           is clicked. Shows: full path, all imports (as clickable links
           that pan to that node), all exports, circular dep warnings,
           centrality score.

W-20  [S]  On node click: pan and zoom the canvas to center that node
           using reactFlowInstance.fitView({ nodes: [selected] }).

W-21  [S]  On node hover: highlight all directly connected edges and
           their source/target nodes. Grey out everything else.
```

---

### Phase 11 — Performance & Polish

```
W-22  [M]  Implement two-level directory clustering. Default view shows
           only DirectoryNodes. User expands a directory to materialize
           its FileNodes. Only expanded nodes exist in the React Flow DOM.

W-23  [S]  Add circular dependency banner at the top of the canvas when
           cycles are present. Clicking it filters to only the files
           involved in cycles.

W-24  [S]  Add a "reset layout" button that reruns ELK layout from
           scratch (useful after many expand/collapse operations).

P-31  [S]  Benchmark the Python scanner on a 500-file synthetic project.
           Profile with py-spy if scan exceeds 3 s. Optimize the
           bottleneck (usually tree-sitter parse calls — batch them).

W-25  [S]  Measure React Flow FPS with 400 nodes using Chrome DevTools.
           If under 50 fps, enable React Flow's nodesDraggable={false}
           at high node counts as a fallback.
```

---

### Phase 12 — Testing & CI

```
P-32  [M]  Write integration test: run `codemap scan` on a fixture project
           directory, assert graph.json matches a snapshot.

P-33  [S]  Set up GitHub Actions: ruff lint → mypy typecheck → pytest on
           push to main and on PRs.

W-26  [M]  Write Playwright or Vitest browser tests: load graph.json
           fixture, assert correct node count rendered, assert expand/
           collapse works, assert filter correctly greys out nodes.

W-27  [S]  Set up GitHub Actions: eslint → tsc --noEmit → vitest on
           push to main and on PRs.
```

---

## 6. Documentation Guidelines

### 6.1 Python: Google-style docstrings

Every public function, class, and module gets a docstring. Use Google style
(the clearest for reading without a doc renderer).

```python
def resolve_import(source_file: str, raw_import: str, root: str) -> ResolvedImport:
    """Resolve a raw import string to an absolute project-relative path.

    Tries extensions in priority order: .ts > .tsx > .js > .jsx >
    /index.ts > /index.tsx. Falls back to marking the import as external
    if no local file is found.

    Args:
        source_file: Project-relative path of the file containing the import.
        raw_import:  The raw import string, e.g. '../utils/token' or '@/hooks/useAuth'.
        root:        Absolute path of the project root directory.

    Returns:
        A ResolvedImport with kind='local' and the resolved path, or
        kind='external' and the package name if resolution fails.

    Raises:
        ValueError: If source_file is not within root.
    """
```

Use `sphinx-autodoc` with `sphinx-napoleon` to generate HTML API docs from
these docstrings. Run `make docs` to rebuild. Store generated docs in `docs/api/`.

Modules (every `__init__.py` and every `.py` file that is a public entry point)
get a one-paragraph module docstring at the top describing what the module does
and what it does NOT do.

### 6.2 TypeScript: TSDoc comments

Every exported function, component, type, and hook gets a TSDoc comment.

```typescript
/**
 * Runs ELK layered layout on the graph nodes and edges.
 *
 * @remarks
 * ELK layout is asynchronous. This function awaits the layout worker
 * and returns nodes with `position.x` and `position.y` populated.
 * Edge routing data is discarded; React Flow handles edge rendering.
 *
 * @param nodes - Raw nodes from the graph JSON (no positions yet).
 * @param edges - Raw edges from the graph JSON.
 * @param direction - Layout direction. Default is `'TB'` (top to bottom).
 * @returns A new nodes array with x/y positions set.
 */
export async function applyElkLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: 'TB' | 'LR' = 'TB',
): Promise<PositionedNode[]>
```

Use `typedoc` to generate HTML docs from TSDoc. Add `typedoc.json` to the web
package root.

React component props interfaces get a docstring per prop:

```typescript
interface FileNodeProps {
  /** Project-relative file path used as the node ID. */
  id: string;
  /** Display data extracted from the graph JSON node object. */
  data: FileNodeData;
  /** Whether this node is currently selected in the canvas. */
  selected: boolean;
}
```

### 6.3 Inline comment philosophy

Write comments for **why**, never for **what**. If a line of code needs a
comment to explain what it does, rewrite the code to be self-explanatory first.
Comments that explain non-obvious decisions, workarounds, or gotchas are
mandatory.

```python
# tree-sitter returns byte offsets, not character offsets.
# Decode the slice with 'utf-8' after slicing the raw bytes,
# not the decoded string, or multi-byte characters corrupt positions.
text = source_bytes[node.start_byte:node.end_byte].decode("utf-8")
```

```typescript
// ELK positions nodes relative to their parent group, not the canvas.
// We must add the parent's absolute position to get canvas coordinates.
// This is undocumented behavior in elkjs — see issue #447 in their repo.
const absoluteX = position.x + (parentPosition?.x ?? 0);
```

### 6.4 README structure (both packages)

Each package (Python and web) has its own `README.md` with this structure:

```
## What it does        — one paragraph, no jargon
## Quick start         — copy-pasteable commands from zero to running
## Configuration       — all env vars and config file options, table format
## Commands / API      — every CLI command or API route, with examples
## Architecture        — brief description, link to docs/architecture.md
## Development         — how to run tests, linter, type checker locally
## Known limitations   — honest list, links to relevant issues
```

### 6.5 Architecture Decision Records (ADRs)

Store ADRs in `docs/adr/`. One markdown file per major technical decision.
Use this template:

```markdown
# ADR-001: Use tree-sitter over @typescript-eslint/parser

## Status: Accepted

## Context
We need to parse .js, .ts, .jsx, and .tsx files in Python.
Two realistic options are tree-sitter (C bindings) and calling
the TypeScript compiler via subprocess.

## Decision
Use tree-sitter with tree-sitter-languages.

## Consequences
- Positive: 10–50× faster than spawning a Node.js subprocess per file.
- Positive: Single Python dependency, no Node.js required for the analyzer.
- Negative: Type information is not available (tree-sitter is syntax-only).
  Type-aware analysis (e.g. resolving overloaded function calls) is out of scope.
- Negative: Grammar accuracy relies on tree-sitter-languages keeping grammars
  current. Pin the version and audit on upgrades.
```

Write an ADR for every decision that would be confusing to a new contributor
without context: language/framework choices, schema design decisions, graph
algorithm choices, and any workarounds for library bugs.

### 6.6 CHANGELOG.md

Use Keep a Changelog format (keepachangelog.com). Every PR that changes
user-facing behavior adds an entry under `[Unreleased]` before merging.
Categories: Added, Changed, Deprecated, Removed, Fixed, Security.

### 6.7 JSON Schema as documentation

The file `docs/graph-schema.json` is the single source of truth for the
Python → frontend contract. Every field has a `"description"` property.
The Python serializer validates its output against this schema at runtime
(fail loudly in development, warn in production). The TypeScript types in
`src/types/graph.ts` are generated from this schema using `json-schema-to-typescript`
to guarantee they never drift:

```bash
npx json-schema-to-typescript docs/graph-schema.json -o web/src/types/graph.ts
```

Add this as a pre-commit hook so the types are always in sync.

### 6.8 What NOT to document

Do not document things that are self-evident from the code or from standard
library/framework behavior. Over-documentation is as harmful as under-documentation
because it creates maintenance burden and goes stale faster than code.
Do not write docstrings for private helper functions under 5 lines. Do not
explain language syntax in comments.

---

## 7. Suggested Directory Structure

```
codemap/
├── analyzer/                    # Python package
│   ├── src/codemap/
│   │   ├── cli.py               # Typer app, all commands
│   │   ├── discovery.py         # File walker
│   │   ├── parser/
│   │   │   ├── import_extractor.py
│   │   │   ├── export_extractor.py
│   │   │   └── declaration_extractor.py
│   │   ├── resolver/
│   │   │   ├── alias_resolver.py
│   │   │   └── path_resolver.py
│   │   ├── graph/
│   │   │   ├── builder.py
│   │   │   ├── analyzer.py
│   │   │   └── serializer.py
│   │   ├── watch.py
│   │   └── serve.py
│   ├── tests/
│   │   └── fixtures/            # Small .ts/.tsx files for unit tests
│   └── pyproject.toml
│
├── web/                         # Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Canvas page
│   │   │   └── api/graph/
│   │   │       └── route.ts     # Serves graph.json
│   │   ├── components/
│   │   │   ├── nodes/
│   │   │   │   ├── FileNode.tsx
│   │   │   │   ├── ExportNode.tsx
│   │   │   │   ├── DirectoryNode.tsx
│   │   │   │   └── ExternalNode.tsx
│   │   │   ├── edges/
│   │   │   │   └── CircularEdge.tsx
│   │   │   ├── GraphCanvas.tsx
│   │   │   ├── FilterSidebar.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── DetailPanel.tsx
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── layout.ts
│   │   ├── hooks/
│   │   │   └── useGraph.ts
│   │   └── types/
│   │       └── graph.ts         # Generated from docs/graph-schema.json
│   └── package.json
│
├── docs/
│   ├── graph-schema.json        # Canonical JSON contract + descriptions
│   ├── architecture.md
│   └── adr/
│       ├── ADR-001-tree-sitter.md
│       ├── ADR-002-elkjs-layout.md
│       └── ADR-003-json-contract.md
│
├── .github/
│   └── workflows/
│       ├── analyzer.yml
│       └── web.yml
│
├── README.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```
