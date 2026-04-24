"""Memory — sessions, search, pinned notes, profile."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..store import Store, get_store

router = APIRouter(prefix="/memory", tags=["memory"])


class CreateNote(BaseModel):
    text: str = Field(max_length=32_000)


class UpdateNote(BaseModel):
    text: str = Field(max_length=32_000)


@router.get("/sessions")
async def sessions() -> dict:
    items = get_store().read("sessions")
    items.sort(key=lambda s: s.get("created_at", 0), reverse=True)
    return {"sessions": items}


@router.post("/sessions/{sid}/pin")
async def toggle_pin(sid: str) -> dict:
    store = get_store()

    def mutate(d):
        for s in d["sessions"]:
            if s["id"] == sid:
                s["pinned"] = not s.get("pinned", False)
                return s
        raise HTTPException(404, "not found")

    return {"session": store.mutate(mutate)}


@router.delete("/sessions/{sid}")
async def delete_session(sid: str) -> dict:
    store = get_store()

    def mutate(d):
        before = len(d["sessions"])
        d["sessions"] = [s for s in d["sessions"] if s["id"] != sid]
        if len(d["sessions"]) == before:
            raise HTTPException(404, "not found")
        return {"removed": sid}

    return store.mutate(mutate)


@router.get("/search")
async def search(q: str) -> dict:
    q_lower = q.lower()
    items = get_store().read("sessions")
    results = [
        s
        for s in items
        if q_lower in s.get("title", "").lower() or q_lower in s.get("preview", "").lower()
    ]
    return {"q": q, "results": results}


@router.get("/notes")
async def notes() -> dict:
    return {"notes": get_store().read("pinned_notes")}


@router.post("/notes")
async def add_note(body: CreateNote) -> dict:
    store = get_store()
    now = int(time.time())

    def mutate(d):
        note = {
            "id": Store.new_id("note"),
            "text": body.text,
            "created_at": now,
            "updated_at": now,
        }
        d["pinned_notes"].insert(0, note)
        return note

    return {"note": store.mutate(mutate)}


# Literal ``/notes/export`` is registered BEFORE the ``{nid}`` catch-all so
# FastAPI can't accidentally treat "export" as a note id.
@router.get("/notes/export")
async def export_notes() -> dict:
    """Return all pinned notes plus a snapshot timestamp. Clients can dump
    this to a file for backup or portability."""
    notes = get_store().read("pinned_notes")
    return {
        "exported_at": int(time.time()),
        "count": len(notes),
        "notes": notes,
    }


@router.patch("/notes/{nid}")
async def update_note(nid: str, body: UpdateNote) -> dict:
    """Update the text of an existing pinned note in-place. Bumps ``updated_at``
    so the UI can show a ``(edited)`` tag without wiping the original
    ``created_at``."""
    store = get_store()
    now = int(time.time())

    def mutate(d):
        for n in d["pinned_notes"]:
            if n["id"] == nid:
                n["text"] = body.text
                n["updated_at"] = now
                # Back-fill ``created_at`` for notes saved before we started
                # tracking it; otherwise the UI would see ``undefined``.
                n.setdefault("created_at", now)
                return n
        raise HTTPException(404, "not found")

    return {"note": store.mutate(mutate)}


@router.delete("/notes/{nid}")
async def delete_note(nid: str) -> dict:
    store = get_store()

    def mutate(d):
        before = len(d["pinned_notes"])
        d["pinned_notes"] = [n for n in d["pinned_notes"] if n["id"] != nid]
        if len(d["pinned_notes"]) == before:
            raise HTTPException(404, "not found")
        return {"removed": nid}

    return store.mutate(mutate)
