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

    port = _pick_port(args.port)
    # First line of stdout: port announcement (parsed by Electron main process).
    print(f"PORT={port}", flush=True)

    app = create_app(token=token)
    uvicorn.run(app, host=args.host, port=port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
