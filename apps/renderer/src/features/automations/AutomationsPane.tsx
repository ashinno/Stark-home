import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Play, Trash2, Pause, History } from 'lucide-react';
import { SectionHeading, Badge, EmptyState } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { relTime } from '../../lib/time';

type Task = {
  id: string;
  name: string;
  nl: string;
  cron: string;
  enabled: boolean;
  delivery: string;
  last_run: number | null;
  next_run: number | null;
  history: { ts: number; status: string; message: string }[];
};

export function AutomationsPane() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inspecting, setInspecting] = useState<Task | null>(null);
  const push = useToast((s) => s.push);

  const load = async () => {
    const r = await call<{ tasks: Task[] }>({ method: 'GET', path: '/scheduler' });
    if (r.ok && r.data) setTasks(r.data.tasks);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  async function toggle(id: string) {
    await call({ method: 'POST', path: `/scheduler/${id}/toggle` });
    await load();
  }
  async function run(id: string) {
    await call({ method: 'POST', path: `/scheduler/${id}/run-now` });
    push({ kind: 'success', title: 'Queued' });
    await load();
  }
  async function remove(id: string) {
    await call({ method: 'DELETE', path: `/scheduler/${id}` });
    await load();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Automations"
          title="Work that runs on a rhythm"
          description="Describe it in plain English. Hermes turns it into a cron, delivery, and run history."
        />
        <Button variant="primary" leading={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
          New automation
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {loading && tasks.length === 0 ? (
          <EmptyState loading title="Loading" description="" />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="Nothing scheduled"
            description="Morning briefs, weekly reviews, overnight summaries — anything repeatable."
            action={<Button variant="primary" onClick={() => setCreating(true)}>Create one</Button>}
          />
        ) : (
          <div className="stagger mx-auto max-w-4xl space-y-2">
            {tasks.map((t, i) => (
              <Card key={t.id} className="p-5" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl">{t.name}</h3>
                      <Badge tone={t.enabled ? 'ok' : 'neutral'}>
                        {t.enabled ? 'running' : 'paused'}
                      </Badge>
                      <Badge tone="primary">
                        <span className="font-mono">{t.cron}</span>
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[13.5px] italic text-[var(--fg-muted)]">"{t.nl}"</p>
                    <div className="font-mono mt-3 flex gap-3 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
                      <span>delivery · {t.delivery}</span>
                      <span>·</span>
                      <span>last · {t.last_run ? relTime(t.last_run * 1000) : 'never'}</span>
                      <span>·</span>
                      <span>next · {t.next_run ? relTime(t.next_run * 1000) : 'paused'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" leading={<History className="h-3 w-3" />} onClick={() => setInspecting(t)}>
                      History
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leading={t.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      onClick={() => toggle(t.id)}
                    >
                      {t.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="signal" leading={<Play className="h-3 w-3" />} onClick={() => run(t.id)}>
                      Run now
                    </Button>
                    <button
                      onClick={() => remove(t.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-dim)] hover:bg-[var(--bad-wash)] hover:text-[var(--bad)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {creating && <CreateTaskDialog onClose={() => setCreating(false)} onCreated={load} />}
      {inspecting && (
        <Dialog open onClose={() => setInspecting(null)} title={inspecting.name} description="Run history">
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {inspecting.history.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--fg-muted)]">
                No runs yet.
              </div>
            ) : (
              inspecting.history.map((h, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px]">
                  <div>
                    <div className="font-mono uppercase tracking-[0.14em] text-[var(--fg-muted)]">{h.status}</div>
                    <div className="text-[var(--fg)]">{h.message}</div>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                    {relTime(h.ts * 1000)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function CreateTaskDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [nl, setNl] = useState('');
  const [delivery, setDelivery] = useState('home');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    await call({ method: 'POST', path: '/scheduler', body: { name, nl, delivery } });
    setSaving(false);
    await onCreated();
    onClose();
  }
  return (
    <Dialog open onClose={onClose} title="Schedule something" description="Plain English works. Hermes picks the cron.">
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning brief" autoFocus />
        </Field>
        <Field label="When" hint="e.g. every weekday at 8am">
          <Input value={nl} onChange={(e) => setNl(e.target.value)} placeholder="every weekday at 8am, brief me" />
        </Field>
        <Field label="Delivery">
          <div className="grid grid-cols-4 gap-2">
            {['home', 'notification', 'email', 'telegram'].map((d) => (
              <button
                key={d}
                onClick={() => setDelivery(d)}
                className={`rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                  delivery === d
                    ? 'border-[var(--primary)] bg-[var(--primary-wash)]'
                    : 'border-[var(--line)] bg-[var(--surface-2)]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save} disabled={!name.trim() || !nl.trim()}>
          Schedule
        </Button>
      </div>
    </Dialog>
  );
}
