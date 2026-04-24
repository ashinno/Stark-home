"""In-process token-bucket rate limiter.

Bound is *per-path-prefix*, not per-caller, because the sidecar only has one
real caller (the Electron main process) but several abusable surfaces:

- ``/chat/stream``: each turn can cost provider tokens. A runaway skill that
  got hold of the bearer token (unlikely but defence-in-depth) should not be
  able to drain billing faster than ~1 turn every few seconds.
- ``/skills/marketplace/install``: spawns a potentially slow hermes CLI call;
  flooding it would pin the process.
- ``/daemon/prewarm``: thrashes the ACP pool.

A single asyncio.Lock-guarded dict is more than enough at the volumes the
sidecar sees (one human user).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from fastapi import HTTPException, Request


@dataclass
class _Bucket:
    tokens: float
    last: float


class TokenBucket:
    """Classic token bucket. ``capacity`` is the burst size; ``rate`` is
    tokens added per second.
    """

    def __init__(self, capacity: float, rate: float) -> None:
        self.capacity = capacity
        self.rate = rate
        self._state: dict[str, _Bucket] = {}
        self._lock = asyncio.Lock()

    async def take(self, key: str) -> bool:
        async with self._lock:
            now = time.monotonic()
            b = self._state.get(key)
            if b is None:
                b = _Bucket(tokens=self.capacity, last=now)
                self._state[key] = b
            b.tokens = min(self.capacity, b.tokens + (now - b.last) * self.rate)
            b.last = now
            if b.tokens >= 1.0:
                b.tokens -= 1.0
                return True
            return False


# Pre-configured buckets for the hot-spot endpoints.
_CHAT_BUCKET = TokenBucket(capacity=6, rate=1.0)        # 6 burst, ~1/s sustained
_SKILL_INSTALL_BUCKET = TokenBucket(capacity=4, rate=0.2)  # slow: 1/5s sustained
_PREWARM_BUCKET = TokenBucket(capacity=4, rate=0.2)


def rate_limit(bucket: TokenBucket, key: str = "global") -> Callable[[Request], Awaitable[None]]:
    """Return a FastAPI dependency that 429s when the bucket is empty."""

    async def dep(_: Request) -> None:
        if not await bucket.take(key):
            raise HTTPException(status_code=429, detail="rate limit exceeded")

    return dep


def chat_rate_limit():
    return rate_limit(_CHAT_BUCKET, "chat")


def skill_install_rate_limit():
    return rate_limit(_SKILL_INSTALL_BUCKET, "skill-install")


def prewarm_rate_limit():
    return rate_limit(_PREWARM_BUCKET, "prewarm")
