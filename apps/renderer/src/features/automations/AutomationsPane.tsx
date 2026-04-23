import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  CalendarClock,
  Plus,
  Play,
  Trash2,
  Pause,
  History,
  Pencil,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { SectionHeading, Badge, EmptyState } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { relTime } from '../../lib/time';
import { cn } from '../../lib/cn';

type HistoryEntry = { ts: number; status: string; message: string };

type Task = {
  id: string;
  name: string;
  nl: string;
  cron: string;
  enabled: boolean;
  delivery: string;
  last_run: number | null;
  next_run: number | null;
  history: HistoryEntry[];
};

type Template = {
  id: string;
  name: string;
  nl: string;
  cron: string;
  delivery: string;
  description: string;
};

type TaskFilter = 'all' | 'running' | 'paused';
type TaskSort = 'next' | 'name' | 'last';

const FILTER_LABELS: Record<TaskFilter, string> = {
  all: 'All',
  running: 'Running',
  paused: 'Paused',
};
const SORT_LABELS: Record<TaskSort, string> = {
  next: 'Next run',
  name: 'Name A–Z',
  last: 'Recently ran',
};

const DELIVERIES = ['home', 'notification', 'email', 'telegram'] as const;

export function AutomationsPane() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<null | { mode: 'create' } | { mode: 'edit'; task: Task }>(null);
  const [inspecting, setInspecting] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sort, setSort] = useState<TaskSort>('next');
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

  const running = tasks.filter((t) => t.enabled).length;
  const paused = tasks.length - running;

  // Filter + sort derived list — cheap enough that useMemo is overkill but it
  // keeps re-renders stable when only polling state changes.
  const visible = useMemo(() => {
    const list = tasks.filter((t) => {
      if (filter === 'running') return t.enabled;
      if (filter === 'paused') return !t.enabled;
      return true;
    });
    return list.slice().sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'last': {
          const al = a.last_run ?? 0;
          const bl = b.last_run ?? 0;
          return bl - al;
        }
        case 'next':
        default: {
          // Paused tasks sink to the bottom; running sorted by next_run asc.
          if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
          const an = a.next_run ?? Number.MAX_SAFE_INTEGER;
          const bn = b.next_run ?? Number.MAX_SAFE_INTEGER;
          return an - bn;
        }
      }
    });
  }, [tasks, filter, sort]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Automations"
          stamp="sheet 05 · scheduled tasks"
          title="Work that runs on a rhythm"
          description="Describe it in plain English. Hermes turns it into a cron, delivery, and run history."
        />
        <Button
          variant="primary"
          leading={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setDialog({ mode: 'create' })}
        >
          New automation
        </Button>
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-2)]/40 px-8 py-2.5">
          <div className="flex items-center gap-1.5">
            {(Object.keys(FILTER_LABELS) as TaskFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.14em] transition-colors',
                  filter === f
                    ? 'border-[var(--primary)] bg-[var(--primary-wash)] text-[var(--primary)]'
                    : 'border-[var(--line)] bg-transparent text-[var(--fg-muted)] hover:border-[var(--line-strong)] hover:text-[var(--fg)]',
                )}
              >
                {FILTER_LABELS[f]}
                {f === 'running' && ` · ${running}`}
                {f === 'paused' && ` · ${paused}`}
                {f === 'all' && ` · ${tasks.length}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
              Sort
            </span>
            {(Object.keys(SORT_LABELS) as TaskSort[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] transition-colors',
                  sort === s
                    ? 'border-[var(--primary)] bg-[var(--primary-wash)] text-[var(--primary)]'
                    : 'border-[var(--line)] bg-transparent text-[var(--fg-muted)] hover:border-[var(--line-strong)] hover:text-[var(--fg)]',
                )}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {loading && tasks.length === 0 ? (
          <EmptyState loading title="Loading" description="" />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="Nothing scheduled"
            description="Morning briefs, weekly reviews, overnight summaries — anything repeatable."
            action={
              <Button variant="primary" onClick={() => setDialog({ mode: 'create' })}>
                Create one
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="No tasks match this filter"
            description="Switch to All to see everything, or create a new one."
          />
        ) : (
          <div className="stagger mx-auto max-w-4xl space-y-2">
            {visible.map((t, i) => (
              <TaskCard
                key={t.id}
                task={t}
                index={i}
                onEdit={() => setDialog({ mode: 'edit', task: t })}
                onHistory={() => setInspecting(t)}
                onToggle={() => toggle(t.id)}
                onRun={() => run(t.id)}
                onRemove={() => remove(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {dialog?.mode === 'create' && (
        <TaskDialog
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await load();
          }}
        />
      )}
      {dialog?.mode === 'edit' && (
        <TaskDialog
          task={dialog.task}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await load();
          }}
        />
      )}
      {inspecting && (
        <Dialog
          open
          onClose={() => setInspecting(null)}
          title={inspecting.name}
          description={`Run history · ${inspecting.history.length} ${
            inspecting.history.length === 1 ? 'entry' : 'entries'
          }`}
        >
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {inspecting.history.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--fg-muted)]">No runs yet.</div>
            ) : (
              inspecting.history.map((h, i) => <HistoryRow key={i} entry={h} />)
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ───────────── Task card

function TaskCard({
  task,
  index,
  onEdit,
  onHistory,
  onToggle,
  onRun,
  onRemove,
}: {
  task: Task;
  index: number;
  onEdit: () => void;
  onHistory: () => void;
  onToggle: () => void;
  onRun: () => void;
  onRemove: () => void;
}) {
  const cronHuman = cronToHuman(task.cron);
  const style = { '--i': Math.min(index, 12) } as CSSProperties;
  return (
    <Card className="p-5" style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl">{task.name}</h3>
            <Badge tone={task.enabled ? 'ok' : 'neutral'}>
              {task.enabled ? 'running' : 'paused'}
            </Badge>
            <Badge tone="primary">
              <span className="font-mono">{task.cron}</span>
            </Badge>
            {cronHuman && (
              <span className="text-[12px] text-[var(--fg-muted)]">· {cronHuman}</span>
            )}
          </div>
          <p className="mt-1.5 text-[13.5px] italic text-[var(--fg-muted)]">"{task.nl}"</p>
          <div className="font-mono mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
            <span>delivery · {task.delivery}</span>
            <span>·</span>
            <span>last · {task.last_run ? relTime(task.last_run * 1000) : 'never'}</span>
            <span>·</span>
            <span>next · {task.enabled && task.next_run ? relTime(task.next_run * 1000) : 'paused'}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            leading={<History className="h-3 w-3" />}
            onClick={onHistory}
          >
            History
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leading={<Pencil className="h-3 w-3" />}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leading={task.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            onClick={onToggle}
          >
            {task.enabled ? 'Pause' : 'Resume'}
          </Button>
          <Button
            size="sm"
            variant="signal"
            leading={<Play className="h-3 w-3" />}
            onClick={onRun}
          >
            Run now
          </Button>
          <button
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-dim)] hover:bg-[var(--bad-wash)] hover:text-[var(--bad)]"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const tone = historyTone(entry.status);
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px]">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0">
          {tone === 'ok' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" />
          ) : tone === 'warn' ? (
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warn)]" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-[var(--bad)]" />
          )}
        </span>
        <div className="min-w-0">
          <div className="font-mono uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            {entry.status}
          </div>
          <div className="text-[var(--fg)]">{entry.message}</div>
        </div>
      </div>
      <div className="font-mono shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
        {relTime(entry.ts * 1000)}
      </div>
    </div>
  );
}

// ───────────── Create / edit dialog

function TaskDialog({
  task,
  onClose,
  onSaved,
}: {
  task?: Task;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = !!task;
  const [name, setName] = useState(task?.name ?? '');
  const [nl, setNl] = useState(task?.nl ?? '');
  const [cron, setCron] = useState(task?.cron ?? '');
  const [delivery, setDelivery] = useState<string>(task?.delivery ?? 'home');
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [cronOverridden, setCronOverridden] = useState(editing);
  const push = useToast((s) => s.push);

  useEffect(() => {
    if (editing) return;
    void (async () => {
      const r = await call<{ templates: Template[] }>({
        method: 'GET',
        path: '/scheduler/templates',
      });
      if (r.ok && r.data) setTemplates(r.data.templates);
    })();
  }, [editing]);

  function applyTemplate(t: Template) {
    setName(t.name);
    setNl(t.nl);
    setCron(t.cron);
    setDelivery(t.delivery);
    setCronOverridden(true);
  }

  // Human-readable preview updates live from either the explicit cron or a
  // best-effort guess from the NL phrase.
  const previewCron = cronOverridden && cron ? cron : guessCron(nl);
  const previewHuman = cronToHuman(previewCron);

  async function save() {
    setSaving(true);
    if (editing && task) {
      const body: Record<string, unknown> = {
        name,
        nl,
        delivery,
      };
      // Only send cron if the user touched it in this session — otherwise let
      // the backend re-derive from nl.
      if (cronOverridden) body.cron = cron;
      const r = await call({ method: 'PATCH', path: `/scheduler/${task.id}`, body });
      setSaving(false);
      if (!r.ok) {
        push({ kind: 'error', title: 'Could not update' });
        return;
      }
      push({ kind: 'success', title: 'Updated' });
    } else {
      const body: Record<string, unknown> = { name, nl, delivery };
      if (cronOverridden && cron) body.cron = cron;
      const r = await call({ method: 'POST', path: '/scheduler', body });
      setSaving(false);
      if (!r.ok) {
        push({ kind: 'error', title: 'Could not schedule' });
        return;
      }
      push({ kind: 'success', title: 'Scheduled' });
    }
    await onSaved();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Edit automation' : 'Schedule something'}
      description={
        editing
          ? 'Tweak the description, schedule, or delivery. The cron updates with the phrase.'
          : 'Plain English works. Hermes picks the cron.'
      }
    >
      <div className="space-y-4">
        {!editing && templates.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
              <Sparkles className="h-3 w-3" />
              Start from a template
            </div>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="group rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-wash)] hover:text-[var(--primary)]"
                  title={t.description}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Morning brief"
            autoFocus={!editing}
          />
        </Field>
        <Field label="When" hint="e.g. every weekday at 8am">
          <Input
            value={nl}
            onChange={(e) => {
              setNl(e.target.value);
              if (!cronOverridden) setCron('');
            }}
            placeholder="every weekday at 8am, brief me"
          />
        </Field>
        <Field
          label="Cron"
          hint={
            cronOverridden ? (
              <button
                type="button"
                onClick={() => {
                  setCron('');
                  setCronOverridden(false);
                }}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--primary)] hover:underline"
              >
                reset to NL
              </button>
            ) : (
              'auto from phrase'
            )
          }
        >
          <Input
            value={cronOverridden ? cron : previewCron}
            onChange={(e) => {
              setCron(e.target.value);
              setCronOverridden(true);
            }}
            placeholder="0 8 * * 1-5"
            className="font-mono"
          />
          {previewHuman && (
            <p className="mt-1.5 text-[11.5px] text-[var(--fg-muted)]">
              <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                runs
              </span>{' '}
              {previewHuman}
            </p>
          )}
        </Field>
        <Field label="Delivery">
          <div className="grid grid-cols-4 gap-2">
            {DELIVERIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDelivery(d)}
                className={cn(
                  'rounded-[var(--radius-sm)] border px-3 py-2 text-sm transition-colors',
                  delivery === d
                    ? 'border-[var(--primary)] bg-[var(--primary-wash)] text-[var(--primary)]'
                    : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg-muted)] hover:border-[var(--line-strong)]',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={save}
          disabled={!name.trim() || !nl.trim()}
        >
          {editing ? 'Save changes' : 'Schedule'}
        </Button>
      </div>
    </Dialog>
  );
}

// ───────────── Cron helpers (mirror the backend heuristic so the preview is
// sane even before anything is saved).

function guessCron(nl: string): string {
  const text = nl.toLowerCase();
  const hourMatch = text.match(/(\d{1,2})\s*(?:am|pm)?/);
  let hour = hourMatch ? parseInt(hourMatch[1] ?? '9', 10) : 9;
  if (/pm\b/.test(text) && hour < 12) hour += 12;
  if (/weekday|mon-fri/.test(text)) return `0 ${hour} * * 1-5`;
  if (/sunday/.test(text)) return `0 ${hour} * * 0`;
  if (/monday/.test(text)) return `0 ${hour} * * 1`;
  if (/saturday/.test(text)) return `0 ${hour} * * 6`;
  if (/friday/.test(text)) return `0 ${hour} * * 5`;
  if (/hour/.test(text)) return '0 * * * *';
  if (/minute/.test(text)) return '* * * * *';
  return `0 ${hour} * * *`;
}

// Small-surface cron renderer. Handles the exact shapes _guess_cron emits plus
// a few common extras (*/n, specific days). Falls back to an empty string for
// anything we don't grok, which makes the UI cleanly hide the preview instead
// of showing something misleading.
function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return '';
  const [minute, hour, dom, month, dow] = parts;

  if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return 'every minute';
  if (minute === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return 'at the top of every hour';

  const everyNMin = minute.match(/^\*\/(\d+)$/);
  if (everyNMin && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `every ${everyNMin[1]} minutes`;

  const everyNHour = hour.match(/^\*\/(\d+)$/);
  if (everyNHour && minute === '0' && dom === '*' && month === '*' && dow === '*')
    return `every ${everyNHour[1]} hours`;

  // Time-of-day prefix for the more structured forms.
  if (!/^\d+$/.test(hour) || !/^\d+$/.test(minute)) return '';
  const timeStr = fmtTime(parseInt(hour, 10), parseInt(minute, 10));

  if (dom === '*' && month === '*' && dow === '*') return `every day at ${timeStr}`;
  if (dom === '*' && month === '*' && dow === '1-5') return `every weekday at ${timeStr}`;
  if (dom === '*' && month === '*' && dow === '0,6') return `every weekend at ${timeStr}`;

  // Specific day names for single-day cronsa.
  const dayNames: Record<string, string> = {
    '0': 'Sunday',
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
  };
  if (dom === '*' && month === '*' && dow in dayNames)
    return `every ${dayNames[dow]} at ${timeStr}`;

  return '';
}

function fmtTime(hour: number, minute: number): string {
  if (hour < 0 || hour > 23) return '';
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  if (minute === 0) return `${h12}${suffix}`;
  return `${h12}:${minute.toString().padStart(2, '0')}${suffix}`;
}

function historyTone(status: string): 'ok' | 'warn' | 'bad' {
  const s = status.toLowerCase();
  if (s === 'ok' || s === 'success' || s === 'done') return 'ok';
  if (s === 'warn' || s === 'warning' || s === 'partial') return 'warn';
  return 'bad';
}
