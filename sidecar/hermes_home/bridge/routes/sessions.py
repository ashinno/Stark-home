"""Sessions — real conversation history from `hermes sessions`.

We surface them as Threads in the UI so the user can re-open a past chat,
read the messages, and continue it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from .. import hermes_cli

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(profile: str | None = Query(default=None)) -> dict[str, Any]:
    if not hermes_cli.available():
        return {"sessions": [], "available": False}
    return {"sessions": hermes_cli.list_sessions(profile), "available": True}


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
