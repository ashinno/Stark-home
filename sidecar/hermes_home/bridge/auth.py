"""Auth + renderer-origin verification for the sidecar.

Two layers:

- **Bearer token** (``verify``): gates every route. Required for anyone to
  talk to the bridge at all. Loopback is the network boundary; the token
  is the auth boundary.

- **Renderer-origin nonce** (``verify_renderer_origin``): a second per-launch
  secret known only to the Electron main process. Mutating endpoints that
  should never be invoked by agent children (skills, MCP servers, tools)
  require this header. Because ``sanitized_env`` strips the nonce from every
  child spawn, a compromised agent child cannot forge it.
"""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status


def make_verifier(expected: str):
    """Return a FastAPI dependency that verifies the bearer token."""

    async def verify(authorization: str | None = Header(default=None)) -> None:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer")
        token = authorization[len("Bearer ") :]
        if not hmac.compare_digest(token, expected):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad token")

    return verify


def make_origin_verifier(expected: str):
    """Return a dependency requiring ``X-Stark-Origin: <nonce>``.

    ``expected`` is a non-empty string. ``__main__`` ensures this by
    generating a random fallback if Electron didn't supply one — the check
    is always strict. A caller without the nonce always 403s, even in dev.
    """
    assert expected, "renderer origin nonce must be non-empty (strict fail-closed)"

    async def verify(x_stark_origin: str | None = Header(default=None)) -> None:
        if not x_stark_origin or not hmac.compare_digest(x_stark_origin, expected):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "renderer origin header missing or invalid",
            )

    return verify
