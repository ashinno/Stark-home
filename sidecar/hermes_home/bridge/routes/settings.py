"""Stark-wide settings: user name, provider, setup mode, safety, capabilities, onboarded."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..store import get_store

router = APIRouter(prefix="/settings", tags=["settings"])


class PatchSettings(BaseModel):
    user_name: str | None = None
    active_provider: str | None = None
    active_profile: str | None = None
    setup_mode: str | None = None
    safety_preset: str | None = None
    capabilities: list[str] | None = None
    onboarded: bool | None = None


@router.get("")
async def read() -> dict:
    return {"settings": get_store().read("settings")}


@router.patch("")
async def patch(body: PatchSettings) -> dict:
    store = get_store()

    def mutate(d):
        s = d["settings"]
        for k, v in body.model_dump(exclude_none=True).items():
            s[k] = v
        return s

    return {"settings": store.mutate(mutate)}
