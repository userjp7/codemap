# Codemap — Claude Code Guide

## What this project is

A two-part monorepo:

- **`analyzer/`** — Python CLI that walks a JS/TS project, parses imports/exports with tree-sitter, builds a NetworkX dependency graph, detects circular deps, and serializes everything to `graph.json`.
- **`web/`** — Next.js 14 app that reads `graph.json` and renders it as an interactive React Flow canvas with filtering, search, and a detail panel.

---

## Repository layout

```
codemap/
├── analyzer/
│   ├── src/codemap/
│   │   ├── cli.py                  # Typer CLI — all commands
│   │   ├── discovery.py            # File walker (respects .gitignore)
│   │   ├── parser/
│   │   │   ├── import_extractor.py
│   │   │   ├── export_extractor.py
│   │   │   └── declaration_extractor.py
│   │   ├── resolver/
│   │   │   ├── alias_resolver.py   # tsconfig paths → filesystem
│   │   │   └── path_resolver.py    # relative imports → abs paths
│   │   ├── graph/
│   │   │   ├── builder.py          # builds NetworkX DiGraph
│   │   │   ├── analyzer.py         # cycles, centrality, degrees
│   │   │   └── serializer.py       # DiGraph → graph.json (Pydantic)
│   │   ├── watch.py                # incremental re-scan on file change
│   │   └── serve.py                # FastAPI server at :7331
│   └── tests/
├── web/
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # root page — mounts GraphCanvas
│       │   └── api/graph/route.ts  # serves graph.json from filesystem
│       ├── components/
│       │   ├── GraphCanvas.tsx     # main canvas, layout, filter/search wiring
│       │   ├── FilterSidebar.tsx   # left panel — category/ext/dir filters
│       │   ├── SearchBar.tsx       # floating search at top of canvas
│       │   ├── DetailPanel.tsx     # right slide-in panel on node click
│       │   ├── nodes/
│       │   │   ├── FileNode.tsx    # local file node
│       │   │   ├── ExportNode.tsx  # per-symbol child node (expand)
│       │   │   └── ExternalNode.tsx # npm package node
│       │   └── edges/
│       │       └── CircularEdge.tsx # red animated edge for cycles
│       ├── hooks/useGraph.ts       # fetches + caches graph data
│       ├── lib/
│       │   ├── api.ts              # fetchGraph() — local or serve endpoint
│       │   ├── layout.ts           # ELK async layout wrapper
│       │   └── filters.ts          # applyFilters / applySearch logic
│       └── types/graph.ts          # TypeScript interfaces for graph.json
├── docs/
│   └── USER_MANUAL.md
├── README.md
├── LICENSE                         # MIT
└── CLAUDE.md                       # this file
```

---

## Branch structure

| Branch | Purpose |
|---|---|
| `main` | Stable, release-ready |
| `development` | Active integration — work here day-to-day |
| `test` | QA before merging to main |

Default working branch: **`development`**.

---

## Running things locally

### Analyzer

```bash
cd analyzer
uv sync                                      # install deps (once)
uv run codemap scan /path/to/project         # scan → graph.json
uv run codemap serve /path/to/project        # scan + live HTTP server
```

### Web frontend

```bash
cd web
npm install                                  # install deps (once)
npm run dev                                  # dev server at :3000
```

The web app reads `graph.json` from the path in `web/.env.local`:

```
GRAPH_JSON_PATH=./graph.json
```

For live reload, also set:

```
NEXT_PUBLIC_ANALYZER_URL=http://localhost:7331
```

---

## Running tests and checks

### Analyzer

```bash
cd analyzer
uv run pytest                  # all tests
uv run ruff check .            # lint
uv run ruff format .           # format
uv run mypy src                # type check (strict)
```

### Web

```bash
cd web
npm run lint                   # ESLint
npx tsc --noEmit               # type check
npm run build                  # production build (catches TS errors)
```

---

## Key design decisions

### reactStrictMode is intentionally OFF

`web/next.config.mjs` sets `reactStrictMode: false`. Do not re-enable it. Strict mode double-invokes effects in development, which caused the ELK layout pass to fire twice, overwriting freshly computed node positions with zeros.

### Node/edge types are defined outside the component

In `GraphCanvas.tsx`, `nodeTypes` and `edgeTypes` are module-level constants, not defined inside the component. React Flow unmounts and remounts all nodes if these objects are recreated on every render. Never move them inside the component.

### Filters change opacity, not node presence

`applyFilters` and `applySearch` (in `lib/filters.ts`) set `style.opacity` on non-matching nodes rather than removing them from the array. This keeps the ELK layout stable — positions are never recomputed just because a filter changed.

### Layout is guarded by a ref

`layoutDone` ref in `GraphCanvas.tsx` prevents the filter/search effect from overwriting node positions before the async ELK layout has finished writing them.

### graph.json contract

`web/src/types/graph.ts` is the authoritative TypeScript definition. The Python `serializer.py` must produce output that satisfies this schema. If the schema changes, update both files together.

---

## JSON graph contract (summary)

```
root
├── version         string
├── scannedAt       ISO timestamp
├── root            absolute path of scanned project
├── stats           { totalFiles, totalEdges, totalExternalPackages, cycleCount, ... }
├── nodes[]
│   ├── local node  { id, type:"local", filename, extension, category,
│   │               isEntry, isBarrel, importCount, exportCount,
│   │               inDegree, outDegree, centrality, exports[] }
│   └── external    { id, type:"external", version }
├── edges[]         { source, target, kind, isCircular }
├── cycles[]        string[][] — each inner array is one cycle chain
└── directories[]   { path, fileCount, exportCount }
```

---

## Adding a new CLI command

1. Add a function decorated with `@app.command()` in `analyzer/src/codemap/cli.py`.
2. Use the `_analyzed_graph(path)` helper to get the built + analyzed DiGraph.
3. Print output with `rich` (tables for structured data, panels for summaries).

## Adding a new node type to the canvas

1. Create the component in `web/src/components/nodes/`.
2. Register it in the `nodeTypes` constant at the top of `GraphCanvas.tsx`.
3. Map the graph node data to the new type in the `rfNodes` array inside `runLayout`.

---

## Common pitfalls

- **ELK is async** — `applyElkLayout` returns a Promise. Always `await` it; the positions are not available synchronously.
- **External nodes have no `path`** — only `local` nodes have a file path. Always check `node.type === 'local'` before accessing path-specific fields.
- **Centrality is 0 for isolated nodes** — files with no imports and no consumers have a centrality of exactly `0.0`, not `null`. Render it but don't treat it as missing data.
- **`graph.json` at project root is gitignored** — it is a generated artifact. The copy the web app reads lives at `web/graph.json` (also gitignored). Neither should be committed.
