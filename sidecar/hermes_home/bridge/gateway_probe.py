"""Real gateway state for the Hermes user.

Each Hermes profile has its own:
  • <profile>/.env — secrets (TELEGRAM_BOT_TOKEN, DISCORD_TOKEN, etc.)
  • <profile>/gateway_state.json — live per-platform connection state
  • <profile>/gateway.pid — running gateway process id

This module reads all three and produces a uniform `Gateway` dict per channel
so the UI can show "already configured · live" instead of an empty stub.

Channel-key map: per channel we know which env keys count as "configured" and
which are required vs. optional. Optional ones decorate the Settings UI.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .hermes_paths import detect


@dataclass
class FieldSpec:
    key: str
    label: str
    secret: bool = False
    required: bool = True


@dataclass
class ChannelSpec:
    id: str
    name: str
    fields: list[FieldSpec] = field(default_factory=list)
    # platform key inside gateway_state.json["platforms"]
    state_key: str | None = None


CHANNELS: list[ChannelSpec] = [
    ChannelSpec(
        id="telegram",
        name="Telegram",
        state_key="telegram",
        fields=[
            FieldSpec("TELEGRAM_BOT_TOKEN", "Bot token", secret=True),
            FieldSpec("TELEGRAM_ALLOWED_USERS", "Allowed users", required=False),
            FieldSpec("TELEGRAM_HOME_CHANNEL", "Home channel", required=False),
        ],
    ),
    ChannelSpec(
        id="discord",
        name="Discord",
        state_key="discord",
        fields=[
            FieldSpec("DISCORD_BOT_TOKEN", "Bot token", secret=True),
            FieldSpec("DISCORD_ALLOWED_USERS", "Allowed users", required=False),
            FieldSpec("DISCORD_HOME_CHANNEL", "Home channel", required=False),
        ],
    ),
    ChannelSpec(
        id="slack",
        name="Slack",
        state_key="slack",
        fields=[
            FieldSpec("SLACK_BOT_TOKEN", "Bot token", secret=True),
            FieldSpec("SLACK_SIGNING_SECRET", "Signing secret", secret=True),
            FieldSpec("SLACK_APP_TOKEN", "App token", secret=True, required=False),
        ],
    ),
    ChannelSpec(
        id="whatsapp",
        name="WhatsApp",
        state_key="whatsapp",
        fields=[
            FieldSpec("WHATSAPP_ENABLED", "Enabled (1/0)", required=False),
            FieldSpec("WHATSAPP_MODE", "Mode", required=False),
            FieldSpec("WHATSAPP_ALLOWED_USERS", "Allowed users", required=False),
        ],
    ),
    ChannelSpec(
        id="signal",
        name="Signal",
        state_key="signal",
        fields=[
            FieldSpec("SIGNAL_NUMBER", "Signal number"),
            FieldSpec("SIGNAL_ALLOWED_USERS", "Allowed users", required=False),
        ],
    ),
    ChannelSpec(
        id="weixin",
        name="WeChat",
        state_key="weixin",
        fields=[
            FieldSpec("WEIXIN_TOKEN", "WeChat token", secret=True),
            FieldSpec("WEIXIN_ACCOUNT_ID", "Account ID", required=False),
            FieldSpec("WEIXIN_BASE_URL", "Base URL", required=False),
        ],
    ),
    ChannelSpec(
        id="email",
        name="Email",
        state_key="email",
        fields=[
            FieldSpec("EMAIL_IMAP_HOST", "IMAP host"),
            FieldSpec("EMAIL_SMTP_HOST", "SMTP host"),
            FieldSpec("EMAIL_USER", "Username"),
            FieldSpec("EMAIL_PASS", "Password", secret=True),
        ],
    ),
]


# ─── env file reader ────────────────────────────────────────────


def parse_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$', line)
        if not m:
            continue
        k, v = m.group(1), m.group(2).strip()
        # strip matching quotes
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        out[k] = v
    return out


def fingerprint(value: str) -> str:
    """Last-4 fingerprint that's safe to show in UI."""
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return value[:3] + "…" + value[-4:]


# ─── profile-aware data dirs ────────────────────────────────────


def _root_for(profile: str | None) -> Path:
    paths = detect()
    base = Path(paths.data_root) if paths else Path.home() / ".hermes"
    if profile and profile != "default":
        return base / "profiles" / profile
    return base


def _env_paths_for(profile: str | None) -> list[Path]:
    """Profile env wins, global env is the fallback."""
    paths = detect()
    base = Path(paths.data_root) if paths else Path.home() / ".hermes"
    out: list[Path] = []
    if profile and profile != "default":
        out.append(base / "profiles" / profile / ".env")
    out.append(base / ".env")
    return out


# ─── gateway state reader ────────────────────────────────────────


def read_state(profile: str | None) -> dict[str, Any]:
    state_path = _root_for(profile) / "gateway_state.json"
    if not state_path.exists():
        return {}
    try:
        return json.loads(state_path.read_text())
    except Exception:
        return {}


def is_running(profile: str | None) -> bool:
    state = read_state(profile)
    if state.get("gateway_state") == "running":
        # confirm via pid file
        pid_path = _root_for(profile) / "gateway.pid"
        if pid_path.exists():
            try:
                pid_s = pid_path.read_text().strip()
                # gateway.pid file may have richer content (json or text); extract a number
                m = re.search(r"\d{2,}", pid_s)
                if not m:
                    return True
                pid = int(m.group(0))
                # signal 0 to test if process exists, ignore PermissionError
                try:
                    os.kill(pid, 0)
                    return True
                except ProcessLookupError:
                    return False
                except PermissionError:
                    return True
            except Exception:
                return True
    return False


# ─── public API ─────────────────────────────────────────────────


def list_gateways(profile: str | None) -> list[dict[str, Any]]:
    env_files = _env_paths_for(profile)
    merged: dict[str, str] = {}
    # later (global) shouldn't override earlier (profile)
    for p in reversed(env_files):
        merged.update(parse_env(p))
    state = read_state(profile)
    platforms = state.get("platforms") or {}

    out: list[dict[str, Any]] = []
    for ch in CHANNELS:
        # Configuration check: every required field has a non-empty value.
        # Some channels (e.g. WhatsApp) have only optional fields — for them
        # "any field set" counts as configured.
        required_fields = [f for f in ch.fields if f.required]
        if required_fields:
            configured = all(merged.get(f.key, "").strip() for f in required_fields)
        else:
            configured = any(merged.get(f.key, "").strip() for f in ch.fields)
        plat = platforms.get(ch.state_key) if ch.state_key else None
        plat_state = (plat or {}).get("state") if isinstance(plat, dict) else None
        plat_error = (plat or {}).get("error_message") if isinstance(plat, dict) else None
        plat_updated = (plat or {}).get("updated_at") if isinstance(plat, dict) else None

        if plat_state == "connected":
            status = "online"
        elif plat_state in {"error", "disconnected"}:
            status = "error"
        elif configured:
            status = "ready"  # configured but the gateway daemon hasn't picked it up
        else:
            status = "unconfigured"

        # Build a UI-friendly snapshot of each field.
        field_view = []
        for f in ch.fields:
            v = merged.get(f.key, "")
            field_view.append({
                "key": f.key,
                "label": f.label,
                "secret": f.secret,
                "required": f.required,
                "set": bool(v.strip()),
                "preview": fingerprint(v) if f.secret else (v if len(v) <= 80 else v[:77] + "…"),
            })

        out.append({
            "id": ch.id,
            "name": ch.name,
            "configured": configured,
            "status": status,
            "platform_state": plat_state,
            "platform_error": plat_error,
            "platform_updated": plat_updated,
            "fields": field_view,
        })
    return out


def gateway_running(profile: str | None) -> dict[str, Any]:
    return {
        "running": is_running(profile),
        "pid": read_state(profile).get("pid"),
        "active_agents": read_state(profile).get("active_agents", 0),
        "updated_at": read_state(profile).get("updated_at"),
    }


# ─── env file writer ─────────────────────────────────────────────


def write_env_keys(profile: str | None, updates: dict[str, str]) -> Path:
    """Write a set of key=value pairs into the profile's .env (creates if missing)."""
    profile_env = _env_paths_for(profile)[0]  # profile env always wins
    profile_env.parent.mkdir(parents=True, exist_ok=True)

    existing_lines: list[str] = []
    if profile_env.exists():
        existing_lines = profile_env.read_text(errors="replace").splitlines()

    # Build a key → line-index map for in-place edits.
    seen: dict[str, int] = {}
    for i, line in enumerate(existing_lines):
        m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=', line)
        if m:
            seen[m.group(1)] = i

    for key, value in updates.items():
        # quote if it contains whitespace or special chars
        safe = value
        if re.search(r"[\s#'\"]", value):
            safe = '"' + value.replace('"', '\\"') + '"'
        new_line = f"{key}={safe}"
        if key in seen:
            existing_lines[seen[key]] = new_line
        else:
            existing_lines.append(new_line)

    profile_env.write_text("\n".join(existing_lines).rstrip() + "\n")
    return profile_env
