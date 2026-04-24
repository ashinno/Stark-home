import { create } from 'zustand';
import type {
  ChatMessage,
  CodexStatus,
  InstallerStatus,
  SidecarStatus,
  SetupMode,
  SafetyPreset,
  Capability,
} from '@shared/rpc';

type Route =
  | 'home'
  | 'threads'
  | 'tools'
  | 'skills'
  | 'automations'
  | 'memory'
  | 'gateways'
  | 'activity'
  | 'system'
  | 'settings';

export type DaemonState = {
  warmProfiles: string[];
  warmingProfiles: string[];
  coldStartInFlight: boolean;
  lastPrewarmAt: number | null;
  lastPrewarmError: string | null;
};

type State = {
  route: Route;
  sidecar: SidecarStatus;
  installer: InstallerStatus;
  codex: CodexStatus | null;

  // user preferences (mirrored from sidecar)
  userName: string;
  activeProvider: string;
  activeProfile: string | null;
  setupMode: SetupMode;
  safetyPreset: SafetyPreset;
  capabilities: Capability[];
  onboarded: boolean;

  // chat state
  messages: ChatMessage[];
  streaming: boolean;
  activeThreadId: string | null;

  // UI
  paletteOpen: boolean;

  // engine state (runtime installed?)
  engineInstalled: boolean | null;

  // daemon/ACP warm state (polled from /daemon/status)
  daemon: DaemonState | null;

  // setters
  setRoute: (r: Route) => void;
  setSidecar: (s: SidecarStatus) => void;
  setInstaller: (s: InstallerStatus) => void;
  setCodex: (c: CodexStatus) => void;
  setUserName: (s: string) => void;
  setProvider: (s: string) => void;
  setActiveProfile: (id: string | null) => void;
  setSetupMode: (m: SetupMode) => void;
  setSafetyPreset: (p: SafetyPreset) => void;
  setCapabilities: (c: Capability[]) => void;
  toggleCapability: (c: Capability) => void;
  setOnboarded: (v: boolean) => void;
  appendMessage: (m: ChatMessage) => void;
  updateLastAssistantMessage: (fn: (m: ChatMessage) => ChatMessage) => void;
  markLastUserError: (err: string | null) => void;
  patchAssistantDelta: (delta: string) => void;
  setStreaming: (v: boolean) => void;
  resetThread: () => void;
  setActiveThreadId: (id: string | null) => void;
  setPaletteOpen: (v: boolean) => void;
  setEngineInstalled: (v: boolean) => void;
  setDaemon: (d: DaemonState | null) => void;
};

export const useSession = create<State>((set) => ({
  route: 'home',
  sidecar: { state: 'starting' },
  installer: { state: 'checking' },
  codex: null,
  userName: '',
  activeProvider: 'nous',
  activeProfile: null,
  setupMode: 'simple',
  safetyPreset: 'balanced',
  capabilities: ['files', 'web', 'memory'],
  onboarded: true,
  messages: [],
  streaming: false,
  activeThreadId: null,
  paletteOpen: false,
  engineInstalled: null,
  daemon: null,

  setRoute: (route) => set({ route }),
  setSidecar: (sidecar) => set({ sidecar }),
  setInstaller: (installer) => set({ installer }),
  setCodex: (codex) => set({ codex }),
  setUserName: (userName) => set({ userName }),
  setProvider: (activeProvider) => set({ activeProvider }),
  setActiveProfile: (activeProfile) => set({ activeProfile }),
  setSetupMode: (setupMode) => set({ setupMode }),
  setSafetyPreset: (safetyPreset) => set({ safetyPreset }),
  setCapabilities: (capabilities) => set({ capabilities }),
  toggleCapability: (c) =>
    set((s) => ({
      capabilities: s.capabilities.includes(c)
        ? s.capabilities.filter((x) => x !== c)
        : [...s.capabilities, c],
    })),
  setOnboarded: (onboarded) => set({ onboarded }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastAssistantMessage: (fn) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      // Only mutate an existing assistant message when it's the tail of the
      // thread (i.e. the one the current stream is building). Otherwise we'd
      // attach new action cards / tokens to a historical reply from a resumed
      // thread — which looks to the user like the agent never responded.
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = fn(last);
        return { messages: msgs };
      }
      const placeholder: ChatMessage = {
        id: `m${Date.now()}`,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        actions: [],
      };
      msgs.push(fn(placeholder));
      return { messages: msgs };
    }),
  markLastUserError: (err) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          msgs[i] = { ...msgs[i], error: err ?? undefined };
          return { messages: msgs };
        }
      }
      return {};
    }),
  patchAssistantDelta: (delta) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + delta };
      } else {
        msgs.push({
          id: `m${Date.now()}`,
          role: 'assistant',
          content: delta,
          createdAt: Date.now(),
          actions: [],
        });
      }
      return { messages: msgs };
    }),
  setStreaming: (streaming) => set({ streaming }),
  resetThread: () => set({ messages: [], streaming: false, activeThreadId: null }),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setEngineInstalled: (engineInstalled) => set({ engineInstalled }),
  setDaemon: (daemon) => set({ daemon }),
}));

export type { Route };
