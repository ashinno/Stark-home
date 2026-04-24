"""System dashboard adapters for Hermes-native operations.

This route intentionally reads the same local sources the Hermes web dashboard
uses: the Hermes CLI, ~/.hermes/config.yaml, ~/.hermes/.env, logs, and gateway
state. The renderer presents these as safer, task-oriented panels.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import gateway_probe, hermes_cli
from ..hermes_paths import detect
from ..store import get_store
from ..validation import safe_profile

router = APIRouter(prefix="/system", tags=["system"])


class SaveText(BaseModel):
    text: str


class SaveSecret(BaseModel):
    value: str


def _profile(profile: str | None) -> str | None:
    # Query-string path: validate immediately so traversal sequences never
    # reach any path-builder.
    if profile is not None:
        return safe_profile(profile)
    # Settings path: the store may still carry a pre-validation value written
    # by an earlier build. Re-validate, but silently fall back to the default
    # profile instead of 400-ing — the UI should never see a broken system
    # route just because an old profile string is stuck in the store.
    settings = get_store().read("settings") or {}
    stored = settings.get("active_profile")
    if not stored:
        return None
    try:
        return safe_profile(stored)
    except Exception:
        return None


def _data_root() -> Path:
    paths = detect()
    return Path(paths.data_root) if paths else Path.home() / ".hermes"


def _config_path() -> Path:
    paths = detect()
    return Path(paths.config_path) if paths else Path.home() / ".hermes" / "config.yaml"


def _env_path(profile: str | None = None) -> Path:
    prof = _profile(profile)
    base = _data_root()
    if prof and prof != "default":
        return base / "profiles" / prof / ".env"
    return base / ".env"


def _fingerprint(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _version() -> str | None:
    bin_ = hermes_cli.cli_path()
    if not bin_:
        return None
    try:
        from ..subprocess_env import sanitized_env
        out = subprocess.run(
            [bin_, "--version"],
            capture_output=True,
            text=True,
            timeout=4,
            env=sanitized_env(),
        )
    except Exception:
        return None
    text = f"{out.stdout or ''}\n{out.stderr or ''}"
    match = re.search(r"v?(\d+\.\d+\.\d+)", text)
    return match.group(1) if match else text.strip()[:80] or None


def _session_usage(body: dict[str, Any]) -> dict[str, int]:
    """Find usage payloads in exported session JSON across old/new schemas."""
    totals = {"input": 0, "output": 0, "total": 0}

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            usage = obj.get("usage")
            if isinstance(usage, dict):
                inp = (
                    usage.get("inputTokens")
                    or usage.get("input_tokens")
                    or usage.get("prompt_tokens")
                    or usage.get("promptTokens")
                    or 0
                )
                out = (
                    usage.get("outputTokens")
                    or usage.get("output_tokens")
                    or usage.get("completion_tokens")
                    or usage.get("completionTokens")
                    or 0
                )
                total = usage.get("totalTokens") or usage.get("total_tokens") or 0
                totals["input"] += int(inp or 0)
                totals["output"] += int(out or 0)
                totals["total"] += int(total or 0)
            for value in obj.values():
                walk(value)
        elif isinstance(obj, list):
            for value in obj:
                walk(value)

    walk(body)
    if not totals["total"]:
        totals["total"] = totals["input"] + totals["output"]
    return totals


def _log_candidates() -> dict[str, Path]:
    root = _data_root()
    names = {
        "agent": ["agent.log", "hermes.log", "logs/agent.log", "logs/hermes.log"],
        "errors": ["errors.log", "error.log", "logs/errors.log", "logs/error.log"],
        "gateway": ["gateway.log", "logs/gateway.log"],
    }
    out: dict[str, Path] = {}
    for key, rels in names.items():
        for rel in rels:
            p = root / rel
            if p.exists():
                out[key] = p
                break
        out.setdefault(key, root / rels[0])
    return out


def _read_tail(path: Path, max_lines: int) -> list[str]:
    if not path.exists():
        return []
    try:
        text = path.read_text(errors="replace")
    except Exception:
        return []
    return text.splitlines()[-max_lines:]


def _match_log(line: str, level: str, component: str) -> bool:
    lower = line.lower()
    if level != "all" and level.lower() not in lower:
        return False
    if component != "all" and component.lower() not in lower:
        return False
    return True


_ENV_GROUPS: dict[str, list[dict[str, Any]]] = {
    "OAuth": [
        {"key": "ANTHROPIC_TOKEN", "label": "Anthropic Claude API", "docs": "https://docs.claude.com/en/api/getting-started"},
        {"key": "CHATGPT", "label": "OpenAI Codex / ChatGPT", "docs": "https://platform.openai.com/docs"},
        {"key": "NOUS_API_KEY", "label": "Nous Portal", "docs": "https://portal.nousresearch.com"},
        {"key": "QWEN_OAUTH_TOKEN", "label": "Qwen OAuth", "docs": "https://github.com/QwenLM/qwen-code"},
    ],
    "LLM Providers": [
        {"key": "OPENAI_API_KEY", "label": "OpenAI", "docs": "https://platform.openai.com/api-keys"},
        {"key": "ANTHROPIC_API_KEY", "label": "Anthropic", "docs": "https://console.anthropic.com/settings/keys"},
        {"key": "OPENROUTER_API_KEY", "label": "OpenRouter", "docs": "https://openrouter.ai/keys"},
        {"key": "DASHSCOPE_API_KEY", "label": "DashScope / Qwen", "docs": "https://modelstudio.console.alibabacloud.com/"},
        {"key": "DEEPSEEK_API_KEY", "label": "DeepSeek", "docs": "https://platform.deepseek.com/api_keys"},
        {"key": "GEMINI_API_KEY", "label": "Gemini", "docs": "https://aistudio.google.com/app/apikey"},
        {"key": "HUGGINGFACE_API_KEY", "label": "Hugging Face", "docs": "https://huggingface.co/settings/tokens"},
        {"key": "MOONSHOT_API_KEY", "label": "Kimi / Moonshot", "docs": "https://platform.moonshot.cn/"},
        {"key": "MINIMAX_API_KEY", "label": "MiniMax", "docs": "https://www.minimax.io/"},
        {"key": "XAI_API_KEY", "label": "xAI / Other", "docs": "https://console.x.ai/"},
    ],
    "Tools": [
        {"key": "FIRECRAWL_API_KEY", "label": "Firecrawl", "docs": "https://firecrawl.dev/"},
        {"key": "BROWSER_USE_API_KEY", "label": "Browser Use Cloud", "docs": "https://browser-use.com/"},
        {"key": "FAL_KEY", "label": "Fal image generation", "docs": "https://fal.ai/"},
        {"key": "GITHUB_TOKEN", "label": "GitHub", "docs": "https://github.com/settings/tokens"},
    ],
    "Messaging": [
        {"key": "TELEGRAM_BOT_TOKEN", "label": "Telegram bot token", "docs": "https://t.me/BotFather"},
        {"key": "TELEGRAM_ALLOWED_USERS", "label": "Telegram allowed users", "docs": "https://t.me/userinfobot"},
        {"key": "DISCORD_BOT_TOKEN", "label": "Discord bot token", "docs": "https://discord.com/developers/applications"},
        {"key": "SLACK_BOT_TOKEN", "label": "Slack bot token", "docs": "https://api.slack.com/apps"},
        {"key": "WEBHOOK_ENABLED", "label": "Webhook adapter"},
        {"key": "WEIXIN_TOKEN", "label": "WeChat token"},
    ],
    "Runtime": [
        {"key": "HERMES_MAX_ITERATIONS", "label": "Max tool iterations"},
        {"key": "HERMES_MODEL", "label": "Default model"},
        {"key": "HERMES_TOOLSETS", "label": "Toolsets"},
    ],
}


@router.get("/overview")
async def overview(profile: str | None = Query(default=None)) -> dict[str, Any]:
    prof = _profile(profile)
    available = hermes_cli.available()

    # Each hermes_cli.* call spawns a subprocess (seconds). Fan them out in a
    # thread pool so the endpoint is bounded by the slowest call, not the sum.
    if available:
        all_sessions, cron, skills, gateways, daemon = await asyncio.gather(
            asyncio.to_thread(hermes_cli.list_sessions, prof),
            asyncio.to_thread(hermes_cli.list_cron, prof),
            asyncio.to_thread(hermes_cli.list_skills, prof),
            asyncio.to_thread(gateway_probe.list_gateways, prof),
            asyncio.to_thread(gateway_probe.gateway_running, prof),
        )
    else:
        all_sessions = get_store().read("threads") or []
        cron = get_store().read("tasks") or []
        skills = get_store().read("skills") or []
        gateways, daemon = await asyncio.gather(
            asyncio.to_thread(gateway_probe.list_gateways, prof),
            asyncio.to_thread(gateway_probe.gateway_running, prof),
        )

    connected = [g for g in gateways if g.get("configured") or g.get("status") == "online"]
    return {
        "available": available,
        "version": _version(),
        "profile": prof,
        "gateway": daemon,
        "platforms": connected,
        "recent_sessions": all_sessions[:5],
        "counts": {
            "sessions": len(all_sessions),
            "skills": len(skills),
            "cron": len(cron),
            "platforms": len(connected),
        },
    }


@router.post("/gateway/restart")
async def restart_gateway(profile: str | None = Query(default=None)) -> dict[str, Any]:
    prof = _profile(profile)
    bin_ = hermes_cli.cli_path()
    if not bin_:
        raise HTTPException(503, "Engine CLI is not available")
    args = [bin_]
    if prof and prof != "default":
        args += ["-p", prof]
    args += ["gateway", "restart"]
    from ..subprocess_env import sanitized_env
    out = subprocess.run(args, capture_output=True, text=True, timeout=20, env=sanitized_env())
    return {"ok": out.returncode == 0, "stdout": out.stdout[-600:], "stderr": out.stderr[-600:]}


@router.get("/analytics")
async def analytics(
    profile: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=180),
    scan: int = Query(default=80, ge=10, le=200),
) -> dict[str, Any]:
    prof = _profile(profile)
    sessions = hermes_cli.list_sessions(prof) if hermes_cli.available() else get_store().read("threads") or []
    since = int(time.time()) - days * 86400
    window = [s for s in sessions if int(s.get("updated_at") or 0) >= since]
    sample = window[:scan]

    usage_by_day: dict[str, dict[str, int]] = defaultdict(lambda: {"sessions": 0, "input": 0, "output": 0})
    models: Counter[str] = Counter()
    api_calls = 0
    totals = {"input": 0, "output": 0, "total": 0}

    def read(s: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
        sid = s.get("id")
        if not sid or not hermes_cli.available():
            return s, None
        return s, hermes_cli.read_session(prof, sid)

    with ThreadPoolExecutor(max_workers=8) as pool:
        bodies = list(pool.map(read, sample))

    for session, body in bodies:
        ts = int(session.get("updated_at") or session.get("started_at") or time.time())
        day = time.strftime("%b %d", time.localtime(ts))
        usage_by_day[day]["sessions"] += 1
        model = str((body or {}).get("model") or session.get("model") or "unknown")
        models[model] += 1
        messages = (body or {}).get("messages") or []
        api_calls += max(1, len([m for m in messages if isinstance(m, dict) and m.get("role") == "assistant"]))
        usage = _session_usage(body or {})
        for key in totals:
            totals[key] += usage[key]
        usage_by_day[day]["input"] += usage["input"]
        usage_by_day[day]["output"] += usage["output"]

    skills = hermes_cli.list_skills(prof) if hermes_cli.available() else get_store().read("skills") or []
    top_skills = sorted(
        [
            {
                "name": s.get("name") or s.get("id"),
                "category": s.get("category") or s.get("source") or "skill",
                "runs": int(s.get("runs") or 0),
                "last_run": s.get("last_run"),
            }
            for s in skills
        ],
        key=lambda row: row["runs"],
        reverse=True,
    )[:12]

    return {
        "period_days": days,
        "total_sessions": len(window),
        "sampled_sessions": len(sample),
        "api_calls": api_calls,
        "tokens": totals,
        "daily": [
            {"date": day, **vals}
            for day, vals in sorted(
                usage_by_day.items(),
                key=lambda item: time.strptime(f"{item[0]} {time.localtime().tm_year}", "%b %d %Y"),
            )
        ],
        "models": [{"model": name, "sessions": count} for name, count in models.most_common()],
        "top_skills": top_skills,
    }


@router.get("/logs")
async def logs(
    file: str = Query(default="agent"),
    level: str = Query(default="all"),
    component: str = Query(default="all"),
    lines: int = Query(default=100, ge=20, le=1000),
) -> dict[str, Any]:
    candidates = _log_candidates()
    if file not in candidates:
        raise HTTPException(400, "unknown log file")
    path = candidates[file]
    raw = _read_tail(path, max(lines * 4, lines))
    filtered = [line for line in raw if _match_log(line, level, component)][-lines:]
    return {
        "file": file,
        "path": str(path),
        "exists": path.exists(),
        "lines": filtered,
        "files": [{"id": key, "path": str(value), "exists": value.exists()} for key, value in candidates.items()],
    }


@router.get("/config")
async def config() -> dict[str, Any]:
    path = _config_path()
    text = path.read_text(errors="replace") if path.exists() else ""
    sections: list[dict[str, Any]] = []
    current = None
    count = 0
    for line in text.splitlines():
        top = re.match(r"^([A-Za-z0-9_-]+):\s*(?:#.*)?$", line)
        field = re.match(r"^\s{2,}([A-Za-z0-9_-]+):", line)
        if top:
            if current:
                current["fields"] = count
                sections.append(current)
            current = {"id": top.group(1), "label": top.group(1).replace("_", " ").title(), "fields": 0}
            count = 0
        elif field and current:
            count += 1
    if current:
        current["fields"] = count
        sections.append(current)
    return {"path": str(path), "exists": path.exists(), "text": text, "sections": sections}


# Keep at most this many timestamped ``.bak.*`` files around; older ones are
# pruned. Prevents an unbounded disk-fill + reduces the window in which a
# stale copy of secrets sits on disk.
_MAX_CONFIG_BACKUPS = 10


@router.put("/config")
async def save_config(body: SaveText) -> dict[str, Any]:
    if len(body.text) > 2_000_000:
        raise HTTPException(400, "config too large")
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = path.with_suffix(f".yaml.bak.{int(time.time())}")
        backup.write_text(path.read_text(errors="replace"))
        # Prune older backups, keeping the newest _MAX_CONFIG_BACKUPS.
        try:
            pattern = f"{path.name}.bak.*"
            olds = sorted(
                path.parent.glob(pattern),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for stale in olds[_MAX_CONFIG_BACKUPS:]:
                try:
                    stale.unlink()
                except OSError:
                    pass
        except Exception:
            pass
    path.write_text(body.text)
    return {"ok": True, "path": str(path)}


@router.get("/env")
async def env(profile: str | None = Query(default=None)) -> dict[str, Any]:
    path = _env_path(profile)
    values = gateway_probe.parse_env(path)
    known = {item["key"] for rows in _ENV_GROUPS.values() for item in rows}
    groups = []
    for name, specs in _ENV_GROUPS.items():
        rows = []
        for spec in specs:
            value = values.get(spec["key"], "")
            rows.append({
                **spec,
                "set": bool(value),
                "preview": _fingerprint(value),
            })
        groups.append({
            "name": name,
            "configured": len([r for r in rows if r["set"]]),
            "total": len(rows),
            "items": rows,
        })
    other = [
        {"key": key, "label": key, "set": True, "preview": _fingerprint(value)}
        for key, value in sorted(values.items())
        if key not in known
    ]
    if other:
        groups.append({"name": "Other", "configured": len(other), "total": len(other), "items": other})
    return {"path": str(path), "exists": path.exists(), "groups": groups}


def _write_env(path: Path, key: str, value: str | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(errors="replace").splitlines() if path.exists() else []
    out: list[str] = []
    done = False
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=")
    for line in lines:
        if pattern.match(line):
            if value is not None:
                safe = json.dumps(value)
                out.append(f"{key}={safe}")
            done = True
        else:
            out.append(line)
    if not done and value is not None:
        out.append(f"{key}={json.dumps(value)}")
    path.write_text("\n".join(out).rstrip() + "\n")


@router.put("/env/{key}")
async def save_env_key(key: str, body: SaveSecret, profile: str | None = Query(default=None)) -> dict[str, Any]:
    if not re.match(r"^[A-Z][A-Z0-9_]*$", key):
        raise HTTPException(400, "invalid env key")
    _write_env(_env_path(profile), key, body.value)
    return {"ok": True, "key": key}


@router.delete("/env/{key}")
async def clear_env_key(key: str, profile: str | None = Query(default=None)) -> dict[str, Any]:
    if not re.match(r"^[A-Z][A-Z0-9_]*$", key):
        raise HTTPException(400, "invalid env key")
    _write_env(_env_path(profile), key, None)
    return {"ok": True, "key": key}
