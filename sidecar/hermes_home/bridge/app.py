"""FastAPI app factory for the Stark ↔ Hermes sidecar bridge.

Each route in `routes/` is a thin adapter over functions from the user's
existing hermes-agent install (auto-detected by Stark) — or a stub when the
engine isn't installed yet.
"""

from __future__ import annotations

import os
import signal

from fastapi import Depends, FastAPI

from .acp_client import get_pool
from .auth import make_verifier
from .routes import (
    backends,
    chat,
    doctor,
    gateways,
    home,
    mcp,
    memory,
    profiles,
    providers,
    scheduler,
    sessions,
    settings as settings_routes,
    skills,
)


def create_app(token: str) -> FastAPI:
    verify = make_verifier(token)
    app = FastAPI(title="Stark bridge", version="0.1.0")

    app.include_router(chat.router, dependencies=[Depends(verify)])
    app.include_router(providers.router, dependencies=[Depends(verify)])
    app.include_router(skills.router, dependencies=[Depends(verify)])
    app.include_router(memory.router, dependencies=[Depends(verify)])
    app.include_router(gateways.router, dependencies=[Depends(verify)])
    app.include_router(scheduler.router, dependencies=[Depends(verify)])
    app.include_router(backends.router, dependencies=[Depends(verify)])
    app.include_router(mcp.router, dependencies=[Depends(verify)])
    app.include_router(settings_routes.router, dependencies=[Depends(verify)])
    app.include_router(home.router, dependencies=[Depends(verify)])
    app.include_router(doctor.router, dependencies=[Depends(verify)])
    app.include_router(profiles.router, dependencies=[Depends(verify)])
    app.include_router(sessions.router, dependencies=[Depends(verify)])

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/shutdown", dependencies=[Depends(verify)])
    async def shutdown() -> dict[str, str]:
        # Close any persistent ACP children before the interpreter tears down,
        # otherwise they keep holding their parent session db and stderr pipes.
        try:
            await get_pool().shutdown()
        except Exception:
            pass
        # Request a graceful uvicorn shutdown; Electron waits for this.
        os.kill(os.getpid(), signal.SIGINT)
        return {"status": "shutting-down"}

    @app.on_event("shutdown")
    async def _close_acp_pool() -> None:
        # Also covers SIGINT/SIGTERM paths that skip the /shutdown route.
        try:
            await get_pool().shutdown()
        except Exception:
            pass

    return app
