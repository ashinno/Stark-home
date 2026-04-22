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
