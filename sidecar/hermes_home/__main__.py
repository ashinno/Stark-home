"""Stark sidecar entrypoint: `python -m hermes_home --port 0`.

Binds to 127.0.0.1 with a per-launch bearer token, prints `PORT=<bound>` on the
first line of stdout so the Electron main process can capture it, then serves
the FastAPI bridge that the Stark UI talks to.
"""

from __future__ import annotations

import argparse
import os
import socket
import sys

import uvicorn

from .bridge.app import create_app


def _pick_port(preferred: int) -> int:
    if preferred and preferred > 0:
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    token = (
        os.environ.get("STARK_TOKEN")
        or os.environ.get("HEARTH_TOKEN")
        or os.environ.get("HERMES_HOME_TOKEN")
    )
    if not token:
        print("ERROR: STARK_TOKEN env var required", file=sys.stderr)
        sys.exit(2)

    # A second per-launch nonce Electron adds to renderer-originated
    # requests. Mutating endpoints require the header; agent children can't
    # forge it because ``sanitized_env`` strips STARK_* on spawn.
    #
    # If Electron didn't supply one (e.g. a misconfigured dev run), we
    # generate our own. That way the verifier always runs in strict mode
    # — unknown callers cannot access mutating endpoints. The cost is that
    # the renderer can't either until we plumb the nonce back to it; in
    # practice we rely on the env var being set by a well-behaved parent.
    import secrets
    renderer_origin = os.environ.get("STARK_RENDERER_ORIGIN") or secrets.token_hex(32)

    # Defence-in-depth: once we've captured the secrets, blank them in our
    # own environment. Even if ``sanitized_env`` is bypassed somewhere, there
    # is nothing sensitive to inherit.
    for k in ("STARK_TOKEN", "HEARTH_TOKEN", "HERMES_HOME_TOKEN", "STARK_RENDERER_ORIGIN"):
        os.environ.pop(k, None)

    port = _pick_port(args.port)
    # First line of stdout: port announcement (parsed by Electron main process).
    print(f"PORT={port}", flush=True)

    app = create_app(token=token, renderer_origin=renderer_origin)
    uvicorn.run(app, host=args.host, port=port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
