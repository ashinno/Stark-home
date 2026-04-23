"""Home dashboard endpoints — threads, approvals, jobs, suggestions, agent pause.

`/threads` reads real Hermes sessions for the active profile when the CLI is
present; falls back to the seeded sample only when Hermes isn't installed.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Query

from .. import hermes_cli
from ..store import get_store

router = APIRouter(tags=["home"])


# Rough per-token USD pricing for the most common models we're likely to see
# via the ACP bridge. These are best-effort — the real billing numbers depend
# on the provider/contract, so we surface the *estimate* in the UI and label
# it as such. Values are cents per 1M tokens to avoid floats in the wire.
_DEFAULT_PRICING_CENTS_PER_MTOK = {
    # sensible fallback for unknown models
    "*": {"input": 250, "output": 1000},  # $2.50 in / $10 out
    "gpt-4.1": {"input": 250, "output": 1000},
    "gpt-4o": {"input": 500, "output": 1500},
    "gpt-5": {"input": 1250, "output": 3000},
    "gpt-5.4": {"input": 500, "output": 1500},
    "claude-opus-4-7": {"input": 1500, "output": 7500},
    "claude-sonnet-4-5": {"input": 300, "output": 1500},
    "claude-haiku": {"input": 100, "output": 500},
    "hermes-3-405b": {"input": 200, "output": 800},
    "llama3.2:latest": {"input": 0, "output": 0},  # local, free
}


def _price_for(model: str) -> dict[str, int]:
    if not model:
        return _DEFAULT_PRICING_CENTS_PER_MTOK["*"]
    lo = model.lower()
    for key, v in _DEFAULT_PRICING_CENTS_PER_MTOK.items():
        if key == "*":
            continue
        if key.lower() in lo or lo in key.lower():
            return v
    return _DEFAULT_PRICING_CENTS_PER_MTOK["*"]


def _estimate_cents(usage: dict[str, Any] | None, model: str) -> int:
    """Very rough: input tokens × input rate + output × output rate."""
    if not usage:
        return 0
    price = _price_for(model)
    in_tok = int(usage.get("inputTokens") or 0)
    out_tok = int(usage.get("outputTokens") or 0)
    cents = (in_tok * price["input"] + out_tok * price["output"]) // 1_000_000
    return int(cents)


@router.get("/threads")
async def list_threads(profile: str | None = Query(default=None)) -> dict:
    settings = get_store().read("settings") or {}
    prof = profile or settings.get("active_profile")
    if hermes_cli.available():
        sessions = hermes_cli.list_sessions(prof)
        # cap to 50 most recent so the UI loads fast
        sessions.sort(key=lambda t: t.get("updated_at", 0), reverse=True)
        return {"threads": sessions[:50], "real": True, "profile": prof}
    items = get_store().read("threads") or []
    items.sort(key=lambda t: t.get("updated_at", 0), reverse=True)
    return {"threads": items, "real": False, "profile": prof}


@router.get("/approvals")
async def list_approvals() -> dict:
    return {"approvals": get_store().read("approvals") or []}


@router.get("/jobs")
async def list_jobs() -> dict:
    return {"jobs": get_store().read("jobs") or []}


@router.get("/suggestions")
async def list_suggestions() -> dict:
    return {"suggestions": get_store().read("suggestions") or []}


@router.post("/agents/pause")
async def pause_agents() -> dict:
    return {"paused": True}


@router.get("/usage")
async def usage_summary(limit: int = Query(default=10, ge=1, le=50)) -> dict[str, Any]:
    """Global and per-session token usage for the cost dashboard.

    Pulls from ``usage_totals`` (accumulated in chat.py on every turn) and
    walks the local ``sessions`` list to rank top consumers. Costs are rough
    estimates from the hard-coded rate card; we mark them as ``estimate``
    so the UI doesn't mislead users about real billing."""
    store = get_store()
    totals = store.read("usage_totals") or {}
    sessions = store.read("sessions") or []
    settings = store.read("settings") or {}
    active_model = ""
    for p in store.read("providers") or []:
        if p.get("id") == settings.get("active_provider"):
            active_model = p.get("model", "")
            break

    # Per-session rollups with cost estimates, sorted by total tokens.
    session_rows: list[dict[str, Any]] = []
    for s in sessions:
        u = s.get("usage") or {}
        if not u:
            continue
        model = s.get("model") or active_model
        total = int(u.get("totalTokens") or (int(u.get("inputTokens") or 0) + int(u.get("outputTokens") or 0)))
        if total <= 0:
            continue
        session_rows.append({
            "id": s.get("id"),
            "title": s.get("title") or "Untitled",
            "model": model,
            "input_tokens": int(u.get("inputTokens") or 0),
            "output_tokens": int(u.get("outputTokens") or 0),
            "cached_read_tokens": int(u.get("cachedReadTokens") or 0),
            "thought_tokens": int(u.get("thoughtTokens") or 0),
            "total_tokens": total,
            "cost_cents": _estimate_cents(u, model),
            "updated_at": s.get("updated_at", 0),
        })
    session_rows.sort(key=lambda r: r["total_tokens"], reverse=True)

    total_cents = sum(r["cost_cents"] for r in session_rows)
    input_total = int(totals.get("inputTokens", 0))
    output_total = int(totals.get("outputTokens", 0))

    return {
        "generated_at": int(time.time()),
        "active_model": active_model,
        "totals": {
            "input_tokens": input_total,
            "output_tokens": output_total,
            "cached_read_tokens": int(totals.get("cachedReadTokens", 0)),
            "thought_tokens": int(totals.get("thoughtTokens", 0)),
            "total_tokens": int(totals.get("totalTokens") or (input_total + output_total)),
            "turns": int(totals.get("turns", 0)),
            "estimated_cost_cents": total_cents,
        },
        "sessions": session_rows[:limit],
        "pricing_note": "Estimate based on public list prices; real billing may differ.",
    }
