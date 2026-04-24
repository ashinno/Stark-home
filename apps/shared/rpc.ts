// Shared types + IPC channel constants. Dependency-free; safe to import from
// either the main process or the renderer.

export const IPC = {
  AppInfo: 'app:info',
  ThemeChanged: 'app:theme-changed',

  SidecarStatus: 'sidecar:status',
  SidecarRequest: 'sidecar:request',
  SidecarEventStream: 'sidecar:event-stream',

  InstallerStatus: 'installer:status',
  InstallerStart: 'installer:start',
  InstallerProgress: 'installer:progress',

  CodexDetect: 'codex:detect',
  CodexSignIn: 'codex:sign-in',
  CodexSignOut: 'codex:sign-out',

  PaletteToggle: 'palette:toggle',
  QuickCommand: 'app:quick-command',

  TrayCommand: 'tray:command',

  OpenExternal: 'shell:open-external',
} as const;

export type Theme = 'system' | 'dark' | 'light';

export type SidecarStatus =
  | { state: 'starting' }
  | { state: 'ready'; port: number }
  | { state: 'error'; message: string }
  | { state: 'stopped' };

export type CodexStatus =
  | { installed: false }
  | { installed: true; version: string; signedIn: false }
  | { installed: true; version: string; signedIn: true; account?: string };

export type HermesPaths = {
  dataRoot: string;            // e.g. ~/.hermes
  codeRoot: string;            // e.g. ~/.hermes/hermes-agent
  pythonBin: string;           // e.g. ~/.hermes/hermes-agent/venv/bin/python
  launcherBin: string | null;  // e.g. ~/.local/bin/hermes
  configPath: string;          // e.g. ~/.hermes/config.yaml
  envPath: string;             // e.g. ~/.hermes/.env
  source: 'upstream' | 'stark-managed' | 'path' | 'override';
};

export type InstallerStatus =
  | { state: 'checking' }
  | { state: 'installed'; version: string; paths: HermesPaths }
  | { state: 'needs-install' }
  | { state: 'installing'; phase: string; progress: number; line?: string }
  | { state: 'updating'; phase: string; progress: number; line?: string }
  | { state: 'failed'; error: string; tail: string[] };

export type InstallerProgress = { phase: string; progress: number; line: string };

export type SetupMode = 'simple' | 'developer' | 'operator' | 'private';
export type SafetyPreset = 'safe' | 'balanced' | 'autonomous';
export type Capability =
  | 'files'
  | 'terminal'
  | 'browser'
  | 'web'
  | 'memory'
  | 'automations'
  | 'messaging'
  | 'voice';

export type SidecarRequest = {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
};

export type SidecarResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

// ——————————————— Domain types mirrored from the sidecar ————————————————

export type ActionKind =
  | 'thinking'
  | 'reading-files'
  | 'writing-files'
  | 'running-terminal'
  | 'opening-browser'
  | 'searching-web'
  | 'reading-memory'
  | 'writing-memory'
  | 'scheduling'
  | 'messaging'
  | 'delegating'
  | 'tool';

export type Action = {
  id: string;
  kind: ActionKind;
  title: string;
  reason: string;
  tool: string;
  status: 'running' | 'ok' | 'failed' | 'needs-approval';
  result?: string;
  started_at: number;
  ended_at?: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: number;
  actions?: Action[];
  error?: string;
};

export type StreamChunk =
  | { type: 'session'; sessionId: string }
  | { type: 'token'; delta: string }
  | { type: 'action'; action: Action }
  | { type: 'action-update'; id: string; patch: Partial<Action> }
  | { type: 'done'; messageId: string; sessionId?: string }
  | { type: 'error'; message: string };

export type Thread = {
  id: string;
  title: string;
  preview: string;
  messages: number;
  started_at: number;
  updated_at: number;
  running: boolean;
  pinned: boolean;
};

export type Approval = {
  id: string;
  title: string;
  reason: string;
  tool: string;
  risk: 'low' | 'medium' | 'high';
  preview?: string;
  thread_id?: string;
  created_at: number;
};

export type Job = {
  id: string;
  title: string;
  kind: 'skill' | 'automation' | 'thread';
  started_at: number;
  eta_sec?: number;
  progress?: number;
  thread_id?: string;
};

export type Suggestion = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

export type DoctorCheck = {
  id: string;
  label: string;
  state: 'ok' | 'warn' | 'fail' | 'pending';
  note?: string;
};

export type Profile = {
  id: string;
  name: string;
  path: string;
  model: string;
  provider: string;
  gateway: string;
  skills: number | null;
  alias: string;
  has_env: boolean;
  has_soul: boolean;
  is_default: boolean;
};

export type ProfilesResponse = {
  profiles: Profile[];
  active: string | null;
  default: string | null;
  available: boolean;
};
