"""Skills — real `hermes skills list` for the active profile, with local
toggle/run/create/remove kept as in-memory mutations on top of the live list.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import hermes_cli
from ..rate_limit import skill_install_rate_limit
from ..store import Store, get_store
from ..validation import safe_argv

router = APIRouter(prefix="/skills", tags=["skills"])


class CreateSkill(BaseModel):
    name: str = Field(max_length=200)
    trigger: str = Field(max_length=200)
    steps: list[str] = Field(max_length=64)


class InstallSkill(BaseModel):
    identifier: str = Field(max_length=200)


class AddTap(BaseModel):
    repo: str = Field(max_length=200)


def _toggle_state() -> dict[str, dict]:
    """Per-skill enabled/runs overlay so toggles persist locally."""
    return get_store().read("skill_overlay") or {}


def _save_overlay(overlay: dict) -> None:
    def mutate(d):
        d["skill_overlay"] = overlay
        return overlay

    get_store().mutate(mutate)


@router.get("")
async def list_skills(profile: str | None = Query(default=None)) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")

    if hermes_cli.available():
        live = hermes_cli.list_skills(prof)
        overlay = _toggle_state()
        for s in live:
            o = overlay.get(s["id"]) or {}
            s["enabled"] = bool(o.get("enabled", s.get("enabled", True)))
            s["runs"] = int(o.get("runs", s.get("runs", 0)))
            s["last_run"] = o.get("last_run") or s.get("last_run")
        # Pinned/local extras stored in the legacy seed key go on top.
        local = get_store().read("skills") or []
        custom = [{**s, "source": "app-local"} for s in local if s.get("source") in ("local", "app-local")]
        return {"skills": [*custom, *live], "real": True, "profile": prof}
    stored = get_store().read("skills") or []
    return {
        "skills": [{**s, "source": "app-local"} if s.get("source") == "local" else s for s in stored],
        "real": False,
        "profile": prof,
    }


@router.get("/marketplace")
async def marketplace(
    profile: str | None = Query(default=None),
    query: str | None = Query(default=None),
    source: str = Query(default="all"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")
    if not hermes_cli.available():
        local = get_store().read("skills") or []
        return {
            "skills": [s for s in local if s.get("source") == "marketplace"],
            "real": False,
            "profile": prof,
            "page": page,
            "pages": 1,
            "total": 0,
            "source": source,
        }
    try:
        if query and query.strip():
            payload = hermes_cli.search_skills(prof, query.strip(), limit=size, source=source)
            return {**payload, "real": True, "profile": prof, "page": 1, "pages": 1, "total": len(payload["skills"])}
        payload = hermes_cli.browse_skills(prof, page=page, size=size, source=source)
        return {**payload, "real": True, "profile": prof}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/marketplace/inspect")
async def inspect_marketplace_skill(
    identifier: str = Query(...),
    profile: str | None = Query(default=None),
) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")
    if not hermes_cli.available():
        raise HTTPException(status_code=503, detail="Engine CLI is not available.")
    try:
        return {**hermes_cli.inspect_skill(prof, identifier), "profile": prof}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/marketplace/install", dependencies=[Depends(skill_install_rate_limit())])
async def install_marketplace_skill(body: InstallSkill, profile: str | None = Query(default=None)) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")
    if not hermes_cli.available():
        raise HTTPException(status_code=503, detail="Engine CLI is not available.")
    identifier = safe_argv(body.identifier.strip(), field="identifier")
    try:
        return {**hermes_cli.install_skill(prof, identifier), "profile": prof}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/marketplace/taps")
async def add_marketplace_tap(body: AddTap, profile: str | None = Query(default=None)) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")
    if not hermes_cli.available():
        raise HTTPException(status_code=503, detail="Engine CLI is not available.")
    repo = body.repo.strip()
    if not repo or "/" not in repo or repo.startswith("/") or repo.endswith("/"):
        raise HTTPException(status_code=400, detail="Enter a GitHub repo as owner/repo.")
    repo = safe_argv(repo, field="repo")
    try:
        return {**hermes_cli.add_skill_tap(prof, repo), "profile": prof}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("")
async def create(body: CreateSkill) -> dict:
    """Create a *local* skill recorded in our store. Real skill installation
    via `hermes skills install` is left to the CLI for now."""
    store = get_store()

    def mutate(d):
        skill = {
            "id": Store.new_id("skl"),
            "name": body.name,
            "trigger": body.trigger,
            "steps": body.steps,
            "enabled": True,
            "runs": 0,
            "last_run": None,
            "created_at": int(time.time()),
            "source": "app-local",
        }
        d["skills"].insert(0, skill)
        return skill

    return {"skill": store.mutate(mutate)}


@router.post("/{skill_id}/toggle")
async def toggle(skill_id: str) -> dict:
    overlay = _toggle_state()
    cur = overlay.get(skill_id) or {}
    cur["enabled"] = not bool(cur.get("enabled", True))
    overlay[skill_id] = cur
    _save_overlay(overlay)
    # Also flip in the in-store list if it lives there (local skills).
    store = get_store()

    def mutate(d):
        for s in d.get("skills", []):
            if s["id"] == skill_id:
                s["enabled"] = cur["enabled"]
                return s
        return None

    store.mutate(mutate)
    return {"skill": {"id": skill_id, "enabled": cur["enabled"]}}


@router.post("/{skill_id}/run")
async def run(skill_id: str) -> dict:
    overlay = _toggle_state()
    cur = overlay.get(skill_id) or {}
    cur["runs"] = int(cur.get("runs", 0)) + 1
    cur["last_run"] = int(time.time())
    overlay[skill_id] = cur
    _save_overlay(overlay)
    store = get_store()

    def mutate(d):
        for s in d.get("skills", []):
            if s["id"] == skill_id:
                s["runs"] = cur["runs"]
                s["last_run"] = cur["last_run"]
                return s
        return None

    store.mutate(mutate)
    return {"skill": {"id": skill_id, **cur}}


@router.delete("/{skill_id}")
async def remove(skill_id: str) -> dict:
    store = get_store()

    def mutate(d):
        before = len(d.get("skills", []))
        d["skills"] = [s for s in d.get("skills", []) if s["id"] != skill_id]
        if len(d["skills"]) == before:
            # not a local skill — strip from overlay so the live skill drops back to defaults
            overlay = d.get("skill_overlay") or {}
            overlay.pop(skill_id, None)
            d["skill_overlay"] = overlay
        return {"removed": skill_id}

    return store.mutate(mutate)
