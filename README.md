# Stark — a home for your AI

A precise native desktop companion for the
[Nous Research hermes-agent](https://github.com/NousResearch/hermes-agent).

One signed app, every provider Hermes can talk to, every gateway and skill
the agent supports — wrapped in a calm dark UI with a pixel-loft mascot
that shows what the agent is doing.

## Install

```bash
brew tap ashinno/stark
brew install --cask ashinno/stark/stark
```

> The Homebrew tap serves a signed + notarized universal DMG straight from
> this repo's GitHub Releases. See [HOMEBREW.md](HOMEBREW.md) for the publish
> workflow used to cut new versions.

What you get out of the box:

- **One installer.** No `pip`, no `curl | bash`. Stark ships a vendored
  Python runtime + a pinned `hermes-agent` fork inside the `.app`.
- **ChatGPT sign-in as a first-class provider.** Reuses the local
  [OpenAI Codex CLI](https://github.com/openai/codex) so a ChatGPT Plus/Pro
  subscription is enough — no API key.
- **Every provider Hermes speaks.** Codex (ChatGPT), OpenAI, Anthropic,
  OpenRouter, Nous Portal, NVIDIA NIM, Moonshot, MiniMax, Hugging Face,
  local Ollama, any OpenAI-compatible endpoint.
- **Full agent parity.** Conversation, providers, skills, memory,
  gateways (Telegram / Discord / Slack / WhatsApp / Signal / Email),
  scheduler, terminal backends (Local / Docker / SSH / Daytona / Modal),
  MCP servers, settings.
- **On-device by default.** Conversations, pinned notes, skills, and tasks
  live in `~/Library/Application Support/Stark/`. No telemetry.

## Identity

Name: **Stark.** A compact command home for an AI operator: industrial,
direct, alive with a small pixel-art loft scene that shows where the agent
is at any given moment. Instrument Serif, Geist Sans, JetBrains Mono on a
dark precision palette — electric-blue primary, signal-amber approvals,
ok/warn/bad tokens for everything else.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Stark.app   (Electron, signed + notarized, universal)       │
│                                                              │
│  Renderer (React 19 + Tailwind 4 + Zustand)                  │
│      │         │                                             │
│      ▼ IPC     ▼ IPC                                         │
│  Main (Node): window, tray, settings, Codex detector,        │
│               sidecar supervisor, daemon warmer              │
│      │                                                       │
│      ▼ localhost HTTP/SSE (per-launch bearer token)          │
│  Sidecar: python-build-standalone + hermes_home              │
│           FastAPI bridge + JSON state store +                │
│           vendored hermes_agent (subtree)                    │
│                                                              │
│  ~/Library/Application Support/Stark/                        │
│    state.json, memory.db, skills/, logs/                     │
└──────────────────────────────────────────────────────────────┘
```

## What ships in this drop

**Home — the control center.** A pixel-loft scene at the top, a single
"Today" strip with live agent state / turn / token / cost counters and
the next scheduled job, a tall hero prompt that opens a fresh thread,
nine-tile feature dock, and a 2×2 dashboard:

- **Pending approvals** — risk-tinted list of tool calls waiting for you.
- **Running jobs** — title, kind, progress, age.
- **Up next** — soonest enabled automations with cron + delivery target.
- **Recent threads** — last sessions, click through to Threads.
- **Suggested** — quick-win prompts based on your setup.

**Every feature pane is functional end-to-end against the FastAPI bridge:**

- **Onboarding** — 5 steps, Stark backdrop, animated progress rail:
  welcome → provider → personalize → permissions → done.
- **Threads** — streaming chat with thinking indicator, auto-growing
  composer, slash commands (`/new`, `/skill`, `/remember`, `/brief`,
  `/model`), suggested first-turn prompts, session reset, real sessions
  from the Hermes CLI when it's installed.
- **Tools** — toggle individual capabilities (files, terminal, browser,
  web, memory, automations, messaging, voice) with a global safety
  preset (safe / balanced / autonomous).
- **Skills** — installed skills, enable/disable, run-now, app-local
  skill creation, Hermes Skills Hub marketplace browsing/search,
  inspect-before-install, and GitHub repo source import via Hermes taps.
- **Automations** — natural-language task creation ("every weekday at
  8am") with auto-inferred cron, pause/resume, run-now, next-fire preview.
- **Memory** — session list (pinned-first), FTS-lite search,
  pinned-notes column with add/forget, per-row pin/delete.
- **Gateways** — Telegram / Discord / Slack / WhatsApp / Signal / Email
  cards with configure dialog and start/stop. Refuses to start if
  misconfigured.
- **Activity** — live timeline of actions, approvals, gateway traffic,
  scheduler runs.
- **System** — daemon warm status, sidecar logs, keys, config paths,
  doctor checks.
- **Settings** — Codex sign-in status + one-click OAuth, profile picker,
  name, voice tone (warm / precise / playful), re-run onboarding,
  about, data-location note.

**Global chrome:**

- Stark wordmark with native title-bar controls.
- Sidebar routing with `⌘1`–`⌘9` hotkeys, `⌘,` for Settings,
  `⌘K` for the command palette, `?` for the shortcut sheet.
- Status bar with live sidecar / provider / ChatGPT / daemon-warm /
  loopback-port indicators.
- Toast stack (success / error / info) anchored bottom-right.
- Route transitions with reduced-motion fallback.

## Develop

Requirements: macOS, Node 22+, Python 3.12+.

```bash
npm install

# One-time: sidecar Python env
python3 -m venv .venv
.venv/bin/pip install \
  'fastapi>=0.115' \
  'uvicorn[standard]>=0.32' \
  'pydantic>=2.9' \
  'httpx>=0.27' \
  'sse-starlette>=2.1'

# Dev (hot reload renderer + main + sidecar)
STARK_PYTHON=$PWD/.venv/bin/python npm run dev

# Type-check both halves
npm run typecheck
```

The renderer talks to the sidecar over a localhost loopback that's bound
to a fresh bearer token on every launch — the main process supervises
the child, restarts it on crashes, and warms the agent daemon for the
active profile so cold starts don't punch through to the UI.

## Build a signed DMG

```bash
# 1. Bake a vendored Python runtime into resources/runtime/
npm run sidecar:bake

# 2. (Optional) add the upstream agent as a git subtree
git subtree add --prefix sidecar/hermes_home/vendor/hermes_agent \
  https://github.com/NousResearch/hermes-agent.git main --squash

# 3. Build + sign + notarize (universal binary)
export APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=…
export CSC_LINK=…  CSC_KEY_PASSWORD=…
npm run pack:mac
```

`pack:mac` produces a notarized universal DMG in `dist/`. To publish in
the same step (uploads to GitHub Releases via `electron-updater`):

```bash
npm run release:mac
```

## Layout

```
apps/main/                 Electron main (TS): window, tray, sidecar
                           supervisor, Codex detector, daemon warmer
apps/preload/              context-isolated bridge
apps/renderer/             React UI
  src/
    components/
      stark-loft/          1600×480 pixel loft canvas
      ui/                  Button, Input, Card, Dialog, Toast, Atoms,
                           Skeleton, RouteTransition
      Sidebar / TitleBar / StatusBar / CommandPalette / KeyboardShortcuts
    features/
      home/                control-center dashboard
      threads/             conversation with streaming
      tools/               capability toggles + safety preset
      skills/              installed + marketplace
      automations/         NL cron scheduler
      memory/              sessions + notes + search
      gateways/            6 messaging bridges
      activity/            live action/event timeline
      system/              daemon, logs, doctor
      settings/            account + provider + about
      onboarding/          5-step flow
    stores/                session + theme zustand stores
    lib/                   rpc, time, daemon, confirmDelete, …
apps/shared/               types shared between main & renderer

sidecar/                   Python: FastAPI bridge + vendored hermes_agent
  hermes_home/bridge/
    app.py                 FastAPI app factory + bearer-token auth
    store.py               JSON-file state store
    acp_client.py          stream-friendly client for hermes-agent
    routes/                home, chat, providers, skills, memory,
                           gateways, scheduler, backends, mcp,
                           settings, profiles, sessions, system,
                           daemon, doctor
  scripts/build_runtime.sh vendors a Python runtime into resources/

resources/                 icons, entitlements, pixel-art sprite sheets,
                           vendored Python runtime
```

## Endpoint quick reference

The renderer talks to the sidecar over a small REST surface. The most
load-bearing endpoints, in case you're spelunking:

| Method | Path              | Used by                          |
| ------ | ----------------- | -------------------------------- |
| GET    | `/threads`        | Home · Recent threads, Threads   |
| GET    | `/approvals`      | Home · Pending approvals         |
| GET    | `/jobs`           | Home · Running jobs              |
| GET    | `/scheduler`      | Home · Up next, Automations      |
| GET    | `/usage`          | Home · Today strip, cost dash    |
| GET    | `/suggestions`    | Home · Suggested                 |
| POST   | `/chat`           | Threads streaming                |
| GET    | `/engine/status`  | Engine-installed banner          |
| GET    | `/settings`       | Boot hydration                   |
| POST   | `/agents/pause`   | Tray "pause agents"              |

## Milestones

| | | |
|---|---|---|
| M1 | ✅ | Skeleton, IPC, sidecar, signed dev DMG |
| M2 | ✅ | Brand, theme, every feature pane wired against a persisted state store |
| M3 | ✅ | Home dashboard with live Today strip + Up-next scheduler peek |
| M4 | ☐ | Vendor `hermes_agent` and replace the canned chat stream with real provider routing |
| M5 | ☐ | Codex live streaming (main proxies `codex exec --json` to the sidecar bridge) |
| M6 | ☐ | Real gateway daemons, real scheduler engine, real MCP client |
| M7 | ☐ | Auto-updater + public beta |

## License

MIT. Built on top of the MIT-licensed
[hermes-agent](https://github.com/NousResearch/hermes-agent) by Nous Research.
