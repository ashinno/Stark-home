"""Lightweight JSON-file state store for the Stark bridge.

Keeps every pane alive until the vendored hermes_agent takes over. Atomic
writes (temp-file + rename), threading.Lock so we're safe across concurrent
requests.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any


def _data_dir() -> Path:
    raw = (
        os.environ.get("STARK_DATA_DIR")
        or os.environ.get("HEARTH_DATA_DIR")
        or os.environ.get("HERMES_HOME_DATA_DIR")
    )
    if raw:
        p = Path(raw)
    else:
        p = Path.home() / "Library" / "Application Support" / "Stark" / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


_SEED: dict[str, Any] = {
    "meta": {"created_at": None, "version": 2},
    "settings": {
        "user_name": "",
        "active_provider": "nous",
        "active_profile": None,
        "setup_mode": "simple",
        "safety_preset": "balanced",
        "capabilities": ["files", "web", "memory"],
        "onboarded": False,
    },
    "providers": [
        {"id": "nous", "name": "Nous Portal", "kind": "subscription", "configured": True, "model": "hermes-3-405b", "description": "Recommended. Hermes-tuned models with 128K context."},
        {"id": "openai", "name": "OpenAI", "kind": "api-key", "configured": False, "model": "gpt-4.1", "description": "Direct API-key access to the latest OpenAI models."},
        {"id": "anthropic", "name": "Anthropic", "kind": "api-key", "configured": False, "model": "claude-opus-4-7", "description": "Claude Opus, Sonnet, Haiku via API key."},
        {"id": "openrouter", "name": "OpenRouter", "kind": "api-key", "configured": False, "model": "auto", "description": "200+ models routed behind one key."},
        {"id": "ollama", "name": "Local · Ollama", "kind": "local", "configured": False, "model": "llama3.2:latest", "description": "Run open-weight models on this Mac."},
        {"id": "custom", "name": "Custom endpoint", "kind": "custom", "configured": False, "model": "", "description": "Any OpenAI-compatible base URL."},
    ],
    "threads": [
        {
            "id": "thr_welcome",
            "title": "A quick tour of Stark",
            "preview": "Walked through the Home dashboard, opened the command palette, granted file read access.",
            "messages": 18,
            "started_at": 0,
            "updated_at": 0,
            "running": False,
            "pinned": True,
        },
        {
            "id": "thr_dl",
            "title": "Analyze Downloads folder",
            "preview": "Indexed 47 files, grouped by type, suggested 8 to archive.",
            "messages": 6,
            "started_at": 0,
            "updated_at": 0,
            "running": False,
            "pinned": False,
        },
    ],
    "approvals": [
        {
            "id": "apv_rm",
            "title": "Delete 12 stale .DS_Store files under ~/Projects",
            "reason": "User asked to clean up hidden macOS files before syncing the folder.",
            "tool": "files · delete",
            "risk": "low",
            "preview": "12 files · 0 bytes freed",
            "created_at": 0,
        },
        {
            "id": "apv_tg",
            "title": "Send message to Telegram bot ‘daily-brief'",
            "reason": "Morning brief automation wants to post the summary.",
            "tool": "messaging · telegram",
            "risk": "medium",
            "created_at": 0,
        },
    ],
    "jobs": [
        {
            "id": "job_brief",
            "title": "Morning brief · composing",
            "kind": "automation",
            "started_at": 0,
            "progress": 0.62,
        }
    ],
    "suggestions": [
        {"id": "s-tour", "title": "A tour of what Hermes can do", "description": "Two-minute walkthrough of every tool on this Mac.", "prompt": "Give me a two-minute tour of what Hermes can do on this Mac."},
        {"id": "s-dl", "title": "Tidy my Downloads folder", "description": "Index, group by type, propose what to archive.", "prompt": "Analyze my Downloads folder and suggest what to archive."},
        {"id": "s-brief", "title": "Set up a daily brief", "description": "Runs at 8am, posts to Home + optional Telegram.", "prompt": "Create a daily brief automation that runs at 8am."},
        {"id": "s-folder", "title": "Summarize this folder", "description": "Quick précis of what the agent finds here.", "prompt": "Summarize what is in my current working folder."},
    ],
    "skills": [
        {"id": "skl_brief", "name": "Morning brief", "enabled": True, "trigger": "every weekday at 8:30", "steps": ["scan unread mail", "skim calendar", "compose a 5-bullet summary", "post to Home"], "runs": 37, "last_run": None, "source": "local"},
        {"id": "skl_triage", "name": "Inbox triage", "enabled": True, "trigger": "on demand", "steps": ["flag contracts", "flag invoices", "draft replies to stale threads"], "runs": 12, "last_run": None, "source": "local"},
        {"id": "skl_mp1", "name": "Weekly OKR review", "enabled": False, "trigger": "Mondays at 10am", "steps": ["pull goals from Notion", "summarize progress", "flag blockers"], "runs": 0, "last_run": None, "source": "marketplace"},
    ],
    "tasks": [
        {
            "id": "tsk_morning",
            "name": "Morning brief",
            "nl": "every weekday at 8am, brief me on yesterday's unread mail and today's calendar",
            "cron": "0 8 * * 1-5",
            "enabled": True,
            "delivery": "home",
            "last_run": None,
            "next_run": None,
            "history": [],
        },
    ],
    "gateways": [
        {"id": "telegram", "name": "Telegram", "status": "offline", "config": {}},
        {"id": "discord", "name": "Discord", "status": "offline", "config": {}},
        {"id": "slack", "name": "Slack", "status": "offline", "config": {}},
        {"id": "whatsapp", "name": "WhatsApp", "status": "offline", "config": {}},
        {"id": "signal", "name": "Signal", "status": "offline", "config": {}},
        {"id": "email", "name": "Email", "status": "offline", "config": {}},
    ],
    "backends": [
        {"id": "local", "name": "Local", "active": True, "config": {}, "description": "This Mac."},
        {"id": "docker", "name": "Docker", "active": False, "config": {}, "description": "Ephemeral container per session."},
        {"id": "ssh", "name": "SSH", "active": False, "config": {}, "description": "Any remote host with your key."},
        {"id": "daytona", "name": "Daytona", "active": False, "config": {}, "description": "Cloud workspaces."},
        {"id": "modal", "name": "Modal", "active": False, "config": {}, "description": "Serverless GPU/CPU."},
    ],
    "mcp_servers": [
        {"id": "mcp_fs", "name": "Filesystem", "url": "stdio://@modelcontextprotocol/server-filesystem", "enabled": True, "tools": 6},
        {"id": "mcp_fetch", "name": "Fetch", "url": "stdio://@modelcontextprotocol/server-fetch", "enabled": True, "tools": 1},
    ],
    "pinned_notes": [],
}


class Store:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or (_data_dir() / "state.json")
        self.lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if self.path.exists():
            try:
                return json.loads(self.path.read_text())
            except Exception:
                pass
        seeded = json.loads(json.dumps(_SEED))
        now = int(time.time())
        seeded["meta"]["created_at"] = now
        for t in seeded["threads"]:
            t["started_at"] = now - 3600
            t["updated_at"] = now - 1800
        for a in seeded["approvals"]:
            a["created_at"] = now - 120
        for j in seeded["jobs"]:
            j["started_at"] = now - 45
        for s in seeded["skills"]:
            s["last_run"] = now - 86400 if s["runs"] > 0 else None
        self._persist(seeded)
        return seeded

    def _persist(self, data: dict[str, Any]) -> None:
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self.path)

    def read(self, key: str) -> Any:
        with self.lock:
            return json.loads(json.dumps(self._data.get(key)))

    def mutate(self, fn) -> Any:  # type: ignore[no-untyped-def]
        with self.lock:
            result = fn(self._data)
            self._persist(self._data)
            return result

    @staticmethod
    def new_id(prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex[:8]}"


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store
