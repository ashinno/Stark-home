"""Central input validators for sidecar routes.

Every user-supplied value that flows into a filesystem path or a CLI argv
element must pass through one of these helpers. Keeping them in one place
makes it easy to audit the rules and extend them as we add endpoints.
"""

from __future__ import annotations

import ipaddress
import re
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException

# Profiles live under ``<data_root>/profiles/<profile>/``. We require the
# stripped-down conventional shape: lowercase letters, digits, dash/underscore,
# 1-40 chars, no leading dash/digit. This rejects traversal sequences,
# separators, absolute paths, and leading-dash values that could be
# re-interpreted as CLI flags.
_SAFE_PROFILE_RE = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")

# A conservative allowlist for values handed to the hermes CLI as positional
# arguments: skill identifiers (``owner/name[@version]``), GitHub repos,
# session IDs, etc. Reject anything that argparse could consume as a flag.
_SAFE_ARGV_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._/@:+~-]{0,199}$")

# URL schemes we accept for MCP servers. ``file://`` is specifically excluded
# to block arbitrary local file access.
_ALLOWED_MCP_SCHEMES = frozenset({"stdio", "http", "https", "ws", "wss"})


def safe_profile(profile: str | None) -> str | None:
    """Return ``profile`` if it looks safe, ``None`` for empty/"default".

    Raise ``HTTPException(400)`` for anything else. Centralising this makes
    traversal impossible through any route that goes through the helper.
    """
    if profile is None or profile == "" or profile == "default":
        return None
    if not _SAFE_PROFILE_RE.match(profile):
        raise HTTPException(400, "invalid profile name")
    return profile


def safe_argv(value: str, *, field: str = "value") -> str:
    """Reject argv values that could be mis-parsed as flags or shell syntax."""
    if not value or not _SAFE_ARGV_RE.match(value):
        raise HTTPException(400, f"invalid {field}")
    return value


def safe_mcp_url(url: str) -> str:
    """Allow only vetted schemes + block loopback/private ranges.

    ``stdio://`` URLs carry a package reference, not a network host, so we
    accept any authority there.
    """
    if not url or len(url) > 2048:
        raise HTTPException(400, "invalid mcp url")
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_MCP_SCHEMES:
        raise HTTPException(400, f"mcp scheme not allowed: {scheme}")
    if scheme == "stdio":
        return url
    host = (parsed.hostname or "").strip()
    if not host:
        raise HTTPException(400, "mcp url missing host")
    # Block literal loopback / link-local / private ranges to stop SSRF into
    # cloud metadata, intranet, or the sidecar itself.
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        raise HTTPException(400, "mcp host not allowed")
    lowered = host.lower()
    if lowered in {"localhost", "metadata.google.internal"} or lowered.endswith(".localhost"):
        raise HTTPException(400, "mcp host not allowed")
    return url


def contained_path(base: Path, *parts: str) -> Path:
    """Join + resolve + assert the path stays inside ``base``.

    Belt-and-suspenders: ``safe_profile`` already rejects ``..`` sequences,
    but callers that build paths from other untrusted parts (filenames,
    log files etc.) should use this to defend against logic bugs.
    """
    base = base.resolve()
    candidate = base.joinpath(*parts).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise HTTPException(400, "path escapes base directory") from exc
    return candidate
