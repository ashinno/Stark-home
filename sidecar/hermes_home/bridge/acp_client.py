"""Persistent ``hermes acp`` subprocess driven over JSON-RPC / stdio.

The hermes CLI's ``chat -q`` path pays a 3-5s Python-startup + engine-warmup
cost on every single user message. The ACP (Agent Client Protocol) adapter
is a long-running subprocess that keeps the engine warm across turns — the
same architecture that makes ``hermes gateway`` (Telegram/WhatsApp) feel
snappy. This module gives the sidecar one async JSON-RPC client over the
ACP child, so the first turn still pays cold-start but every subsequent
turn is just LLM time.

The wire protocol is newline-delimited JSON-RPC 2.0. We implement only the
subset we need (``initialize`` / ``session/new`` / ``session/prompt`` /
``session/load`` / ``session/cancel`` plus ``session/update`` and
``session/request_permission`` inbound) rather than depend on the
``acp`` Python package, which lives in hermes's venv, not ours.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional

logger = logging.getLogger(__name__)

# Match the versions the hermes ACP adapter advertises.
_PROTOCOL_VERSION = 1
_CLIENT_INFO = {"name": "stark-sidecar", "version": "0.1.0"}

# Outgoing request timeout — lifecycle calls (initialize / new_session) are
# quick; only session/prompt can legitimately run for minutes.
_QUICK_TIMEOUT = 15.0
_PROMPT_TIMEOUT = 300.0


class ACPError(RuntimeError):
    pass


class ACPClient:
    """One live ``hermes acp`` child; hosts many sessions in parallel."""

    def __init__(self, cli_path: str, profile: Optional[str]):
        self.cli_path = cli_path
        self.profile = profile
        self.proc: Optional[asyncio.subprocess.Process] = None
        self._next_id = 1
        self._pending: Dict[int, asyncio.Future] = {}
        # For each active session_id, the queue that receives its update
        # notifications while a prompt is in flight.
        self._update_queues: Dict[str, asyncio.Queue] = {}
        self._recv_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._send_lock = asyncio.Lock()
        self._closed = False
        self._last_used = time.monotonic()

    # ─── lifecycle ────────────────────────────────────────────────

    async def start(self) -> None:
        if self.proc is not None:
            return
        from .validation import safe_profile

        # Last chance to reject a bad profile name — routes validate too,
        # but the ACP client is a persistent child that survives across
        # routes, so it also owns the final check.
        prof = safe_profile(self.profile)
        args: list[str] = [self.cli_path]
        if prof:
            args += ["-p", prof]
        args += ["acp", "--accept-hooks"]

        from .subprocess_env import sanitized_env
        env = sanitized_env(
            {
                "NO_COLOR": "1",
                "TERM": "dumb",
                "HERMES_ACCEPT_HOOKS": "1",
            }
        )

        logger.info("Spawning hermes acp: %s", " ".join(args))
        self.proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            # Bound per-line memory. 4 MB is plenty for any realistic
            # JSON-RPC frame (long tool results, base64 image parts) and keeps
            # a pathological/long-output turn from ballooning sidecar memory.
            # If we ever hit this ceiling in practice, revisit — don't just
            # raise it.
            limit=4 * 1024 * 1024,
        )
        self._recv_task = asyncio.create_task(self._recv_loop(), name="acp-recv")
        self._stderr_task = asyncio.create_task(self._drain_stderr(), name="acp-stderr")

        await self._request(
            "initialize",
            {
                "protocolVersion": _PROTOCOL_VERSION,
                "clientCapabilities": {},
                "clientInfo": _CLIENT_INFO,
            },
            timeout=_QUICK_TIMEOUT,
        )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        proc = self.proc
        self.proc = None
        if proc is not None:
            try:
                if proc.stdin and not proc.stdin.is_closing():
                    proc.stdin.close()
            except Exception:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                proc.kill()
                try:
                    await proc.wait()
                except Exception:
                    pass
        for task in (self._recv_task, self._stderr_task):
            if task is not None and not task.done():
                task.cancel()
        # Reject anything still in flight so callers don't hang forever.
        err = ACPError("ACP process closed")
        for fut in self._pending.values():
            if not fut.done():
                fut.set_exception(err)
        self._pending.clear()
        for q in self._update_queues.values():
            await q.put({"_closed": True})
        self._update_queues.clear()

    def is_alive(self) -> bool:
        return self.proc is not None and self.proc.returncode is None

    # ─── public API ───────────────────────────────────────────────

    async def new_session(self, cwd: str) -> str:
        self._last_used = time.monotonic()
        resp = await self._request(
            "session/new",
            {"cwd": cwd, "mcpServers": []},
            timeout=_QUICK_TIMEOUT,
        )
        sid = resp.get("sessionId")
        if not sid:
            raise ACPError(f"session/new returned no sessionId: {resp}")
        return sid

    async def cancel(self, session_id: str) -> None:
        """Ask the agent to abort the current turn for ``session_id``.

        ``session/cancel`` is a one-way JSON-RPC notification: we don't wait
        for a response. The in-flight ``session/prompt`` will soon yield a
        ``_done`` frame with stopReason=cancelled.
        """
        if not self.is_alive():
            return
        try:
            await self._send(
                {
                    "jsonrpc": "2.0",
                    "method": "session/cancel",
                    "params": {"sessionId": session_id},
                }
            )
        except Exception:
            logger.debug("session/cancel failed", exc_info=True)

    async def load_session(self, cwd: str, session_id: str) -> bool:
        """Restore a known session into the ACP agent. Returns False if unknown."""
        self._last_used = time.monotonic()
        try:
            resp = await self._request(
                "session/load",
                {"cwd": cwd, "sessionId": session_id, "mcpServers": []},
                timeout=_QUICK_TIMEOUT,
            )
        except ACPError as exc:
            logger.debug("session/load %s failed: %s", session_id, exc)
            return False
        # The server returns null when the session isn't in its DB.
        return resp is not None

    async def prompt(
        self,
        session_id: str,
        text: str,
        *,
        content: Optional[list] = None,
        timeout: float = _PROMPT_TIMEOUT,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Send a user prompt; async-yield ACP notifications then a final
        ``{"_done": <PromptResponse>}`` marker.

        If ``content`` is given it is sent verbatim as the ACP prompt parts
        (so callers can include images, resource links, etc.). Otherwise we
        wrap ``text`` in a single text part — the old behaviour.

        Notifications are the raw ``session/update`` params, which have the
        shape ``{"sessionId": ..., "update": {"sessionUpdate": "...", ...}}``.
        """
        self._last_used = time.monotonic()
        q: asyncio.Queue = asyncio.Queue()
        # Reuse existing queue if a prompt is somehow still pending — keeps us
        # from double-registering while the previous await is unwinding.
        self._update_queues[session_id] = q

        req_id = self._reserve_id()
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[req_id] = fut
        prompt_parts = content if content else [{"type": "text", "text": text}]
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "session/prompt",
            "params": {
                "sessionId": session_id,
                "prompt": prompt_parts,
            },
        }
        await self._send(payload)

        try:
            start = time.monotonic()
            while True:
                remaining = timeout - (time.monotonic() - start)
                if remaining <= 0:
                    raise ACPError("session/prompt timed out")

                get_task = asyncio.create_task(q.get())
                try:
                    done, _pending = await asyncio.wait(
                        {get_task, fut},
                        return_when=asyncio.FIRST_COMPLETED,
                        timeout=remaining,
                    )
                except Exception:
                    get_task.cancel()
                    raise

                if not done:
                    get_task.cancel()
                    raise ACPError("session/prompt timed out")

                if get_task in done:
                    update = get_task.result()
                    if "_closed" in update:
                        raise ACPError("ACP process closed mid-prompt")
                    yield update
                else:
                    get_task.cancel()
                    # Swallow the CancelledError on the background task.
                    try:
                        await get_task
                    except (asyncio.CancelledError, Exception):
                        pass

                if fut.done():
                    # Drain any updates queued alongside the response so
                    # trailing tool-call chunks aren't lost when both arrive
                    # in the same event-loop tick.
                    while not q.empty():
                        update = q.get_nowait()
                        if "_closed" not in update:
                            yield update
                    response = fut.result()
                    yield {"_done": response or {}}
                    return
        finally:
            self._pending.pop(req_id, None)
            # Only remove our own queue — the previous prompt's generator may
            # be GC'd *after* the next prompt has already registered its queue
            # under the same session_id (async generators close lazily), and
            # blindly popping would wipe out the active prompt's inbox.
            if self._update_queues.get(session_id) is q:
                self._update_queues.pop(session_id, None)

    # ─── low-level ────────────────────────────────────────────────

    def _reserve_id(self) -> int:
        i = self._next_id
        self._next_id += 1
        return i

    async def _send(self, message: Dict[str, Any]) -> None:
        if not self.is_alive() or self.proc is None or self.proc.stdin is None:
            raise ACPError("ACP child not running")
        line = (json.dumps(message) + "\n").encode("utf-8")
        async with self._send_lock:
            self.proc.stdin.write(line)
            await self.proc.stdin.drain()

    async def _request(
        self,
        method: str,
        params: Dict[str, Any],
        *,
        timeout: float,
    ) -> Any:
        req_id = self._reserve_id()
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[req_id] = fut
        try:
            await self._send(
                {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
            )
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending.pop(req_id, None)

    async def _recv_loop(self) -> None:
        assert self.proc is not None and self.proc.stdout is not None
        try:
            while True:
                line = await self.proc.stdout.readline()
                if not line:
                    break
                try:
                    message = json.loads(line)
                except Exception:
                    logger.warning("ACP: malformed JSON frame: %r", line[:200])
                    continue
                logger.debug("ACP <- %s", json.dumps(message)[:200])
                await self._handle_message(message)
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("ACP recv loop crashed")
        finally:
            # Child closed stdout — treat as hard shutdown so pending prompts
            # don't wait forever.
            for fut in list(self._pending.values()):
                if not fut.done():
                    fut.set_exception(ACPError("ACP child exited"))
            for q in self._update_queues.values():
                try:
                    q.put_nowait({"_closed": True})
                except Exception:
                    pass

    async def _handle_message(self, msg: Dict[str, Any]) -> None:
        if "method" in msg:
            method = msg["method"]
            params = msg.get("params") or {}
            if "id" in msg:
                # Incoming request from the agent — we need to reply.
                await self._handle_server_request(msg["id"], method, params)
            else:
                self._handle_notification(method, params)
            return

        if "id" in msg:
            req_id = msg["id"]
            fut = self._pending.get(req_id)
            if fut is None or fut.done():
                return
            if "error" in msg:
                err = msg["error"] or {}
                fut.set_exception(
                    ACPError(f"{err.get('message', 'acp error')}: {err.get('data')}")
                )
            else:
                fut.set_result(msg.get("result"))

    def _handle_notification(self, method: str, params: Dict[str, Any]) -> None:
        if method == "session/update":
            sid = params.get("sessionId")
            q = self._update_queues.get(sid) if sid else None
            if q is not None:
                try:
                    q.put_nowait(params)
                except Exception:
                    logger.debug("Dropped ACP update for %s", sid)
            else:
                logger.debug("No active queue for %s — update dropped", sid)
            return
        logger.debug("ACP notification ignored: %s", method)

    async def _handle_server_request(
        self, req_id: Any, method: str, params: Dict[str, Any]
    ) -> None:
        if method == "session/request_permission":
            # Sidecar auto-approves every tool permission request — matches
            # the --yolo behaviour the CLI path was using. The UI never had
            # an approval surface for chat turns.
            options = params.get("options") or []
            chosen = None
            # Prefer "allow_always" so we don't get re-prompted later in the
            # same run; fall back to any allow_* option, else the first.
            for opt in options:
                if opt.get("kind") == "allow_always":
                    chosen = opt
                    break
            if chosen is None:
                for opt in options:
                    if (opt.get("kind") or "").startswith("allow"):
                        chosen = opt
                        break
            if chosen is None and options:
                chosen = options[0]

            if chosen is not None:
                result = {
                    "outcome": {
                        "outcome": "selected",
                        "optionId": chosen.get("optionId") or chosen.get("option_id"),
                    }
                }
            else:
                result = {"outcome": {"outcome": "cancelled"}}

            await self._send(
                {"jsonrpc": "2.0", "id": req_id, "result": result}
            )
            return

        # Unknown request — return method_not_found so the ACP agent can move
        # on rather than block forever waiting for a response.
        await self._send(
            {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        )

    async def _drain_stderr(self) -> None:
        """Read child stderr so the pipe doesn't back up. Log at debug level."""
        assert self.proc is not None and self.proc.stderr is not None
        try:
            while True:
                line = await self.proc.stderr.readline()
                if not line:
                    return
                # Hermes ACP logs at INFO/WARNING; keep the noise out of the
                # sidecar log unless someone turns on debug.
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    logger.debug("hermes acp: %s", decoded)
        except asyncio.CancelledError:
            return
        except Exception:
            logger.debug("ACP stderr drain ended", exc_info=True)


# ─── singleton pool ─────────────────────────────────────────────────


class ACPPool:
    """One ``ACPClient`` per profile.

    Clients stay alive for the life of the sidecar unless explicitly closed.
    The pool is safe to call from multiple concurrent routes because each
    mutation happens under ``_lock``.
    """

    def __init__(self):
        self._clients: Dict[str, ACPClient] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(profile: Optional[str]) -> str:
        return profile or "__default__"

    def warm_profiles(self) -> List[str]:
        """Return the keys of currently-alive clients.

        The ``__default__`` placeholder is mapped back to the literal
        ``"default"`` so the UI can match the active-profile string.
        """
        out: List[str] = []
        for key, client in self._clients.items():
            if client.is_alive():
                out.append("default" if key == "__default__" else key)
        return out

    def is_warm(self, profile: Optional[str]) -> bool:
        key = self._key(profile)
        client = self._clients.get(key)
        return client is not None and client.is_alive()

    async def get(self, cli_path: str, profile: Optional[str]) -> ACPClient:
        key = self._key(profile)
        async with self._lock:
            client = self._clients.get(key)
            if client is not None and not client.is_alive():
                logger.info("ACP client for %s died; respawning", key)
                # The dead client is about to be replaced — close() is a
                # no-op beyond tidying attribute state, but call it anyway.
                await client.close()
                client = None
            if client is None:
                client = ACPClient(cli_path=cli_path, profile=profile)
                try:
                    await client.start()
                except Exception:
                    await client.close()
                    raise
                self._clients[key] = client
            return client

    async def cancel(self, session_id: str, profile: Optional[str]) -> bool:
        """Forward a ``session/cancel`` to the live client for ``profile``.

        Returns True if a client was found and the cancel was dispatched.
        """
        key = self._key(profile)
        client = self._clients.get(key)
        if client is None or not client.is_alive():
            return False
        await client.cancel(session_id)
        return True

    async def shutdown(self) -> None:
        async with self._lock:
            clients = list(self._clients.values())
            self._clients.clear()
        for c in clients:
            try:
                await c.close()
            except Exception:
                logger.debug("error closing ACP client", exc_info=True)


_pool: Optional[ACPPool] = None


def get_pool() -> ACPPool:
    global _pool
    if _pool is None:
        _pool = ACPPool()
    return _pool


# ─── daemon status singleton ────────────────────────────────────────
# Tracks sidecar-level warm/prewarm state the UI polls for. Lives beside
# the pool (not inside it) so the pool stays focused on ACP client
# lifecycle — this is just observational state for /daemon/status.
#
# TODO: idle-evict clients whose ``_last_used`` is old enough to free memory
# on long-running sessions where the user switches profiles.


@dataclass
class PrewarmError:
    profile: Optional[str]
    error: str
    at: int


@dataclass
class DaemonStatus:
    cold_start_in_flight: bool = False
    last_prewarm_at: Optional[int] = None
    last_prewarm_error: Optional[PrewarmError] = None
    # Track which profiles are currently warming (or queued to warm) so
    # /daemon/status can disambiguate "not tried yet" from "warming now".
    warming_profiles: List[str] = field(default_factory=list)


_daemon_status: Optional[DaemonStatus] = None


def get_daemon_status() -> DaemonStatus:
    global _daemon_status
    if _daemon_status is None:
        _daemon_status = DaemonStatus()
    return _daemon_status
