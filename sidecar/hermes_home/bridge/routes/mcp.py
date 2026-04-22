"""MCP servers — list, add, remove, toggle.

Reads `hermes mcp list` for the live set; in-store entries are added on top.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import hermes_cli
from ..store import Store, get_store

router = APIRouter(prefix="/mcp", tags=["mcp"])


class CreateMcp(BaseModel):
    name: str
    url: str


@router.get("")
async def list_servers() -> dict:
    if hermes_cli.available():
        live = hermes_cli.list_mcp()
        local = get_store().read("mcp_servers") or []
        return {"servers": [*local, *live], "real": True}
    return {"servers": get_store().read("mcp_servers") or [], "real": False}


@router.post("")
async def add(body: CreateMcp) -> dict:
    store = get_store()

    def mutate(d):
        srv = {
            "id": Store.new_id("mcp"),
            "name": body.name,
            "url": body.url,
            "enabled": True,
            "tools": 0,
        }
        d["mcp_servers"].insert(0, srv)
        return srv

    return {"server": store.mutate(mutate)}


@router.post("/{sid}/toggle")
async def toggle(sid: str) -> dict:
    store = get_store()

    def mutate(d):
        for s in d["mcp_servers"]:
            if s["id"] == sid:
                s["enabled"] = not s["enabled"]
                return s
        raise HTTPException(404, "not found")

    return {"server": store.mutate(mutate)}


@router.delete("/{sid}")
async def remove(sid: str) -> dict:
    store = get_store()

    def mutate(d):
        before = len(d["mcp_servers"])
        d["mcp_servers"] = [s for s in d["mcp_servers"] if s["id"] != sid]
        if len(d["mcp_servers"]) == before:
            raise HTTPException(404, "not found")
        return {"removed": sid}

    return store.mutate(mutate)
