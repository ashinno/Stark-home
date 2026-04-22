"""Skills — real `hermes skills list` for the active profile, with local
toggle/run/create/remove kept as in-memory mutations on top of the live list.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import hermes_cli
from ..store import Store, get_store

router = APIRouter(prefix="/skills", tags=["skills"])


class CreateSkill(BaseModel):
    name: str
    trigger: str
    steps: list[str]


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
        custom = [s for s in local if s.get("source") == "local"]
        return {"skills": [*custom, *live], "real": True, "profile": prof}
    return {"skills": get_store().read("skills") or [], "real": False, "profile": prof}


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
            "source": "local",
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
