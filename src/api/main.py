"""Web UI evaluation API (real AgentEval backend with demo fallback markers)."""
from __future__ import annotations

import sqlite3

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .deps import get_repository
from .routers import datasets, reflections, reports, runs, state, targets


def create_app() -> FastAPI:
    app = FastAPI(title="AgentEval Web API", version="0.1.0")
    app.include_router(state.router)
    app.include_router(targets.router)
    app.include_router(datasets.router)
    app.include_router(runs.router)
    app.include_router(reports.router)
    app.include_router(reflections.router)

    @app.get("/healthz", include_in_schema=False)
    async def _health(request: Request) -> dict[str, str]:
        get_repository(request)
        return {"status": "ok"}

    @app.exception_handler(KeyError)
    async def _not_found(_request: Request, exc: KeyError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"error": f"not found: {exc}"})

    @app.exception_handler(ValueError)
    async def _bad_request(_request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    @app.exception_handler(NotImplementedError)
    async def _demo_only(_request: Request, _exc: NotImplementedError) -> JSONResponse:
        return JSONResponse(
            status_code=501, content={"error": "not implemented", "demo": True}
        )

    @app.exception_handler(sqlite3.IntegrityError)
    async def _conflict(_request: Request, exc: sqlite3.IntegrityError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"error": f"conflict: {exc}"})

    return app


app = create_app()
