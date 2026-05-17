#!/usr/bin/env bash
# Bake a self-contained Python runtime into resources/runtime/ for packaging.
#
# Downloads python-build-standalone 3.13 universal2 for macOS, extracts it,
# pip-installs hermes_home + vendored hermes_agent, prunes caches, and leaves
# the tree at resources/runtime/ ready for electron-builder's extraResources.

set -euo pipefail

PY_VERSION="3.13.13"
PBS_TAG="20260414"   # bump alongside PY_VERSION when accepting a new release
TARGET="${1:-all}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

arches=()
case "$TARGET" in
  all|universal|universal2)
    arches=(aarch64 x86_64)
    ;;
  arm64)
    arches=(aarch64)
    ;;
  aarch64|x86_64)
    arches=("$TARGET")
    ;;
  native)
    host="$(uname -m)"
    if [[ "$host" == "arm64" ]]; then arches=(aarch64); else arches=(x86_64); fi
    ;;
  *)
    echo "[bake] unknown target '$TARGET' (use all, native, aarch64, x86_64)" >&2
    exit 2
    ;;
esac

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

bake_one() {
  local arch="$1"
  local runtime_dir="$ROOT/resources/runtime-$arch"
  local tarball="cpython-${PY_VERSION}+${PBS_TAG}-${arch}-apple-darwin-install_only.tar.gz"
  local url="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${tarball}"
  local tmp="$TMP_ROOT/$arch"

  echo "[bake] fetching $url"
  mkdir -p "$runtime_dir" "$tmp"
  rm -rf "$runtime_dir"/*

  curl -fL --retry 3 -o "$tmp/py.tar.gz" "$url"
  tar -xzf "$tmp/py.tar.gz" -C "$tmp"
  # python-build-standalone unpacks to ./python — move its contents to runtime/
  mv "$tmp/python"/* "$runtime_dir/"

  local python="$runtime_dir/bin/python3"

  echo "[bake] pip installing hermes_home + bridge deps for $arch"
  "$python" -m pip install --upgrade pip wheel
  "$python" -m pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.32" \
    "pydantic>=2.9" \
    "httpx>=0.27" \
    "sse-starlette>=2.1"

  # Install hermes_home itself + vendored hermes_agent (if present).
  "$python" -m pip install --no-cache-dir "$ROOT/sidecar"

  if [[ -d "$ROOT/sidecar/hermes_home/vendor/hermes_agent" ]]; then
    echo "[bake] installing vendored hermes_agent for $arch"
    "$python" -m pip install --no-cache-dir "$ROOT/sidecar/hermes_home/vendor/hermes_agent"
  else
    echo "[bake] WARNING: no vendored hermes_agent subtree — stub bridge only."
  fi

  echo "[bake] pruning caches for $arch"
  find "$runtime_dir" -type d -name '__pycache__' -prune -exec rm -rf {} +
  find "$runtime_dir" -type d -name 'tests' -prune -exec rm -rf {} +
  find "$runtime_dir" -type f -name '*.pyc' -delete
  find "$runtime_dir" -type d -name '*.dist-info' -exec rm -rf {} + 2>/dev/null || true

  echo "[bake] done → $runtime_dir"
  du -sh "$runtime_dir"
}

for arch in "${arches[@]}"; do
  bake_one "$arch"
done
