"""Single source of truth for where Hermes lives on this Mac.

Mirrors the Electron-side installer.ts detection so the doctor + future routes
can answer accurately when asked "is Hermes installed, and where?".
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class HermesPaths:
    data_root: Path
    code_root: Path
    python_bin: Path | None
    launcher_bin: Path | None
    config_path: Path
    env_path: Path
    source: str  # 'upstream' | 'stark-managed' | 'path' | 'override'
    version: str | None


_VENV_RELS = (
    "venv/bin/python",
    "venv/bin/python3",
    ".venv/bin/python",
    ".venv/bin/python3",
)

_LAUNCHERS = (
    Path.home() / ".local" / "bin" / "hermes",
    Path("/opt/homebrew/bin/hermes"),
    Path("/usr/local/bin/hermes"),
)


def _python_in(code_root: Path) -> Path | None:
    for rel in _VENV_RELS:
        p = code_root / rel
        if p.exists():
            return p
    direct = code_root / "runtime" / "bin" / "python3"
    if direct.exists():
        return direct
    return None


def _resolve_launcher() -> Path | None:
    for p in _LAUNCHERS:
        if p.exists():
            return p
    found = shutil.which("hermes")
    return Path(found) if found else None


def _version_from(launcher: Path) -> str | None:
    try:
        from .subprocess_env import sanitized_env
        out = subprocess.run(
            [str(launcher), "--version"],
            capture_output=True,
            timeout=4,
            check=False,
            text=True,
            env=sanitized_env(),
        )
        text = (out.stdout or "") + "\n" + (out.stderr or "")
        m = re.search(r"v?(\d+\.\d+\.\d+)", text)
        return m.group(1) if m else None
    except Exception:
        return None


def _candidates() -> list[tuple[Path, Path, str]]:
    home = Path.home()
    out: list[tuple[Path, Path, str]] = []
    override = os.environ.get("STARK_HERMES_ROOT")
    if override:
        out.append((Path(override), Path(override) / "hermes-agent", "override"))
    out.append((home / ".hermes", home / ".hermes" / "hermes-agent", "upstream"))
    legacy = home / "Library" / "Application Support" / "Hermes"
    out.append((legacy, legacy, "stark-managed"))
    return out


def detect() -> HermesPaths | None:
    launcher = _resolve_launcher()

    for data_root, code_root, source in _candidates():
        py = _python_in(code_root)
        if py is None and not code_root.exists():
            continue
        if py is None and launcher is None:
            continue
        version = (
            (_version_from(launcher) if launcher else None)
            or (_version_from(py) if py else None)
        )
        return HermesPaths(
            data_root=data_root,
            code_root=code_root,
            python_bin=py,
            launcher_bin=launcher,
            config_path=data_root / "config.yaml",
            env_path=data_root / ".env",
            source=source,
            version=version,
        )

    if launcher:
        return HermesPaths(
            data_root=Path.home() / ".hermes",
            code_root=Path.home() / ".hermes" / "hermes-agent",
            python_bin=None,
            launcher_bin=launcher,
            config_path=Path.home() / ".hermes" / "config.yaml",
            env_path=Path.home() / ".hermes" / ".env",
            source="path",
            version=_version_from(launcher),
        )
    return None
