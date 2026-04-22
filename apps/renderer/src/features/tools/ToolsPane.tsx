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
    <div className="flex h-full flex-col bg-[#090B11]">
      <div className="border-b border-[#202638] px-8 py-6">
        <SectionHeading
          eyebrow="Tools"
          title="What Hermes can do"
          description="Toggle the capabilities Hermes can use during a run."
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <div className="stagger mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((t) => {
            const on = t.id !== 'delegation' && t.id !== 'mcp' && caps.includes(t.id as Capability);
            const always = t.id === 'delegation' || t.id === 'mcp';
            return (
              <Card
                key={t.id}
                className={cn(
                  'group overflow-hidden rounded-[22px] border bg-[#11141E] shadow-[0_22px_70px_-55px_rgba(0,0,0,0.95)]',
                  on
                    ? 'border-[#5367C9] ring-1 ring-[#5367C9]/35'
                    : 'border-[#22283A] hover:border-[#36415F]',
                )}
              >
                <div className="min-h-[172px] p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-[14px] border transition-colors',
                          on
                            ? 'border-[#334481] bg-[#182244] text-[#6F89FF]'
                            : 'border-[#202638] bg-[#171B29] text-[#7E859A] group-hover:text-[#AAB2C8]',
                        )}
                      >
                        <t.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-[#E8EBF5]">{t.title}</div>
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
                          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
                          on ? 'bg-[#6681FF]' : 'bg-[#202638]',
                        )}
                        aria-pressed={on}
                      >
                        <span
                          className={cn(
                            'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
                            on ? 'translate-x-6' : 'translate-x-1',
                          )}
                        />
                      </button>
                    )}
                  </div>
                  <p className="mt-7 text-[14px] leading-relaxed text-[#AAB2C8]">{t.description}</p>
                  <p className="mt-2 text-[12.5px] italic leading-relaxed text-[#777F95]">{t.detail}</p>
                </div>
                <div className="flex items-center justify-between border-t border-[#22283A] bg-[#141927] px-6 py-4">
                  <div className="font-mono flex min-w-0 items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#5D6578]">
                    <ShieldCheck className="h-3 w-3" /> {t.scope}
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0" leading={<Settings2 className="h-3 w-3" />}>
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
