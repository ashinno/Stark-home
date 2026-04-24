import { call } from './rpc';
import { useSession, type DaemonState } from '../stores/session';

type DaemonStatusPayload = {
  running: boolean;
  active_profile: string | null;
  engine: { installed: boolean; cli_path: string | null };
  warm_profiles: string[];
  warming_profiles?: string[];
  cold_start_in_flight: boolean;
  last_prewarm_at: number | null;
  last_prewarm_error: { profile: string | null; error: string; at: number } | null;
};

function adapt(p: DaemonStatusPayload): DaemonState {
  return {
    warmProfiles: p.warm_profiles ?? [],
    warmingProfiles: p.warming_profiles ?? [],
    coldStartInFlight: !!p.cold_start_in_flight,
    lastPrewarmAt: p.last_prewarm_at ?? null,
    lastPrewarmError: p.last_prewarm_error?.error ?? null,
  };
}

export async function refreshDaemonStatus(): Promise<DaemonState | null> {
  const r = await call<DaemonStatusPayload>({ method: 'GET', path: '/daemon/status' });
  if (!r.ok || !r.data) return null;
  const next = adapt(r.data);
  useSession.getState().setDaemon(next);
  return next;
}

export async function prewarmDaemon(profile?: string | null): Promise<{
  ok: boolean;
  wasWarm?: boolean;
  durationMs?: number;
  error?: string;
}> {
  const r = await call<{
    ok: boolean;
    profile?: string;
    was_warm?: boolean;
    duration_ms?: number;
    error?: string;
  }>({
    method: 'POST',
    path: '/daemon/prewarm',
    body: profile !== undefined ? { profile } : {},
  });
  // Refresh regardless so the UI picks up any side-effects (warming_profiles, errors).
  void refreshDaemonStatus();
  if (!r.ok || !r.data) {
    return { ok: false, error: r.error ?? 'request failed' };
  }
  return {
    ok: !!r.data.ok,
    wasWarm: r.data.was_warm,
    durationMs: r.data.duration_ms,
    error: r.data.error,
  };
}
