# Stark — a home for your AI

A precise native desktop companion for the [Nous Research hermes-agent](https://github.com/NousResearch/hermes-agent).

Stark is a compact command home for a local AI operator. Industrial, direct, and alive with a small pixel-art mansion that shows what the agent is doing. It wraps a real agent runtime — not a chatbox — so the same install handles conversation, skills, memory, automations, messaging gateways, terminal backends, and MCP servers.

---

## Install

```bash
brew tap ashinno/stark
brew install --cask ashinno/stark/stark
```

The Homebrew tap serves a signed + notarized universal DMG straight from this repo's GitHub Releases. See [HOMEBREW.md](HOMEBREW.md) for the full publish workflow used by maintainers to cut new versions.

**What you get:**

- **One installer.** No Python, no `pip`, no `curl | bash`. Ships a vendored Python runtime + pinned hermes-agent fork inside the `.app`.
- **ChatGPT sign-in as a first-class provider.** Reuses the local [OpenAI Codex CLI](https://github.com/openai/codex) so your ChatGPT Plus/Pro subscription is enough — no API key.
- **Every provider Hermes speaks.** Codex (ChatGPT), OpenAI, Anthropic, OpenRouter, Nous Portal, NVIDIA NIM, Moonshot, MiniMax, Hugging Face, local Ollama, any OpenAI-compatible endpoint.
- **Full agent parity.** Conversation, Providers, Skills, Memory, Gateways (Telegram / Discord / Slack / WhatsApp / Signal / Email), Scheduler, Terminal backends (Local / Docker / SSH / Daytona / Modal), MCP servers, Settings.
- **On-device by default.** Conversations, pinned notes, skills, and tasks live in `~/Library/Application Support/Stark/`. No telemetry.

---

## Feature tour

Every pane is wired end-to-end against the FastAPI bridge. The sections below mirror what you see in the left rail.

### Conversation

- **Streaming chat** with a thinking indicator, auto-growing composer, and word-boundary chunking for smooth tokens.
- **Markdown rendering** (GFM + syntax-highlighted code) for assistant messages; plain text for user turns.
- **Artifacts + inline previews** for code, HTML (sandboxed), Mermaid diagrams, and JSON trees.
- **Copy / export per message and per thread** — clipboard or `.md` file.
- **Message edit + regenerate** — rewrite a previous user turn and re-roll the reply.
- **Conversation search** across every past session (fuzzy match on titles, previews, and message bodies; runs concurrently against sidecar).
- **Slash commands**: `/new`, `/skill`, `/remember`, `/brief`, `/model`.
- **Session cancel** — stop an in-flight turn via ACP `session/cancel`.
- **In-thread provider switcher** — change model mid-conversation without leaving the composer.

### Input

- **Multi-modal input** — drop / paste images, text files, PDFs, code; images are sent as ACP image parts, text is inlined as fenced blocks.
- **Screenshot → chat** — capture the active display and attach it as a single click.
- **Voice input** — push-to-talk or toggle, backed by Web Speech (Whisper-compatible adapter wired for a future local STT).
- **Voice output** — per-message TTS via `SpeechSynthesis` with voice + rate controls.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘N` | New conversation |
| `⌘K` or `⌘/` | Command palette / search |
| `⌘F` | Search in current thread |
| `⌘1`–`⌘9` | Jump between left-rail panes |
| `⌘↵` | Send message |
| `Esc` | Close dialog / cancel turn |
| `⌘,` | Open Settings |
| `⌘⇧E` | Export current thread |
| `⌘⇧S` | Screenshot to chat |

Full table: press `⌘?` anywhere in the app.

### Skills

- Installed skills grid with **filter + sort** (Recently run, Name A–Z, Most used).
- Enable / disable, **run-now**, app-local skill creation.
- **Hermes Skills Hub** marketplace browsing + search.
- **Inspect-before-install** — see skill manifest and source before pulling.
- GitHub repo source import via Hermes taps.

### Memory

- Session list (pinned-first) with FTS-lite search.
- Pinned-notes column with **inline editing**, per-row pin/delete, live filter, and **export to JSON** for backup.
- Notes carry `created_at` + `updated_at` timestamps; edits show an "edited" marker.

### Automations (Scheduler)

- **Natural-language task creation** ("every weekday at 8am") with auto-inferred cron.
- **Starter templates** — Morning brief, Weekly review, Overnight digest, Lunch nudge, Friday retro, Hourly focus.
- **Live cron preview** — the dialog shows "every weekday at 8am" next to the raw `0 8 * * 1-5`.
- **Edit** existing task (name / phrase / cron / delivery); re-deriving the cron from a new phrase if you leave the cron field untouched.
- **Filter + sort** (All / Running / Paused; by next run / name / last run).
- **Run history** with color-coded ok / warn / bad entries.
- Pause / resume, run-now, delete.

### MCP servers

- Two-tab surface: **Installed** + curated **Gallery**.
- **Gallery** — 12 hand-picked starter servers (Filesystem, Fetch, GitHub, Git, Postgres, SQLite, Puppeteer, Memory, Slack, Google Drive, Everything, Brave Search) with one-click install.
- Category filter + search on the gallery.
- Add-by-URL for custom / private MCPs (`stdio://package` or `https://host`).
- Toggle / copy URL / remove, install-hint displayed per row.

### Activity & usage

- Cost + token dashboard backed by `/usage`.
- Live stats: input / output / cached-read / thought tokens, estimated cost (¢ per 1M rate card), per-session top-consumers table with percent contribution.
- Pricing is clearly labelled an estimate ("Estimate based on public list prices; real billing may differ").

### Providers

Grid of tiles: Codex (OAuth), OpenAI / Anthropic / OpenRouter / Nous (API-key), Ollama (local), custom endpoint. Configure dialog, test-connection button, activate action.

### Gateways

Telegram / Discord / Slack / WhatsApp / Signal / Email cards with configure dialog and start / stop. Refuses to start if misconfigured.

### Backends

Local / Docker / SSH / Daytona / Modal with configure forms, test-reachability, activate.

### Settings

- **Hermes Doctor** — live health check on every open.
- Profiles, Providers, Gateways, Backends, MCP, Account & Theme tabs.
- Codex sign-in status + one-click OAuth.
- Name, appearance (light / dark / system), re-run onboarding.

### Global chrome

- Stark wordmark with native title-bar controls.
- Sidebar routing.
- **Profile switcher in the composer** that drops upward so it doesn't overlap replies.
- Status bar with live sidecar / provider / ChatGPT / loopback-port indicators.
- Toast stack (success / error / info) anchored bottom-right.
- Light + dark themes with a precision palette, electric-blue primary, and signal-amber approvals.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Stark.app   (Electron, signed + notarized, universal)       │
│                                                              │
│  Renderer (React 19 + Tailwind 4 + Instrument/Geist)         │
│      │         │                                             │
│      ▼ IPC     ▼ IPC                                         │
│  Main (Node): window, tray, settings, Codex detector,        │
│               sidecar supervisor                             │
│      │                                                       │
│      ▼ localhost HTTP/WS (per-launch bearer token)           │
│  Sidecar: python-build-standalone + hermes_home              │
│           FastAPI bridge + state store +                     │
│           vendored hermes_agent                              │
│                                                              │
│  ~/Library/Application Support/Stark/                        │
│    state.json, memory.db, skills/, logs/                     │
└──────────────────────────────────────────────────────────────┘
```

The renderer never talks to disk or the network directly. Every side-effect flows through the Electron main process (IPC) and then the sidecar over a loopback HTTP channel protected by a per-launch bearer token — so the app surface stays sandbox-friendly and auditable.

---

## Develop

Requirements: macOS, Node 22+, Python 3.12+.

### One-time setup

```bash
# 1. Node deps
npm install

# 2. Sidecar Python env
python3 -m venv .venv
.venv/bin/pip install \
  'fastapi>=0.115' \
  'uvicorn[standard]>=0.32' \
  'pydantic>=2.9' \
  'httpx>=0.27' \
  'sse-starlette>=2.1'
```

### Run the app

```bash
STARK_PYTHON=$PWD/.venv/bin/python npm run dev
```

What happens:

1. `electron-vite` builds the main + preload bundles and starts a Vite dev server for the renderer on `http://localhost:5173/`.
2. Electron launches the main process, opens the window, and spawns the Python sidecar on a random free port.
3. The sidecar prints `PORT=<n>` and starts serving the FastAPI bridge on `127.0.0.1:<n>`.
4. The renderer talks to the sidecar via the Electron preload bridge — no direct network access from the renderer.

Hot reload works for all three layers: edit the renderer and the window updates instantly; edit the main / preload and Electron relaunches; edit the sidecar and restart with `⌃C` + re-run the command (or the hot-reload loop if you wire `uvicorn --reload` on the side).

### Typecheck

```bash
npm run typecheck      # both projects
npm run typecheck:node # main + preload
npm run typecheck:web  # renderer
```

### Useful env vars

| Var | Default | Purpose |
| --- | --- | --- |
| `STARK_PYTHON` | `python3` on PATH | Python interpreter the sidecar runs under (point at a venv in dev). |
| `STARK_TOKEN` | random per launch | Bearer token the renderer uses to talk to the sidecar. |
| `STARK_DATA_DIR` | `<userData>/data` | Where `state.json` + skills + notes live. |

---

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

---

## Layout

```
apps/main/                 Electron main (TS)
apps/preload/              context-isolated bridge
apps/renderer/             React UI
  src/
    components/            Logo, TitleBar, StatusBar, Markdown, ProfilePicker,
                           InlineProfileSwitcher, CommandPalette,
                           KeyboardShortcuts, …
    components/ui/         Button, Input, Card, Dialog, Toast, Atoms,
                           TabStrip, Skeleton, Presence
    features/
      threads/             conversation with streaming + artifacts
      onboarding/          5-step flow
      providers/           provider grid + configure dialog
      skills/              CRUD + run + marketplace
      memory/              notes + sessions + search + export
      automations/         NL cron + templates + history
      activity/            cost + usage dashboard
      gateways/            messaging app bridges
      backends/            terminal runtimes
      settings/            account + theme + MCP gallery
      tools/               MCP explorer
    lib/                   rpc, export, voice, tts, time, cn
    stores/                zustand stores (session, theme, …)
apps/shared/               types shared between main & renderer
sidecar/                   Python: FastAPI bridge + vendored hermes_agent
  hermes_home/bridge/
    app.py                 FastAPI app factory + auth
    store.py               JSON-file state store
    acp_client.py          persistent ACP subprocess + cancel + image parts
    routes/
      chat.py              streaming SSE + attachments + usage accounting
      home.py              threads / approvals / jobs / usage dashboard
      sessions.py          list + read + search
      memory.py            notes + pinned sessions + export
      mcp.py               installed + curated gallery
      scheduler.py         NL cron + templates + partial update
      skills.py, providers.py, gateways.py, backends.py,
      profiles.py, settings.py, doctor.py
resources/                 icons, entitlements, vendored Python runtime
```

---

## Design note

Stark pairs **Instrument Serif** (display), **Geist Sans** (UI), and **JetBrains Mono** (code + data) with a dark precision palette, electric-blue primary actions, and signal-amber approval states. Motion is restrained — every transition uses a single `--motion-dur-sm / --motion-ease-out` token so the whole app feels like one piece of glass. Cards use a subtle glow ring to indicate active / focused state; nothing bounces.

The pixel-art mansion in Home mode isn't decoration: each window lights up when an agent is active there (thinking, tool-calling, waiting on an approval), so you can see what the operator is doing at a glance.

---

## Milestones

| | | |
|---|---|---|
| M1 | ✅ | Skeleton, IPC, sidecar, signed dev DMG |
| M2 | ✅ | Brand (Stark), theme, every feature pane wired end-to-end against a persisted state store |
| M3 | ✅ | Vendor `hermes_agent` + persistent ACP subprocess with image parts, cancel, and usage accounting |
| M4 | ✅ | Real provider routing, markdown rendering, artifacts, voice I/O, screenshot, edit/regenerate, search |
| M5 | ✅ | Memory editing + export, in-thread provider switch, cost dashboard, skills marketplace, MCP gallery, scheduler templates |
| M6 | ☐ | Real gateway daemons + auto-updater + public beta |

---

## License

MIT. Built on top of the MIT-licensed [hermes-agent](https://github.com/NousResearch/hermes-agent) by Nous Research.
