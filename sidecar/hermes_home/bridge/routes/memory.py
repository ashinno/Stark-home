"""Memory — sessions, search, pinned notes, profile."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import Store, get_store

router = APIRouter(prefix="/memory", tags=["memory"])


class CreateNote(BaseModel):
    text: str


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

    def mutate(d):
        note = {"id": Store.new_id("note"), "text": body.text}
        d["pinned_notes"].insert(0, note)
        return note

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
