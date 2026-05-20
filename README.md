# Codemap

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A codebase visualization tool for TypeScript and JavaScript projects. Codemap parses your project's import graph and renders it as an interactive, pannable dependency graph in the browser.

```
codemap scan ./myapp        # analyze the project
npm run dev                 # open the interactive graph
```

---

## What it does

- Walks your project and parses every `.ts`, `.tsx`, `.js`, and `.jsx` file using tree-sitter
- Resolves relative imports and `tsconfig.json` path aliases (e.g. `@/components/...`)
- Detects circular dependency chains exhaustively
- Computes per-file metrics: centrality, in-degree, out-degree
- Serializes everything to a `graph.json` file consumed by the frontend
- Renders nodes on a React Flow canvas with automatic ELK layout
- Lets you filter by category, extension, and directory; search by filename; and inspect any file in a slide-in detail panel

---

## Project structure

```
codemap/
├── analyzer/       # Python CLI — scans projects, emits graph.json
└── web/            # Next.js app — visualizes graph.json in the browser
```

---

## Quick start

### 1. Install the analyzer

Requirements: Python 3.10+, [uv](https://github.com/astral-sh/uv)

```bash
cd analyzer
uv sync
```

### 2. Scan your project

```bash
uv run codemap scan /path/to/your/project -o ../web/graph.json
```

### 3. Start the web app

Requirements: Node.js 18+

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The graph loads automatically.

---

## CLI commands

| Command | Description |
|---|---|
| `codemap scan <path>` | Scan a project and write `graph.json` |
| `codemap tree <path>` | Print a file tree with category and export metadata |
| `codemap cycles <path>` | List circular import chains (exits 1 if any found — CI-safe) |
| `codemap rank <path>` | Rank files by dependency centrality |
| `codemap inspect <file>` | Show one file's imports, exports, and graph metrics |
| `codemap watch <path>` | Scan and re-emit on file change |
| `codemap serve <path>` | Scan and serve graph data at `localhost:7331` for live reload |

Run `codemap --help` or `codemap <command> --help` for full option details.

---

## Live reload

Run `codemap serve` instead of `scan`, then point the web app at it:

```bash
# Terminal 1
cd analyzer && uv run codemap serve /path/to/your/project

# web/.env.local
NEXT_PUBLIC_ANALYZER_URL=http://localhost:7331
```

The browser graph updates automatically whenever you save a file.

---

## Tech stack

| Layer | Technology |
|---|---|
| Analyzer | Python 3.10+, tree-sitter, NetworkX, Typer, Rich, FastAPI |
| Frontend | Next.js 14, React Flow, ELK.js, Tailwind CSS, shadcn/ui |

---

## Documentation

- [User Manual](docs/USER_MANUAL.md) — full guide to the CLI and web interface
- [Project Blueprint](codemap-project-blueprint.md) — architecture, JSON contract, and design decisions

---

## Development

### Analyzer

```bash
cd analyzer
uv run pytest          # run tests
uv run ruff check .    # lint
uv run mypy src        # type check
```

### Web

```bash
cd web
npm run dev            # dev server with hot reload
npm run build          # production build
npm run lint           # ESLint
npx tsc --noEmit       # type check
```
