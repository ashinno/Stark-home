import { BrowserWindow, desktopCapturer, ipcMain, nativeTheme, screen, shell } from 'electron';
import { IPC } from '@shared/rpc';
import type { ScreenshotResult, SidecarRequest } from '@shared/rpc';
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

  // Desktop screenshot. Asks Electron for the primary display, grabs a
  // full-screen thumbnail at the native resolution, and returns base64 PNG.
  // macOS will surface the Screen Recording permission prompt the first time
  // we call this — no private API needed.
  ipcMain.handle(IPC.CaptureScreenshot, async (): Promise<ScreenshotResult> => {
    try {
      const primary = screen.getPrimaryDisplay();
      // workAreaSize excludes the menu bar + dock; workArea is absolute.
      // Use size in scaled pixels with scaleFactor for native resolution.
      const { width, height } = primary.size;
      const scale = primary.scaleFactor || 1;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        },
      });
      // Match the primary display; fall back to the first source we got.
      const primaryIdStr = String(primary.id);
      const src =
        sources.find((s) => s.display_id === primaryIdStr) ?? sources[0];
      if (!src) {
        return { ok: false, error: 'No screen sources returned' };
      }
      // Hide Stark's own window so the screenshot captures the user's
      // desktop, not the app asking for the screenshot. Window is restored
      // right after the capture settles.
      const win = getMainWindow();
      const wasVisible = win?.isVisible() ?? false;
      if (win && wasVisible) win.hide();
      // Let the WindowServer compositing catch up so the hide actually lands
      // before we read the thumbnail. One tick is usually enough.
      await new Promise((r) => setTimeout(r, 120));
      const refreshed = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        },
      });
      const finalSrc =
        refreshed.find((s) => s.display_id === primaryIdStr) ?? refreshed[0] ?? src;
      const png = finalSrc.thumbnail.toPNG();
      if (win && wasVisible) {
        win.show();
        win.focus();
      }
      return {
        ok: true,
        mime: 'image/png',
        dataBase64: png.toString('base64'),
        width: finalSrc.thumbnail.getSize().width,
        height: finalSrc.thumbnail.getSize().height,
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
