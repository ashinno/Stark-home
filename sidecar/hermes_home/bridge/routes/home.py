"""Home dashboard endpoints — threads, approvals, jobs, suggestions, agent pause.

`/threads` reads real Hermes sessions for the active profile when the CLI is
present; falls back to the seeded sample only when Hermes isn't installed.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from .. import hermes_cli
from ..store import get_store

router = APIRouter(tags=["home"])


@router.get("/threads")
async def list_threads(profile: str | None = Query(default=None)) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")
    if hermes_cli.available():
        sessions = hermes_cli.list_sessions(prof)
        # cap to 50 most recent so the UI loads fast
        sessions.sort(key=lambda t: t.get("updated_at", 0), reverse=True)
        return {"threads": sessions[:50], "real": True, "profile": prof}
    items = get_store().read("threads") or []
    items.sort(key=lambda t: t.get("updated_at", 0), reverse=True)
    return {"threads": items, "real": False, "profile": prof}


@router.get("/approvals")
async def list_approvals() -> dict:
    return {"approvals": get_store().read("approvals") or []}


@router.get("/jobs")
async def list_jobs() -> dict:
    return {"jobs": get_store().read("jobs") or []}


@router.get("/suggestions")
async def list_suggestions() -> dict:
    return {"suggestions": get_store().read("suggestions") or []}


@router.post("/agents/pause")
async def pause_agents() -> dict:
    return {"paused": True}
