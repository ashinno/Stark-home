"""Loopback-only bearer token auth for the sidecar."""

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
