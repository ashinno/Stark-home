// Dev-only shim so `window.stark.*` is safe to touch when the renderer is
// loaded in a plain browser (no Electron preload). In production the preload
// always runs before renderer code, so this is a pure no-op import side effect.

type NoopUnsub = () => void;
const noopUnsub: NoopUnsub = () => {};

if (typeof window !== 'undefined' && !(window as any).stark) {
  const rejectCall = () =>
    Promise.resolve({ ok: false, status: 0, error: 'stark preload not available' });

  (window as any).stark = {
    appInfo: () => Promise.resolve({ version: 'browser', channel: 'dev' }),
    sidecar: {
      status: () => Promise.resolve({ state: 'error' }),
      onStatus: () => noopUnsub,
      request: rejectCall,
      stream: (_req: unknown, onEvent: (e: { type: 'error'; message: string } | { type: 'end' }) => void) => {
        setTimeout(() => {
          onEvent({ type: 'error', message: 'stark preload not available' });
          onEvent({ type: 'end' });
        }, 0);
        return noopUnsub;
      },
    },
    installer: {
      status: () => Promise.resolve({ state: 'idle' }),
      start: () => Promise.resolve(),
      onStatus: () => noopUnsub,
      onProgress: () => noopUnsub,
    },
    codex: {
      detect: () => Promise.resolve({ installed: false, signedIn: false }),
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    },
    onPaletteToggle: () => noopUnsub,
    onTrayCommand: () => noopUnsub,
    openExternal: () => Promise.resolve(),
  };
}
