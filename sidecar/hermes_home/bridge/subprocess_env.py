"""Sanitised environment for every subprocess Stark spawns.

The sidecar's own env holds secrets the agent and its children must NOT see:

- ``STARK_TOKEN`` / ``HEARTH_TOKEN`` / ``HERMES_HOME_TOKEN`` — the bearer
  token that authenticates to this bridge. A child with this token can call
  every admin endpoint (env write, profile switch, config rewrite, shutdown).
- ``STARK_RENDERER_ORIGIN`` — the per-launch nonce Electron adds to the
  ``X-Stark-Origin`` header to mark renderer-originated requests. Children
  without this nonce cannot reach gated mutating endpoints.
- ``STARK_DATA_DIR`` / ``HEARTH_DATA_DIR`` / ``HERMES_HOME_DATA_DIR`` — the
  internal store path; children don't need it and it would let a compromised
  child rewrite app state directly on disk.

Every place that spawns a child MUST build its env through ``sanitized_env``
rather than ``{..., **os.environ}``. There is a lint in ``verify_spawns.py``
that scans for the unsafe pattern; new routes should go through this helper.
"""

from __future__ import annotations

import os
from typing import Mapping

# Prefixes we consider sidecar-internal and always strip.
_STRIP_PREFIXES: tuple[str, ...] = ("STARK_", "HEARTH_", "HERMES_HOME_")

# Individual vars that don't fit the prefix rule but are still sidecar-only.
_STRIP_EXACT: frozenset[str] = frozenset()


def sanitized_env(extra: Mapping[str, str] | None = None) -> dict[str, str]:
    """Return a copy of ``os.environ`` with sidecar-internal vars removed.

    Merge any ``extra`` keys on top (callers typically pass ``NO_COLOR=1``
    or ``TERM=dumb`` for CLI invocations). ``extra`` values always win so
    callers can override a stripped key if they absolutely need to.
    """
    out: dict[str, str] = {}
    for k, v in os.environ.items():
        if k in _STRIP_EXACT:
            continue
        if any(k.startswith(p) for p in _STRIP_PREFIXES):
            continue
        out[k] = v
    if extra:
        out.update(extra)
    return out
