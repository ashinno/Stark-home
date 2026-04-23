"""Sessions — real conversation history from `hermes sessions`.

We surface them as Threads in the UI so the user can re-open a past chat,
read the messages, and continue it.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from .. import hermes_cli

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(profile: str | None = Query(default=None)) -> dict[str, Any]:
    if not hermes_cli.available():
        return {"sessions": [], "available": False}
    return {"sessions": hermes_cli.list_sessions(profile), "available": True}


@router.get("/search")
async def search_sessions(
    q: str = Query(..., min_length=1),
    profile: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    scan: int = Query(default=60, ge=1, le=200),
) -> dict[str, Any]:
    """Search across past sessions for a substring match.

    Strategy: list the most recent ``scan`` sessions, check the fast metadata
    first (title + preview), then read the body of any that don't match to
    look inside messages. Runs reads concurrently so scanning ~60 sessions
    costs roughly one round-trip instead of sixty.
    """
    if not hermes_cli.available():
        return {"results": [], "available": False}

    query = q.strip()
    if not query:
        return {"results": [], "available": True, "query": query}

    qlow = query.lower()
    sessions = hermes_cli.list_sessions(profile)[:scan]

    results: list[dict[str, Any]] = []

    # Fast path: anything with a metadata match gets included without reading.
    unread: list[dict[str, Any]] = []
    for s in sessions:
        hay = f"{s.get('title') or ''} {s.get('preview') or ''}".lower()
        if qlow in hay:
            results.append(
                {
                    **s,
                    "match": {
                        "where": "metadata",
                        "snippet": _snippet(f"{s.get('title') or ''} · {s.get('preview') or ''}", query),
                    },
                }
            )
            if len(results) >= limit:
                break
        else:
            unread.append(s)

    # Slow path: read session bodies in parallel to find message-level hits.
    if len(results) < limit and unread:
        loop = asyncio.get_event_loop()
        budget = unread[: limit * 3]  # cap work even if everyone misses
        tasks = [
            loop.run_in_executor(None, hermes_cli.read_session, profile, s["id"])
            for s in budget
        ]
        bodies = await asyncio.gather(*tasks, return_exceptions=True)
        for s, body in zip(budget, bodies):
            if len(results) >= limit:
                break
            if isinstance(body, Exception) or not isinstance(body, dict):
                continue
            hit = _find_message_hit(body.get("messages") or [], query)
            if hit is None:
                continue
            results.append(
                {
                    **s,
                    "match": {
                        "where": f"message:{hit['role']}",
                        "snippet": hit["snippet"],
                        "message_index": hit["index"],
                    },
                }
            )

    return {"results": results, "available": True, "query": query, "scanned": len(sessions)}


def _snippet(text: str, query: str, *, window: int = 80) -> str:
    """Return a short excerpt centered on the first match, or the head of text."""
    if not text:
        return ""
    idx = text.lower().find(query.lower())
    if idx < 0:
        return text[: window * 2].strip()
    start = max(0, idx - window)
    end = min(len(text), idx + len(query) + window)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    # Collapse whitespace so the snippet stays on one line.
    excerpt = re.sub(r"\s+", " ", text[start:end]).strip()
    return f"{prefix}{excerpt}{suffix}"


def _find_message_hit(messages: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    qlow = query.lower()
    for i, m in enumerate(messages):
        content = m.get("content")
        if isinstance(content, list):
            parts: list[str] = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    parts.append(p.get("text", ""))
                elif isinstance(p, str):
                    parts.append(p)
            content = "\n".join(parts)
        if not isinstance(content, str) or not content:
            continue
        if qlow not in content.lower():
            continue
        return {
            "index": i,
            "role": m.get("role", "assistant"),
            "snippet": _snippet(content, query),
        }
    return None


@router.get("/{sid}")
async def read_session(sid: str, profile: str | None = Query(default=None)) -> dict[str, Any]:
    if not hermes_cli.available():
        raise HTTPException(503, "hermes CLI not available")
    obj = hermes_cli.read_session(profile, sid)
    if not obj:
        raise HTTPException(404, "session not found")
    # Normalize messages so the UI sees a consistent shape.
    messages = []
    for m in obj.get("messages") or []:
        content = m.get("content")
        if isinstance(content, list):
            # Take the first text part, joining if multiple.
            parts: list[str] = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    parts.append(p.get("text", ""))
                elif isinstance(p, str):
                    parts.append(p)
            content = "\n".join(parts).strip()
        if content is None:
            content = ""
        messages.append(
            {
                "role": m.get("role", "assistant"),
                "content": content,
                "tool_call_id": m.get("tool_call_id"),
                "name": m.get("name"),
            }
        )
    return {
        "id": obj.get("id"),
        "title": obj.get("title"),
        "model": obj.get("model"),
        "source": obj.get("source"),
        "started_at": obj.get("started_at"),
        "ended_at": obj.get("ended_at"),
        "message_count": obj.get("message_count"),
        "tool_call_count": obj.get("tool_call_count"),
        "messages": messages,
    }
