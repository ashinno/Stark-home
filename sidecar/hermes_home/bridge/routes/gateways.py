"""Gateways — real per-profile state from ~/.hermes/.env + gateway_state.json.

Reads the actual env files (profile-specific overrides global) plus the live
gateway state file written by the Hermes gateway daemon. The configure POST
writes back to the profile's `.env`.
"""

from __future__ import annotations

import subprocess
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import gateway_probe, hermes_cli
from ..store import get_store

router = APIRouter(prefix="/gateways", tags=["gateways"])


def _resolve_profile(profile: str | None) -> str | None:
    if profile is not None:
        return profile
    settings = get_store().read("settings") or {}
    return settings.get("active_profile")


@router.get("")
async def list_gateways(profile: str | None = Query(default=None)) -> dict[str, Any]:
    prof = _resolve_profile(profile)
    return {
        "gateways": gateway_probe.list_gateways(prof),
        "daemon": gateway_probe.gateway_running(prof),
        "profile": prof,
        "real": True,
    }


class ConfigureGateway(BaseModel):
    config: dict[str, str]


@router.post("/{name}/configure")
async def configure(
    name: str,
    body: ConfigureGateway,
    profile: str | None = Query(default=None),
) -> dict[str, Any]:
    prof = _resolve_profile(profile)
    # Validate the gateway exists in our channel registry.
    valid_keys = {
        f.key
        for ch in gateway_probe.CHANNELS
        if ch.id == name
        for f in ch.fields
    }
    if not valid_keys:
        raise HTTPException(404, f"unknown gateway: {name}")
    # Strip empty strings so deletions are explicit. Drop unknown keys.
    cleaned = {k: v for k, v in body.config.items() if k in valid_keys and v != ""}
    if not cleaned:
        raise HTTPException(400, "no recognized non-empty fields")
    written = gateway_probe.write_env_keys(prof, cleaned)
    return {
        "saved_to": str(written),
        "gateway": next(g for g in gateway_probe.list_gateways(prof) if g["id"] == name),
    }


@router.post("/{name}/start")
async def start(name: str, profile: str | None = Query(default=None)) -> dict[str, Any]:
    """Trigger `hermes [-p profile] gateway restart` so the new env is picked up."""
    prof = _resolve_profile(profile)
    bin_ = hermes_cli.cli_path()
    if not bin_:
        raise HTTPException(503, "hermes CLI not available")
    args = [bin_]
    if prof and prof != "default":
        args += ["-p", prof]
    args += ["gateway", "restart"]
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=20)
    except Exception as e:
        raise HTTPException(500, f"restart failed: {e}")
    return {
        "ok": out.returncode == 0,
        "stdout": (out.stdout or "")[-200:],
        "stderr": (out.stderr or "")[-200:],
        "gateway": next((g for g in gateway_probe.list_gateways(prof) if g["id"] == name), None),
    }


@router.post("/{name}/stop")
async def stop(name: str, profile: str | None = Query(default=None)) -> dict[str, Any]:
    """Stop the entire gateway daemon (Hermes doesn't expose per-channel stop today)."""
    prof = _resolve_profile(profile)
    bin_ = hermes_cli.cli_path()
    if not bin_:
        raise HTTPException(503, "hermes CLI not available")
    args = [bin_]
    if prof and prof != "default":
        args += ["-p", prof]
    args += ["gateway", "stop"]
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=15)
    except Exception as e:
        raise HTTPException(500, f"stop failed: {e}")
    return {
        "ok": out.returncode == 0,
        "stdout": (out.stdout or "")[-200:],
        "stderr": (out.stderr or "")[-200:],
        "name": name,
    }
