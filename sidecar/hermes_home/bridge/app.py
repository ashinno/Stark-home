"""FastAPI app factory for the Stark ↔ Hermes sidecar bridge.

Each route in `routes/` is a thin adapter over functions from the user's
existing hermes-agent install (auto-detected by Stark) — or a stub when the
engine isn't installed yet.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import time

from fastapi import Depends, FastAPI

from . import hermes_cli
from .acp_client import get_daemon_status, get_pool
from .auth import make_origin_verifier, make_verifier
from .routes import (
    backends,
    chat,
    daemon as daemon_routes,
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
    system,
)
from .store import get_store

logger = logging.getLogger(__name__)


def create_app(token: str, renderer_origin: str) -> FastAPI:
    # The renderer-origin nonce is required. If ``__main__`` didn't get one
    # from the parent process it synthesises one itself, so ``renderer_origin``
    # is always a non-empty string here and the verifier is always strict.
    verify = make_verifier(token)
    verify_origin = make_origin_verifier(renderer_origin)
    app = FastAPI(title="Stark bridge", version="0.1.0")

    # Expose the origin verifier to routes that need finer-grained gating at
    # the operation level (we also wrap mutating routers wholesale below).
    app.state.verify_origin = verify_origin

    # Read routers: token only.
    app.include_router(chat.router, dependencies=[Depends(verify)])
    app.include_router(providers.router, dependencies=[Depends(verify)])
    app.include_router(memory.router, dependencies=[Depends(verify)])
    app.include_router(home.router, dependencies=[Depends(verify)])
    app.include_router(doctor.router, dependencies=[Depends(verify)])
    app.include_router(sessions.router, dependencies=[Depends(verify)])
    app.include_router(daemon_routes.router, dependencies=[Depends(verify)])

    # Mutating routers: token + renderer-origin nonce. A compromised skill /
    # MCP server inside the agent's process tree has the token (it has to, to
    # talk to the bridge at all) but does NOT have the nonce because
    # ``sanitized_env`` strips it before spawn.
    mutating_deps = [Depends(verify), Depends(verify_origin)]
    app.include_router(skills.router, dependencies=mutating_deps)
    app.include_router(gateways.router, dependencies=mutating_deps)
    app.include_router(scheduler.router, dependencies=mutating_deps)
    app.include_router(backends.router, dependencies=mutating_deps)
    app.include_router(mcp.router, dependencies=mutating_deps)
    app.include_router(settings_routes.router, dependencies=mutating_deps)
    app.include_router(profiles.router, dependencies=mutating_deps)
    app.include_router(system.router, dependencies=mutating_deps)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.on_event("startup")
    async def _prewarm_default() -> None:
        # Eagerly instantiate the pool + daemon status singletons from inside
        # the running loop so their internal ``asyncio.Lock`` binds to it.
        get_pool()
        get_daemon_status()
        # Fire-and-forget: the startup event runs before uvicorn prints
        # ``PORT=…`` and awaiting a 3-5s cold-start here would stall the
        # sidecar's "ready" signal. The pool's ``_lock`` already serialises
        # concurrent ``get()`` calls, so a racing /chat/stream will wait
        # rather than spawn a duplicate subprocess.
        asyncio.create_task(_run_prewarm(), name="stark-daemon-prewarm")

    @app.post("/shutdown", dependencies=[Depends(verify), Depends(verify_origin)])
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


async def _run_prewarm() -> None:
    """Warm the ACP client for the active/default profile.

    Failure modes (in precedence order):
    - Engine not installed → no-op silently; chat falls through to stub.
    - Store unreadable → warm the __default__ slot anyway; the UI renders
      ``engine · warming`` for a moment then flips to ``warm``.
    - ``pool.get()`` raises → record on ``DaemonStatus.last_prewarm_error``
      for the UI to surface, don't crash startup.
    """
    from .acp_client import PrewarmError  # local: avoids circular import at module load

    status = get_daemon_status()
    cli = hermes_cli.cli_path()
    if not cli:
        return

    try:
        settings = get_store().read("settings") or {}
        profile = settings.get("active_profile") if isinstance(settings, dict) else None
    except Exception:
        profile = None

    key = profile or "default"
    status.warming_profiles.append(key)
    status.cold_start_in_flight = True
    try:
        await get_pool().get(cli, profile)
        status.last_prewarm_at = int(time.time())
        status.last_prewarm_error = None
        logger.info("Stark daemon: prewarmed profile=%s", key)
    except Exception as exc:
        status.last_prewarm_error = PrewarmError(
            profile=profile, error=str(exc), at=int(time.time())
        )
        status.last_prewarm_at = int(time.time())
        logger.warning("Stark daemon: prewarm failed for %s: %s", key, exc)
    finally:
        if key in status.warming_profiles:
            status.warming_profiles.remove(key)
        status.cold_start_in_flight = bool(status.warming_profiles)
