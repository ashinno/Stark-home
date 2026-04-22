import { app, BrowserWindow, globalShortcut, nativeImage, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { SidecarManager } from './sidecar';
import { CodexDetector } from './codex';
import { Installer } from './installer';
import { installTray } from './tray';
import { IPC } from '@shared/rpc';

const APP_ID = 'com.stark.app';

let mainWindow: BrowserWindow | null = null;
const sidecar = new SidecarManager();
const codex = new CodexDetector();
const installer = new Installer();

function resolveAppIcon() {
  // In dev, resources/ sits next to apps/. In packaged builds, electron-builder
  // copies it into Contents/Resources/.
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png'),
    join(__dirname, '../../../resources/icon.png'),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function createWindow(): void {
  const iconPath = resolveAppIcon();
  if (iconPath && process.platform === 'darwin') {
    // Set the dock icon explicitly so Stark shows up even in dev.
    app.dock?.setIcon(nativeImage.createFromPath(iconPath));
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0b0f',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    trafficLightPosition: { x: 16, y: 18 },
    icon: iconPath ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function focusMain(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId(APP_ID);
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w));

  registerIpc({
    sidecar,
    codex,
    installer,
    getMainWindow: () => mainWindow,
  });

  // Tray (menu bar helper).
  installTray({
    getMainWindow: () => mainWindow,
    focusMain,
    sidecar,
  });

  // Global shortcut: ⌘⇧Space — "What should Hermes do?"
  const ok = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    focusMain();
    mainWindow?.webContents.send(IPC.PaletteToggle);
  });
  if (!ok) console.warn('[stark] could not register global palette shortcut');

  // Kick off Hermes install check + sidecar boot in parallel with the UI.
  void installer.check();
  void sidecar.start().catch((err) => console.error('[sidecar] start failed:', err));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS: stay in dock (and the tray keeps us alive).
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('before-quit', async (event) => {
  if (sidecar.isRunning()) {
    event.preventDefault();
    await sidecar.stop();
    app.quit();
  }
});
