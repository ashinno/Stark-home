import { useEffect, useState } from 'react';
import {
  Folder,
  TerminalSquare,
  Globe2,
  Search,
  Brain,
  MessageCircle,
  Share2,
  ShieldCheck,
  Settings2,
  Plug,
} from 'lucide-react';
import { useSession } from '../../stores/session';
import { SectionHeading, Badge } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { cn } from '../../lib/cn';
import type { Capability } from '@shared/rpc';

type ToolId = Capability | 'delegation' | 'mcp';

type ToolDef = {
  id: ToolId;
  title: string;
  icon: typeof Folder;
  description: string;
  detail: string;
  needsApproval: boolean;
  scope: string;
  /** Route to open when "Configure" is clicked. */
  configureRoute?: 'settings' | 'gateways' | 'memory' | 'automations';
};

const TOOLS: ToolDef[] = [
  { id: 'files', title: 'Files', icon: Folder, description: 'Read, write, and summarize files.', detail: 'Grant per-folder access. Writes and deletions always prompt.', needsApproval: true, scope: 'Per-folder paths you allow', configureRoute: 'settings' },
  { id: 'terminal', title: 'Terminal', icon: TerminalSquare, description: 'Run shell commands and scripts.', detail: 'Whitelisted directories. Destructive commands always prompt.', needsApproval: true, scope: 'Whitelisted shells + cwds', configureRoute: 'settings' },
  { id: 'browser', title: 'Browser', icon: Globe2, description: 'Navigate, fill, scrape pages.', detail: 'Runs in an ephemeral profile, no shared cookies unless you opt in.', needsApproval: true, scope: 'Ephemeral profile', configureRoute: 'settings' },
  { id: 'web', title: 'Web search', icon: Search, description: 'Search the web and cite results.', detail: 'Safe by default. Outbound HTTPS only.', needsApproval: false, scope: 'Outbound HTTPS', configureRoute: 'settings' },
  { id: 'memory', title: 'Memory', icon: Brain, description: 'Long-term notes + session history.', detail: 'Local SQLite. Always on-device.', needsApproval: false, scope: '~/Library/Application Support/Hermes', configureRoute: 'memory' },
  { id: 'messaging', title: 'Messaging gateway', icon: MessageCircle, description: 'Telegram / Slack / Discord / WhatsApp / Signal / Email.', detail: 'Tokens live in ~/.hermes/.env.', needsApproval: true, scope: 'Per-channel auth', configureRoute: 'gateways' },
  { id: 'delegation', title: 'Delegation', icon: Share2, description: 'Spawn subagents for parallel work.', detail: 'Each subagent inherits the safety preset.', needsApproval: false, scope: 'Forked thread', configureRoute: 'automations' },
  { id: 'mcp', title: 'MCP servers', icon: Plug, description: 'Extend with Model Context Protocol tools.', detail: 'Any stdio/HTTP MCP server.', needsApproval: false, scope: 'Per-server config', configureRoute: 'settings' },
];

const CAP_IDS: Capability[] = ['files', 'terminal', 'browser', 'web', 'memory', 'messaging'];
const isCapability = (id: ToolId): id is Capability =>
  (CAP_IDS as readonly string[]).includes(id);

export function ToolsPane() {
  const caps = useSession((s) => s.capabilities);
  const setCapabilities = useSession((s) => s.setCapabilities);
  const setRoute = useSession((s) => s.setRoute);
  const push = useToast((s) => s.push);
  const [saving, setSaving] = useState<string | null>(null);

  // Sync capability state from the sidecar on mount so this page is
  // authoritative even if the user navigates here before app.tsx has
  // finished loading settings.
  useEffect(() => {
    let alive = true;
    void call<{ settings: { capabilities?: Capability[] } }>({
      method: 'GET',
      path: '/settings',
    }).then((r) => {
      if (!alive) return;
      if (r.ok && r.data?.settings?.capabilities) {
        setCapabilities(r.data.settings.capabilities);
      }
    });
    return () => {
      alive = false;
    };
  }, [setCapabilities]);

  async function toggle(id: ToolId) {
    if (!isCapability(id)) return;
    setSaving(id);
    const previous = caps;
    const next = caps.includes(id) ? caps.filter((c) => c !== id) : [...caps, id];
    setCapabilities(next);
    const r = await call({ method: 'PATCH', path: '/settings', body: { capabilities: next } });
    setSaving(null);
    if (!r.ok) {
      setCapabilities(previous);
      push({
        kind: 'error',
        title: 'Could not update tool',
        description: r.error || `Request failed (${r.status})`,
      });
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Tools"
          title="What Hermes can do"
          description="Toggle the capabilities Hermes can use during a run."
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="stagger mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((t) => {
            const on = isCapability(t.id) && caps.includes(t.id);
            const always = !isCapability(t.id);
            return (
              <Card
                key={t.id}
                glow={on}
                className={cn(
                  'group overflow-hidden',
                  on ? 'border-[var(--primary)]/40' : '',
                )}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
                          on
                            ? 'bg-[var(--primary-wash)] text-[var(--primary)]'
                            : 'bg-[var(--surface-2)] text-[var(--fg-dim)] group-hover:text-[var(--fg-muted)]',
                        )}
                      >
                        <t.icon className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <div className="text-[14px] font-medium text-[var(--fg)]">{t.title}</div>
                        {t.needsApproval && <Badge tone="signal">approval</Badge>}
                      </div>
                    </div>
                    {always ? (
                      <Badge tone="neutral">always on</Badge>
                    ) : (
                      <button
                        onClick={() => toggle(t.id)}
                        disabled={saving === t.id}
                        className={cn(
                          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
                          on ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)]',
                          saving === t.id && 'opacity-70',
                        )}
                        aria-pressed={on}
                        aria-label={`${on ? 'Disable' : 'Enable'} ${t.title}`}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                            on ? 'translate-x-[18px]' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    )}
                  </div>
                  <p className="mt-4 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                    {t.description}
                  </p>
                  <p className="mt-1 text-[12px] italic leading-relaxed text-[var(--fg-dim)]">
                    {t.detail}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-2.5">
                  <div className="font-mono flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
                    <ShieldCheck className="h-3 w-3" /> {t.scope}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    leading={<Settings2 className="h-3 w-3" />}
                    onClick={() => t.configureRoute && setRoute(t.configureRoute)}
                  >
                    Configure
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
