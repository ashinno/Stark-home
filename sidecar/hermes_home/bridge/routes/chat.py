"""Chat — drives the user's local Hermes engine and streams the reply.

Preferred path (new threads, and any thread we spawned in this sidecar
lifetime): a persistent ``hermes acp`` subprocess multiplexes JSON-RPC
sessions. Cold-start is paid once per profile, not per message, which
closes the latency gap with ``hermes gateway``-backed integrations
(Telegram/WhatsApp/Discord).

Fallback path (pre-existing CLI sessions whose IDs the ACP adapter
doesn't recognise): shells out to ``hermes chat -q --resume SID`` and
streams the reply. Slower but keeps older threads answerable.

When Hermes isn't installed at all, the old deterministic stub still
fires so first-run onboarding keeps working.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .. import hermes_cli
from ..acp_client import ACPError, get_pool
from ..store import get_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class AttachmentPayload(BaseModel):
    id: str | None = None
    name: str
    mime: str
    kind: str  # image | file | screenshot | audio
    size: int | None = None
    # base64 for images/screenshots; raw text for text files.
    data: str | None = None


class ChatRequest(BaseModel):
    provider: str | None = None
    message: str
    session_id: str | None = None
    profile: str | None = None
    max_turns: int = 6
    attachments: list[AttachmentPayload] | None = None


# Mime types the ACP agent can natively ingest as image parts. Everything
# else is summarised in the prompt text ("attached file: foo.pdf (180 KB)").
_IMAGE_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
_TEXT_MIMES_PREFIX = ("text/",)
_TEXT_MIME_EXTRA = {
    "application/json",
    "application/xml",
    "application/yaml",
    "application/x-yaml",
    "application/javascript",
    "application/typescript",
    "application/x-sh",
}


def _build_prompt_content(message: str, attachments: list[AttachmentPayload] | None) -> list[dict]:
    """Turn (text + attachments) into an ACP content-parts list.

    - Image attachments become ``{"type": "image", "mimeType": ..., "data": ...}``
      parts when the agent supports them (we always send — ACP will ignore
      unsupported parts rather than error).
    - Text-like attachments are inlined into the user text as fenced blocks.
    - Opaque binaries are mentioned in the user text so the agent at least
      knows they exist.
    """
    parts: list[dict] = []
    inline_blocks: list[str] = []
    mentions: list[str] = []

    for att in attachments or []:
        mime = (att.mime or "").lower()
        if att.kind in ("image", "screenshot") and att.data and mime in _IMAGE_MIMES:
            parts.append(
                {
                    "type": "image",
                    "mimeType": mime,
                    "data": att.data,
                }
            )
            mentions.append(f"[image: {att.name}]")
            continue

        is_text = mime.startswith(_TEXT_MIMES_PREFIX) or mime in _TEXT_MIME_EXTRA
        if is_text and att.data:
            # Attachment data for text is the decoded string, not base64.
            inline_blocks.append(
                f"\n\n=== attached: {att.name} ===\n```\n{att.data}\n```\n=== end ===\n"
            )
            continue

        size_kb = (att.size or 0) // 1024
        mentions.append(f"[file: {att.name}{' · %dKB' % size_kb if size_kb else ''}]")

    head = message.strip()
    if mentions:
        head = f"{head}\n\n{' '.join(mentions)}"
    combined = head + "".join(inline_blocks)
    parts.insert(0, {"type": "text", "text": combined})
    return parts


# ─── helpers ────────────────────────────────────────────────


# CLI session IDs look like `20260422_101637_624dd6` (or `cron_<hex>_...`).
# ACP session IDs are uuid4 strings. Routing is strictly shape-based so we
# never guess wrong when the agent hands us an id it's never seen.
_CLI_SID_RE = re.compile(r"^(?:cron_[0-9a-f]+_)?\d{8}_\d{6}")


def _is_cli_session_id(sid: str | None) -> bool:
    return bool(sid and _CLI_SID_RE.match(sid))


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


def _record_session(
    req: ChatRequest,
    reply: str,
    *,
    session_id: str | None = None,
    usage: dict | None = None,
) -> None:
    """Mirror the message into our local store so Home/Recents updates fast.

    Also accumulates token usage per-session for the cost dashboard.
    """
    store = get_store()
    sid = session_id or req.session_id or f"ses_{uuid.uuid4().hex[:8]}"

    def _merge_usage(dst: dict | None, src: dict | None) -> dict:
        if not src:
            return dst or {}
        dst = dict(dst or {})
        for k in ("inputTokens", "outputTokens", "cachedReadTokens", "thoughtTokens", "totalTokens"):
            v = src.get(k)
            if isinstance(v, (int, float)):
                dst[k] = int(dst.get(k, 0)) + int(v)
        return dst

    def mutate(d):
        sessions = d.setdefault("sessions", [])
        # Also keep a global rolling total for the dashboard.
        totals = d.setdefault("usage_totals", {})
        if usage:
            for k in ("inputTokens", "outputTokens", "cachedReadTokens", "thoughtTokens", "totalTokens"):
                v = usage.get(k)
                if isinstance(v, (int, float)):
                    totals[k] = int(totals.get(k, 0)) + int(v)
            totals["turns"] = int(totals.get("turns", 0)) + 1

        for s in sessions:
            if s["id"] == sid:
                s["messages"] += 2
                s["preview"] = req.message[:120]
                s["updated_at"] = int(time.time())
                if usage:
                    s["usage"] = _merge_usage(s.get("usage"), usage)
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
            "usage": _merge_usage(None, usage) if usage else None,
        })

    store.mutate(mutate)


# ─── ACP path (persistent subprocess, fast) ─────────────────


async def _stream_acp(req: ChatRequest):
    bin_ = hermes_cli.cli_path()
    if not bin_:
        async for ev in _stream_stub(req):
            yield ev
        return

    pool = get_pool()
    try:
        client = await pool.get(bin_, req.profile)
    except Exception as exc:
        logger.exception("Failed to start hermes acp")
        yield {"data": json.dumps({"type": "error", "message": f"ACP start failed: {exc}"})}
        return

    cwd = os.getcwd()

    # Resolve the session id: reuse if given & known, otherwise create.
    session_id = req.session_id
    creating_new = False
    if not session_id:
        try:
            session_id = await client.new_session(cwd)
            creating_new = True
        except Exception as exc:
            logger.exception("session/new failed")
            yield {"data": json.dumps({"type": "error", "message": f"ACP new_session failed: {exc}"})}
            return
    else:
        # Try to restore the session into the agent if it isn't already there.
        # ``session/load`` is idempotent from the client's POV, so calling it
        # for a session we already loaded in this same process is fine.
        try:
            ok = await client.load_session(cwd, session_id)
        except Exception as exc:
            logger.warning("session/load crashed: %s", exc)
            ok = False
        if not ok:
            # Session id is unknown to this ACP instance — spin up a fresh
            # one so the user still gets a reply. The new id will be echoed
            # back in the `done` frame for the UI to latch onto.
            try:
                session_id = await client.new_session(cwd)
                creating_new = True
            except Exception as exc:
                logger.exception("session/new (after failed load) failed")
                yield {
                    "data": json.dumps(
                        {"type": "error", "message": f"ACP new_session failed: {exc}"}
                    )
                }
                return

    # Emit the session id up-front so the renderer can wire up Cancel even
    # during the very first turn of a brand-new session.
    yield {"data": json.dumps({"type": "session", "sessionId": session_id})}

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
                    + (" · new session" if creating_new else f" · resume {session_id[:8]}…")
                ),
                "tool": "hermes-acp",
                "status": "running",
                "started_at": int(time.time()),
            },
        })
    }

    emitted_any_body = False
    full_reply: list[str] = []
    usage_payload: dict | None = None

    # Build multimodal prompt parts when the caller attached anything; else
    # pass the plain text (keeps the fast path unchanged for normal chats).
    prompt_content = (
        _build_prompt_content(req.message, req.attachments) if req.attachments else None
    )

    try:
        async for frame in client.prompt(session_id, req.message, content=prompt_content):
            if "_done" in frame:
                done_body = frame.get("_done") or {}
                raw_usage = done_body.get("usage") if isinstance(done_body, dict) else None
                if isinstance(raw_usage, dict):
                    # Normalise camelCase ACP field names to the shape the UI expects.
                    usage_payload = {
                        "inputTokens": raw_usage.get("inputTokens") or raw_usage.get("input_tokens"),
                        "outputTokens": raw_usage.get("outputTokens") or raw_usage.get("output_tokens"),
                        "cachedReadTokens": raw_usage.get("cachedReadTokens") or raw_usage.get("cached_read_tokens"),
                        "thoughtTokens": raw_usage.get("thoughtTokens") or raw_usage.get("thought_tokens"),
                        "totalTokens": raw_usage.get("totalTokens") or raw_usage.get("total_tokens"),
                    }
                break

            update = frame.get("update") or {}
            kind = update.get("sessionUpdate") or update.get("session_update")

            if kind == "agent_message_chunk":
                content = update.get("content") or {}
                text = content.get("text") if isinstance(content, dict) else None
                if not text:
                    continue

                if not emitted_any_body:
                    yield {
                        "data": json.dumps({
                            "type": "action-update",
                            "id": thinking_id,
                            "patch": {"status": "ok", "ended_at": int(time.time())},
                        })
                    }
                    emitted_any_body = True

                full_reply.append(text)
                for chunk in _word_chunks(text):
                    yield {"data": json.dumps({"type": "token", "delta": chunk})}
                continue

            if kind == "tool_call":
                tc_id = update.get("toolCallId") or update.get("tool_call_id") or uuid.uuid4().hex
                title = update.get("title") or update.get("kind") or "Tool call"
                yield {
                    "data": json.dumps({
                        "type": "action",
                        "action": {
                            "id": tc_id,
                            "kind": "tool",
                            "title": str(title)[:120],
                            "reason": str(update.get("kind") or "tool"),
                            "tool": str(update.get("kind") or "tool"),
                            "status": "running",
                            "started_at": int(time.time()),
                        },
                    })
                }
                continue

            if kind == "tool_call_update":
                tc_id = update.get("toolCallId") or update.get("tool_call_id")
                status = update.get("status") or "ok"
                if tc_id:
                    yield {
                        "data": json.dumps({
                            "type": "action-update",
                            "id": tc_id,
                            "patch": {
                                "status": "ok" if status in ("completed", "ok") else status,
                                "ended_at": int(time.time()),
                            },
                        })
                    }
                continue

            # Silently drop other update kinds — thought chunks, plan updates,
            # available-commands — none of which the current UI renders.
    except ACPError as exc:
        logger.warning("ACP prompt failed: %s", exc)
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "failed", "ended_at": int(time.time())},
            })
        }
        yield {"data": json.dumps({"type": "error", "message": str(exc)})}
        return
    except Exception as exc:
        logger.exception("ACP prompt crashed")
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "failed", "ended_at": int(time.time())},
            })
        }
        yield {"data": json.dumps({"type": "error", "message": str(exc)})}
        return

    if not emitted_any_body:
        # Engine produced no agent_message_chunk — close the thinking card
        # and stream a placeholder so the UI doesn't hang forever.
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "ok", "ended_at": int(time.time())},
            })
        }
        placeholder = "(empty response)"
        full_reply.append(placeholder)
        for chunk in _word_chunks(placeholder):
            yield {"data": json.dumps({"type": "token", "delta": chunk})}

    done_frame: dict = {
        "type": "done",
        "messageId": uuid.uuid4().hex,
        "sessionId": session_id,
    }
    if usage_payload:
        done_frame["usage"] = {k: v for k, v in usage_payload.items() if v is not None}
    yield {"data": json.dumps(done_frame)}

    _record_session(req, "".join(full_reply), session_id=session_id, usage=usage_payload)


# ─── CLI subprocess fallback (back-compat for old sessions) ─


async def _stream_hermes_cli(req: ChatRequest):
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
        env={"NO_COLOR": "1", "TERM": "dumb", "COLUMNS": "200", **os.environ},
    )

    assert proc.stdout is not None and proc.stderr is not None

    stderr_chunks: list[bytes] = []

    async def _drain_stderr() -> None:
        while True:
            line = await proc.stderr.readline()
            if not line:
                return
            stderr_chunks.append(line)

    stderr_task = asyncio.create_task(_drain_stderr())

    body_lines: list[str] = []
    emitted_any = False
    banner_re = re.compile(r"^\s*↻ Resumed session \S+[^\n]*$")

    try:
        while True:
            try:
                raw = await asyncio.wait_for(proc.stdout.readline(), timeout=180.0)
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
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip("\n").rstrip()
            if not body_lines and (
                line.startswith("Warning")
                or not line.strip()
                or banner_re.match(line)
            ):
                continue
            body_lines.append(line)

            if not emitted_any:
                yield {
                    "data": json.dumps({
                        "type": "action-update",
                        "id": thinking_id,
                        "patch": {"status": "ok", "ended_at": int(time.time())},
                    })
                }
                emitted_any = True
                piece = line
            else:
                piece = "\n" + line

            for chunk in _word_chunks(piece):
                yield {"data": json.dumps({"type": "token", "delta": chunk})}
                await asyncio.sleep(0.008)
    finally:
        await stderr_task

    await proc.wait()
    err_text = b"".join(stderr_chunks).decode("utf-8", errors="replace")

    new_sid: str | None = None
    for raw in err_text.splitlines():
        m = re.match(r"^\s*session_id:\s*(\S+)", raw)
        if m:
            new_sid = m.group(1)
            break

    body = "\n".join(body_lines).strip()

    if proc.returncode != 0 and not body:
        err = "\n".join(
            line for line in err_text.splitlines()
            if not re.match(r"^\s*session_id:", line)
        ).strip()
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "failed", "ended_at": int(time.time())},
            })
        }
        yield {
            "data": json.dumps({
                "type": "error",
                "message": err or f"hermes exited with status {proc.returncode}",
            })
        }
        return

    if not emitted_any:
        yield {
            "data": json.dumps({
                "type": "action-update",
                "id": thinking_id,
                "patch": {"status": "ok", "ended_at": int(time.time())},
            })
        }
        placeholder = "(empty response)"
        for chunk in _word_chunks(placeholder):
            yield {"data": json.dumps({"type": "token", "delta": chunk})}
            await asyncio.sleep(0.008)
        body = placeholder

    done: dict = {"type": "done", "messageId": uuid.uuid4().hex}
    if new_sid:
        done["sessionId"] = new_sid
    yield {"data": json.dumps(done)}

    _record_session(
        req,
        body,
        session_id=new_sid or req.session_id,
    )


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


# ─── router ─────────────────────────────────────────────────


async def _stream_auto(req: ChatRequest):
    """Dispatch: pre-existing CLI sessions go through the subprocess path;
    everything else gets the persistent ACP path."""
    if _is_cli_session_id(req.session_id):
        async for ev in _stream_hermes_cli(req):
            yield ev
        return
    async for ev in _stream_acp(req):
        yield ev


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    return EventSourceResponse(_stream_auto(req))


class CancelRequest(BaseModel):
    session_id: str
    profile: str | None = None


@router.post("/cancel")
async def chat_cancel(req: CancelRequest) -> dict:
    """Abort the in-flight ACP turn for ``session_id``.

    No-op for CLI-format sessions — those run a one-shot subprocess whose
    lifetime the renderer already controls by closing the SSE stream.
    """
    if _is_cli_session_id(req.session_id):
        return {"ok": True, "path": "cli", "cancelled": False}
    pool = get_pool()
    try:
        cancelled = await pool.cancel(req.session_id, req.profile)
    except Exception as exc:
        logger.exception("chat/cancel failed")
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "path": "acp", "cancelled": cancelled}
