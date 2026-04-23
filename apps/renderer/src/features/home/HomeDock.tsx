import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, X, GripHorizontal, MessageCircle, Square } from 'lucide-react';
import { useSession } from '../../stores/session';
import { stream } from '../../lib/rpc';
import { cn } from '../../lib/cn';
import { Mascot } from '../../components/Mascot';
import { useToast } from '../../components/ui/Toast';
import type { Action, ChatMessage } from '@shared/rpc';

const DOCK_W = 380;
const DOCK_H = 500;
const PAD = 24;

type HomeDockMode = 'floating' | 'sidebar';

/**
 * HomeDock — chat surface for Home Mode. It can still render as the original
 * floating panel, but Home mode uses the sidebar variant so the room and chat
 * have stable, non-overlapping workspaces.
 */
export function HomeDock({ mode = 'sidebar' }: { mode?: HomeDockMode }) {
  const messages = useSession((s) => s.messages);
  const streaming = useSession((s) => s.streaming);
  const sidecar = useSession((s) => s.sidecar);
  const activeProvider = useSession((s) => s.activeProvider);
  const activeProfile = useSession((s) => s.activeProfile);
  const append = useSession((s) => s.appendMessage);
  const update = useSession((s) => s.updateLastAssistantMessage);
  const patch = useSession((s) => s.patchAssistantDelta);
  const setStreaming = useSession((s) => s.setStreaming);

  const pushToast = useToast((s) => s.push);

  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - DOCK_W - PAD,
    y: window.innerHeight - DOCK_H - PAD - 24, // leave room for status bar
  }));

  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ ox: number; oy: number; mx: number; my: number } | null>(null);

  const sidebar = mode === 'sidebar';

  // keep pos within viewport on resize
  useEffect(() => {
    if (sidebar) return;
    const onResize = () => {
      setPos((p) => clamp(p, collapsed ? 56 : DOCK_W, collapsed ? 56 : DOCK_H));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [collapsed, sidebar]);

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming, collapsed]);

  function clamp(p: { x: number; y: number }, w: number, h: number) {
    return {
      x: Math.max(PAD, Math.min(window.innerWidth - w - PAD, p.x)),
      y: Math.max(60, Math.min(window.innerHeight - h - PAD, p.y)),
    };
  }

  function startDrag(e: React.MouseEvent) {
    if (sidebar) return;
    e.preventDefault();
    dragRef.current = { ox: pos.x, oy: pos.y, mx: e.clientX, my: e.clientY };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = {
        x: dragRef.current.ox + (ev.clientX - dragRef.current.mx),
        y: dragRef.current.oy + (ev.clientY - dragRef.current.my),
      };
      setPos(clamp(next, collapsed ? 56 : DOCK_W, collapsed ? 56 : DOCK_H));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming) return;
    append({ id: `u${Date.now()}`, role: 'user', content: text, createdAt: Date.now() });
    setDraft('');
    setStreaming(true);
    cancelRef.current = stream(
      {
        method: 'POST',
        path: '/chat/stream',
        body: { provider: activeProvider, profile: activeProfile, message: text },
      },
      (chunk) => {
        if (chunk.type === 'token') patch(chunk.delta);
        else if (chunk.type === 'action')
          update((m) => ({ ...m, actions: [...(m.actions ?? []), chunk.action] }));
        else if (chunk.type === 'action-update')
          update((m) => ({
            ...m,
            actions: (m.actions ?? []).map((a) => (a.id === chunk.id ? { ...a, ...chunk.patch } : a)),
          }));
        else if (chunk.type === 'error') {
          patch(`\n\n⚠️ ${chunk.message}`);
          pushToast({ kind: 'error', title: 'Hermes failed', description: chunk.message });
          setStreaming(false);
        }
      },
      () => setStreaming(false),
    );
  }, [draft, streaming, activeProvider, activeProfile, append, patch, update, setStreaming, pushToast]);

  const cancel = () => {
    cancelRef.current?.();
    setStreaming(false);
  };

  if (collapsed) {
    if (sidebar) {
      return (
        <aside className="relative z-30 flex h-full w-[72px] shrink-0 flex-col items-center border-l-2 border-[#1C2340] bg-[var(--surface)] shadow-[-8px_0_0_rgba(28,35,64,0.18)]">
          <button
            onClick={() => setCollapsed(false)}
            title="Open chat"
            className="relative mt-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border-2 border-[#1C2340] bg-[#F4EEDF] shadow-[4px_4px_0_#1C2340] transition-transform hover:-translate-y-0.5"
          >
            <Mascot scale={1} expr="happy" pose="idle" accessory="wings" animate />
            {streaming && (
              <span className="absolute right-1 top-3 h-3 w-3 animate-[stark-pulse_1.4s_ease-in-out_infinite] rounded-full border-2 border-[#1C2340] bg-[#F5A524]" />
            )}
          </button>
          <div className="font-mono mt-4 [writing-mode:vertical-rl] text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--fg-muted)]">
            Stark chat
          </div>
        </aside>
      );
    }

    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Open chat"
        className="fixed z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#1C2340] bg-[#F4EEDF] shadow-[6px_6px_0_#1C2340] transition-transform hover:scale-105"
        style={{ left: pos.x, top: pos.y }}
      >
        <Mascot scale={1} expr="happy" pose="idle" accessory="wings" animate />
        {streaming && (
          <span className="absolute right-0 top-0 h-3 w-3 animate-[stark-pulse_1.4s_ease-in-out_infinite] rounded-full border-2 border-[#1C2340] bg-[#F5A524]" />
        )}
      </button>
    );
  }

  const agentReady = sidecar.state === 'ready';
  const last = messages[messages.length - 1];
  const showTyping =
    streaming &&
    (!last ||
      last.role !== 'assistant' ||
      (!last.content && !(last.actions && last.actions.length > 0)));

  return (
    <div
      className={cn(
        'z-40 flex flex-col overflow-hidden border-2 border-[#1C2340] bg-[var(--surface)]',
        sidebar
          ? 'relative h-full w-[390px] shrink-0 rounded-none border-y-0 border-r-0 shadow-[-8px_0_0_rgba(28,35,64,0.18)]'
          : 'fixed rounded-[var(--radius-lg)] shadow-[6px_6px_0_#1C2340]',
      )}
      style={sidebar ? undefined : { left: pos.x, top: pos.y, width: DOCK_W, height: DOCK_H }}
    >
      {/* drag handle / header */}
      <div
        onMouseDown={startDrag}
        className={cn(
          'flex h-9 shrink-0 items-center justify-between border-b-2 border-[#1C2340] bg-[#F4EEDF] px-3 text-[#1C2340]',
          sidebar ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <div className="flex items-center gap-2">
          {sidebar ? <MessageCircle className="h-3.5 w-3.5 opacity-60" /> : <GripHorizontal className="h-3 w-3 opacity-50" />}
          <Mascot scale={1} expr="happy" pose="idle" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
            stark · {activeProfile ?? 'default'}
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded-sm p-0.5 hover:bg-[var(--surface-2)]"
          title="Minimize"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
            <Mascot scale={2} expr="happy" pose="wave" accessory="wings" trackCursor />
            <div className="font-display text-lg leading-tight">
              {agentReady ? 'I\u2019m right here.' : 'Just a sec…'}
            </div>
            <p className="text-[12px] text-[var(--fg-muted)]">
              Ask me anything — I'll work on it from the house.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <DockMessage key={m.id} msg={m} />
        ))}
        {showTyping && <DockTyping />}
      </div>

      {/* composer */}
      <div className="flex shrink-0 items-end gap-1.5 border-t border-[var(--line)] bg-[var(--bg-raised)]/60 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={agentReady ? 'Talk to Stark…' : 'Engine warming up…'}
          disabled={!agentReady}
          rows={1}
          className="flex-1 resize-none rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[13px] outline-none placeholder:text-[var(--fg-ghost)] focus:border-[var(--primary)] disabled:opacity-60"
        />
        {streaming ? (
          <button
            onClick={cancel}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!agentReady || !draft.trim()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
              draft.trim()
                ? 'bg-[var(--primary)] text-[var(--primary-ink)] hover:bg-[var(--primary-hover)]'
                : 'bg-[var(--surface-2)] text-[var(--fg-ghost)]',
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function DockMessage({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser && 'justify-end')}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] border border-[#1C2340] bg-[#F4EEDF]">
          <Mascot scale={1} expr="happy" pose="idle" />
        </div>
      )}
      <div className={cn('max-w-[80%]', isUser && 'max-w-[80%]')}>
        {isUser ? (
          <div className="rounded-[var(--radius-md)] rounded-tr-sm bg-[var(--primary-wash)] px-3 py-2 text-[12.5px] text-[var(--fg)]">
            {msg.content}
          </div>
        ) : (
          <>
            {msg.actions && msg.actions.length > 0 && (
              <div className="mb-1.5 space-y-1">
                {msg.actions.map((a: Action) => (
                  <DockAction key={a.id} a={a} />
                ))}
              </div>
            )}
            <div className="text-[12.5px] leading-relaxed text-[var(--fg)]">
              <div className="whitespace-pre-wrap">{msg.content || ''}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DockAction({ a }: { a: Action }) {
  const tone =
    a.status === 'running' ? 'primary' : a.status === 'failed' ? 'bad' : 'ok';
  const dotMap: Record<string, string> = {
    primary: 'var(--primary)',
    bad: 'var(--bad)',
    ok: 'var(--ok)',
  };
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-[11px] text-[var(--fg-muted)]">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dotMap[tone] }}
        />
        <span className="truncate">{a.title}</span>
      </div>
    </div>
  );
}

function DockTyping() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] border border-[#1C2340] bg-[#F4EEDF]">
        <Mascot scale={1} expr="thinking" pose="think" />
      </div>
      <div className="flex items-center gap-1 py-1">
        {[0, 0.15, 0.3].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]"
            style={{ animation: `stark-typing 1.4s ease-in-out ${d}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

export { MessageCircle };
