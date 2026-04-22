"""Hermes profiles — auto-detected via the local `hermes` CLI.

Profiles are independent Hermes instances (own model, gateway, skills, memory).
The user has one or more under `~/.hermes/profiles/<name>/`. We surface them
so the user can pick which one to talk to.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..hermes_paths import detect as detect_hermes
from ..store import get_store

router = APIRouter(prefix="/profiles", tags=["profiles"])

# Strip ANSI escape sequences (rich uses them for the table colors).
_ANSI = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def _hermes_cli() -> str | None:
    paths = detect_hermes()
    if paths and paths.launcher_bin:
        return str(paths.launcher_bin)
    return shutil.which("hermes")


def _run(args: list[str], timeout: float = 6.0) -> str | None:
    bin_ = _hermes_cli()
    if not bin_:
        return None
    try:
        out = subprocess.run(
            [bin_, *args],
            capture_output=True,
            timeout=timeout,
            text=True,
            check=False,
            env={"NO_COLOR": "1", "TERM": "dumb", **__import__("os").environ},
        )
        return _ANSI.sub("", (out.stdout or "") + "\n" + (out.stderr or ""))
    except Exception:
        return None


def _list_names() -> list[tuple[str, bool]]:
    """Return [(name, is_default)] from `hermes profile list`."""
    text = _run(["profile", "list"])
    if not text:
        return []
    out: list[tuple[str, bool]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # skip header / divider rows
        if line.startswith("Profile") or set(line) <= set("─-=  "):
            continue
        # leading mark for default profile
        is_default = "◆" in raw
        cleaned = line.lstrip("◆ ").lstrip()
        if not cleaned:
            continue
        # first whitespace-delimited token = profile name
        name = re.split(r"\s+", cleaned, maxsplit=1)[0]
        if name and name not in {"Profile"}:
            out.append((name, is_default))
    return out


def _parse_show(text: str) -> dict[str, str]:
    """Turn the multi-line `profile show` output into a dict."""
    info: dict[str, str] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        # normalize keys: strip surrounding dots/spaces and lowercase
        key = k.strip().lower().strip(".")
        info[key] = v.strip()
    return info


def _details(name: str) -> dict[str, Any]:
    text = _run(["profile", "show", name])
    info = _parse_show(text or "")
    model_full = info.get("model", "")
    # "gpt-5.4 (openai-codex)" → model + provider
    m = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", model_full)
    model, provider = (m.group(1), m.group(2)) if m else (model_full, "")
    return {
        "id": name,
        "name": name,
        "path": info.get("path", ""),
        "model": model,
        "provider": provider,
        "gateway": info.get("gateway", "unknown"),
        "skills": _to_int(info.get("skills")),
        "alias": info.get("alias", "").lstrip(),
        "has_env": info.get("env", "").lower() == "exists",
        "has_soul": info.get("soul md", "").lower() == "exists",
    }


def _to_int(v: str | None) -> int | None:
    if not v:
        return None
    try:
        return int(v.strip())
    except ValueError:
        return None


@router.get("")
async def list_profiles() -> dict:
    names = _list_names()
    if not names:
        return {"profiles": [], "active": None, "default": None, "available": False}

    profiles = [{**_details(n), "is_default": d} for (n, d) in names]
    settings = get_store().read("settings") or {}
    active = settings.get("active_profile")
    if not active or active not in [p["id"] for p in profiles]:
        active = next((p["id"] for p in profiles if p["is_default"]), profiles[0]["id"])
    default = next((p["id"] for p in profiles if p["is_default"]), None)
    return {"profiles": profiles, "active": active, "default": default, "available": True}


class UseRequest(BaseModel):
    id: str


@router.post("/use")
async def use_profile(body: UseRequest) -> dict:
    """Mark a profile as active in Stark's settings (does not change the
    Hermes sticky default — for that the user can use `hermes profile use`)."""
    store = get_store()

    def mutate(d: dict[str, Any]) -> str:
        names = [p["id"] for p in (d.get("profiles_cache") or [])]
        # We don't strictly validate against a cache here — accept any name
        # and let the next /profiles GET reconcile.
        d["settings"]["active_profile"] = body.id
        return body.id

    return {"active": store.mutate(mutate)}


@router.post("/refresh")
async def refresh() -> dict:
    """Force a re-list (no caching today; provided for parity / future use)."""
    return await list_profiles()
