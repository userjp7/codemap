"""Codemap command-line interface.

Entry point: ``codemap`` → :data:`app`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import networkx as nx
import typer
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, MofNCompleteColumn, Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.tree import Tree as RichTree

from codemap.discovery import discover_files
from codemap.graph.analyzer import analyze
from codemap.graph.builder import build_graph
from codemap.graph.serializer import serialize, write_json
from codemap.parser.export_extractor import extract_declarations, extract_exports
from codemap.parser.import_extractor import extract_imports
from codemap.resolver.alias_resolver import load_aliases
from codemap.resolver.path_resolver import resolve_import
from codemap.serve import start_serve
from codemap.watch import start_watch

console = Console()
app = typer.Typer(name="codemap", add_completion=False, no_args_is_help=True)

_CAT_COLORS: dict[str, str] = {
    "hook": "magenta",
    "component": "cyan",
    "service": "yellow",
    "utility": "dim",
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _analyzed_graph(path: str) -> tuple[nx.DiGraph, str, list[str]]:
    """Discover files, build graph, and run all analysis passes.

    Args:
        path: Project root directory (absolute or relative).

    Returns:
        A ``(G, root, files)`` tuple where *G* is an analysed
        :class:`networkx.DiGraph`, *root* is the resolved absolute root path,
        and *files* is the list of discovered project-relative file paths.
    """
    root = str(Path(path).resolve())
    with console.status("[dim]Scanning project…[/dim]", spinner="dots"):
        files = discover_files(root)
        G = build_graph(root, files)
        analyze(G)
    return G, root, files


def _cyclic_nodes(G: nx.DiGraph) -> set[str]:
    """Return the set of all node IDs that participate in any cycle."""
    cycles: list[list[str]] = G.graph.get("cycles", [])
    return {node for cycle in cycles for node in cycle}


def _node_attr(G: nx.DiGraph, node: str, key: str, default: Any = None) -> Any:
    """Safely read a single attribute from a graph node."""
    if not G.has_node(node):
        return default
    try:
        return G.nodes[node][key]
    except KeyError:
        return default


def _find_project_root(file_path: str) -> str:
    """Walk up from *file_path* until a directory containing ``package.json`` is found.

    Falls back to the file's own directory if no ``package.json`` is found.
    """
    current = Path(file_path).resolve().parent
    while True:
        if (current / "package.json").exists():
            return str(current)
        parent = current.parent
        if parent == current:
            return str(Path(file_path).resolve().parent)
        current = parent


def _make_path_tree(paths: list[str]) -> dict[str, Any]:
    """Build a nested dict from flat file paths.

    Interior keys are directory names; leaf values are the full
    project-relative path string for the file.
    """
    tree: dict[str, Any] = {}
    for p in sorted(paths):
        parts = Path(p).parts
        node = tree
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = p
    return tree


def _render_tree(
    rich_node: RichTree,
    subtree: dict[str, Any],
    G: nx.DiGraph,
    cyclic: set[str],
) -> None:
    """Recursively populate *rich_node* from *subtree*."""
    for name, value in sorted(subtree.items()):
        if isinstance(value, dict):
            branch = rich_node.add(f"[bold blue]{name}/[/bold blue]")
            _render_tree(branch, value, G, cyclic)
        else:
            file_path: str = value
            category = str(_node_attr(G, file_path, "category", "utility"))
            exports = int(_node_attr(G, file_path, "export_count", 0))
            warn = " [red]⚠[/red]" if file_path in cyclic else ""
            color = _CAT_COLORS.get(category, "dim")
            # \\[ renders as a literal '[' in Rich markup
            label = (
                f"{name} [{color}]\\[{category}][/{color}]"
                f" [dim]exports:{exports}[/dim]{warn}"
            )
            rich_node.add(label)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


@app.callback()
def _root() -> None:
    """Codemap — TypeScript/JavaScript dependency graph analyzer."""


@app.command()
def scan(
    path: str = typer.Argument(..., help="Project root to scan"),
    output: str = typer.Option("graph.json", "--output", "-o", help="Output path for the graph JSON"),
    exclude: list[str] = typer.Option([], "--exclude", "-e", help="Extra glob patterns to exclude"),
) -> None:
    """Scan a TypeScript/JavaScript project and emit a dependency graph."""
    root = str(Path(path).resolve())

    console.print(Panel(f"[bold cyan]Codemap[/bold cyan] — scanning [green]{path}[/green]"))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
        console=console,
    ) as progress:
        progress.add_task("Discovering files...", total=None)
        files = discover_files(root, exclude=exclude or None)

    console.print(f"  [dim]Found [bold]{len(files)}[/bold] source file(s)[/dim]")

    if not files:
        console.print("[yellow]No TypeScript/JavaScript files found. Exiting.[/yellow]")
        raise typer.Exit()

    parsed: dict[str, dict[str, object]] = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Parsing files...", total=len(files))
        for rel_path in files:
            abs_path = Path(root) / rel_path
            try:
                src = abs_path.read_bytes()
            except OSError:
                progress.advance(task)
                continue
            parsed[rel_path] = {
                "imports": extract_imports(rel_path, src),
                "exports": extract_exports(rel_path, src),
                "declarations": extract_declarations(rel_path, src),
            }
            progress.advance(task)

    with console.status("[bold]Building graph...[/bold]"):
        G = build_graph(root, files)

    with console.status("[bold]Analyzing...[/bold]"):
        analyze(G)

    with console.status("[bold]Writing output...[/bold]"):
        graph_output = serialize(G, root)
        write_json(graph_output, output)

    cycles: list[list[str]] = G.graph.get("cycles", [])
    stats = graph_output.stats

    table = Table(title="Scan Summary", show_header=True, header_style="bold magenta")
    table.add_column("Metric", style="cyan", no_wrap=True)
    table.add_column("Value", justify="right")
    table.add_row("Total files", str(stats.total_files))
    table.add_row("Total edges", str(stats.total_edges))
    table.add_row("External packages", str(stats.total_external_packages))
    table.add_row("Circular chains", str(stats.cycle_count))
    table.add_row("Output", output)
    console.print(table)

    if cycles:
        lines = "\n".join(
            f"  [yellow]{'[/yellow] [dim]→[/dim] [yellow]'.join(cycle + [cycle[0]])}[/yellow]"
            for cycle in cycles
        )
        console.print(
            Panel(
                lines,
                title="[bold red]⚠  Circular import chains detected[/bold red]",
                border_style="red",
            )
        )


@app.command()
def tree(
    path: str = typer.Argument(..., help="Project root to display"),
) -> None:
    """Print a Rich directory tree with file metadata and cycle markers."""
    G, root, files = _analyzed_graph(path)
    cyclic = _cyclic_nodes(G)

    rich_tree = RichTree(
        f"[bold green]{Path(root).name}/[/bold green]",
        guide_style="dim",
    )
    _render_tree(rich_tree, _make_path_tree(files), G, cyclic)
    console.print(rich_tree)

    total_exports = sum(int(_node_attr(G, f, "export_count", 0)) for f in files)
    cycles: list[list[str]] = G.graph.get("cycles", [])
    console.print(
        f"\n  [dim]{len(files)} file(s) · {total_exports} export(s) · {len(cycles)} cycle(s)[/dim]"
    )


@app.command()
def cycles(
    path: str = typer.Argument(..., help="Project root to check"),
) -> None:
    """List circular import chains. Exits with code 1 when any are found (CI-safe)."""
    G, _root, _files = _analyzed_graph(path)
    cycle_list: list[list[str]] = G.graph.get("cycles", [])

    if not cycle_list:
        console.print("[green]✓ No circular dependencies found.[/green]")
        return

    table = Table(
        title=f"Circular Import Chains ({len(cycle_list)} found)",
        show_header=True,
        header_style="bold red",
    )
    table.add_column("Chain", style="yellow", no_wrap=False)
    table.add_column("Length", justify="right")

    for cycle in sorted(cycle_list, key=len, reverse=True):
        chain = " → ".join(cycle + [cycle[0]])
        table.add_row(chain, str(len(cycle)))

    console.print(table)
    console.print(
        Panel(
            f"[red]{len(cycle_list)} circular chain(s) detected.[/red]",
            border_style="red",
        )
    )
    raise typer.Exit(code=1)


@app.command()
def rank(
    path: str = typer.Argument(..., help="Project root to rank"),
    top: int = typer.Option(10, "--top", "-n", help="Number of files to show"),
) -> None:
    """Rank local files by betweenness centrality, highest first."""
    G, _root, _files = _analyzed_graph(path)

    local_nodes = [n for n, d in G.nodes(data=True) if d.get("type") == "local"]
    ranked = sorted(
        local_nodes,
        key=lambda n: float(_node_attr(G, n, "centrality", 0.0)),
        reverse=True,
    )[:top]

    table = Table(
        title=f"Top {min(top, len(ranked))} Files by Centrality",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("Rank", justify="right", style="dim", no_wrap=True)
    table.add_column("File", no_wrap=True)
    table.add_column("Category")
    table.add_column("Centrality", justify="right")
    table.add_column("In", justify="right")
    table.add_column("Out", justify="right")

    for i, node in enumerate(ranked, 1):
        centrality = float(_node_attr(G, node, "centrality", 0.0))
        category = str(_node_attr(G, node, "category", "utility"))
        in_deg = str(_node_attr(G, node, "in_degree", 0))
        out_deg = str(_node_attr(G, node, "out_degree", 0))
        color = _CAT_COLORS.get(category, "dim")
        table.add_row(
            str(i),
            node,
            f"[{color}]{category}[/{color}]",
            f"{centrality:.4f}",
            in_deg,
            out_deg,
            style="bold" if i <= 3 else "",
        )

    console.print(table)


@app.command()
def inspect(
    file: str = typer.Argument(..., help="Path to a .ts/.tsx/.js/.jsx file to inspect"),
) -> None:
    """Inspect a single file: its imports, exports, and graph metrics."""
    abs_file = Path(file).resolve()
    if not abs_file.is_file():
        console.print(f"[red]File not found: {file}[/red]")
        raise typer.Exit(code=1)

    root = _find_project_root(str(abs_file))
    try:
        rel_path = str(abs_file.relative_to(root))
    except ValueError:
        rel_path = str(abs_file)

    console.print(
        Panel(
            f"[bold cyan]{rel_path}[/bold cyan]\n[dim]root: {root}[/dim]",
            title="Inspecting",
        )
    )

    G, root, _ = _analyzed_graph(root)
    aliases = load_aliases(root)
    src_bytes = abs_file.read_bytes()

    # --- Imports ---
    raw_imports = extract_imports(rel_path, src_bytes)
    imp_table = Table(show_header=True, header_style="bold blue", box=None, pad_edge=False)
    imp_table.add_column("Raw path", style="cyan")
    imp_table.add_column("Resolved", style="green")
    imp_table.add_column("Kind", style="magenta")

    for imp in raw_imports:
        if imp.raw_path == "<dynamic>":
            imp_table.add_row("<dynamic>", "[dim]unknown[/dim]", "dynamic")
        else:
            res = resolve_import(rel_path, imp.raw_path, root, aliases)
            imp_table.add_row(imp.raw_path, res.resolved, imp.kind)

    console.print(Panel(imp_table, title="[bold blue]Imports[/bold blue]"))

    # --- Exports ---
    raw_exports = extract_exports(rel_path, src_bytes)
    consumers = int(_node_attr(G, rel_path, "in_degree", 0))
    exp_table = Table(show_header=True, header_style="bold green", box=None, pad_edge=False)
    exp_table.add_column("Name", style="cyan")
    exp_table.add_column("Kind", style="magenta")
    exp_table.add_column("Consumers", justify="right")

    if raw_exports:
        for exp in raw_exports:
            exp_table.add_row(exp.name, exp.kind, str(consumers))
    else:
        exp_table.add_row("[dim]none[/dim]", "", "")

    console.print(Panel(exp_table, title="[bold green]Exports[/bold green]"))

    # --- Metrics ---
    met_table = Table(show_header=False, box=None, pad_edge=False)
    met_table.add_column("Key", style="dim")
    met_table.add_column("Value")

    if G.has_node(rel_path):
        attrs = G.nodes[rel_path]
        centrality = float(attrs.get("centrality", 0.0))
        met_table.add_row("category", str(attrs.get("category", "—")))
        met_table.add_row("centrality", f"{centrality:.4f}")
        met_table.add_row("in_degree", str(attrs.get("in_degree", 0)))
        met_table.add_row("out_degree", str(attrs.get("out_degree", 0)))
        met_table.add_row("is_entry", str(attrs.get("is_entry", False)))
        met_table.add_row("is_barrel", str(attrs.get("is_barrel", False)))
    else:
        met_table.add_row("[dim]Node not found in graph.[/dim]", "")

    console.print(Panel(met_table, title="[bold yellow]Metrics[/bold yellow]"))


@app.command()
def watch(
    path: str = typer.Argument(..., help="Project root to watch"),
    output: str = typer.Option("graph.json", "--output", "-o", help="Output path for the graph JSON"),
    exclude: list[str] = typer.Option([], "--exclude", "-e", help="Extra glob patterns to exclude"),
) -> None:
    """Watch a project for file changes and rescan automatically."""
    root = str(Path(path).resolve())
    console.print(
        Panel(
            f"[bold cyan]Watching[/bold cyan] [green]{path}[/green]"
            f" — [dim]writing to [bold]{output}[/bold][/dim]\n"
            f"[dim]Ctrl+C to stop[/dim]",
        )
    )
    # Perform an initial scan so graph.json is populated before any event fires.
    with console.status("[dim]Initial scan…[/dim]", spinner="dots"):
        files = discover_files(root, exclude=exclude or None)
        G = build_graph(root, files)
        analyze(G)
        graph_output = serialize(G, root)
        write_json(graph_output, output)
    s = graph_output.stats
    console.print(
        f"[dim]↻[/dim]  Initial scan: [bold]{len(files)}[/bold] files"
        f" — [cyan]{s.total_files}[/cyan] nodes, [cyan]{s.total_edges}[/cyan] edges"
    )
    start_watch(root, output, exclude)


@app.command()
def serve(
    path: str = typer.Argument(..., help="Project root to serve"),
    port: int = typer.Option(7331, "--port", "-p", help="TCP port to listen on"),
    exclude: list[str] = typer.Option([], "--exclude", "-e", help="Extra glob patterns to exclude"),
) -> None:
    """Start an HTTP server that scans on demand and returns the graph JSON."""
    root = str(Path(path).resolve())
    console.print(
        Panel(
            f"[bold cyan]Serving codemap[/bold cyan]"
            f" at [green]http://localhost:{port}/graph[/green]\n"
            f"[dim]Set NEXT_PUBLIC_ANALYZER_URL=http://localhost:{port}"
            f" in web/.env.local[/dim]",
        )
    )
    start_serve(root, port, exclude)
