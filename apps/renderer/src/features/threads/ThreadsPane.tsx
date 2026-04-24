import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Square,
  RotateCcw,
  MessagesSquare,
  Search,
  Pin,
  Trash2,
  RefreshCw,
  AlertCircle,
  Download,
} from 'lucide-react';
import { useSession } from '../../stores/session';
import { call, stream } from '../../lib/rpc';
import { refreshDaemonStatus } from '../../lib/daemon';
import { cn } from '../../lib/cn';
import type { Action, ChatMessage, Thread } from '@shared/rpc';
import { Button } from '../../components/ui/Button';
import { Kbd, Dot } from '../../components/ui/Atoms';
import { Mascot } from '../../components/Mascot';
import { useToast } from '../../components/ui/Toast';
import { ActionCard } from '../../components/ActionCard';
import { Input } from '../../components/ui/Input';
import { relTime } from '../../lib/time';
import { downloadThread, copyThread } from '../../lib/export';

const SLASH = [
  { cmd: '/new', desc: 'Start a fresh session' },
  { cmd: '/remember', desc: 'Pin this to long-term memory' },
  { cmd: '/brief', desc: 'Run the morning brief' },
  { cmd: '/stop', desc: 'Stop the current task' },
];

export function ThreadsPane() {
  const messages = useSession((s) => s.messages);
  const streaming = useSession((s) => s.streaming);
  const sidecar = useSession((s) => s.sidecar);
  const engineInstalled = useSession((s) => s.engineInstalled);
  const setRoute = useSession((s) => s.setRoute);
  const activeProvider = useSession((s) => s.activeProvider);
  const activeProfile = useSession((s) => s.activeProfile);
  const append = useSession((s) => s.appendMessage);
  const update = useSession((s) => s.updateLastAssistantMessage);
  const patch = useSession((s) => s.patchAssistantDelta);
  const markLastUserError = useSession((s) => s.markLastUserError);
  const setStreaming = useSession((s) => s.setStreaming);
  const reset = useSession((s) => s.resetThread);
  const userName = useSession((s) => s.userName);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadQuery, setThreadQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingSession, setLoadingSession] = useState<string | null>(null);
  const [openedSessionId, setOpenedSessionId] = useState<string | null>(null);
  const pushToast = useToast((s) => s.push);

  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const agentReady = sidecar.state === 'ready';
  const showSlash = draft.startsWith('/') && !draft.includes(' ');
  const slashMatches = useMemo(
    () => SLASH.filter((c) => c.cmd.startsWith(draft.toLowerCase())).slice(0, 4),
    [draft],
  );

  useEffect(() => {
    void loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = '44px';
    ta.style.height = `${Math.min(220, ta.scrollHeight)}px`;
  }, [draft]);

  // Auto-send a prompt that was queued by Home or the command palette.
  // Only fire when there's no session being opened (otherwise we'd submit
  // before historical messages have been loaded in).
  useEffect(() => {
    if (
      messages.length === 1 &&
      messages[0].role === 'user' &&
      !streaming &&
      !openedSessionId &&
      !loadingSession
    ) {
      void submit(messages[0].content, { alreadyAppended: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If another pane navigated us here with a pending session id, open it.
  const pendingThreadId = useSession((s) => s.activeThreadId);
  const setActiveThreadId = useSession((s) => s.setActiveThreadId);
  useEffect(() => {
    if (pendingThreadId && pendingThreadId !== openedSessionId) {
      void openSession(pendingThreadId);
      setActiveThreadId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingThreadId]);

  async function loadThreads() {
    const r = await call<{ threads: Thread[]; real?: boolean }>({
      method: 'GET',
      path: '/threads',
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok && r.data) setThreads(r.data.threads);
  }

  async function openSession(sid: string) {
    setLoadingSession(sid);
    setOpenedSessionId(sid);
    cancelRef.current?.();
    setStreaming(false);
    reset();
    const r = await call<{ messages: { role: string; content: string }[]; title?: string }>({
      method: 'GET',
      path: `/sessions/${sid}`,
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok && r.data) {
      // Inject historical messages into the local thread.
      let i = 0;
      for (const m of r.data.messages) {
        if (!m.content?.trim()) continue;
        if (m.role === 'system') continue; // skip the giant system prompt
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        append({
          id: `h${sid}_${i++}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: Date.now() - (1000 * (r.data.messages.length - i)),
        });
      }
    }
    setLoadingSession(null);
  }

  const submit = useCallback(
    async (content: string, opts?: { alreadyAppended?: boolean }) => {
      const text = content.trim();
      if (!text || streaming) return;
      if (text === '/new') {
        reset();
        setDraft('');
        return;
      }
      if (!opts?.alreadyAppended) {
        append({ id: `u${Date.now()}`, role: 'user', content: text, createdAt: Date.now() });
      }
      markLastUserError(null);
      setDraft('');
      setStreaming(true);
      cancelRef.current = stream(
        {
          method: 'POST',
          path: '/chat/stream',
          body: {
            provider: activeProvider,
            profile: activeProfile,
            message: text,
            session_id: openedSessionId ?? undefined,
          },
        },
        (chunk) => {
          if (chunk.type === 'session') {
            setOpenedSessionId(chunk.sessionId);
          } else if (chunk.type === 'token') {
            patch(chunk.delta);
          } else if (chunk.type === 'action') {
            update((m) => ({ ...m, actions: [...(m.actions ?? []), chunk.action] }));
          } else if (chunk.type === 'action-update') {
            update((m) => ({
              ...m,
              actions: (m.actions ?? []).map((a) => (a.id === chunk.id ? { ...a, ...chunk.patch } : a)),
            }));
          } else if (chunk.type === 'done') {
            if (chunk.sessionId) setOpenedSessionId(chunk.sessionId);
            // Some providers finish without emitting any token (auth missing,
            // rate-limit with empty body, etc.). Leave a visible placeholder
            // so the user doesn't stare at a silent UI.
            update((m) => ({
              ...m,
              content:
                m.content || (m.actions && m.actions.length > 0)
                  ? m.content
                  : '_(no response — check provider settings)_',
            }));
            void loadThreads();
            // The first successful turn on a cold profile just finished
            // warming the pool — refresh daemon state so StatusBar flips
            // from "warming" to "live" without waiting for the next tick.
            void refreshDaemonStatus();
          } else if (chunk.type === 'error') {
            markLastUserError(chunk.message);
            pushToast({ kind: 'error', title: 'Stark failed', description: chunk.message });
            setStreaming(false);
          }
        },
        () => setStreaming(false),
      );
    },
    [streaming, activeProvider, activeProfile, openedSessionId, append, update, patch, setStreaming, reset, pushToast, markLastUserError],
  );

  const retry = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'user' && m.error) {
        void submit(m.content, { alreadyAppended: true });
        return;
      }
    }
  }, [messages, submit]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    setStreaming(false);
  }, [setStreaming]);

  const newThread = useCallback(() => {
    cancelRef.current?.();
    setOpenedSessionId(null);
    reset();
  }, [reset]);

  const filteredThreads = threadQuery.trim()
    ? threads.filter((t) =>
        (t.title + ' ' + t.preview).toLowerCase().includes(threadQuery.toLowerCase()),
      )
    : threads;

  return (
    <div className="flex h-full">
      {/* Thread list */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-raised)]/40">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--fg-ghost)]">
              Threads
            </div>
            <Button size="sm" variant="ghost" onClick={newThread} leading={<RotateCcw className="h-3 w-3" />}>
              new
            </Button>
          </div>
          <div className="mt-3">
            <Input
              leading={<Search className="h-3.5 w-3.5" />}
              placeholder="Search"
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {filteredThreads.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-[var(--fg-muted)]">
              No threads yet.
            </div>
          ) : (
            <ul className="stagger px-2">
              {filteredThreads.map((t) => {
                const opened = t.id === openedSessionId;
                const loading = t.id === loadingSession;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => void openSession(t.id)}
                      className={cn(
                        'group flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors',
                        opened
                          ? 'bg-[var(--primary-wash)]'
                          : 'hover:bg-[var(--surface-2)]',
                      )}
                    >
                      <div className="mt-1 shrink-0">
                        <Dot tone={loading ? 'primary' : t.running ? 'primary' : 'dim'} pulse={loading || t.running} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <div className="truncate text-[13px]">{t.title}</div>
                          {t.pinned && <Pin className="h-2.5 w-2.5 text-[var(--accent-signal)]" />}
                        </div>
                        <div className="truncate text-[11px] text-[var(--fg-muted)]">{t.preview}</div>
                        <div className="font-mono mt-0.5 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                          <span>{relTime(t.updated_at * 1000)}</span>
                          {(t as Thread & { source?: string }).source && (
                            <span className="rounded bg-[var(--surface-2)] px-1 py-px">{(t as Thread & { source?: string }).source}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversation */}
      <div className="stark-bg relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-8 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--primary)]">
              Conversation
            </div>
            <div className="mt-0.5 flex items-baseline gap-3">
              <h1 className="font-display text-2xl">
                {userName ? `For ${userName}` : 'Active thread'}
              </h1>
              <span className="font-mono text-[11px] text-[var(--fg-ghost)]">· {activeProvider}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {streaming ? (
              <Button variant="ghost" size="sm" leading={<Square className="h-3 w-3 fill-current" />} onClick={cancel}>
                Stop
              </Button>
            ) : null}
            {messages.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<Download className="h-3 w-3" />}
                  onClick={() => downloadThread(messages, 'markdown')}
                  title="Export thread as Markdown"
                >
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void copyThread(messages).then(() =>
                      pushToast({ kind: 'success', title: 'Copied transcript' }),
                    );
                  }}
                  title="Copy transcript to clipboard"
                >
                  Copy
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" leading={<Trash2 className="h-3 w-3" />} onClick={newThread}>
              Clear
            </Button>
          </div>
        </div>

        {engineInstalled === false && (
          <button
            onClick={() => setRoute('settings')}
            className="anim-in group flex w-full items-center gap-3 border-b border-[var(--warn)]/30 bg-[var(--warn-wash)]/40 px-6 py-2.5 text-left transition-colors duration-[var(--motion-dur-sm)] hover:bg-[var(--warn-wash)]/60 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            aria-label="Open System Doctor"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--warn)] shadow-[0_0_10px_var(--warn)]"
            />
            <span className="min-w-0 flex-1 text-[12px] text-[var(--fg)]">
              <span className="font-medium">Running on the stub.</span>{' '}
              <span className="text-[var(--fg-muted)]">
                The engine isn't installed yet — replies are placeholders. Open System Doctor to install.
              </span>
            </span>
            <span className="font-mono shrink-0 text-[10px] uppercase tracking-[0.18em] text-[var(--warn)] group-hover:text-[var(--fg)]">
              open doctor →
            </span>
          </button>
        )}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
          {messages.length === 0 && <EmptyThread ready={agentReady} />}
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m) => (
              <Message key={m.id} msg={m} onRetry={m.error ? retry : undefined} />
            ))}
            {streaming &&
              (() => {
                const last = messages[messages.length - 1];
                const empty =
                  !last ||
                  last.role !== 'assistant' ||
                  (!last.content && !(last.actions && last.actions.length > 0));
                return empty ? <Typing /> : null;
              })()}
          </div>
        </div>

        {/* composer */}
        <div className="relative border-t border-[var(--line)] bg-[var(--bg-raised)]/60 px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {showSlash && slashMatches.length > 0 && (
              <div className="mb-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)]">
                {slashMatches.map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => setDraft(c.cmd + ' ')}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--surface-3)]"
                  >
                    <span className="font-mono text-[var(--primary)]">{c.cmd}</span>
                    <span className="text-[11px] text-[var(--fg-muted)]">{c.desc}</span>
                  </button>
                ))}
              </div>
            )}
            <div
              className={cn(
                'flex items-end gap-2 rounded-[var(--radius-lg)] border bg-[var(--surface)] px-3 py-2.5 transition-colors',
                draft
                  ? 'border-[var(--primary)] shadow-[0_0_0_3px_var(--primary-wash)]'
                  : 'border-[var(--line)]',
              )}
            >
              <textarea
                ref={textRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submit(draft);
                  }
                }}
                placeholder={agentReady ? 'Type a message, or / for commands…' : 'Warming up…'}
                disabled={!agentReady}
                rows={1}
                style={{ height: 44 }}
                className="flex-1 resize-none bg-transparent px-1 py-1 text-[14px] outline-none placeholder:text-[var(--fg-ghost)] disabled:opacity-60"
              />
              <button
                onClick={() => void submit(draft)}
                disabled={!agentReady || !draft.trim() || streaming}
                className={cn(
                  'flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
                  draft.trim() && !streaming
                    ? 'bg-[var(--primary)] text-[var(--primary-ink)] shadow-[0_8px_20px_-10px_var(--primary-glow)] hover:bg-[var(--primary-hover)]'
                    : 'bg-[var(--surface-2)] text-[var(--fg-ghost)]',
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--fg-ghost)]">
              <div className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                send
                <span className="opacity-60">·</span>
                <Kbd>⇧↵</Kbd>
                newline
                <span className="opacity-60">·</span>
                <Kbd>/</Kbd>
                commands
              </div>
              <div className="font-mono uppercase tracking-[0.14em]">
                local · end-to-end
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyThread({ ready }: { ready: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-14 text-center">
      <Mascot scale={3} expr={ready ? 'happy' : 'sleepy'} pose="wave" accessory="wings" trackCursor />
      <h2 className="font-display mt-5 text-4xl">
        {ready ? 'A fresh thread.' : 'Starting the engine.'}
      </h2>
      <p className="mt-3 max-w-md text-sm text-[var(--fg-muted)]">
        {ready
          ? 'Ask anything. Stark may use files, the browser, the terminal, memory, and the web — every action will appear as a card you can pause or approve.'
          : 'The Stark engine is warming up. This only takes a moment on first launch.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {[
          'Plan my week',
          'Summarize the open PRs in this repo',
          'Draft a reply to my unread email',
          'What changed on my Mac today?',
        ].map((p) => (
          <button
            key={p}
            onClick={() => {
              const ta = document.querySelector<HTMLTextAreaElement>('textarea');
              if (ta) {
                ta.value = p;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.focus();
              }
            }}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 text-[12px] text-[var(--fg-muted)] transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--fg)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ msg, onRetry }: { msg: ChatMessage; onRetry?: () => void }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-4 anim-in', isUser && 'justify-end')}>
      {!isUser && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border-2 border-[#1C2340] bg-[#F4EEDF]">
          <Mascot scale={1} expr="happy" pose="idle" accessory="wings" animate />
        </div>
      )}
      <div className={cn('max-w-[82%]', isUser && 'max-w-[75%]')}>
        {isUser ? (
          <>
            <div
              className={cn(
                'rounded-[var(--radius-lg)] rounded-tr-sm bg-[var(--primary-wash)] px-4 py-3 text-[14.5px] leading-relaxed text-[var(--fg)]',
                msg.error && 'border border-[var(--bad)]/60 bg-[var(--bad-wash)]/40',
              )}
            >
              {msg.content}
            </div>
            {msg.error && (
              <div className="mt-2 flex items-center justify-end gap-2 text-[11px]">
                <AlertCircle className="h-3 w-3 text-[var(--bad)]" />
                <span className="text-[var(--bad)]">{msg.error}</span>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="font-mono inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)] transition-colors hover:border-[var(--primary)]/60 hover:bg-[var(--primary-wash)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                  >
                    <RefreshCw className="h-3 w-3" /> retry
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {msg.actions && msg.actions.length > 0 && (
              <div className="mb-3 space-y-2">
                {msg.actions.map((a: Action) => (
                  <ActionCard key={a.id} action={a} />
                ))}
              </div>
            )}
            <div className="font-display text-[16px] leading-[1.6] text-[var(--fg)]">
              <div className="whitespace-pre-wrap">{msg.content || '…'}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-4 anim-in">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border-2 border-[#1C2340] bg-[#F4EEDF]">
        <Mascot scale={1} expr="thinking" pose="think" animate />
      </div>
      <div className="flex items-center gap-1 py-2">
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

export { MessagesSquare };
