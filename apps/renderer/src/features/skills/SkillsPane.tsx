import { useEffect, useState } from 'react';
import { Sparkles, Plus, Play, Trash2, Download } from 'lucide-react';
import { SectionHeading, Badge, EmptyState } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { relTime } from '../../lib/time';
import { cn } from '../../lib/cn';

type Skill = {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  enabled: boolean;
  runs: number;
  last_run: number | null;
  source: 'local' | 'marketplace';
};

export function SkillsPane() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<'installed' | 'marketplace'>('installed');
  const push = useToast((s) => s.push);

  const load = async () => {
    const r = await call<{ skills: Skill[] }>({ method: 'GET', path: '/skills' });
    if (r.ok && r.data) setSkills(r.data.skills);
  };
  useEffect(() => {
    void load();
  }, []);

  async function toggle(id: string) {
    await call({ method: 'POST', path: `/skills/${id}/toggle` });
    await load();
  }
  async function run(id: string) {
    await call({ method: 'POST', path: `/skills/${id}/run` });
    push({ kind: 'success', title: 'Skill queued' });
    await load();
  }
  async function remove(id: string) {
    await call({ method: 'DELETE', path: `/skills/${id}` });
    await load();
  }

  const shown = skills.filter((s) => (tab === 'installed' ? s.source === 'local' : s.source === 'marketplace'));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Skills"
          title="Procedures Hermes has learned"
          description="Save a workflow as a skill and run it again from anywhere."
        />
        <Button variant="primary" leading={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
          New skill
        </Button>
      </div>
      <div className="border-b border-[var(--line)] px-8">
        <div className="flex gap-1">
          {(['installed', 'marketplace'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative px-4 py-3 text-sm transition-colors',
                tab === t ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
              )}
            >
              {t}
              {tab === t && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary-glow)]" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {shown.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title={tab === 'installed' ? 'No skills yet' : 'Nothing curated'}
            description={tab === 'installed' ? 'Teach Hermes its first move.' : 'Marketplace browsing coming soon.'}
            action={tab === 'installed' ? <Button variant="primary" onClick={() => setCreating(true)}>Teach a skill</Button> : undefined}
          />
        ) : (
          <div className="stagger mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2">
            {shown.map((s) => (
              <Card key={s.id}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-xl">{s.name}</h3>
                        <Badge tone={s.enabled ? 'ok' : 'neutral'}>{s.enabled ? 'on' : 'off'}</Badge>
                      </div>
                      <p className="font-mono mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                        trigger · {s.trigger}
                      </p>
                      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-[var(--fg-muted)]">
                        {s.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-3">
                  <div className="font-mono text-[11px] text-[var(--fg-ghost)]">
                    {s.runs} runs · last {s.last_run ? relTime(s.last_run * 1000) : 'never'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => toggle(s.id)}>
                      {s.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    {tab === 'installed' ? (
                      <>
                        <Button size="sm" variant="signal" leading={<Play className="h-3 w-3" />} onClick={() => run(s.id)}>
                          Run
                        </Button>
                        <button
                          onClick={() => remove(s.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-dim)] hover:bg-[var(--bad-wash)] hover:text-[var(--bad)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <Button size="sm" variant="primary" leading={<Download className="h-3 w-3" />}>
                        Install
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {creating && <CreateSkillDialog onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  );
}

function CreateSkillDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [steps, setSteps] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    await call({
      method: 'POST',
      path: '/skills',
      body: {
        name,
        trigger,
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      },
    });
    setSaving(false);
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
