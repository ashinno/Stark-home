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
import { Switch } from '../../components/ui/Switch';
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
  { id: 'memory', title: 'Memory', icon: Brain, description: 'Long-term notes + session history.', detail: 'Local SQLite. Always on-device.', needsApproval: false, scope: 'Local app data', configureRoute: 'memory' },
  { id: 'messaging', title: 'Messaging gateway', icon: MessageCircle, description: 'Telegram / Slack / Discord / WhatsApp / Signal / Email.', detail: 'Tokens live in the local secrets file.', needsApproval: true, scope: 'Per-channel auth', configureRoute: 'gateways' },
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
      <div className="border-b border-[var(--line)] bg-[#141726]/72 px-7 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Tools"
            title="Capability controls"
            description="Enable the runtime surfaces Stark can reach during a run."
          />
          <div className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-[#727898] lg:block">
            approval-gated actions stay explicit
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
        <div className="stagger mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((t, i) => {
            const on = isCapability(t.id) && caps.includes(t.id);
            const always = !isCapability(t.id);
            return (
              <Card
                key={t.id}
                glow={on}
                style={{ '--i': i } as React.CSSProperties}
                className={cn(
                  'group overflow-hidden rounded-[16px] border bg-[#181b27] shadow-[0_14px_30px_rgba(5,7,16,0.2)]',
                  on
                    ? 'border-[#5064de] shadow-[0_14px_30px_rgba(26,34,86,0.28),inset_0_0_0_1px_rgba(120,138,255,0.1)]'
                    : 'border-[#2a2f46] hover:border-[#3a4062] hover:bg-[#1b1f2d]',
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border transition-colors',
                          on
                            ? 'border-[#4454b6] bg-[#20284c] text-[#8da2ff]'
                            : 'border-[#262c45] bg-[#20253b] text-[#7d85a9] group-hover:text-[#aeb4d8]',
                        )}
                      >
                        <t.icon className="h-5 w-5" />
                      </div>
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <div className="max-w-full truncate text-[15px] font-semibold text-[#eef1ff]">
                          {t.title}
                        </div>
                        {t.needsApproval && <Badge tone="signal">approval</Badge>}
                      </div>
                    </div>
                    {always ? (
                      <Badge tone="neutral">always on</Badge>
                    ) : (
                      <Switch
                        checked={on}
                        loading={saving === t.id}
                        onChange={() => toggle(t.id)}
                        ariaLabel={`${on ? 'Disable' : 'Enable'} ${t.title}`}
                      />
                    )}
                  </div>
                  <p className="mt-4 text-[13px] leading-6 text-[#c3c8e2]">
                    {t.description}
                  </p>
                  <p className="mt-1.5 text-[11.5px] italic leading-5 text-[#7f86a8]">
                    {t.detail}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[#272c42] bg-[#1b1f2d] px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-mono flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] text-[#68708d]">
                      <ShieldCheck className="h-3 w-3" />
                      Scope
                    </div>
                    <div className="mt-0.5 max-w-[190px] truncate text-[12px] text-[#aeb4d8]">{t.scope}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 rounded-[10px] border border-transparent px-3 text-[12px] text-[#c7cce6] hover:border-[#313754] hover:bg-[#22273a] hover:text-[#f0f3ff]"
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
