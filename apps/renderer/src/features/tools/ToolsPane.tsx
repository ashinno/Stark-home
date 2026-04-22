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
import { call } from '../../lib/rpc';
import { cn } from '../../lib/cn';
import type { Capability } from '@shared/rpc';

type ToolDef = {
  id: Capability | 'delegation' | 'mcp';
  title: string;
  icon: typeof Folder;
  description: string;
  detail: string;
  needsApproval: boolean;
  scope: string;
};

const TOOLS: ToolDef[] = [
  { id: 'files', title: 'Files', icon: Folder, description: 'Read, write, and summarize files.', detail: 'Grant per-folder access. Writes and deletions always prompt.', needsApproval: true, scope: 'Per-folder paths you allow' },
  { id: 'terminal', title: 'Terminal', icon: TerminalSquare, description: 'Run shell commands and scripts.', detail: 'Whitelisted directories. Destructive commands always prompt.', needsApproval: true, scope: 'Whitelisted shells + cwds' },
  { id: 'browser', title: 'Browser', icon: Globe2, description: 'Navigate, fill, scrape pages.', detail: 'Runs in an ephemeral profile, no shared cookies unless you opt in.', needsApproval: true, scope: 'Ephemeral profile' },
  { id: 'web', title: 'Web search', icon: Search, description: 'Search the web and cite results.', detail: 'Safe by default. Outbound HTTPS only.', needsApproval: false, scope: 'Outbound HTTPS' },
  { id: 'memory', title: 'Memory', icon: Brain, description: 'Long-term notes + session history.', detail: 'Local SQLite. Always on-device.', needsApproval: false, scope: '~/Library/Application Support/Hermes' },
  { id: 'messaging', title: 'Messaging gateway', icon: MessageCircle, description: 'Telegram / Slack / Discord / WhatsApp / Signal / Email.', detail: 'Tokens live in ~/.hermes/.env.', needsApproval: true, scope: 'Per-channel auth' },
  { id: 'delegation', title: 'Delegation', icon: Share2, description: 'Spawn subagents for parallel work.', detail: 'Each subagent inherits the safety preset.', needsApproval: false, scope: 'Forked thread' },
  { id: 'mcp', title: 'MCP servers', icon: Plug, description: 'Extend with Model Context Protocol tools.', detail: 'Any stdio/HTTP MCP server.', needsApproval: false, scope: 'Per-server config' },
];

export function ToolsPane() {
  const caps = useSession((s) => s.capabilities);
  const toggleLocal = useSession((s) => s.toggleCapability);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(id: Capability | 'delegation' | 'mcp') {
    if (id === 'delegation' || id === 'mcp') return;
    setSaving(id);
    const next = caps.includes(id as Capability) ? caps.filter((c) => c !== id) : [...caps, id as Capability];
    toggleLocal(id as Capability);
    await call({ method: 'PATCH', path: '/settings', body: { capabilities: next } });
    setSaving(null);
  }

  useEffect(() => {
    // sync from sidecar on mount
    void call<{ settings: { capabilities?: Capability[] } }>({
      method: 'GET',
      path: '/settings',
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Tools"
          title="What Hermes can do"
          description="Every tool can be toggled independently. Permissions live in one place."
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="stagger mx-auto grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((t) => {
            const on = t.id !== 'delegation' && t.id !== 'mcp' && caps.includes(t.id as Capability);
            const always = t.id === 'delegation' || t.id === 'mcp';
            return (
              <Card key={t.id} className={cn('overflow-hidden', on && 'border-[var(--primary)]/40')} glow={on}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]',
                          on
                            ? 'bg-[var(--primary-wash)] text-[var(--primary)]'
                            : 'bg-[var(--surface-2)] text-[var(--fg-dim)]',
                        )}
                      >
                        <t.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{t.title}</div>
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
                          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                          on ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)]',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                            on ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-[13px] text-[var(--fg-muted)]">{t.description}</p>
                  <p className="mt-1 text-[12px] italic text-[var(--fg-dim)]">{t.detail}</p>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-2.5">
                  <div className="font-mono flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
                    <ShieldCheck className="h-3 w-3" /> {t.scope}
                  </div>
                  <Button size="sm" variant="ghost" leading={<Settings2 className="h-3 w-3" />}>
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
