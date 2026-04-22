#!/usr/bin/env bash
# Bake a self-contained Python runtime into resources/runtime/ for packaging.
#
# Downloads python-build-standalone 3.13 universal2 for macOS, extracts it,
# pip-installs hermes_home + vendored hermes_agent, prunes caches, and leaves
# the tree at resources/runtime/ ready for electron-builder's extraResources.

set -euo pipefail

PY_VERSION="3.13.1"
PBS_TAG="20250115"   # bump to the latest python-build-standalone release
ARCH="${1:-universal2}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT/resources/runtime"
TARBALL="cpython-${PY_VERSION}+${PBS_TAG}-${ARCH}-apple-darwin-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${TARBALL}"

echo "[bake] fetching $URL"
mkdir -p "$RUNTIME_DIR"
rm -rf "$RUNTIME_DIR"/*

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fL --retry 3 -o "$TMP/py.tar.gz" "$URL"
tar -xzf "$TMP/py.tar.gz" -C "$TMP"
# python-build-standalone unpacks to ./python — move its contents to runtime/
mv "$TMP/python"/* "$RUNTIME_DIR/"

PYTHON="$RUNTIME_DIR/bin/python3"

echo "[bake] pip installing hermes_home + bridge deps"
"$PYTHON" -m pip install --upgrade pip wheel
"$PYTHON" -m pip install --no-cache-dir \
  "fastapi>=0.115" \
  "uvicorn[standard]>=0.32" \
  "pydantic>=2.9" \
  "httpx>=0.27" \
  "sse-starlette>=2.1"

# Install hermes_home itself + vendored hermes_agent (if present).
"$PYTHON" -m pip install --no-cache-dir "$ROOT/sidecar"

if [[ -d "$ROOT/sidecar/hermes_home/vendor/hermes_agent" ]]; then
  echo "[bake] installing vendored hermes_agent"
  "$PYTHON" -m pip install --no-cache-dir "$ROOT/sidecar/hermes_home/vendor/hermes_agent"
else
  echo "[bake] WARNING: no vendored hermes_agent subtree — stub bridge only."
fi

echo "[bake] pruning caches"
find "$RUNTIME_DIR" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$RUNTIME_DIR" -type d -name 'tests' -prune -exec rm -rf {} +
find "$RUNTIME_DIR" -type f -name '*.pyc' -delete
find "$RUNTIME_DIR" -type d -name '*.dist-info' -exec rm -rf {} + 2>/dev/null || true

echo "[bake] done → $RUNTIME_DIR"
du -sh "$RUNTIME_DIR"
