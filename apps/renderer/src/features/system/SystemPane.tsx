import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  FileText,
  KeyRound,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ServerCog,
  Settings2,
  Shield,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { Flame } from 'lucide-react';
import { SectionHeading, Badge, Dot, EmptyState } from '../../components/ui/Atoms';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { TabStrip, type Tab as TabDef } from '../../components/ui/TabStrip';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { prewarmDaemon, refreshDaemonStatus } from '../../lib/daemon';
import { relTime } from '../../lib/time';
import { useSession } from '../../stores/session';

type Tab = 'overview' | 'analytics' | 'logs' | 'config' | 'keys';

const TABS: readonly TabDef<Tab>[] = [
  { id: 'overview', label: 'Overview', icon: ServerCog },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'logs', label: 'Logs', icon: TerminalSquare },
  { id: 'config', label: 'Config', icon: Settings2 },
  { id: 'keys', label: 'Keys', icon: KeyRound },
];

type Overview = {
  available: boolean;
  version: string | null;
  profile: string | null;
  gateway: { running: boolean; pid?: number | string | null; active_agents?: number };
  platforms: GatewaySummary[];
  recent_sessions: SessionSummary[];
  counts: { sessions: number; skills: number; cron: number; platforms: number };
};

type GatewaySummary = {
  id: string;
  name: string;
  status: 'online' | 'ready' | 'error' | 'unconfigured';
  configured: boolean;
  platform_updated?: string | number | null;
};

type SessionSummary = {
  id: string;
  title: string;
  preview: string;
  source?: string;
  updated_at: number;
  messages?: number;
};

type Analytics = {
  period_days: number;
  total_sessions: number;
  sampled_sessions: number;
  api_calls: number;
  tokens: { input: number; output: number; total: number };
  daily: { date: string; sessions: number; input: number; output: number }[];
  models: { model: string; sessions: number }[];
  top_skills: { name: string; category: string; runs: number; last_run?: number | null }[];
};

type Logs = {
  file: string;
  path: string;
  exists: boolean;
  lines: string[];
  files: { id: string; path: string; exists: boolean }[];
};

type ConfigPayload = {
  path: string;
  exists: boolean;
  text: string;
  sections: { id: string; label: string; fields: number }[];
};

type EnvPayload = {
  path: string;
  exists: boolean;
  groups: EnvGroup[];
};

type EnvGroup = {
  name: string;
  configured: number;
  total: number;
  items: EnvItem[];
};

type EnvItem = {
  key: string;
  label: string;
  docs?: string;
  set: boolean;
  preview: string;
};

const compact = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export function SystemPane() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="System"
          title="Stark control room"
          description="Operational status, usage, logs, config, and local secrets in one place."
        />
      </div>
      <div className="border-b border-[var(--line)] px-8">
        <TabStrip tabs={TABS} active={tab} onSelect={setTab} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-6xl">
          {tab === 'overview' && <OverviewTab onSelectTab={setTab} />}
          {tab === 'analytics' && <AnalyticsTab />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'config' && <ConfigTab />}
          {tab === 'keys' && <KeysTab />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ onSelectTab }: { onSelectTab: (tab: Tab) => void }) {
  const activeProfile = useSession((s) => s.activeProfile);
  const setRoute = useSession((s) => s.setRoute);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const push = useToast((s) => s.push);

  async function load() {
    const r = await call<Overview>({
      method: 'GET',
      path: '/system/overview',
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok && r.data) setData(r.data);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [activeProfile]);

  async function restartGateway() {
    setBusy(true);
    const r = await call<{ ok: boolean; stderr?: string }>({
      method: 'POST',
      path: '/system/gateway/restart',
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    setBusy(false);
    if (r.ok && r.data?.ok) push({ kind: 'success', title: 'Gateway restarted' });
    else push({ kind: 'error', title: 'Restart failed', description: r.data?.stderr ?? r.error });
    await load();
  }

  if (loading && !data) return <EmptyState loading title="Loading" description="" />;
  if (!data) return <EmptyState title="System unavailable" description="The sidecar did not return system data." />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Agent" value={data.version ? `v${data.version}` : 'unknown'} detail={data.available ? 'Engine detected' : 'Engine unavailable'} tone={data.available ? 'ok' : 'warn'} />
        <MetricCard label="Gateway" value={data.gateway.running ? 'Running' : 'Stopped'} detail={data.gateway.pid ? `PID ${data.gateway.pid}` : 'No live PID'} tone={data.gateway.running ? 'ok' : 'warn'} />
        <MetricCard label="Sessions" value={compact(data.counts.sessions)} detail={`${data.recent_sessions.length} recent shown`} tone="primary" />
        <MetricCard label="Platforms" value={compact(data.counts.platforms)} detail={`${data.counts.cron} scheduled jobs`} tone={data.counts.platforms ? 'ok' : 'neutral'} />
      </div>

      <DaemonCard />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Connected platforms</h2>
            <Button variant="ghost" size="sm" leading={<RefreshCcw className="h-3 w-3" />} onClick={load}>
              Refresh
            </Button>
          </div>
          {data.platforms.length === 0 ? (
            <EmptyState title="No platforms connected" description="Configure messaging channels in Gateways or Keys." action={<Button variant="primary" onClick={() => setRoute('gateways')}>Open Gateways</Button>} />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {data.platforms.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="font-mono mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                      {p.platform_updated ? `updated ${String(p.platform_updated)}` : p.configured ? 'configured' : 'not configured'}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-2xl">Actions</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Operational commands that affect the local Stark runtime.
          </p>
          <div className="mt-4 space-y-2">
            <Button variant="primary" leading={<RotateCcw className="h-3.5 w-3.5" />} loading={busy} onClick={restartGateway} className="w-full justify-center">
              Restart gateway
            </Button>
            <Button variant="secondary" leading={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setRoute('settings')} className="w-full justify-center">
              Run System Doctor
            </Button>
            <Button variant="ghost" leading={<KeyRound className="h-3.5 w-3.5" />} onClick={() => onSelectTab('keys')} className="w-full justify-center">
              Manage keys
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Recent sessions</h2>
        <div className="mt-4 grid gap-2">
          {data.recent_sessions.map((s) => (
            <div key={s.id} className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-medium">{s.title || 'Untitled'}</h3>
                {s.source && <Badge>{s.source}</Badge>}
              </div>
              <p className="mt-1 line-clamp-1 text-[12.5px] text-[var(--fg-muted)]">{s.preview}</p>
              <div className="font-mono mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                {relTime(s.updated_at * 1000)} · {s.id}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DaemonCard() {
  const daemon = useSession((s) => s.daemon);
  const activeProfile = useSession((s) => s.activeProfile);
  const engineInstalled = useSession((s) => s.engineInstalled);
  const push = useToast((s) => s.push);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshDaemonStatus();
  }, []);

  const profileKey = activeProfile || 'default';
  const warmProfiles = daemon?.warmProfiles ?? [];
  const activeWarm = warmProfiles.includes(profileKey);
  const coldInFlight = !!daemon?.coldStartInFlight;

  async function onPrewarm() {
    setBusy(true);
    const r = await prewarmDaemon(activeProfile ?? null);
    setBusy(false);
    if (r.ok) {
      push({
        kind: 'success',
        title: r.wasWarm ? 'Already warm' : 'Engine warmed',
        description:
          r.wasWarm
            ? `${profileKey} was already warm.`
            : `Warmed ${profileKey} in ${r.durationMs ?? 0} ms.`,
      });
    } else {
      push({
        kind: 'error',
        title: 'Prewarm failed',
        description: r.error ?? 'See logs for details.',
      });
    }
    void refreshDaemonStatus();
  }

  const tone: 'ok' | 'warn' =
    engineInstalled === false
      ? 'warn'
      : activeWarm && !coldInFlight
        ? 'ok'
        : 'warn';
  const statusLabel =
    engineInstalled === false
      ? 'stub'
      : activeWarm && !coldInFlight
        ? 'warm'
        : coldInFlight
          ? 'warming'
          : 'cold';

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
            Daemon · local engine
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Dot tone={tone} pulse={statusLabel === 'warming'} />
            <h2 className="font-display text-2xl capitalize">{statusLabel}</h2>
            <span className="font-mono text-[11px] text-[var(--fg-ghost)]">· {profileKey}</span>
          </div>
          <p className="mt-2 text-[12.5px] text-[var(--fg-muted)]">
            Stark keeps one engine process warm per profile so chats don't pay a cold start on
            the first message. The daemon lives inside the sidecar for the life of the app.
          </p>
          {warmProfiles.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                warm
              </span>
              {warmProfiles.map((p) => (
                <Badge key={p} tone={p === profileKey ? 'ok' : 'neutral'}>
                  {p}
                </Badge>
              ))}
            </div>
          )}
          {daemon?.lastPrewarmError && (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--warn)]/30 bg-[var(--warn-wash)]/40 px-3 py-2 text-[12px] text-[var(--fg-muted)]">
              Last prewarm error: {daemon.lastPrewarmError}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <Button
            variant="primary"
            size="sm"
            leading={<Flame className="h-3 w-3" />}
            loading={busy}
            disabled={engineInstalled === false}
            onClick={onPrewarm}
            title={
              engineInstalled === false
                ? 'Engine CLI is not installed on this Mac'
                : `Force-warm ${profileKey}`
            }
          >
            Prewarm now
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'ok' | 'warn' | 'primary' | 'neutral' }) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <Dot tone={tone === 'neutral' ? 'dim' : tone} />
        <div className="font-display text-2xl">{value}</div>
      </div>
      <div className="font-mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">{detail}</div>
    </Card>
  );
}

function StatusBadge({ status }: { status: GatewaySummary['status'] }) {
  if (status === 'online') return <Badge tone="ok">online</Badge>;
  if (status === 'ready') return <Badge tone="primary">ready</Badge>;
  if (status === 'error') return <Badge tone="bad">error</Badge>;
  return <Badge>unconfigured</Badge>;
}

function AnalyticsTab() {
  const activeProfile = useSession((s) => s.activeProfile);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(nextDays = days) {
    setLoading(true);
    const r = await call<Analytics>({
      method: 'GET',
      path: '/system/analytics',
      query: { days: String(nextDays), ...(activeProfile ? { profile: activeProfile } : {}) },
    });
    if (r.ok && r.data) setData(r.data);
    setLoading(false);
  }
  useEffect(() => {
    void load(days);
  }, [activeProfile]);

  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((d) => d.input + d.output));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'primary' : 'ghost'}
              onClick={() => {
                setDays(d);
                void load(d);
              }}
            >
              {d}d
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" leading={<RefreshCcw className="h-3 w-3" />} loading={loading} onClick={() => load()}>
          Refresh
        </Button>
      </div>
      {loading && !data ? (
        <EmptyState loading title="Loading" description="" />
      ) : data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Total tokens" value={compact(data.tokens.total || data.tokens.input + data.tokens.output)} detail={`${compact(data.tokens.input)} in / ${compact(data.tokens.output)} out`} tone="primary" />
            <MetricCard label="Sessions" value={compact(data.total_sessions)} detail={`${data.sampled_sessions} sampled`} tone="ok" />
            <MetricCard label="API calls" value={compact(data.api_calls)} detail={`${data.models.length} models`} tone="primary" />
            <MetricCard label="Period" value={`${data.period_days}d`} detail="local session history" tone="neutral" />
          </div>

          <Card className="p-5">
            <h2 className="font-display text-2xl">Daily token usage</h2>
            <div className="mt-4 flex h-44 items-end gap-1 border-b border-[var(--line)] pb-2">
              {data.daily.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-[var(--fg-muted)]">No token usage found in sampled sessions.</div>
              ) : (
                data.daily.map((d) => {
                  const pct = Math.max(4, ((d.input + d.output) / maxDaily) * 100);
                  return (
                    <div key={d.date} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t bg-[var(--primary)]/80 transition-colors group-hover:bg-[var(--primary)]" style={{ height: `${pct}%` }} title={`${d.date}: ${compact(d.input + d.output)} tokens`} />
                      <div className="font-mono truncate text-[9px] uppercase tracking-[0.08em] text-[var(--fg-ghost)]">{d.date}</div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <DataTable
              title="Per-model breakdown"
              headers={['Model', 'Sessions']}
              rows={data.models.map((m) => [m.model, compact(m.sessions)])}
            />
            <DataTable
              title="Top skills"
              headers={['Skill', 'Runs', 'Last used']}
              rows={data.top_skills.map((s) => [s.name, compact(s.runs), s.last_run ? relTime(s.last_run * 1000) : 'never'])}
            />
          </div>
        </>
      ) : (
        <EmptyState title="Analytics unavailable" description="No usage data was returned." />
      )}
    </div>
  );
}

function DataTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="font-display text-xl">{title}</h2>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="font-mono bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.length === 0 ? (
            <tr><td className="px-4 py-8 text-center text-[var(--fg-muted)]" colSpan={headers.length}>No data yet.</td></tr>
          ) : rows.map((row, i) => (
            <tr key={`${row[0]}-${i}`}>
              {row.map((cell, j) => <td key={j} className="max-w-[260px] truncate px-4 py-2 text-[13px]">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LogsTab() {
  const [file, setFile] = useState('agent');
  const [level, setLevel] = useState('all');
  const [component, setComponent] = useState('all');
  const [lines, setLines] = useState(100);
  const [auto, setAuto] = useState(false);
  const [data, setData] = useState<Logs | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await call<Logs>({
      method: 'GET',
      path: '/system/logs',
      query: { file, level, component, lines: String(lines) },
    });
    if (r.ok && r.data) setData(r.data);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [file, level, component, lines]);
  useEffect(() => {
    if (!auto) return;
    const i = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(i);
  }, [auto, file, level, component, lines]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_120px_auto_auto] lg:items-end">
          <Picker label="File" value={file} onChange={setFile} options={['agent', 'errors', 'gateway']} />
          <Picker label="Level" value={level} onChange={setLevel} options={['all', 'debug', 'info', 'warning', 'error']} />
          <Picker label="Component" value={component} onChange={setComponent} options={['all', 'gateway', 'agent', 'tools', 'cli', 'cron']} />
          <Picker label="Lines" value={String(lines)} onChange={(v) => setLines(Number(v))} options={['50', '100', '200', '500']} />
          <label className="flex h-10 items-center gap-2 text-sm text-[var(--fg-muted)]">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-refresh
          </label>
          <Button variant="primary" leading={<RefreshCcw className="h-3 w-3" />} loading={loading} onClick={load}>
            Refresh
          </Button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <div>
            <h2 className="font-display text-xl">{data?.file ?? file}.log</h2>
            <div className="font-mono mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">{data?.path ?? 'loading'}</div>
          </div>
          {data?.exists ? <Badge tone="ok">found</Badge> : <Badge tone="warn">missing</Badge>}
        </div>
        <pre className="font-mono h-[520px] overflow-auto bg-[#07110f] p-4 text-[12px] leading-relaxed text-[#b8f5dc]">
          {data?.lines.length ? data.lines.join('\n') : 'No matching log lines.'}
        </pre>
      </Card>
    </div>
  );
}

function Picker({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--fg)] outline-none transition-colors hover:border-[var(--line-strong)] focus:border-[var(--primary)] focus:[box-shadow:var(--ring-focus)]"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

function ConfigTab() {
  const [data, setData] = useState<ConfigPayload | null>(null);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const push = useToast((s) => s.push);

  async function load() {
    setLoading(true);
    const r = await call<ConfigPayload>({ method: 'GET', path: '/system/config' });
    if (r.ok && r.data) {
      setData(r.data);
      setDraft(r.data.text);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    const r = await call({ method: 'PUT', path: '/system/config', body: { text: draft } });
    setSaving(false);
    if (r.ok) push({ kind: 'success', title: 'Config saved', description: 'A timestamped backup was created.' });
    else push({ kind: 'error', title: 'Save failed', description: r.error });
    await load();
  }

  const filteredSections = useMemo(() => {
    const sections = data?.sections ?? [];
    return q.trim() ? sections.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase())) : sections;
  }, [data, q]);

  if (loading && !data) return <EmptyState loading title="Loading" description="" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">Config file</div>
        <div className="font-mono mt-2 text-[11px] text-[var(--fg-muted)]">{data?.exists ? 'Local config file loaded' : 'Local config file will be created'}</div>
        <div className="mt-4">
          <Input leading={<Search className="h-3.5 w-3.5" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections" />
        </div>
        <div className="mt-3 max-h-[520px] space-y-1 overflow-auto">
          {filteredSections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                const idx = draft.indexOf(`${s.id}:`);
                if (idx >= 0) {
                  const el = document.getElementById('system-config-text') as HTMLTextAreaElement | null;
                  el?.focus();
                  el?.setSelectionRange(idx, idx);
                }
              }}
              className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            >
              <span className="truncate">{s.label}</span>
              <Badge>{s.fields}</Badge>
            </button>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--fg-dim)]" />
            <h2 className="font-display text-xl">YAML editor</h2>
            {data?.exists ? <Badge tone="ok">loaded</Badge> : <Badge tone="warn">new file</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" leading={<RefreshCcw className="h-3 w-3" />} onClick={load}>Reload</Button>
            <Button size="sm" variant="primary" leading={<Save className="h-3 w-3" />} loading={saving} onClick={save} disabled={draft === data?.text}>Save</Button>
          </div>
        </div>
        <Textarea
          id="system-config-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="font-mono h-[620px] rounded-none border-0 bg-[#07110f] text-[12px] leading-relaxed text-[#d7ffed] focus:[box-shadow:none]"
        />
      </Card>
    </div>
  );
}

function KeysTab() {
  const activeProfile = useSession((s) => s.activeProfile);
  const [data, setData] = useState<EnvPayload | null>(null);
  const [editing, setEditing] = useState<EnvItem | null>(null);
  const [loading, setLoading] = useState(true);
  const push = useToast((s) => s.push);

  async function load() {
    setLoading(true);
    const r = await call<EnvPayload>({
      method: 'GET',
      path: '/system/env',
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok && r.data) setData(r.data);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [activeProfile]);

  async function clearKey(key: string) {
    if (!window.confirm(`Clear ${key} from the local secrets file?`)) return;
    const r = await call({
      method: 'DELETE',
      path: `/system/env/${key}`,
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok) push({ kind: 'success', title: `${key} cleared` });
    else push({ kind: 'error', title: 'Clear failed', description: r.error });
    await load();
  }

  if (loading && !data) return <EmptyState loading title="Loading" description="" />;

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">Secrets file</div>
          <div className="font-mono mt-1 text-[11px] text-[var(--fg-muted)]">{data?.exists ? 'Local secrets file loaded' : 'Local secrets file will be created'}</div>
        </div>
        <Button variant="ghost" size="sm" leading={<RefreshCcw className="h-3 w-3" />} onClick={load}>Refresh</Button>
      </Card>

      {(data?.groups ?? []).map((group) => (
        <Card key={group.name} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="font-display text-xl">{group.name}</h2>
              <div className="font-mono mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                {group.configured} of {group.total} configured
              </div>
            </div>
            <Badge tone={group.configured ? 'ok' : 'neutral'}>{group.configured ? 'active' : 'empty'}</Badge>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {group.items.map((item) => (
              <div key={item.key} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.set ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" /> : <Shield className="h-3.5 w-3.5 text-[var(--fg-dim)]" />}
                    <div className="text-sm font-medium">{item.label}</div>
                    <Badge tone={item.set ? 'ok' : 'neutral'}>{item.set ? 'set' : 'missing'}</Badge>
                  </div>
                  <div className="font-mono mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--fg-ghost)]">{item.key}</div>
                  {item.set && <div className="font-mono mt-1 text-[11px] text-[var(--fg-muted)]">{item.preview}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.docs && (
                    <Button size="sm" variant="ghost" onClick={() => void window.stark.openExternal(item.docs!)}>
                      Get key
                    </Button>
                  )}
                  <Button size="sm" variant={item.set ? 'secondary' : 'primary'} onClick={() => setEditing(item)}>
                    {item.set ? 'Replace' : 'Add'}
                  </Button>
                  {item.set && (
                    <button
                      onClick={() => void clearKey(item.key)}
                      title={`Clear ${item.key}`}
                      aria-label={`Clear ${item.key}`}
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-dim)] transition-colors hover:bg-[var(--bad-wash)] hover:text-[var(--bad)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {editing && (
        <SecretDialog
          item={editing}
          profile={activeProfile}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function SecretDialog({ item, profile, onClose, onSaved }: { item: EnvItem; profile: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const push = useToast((s) => s.push);

  async function save() {
    setSaving(true);
    const r = await call({
      method: 'PUT',
      path: `/system/env/${item.key}`,
      query: profile ? { profile } : undefined,
      body: { value },
    });
    setSaving(false);
    if (r.ok) {
      push({ kind: 'success', title: `${item.key} saved` });
      await onSaved();
    } else {
      push({ kind: 'error', title: 'Save failed', description: r.error });
    }
  }

  return (
    <Dialog open onClose={onClose} title={item.set ? `Replace ${item.label}` : `Add ${item.label}`} description="Stored locally in the selected secrets file. The value is not shown again after saving.">
      <div className="space-y-4">
        <Field label={item.key} hint={item.set ? `current ${item.preview}` : undefined}>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="password"
            autoFocus
            placeholder="Paste secret value"
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={!value.trim()} onClick={save}>
          Save key
        </Button>
      </div>
    </Dialog>
  );
}
