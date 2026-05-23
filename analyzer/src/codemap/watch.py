"""File-watcher that rescans the project graph on any source-file change."""

from __future__ import annotations

import threading
import time
from pathlib import Path

from rich.console import Console
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
from watchdog.observers.api import BaseObserver

from codemap.discovery import discover_files
from codemap.graph.analyzer import analyze
from codemap.graph.builder import build_graph
from codemap.graph.serializer import serialize, write_json

console = Console()

_WATCHED_EXTENSIONS: frozenset[str] = frozenset({".ts", ".tsx", ".js", ".jsx"})


class _ReScanHandler(FileSystemEventHandler):
    def __init__(self, root: str, output: str, exclude: list[str]) -> None:
        super().__init__()
        self._root = root
        self._output = output
        self._exclude = exclude
        self._lock = threading.Lock()

    def _relevant(self, path: str) -> bool:
        return Path(path).suffix in _WATCHED_EXTENSIONS

    def _rescan(self) -> None:
        # Non-blocking acquire: if a rescan is already in progress, skip the
        # duplicate event rather than queuing up another identical run.
        if not self._lock.acquire(blocking=False):
            return
        try:
            files = discover_files(self._root, exclude=self._exclude or None)
            G = build_graph(self._root, files)
            analyze(G)
            out = serialize(G, self._root)
            write_json(out, self._output)
            s = out.stats
            console.print(
                f"[dim]↻[/dim]  Rescanned [bold]{len(files)}[/bold] files"
                f" — [cyan]{s.total_files}[/cyan] nodes,"
                f" [cyan]{s.total_edges}[/cyan] edges"
            )
        except Exception as exc:  # noqa: BLE001
            console.print(f"[red]Rescan error:[/red] {exc}")
        finally:
            self._lock.release()

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory and self._relevant(str(event.src_path)):
            self._rescan()

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory and self._relevant(str(event.src_path)):
            self._rescan()

    def on_deleted(self, event: FileSystemEvent) -> None:
        if not event.is_directory and self._relevant(str(event.src_path)):
            self._rescan()


def start_watch(root: str, output: str, exclude: list[str]) -> None:
    """Watch *root* and rewrite *output* whenever a source file changes.

    Blocks until a :exc:`KeyboardInterrupt` is received.
    """
    handler = _ReScanHandler(root, output, exclude)
    observer: BaseObserver = Observer()
    observer.schedule(handler, root, recursive=True)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
    console.print("\n[dim]Stopped.[/dim]")
