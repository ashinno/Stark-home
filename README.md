# Hearth — a home for your AI

A warm, considered desktop companion for the [Nous Research hermes-agent](https://github.com/NousResearch/hermes-agent).

- **One installer.** No Python, no `pip`, no `curl | bash`. Ships a vendored Python runtime + pinned hermes-agent fork inside the `.app`.
- **ChatGPT sign-in as a first-class provider.** Reuses the local [OpenAI Codex CLI](https://github.com/openai/codex) so your ChatGPT Plus/Pro subscription is enough — no API key.
- **Every provider Hermes speaks.** Codex (ChatGPT), OpenAI, Anthropic, OpenRouter, Nous Portal, NVIDIA NIM, Moonshot, MiniMax, Hugging Face, local Ollama, any OpenAI-compatible endpoint.
- **Full agent parity.** Conversation, Providers, Skills, Memory, Gateways (Telegram / Discord / Slack / WhatsApp / Signal / Email), Scheduler, Terminal backends (Local / Docker / SSH / Daytona / Modal), MCP servers, Settings.
- **On-device by default.** Conversations, pinned notes, skills, and tasks live in `~/Library/Application Support/Hearth/`. No telemetry.

## Identity

Name: **Hearth.** A hearth is the warm center of a home — the place where a fire is kept. That's the product: a warm, quiet place for your AI to live. The mark is an ember flame; the palette is ember/cream on warm coal, not the usual purple-on-white LLM look. Typography is a refined serif (Fraunces) paired with IBM Plex Sans and Mono.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Hearth.app  (Electron, signed + notarized, universal)       │
│                                                              │
│  Renderer (React 19 + Tailwind 4 + Fraunces/Plex)            │
│      │         │                                             │
│      ▼ IPC     ▼ IPC                                         │
│  Main (Node): window, tray, settings, Codex detector,        │
│               sidecar supervisor                             │
│      │                                                       │
│      ▼ localhost HTTP/WS (per-launch bearer token)           │
│  Sidecar: python-build-standalone + hermes_home              │
│           FastAPI bridge + state store +                     │
│           vendored hermes_agent (coming next)                │
│                                                              │
│  ~/Library/Application Support/Hearth/                       │
│    state.json, memory.db, skills/, logs/                     │
└──────────────────────────────────────────────────────────────┘
```

## What's in this drop

**Every feature pane is functional end-to-end against the FastAPI bridge:**

- **Onboarding** — 5 steps, warm flame backdrop, animated progress rail: welcome → provider → personalize → permissions → done.
- **Conversation** — streaming chat with thinking indicator, auto-growing composer, slash commands (`/new`, `/skill`, `/remember`, `/brief`, `/model`), suggested first-turn prompts, session reset.
- **Providers** — grid of 7 provider tiles with Codex (OAuth), OpenAI/Anthropic/OpenRouter/Nous (API-key), Ollama (local), custom endpoint. Configure dialog, test-connection button, activate action.
- **Skills** — list, enable/disable, run-now, create dialog (name + trigger + steps), delete. Live run counter.
- **Memory** — session list (pinned-first), FTS-lite search, pinned-notes column with add/forget, per-row pin/delete.
- **Gateways** — Telegram / Discord / Slack / WhatsApp / Signal / Email cards with configure dialog and start/stop. Refuses to start if misconfigured.
- **Scheduler** — natural-language task creation ("every weekday at 8am") with auto-inferred cron, pause/resume, run-now, next-fire preview.
- **Backends** — Local / Docker / SSH / Daytona / Modal with configure forms, test-reachability, activate.
- **MCP** — list/add/toggle/remove Model Context Protocol servers.
- **Settings** — Codex sign-in status + one-click OAuth, name, voice tone (warm / precise / playful), re-run onboarding, about, data-location note.

**Global chrome:**
- Hearth wordmark with animated ember-flame logo in the title bar.
- Sidebar routing with `⌘1`–`⌘9` hotkeys.
- Status bar with live sidecar / provider / ChatGPT / loopback-port indicators.
- Toast stack (success / error / info) anchored bottom-right.

## Develop

Requirements: macOS, Node 22+, Python 3.12+.

```bash
npm install

# One-time: sidecar Python env
python3 -m venv .venv
.venv/bin/pip install 'fastapi>=0.115' 'uvicorn[standard]>=0.32' 'pydantic>=2.9' 'httpx>=0.27' 'sse-starlette>=2.1'

# Dev (hot reload)
HEARTH_PYTHON=$PWD/.venv/bin/python npm run dev
```

## Build a signed DMG

```bash
# 1. Bake a vendored Python runtime into resources/runtime/
npm run sidecar:bake

# 2. (Optional) add the upstream agent as a git subtree
git subtree add --prefix sidecar/hermes_home/vendor/hermes_agent \
  https://github.com/NousResearch/hermes-agent.git main --squash

# 3. Build + sign + notarize
export APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=...
export CSC_LINK=...  CSC_KEY_PASSWORD=...
npm run pack:mac
```

## Layout

```
apps/main/                 Electron main (TS)
apps/preload/              context-isolated bridge
apps/renderer/             React UI
  src/
    components/Logo.tsx    the ember-flame mark + wordmark
    components/ui/         Button, Input, Card, Dialog, Toast, Atoms
    features/
      chat/                conversation with streaming
      onboarding/          5-step flow
      providers/           provider grid + configure dialog
      skills/              CRUD + run
      memory/              sessions + notes + search
      gateways/            6 messaging app bridges
      scheduler/           NL cron tasks
      backends/            terminal runtimes
      mcp/                 MCP servers
      settings/            account + about
apps/shared/               types shared between main & renderer
sidecar/                   Python: FastAPI bridge + vendored hermes_agent
  hermes_home/bridge/
    app.py                 FastAPI app factory + auth
    store.py               JSON-file state store
    routes/                chat, providers, skills, memory,
                           gateways, scheduler, backends, mcp, settings
resources/                 icons, entitlements, vendored Python runtime
```

## Milestones

| | | |
|---|---|---|
| M1 | ✅ | Skeleton, IPC, sidecar, signed dev DMG |
| M2 | ✅ | Brand (Hearth), theme, every feature pane wired end-to-end against a persisted state store |
| M3 | ☐ | Vendor `hermes_agent` and replace the canned chat stream with real provider routing |
| M4 | ☐ | Codex live streaming (main proxies `codex exec --json` to the sidecar bridge) |
| M5 | ☐ | Real gateway daemons, real scheduler engine, real MCP client |
| M6 | ☐ | Auto-updater + public beta |

## License

MIT. Built on top of the MIT-licensed [hermes-agent](https://github.com/NousResearch/hermes-agent) by Nous Research.
