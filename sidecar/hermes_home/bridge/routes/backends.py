"""Terminal backends — local/docker/ssh/daytona/modal."""

from __future__ import annotations

import asyncio
import random

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import get_store

router = APIRouter(prefix="/backends", tags=["backends"])


class ConfigureBackend(BaseModel):
    config: dict[str, str]


@router.get("")
async def list_backends() -> dict:
    return {"backends": get_store().read("backends")}


@router.post("/{bid}/configure")
async def configure(bid: str, body: ConfigureBackend) -> dict:
    store = get_store()

    def mutate(d):
        for b in d["backends"]:
            if b["id"] == bid:
                b["config"] = body.config
                return b
        raise HTTPException(404, "not found")

    return {"backend": store.mutate(mutate)}


@router.post("/{bid}/activate")
async def activate(bid: str) -> dict:
    store = get_store()

    def mutate(d):
        found = False
        for b in d["backends"]:
            if b["id"] == bid:
                b["active"] = True
                found = True
            else:
                b["active"] = False
        if not found:
            raise HTTPException(404, "not found")
        return {"active": bid}

    return store.mutate(mutate)


@router.post("/{bid}/test")
async def test(bid: str) -> dict:
    await asyncio.sleep(0.3)
    ok = bid == "local" or random.random() > 0.2
    return {"ok": ok, "latency_ms": random.randint(30, 380)}
