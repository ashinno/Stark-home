import { create } from 'zustand';
import type { Theme } from '@shared/rpc';

const STORAGE_KEY = 'stark.theme';

function readInitial(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  return 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(t: Theme) {
  const effective: 'dark' | 'light' = t === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : t;
  document.documentElement.setAttribute('data-theme', effective);
}

type Store = {
  theme: Theme;
  effective: 'dark' | 'light';
  setTheme: (t: Theme) => void;
  init: () => void;
};

export const useTheme = create<Store>((set) => ({
  theme: 'system',
  effective: 'dark',
  setTheme: (t) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    set({ theme: t, effective: t === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : t });
  },
  init: () => {
    const t = readInitial();
    applyTheme(t);
    set({ theme: t, effective: t === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : t });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      const current = (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
      if (current === 'system') {
        applyTheme('system');
        set({ effective: systemPrefersDark() ? 'dark' : 'light' });
      }
    });
  },
}));
