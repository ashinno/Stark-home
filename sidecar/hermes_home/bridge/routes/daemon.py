"""Daemon status + prewarm endpoints.

Stark's chat uses a long-lived ``hermes acp`` child per profile. The pool
is already kept alive for the sidecar's lifetime; these routes expose the
warm state to the UI and let it re-warm a profile on demand (e.g. after
the user switches profiles in Settings).
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import hermes_cli
from ..acp_client import get_daemon_status, get_pool
from ..rate_limit import prewarm_rate_limit
from ..store import get_store
from ..validation import safe_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/daemon", tags=["daemon"])


def _active_profile() -> Optional[str]:
    settings = get_store().read("settings") or {}
    prof = settings.get("active_profile")
    return prof if isinstance(prof, str) and prof else None


def _status_payload() -> dict[str, Any]:
    status = get_daemon_status()
    pool = get_pool()
    cli = hermes_cli.cli_path()
    err = status.last_prewarm_error
    return {
        "running": True,
        "active_profile": _active_profile(),
        "engine": {
            "installed": cli is not None,
            "cli_path": cli,
        },
        "warm_profiles": pool.warm_profiles(),
        "warming_profiles": list(status.warming_profiles),
        "cold_start_in_flight": status.cold_start_in_flight,
        "last_prewarm_at": status.last_prewarm_at,
        "last_prewarm_error": (
            {"profile": err.profile, "error": err.error, "at": err.at}
            if err is not None
            else None
        ),
    }


@router.get("/status")
async def daemon_status() -> dict[str, Any]:
    return _status_payload()


class PrewarmRequest(BaseModel):
    profile: str | None = None


@router.post("/prewarm", dependencies=[Depends(prewarm_rate_limit())])
async def daemon_prewarm(body: PrewarmRequest | None = None) -> dict[str, Any]:
    """Force-warm the ACP client for ``profile`` (or the active one).

    Returns quickly — the heavy work is the first turn of ``hermes acp``,
    which the pool's ``get()`` already handles. Safe to call repeatedly:
    if the client is alive, ``was_warm`` is true and no work is done.
    """
    cli = hermes_cli.cli_path()
    if not cli:
        # Engine not installed: chat still works via the stub path, but
        # there's literally nothing to warm.
        return {"ok": False, "error": "engine-not-installed"}

    # Prewarm takes a profile name that must later be safe in argv / paths.
    requested = body.profile if body else None
    profile = safe_profile(requested) if requested else _active_profile()
    pool = get_pool()
    status = get_daemon_status()

    was_warm = pool.is_warm(profile)
    key = profile or "default"
    if not was_warm and key not in status.warming_profiles:
        status.warming_profiles.append(key)
        status.cold_start_in_flight = True

    started = time.monotonic()
    try:
        await pool.get(cli, profile)
    except Exception as exc:
        logger.exception("daemon prewarm failed for %s", profile)
        status.last_prewarm_error = _prewarm_error(profile, exc)
        status.last_prewarm_at = int(time.time())
        if key in status.warming_profiles:
            status.warming_profiles.remove(key)
        status.cold_start_in_flight = bool(status.warming_profiles)
        return {"ok": False, "profile": profile, "error": str(exc)}

    status.last_prewarm_at = int(time.time())
    status.last_prewarm_error = None
    if key in status.warming_profiles:
        status.warming_profiles.remove(key)
    status.cold_start_in_flight = bool(status.warming_profiles)
    return {
        "ok": True,
        "profile": profile,
        "was_warm": was_warm,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def _prewarm_error(profile: Optional[str], exc: BaseException):
    # Imported lazily so the router module stays importable even if the
    # acp_client module is mocked out in tests.
    from ..acp_client import PrewarmError

    return PrewarmError(profile=profile, error=str(exc), at=int(time.time()))
