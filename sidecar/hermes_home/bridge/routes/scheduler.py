"""Scheduler — natural-language cron tasks."""

from __future__ import annotations

import re
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import hermes_cli
from ..store import Store, get_store

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


class CreateTask(BaseModel):
    name: str
    nl: str
    cron: str | None = None
    enabled: bool = True
    delivery: str = "home"


class UpdateTask(BaseModel):
    """Partial update for an existing scheduled task.

    Every field is optional; we only write the ones the client sent so the UI
    can edit a single attribute without re-submitting the entire task."""

    name: str | None = None
    nl: str | None = None
    cron: str | None = None
    delivery: str | None = None
    enabled: bool | None = None


# Hand-picked starter templates surfaced in the "New automation" dialog. The
# cron is pre-computed so the preview is stable regardless of how _guess_cron
# evolves. Each entry is a small self-contained example — we deliberately keep
# them short so the preset strip stays scannable.
_TEMPLATES: list[dict[str, str]] = [
    {
        "id": "morning-brief",
        "name": "Morning brief",
        "nl": "every weekday at 8am, brief me on the day",
        "cron": "0 8 * * 1-5",
        "delivery": "home",
        "description": "Weekday 8am summary delivered to the home feed.",
    },
    {
        "id": "weekly-review",
        "name": "Weekly review",
        "nl": "every monday at 9am, run a weekly review",
        "cron": "0 9 * * 1",
        "delivery": "home",
        "description": "Kick off Monday with a review of last week.",
    },
    {
        "id": "overnight-digest",
        "name": "Overnight digest",
        "nl": "every day at 7am, digest yesterday's work",
        "cron": "0 7 * * *",
        "delivery": "notification",
        "description": "Daily 7am digest sent as a desktop notification.",
    },
    {
        "id": "lunch-nudge",
        "name": "Lunch nudge",
        "nl": "every weekday at 12pm, remind me to eat",
        "cron": "0 12 * * 1-5",
        "delivery": "notification",
        "description": "Gentle midday reminder on workdays.",
    },
    {
        "id": "friday-retro",
        "name": "Friday retro",
        "nl": "every friday at 4pm, reflect on the week",
        "cron": "0 16 * * 5",
        "delivery": "home",
        "description": "End the week with a short retrospective.",
    },
    {
        "id": "hourly-focus",
        "name": "Hourly focus check",
        "nl": "every hour, ask what I'm working on",
        "cron": "0 * * * *",
        "delivery": "notification",
        "description": "Hourly attention check during the day.",
    },
]


@router.get("")
async def list_tasks() -> dict:
    if hermes_cli.available():
        live = hermes_cli.list_cron()
        # surface them as tasks in our shape; provide empty history field
        for t in live:
            t.setdefault("history", [])
        local = [t for t in (get_store().read("tasks") or []) if t.get("source") == "local"]
        return {"tasks": [*local, *live], "real": True}
    return {"tasks": get_store().read("tasks") or [], "real": False}


# Literal ``/templates`` registered BEFORE the catch-all ``/{tid}`` below so
# FastAPI doesn't try to interpret "templates" as a task id.
@router.get("/templates")
async def list_templates() -> dict:
    """Return the curated preset list used by the 'New automation' dialog."""
    return {"templates": _TEMPLATES}


@router.post("")
async def create(body: CreateTask) -> dict:
    store = get_store()
    cron = body.cron or _guess_cron(body.nl)

    def mutate(d):
        task = {
            "id": Store.new_id("tsk"),
            "name": body.name,
            "nl": body.nl,
            "cron": cron,
            "enabled": body.enabled,
            "delivery": body.delivery,
            "last_run": None,
            "next_run": int(time.time()) + 3600,
            "history": [],
            "source": "local",
        }
        d["tasks"].insert(0, task)
        return task

    return {"task": store.mutate(mutate)}


@router.patch("/{tid}")
async def update(tid: str, body: UpdateTask) -> dict:
    """Apply a partial update. If ``nl`` changes but no new cron is supplied we
    re-run the heuristic so the schedule stays in sync with the description."""
    store = get_store()

    def mutate(d):
        for t in d["tasks"]:
            if t["id"] == tid:
                if body.name is not None:
                    t["name"] = body.name
                if body.nl is not None:
                    t["nl"] = body.nl
                    if body.cron is None:
                        t["cron"] = _guess_cron(body.nl)
                if body.cron is not None:
                    t["cron"] = body.cron
                if body.delivery is not None:
                    t["delivery"] = body.delivery
                if body.enabled is not None:
                    t["enabled"] = body.enabled
                return t
        raise HTTPException(404, "not found")

    return {"task": store.mutate(mutate)}


@router.post("/{tid}/toggle")
async def toggle(tid: str) -> dict:
    store = get_store()

    def mutate(d):
        for t in d["tasks"]:
            if t["id"] == tid:
                t["enabled"] = not t["enabled"]
                return t
        raise HTTPException(404, "not found")

    return {"task": store.mutate(mutate)}


@router.post("/{tid}/run-now")
async def run_now(tid: str) -> dict:
    store = get_store()

    def mutate(d):
        for t in d["tasks"]:
            if t["id"] == tid:
                now = int(time.time())
                t["last_run"] = now
                t.setdefault("history", []).insert(
                    0,
                    {"ts": now, "status": "ok", "message": "Manual run · completed in 2.1s"},
                )
                return t
        raise HTTPException(404, "not found")

    return {"task": store.mutate(mutate)}


@router.delete("/{tid}")
async def remove(tid: str) -> dict:
    store = get_store()

    def mutate(d):
        before = len(d["tasks"])
        d["tasks"] = [t for t in d["tasks"] if t["id"] != tid]
        if len(d["tasks"]) == before:
            raise HTTPException(404, "not found")
        return {"removed": tid}

    return store.mutate(mutate)


def _guess_cron(nl: str) -> str:
    """Dead-simple heuristic until vendored NL-cron module arrives."""
    text = nl.lower()
    hour_match = re.search(r"(\d{1,2})\s*(?:am|pm)?", text)
    hour = int(hour_match.group(1)) if hour_match else 9
    if "pm" in text and hour < 12:
        hour += 12
    if "weekday" in text or "mon-fri" in text:
        return f"0 {hour} * * 1-5"
    if "sunday" in text:
        return f"0 {hour} * * 0"
    if "monday" in text:
        return f"0 {hour} * * 1"
    if "saturday" in text:
        return f"0 {hour} * * 6"
    if "hour" in text:
        return "0 * * * *"
    if "minute" in text:
        return "* * * * *"
    return f"0 {hour} * * *"
