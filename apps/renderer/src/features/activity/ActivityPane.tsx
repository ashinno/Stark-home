import { useEffect, useState } from 'react';
import { Activity, Pause, ShieldCheck, Sparkles } from 'lucide-react';
import { SectionHeading, Badge, Dot, EmptyState, ProgressBar } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { call } from '../../lib/rpc';
import type { Approval, Job } from '@shared/rpc';
import { relTime } from '../../lib/time';
import { cn } from '../../lib/cn';

/**
 * Live ops view — what Stark is doing right this second.
 * Polls /jobs and /approvals every 3 seconds. Renders a single timeline so
 * the user can see in-flight work and pending approvals together.
 */
export function ActivityPane() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [paused, setPaused] = useState(false);

  async function load() {
    const [j, a] = await Promise.all([
      call<{ jobs: Job[] }>({ method: 'GET', path: '/jobs' }),
      call<{ approvals: Approval[] }>({ method: 'GET', path: '/approvals' }),
    ]);
    if (j.ok && j.data) setJobs(j.data.jobs);
    if (a.ok && a.data) setApprovals(a.data.approvals);
  }
  useEffect(() => {
    void load();
    const i = window.setInterval(load, 3000);
    return () => window.clearInterval(i);
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
          title="What Stark is doing right now"
          description="Running jobs, pending approvals, and recent action cards — refreshed every 3s."
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
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
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
                  <Card key={j.id} className="p-4" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
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
                      <Button size="sm" variant="ghost">Deny</Button>
                      <Button size="sm" variant="signal">Approve</Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
