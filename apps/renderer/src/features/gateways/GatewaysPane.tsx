import { useEffect, useState } from 'react';
import {
  Radio,
  Settings as Cog,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  RefreshCcw,
  Send,
  MessageCircle,
  MessageSquare,
  Phone,
  Mail,
} from 'lucide-react';
import { SectionHeading, Badge, Dot, EmptyState } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { useSession } from '../../stores/session';
import { cn } from '../../lib/cn';

type Status = 'online' | 'ready' | 'unconfigured' | 'error';

type FieldView = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  set: boolean;
  preview: string;
};

type Gateway = {
  id: string;
  name: string;
  configured: boolean;
  status: Status;
  platform_state: string | null;
  platform_error: string | null;
  platform_updated: string | null;
  fields: FieldView[];
};

type Daemon = {
  running: boolean;
  pid: number | null;
  active_agents: number;
  updated_at: string | null;
};

const ICONS: Record<string, typeof Send> = {
  telegram: Send,
  discord: MessageCircle,
  slack: MessageSquare,
  whatsapp: Phone,
  signal: MessageCircle,
  weixin: MessageCircle,
  email: Mail,
};

const TONE: Record<Status, { label: string; tone: 'ok' | 'primary' | 'warn' | 'bad' | 'neutral' }> = {
  online: { label: 'Live', tone: 'ok' },
  ready: { label: 'Ready', tone: 'primary' },
  unconfigured: { label: 'Not configured', tone: 'neutral' },
  error: { label: 'Error', tone: 'bad' },
};

export function GatewaysPane() {
  const activeProfile = useSession((s) => s.activeProfile);
  const [items, setItems] = useState<Gateway[]>([]);
  const [daemon, setDaemon] = useState<Daemon | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<Gateway | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const push = useToast((s) => s.push);

  async function load() {
    const r = await call<{ gateways: Gateway[]; daemon: Daemon; profile: string | null }>({
      method: 'GET',
      path: '/gateways',
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok && r.data) {
      setItems(r.data.gateways);
      setDaemon(r.data.daemon);
      setProfile(r.data.profile);
    }
  }
  useEffect(() => {
    void load();
    const i = window.setInterval(load, 8000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  async function restart(id: string) {
    setBusy(id);
    const r = await call<{ ok: boolean; stderr?: string }>({
      method: 'POST',
      path: `/gateways/${id}/start`,
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    setBusy(null);
    if (r.ok && r.data?.ok) {
      push({ kind: 'success', title: `${id} restarted` });
    } else {
      push({ kind: 'error', title: 'Restart failed', description: r.data?.stderr ?? r.error });
    }
    await load();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-8 py-5">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Gateways"
            title="Reach Stark from your apps"
            description={`Per-profile messaging bridges. Real config is read from the ${profile ? `${profile} profile` : 'default profile'} secrets file.`}
          />
          <div className="flex items-center gap-3">
            <DaemonPill daemon={daemon} />
            <Button
              variant="ghost"
              size="sm"
              leading={<RefreshCcw className="h-3 w-3" />}
              onClick={load}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {items.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-5 w-5" />}
            title="Gateways unavailable"
            description="Engine not detected. Open Settings → System Doctor."
          />
        ) : (
          <div className="stagger mx-auto grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((g) => {
              const Icon = ICONS[g.id] ?? Radio;
              const tone = TONE[g.status];
              const fingerprintField = g.fields.find((f) => f.secret && f.set);
              return (
                <Card key={g.id} className="overflow-hidden p-0" glow={g.status === 'online'}>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]',
                            g.status === 'online'
                              ? 'bg-[var(--ok-wash)] text-[var(--ok)]'
                              : g.configured
                                ? 'bg-[var(--primary-wash)] text-[var(--primary)]'
                                : 'bg-[var(--surface-2)] text-[var(--fg-dim)]',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{g.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                            <StatusIcon status={g.status} />
                            <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                              {tone.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge tone={tone.tone}>{g.status}</Badge>
                    </div>

                    {/* Configured-keys row */}
                    {g.configured && (
                      <div className="font-mono mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--ok-wash)] px-2.5 py-1.5 text-[11px] text-[var(--ok)]">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="uppercase tracking-[0.14em]">already configured</span>
                        {fingerprintField && (
                          <span className="ml-auto opacity-80">{fingerprintField.preview}</span>
                        )}
                      </div>
                    )}

                    {g.platform_error && (
                      <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--bad-wash)] px-2.5 py-1.5 text-[11px] text-[var(--bad)]">
                        {g.platform_error}
                      </div>
                    )}

                    {/* Field summary */}
                    <div className="mt-3 space-y-1">
                      {g.fields.map((f) => (
                        <div key={f.key} className="flex items-center gap-2 text-[11px]">
                          <span
                            className={cn(
                              'inline-block h-1 w-1 rounded-full',
                              f.set ? 'bg-[var(--ok)]' : 'bg-[var(--fg-ghost)]',
                            )}
                          />
                          <span className="text-[var(--fg-muted)]">{f.label}</span>
                          {!f.required && (
                            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                              opt
                            </span>
                          )}
                          {f.set && (
                            <span className="font-mono ml-auto truncate text-[10px] text-[var(--fg-dim)]">
                              {f.preview}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] bg-[var(--surface-2)]/40 px-5 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      leading={<Cog className="h-3 w-3" />}
                      onClick={() => setConfiguring(g)}
                    >
                      {g.configured ? 'Edit' : 'Configure'}
                    </Button>
                    {g.configured && g.status !== 'online' && (
                      <Button
                        variant="primary"
                        size="sm"
                        leading={<Play className="h-3 w-3" />}
                        loading={busy === g.id}
                        onClick={() => restart(g.id)}
                      >
                        Restart
                      </Button>
                    )}
                    {g.status === 'online' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leading={<RefreshCcw className="h-3 w-3" />}
                        loading={busy === g.id}
                        onClick={() => restart(g.id)}
                      >
                        Reload
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {configuring && (
        <ConfigureGatewayDialog
          gateway={configuring}
          profile={activeProfile}
          onClose={() => setConfiguring(null)}
          onSaved={async () => {
            await load();
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'online') return <Dot tone="ok" pulse />;
  if (status === 'ready') return <Dot tone="primary" />;
  if (status === 'error') return <AlertCircle className="h-3 w-3 text-[var(--bad)]" />;
  return <CircleDashed className="h-3 w-3 text-[var(--fg-ghost)]" />;
}

function DaemonPill({ daemon }: { daemon: Daemon | null }) {
  if (!daemon) return null;
  return (
    <div className="font-mono inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
      <Dot tone={daemon.running ? 'ok' : 'dim'} pulse={daemon.running} />
      gateway · {daemon.running ? `pid ${daemon.pid}` : 'stopped'}
    </div>
  );
}

function ConfigureGatewayDialog({
  gateway,
  profile,
  onClose,
  onSaved,
}: {
  gateway: Gateway;
  profile: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    // For secret fields we DON'T pre-fill the value (we don't have it on the
    // client; the probe only returns a fingerprint). Show a placeholder
    // indicating "leave blank to keep existing".
    const seed: Record<string, string> = {};
    for (const f of gateway.fields) {
      if (!f.secret && f.set) seed[f.key] = f.preview;
    }
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const push = useToast((s) => s.push);

  async function save() {
    setSaving(true);
    // strip empty values (means "don't change")
    const cleaned = Object.fromEntries(
      Object.entries(vals).filter(([, v]) => v.trim().length > 0),
    );
    const r = await call({
      method: 'POST',
      path: `/gateways/${gateway.id}/configure`,
      body: { config: cleaned },
      query: profile ? { profile } : undefined,
    });
    setSaving(false);
    if (r.ok) {
      push({
        kind: 'success',
        title: `${gateway.name} saved`,
        description: 'Restart the gateway from the card to pick it up.',
      });
      await onSaved();
    } else {
      push({ kind: 'error', title: 'Save failed', description: r.error });
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Configure ${gateway.name}`}
      description={
        profile
          ? `Writing to the ${profile} profile secrets file`
          : 'Writing to the default secrets file'
      }
    >
      {gateway.configured && (
        <div className="font-mono mb-4 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--ok-wash)] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--ok)]">
          <CheckCircle2 className="h-3 w-3" />
          already set up · only fill what you want to change
        </div>
      )}
      <div className="space-y-4">
        {gateway.fields.map((f) => (
          <Field
            key={f.key}
            label={`${f.label}${f.required ? '' : ' (optional)'}`}
            hint={
              f.set
                ? f.secret
                  ? `current: ${f.preview} — leave blank to keep`
                  : 'current value pre-filled'
                : undefined
            }
          >
            <Input
              type={f.secret ? 'password' : 'text'}
              placeholder={f.secret && f.set ? '••••••••' : ''}
              value={vals[f.key] ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={save}
          leading={<Square className="h-3 w-3" />}
        >
          Save to .env
        </Button>
      </div>
    </Dialog>
  );
}
