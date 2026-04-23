import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/rpc';
import type {
  CodexStatus,
  InstallerProgress,
  InstallerStatus,
  ScreenshotResult,
  SidecarRequest,
  SidecarResponse,
  SidecarStatus,
} from '@shared/rpc';

type StreamEvent =
  | { type: 'data'; chunk: string }
  | { type: 'end' }
  | { type: 'error'; message: string };

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  appInfo: () => ipcRenderer.invoke(IPC.AppInfo),

  sidecar: {
    status: (): Promise<SidecarStatus> => ipcRenderer.invoke(IPC.SidecarStatus),
    onStatus: (cb: (s: SidecarStatus) => void) => subscribe(IPC.SidecarStatus, cb),
    request: <T = unknown>(req: SidecarRequest): Promise<SidecarResponse<T>> =>
      ipcRenderer.invoke(IPC.SidecarRequest, req),
    stream: (req: SidecarRequest, onEvent: (e: StreamEvent) => void): (() => void) => {
      const streamId = `s${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const channel = `${IPC.SidecarEventStream}:${streamId}`;
      const off = subscribe<StreamEvent>(channel, onEvent);
      ipcRenderer.send(IPC.SidecarEventStream, { streamId, req });
      return off;
    },
  },

  installer: {
    status: (): Promise<InstallerStatus> => ipcRenderer.invoke(IPC.InstallerStatus),
    start: (): Promise<void> => ipcRenderer.invoke(IPC.InstallerStart),
    onStatus: (cb: (s: InstallerStatus) => void) => subscribe(IPC.InstallerStatus, cb),
    onProgress: (cb: (p: InstallerProgress) => void) => subscribe(IPC.InstallerProgress, cb),
  },

  codex: {
    detect: (): Promise<CodexStatus> => ipcRenderer.invoke(IPC.CodexDetect),
    signIn: (): Promise<void> => ipcRenderer.invoke(IPC.CodexSignIn),
    signOut: (): Promise<void> => ipcRenderer.invoke(IPC.CodexSignOut),
  },

  onPaletteToggle: (cb: () => void) => subscribe<void>(IPC.PaletteToggle, cb),
  onTrayCommand: (cb: (cmd: string) => void) => subscribe<string>(IPC.TrayCommand, cb),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OpenExternal, url),

  capture: {
    screen: (): Promise<ScreenshotResult> => ipcRenderer.invoke(IPC.CaptureScreenshot),
  },
};

contextBridge.exposeInMainWorld('stark', api);

export type StarkApi = typeof api;
