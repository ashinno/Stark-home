"""Chat — drives the user's local Hermes engine and streams the reply.

When the `hermes` CLI is on this Mac (the common case), `/chat/stream` shells
out to `hermes chat -q "<message>" -Q --source tool [--resume <sid>]`, parses
the `session_id:` line + reply body, and streams the body back as SSE tokens.

When Hermes isn't installed, falls back to a deterministic stub so the UI
remains usable for first-run onboarding.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .. import hermes_cli
from ..store import get_store

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    provider: str | None = None
    message: str
    session_id: str | None = None
    profile: str | None = None
    max_turns: int = 6


# ─── helpers ────────────────────────────────────────────────


def _word_chunks(text: str) -> list[str]:
    """Split into small word-boundary chunks for nicer streaming."""
    chunks: list[str] = []
    current = ""
    for ch in text:
        current += ch
        if ch in {" ", "\n"} and len(current) >= 3:
            chunks.append(current)
            current = ""
    if current:
        chunks.append(current)
    return chunks


def _record_session(req: ChatRequest, reply: str) -> None:
    """Mirror the message into our local store so Home/Recents updates fast."""
    store = get_store()
    sid = req.session_id or f"ses_{uuid.uuid4().hex[:8]}"

    def mutate(d):
        sessions = d.setdefault("sessions", [])
        for s in sessions:
            if s["id"] == sid:
                s["messages"] += 2
                s["preview"] = req.message[:120]
                s["updated_at"] = int(time.time())
                return
        sessions.insert(0, {
            "id": sid,
            "title": req.message[:48] or "Untitled",
            "preview": (reply or req.message)[:120],
            "messages": 2,
            "started_at": int(time.time()),
            "updated_at": int(time.time()),
            "running": False,
            "pinned": False,
        })

    store.mutate(mutate)


# ─── real Hermes path ───────────────────────────────────────


async def _stream_hermes(req: ChatRequest):
    bin_ = hermes_cli.cli_path()
    if not bin_:
        async for ev in _stream_stub(req):
            yield ev
        return

    args: list[str] = [bin_]
    if req.profile and req.profile != "default":
        args += ["-p", req.profile]
    args += [
        "chat",
        "-q",
        req.message,
        "-Q",
        "--source",
        "tool",
        "--max-turns",
        str(req.max_turns),
        "--accept-hooks",
        "--yolo",
    ]
    if req.session_id:
        args += ["--resume", req.session_id]

    thinking_id = uuid.uuid4().hex
    yield {
        "data": json.dumps({
            "type": "action",
            "action": {
                "id": thinking_id,
                "kind": "thinking",
                "title": "Hermes is thinking…",
                "reason": (
                    f"profile · {req.profile or 'default'}"
                    + (f" · resume {req.session_id}" if req.session_id else "")
                ),
                "tool": "hermes-cli",
                "status": "running",
                "started_at": int(time.time()),
            },
        })
    }

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={"NO_COLOR": "1", "TERM": "dumb", **os.environ},
    )

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180.0)
    except asyncio.TimeoutError:
        proc.kill()
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "failed", "ended_at": int(time.time())},
            })
        }
        yield {"data": json.dumps({"type": "error", "message": "Hermes timed out (180s)"})}
        return

    out_text = stdout.decode("utf-8", errors="replace")
    err_text = stderr.decode("utf-8", errors="replace")

    # session_id: <id> is emitted on stderr; the reply body is on stdout.
    new_sid: str | None = None
    for raw in err_text.splitlines():
        m = re.match(r"^\s*session_id:\s*(\S+)", raw)
        if m:
            new_sid = m.group(1)
            break

    body_lines: list[str] = []
    for raw in out_text.splitlines():
        line = raw.rstrip()
        # Strip the benign "Warning: Unknown toolsets: ..." preamble.
        if not body_lines and (line.startswith("Warning") or not line.strip()):
            continue
        body_lines.append(line)
    body = "\n".join(body_lines).strip()

    if proc.returncode != 0 and not body:
        err = stderr.decode("utf-8", errors="replace").strip()
        # stderr may contain only the session_id line; strip it before reporting
        err = "\n".join(
            line for line in err.splitlines() if not re.match(r"^\s*session_id:", line)
        ).strip()
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "failed", "ended_at": int(time.time())},
            })
        }
        yield {"data": json.dumps({"type": "error", "message": err or f"hermes exited with status {proc.returncode}"})}
        return

    # Mark thinking as ok before streaming the reply
    yield {
        "data": json.dumps({
            "type": "action-update",
            "id": thinking_id,
            "patch": {
                "status": "ok",
                "ended_at": int(time.time()),
                "result": (
                    f"session {new_sid}"
                    if new_sid
                    else "completed"
                ),
            },
        })
    }

    if not body:
        body = "(empty response)"

    for piece in _word_chunks(body):
        yield {"data": json.dumps({"type": "token", "delta": piece})}
        await asyncio.sleep(0.012)

    done: dict = {"type": "done", "messageId": uuid.uuid4().hex}
    if new_sid:
        done["sessionId"] = new_sid
    yield {"data": json.dumps(done)}

    # mirror into local store for Recents
    if new_sid:
        _record_session(ChatRequest(**{**req.model_dump(), "session_id": new_sid}), body)
    else:
        _record_session(req, body)


# ─── stub fallback (Hermes not installed) ───────────────────


_STUB_REPLIES = [
    "Hermes isn't installed yet, so I'm running on a stub. Open Settings → Hermes Doctor to install or repair the engine, then chat will use your real model.",
    "I'm replying from Stark's built-in stub. Once you install Hermes, your local model takes over and these replies become real.",
]


async def _stream_stub(req: ChatRequest):
    yield {
        "data": json.dumps({
            "type": "action",
            "action": {
                "id": uuid.uuid4().hex,
                "kind": "thinking",
                "title": "Stub reply",
                "reason": "hermes CLI not detected on this Mac",
                "tool": "stark-stub",
                "status": "ok",
                "started_at": int(time.time()),
                "ended_at": int(time.time()),
            },
        })
    }
    text = _STUB_REPLIES[hash(req.message) % len(_STUB_REPLIES)]
    for piece in _word_chunks(text):
        yield {"data": json.dumps({"type": "token", "delta": piece})}
        await asyncio.sleep(0.018)
    yield {"data": json.dumps({"type": "done", "messageId": uuid.uuid4().hex})}


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    return EventSourceResponse(_stream_hermes(req))
