"""Shared invoker for the local `hermes` CLI.

Every route that wants real data goes through here so we have one place that
strips ANSI, applies a sane environment (NO_COLOR, dumb TERM), and gracefully
falls back when the binary isn't on this Mac.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
from datetime import datetime
from typing import Any, Iterator

from .hermes_paths import detect
from .subprocess_env import sanitized_env

_ANSI = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def cli_path() -> str | None:
    paths = detect()
    if paths and paths.launcher_bin:
        return str(paths.launcher_bin)
    return shutil.which("hermes")


def available() -> bool:
    return cli_path() is not None


def _run(args: list[str], timeout: float = 12.0) -> str:
    return _run_result(args, timeout=timeout)[1]


def _run_result(args: list[str], timeout: float = 12.0) -> tuple[int, str]:
    bin_ = cli_path()
    if not bin_:
        return 127, ""
    try:
        out = subprocess.run(
            [bin_, *args],
            capture_output=True,
            timeout=timeout,
            text=True,
            check=False,
            env=sanitized_env({"NO_COLOR": "1", "TERM": "dumb"}),
        )
        text = _ANSI.sub("", (out.stdout or "") + (("\n" + out.stderr) if out.stderr else ""))
        return out.returncode, text
    except Exception as exc:
        return 1, str(exc)


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


def _table_cells(line: str) -> list[str] | None:
    if "│" not in line and "┃" not in line:
        return None
    normalized = line.replace("┃", "│").strip()
    cells = [c.strip() for c in normalized.strip("│").split("│")]
    if not cells or all(not c for c in cells):
        return None
    if any(set(c.replace(" ", "")) <= set("━─═┳┻╋┬┴┼-= ") and c for c in cells):
        return None
    return cells


def _skill_id(*parts: str) -> str:
    raw = "_".join(p for p in parts if p).lower()
    slug = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
    return f"skl_{slug[:56] or 'skill'}"


def _join_wrapped(a: str, b: str) -> str:
    if not b:
        return a
    if not a:
        return b
    if a.endswith("...") or a.endswith("…"):
        return a
    return f"{a} {b}"


def _profile_args(profile: str | None) -> list[str]:
    # Defence in depth: even if a caller forgot to validate, refuse to pass
    # an unsafe profile name to the hermes CLI. This is the last line before
    # the subprocess boundary — the right place for a hard check.
    from .validation import safe_profile

    prof = safe_profile(profile)
    if prof:
        return ["-p", prof]
    return []


def _normalize_trust(trust: str) -> str:
    return trust.replace("★", "").strip()


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
    args = [*_profile_args(profile), "sessions", "list"]
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
    from .validation import safe_argv

    # sid flows into argv as the value of ``--session-id``. Reject anything
    # that could be re-parsed as a flag or contains shell/argv metachars.
    safe_sid = safe_argv(sid, field="session id")
    args = [*_profile_args(profile), "sessions", "export", "--session-id", safe_sid, "-"]
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
    args = [*_profile_args(profile), "skills", "list"]
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
        cols = _table_cells(line)
        if not cols or len(cols) < 4:
            continue
        name, category, source, trust = (cols + ["", "", "", ""])[:4]
        if not name or name.startswith("━"):
            continue
        if not category and not source and not trust and rows:
            rows[-1]["name"] = _join_wrapped(rows[-1]["name"], name)
            rows[-1]["id"] = _skill_id(rows[-1].get("source", ""), rows[-1]["name"])
            continue
        if not source and not trust:
            continue
        rows.append(
            {
                "id": _skill_id(source, name),
                "identifier": name,
                "name": name,
                "description": "",
                "category": category,
                "source": source or "hermes",
                "trust": _normalize_trust(trust),
                "installed": True,
                "enabled": True,
                "trigger": category or "on demand",
                "steps": [],
                "runs": 0,
                "last_run": None,
            }
        )
    return rows


def _parse_market_table(text: str, *, mode: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    header_seen = False
    current: dict[str, Any] | None = None

    for raw in text.splitlines():
        line = raw.rstrip()
        if not header_seen:
            if "Description" in line and "Source" in line and "Trust" in line:
                header_seen = True
            continue
        cols = _table_cells(line)
        if not cols:
            continue

        if mode == "browse":
            cols = (cols + ["", "", "", "", ""])[:5]
            index, name, description, source, trust = cols
            is_new = index.isdigit() and bool(name)
            identifier = name
        else:
            cols = (cols + ["", "", "", "", ""])[:5]
            name, description, source, trust, identifier = cols
            is_new = bool(name)
            identifier = identifier or name
            if "…" in identifier or "..." in identifier:
                identifier = name

        if is_new:
            current = {
                "id": _skill_id("marketplace", identifier or name),
                "identifier": identifier or name,
                "name": name,
                "description": description,
                "category": "",
                "source": source,
                "trust": _normalize_trust(trust),
                "installed": False,
                "enabled": True,
                "trigger": "on demand",
                "steps": [],
                "runs": 0,
                "last_run": None,
            }
            rows.append(current)
            continue

        if current:
            # Rich wraps long descriptions and sometimes identifiers onto
            # continuation rows. Preserve useful text and ignore decorative gaps.
            current["description"] = _join_wrapped(current.get("description", ""), description)
            if mode == "search" and identifier and not current["identifier"].endswith("…"):
                current["identifier"] = _join_wrapped(current["identifier"], identifier)
                current["id"] = _skill_id("marketplace", current["identifier"])
    return rows


def _installed_names(profile: str | None) -> set[str]:
    names: set[str] = set()
    for skill in list_skills(profile):
        name = (skill.get("name") or "").strip().lower()
        identifier = (skill.get("identifier") or "").strip().lower()
        if name:
            names.add(name)
        if identifier:
            names.add(identifier)
            names.add(identifier.split("/")[-1])
    return names


def _mark_installed(items: list[dict[str, Any]], profile: str | None) -> list[dict[str, Any]]:
    installed = _installed_names(profile)
    for item in items:
        name = (item.get("name") or "").strip().lower()
        identifier = (item.get("identifier") or "").strip().lower()
        item["installed"] = bool(
            name in installed
            or identifier in installed
            or (identifier and identifier.split("/")[-1] in installed)
        )
    return items


def browse_skills(
    profile: str | None,
    *,
    page: int = 1,
    size: int = 20,
    source: str = "all",
) -> dict[str, Any]:
    args = [
        *_profile_args(profile),
        "skills",
        "browse",
        "--page",
        str(max(1, page)),
        "--size",
        str(max(1, min(size, 50))),
        "--source",
        source,
    ]
    text = _run(args, timeout=20.0)
    items = _mark_installed(_parse_market_table(text, mode="browse"), profile)
    page_match = re.search(r"page\s+(\d+)\s*/\s*(\d+)", text, re.IGNORECASE)
    loaded_match = re.search(r"\((\d+)\s+skills?\s+loaded", text, re.IGNORECASE)
    return {
        "skills": items,
        "page": int(page_match.group(1)) if page_match else page,
        "pages": int(page_match.group(2)) if page_match else page,
        "total": int(loaded_match.group(1)) if loaded_match else len(items),
        "source": source,
    }


def search_skills(
    profile: str | None,
    query: str,
    *,
    limit: int = 20,
    source: str = "all",
) -> dict[str, Any]:
    args = [
        *_profile_args(profile),
        "skills",
        "search",
        query,
        "--source",
        source,
        "--limit",
        str(max(1, min(limit, 50))),
    ]
    text = _run(args, timeout=20.0)
    return {
        "skills": _mark_installed(_parse_market_table(text, mode="search"), profile),
        "query": query,
        "source": source,
    }


def inspect_skill(profile: str | None, identifier: str) -> dict[str, Any]:
    code, text = _run_result([*_profile_args(profile), "skills", "inspect", identifier], timeout=20.0)
    if code != 0 or not text.strip() or text.strip().startswith("Error:"):
        raise RuntimeError(text.strip() or "Skill inspect failed.")
    meta: dict[str, str] = {}
    preview_lines: list[str] = []
    in_preview = False
    last_meta: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if "SKILL.md Preview" in line:
            in_preview = True
            continue
        content = line.strip("│╭╮╰╯─ ").rstrip()
        if not content:
            continue
        if in_preview:
            if "hermes skills install" in content:
                continue
            preview_lines.append(content)
            continue
        m = re.match(r"(Name|Description|Source|Trust|Identifier|Tags):\s*(.*)", content)
        if m:
            last_meta = m.group(1).lower()
            meta[last_meta] = _join_wrapped(meta.get(last_meta, ""), m.group(2).strip())
        elif last_meta in {"description", "tags"}:
            meta[last_meta] = _join_wrapped(meta.get(last_meta, ""), content)
    skill = {
        "id": _skill_id("marketplace", meta.get("identifier", identifier)),
        "identifier": meta.get("identifier", identifier),
        "name": meta.get("name", identifier),
        "description": meta.get("description", ""),
        "category": "",
        "source": meta.get("source", ""),
        "trust": _normalize_trust(meta.get("trust", "")),
        "installed": False,
        "enabled": True,
        "trigger": "on demand",
        "steps": [],
        "runs": 0,
        "last_run": None,
    }
    _mark_installed([skill], profile)
    return {"skill": skill, "preview": "\n".join(preview_lines[:120])}


def install_skill(profile: str | None, identifier: str) -> dict[str, Any]:
    # ``--`` stops argparse from treating a leading-dash identifier as a flag.
    code, text = _run_result(
        [*_profile_args(profile), "skills", "install", "--yes", "--", identifier],
        timeout=120.0,
    )
    if code != 0 or "Error:" in text:
        raise RuntimeError(text.strip() or "Skill install failed.")
    return {"identifier": identifier, "output": text.strip()}


def add_skill_tap(profile: str | None, repo: str) -> dict[str, Any]:
    code, text = _run_result(
        [*_profile_args(profile), "skills", "tap", "add", "--", repo],
        timeout=60.0,
    )
    if code != 0 or "Error:" in text:
        raise RuntimeError(text.strip() or "Skill source import failed.")
    return {"repo": repo, "output": text.strip()}


# ─── cron ──────────────────────────────────────────────────────


def list_cron(profile: str | None = None) -> list[dict[str, Any]]:
    """Parse `hermes cron list` block-style output."""
    args = [*_profile_args(profile), "cron", "list"]
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
    args = [*_profile_args(profile), "mcp", "list"]
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
