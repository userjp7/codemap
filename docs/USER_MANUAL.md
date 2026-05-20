# Codemap — User Manual

Codemap is a codebase visualization tool for TypeScript and JavaScript projects. It scans your project, builds a dependency graph, and renders it as an interactive browser-based canvas so you can explore how your files relate to each other.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [CLI Reference](#cli-reference)
   - [scan](#codemap-scan)
   - [tree](#codemap-tree)
   - [cycles](#codemap-cycles)
   - [rank](#codemap-rank)
   - [inspect](#codemap-inspect)
   - [watch](#codemap-watch)
   - [serve](#codemap-serve)
5. [Web Interface](#web-interface)
   - [Graph Canvas](#graph-canvas)
   - [Node Types](#node-types)
   - [Filter Sidebar](#filter-sidebar)
   - [Search Bar](#search-bar)
   - [Detail Panel](#detail-panel)
   - [Controls and Navigation](#controls-and-navigation)
6. [Configuration](#configuration)
7. [Understanding the Graph](#understanding-the-graph)
8. [Known Limitations](#known-limitations)

---

## Overview

Codemap has two parts that work together:

- **Analyzer** — a Python CLI that walks your JS/TS project, parses every file with tree-sitter, resolves imports, and writes a `graph.json` file.
- **Web Frontend** — a Next.js app that reads `graph.json` and displays it as a pannable/zoomable dependency graph in the browser.

You run the analyzer once (or keep it running with `watch`/`serve`) and then open the web app to explore.

---

## Installation

### Analyzer (Python)

Requirements: **Python 3.10+** and **uv**.

```bash
cd analyzer
uv sync
```

This installs the `codemap` CLI into the virtual environment. You can then run it as:

```bash
uv run codemap --help
```

Or activate the environment first:

```bash
source .venv/bin/activate
codemap --help
```

### Web Frontend

Requirements: **Node.js 18+**.

```bash
cd web
npm install
```

---

## Quick Start

**Step 1** — Scan your project:

```bash
cd analyzer
uv run codemap scan /path/to/your/project
```

This writes `graph.json` in the current directory.

**Step 2** — Copy or move `graph.json` into the `web/` directory (or point the env var at it — see [Configuration](#configuration)).

**Step 3** — Start the web app:

```bash
cd web
npm run dev
```

Open `http://localhost:3000` in your browser. The graph loads automatically.

---

## CLI Reference

All commands follow the form:

```
codemap <command> [arguments] [options]
```

Run `codemap --help` for a list of commands, or `codemap <command> --help` for per-command help.

---

### `codemap scan`

Scans a project and writes a `graph.json` dependency file.

```bash
codemap scan <path> [--output <file>] [--exclude <pattern>]
```

| Argument / Option | Default | Description |
|---|---|---|
| `path` | *(required)* | Root directory of the JS/TS project to scan |
| `--output`, `-o` | `graph.json` | Path where the graph JSON is written |
| `--exclude`, `-e` | *(none)* | Extra glob patterns to exclude (repeatable) |

**Example:**

```bash
# Scan a project and write to the default graph.json
codemap scan ~/projects/myapp

# Write to a custom location and exclude a generated directory
codemap scan ~/projects/myapp -o web/graph.json -e "src/generated/**"
```

After the scan completes, a summary table is printed showing file count, edge count, external packages, and the number of circular chains detected. If circular dependencies are found, they are listed below the table.

---

### `codemap tree`

Prints a rich directory tree of the project with per-file metadata.

```bash
codemap tree <path>
```

Each file entry shows:
- **Category** tag (component, hook, service, utility, config)
- **Export count**
- **⚠ warning** marker if the file is part of a circular dependency

```
myapp/
├── src/
│   ├── components/
│   │   ├── Button.tsx [component] exports:2
│   │   └── AuthForm.tsx [component] exports:1 ⚠
│   └── hooks/
│       └── useAuth.ts [hook] exports:1 ⚠
```

A summary line at the bottom shows total file, export, and cycle counts.

---

### `codemap cycles`

Lists all circular import chains found in the project.

```bash
codemap cycles <path>
```

Output is a table where each row is one cycle, displayed as a chain of file paths with arrows:

```
src/hooks/useAuth.ts → src/utils/token.ts → src/hooks/useAuth.ts   (length 2)
```

**Exit codes:**
- `0` — No circular dependencies found (prints a green confirmation message).
- `1` — One or more circular chains were detected.

This exit code makes `codemap cycles` safe to use in CI pipelines to fail a build when cycles are introduced.

---

### `codemap rank`

Ranks local files by betweenness centrality — a measure of how often a file sits on the shortest dependency path between other files. High-centrality files are the most "load-bearing" in the import graph.

```bash
codemap rank <path> [--top <n>]
```

| Option | Default | Description |
|---|---|---|
| `--top`, `-n` | `10` | Number of files to display |

**Example:**

```bash
codemap rank ~/projects/myapp --top 20
```

The output table shows rank, file path, category, centrality score, in-degree (how many files import it), and out-degree (how many files it imports). The top 3 entries are bold.

---

### `codemap inspect`

Shows detailed information about a single file.

```bash
codemap inspect <file>
```

The output has three panels:

- **Imports** — every import statement in the file, showing the raw path, the resolved absolute path, and the import kind (static, dynamic, reexport).
- **Exports** — every exported symbol with its kind and how many files consume it.
- **Metrics** — the file's category, centrality score, in/out degree, and whether it is a project entry point or a barrel file.

**Example:**

```bash
codemap inspect src/hooks/useAuth.ts
```

The command automatically discovers the project root by walking up the directory tree until it finds a `package.json`.

---

### `codemap watch`

Watches the project for file changes and re-emits `graph.json` incrementally.

```bash
codemap watch <path> [--output <file>]
```

When a source file changes, only that file and its direct consumers are re-parsed; the rest of the graph is patched in-place. A full rescan is triggered when `tsconfig.json`, `package.json`, or any barrel `index.ts` file changes.

Press `Ctrl+C` to stop.

---

### `codemap serve`

Scans the project and serves the graph data over HTTP for the web frontend to poll.

```bash
codemap serve <path> [--port <n>]
```

| Option | Default | Description |
|---|---|---|
| `--port` | `7331` | Port to listen on |

Two endpoints are available:

- `GET /graph` — returns the current `graph.json` payload.
- `WS /ws` — WebSocket connection that pushes an updated JSON payload whenever the graph changes (same incremental logic as `watch`).

Set the `NEXT_PUBLIC_ANALYZER_URL` environment variable in the web app to point at this server:

```bash
# web/.env.local
NEXT_PUBLIC_ANALYZER_URL=http://localhost:7331
```

With this set, the web frontend polls for changes automatically and the graph updates live as you edit files.

---

## Web Interface

Start the web app with `npm run dev` in the `web/` directory, then open `http://localhost:3000`.

---

### Graph Canvas

The main area of the screen is the interactive graph canvas. Nodes represent files and external packages; edges represent import relationships.

**Navigation:**
- **Pan** — click and drag on the background.
- **Zoom** — scroll wheel or pinch gesture. The zoom controls in the bottom-left corner also work.
- **Fit view** — click the fit-to-screen button in the controls panel (bottom-left).

**Re-layout button** — clicking "Re-layout" in the top-right corner recomputes the ELK automatic layout from scratch. This is useful after applying filters or if the graph looks cramped.

While layout is computing, a semi-transparent overlay with the message "Computing layout…" is shown. The canvas is non-interactive during this time.

---

### Node Types

#### File Nodes (local files)

Represent `.ts`, `.tsx`, `.js`, and `.jsx` files in the scanned project.

Each node shows:
- **Filename** (without extension) in bold
- **Extension badge** (e.g. `tsx`, `ts`)
- **Category badge** with a colored left border:
  - Green — `component`
  - Purple — `hook`
  - Blue — `service`
  - Amber — `utility`
  - Grey — `config`
- **Import count** and **export count**
- **Red/coral border** if the file is part of a circular dependency

#### External Nodes (npm packages)

Represent packages imported from `node_modules`. They appear with a dashed border and show:
- Package name
- Version string (from `package.json`)
- Number of local files that import this package

External nodes have no outgoing edges (transitive dependencies are not shown).

#### Circular Edges

Edges that form part of a circular dependency are rendered in red/coral as a curved path with an animated dash and a small warning label. They are never hidden — missing a circular edge could give a misleading picture of the graph.

---

### Filter Sidebar

The sidebar on the left narrows down which nodes are visible on the canvas. Filtering changes node opacity (non-matching nodes become faint) but does not remove them or change their positions, so the layout stays stable.

#### Categories

Checkboxes to include or exclude files by their inferred category:

| Category | What it matches |
|---|---|
| `component` | React component files (usually contain JSX) |
| `hook` | Custom React hooks (files starting with `use`) |
| `service` | Business logic / API layer files |
| `utility` | Helper/util files |
| `config` | Configuration files |

Uncheck a category to fade out all files of that type.

#### Extensions

Checkboxes for each file extension found in the graph (e.g. `.ts`, `.tsx`, `.js`). Uncheck an extension to fade out all files of that type.

#### Directories

Checkboxes for each top-level directory in the project (e.g. `src`, `lib`, `pages`). Uncheck a directory to fade out all files within it.

#### Toggles

- **Show externals** — when off, external npm package nodes are hidden. Turn this off to focus on internal file relationships only.
- **Circular deps only** — when on, only nodes that participate in at least one circular dependency cycle are visible. Everything else is faded out. Use this to investigate dependency cycles.

---

### Search Bar

A floating search bar sits centered at the top of the canvas.

Type any text to search by **filename** or **file path**. Nodes whose names match the query stay fully opaque; all other nodes fade out. The match is case-insensitive and works as a substring match.

Clear the search box to restore full visibility.

---

### Detail Panel

Click any node to open the Detail Panel, which slides in from the right edge of the screen.

#### File node details

- **Header** — filename, category badge with colored accent.
- **Path** — full project-relative file path. Clicking the path centers the canvas on that node.
- **Metrics** — three cells showing:
  - **Centrality** — betweenness centrality score (higher = more load-bearing in the graph)
  - **In-degree** — number of files that import this file
  - **Out-degree** — number of files this file imports
- **Flags** — `entry` badge if this is an entry point; `barrel` badge if this file only re-exports symbols from other files.
- **Exports** — a table of every exported symbol, with its kind (`named`, `default`, `reexport`, `type`) and consumer count.
- **Circular dependency warning** — a red warning box appears if this file participates in a circular import cycle, explaining that cycles can cause initialization order issues and hinder tree-shaking.

#### External package details

- **Header** — package name, version badge.
- **Import count** — how many local files import this package.

#### Closing the panel

Click the **×** button in the top-right corner of the panel, or click any empty area of the canvas background.

---

### Controls and Navigation

The React Flow controls in the bottom-left corner of the canvas provide:

- **Zoom in / Zoom out** — fine-grained zoom buttons.
- **Fit view** — fits all nodes into the visible viewport.
- **Lock** — toggles whether nodes can be dragged (dragging is disabled by default to preserve the ELK layout).

The **MiniMap** in the bottom-right corner shows a bird's-eye view of the entire graph. The highlighted rectangle is the current viewport. Click or drag on the minimap to navigate to that area of the graph.

---

## Configuration

### Web Frontend

Configuration is via environment variables. Create a `.env.local` file in the `web/` directory:

```bash
# Path to graph.json on the filesystem (used by the /api/graph route)
GRAPH_PATH=/absolute/path/to/graph.json

# URL of a running `codemap serve` instance (enables live reload)
NEXT_PUBLIC_ANALYZER_URL=http://localhost:7331
```

If `NEXT_PUBLIC_ANALYZER_URL` is set, the frontend polls the serve endpoint and the graph refreshes whenever the analyzer detects file changes. If it is not set, the frontend reads `graph.json` from the path specified by `GRAPH_PATH` (defaulting to `web/graph.json`).

### Analyzer

The analyzer reads `tsconfig.json` (or `jsconfig.json`) automatically from the project root to resolve path aliases such as `@/components/Button`. No additional configuration is needed for standard setups.

Files and directories excluded by default: `node_modules`, `.git`, `dist`, `build`. Pass additional glob patterns with `--exclude`.

---

## Understanding the Graph

**Edges point from importer to imported.** If file A imports file B, there is an arrow from A to B. In the default top-to-bottom ELK layout, files that nothing imports (entry points) tend to appear at the top and leaf utilities appear at the bottom.

**In-degree** — how many files import this file. A high in-degree file is a widely-shared dependency.

**Out-degree** — how many files this file imports. A high out-degree file has many dependencies.

**Centrality** — betweenness centrality measures how often a file appears on the shortest paths between other files. A high centrality score means the file is a critical hub; changes to it can cascade widely.

**Barrel files** are files that only re-export symbols from other files (e.g. an `index.ts` that does `export * from './Button'`). The analyzer detects these and marks them. In the graph, edges from consumers of a barrel are routed directly to the original source file to reduce visual clutter.

**Circular dependencies** occur when file A imports B and B (directly or transitively) imports A. Circular edges are highlighted in red and are never hidden. The `codemap cycles` command lists all chains and exits with code 1 so they can be caught in CI.

---

## Known Limitations

- **Dynamic imports** — `import(variable)` expressions where the path is a runtime value cannot be resolved statically. They appear as a special marker in `codemap inspect` output but are not drawn as graph edges.
- **Type-only imports** — `import type { Foo } from './foo'` is detected and classified, but since it carries no runtime dependency, it may or may not be relevant to your analysis depending on your use case.
- **Performance** — the React Flow canvas is interactive at 60 fps up to approximately 400 nodes. Very large codebases may feel sluggish. Use the category, extension, and directory filters to reduce the visible node count.
- **No cross-language support** — only `.ts`, `.tsx`, `.js`, and `.jsx` files are analyzed. Python, CSS, JSON, and other file types are ignored.
- **External package depth** — only direct npm dependencies are shown as external nodes. Transitive dependencies (what your dependencies depend on) are not included.
