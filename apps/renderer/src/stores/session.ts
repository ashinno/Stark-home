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
  | 'settings';

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
  homeMode: boolean;

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
  patchAssistantDelta: (delta: string) => void;
  setStreaming: (v: boolean) => void;
  resetThread: () => void;
  setActiveThreadId: (id: string | null) => void;
  setPaletteOpen: (v: boolean) => void;
  setHomeMode: (v: boolean) => void;
  toggleHomeMode: () => void;
};

const HOME_MODE_KEY = 'stark.home_mode';
const readHomeMode = () => {
  try {
    return localStorage.getItem(HOME_MODE_KEY) === '1';
  } catch {
    return false;
  }
};
const writeHomeMode = (v: boolean) => {
  try {
    localStorage.setItem(HOME_MODE_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
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
  homeMode: readHomeMode(),

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
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = fn(msgs[i]);
          return { messages: msgs };
        }
      }
      // No assistant message yet — create a placeholder so action cards have
      // a home before the first token arrives. Otherwise events emitted
      // before streaming (the "Hermes is thinking…" card) get dropped.
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
  setHomeMode: (homeMode) => {
    writeHomeMode(homeMode);
    set({ homeMode });
  },
  toggleHomeMode: () =>
    set((s) => {
      const next = !s.homeMode;
      writeHomeMode(next);
      return { homeMode: next };
    }),
}));

export type { Route };
