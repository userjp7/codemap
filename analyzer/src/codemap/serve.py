"""HTTP server exposing the codemap graph over a REST API."""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from codemap.discovery import discover_files
from codemap.graph.analyzer import analyze
from codemap.graph.builder import build_graph
from codemap.graph.serializer import serialize


def start_serve(root: str, port: int, exclude: list[str]) -> None:
    """Start a FastAPI server with /graph and /health endpoints.

    Blocks until the server is stopped.

    Args:
        root:    Absolute path to the project root to scan.
        port:    TCP port to listen on.
        exclude: Extra glob patterns forwarded to :func:`~codemap.discovery.discover_files`.
    """
    app = FastAPI(title="codemap", docs_url=None, redoc_url=None)

    @app.get("/graph")
    async def get_graph() -> JSONResponse:
        files = discover_files(root, exclude=exclude or None)
        G = build_graph(root, files)
        analyze(G)
        out = serialize(G, root)
        return JSONResponse(
            content=out.model_dump(by_alias=True),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/health")
    async def get_health() -> dict[str, str]:
        return {"status": "ok", "root": root}

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
