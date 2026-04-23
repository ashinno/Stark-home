import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Coins,
  Cpu,
  Pause,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { SectionHeading, Badge, Dot, EmptyState, ProgressBar } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { call } from '../../lib/rpc';
import type { Approval, Job } from '@shared/rpc';
import { relTime } from '../../lib/time';
import { cn } from '../../lib/cn';

/** Snapshot of the /usage endpoint — mirrors the sidecar shape. */
type UsageTotals = {
  input_tokens: number;
  output_tokens: number;
  cached_read_tokens: number;
  thought_tokens: number;
  total_tokens: number;
  turns: number;
  estimated_cost_cents: number;
};

type UsageSessionRow = {
  id: string;
  title: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_read_tokens: number;
  thought_tokens: number;
  total_tokens: number;
  cost_cents: number;
  updated_at: number;
};

type UsagePayload = {
  generated_at: number;
  active_model: string;
  totals: UsageTotals;
  sessions: UsageSessionRow[];
  pricing_note: string;
};

/** Format a signed int in cents as a currency string (USD). */
function fmtCents(cents: number): string {
  const dollars = cents / 100;
  if (!Number.isFinite(dollars)) return '$0.00';
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: dollars >= 10 ? 2 : 3,
  });
}

/** Format an int count like 12,345 or 1.2M for larger values. */
function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '') + 'M';
}

/**
 * Live ops view — what Hermes is doing right this second, plus a cost
 * dashboard at the bottom.
 * Polls /jobs + /approvals every 3s; /usage every 12s (cheaper, moves slower).
 */
export function ActivityPane() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [paused, setPaused] = useState(false);

  async function loadLive() {
    const [j, a] = await Promise.all([
      call<{ jobs: Job[] }>({ method: 'GET', path: '/jobs' }),
      call<{ approvals: Approval[] }>({ method: 'GET', path: '/approvals' }),
    ]);
    if (j.ok && j.data) setJobs(j.data.jobs);
    if (a.ok && a.data) setApprovals(a.data.approvals);
  }

  async function loadUsage() {
    const r = await call<UsagePayload>({ method: 'GET', path: '/usage' });
    if (r.ok && r.data) setUsage(r.data);
  }

  useEffect(() => {
    void loadLive();
    void loadUsage();
    const liveInterval = window.setInterval(loadLive, 3000);
    const usageInterval = window.setInterval(loadUsage, 12_000);
    return () => {
      window.clearInterval(liveInterval);
      window.clearInterval(usageInterval);
    };
  }, []);

  async function pauseAll() {
    await call({ method: 'POST', path: '/agents/pause' });
    setPaused(true);
    setTimeout(() => setPaused(false), 4000);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Activity"
          stamp="sheet 08 · live telemetry"
          title="What Hermes is doing right now"
          description={'Running jobs, pending approvals, and cost \u2014 refreshed every 3s.'}
        />
        <Button
          variant={paused ? 'secondary' : 'destructive'}
          size="sm"
          leading={<Pause className="h-3 w-3" />}
          onClick={pauseAll}
        >
          {paused ? 'Paused' : 'Pause all agents'}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h2 className="font-mono mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
                <Activity className="h-3 w-3" />
                Running jobs · {jobs.length}
              </h2>
              {jobs.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Quiet"
                  description="No jobs in flight."
                />
              ) : (
                <div className="stagger space-y-2">
                  {jobs.map((j, i) => (
                    <Card
                      key={j.id}
                      className="p-4"
                      style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Dot tone="primary" pulse />
                            <span className="truncate text-sm">{j.title}</span>
                          </div>
                          <div className="font-mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                            {j.kind} · started {relTime(j.started_at * 1000)}
                            {j.eta_sec && j.eta_sec > 0 ? ` · eta ${j.eta_sec}s` : ''}
                          </div>
                          {typeof j.progress === 'number' && (
                            <div className="mt-3">
                              <ProgressBar value={j.progress} />
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-mono mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
                <ShieldCheck className="h-3 w-3" />
                Approvals · {approvals.length}
              </h2>
              {approvals.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="All clear"
                  description="No actions waiting on you."
                />
              ) : (
                <div className="stagger space-y-2">
                  {approvals.map((a, i) => (
                    <Card
                      key={a.id}
                      style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                      className={cn(
                        'border-l-4 p-4',
                        a.risk === 'high'
                          ? 'border-l-[var(--bad)]'
                          : a.risk === 'medium'
                            ? 'border-l-[var(--warn)]'
                            : 'border-l-[var(--ok)]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={a.risk === 'high' ? 'bad' : a.risk === 'medium' ? 'warn' : 'ok'}>
                          {a.risk}
                        </Badge>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                          {a.tool}
                        </span>
                      </div>
                      <div className="mt-2 text-sm">{a.title}</div>
                      <div className="mt-1 text-[12.5px] italic text-[var(--fg-muted)]">{a.reason}</div>
                      {a.preview && (
                        <pre className="font-mono mt-2 max-h-32 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[11px]">
                          {a.preview}
                        </pre>
                      )}
                      <div className="mt-3 flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost">
                          Deny
                        </Button>
                        <Button size="sm" variant="signal">
                          Approve
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>

          <CostDashboard usage={usage} onRefresh={() => void loadUsage()} />
        </div>
      </div>
    </div>
  );
}

/**
 * Bottom-of-activity dashboard showing total tokens, estimated cost, and the
 * top-spending sessions. The estimate is best-effort; the label makes that
 * clear. Numbers come from ``/usage`` which the sidecar accumulates on every
 * streamed turn.
 */
function CostDashboard({
  usage,
  onRefresh,
}: {
  usage: UsagePayload | null;
  onRefresh: () => void;
}) {
  // When totalTokens isn't tracked yet we derive it from input+output so the
  // UI still shows something meaningful.
  const summary = useMemo(() => {
    if (!usage) return null;
    const t = usage.totals;
    const derivedTotal = t.total_tokens || t.input_tokens + t.output_tokens;
    return { ...t, total_tokens: derivedTotal };
  }, [usage]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
          <Coins className="h-3 w-3" />
          Cost &amp; tokens
          {usage && (
            <span className="normal-case tracking-normal text-[var(--fg-ghost)]">
              · updated {relTime(usage.generated_at * 1000)}
            </span>
          )}
        </h2>
        <button
          onClick={onRefresh}
          className="font-mono flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <RefreshCcw className="h-3 w-3" />
          refresh
        </button>
      </div>

      {!usage || !summary ? (
        <EmptyState
          icon={<Coins className="h-4 w-4" />}
          title="No usage yet"
          description="Start a conversation to begin tracking tokens."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Est. cost"
              value={fmtCents(summary.estimated_cost_cents)}
              hint={`${summary.turns} turn${summary.turns === 1 ? '' : 's'}`}
              icon={<Coins className="h-3 w-3" />}
            />
            <Stat
              label="Total tokens"
              value={fmtCount(summary.total_tokens)}
              hint="in + out + cached"
              icon={<TrendingUp className="h-3 w-3" />}
            />
            <Stat
              label="Input"
              value={fmtCount(summary.input_tokens)}
              hint={
                summary.cached_read_tokens > 0
                  ? `${fmtCount(summary.cached_read_tokens)} cached`
                  : 'no cache hits yet'
              }
            />
            <Stat
              label="Output"
              value={fmtCount(summary.output_tokens)}
              hint={
                summary.thought_tokens > 0
                  ? `${fmtCount(summary.thought_tokens)} thought`
                  : 'reply only'
              }
            />
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--fg-ghost)]">
            <Cpu className="h-3 w-3" />
            <span>
              Active model: <span className="font-mono">{usage.active_model || '—'}</span>
            </span>
            <span className="opacity-60">·</span>
            <span className="italic">{usage.pricing_note}</span>
          </div>

          {usage.sessions.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
              <div className="border-b border-[var(--line)] bg-[var(--surface-2)]/60 px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
                  Top sessions by usage
                </span>
              </div>
              <div className="divide-y divide-[var(--line)]/60">
                {usage.sessions.map((row) => {
                  const pct =
                    summary.total_tokens > 0
                      ? Math.round((row.total_tokens / summary.total_tokens) * 100)
                      : 0;
                  return (
                    <div key={row.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-3 py-2.5 text-[12.5px]">
                      <div className="min-w-0">
                        <div className="truncate text-[var(--fg)]">{row.title}</div>
                        <div className="font-mono mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                          <span>{row.model || 'unknown model'}</span>
                          <span className="opacity-60">·</span>
                          <span>{relTime(row.updated_at * 1000)}</span>
                        </div>
                      </div>
                      <div className="font-mono text-right text-[11px] text-[var(--fg-muted)]">
                        {fmtCount(row.total_tokens)}
                        <span className="ml-2 inline-block w-8 text-right text-[10px] text-[var(--fg-ghost)]">
                          {pct}%
                        </span>
                      </div>
                      <div className="font-mono w-[72px] text-right text-[12px] text-[var(--fg)]">
                        {fmtCents(row.cost_cents)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="font-mono flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold text-[var(--fg)]">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[var(--fg-muted)]">{hint}</div>}
    </Card>
  );
}
