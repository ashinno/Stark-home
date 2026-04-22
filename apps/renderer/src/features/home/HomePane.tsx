import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  Activity,
  Clock3,
  Sparkles,
  Pause,
  MessagesSquare,
  Maximize2,
  Minimize2,
  Wrench,
  CalendarClock,
  Library,
  Radio,
  Settings as Cog,
} from 'lucide-react';
import { useSession, type Route } from '../../stores/session';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, Dot, EmptyState, SectionHeading, ProgressBar } from '../../components/ui/Atoms';
import { Kbd } from '../../components/ui/Atoms';
import { call } from '../../lib/rpc';
import { relTime } from '../../lib/time';
import type { Approval, Job, Suggestion, Thread } from '@shared/rpc';
import { cn } from '../../lib/cn';
import { StarkHouse } from '../../components/StarkHouse';
import { HomeDock } from './HomeDock';

const HOME_MODE_KEY = 'stark.home_mode';

export function HomePane() {
  const userName = useSession((s) => s.userName);
  const appendMessage = useSession((s) => s.appendMessage);
  const resetThread = useSession((s) => s.resetThread);
  const setRoute = useSession((s) => s.setRoute);
  const [draft, setDraft] = useState('');
  const [homeMode, setHomeMode] = useState<boolean>(() => {
    return localStorage.getItem(HOME_MODE_KEY) === '1';
  });
  const toggleHomeMode = () => {
    setHomeMode((v) => {
      const next = !v;
      localStorage.setItem(HOME_MODE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const [threads, setThreads] = useState<Thread[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  async function load() {
    const [t, a, j, s] = await Promise.all([
      call<{ threads: Thread[] }>({ method: 'GET', path: '/threads' }),
      call<{ approvals: Approval[] }>({ method: 'GET', path: '/approvals' }),
      call<{ jobs: Job[] }>({ method: 'GET', path: '/jobs' }),
      call<{ suggestions: Suggestion[] }>({ method: 'GET', path: '/suggestions' }),
    ]);
    if (t.ok && t.data) setThreads(t.data.threads);
    if (a.ok && a.data) setApprovals(a.data.approvals);
    if (j.ok && j.data) setJobs(j.data.jobs);
    if (s.ok && s.data) setSuggestions(s.data.suggestions);
  }

  useEffect(() => {
    void load();
    const i = window.setInterval(load, 6000);
    return () => window.clearInterval(i);
  }, []);

  const send = (text: string) => {
    if (!text.trim()) return;
    resetThread();
    appendMessage({ id: `u${Date.now()}`, role: 'user', content: text, createdAt: Date.now() });
    setRoute('threads');
  };

  if (homeMode) {
    return (
      <div className="relative h-full">
        <StarkHouse fullscreen />
        {/* Mode toggle pill — sits above the house in the top-right */}
        <button
          onClick={toggleHomeMode}
          className="font-mono absolute right-4 top-4 z-30 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border-2 border-[#1C2340] bg-[#F4EEDF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1C2340] shadow-[4px_4px_0_#1C2340] transition-transform hover:translate-x-[-1px] hover:translate-y-[-1px]"
          title="Switch back to compact view"
        >
          <Minimize2 className="h-3 w-3" /> Exit home mode
        </button>
        {/* Floating chat dock */}
        <HomeDock />
      </div>
    );
  }

  return (
    <div className="stark-bg flex h-full flex-col">
      {/* Stark's House */}
      <section className="px-8 pt-6">
        <div className="mx-auto max-w-6xl">
          <div className="relative">
            <StarkHouse className="h-[440px] rounded-[var(--radius-xl)] border-2 border-[#1C2340] shadow-[6px_6px_0_#1C2340]" />
            <button
              onClick={toggleHomeMode}
              className="font-mono absolute right-4 top-4 z-30 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border-2 border-[#1C2340] bg-[#F4EEDF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1C2340] shadow-[3px_3px_0_#1C2340] transition-transform hover:translate-x-[-1px] hover:translate-y-[-1px]"
              title="Open Home Mode \u2014 fullscreen house with floating chat"
            >
              <Maximize2 className="h-3 w-3" /> Home mode
            </button>
          </div>
        </div>
      </section>

      {/* Hero prompt */}
      <section className="relative px-8 pb-6 pt-6">
        <div className="mx-auto max-w-4xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--primary)]">
            Control center
          </div>
          <h1 className="font-display mt-2 text-[44px] leading-[1.04] tracking-tight">
            {userName ? `Hello, ${userName}.` : 'Hello.'}{' '}
            <span className="italic text-[var(--fg-muted)]">What should Hermes do?</span>
          </h1>

          <div
            className={cn(
              'mt-5 flex items-end gap-2 rounded-[var(--radius-lg)] border bg-[var(--surface)] p-3 transition-colors',
              draft
                ? 'border-[var(--primary)] shadow-[var(--shadow-md)]'
                : 'border-[var(--line)] shadow-[var(--shadow-sm)]',
            )}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                  setDraft('');
                }
              }}
              placeholder="Ask, plan, automate…"
              rows={2}
              className="min-h-[52px] flex-1 resize-none bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-[var(--fg-ghost)]"
            />
            <Button
              variant="primary"
              size="md"
              disabled={!draft.trim()}
              trailing={<ArrowRight className="h-4 w-4" />}
              onClick={() => {
                send(draft);
                setDraft('');
              }}
            >
              Send
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--fg-ghost)]">
            <div className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> send <span className="opacity-60">·</span>
              <Kbd>⇧↵</Kbd> newline <span className="opacity-60">·</span>
              <Kbd>⌘⇧␣</Kbd> command palette
            </div>
          </div>
        </div>
      </section>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-6xl">
          <FeatureDock onGo={(r) => setRoute(r)} />
          <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Approvals data={approvals} onReview={() => setRoute('threads')} />
            <RunningJobs data={jobs} />
            <Recents data={threads} onOpen={() => setRoute('threads')} />
            <Suggestions data={suggestions} onRun={send} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── section cards (unchanged from prior version)

function CardShell({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[var(--fg-dim)]">{icon}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
            {title}
          </span>
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

function Approvals({ data, onReview }: { data: Approval[]; onReview: () => void }) {
  return (
    <CardShell
      title="Pending approvals"
      icon={<ShieldCheck className="h-3.5 w-3.5" />}
      action={data.length > 0 && <Badge tone="signal">{data.length}</Badge>}
    >
      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[var(--fg-muted)]">
          Clear. Nothing waiting on you.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {data.slice(0, 4).map((a) => (
            <li key={a.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--fg)]">{a.title}</div>
                  <div className="mt-0.5 truncate text-[12px] italic text-[var(--fg-muted)]">{a.reason}</div>
                  <div className="font-mono mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                    <Dot tone={a.risk === 'high' ? 'bad' : a.risk === 'medium' ? 'warn' : 'ok'} />
                    {a.risk} · {a.tool} · {relTime(a.created_at * 1000)}
                  </div>
                </div>
                <Button size="sm" variant="signal" onClick={onReview}>
                  Review
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function RunningJobs({ data }: { data: Job[] }) {
  return (
    <CardShell
      title="Running jobs"
      icon={<Activity className="h-3.5 w-3.5" />}
      action={data.length > 0 ? <Badge tone="primary">{data.length}</Badge> : null}
    >
      {data.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[var(--fg-muted)]">
          Quiet. No jobs in flight.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {data.slice(0, 4).map((j) => (
            <li key={j.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{j.title}</div>
                  <div className="font-mono mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                    {j.kind} · started {relTime(j.started_at * 1000)}
                  </div>
                  {typeof j.progress === 'number' && (
                    <div className="mt-2">
                      <ProgressBar value={j.progress} />
                    </div>
                  )}
                </div>
                <button className="text-[var(--fg-dim)] hover:text-[var(--fg)]">
                  <Pause className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function Recents({ data, onOpen }: { data: Thread[]; onOpen: () => void }) {
  return (
    <CardShell
      title="Recent threads"
      icon={<MessagesSquare className="h-3.5 w-3.5" />}
      action={
        <button onClick={onOpen} className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)] hover:text-[var(--fg)]">
          view all
        </button>
      }
    >
      {data.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-4 w-4" />}
          title="No sessions yet"
          description="Start one from the prompt above."
        />
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {data.slice(0, 5).map((t) => (
            <li key={t.id}>
              <button
                onClick={onOpen}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="truncate text-[12px] text-[var(--fg-muted)]">{t.preview}</div>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                  {relTime(t.updated_at * 1000)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

type DockItem = {
  id: Route;
  label: string;
  icon: typeof MessagesSquare;
  blurb: string;
  hotkey: string;
};

const DOCK_ITEMS: DockItem[] = [
  { id: 'threads', label: 'Threads', icon: MessagesSquare, blurb: 'Chat with Hermes', hotkey: '2' },
  { id: 'tools', label: 'Tools', icon: Wrench, blurb: 'Toggle capabilities', hotkey: '3' },
  { id: 'skills', label: 'Skills', icon: Sparkles, blurb: 'Hub + marketplace', hotkey: '4' },
  { id: 'automations', label: 'Automations', icon: CalendarClock, blurb: 'Schedules & jobs', hotkey: '5' },
  { id: 'memory', label: 'Memory', icon: Library, blurb: 'Notes & sessions', hotkey: '6' },
  { id: 'gateways', label: 'Gateways', icon: Radio, blurb: 'Slack, Telegram, email', hotkey: '7' },
  { id: 'activity', label: 'Activity', icon: Activity, blurb: 'Live timeline', hotkey: '8' },
  { id: 'settings', label: 'Settings', icon: Cog, blurb: 'Doctor, providers, MCP', hotkey: ',' },
];

function FeatureDock({ onGo }: { onGo: (r: Route) => void }) {
  return (
    <div>
      <SectionHeading
        eyebrow="Hermes at a glance"
        title="Every power, one click away"
        description="Jump to any subsystem Hermes can run for you."
      />
      <div className="stagger mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {DOCK_ITEMS.map(({ id, label, icon: Icon, blurb, hotkey }) => (
          <button
            key={id}
            onClick={() => onGo(id)}
            className="group flex flex-col items-start gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/50 hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-md)]"
            title={`${label} · ⌘${hotkey}`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--primary-wash)] text-[var(--primary)] transition-colors group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-ink)]">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-[var(--fg)]">{label}</span>
                <Kbd>⌘{hotkey}</Kbd>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[var(--fg-muted)]">{blurb}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Suggestions({ data, onRun }: { data: Suggestion[]; onRun: (prompt: string) => void }) {
  if (data.length === 0) return null;
  return (
    <div className="xl:col-span-3">
      <SectionHeading
        eyebrow="Suggested"
        title="Quick wins for today"
        description="Hand-picked based on your setup. Kick any of them off in one click."
      />
      <div className="stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.slice(0, 4).map((s) => (
          <Card key={s.id} interactive className="p-4" onClick={() => onRun(s.prompt)}>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--primary-wash)] text-[var(--primary)]">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.title}</div>
                <div className="mt-1 text-[12px] text-[var(--fg-muted)]">{s.description}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
