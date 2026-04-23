import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, Eye, Github, Plus, Play, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { SectionHeading, Badge, EmptyState } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { TabStrip, type Tab as TabDef } from '../../components/ui/TabStrip';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { relTime } from '../../lib/time';
import type { SidecarResponse } from '@shared/rpc';

type Skill = {
  id: string;
  identifier?: string;
  name: string;
  description?: string;
  category?: string;
  trigger: string;
  steps: string[];
  enabled: boolean;
  installed?: boolean;
  runs: number;
  last_run: number | null;
  source: string;
  trust?: string;
};

type MarketplaceResponse = {
  skills: Skill[];
  page: number;
  pages: number;
  total: number;
};

type InspectResponse = {
  skill: Skill;
  preview: string;
};

const MARKET_SOURCES = ['all', 'official', 'skills-sh', 'well-known', 'github', 'clawhub', 'lobehub'] as const;

const SKILLS_TABS: readonly TabDef<'installed' | 'marketplace'>[] = [
  { id: 'installed', label: 'Installed' },
  { id: 'marketplace', label: 'Marketplace' },
];

/** Sort options for the installed-skills list. */
type InstalledSort = 'recent' | 'name' | 'runs';
const SORT_LABELS: Record<InstalledSort, string> = {
  recent: 'Recently run',
  name: 'Name A–Z',
  runs: 'Most used',
};

function responseError(r: SidecarResponse): string {
  const detail = typeof r.data === 'object' && r.data && 'detail' in r.data ? String((r.data as { detail: unknown }).detail) : '';
  return detail || r.error || `Request failed (${r.status})`;
}

export function SkillsPane() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<'installed' | 'marketplace'>('installed');
  const [marketSkills, setMarketSkills] = useState<Skill[]>([]);
  const [marketQuery, setMarketQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [marketSource, setMarketSource] = useState<(typeof MARKET_SOURCES)[number]>('all');
  const [marketPage, setMarketPage] = useState(1);
  const [marketPages, setMarketPages] = useState(1);
  const [marketTotal, setMarketTotal] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [inspection, setInspection] = useState<InspectResponse | null>(null);
  const [installedFilter, setInstalledFilter] = useState('');
  const [installedSort, setInstalledSort] = useState<InstalledSort>('recent');
  const push = useToast((s) => s.push);

  const load = async () => {
    const r = await call<{ skills: Skill[] }>({ method: 'GET', path: '/skills' });
    if (r.ok && r.data) setSkills(r.data.skills);
    else push({ kind: 'error', title: 'Could not load skills', description: responseError(r) });
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab !== 'marketplace') return;
    let alive = true;
    const query: Record<string, string> = {
      source: marketSource,
      page: String(marketPage),
      size: '20',
    };
    if (submittedQuery.trim()) query.query = submittedQuery.trim();
    setMarketLoading(true);
    void call<MarketplaceResponse>({ method: 'GET', path: '/skills/marketplace', query }).then((r) => {
      if (!alive) return;
      setMarketLoading(false);
      if (r.ok && r.data) {
        setMarketSkills(r.data.skills);
        setMarketPage(r.data.page || 1);
        setMarketPages(Math.max(1, r.data.pages || 1));
        setMarketTotal(r.data.total || r.data.skills.length);
      } else {
        setMarketSkills([]);
        push({ kind: 'error', title: 'Marketplace unavailable', description: responseError(r) });
      }
    });
    return () => {
      alive = false;
    };
  }, [tab, marketSource, marketPage, submittedQuery, marketRefresh, push]);

  async function toggle(id: string) {
    const r = await call({ method: 'POST', path: `/skills/${id}/toggle` });
    if (!r.ok) push({ kind: 'error', title: 'Could not update skill', description: responseError(r) });
    await load();
  }

  async function run(id: string) {
    const r = await call({ method: 'POST', path: `/skills/${id}/run` });
    if (r.ok) push({ kind: 'success', title: 'Skill queued' });
    else push({ kind: 'error', title: 'Could not run skill', description: responseError(r) });
    await load();
  }

  async function remove(id: string) {
    const r = await call({ method: 'DELETE', path: `/skills/${id}` });
    if (!r.ok) push({ kind: 'error', title: 'Could not delete skill', description: responseError(r) });
    await load();
  }

  async function inspect(skill: Skill) {
    const identifier = skill.identifier || skill.name;
    setInspecting(identifier);
    const r = await call<InspectResponse>({
      method: 'GET',
      path: '/skills/marketplace/inspect',
      query: { identifier },
    });
    setInspecting(null);
    if (r.ok && r.data) setInspection(r.data);
    else push({ kind: 'error', title: 'Could not inspect skill', description: responseError(r) });
  }

  async function install(skill: Skill) {
    const identifier = skill.identifier || skill.name;
    setInstalling(identifier);
    const r = await call({
      method: 'POST',
      path: '/skills/marketplace/install',
      body: { identifier },
    });
    setInstalling(null);
    if (r.ok) {
      push({ kind: 'success', title: 'Skill installed', description: skill.name });
      await load();
      setMarketRefresh((n) => n + 1);
    } else {
      push({ kind: 'error', title: 'Install failed', description: responseError(r) });
    }
  }

  function searchMarketplace(e: FormEvent) {
    e.preventDefault();
    setMarketPage(1);
    setSubmittedQuery(marketQuery);
  }

  const installedAll = skills.filter((s) => s.source !== 'marketplace');

  const installed = useMemo(() => {
    const needle = installedFilter.trim().toLowerCase();
    const list = needle
      ? installedAll.filter((s) =>
          [s.name, s.description, s.category, s.trigger, s.identifier]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
        )
      : installedAll.slice();
    return list.sort((a, b) => {
      switch (installedSort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'runs':
          return (b.runs ?? 0) - (a.runs ?? 0);
        case 'recent':
        default:
          return (b.last_run ?? 0) - (a.last_run ?? 0);
      }
    });
  }, [installedAll, installedFilter, installedSort]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Skills"
          title="Procedures Hermes has learned"
          description="Run installed skills, browse the Hermes Skills Hub, or import a GitHub skill source."
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" leading={<Github className="h-3.5 w-3.5" />} onClick={() => setImporting(true)}>
            Import GitHub
          </Button>
          <Button variant="primary" leading={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
            New skill
          </Button>
        </div>
      </div>
      <div className="border-b border-[var(--line)] px-8">
        <TabStrip
          tabs={SKILLS_TABS}
          active={tab}
          onSelect={setTab}
        />
      </div>
      {tab === 'marketplace' && (
        <div className="border-b border-[var(--line)] px-8 py-4">
          <form className="mx-auto flex max-w-5xl flex-col gap-3 lg:flex-row lg:items-center" onSubmit={searchMarketplace}>
            <Input
              value={marketQuery}
              onChange={(e) => setMarketQuery(e.target.value)}
              leading={<Search className="h-4 w-4" />}
              placeholder="Search skills by name, tool, or workflow"
              className="lg:flex-1"
            />
            <select
              value={marketSource}
              onChange={(e) => {
                setMarketPage(1);
                setMarketSource(e.target.value as (typeof MARKET_SOURCES)[number]);
              }}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--fg)] outline-none transition-colors hover:border-[var(--line-strong)] focus:border-[var(--primary)] focus:[box-shadow:var(--ring-focus)]"
            >
              {MARKET_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary" leading={<Search className="h-3.5 w-3.5" />}>
              Search
            </Button>
            <Button
              type="button"
              variant="secondary"
              leading={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => setMarketRefresh((n) => n + 1)}
            >
              Refresh
            </Button>
          </form>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {tab === 'installed' ? (
          installedAll.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No skills yet"
              description="Teach Hermes its first move or install one from the marketplace."
              action={<Button variant="primary" onClick={() => setCreating(true)}>Teach a skill</Button>}
            />
          ) : (
            <div className="mx-auto max-w-5xl">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="lg:w-80">
                  <Input
                    leading={<Search className="h-4 w-4" />}
                    placeholder="Filter installed skills…"
                    value={installedFilter}
                    onChange={(e) => setInstalledFilter(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
                  <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                    sort
                  </span>
                  {(Object.keys(SORT_LABELS) as InstalledSort[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setInstalledSort(k)}
                      className={
                        installedSort === k
                          ? 'rounded-[var(--radius-sm)] border border-[var(--primary)]/40 bg-[var(--primary-wash)] px-2 py-1 text-[var(--primary)] font-medium'
                          : 'rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[var(--fg-muted)] hover:border-[var(--line-strong)] hover:text-[var(--fg)]'
                      }
                    >
                      {SORT_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              {installed.length === 0 ? (
                <p className="text-center text-sm text-[var(--fg-muted)]">
                  No skills match &ldquo;{installedFilter}&rdquo;.
                </p>
              ) : (
                <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {installed.map((s, i) => (
                    <div key={s.id} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                      <InstalledSkillCard skill={s} onToggle={toggle} onRun={run} onRemove={remove} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : marketLoading ? (
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : marketSkills.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="No marketplace results"
            description={submittedQuery ? 'Try a broader query or import a GitHub source.' : 'No skills were returned by the selected source.'}
            action={<Button variant="secondary" leading={<Github className="h-3.5 w-3.5" />} onClick={() => setImporting(true)}>Import GitHub</Button>}
          />
        ) : (
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex items-center justify-between gap-4 text-[12px] text-[var(--fg-muted)]">
              <span>{marketTotal} skills loaded{submittedQuery ? ` for "${submittedQuery}"` : ''}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={marketPage <= 1 || !!submittedQuery} onClick={() => setMarketPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span className="font-mono text-[11px] text-[var(--fg-ghost)]">
                  {marketPage} / {marketPages}
                </span>
                <Button size="sm" variant="ghost" disabled={marketPage >= marketPages || !!submittedQuery} onClick={() => setMarketPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
            <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
              {marketSkills.map((s, i) => (
                <div key={`${s.source}-${s.identifier || s.name}`} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                  <MarketplaceSkillCard
                    skill={s}
                    inspecting={inspecting === (s.identifier || s.name)}
                    installing={installing === (s.identifier || s.name)}
                    onInspect={inspect}
                    onInstall={install}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {creating && <CreateSkillDialog onClose={() => setCreating(false)} onCreated={load} />}
      {importing && <ImportGitHubDialog onClose={() => setImporting(false)} onImported={() => setMarketRefresh((n) => n + 1)} />}
      {inspection && <InspectSkillDialog inspection={inspection} onClose={() => setInspection(null)} onInstall={install} installing={installing === (inspection.skill.identifier || inspection.skill.name)} />}
    </div>
  );
}

function InstalledSkillCard({
  skill,
  onToggle,
  onRun,
  onRemove,
}: {
  skill: Skill;
  onToggle: (id: string) => Promise<void>;
  onRun: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const local = skill.source === 'app-local';
  return (
    <Card>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl">{skill.name}</h3>
              <Badge tone={skill.enabled ? 'ok' : 'neutral'}>{skill.enabled ? 'on' : 'off'}</Badge>
              <Badge tone={local ? 'primary' : 'neutral'}>{local ? 'local' : skill.source}</Badge>
            </div>
            <p className="font-mono mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
              {skill.category || skill.trigger || 'on demand'}
              {skill.trust ? ` · ${skill.trust}` : ''}
            </p>
            {skill.description ? (
              <p className="mt-3 line-clamp-3 text-[13px] text-[var(--fg-muted)]">{skill.description}</p>
            ) : skill.steps.length > 0 ? (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-[var(--fg-muted)]">
                {skill.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[13px] text-[var(--fg-muted)]">Installed through Hermes. Run it by invoking its trigger from chat.</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-3">
        <div className="font-mono text-[11px] text-[var(--fg-ghost)]">
          {skill.runs} runs · last {skill.last_run ? relTime(skill.last_run * 1000) : 'never'}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onToggle(skill.id)}>
            {skill.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button size="sm" variant="signal" leading={<Play className="h-3 w-3" />} onClick={() => onRun(skill.id)}>
            Run
          </Button>
          {local && (
            <button
              onClick={() => onRemove(skill.id)}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-dim)] hover:bg-[var(--bad-wash)] hover:text-[var(--bad)]"
              title="Delete local skill"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function MarketplaceSkillCard({
  skill,
  inspecting,
  installing,
  onInspect,
  onInstall,
}: {
  skill: Skill;
  inspecting: boolean;
  installing: boolean;
  onInspect: (skill: Skill) => Promise<void>;
  onInstall: (skill: Skill) => Promise<void>;
}) {
  return (
    <Card>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl">{skill.name}</h3>
          {skill.installed && <Badge tone="ok">installed</Badge>}
          <Badge tone={skill.trust === 'official' ? 'primary' : 'neutral'}>{skill.source || 'source'}</Badge>
        </div>
        <p className="font-mono mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
          {skill.identifier || skill.name}
          {skill.trust ? ` · ${skill.trust}` : ''}
        </p>
        <p className="mt-3 min-h-[3.8em] text-[13px] text-[var(--fg-muted)]">
          {skill.description || 'No description returned by the skill source.'}
        </p>
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-3">
        <Button size="sm" variant="ghost" leading={<Eye className="h-3 w-3" />} loading={inspecting} onClick={() => onInspect(skill)}>
          Inspect
        </Button>
        <Button
          size="sm"
          variant={skill.installed ? 'secondary' : 'primary'}
          leading={<Download className="h-3 w-3" />}
          loading={installing}
          disabled={!!skill.installed}
          onClick={() => onInstall(skill)}
        >
          {skill.installed ? 'Installed' : 'Install'}
        </Button>
      </div>
    </Card>
  );
}

function CreateSkillDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [steps, setSteps] = useState('');
  const [saving, setSaving] = useState(false);
  const push = useToast((s) => s.push);

  async function save() {
    setSaving(true);
    const r = await call({
      method: 'POST',
      path: '/skills',
      body: {
        name,
        trigger,
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      },
    });
    setSaving(false);
    if (!r.ok) {
      push({ kind: 'error', title: 'Could not save skill', description: responseError(r) });
      return;
    }
    await onCreated();
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title="Teach a new skill" description="Name it, describe when to run, list the moves.">
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning brief" autoFocus />
        </Field>
        <Field label="When to run">
          <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="every weekday at 8am" />
        </Field>
        <Field label="Steps" hint="one per line">
          <Textarea
            rows={5}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={'fetch top stories\nsummarize in 5 bullets\nread aloud'}
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save} disabled={!name.trim() || !trigger.trim() || !steps.trim()}>
          Save skill
        </Button>
      </div>
    </Dialog>
  );
}

function ImportGitHubDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [repo, setRepo] = useState('');
  const [saving, setSaving] = useState(false);
  const push = useToast((s) => s.push);

  async function save() {
    setSaving(true);
    const r = await call({ method: 'POST', path: '/skills/marketplace/taps', body: { repo } });
    setSaving(false);
    if (r.ok) {
      push({ kind: 'success', title: 'GitHub source imported', description: repo });
      onImported();
      onClose();
    } else {
      push({ kind: 'error', title: 'Import failed', description: responseError(r) });
    }
  }

  return (
    <Dialog open onClose={onClose} title="Import GitHub repo" description="Add a Hermes skill source, then browse or search its skills from Marketplace.">
      <div className="space-y-4">
        <Field label="Repository" hint="owner/repo">
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="openai/skills" leading={<Github className="h-4 w-4" />} autoFocus />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save} disabled={!repo.trim() || !repo.includes('/')}>
          Import source
        </Button>
      </div>
    </Dialog>
  );
}

function InspectSkillDialog({
  inspection,
  onClose,
  onInstall,
  installing,
}: {
  inspection: InspectResponse;
  onClose: () => void;
  onInstall: (skill: Skill) => Promise<void>;
  installing: boolean;
}) {
  const skill = inspection.skill;
  return (
    <Dialog
      open
      onClose={onClose}
      title={skill.name}
      description={`${skill.source || 'Marketplace'}${skill.trust ? ` · ${skill.trust}` : ''} · ${skill.identifier || skill.name}`}
      size="lg"
    >
      <div className="space-y-4">
        {skill.description && <p className="text-sm text-[var(--fg-muted)]">{skill.description}</p>}
        <pre className="max-h-[420px] overflow-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg-raised)] p-4 text-[12px] leading-relaxed text-[var(--fg-muted)]">
          {inspection.preview || 'No preview returned.'}
        </pre>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button
          variant={skill.installed ? 'secondary' : 'primary'}
          leading={<Download className="h-3.5 w-3.5" />}
          disabled={!!skill.installed}
          loading={installing}
          onClick={() => onInstall(skill)}
        >
          {skill.installed ? 'Installed' : 'Install'}
        </Button>
      </div>
    </Dialog>
  );
}
