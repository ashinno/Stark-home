import {
  FileText,
  FilePenLine,
  TerminalSquare,
  Globe2,
  Search,
  Database,
  Save,
  CalendarClock,
  MessageCircle,
  Share2,
  Loader2,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  Brain,
} from 'lucide-react';
import type { Action, ActionKind } from '@shared/rpc';
import { cn } from '../lib/cn';
import { relTime } from '../lib/time';
import { Button } from './ui/Button';
import { Badge } from './ui/Atoms';

const META: Record<ActionKind, { label: string; Icon: typeof FileText; verb: string }> = {
  thinking: { label: 'Thinking', Icon: Brain, verb: 'Considering' },
  'reading-files': { label: 'Reading files', Icon: FileText, verb: 'Reading' },
  'writing-files': { label: 'Writing files', Icon: FilePenLine, verb: 'Writing' },
  'running-terminal': { label: 'Terminal', Icon: TerminalSquare, verb: 'Running' },
  'opening-browser': { label: 'Browser', Icon: Globe2, verb: 'Opening' },
  'searching-web': { label: 'Web search', Icon: Search, verb: 'Searching' },
  'reading-memory': { label: 'Memory', Icon: Database, verb: 'Reading' },
  'writing-memory': { label: 'Memory', Icon: Save, verb: 'Saving' },
  scheduling: { label: 'Scheduling', Icon: CalendarClock, verb: 'Scheduling' },
  messaging: { label: 'Messaging', Icon: MessageCircle, verb: 'Sending' },
  delegating: { label: 'Delegating', Icon: Share2, verb: 'Delegating' },
};

/**
 * Every agent action becomes one of these. It shows what is happening, why,
 * the tool, the result, and — when risky — the approval controls.
 */
export function ActionCard({
  action,
  onApprove,
  onDeny,
}: {
  action: Action;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
}) {
  const { Icon, label } = META[action.kind];
  const needsApproval = action.status === 'needs-approval';
  const running = action.status === 'running';
  const failed = action.status === 'failed';

  const statusIcon = running ? (
    <Loader2 className="h-3.5 w-3.5 animate-[stark-spin_0.8s_linear_infinite] text-[var(--fg-dim)]" />
  ) : failed ? (
    <AlertOctagon className="h-3.5 w-3.5 text-[var(--bad)]" />
  ) : needsApproval ? (
    <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-signal)]" />
  ) : (
    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" />
  );

  return (
    <div
      className={cn(
        'tick-frame relative rounded-[var(--radius-md)] border bg-[var(--surface)] overflow-hidden',
        needsApproval
          ? 'border-[var(--accent-signal)]/50 shadow-[0_0_24px_-8px_var(--accent-signal-wash)]'
          : 'border-[var(--line)]',
        'anim-in',
      )}
    >
      {running && <span aria-hidden className="scanline" />}
      <div className="relative flex items-start gap-3 px-3.5 py-3">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--line)]',
            'bg-[var(--surface-2)] text-[var(--fg-muted)]',
            running && 'border-[var(--primary)]/40 text-[var(--primary)]',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg-dim)]">
              {label}
            </span>
            {running && <Badge tone="primary">running</Badge>}
            {needsApproval && <Badge tone="signal">needs approval</Badge>}
            {failed && <Badge tone="bad">failed</Badge>}
            {action.status === 'ok' && !running && <Badge tone="ok">done</Badge>}
          </div>
          <div className="mt-1 text-[13.5px] text-[var(--fg)]">{action.title}</div>
          <div className="mt-1 text-[12px] italic text-[var(--fg-muted)]">{action.reason}</div>
          {action.result && (
            <pre className="font-mono mt-2 max-h-40 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--fg-muted)]">
              {action.result}
            </pre>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-[var(--fg-ghost)]">
          {statusIcon}
          <span className="font-mono uppercase tracking-[0.14em]">
            {action.ended_at ? relTime(action.ended_at) : relTime(action.started_at)}
          </span>
        </div>
      </div>

      {needsApproval && (onApprove || onDeny) && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent-signal)]">
            approval required · tool · {action.tool}
          </span>
          <div className="flex gap-1.5">
            {onDeny && (
              <Button size="sm" variant="ghost" onClick={() => onDeny(action.id)}>
                Deny
              </Button>
            )}
            {onApprove && (
              <Button size="sm" variant="signal" onClick={() => onApprove(action.id)}>
                Approve
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
