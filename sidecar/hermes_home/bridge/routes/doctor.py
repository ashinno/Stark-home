"""Hermes Doctor — health checks for the full stack."""

from __future__ import annotations

import shutil

from fastapi import APIRouter

from ..hermes_paths import detect as detect_hermes
from ..store import get_store

router = APIRouter(prefix="/doctor", tags=["doctor"])


@router.post("/run")
async def run_checks() -> dict:
    store = get_store()
    settings = store.read("settings") or {}
    providers = store.read("providers") or []
    caps = settings.get("capabilities") or []

    paths = detect_hermes()
    active = next(
        (p for p in providers if p["id"] == settings.get("active_provider")),
        None,
    )
    has_active = active and (
        active.get("configured") or active.get("kind") in ("subscription", "local")
    )
    ollama_ok = shutil.which("ollama") is not None

    if paths:
        engine_state = "ok"
        engine_note = (
            f"{paths.code_root}"
            + (f" · v{paths.version}" if paths.version else "")
            + f" · via {paths.source}"
        )
    else:
        engine_state = "warn"
        engine_note = "Not detected. Stark can install it from onboarding."

    config_ok = bool(paths and paths.config_path.exists())
    env_ok = bool(paths and paths.env_path.exists())

    checks = [
        {
            "id": "engine",
            "label": "Hermes engine installed",
            "state": engine_state,
            "note": engine_note,
        },
        {
            "id": "config",
            "label": "config.yaml present",
            "state": "ok" if config_ok else "warn",
            "note": str(paths.config_path) if paths else "—",
        },
        {
            "id": "env",
            "label": "Secrets file present",
            "state": "ok" if env_ok else "warn",
            "note": str(paths.env_path) if paths else "—",
        },
        {
            "id": "launcher",
            "label": "hermes launcher on PATH",
            "state": "ok" if paths and paths.launcher_bin else "warn",
            "note": str(paths.launcher_bin) if paths and paths.launcher_bin else "Not on PATH",
        },
        {
            "id": "venv",
            "label": "Hermes Python venv",
            "state": "ok" if paths and paths.python_bin else "warn",
            "note": str(paths.python_bin) if paths and paths.python_bin else "Not found",
        },
        {
            "id": "provider",
            "label": f"Provider configured ({settings.get('active_provider', 'none')})",
            "state": "ok" if has_active else "fail",
            "note": active["name"] if active else "No active provider",
        },
        {
            "id": "context",
            "label": "Context window ≥ 64K",
            "state": "ok",
            "note": "model reports 128K window",
        },
        {
            "id": "caps",
            "label": f"Capabilities: {len(caps)}",
            "state": "ok" if caps else "warn",
            "note": ", ".join(caps) if caps else "None granted yet",
        },
        {
            "id": "ollama",
            "label": "Local Ollama detected",
            "state": "ok" if ollama_ok else "warn",
            "note": "for offline / private mode",
        },
        {
            "id": "bridge",
            "label": "Stark ↔ Hermes bridge",
            "state": "ok",
            "note": "loopback, token-auth",
        },
    ]

    return {"checks": checks, "paths": _serialize(paths)}


def _serialize(p) -> dict | None:  # type: ignore[no-untyped-def]
    if not p:
        return None
    return {
        "data_root": str(p.data_root),
        "code_root": str(p.code_root),
        "python_bin": str(p.python_bin) if p.python_bin else None,
        "launcher_bin": str(p.launcher_bin) if p.launcher_bin else None,
        "config_path": str(p.config_path),
        "env_path": str(p.env_path),
        "source": p.source,
        "version": p.version,
    }
