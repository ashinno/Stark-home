import { BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import { IPC } from '@shared/rpc';
import type { SidecarRequest } from '@shared/rpc';
import type { SidecarManager } from './sidecar';
import type { CodexDetector } from './codex';
import type { Installer } from './installer';

type Deps = {
  sidecar: SidecarManager;
  codex: CodexDetector;
  installer: Installer;
  getMainWindow: () => BrowserWindow | null;
};

export function registerIpc({ sidecar, codex, installer, getMainWindow }: Deps): void {
  ipcMain.handle(IPC.AppInfo, () => ({
    name: 'Stark',
    version: process.env.npm_package_version ?? '0.1.0',
    platform: process.platform,
    arch: process.arch,
    themeSource: nativeTheme.themeSource,
  }));

  // Sidecar status + proxied request + streaming.
  ipcMain.handle(IPC.SidecarStatus, () => sidecar.getStatus());
  sidecar.on('status', (s) => getMainWindow()?.webContents.send(IPC.SidecarStatus, s));

  ipcMain.handle(IPC.SidecarRequest, async (_ev, req: SidecarRequest) => sidecar.request(req));

  ipcMain.on(IPC.SidecarEventStream, async (event, payload: { streamId: string; req: SidecarRequest }) => {
    const { streamId, req } = payload;
    const send = (msg: unknown) => event.sender.send(`${IPC.SidecarEventStream}:${streamId}`, msg);
    try {
      for await (const chunk of sidecar.stream(req)) send({ type: 'data', chunk });
      send({ type: 'end' });
    } catch (err) {
      send({ type: 'error', message: (err as Error).message });
    }
  });

  // Installer.
  ipcMain.handle(IPC.InstallerStatus, () => installer.getStatus());
  ipcMain.handle(IPC.InstallerStart, () => installer.install());
  installer.on('status', (s) => getMainWindow()?.webContents.send(IPC.InstallerStatus, s));
  installer.on('progress', (p) => getMainWindow()?.webContents.send(IPC.InstallerProgress, p));

  // Codex (ChatGPT CLI).
  ipcMain.handle(IPC.CodexDetect, () => codex.detect());
  ipcMain.handle(IPC.CodexSignIn, () => codex.signIn());
  ipcMain.handle(IPC.CodexSignOut, () => codex.signOut());

  // Utilities.
  ipcMain.handle(IPC.OpenExternal, (_ev, url: string) => {
    if (!/^https?:\/\//.test(url)) return;
    void shell.openExternal(url);
  });
}
