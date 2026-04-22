"""Providers — list, configure, activate, test."""

from __future__ import annotations

import asyncio
import random

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import get_store

router = APIRouter(prefix="/providers", tags=["providers"])


class ConfigureRequest(BaseModel):
    id: str
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


class ActivateRequest(BaseModel):
    id: str


@router.get("")
async def list_providers() -> dict:
    store = get_store()
    providers = store.read("providers")
    active = store.read("settings")["active_provider"]
    return {"active": active, "providers": providers}


@router.post("/configure")
async def configure(body: ConfigureRequest) -> dict:
    store = get_store()

    def mutate(d):
        for p in d["providers"]:
            if p["id"] == body.id:
                if body.api_key is not None:
                    p["configured"] = bool(body.api_key.strip())
                    p["key_fingerprint"] = (
                        body.api_key[:4] + "…" + body.api_key[-4:]
                        if len(body.api_key) >= 10
                        else "…"
                    )
                if body.base_url is not None:
                    p["base_url"] = body.base_url
                if body.model is not None:
                    p["model"] = body.model
                return p
        raise HTTPException(404, f"provider {body.id} not found")

    return {"provider": store.mutate(mutate)}


@router.post("/active")
async def set_active(body: ActivateRequest) -> dict:
    store = get_store()

    def mutate(d):
        for p in d["providers"]:
            if p["id"] == body.id:
                d["settings"]["active_provider"] = body.id
                return body.id
        raise HTTPException(404, f"provider {body.id} not found")

    return {"active": store.mutate(mutate)}


@router.post("/test")
async def test_provider(body: ActivateRequest) -> dict:
    # simulate latency + probabilistic success (stubbed until real clients wired in)
    await asyncio.sleep(0.4)
    ok = body.id == "codex" or random.random() > 0.15
    return {"ok": ok, "latency_ms": random.randint(140, 520)}
