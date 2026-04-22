import { useEffect, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/CommandPalette';
import { ToastStack } from './components/ui/Toast';
import { RouteTransition } from './components/ui/RouteTransition';
import { useSession, type Route } from './stores/session';
import { useTheme } from './stores/theme';
import { call } from './lib/rpc';
import { HomePane } from './features/home/HomePane';
import { ThreadsPane } from './features/threads/ThreadsPane';
import { ToolsPane } from './features/tools/ToolsPane';
import { SkillsPane } from './features/skills/SkillsPane';
import { AutomationsPane } from './features/automations/AutomationsPane';
import { MemoryPane } from './features/memory/MemoryPane';
import { GatewaysPane } from './features/gateways/GatewaysPane';
import { ActivityPane } from './features/activity/ActivityPane';
import { SettingsPane } from './features/settings/SettingsPane';
import { Onboarding } from './features/onboarding/Onboarding';

type SidecarSettings = {
  user_name?: string;
  setup_mode?: 'simple' | 'developer' | 'operator' | 'private';
  safety_preset?: 'safe' | 'balanced' | 'autonomous';
  capabilities?: ('files' | 'terminal' | 'browser' | 'web' | 'memory' | 'automations' | 'messaging' | 'voice')[];
  active_provider?: string;
  active_profile?: string | null;
  onboarded?: boolean;
};

export function App() {
  const route = useSession((s) => s.route);
  const sidecar = useSession((s) => s.sidecar);
  const setSidecar = useSession((s) => s.setSidecar);
  const setInstaller = useSession((s) => s.setInstaller);
  const setCodex = useSession((s) => s.setCodex);
  const setUserName = useSession((s) => s.setUserName);
  const setProvider = useSession((s) => s.setProvider);
  const setActiveProfile = useSession((s) => s.setActiveProfile);
  const setSetupMode = useSession((s) => s.setSetupMode);
  const setSafetyPreset = useSession((s) => s.setSafetyPreset);
  const setCapabilitiesGlobal = useSession((s) => s.setCapabilities);
  const setOnboarded = useSession((s) => s.setOnboarded);
  const onboarded = useSession((s) => s.onboarded);
  const setRoute = useSession((s) => s.setRoute);
  const setPaletteOpen = useSession((s) => s.setPaletteOpen);

  const initTheme = useTheme((s) => s.init);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Theme init (applies the data-theme attribute before first paint in ideal case)
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Sidecar + installer + codex status subscriptions
  useEffect(() => {
    void window.stark.sidecar.status().then(setSidecar);
    const offSide = window.stark.sidecar.onStatus(setSidecar);
    void window.stark.installer.status().then(setInstaller);
    const offIns = window.stark.installer.onStatus(setInstaller);
    void window.stark.codex.detect().then(setCodex);
    return () => {
      offSide();
      offIns();
    };
  }, [setSidecar, setInstaller, setCodex]);

  // Load settings from the sidecar when it's ready.
  useEffect(() => {
    if (sidecar.state !== 'ready' || settingsLoaded) return;
    void (async () => {
      const r = await call<{ settings: SidecarSettings }>({ method: 'GET', path: '/settings' });
      if (r.ok && r.data) {
        const s = r.data.settings;
        if (s.user_name) setUserName(s.user_name);
        if (s.active_provider) setProvider(s.active_provider);
        if (s.active_profile !== undefined) setActiveProfile(s.active_profile);
        if (s.setup_mode) setSetupMode(s.setup_mode);
        if (s.safety_preset) setSafetyPreset(s.safety_preset);
        if (s.capabilities) setCapabilitiesGlobal(s.capabilities);
        setOnboarded(!!s.onboarded);
      }
      setSettingsLoaded(true);
    })();
  }, [
    sidecar.state,
    settingsLoaded,
    setUserName,
    setProvider,
    setActiveProfile,
    setSetupMode,
    setSafetyPreset,
    setCapabilitiesGlobal,
    setOnboarded,
  ]);

  // Global hotkeys: ⌘1-5 primary nav, ⌘, settings, ⌘K palette.
  useEffect(() => {
    const routes: Route[] = [
      'home', 'threads', 'tools', 'skills', 'automations', 'memory', 'gateways', 'activity',
    ];
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (/^[1-8]$/.test(e.key)) {
        e.preventDefault();
        setRoute(routes[parseInt(e.key, 10) - 1]);
      } else if (e.key === ',') {
        e.preventDefault();
        setRoute('settings');
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setRoute, setPaletteOpen]);

  // Palette toggle from menu bar or global shortcut.
  useEffect(() => {
    return window.stark.onPaletteToggle(() => setPaletteOpen(true));
  }, [setPaletteOpen]);

  // Tray command dispatch.
  useEffect(() => {
    return window.stark.onTrayCommand((cmd) => {
      if (cmd === 'continue-thread') setRoute('threads');
      else if (cmd === 'running-jobs' || cmd === 'approvals') setRoute('home');
      else if (cmd === 'gateway-start') setRoute('settings');
      else if (cmd === 'settings') setRoute('settings');
      else if (cmd === 'pause-agents') void call({ method: 'POST', path: '/agents/pause' });
    });
  }, [setRoute]);

  const showOnboarding = settingsLoaded && !onboarded;

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <RouteTransition routeKey={route}>
            {route === 'home' && <HomePane />}
            {route === 'threads' && <ThreadsPane />}
            {route === 'tools' && <ToolsPane />}
            {route === 'skills' && <SkillsPane />}
            {route === 'automations' && <AutomationsPane />}
            {route === 'memory' && <MemoryPane />}
            {route === 'gateways' && <GatewaysPane />}
            {route === 'activity' && <ActivityPane />}
            {route === 'settings' && <SettingsPane />}
          </RouteTransition>
        </main>
      </div>
      <StatusBar />

      <CommandPalette />
      <ToastStack />
      {showOnboarding && <Onboarding onClose={() => setOnboarded(true)} />}
    </div>
  );
}
