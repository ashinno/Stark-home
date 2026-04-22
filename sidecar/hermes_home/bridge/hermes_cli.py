"""Shared invoker for the local `hermes` CLI.

Every route that wants real data goes through here so we have one place that
strips ANSI, applies a sane environment (NO_COLOR, dumb TERM), and gracefully
falls back when the binary isn't on this Mac.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime
from typing import Any, Iterator

from .hermes_paths import detect

_ANSI = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def cli_path() -> str | None:
    paths = detect()
    if paths and paths.launcher_bin:
        return str(paths.launcher_bin)
    return shutil.which("hermes")


def available() -> bool:
    return cli_path() is not None


def _run(args: list[str], timeout: float = 12.0) -> str:
    bin_ = cli_path()
    if not bin_:
        return ""
    try:
        out = subprocess.run(
            [bin_, *args],
            capture_output=True,
            timeout=timeout,
            text=True,
            check=False,
            env={"NO_COLOR": "1", "TERM": "dumb", **os.environ},
        )
        return _ANSI.sub("", (out.stdout or "") + (("\n" + out.stderr) if out.stderr else ""))
    except Exception:
        return ""


# ─── helpers ────────────────────────────────────────────────────


def _split_table_lines(text: str) -> Iterator[str]:
    """Yield non-empty, non-divider, non-banner lines from a CLI table."""
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        # Reject pure divider rows (━ ─ ═ ┃ ┏ ┗ etc.)
        stripped = re.sub(r"\s+", "", line)
        if stripped and set(stripped) <= set("━─═┃┏┗┓┛┳┻┣┫╋│┌┐└┘┬┴├┤┼-=  "):
            continue
        # Reject decorative rich box-drawing rows (which contain only box glyphs + spaces)
        if all(ch in " ━─═┃┏┗┓┛┳┻┣┫╋│┌┐└┘┬┴├┤┼-=" for ch in line):
            continue
        yield line


def _ts_from_session_id(sid: str) -> int | None:
    """`20260422_101637_624dd6` → unix seconds."""
    m = re.match(r"(?:cron_[0-9a-f]+_)?(\d{8})_(\d{6})", sid)
    if not m:
        return None
    try:
        dt = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
        return int(dt.timestamp())
    except Exception:
        return None


def _approx_seconds_ago(label: str) -> int | None:
    """`5d ago` / `1h ago` / `38m ago` / `yesterday` / `2026-04-13` → unix sec."""
    label = label.strip().lower()
    if not label or label == "—":
        return None
    if label == "yesterday":
        return int(time.time()) - 86400
    if label == "today":
        return int(time.time())
    m = re.match(r"(\d+)\s*([smhd])\s*ago", label)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        mult = {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]
        return int(time.time()) - n * mult
    # absolute date YYYY-MM-DD
    try:
        return int(datetime.strptime(label[:10], "%Y-%m-%d").timestamp())
    except Exception:
        return None


# ─── sessions ──────────────────────────────────────────────────


def list_sessions(profile: str | None) -> list[dict[str, Any]]:
    """Parse `hermes [-p profile] sessions list` into Thread-shaped dicts."""
    args: list[str] = []
    if profile and profile != "default":
        args += ["-p", profile]
    args += ["sessions", "list"]
    text = _run(args)
    if not text:
        return []

    rows: list[dict[str, Any]] = []
    header_seen = False
    is_default_format = False
    for line in _split_table_lines(text):
        # Detect header row
        if "Last Active" in line and ("ID" in line or "Preview" in line):
            header_seen = True
            is_default_format = "Title" not in line.split("Preview")[0] if "Preview" in line else False
            continue
        if not header_seen:
            continue
        # Robust split: collapse runs of 2+ spaces.
        cols = re.split(r"\s{2,}", line.strip())
        # Two formats:
        #   default profile: Preview · LastActive · Source · ID
        #   per-profile:     Title · Preview · LastActive · ID
        if is_default_format:
            if len(cols) < 4:
                continue
            preview, last_active, source, sid = cols[0], cols[-3], cols[-2], cols[-1]
            title = (preview[:60] + "…") if len(preview) > 60 else preview
        else:
            if len(cols) < 4:
                continue
            title, preview, last_active, sid = cols[0], cols[1], cols[-2], cols[-1]
            source = "cli"
            if title == "—":
                title = (preview[:60] + "…") if preview and preview != "—" else "Untitled"
        if title == "—":
            title = "Untitled"
        ts = _ts_from_session_id(sid) or _approx_seconds_ago(last_active) or int(time.time())
        rows.append({
            "id": sid,
            "title": title.strip(),
            "preview": preview.strip(),
            "last_active": last_active.strip(),
            "source": source.strip(),
            "started_at": ts,
            "updated_at": ts,
            "messages": 0,
            "running": False,
            "pinned": False,
        })
    return rows


def read_session(profile: str | None, sid: str) -> dict[str, Any] | None:
    """Export a single session as JSON. Returns the parsed object."""
    args: list[str] = []
    if profile and profile != "default":
        args += ["-p", profile]
    args += ["sessions", "export", "--session-id", sid, "-"]
    text = _run(args, timeout=20.0)
    if not text:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


# ─── skills ────────────────────────────────────────────────────


def list_skills(profile: str | None) -> list[dict[str, Any]]:
    """Parse `hermes skills list` (Rich box table)."""
    args: list[str] = []
    if profile and profile != "default":
        args += ["-p", profile]
    args += ["skills", "list"]
    text = _run(args)
    if not text:
        return []

    rows: list[dict[str, Any]] = []
    header_seen = False
    for raw in text.splitlines():
        line = raw.rstrip()
        # Rich draws headers with ┃ (heavy) and body rows with │ (light).
        # Detect header by content, then parse all subsequent rows that have
        # any column separator.
        if not header_seen:
            if "Name" in line and ("Trust" in line or "Source" in line):
                header_seen = True
            continue
        if "│" not in line and "┃" not in line:
            continue
        # Replace heavy with light, then split.
        normalized = line.replace("┃", "│")
        cols = [c.strip() for c in normalized.strip().strip("│").split("│")]
        if len(cols) < 4:
            continue
        name, category, source, trust = cols[0], cols[1], cols[2], cols[3]
        if not name or name.startswith("━"):
            continue
        # truncated names end with "…" — keep them as-is
        rows.append({
            "id": f"skl_{re.sub(r'[^a-z0-9]', '_', name.lower())[:32]}",
            "name": name,
            "category": category,
            "source": source,
            "trust": trust,
            "enabled": True,
            "trigger": category or "on demand",
            "steps": [],
            "runs": 0,
            "last_run": None,
        })
    return rows


# ─── cron ──────────────────────────────────────────────────────


def list_cron(profile: str | None = None) -> list[dict[str, Any]]:
    """Parse `hermes cron list` block-style output."""
    args: list[str] = []
    if profile and profile != "default":
        args += ["-p", profile]
    args += ["cron", "list"]
    text = _run(args)
    if not text:
        return []

    rows: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    # Lines look like:
    #   7c7971022130 [active]
    #     Name: notion-token-keeper
    #     Schedule: every 10080m
    #     Repeat: ∞
    #     Next run: 2026-04-23T...
    #     Deliver: origin
    #     Last run: 2026-04-16T...  ok
    job_re = re.compile(r"^\s+([0-9a-f]{8,})\s*\[(\w+)\]")
    for raw in text.splitlines():
        m = job_re.match(raw)
        if m:
            if current:
                rows.append(current)
            current = {
                "id": m.group(1),
                "state": m.group(2),
                "enabled": m.group(2) == "active",
                "name": m.group(1),
                "nl": "",
                "cron": "",
                "delivery": "origin",
                "last_run": None,
                "next_run": None,
                "history": [],
            }
            continue
        if current and ":" in raw:
            k, _, v = raw.partition(":")
            key = k.strip().lower()
            value = v.strip()
            if key == "name":
                current["name"] = value
            elif key == "schedule":
                current["nl"] = value
                current["cron"] = value
            elif key == "deliver":
                current["delivery"] = value
            elif key == "next run":
                current["next_run"] = _iso_to_unix(value)
            elif key == "last run":
                # may have trailing " ok" / " fail"
                ts_part = value.split()[0]
                current["last_run"] = _iso_to_unix(ts_part)
    if current:
        rows.append(current)
    return rows


def _iso_to_unix(s: str) -> int | None:
    try:
        # strip fractional seconds + tz strangeness for fromisoformat
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


# ─── mcp ──────────────────────────────────────────────────────


def list_mcp(profile: str | None = None) -> list[dict[str, Any]]:
    args: list[str] = []
    if profile and profile != "default":
        args += ["-p", profile]
    args += ["mcp", "list"]
    text = _run(args)
    if not text or "No MCP servers configured" in text:
        return []
    # Parse simple two-column table; format may evolve.
    rows: list[dict[str, Any]] = []
    for line in _split_table_lines(text):
        if line.lower().startswith(("name", "add one", "hermes mcp")):
            continue
        cols = re.split(r"\s{2,}", line.strip(), maxsplit=2)
        if len(cols) < 2:
            continue
        name = cols[0].strip()
        url = cols[1].strip() if len(cols) > 1 else ""
        rows.append({
            "id": f"mcp_{re.sub(r'[^a-z0-9]', '_', name.lower())[:24]}",
            "name": name,
            "url": url,
            "enabled": True,
            "tools": 0,
        })
    return rows
