import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Square,
  RotateCcw,
  MessagesSquare,
  Search,
  Pin,
  Trash2,
  Download,
  Copy,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Camera,
  Mic,
  MicOff,
} from 'lucide-react';
import { createVoiceRecorder, blobToBase64 } from '../../lib/voice';
import { useSession } from '../../stores/session';
import { call, stream } from '../../lib/rpc';
import { cn } from '../../lib/cn';
import type { Action, Attachment, ChatMessage, Thread } from '@shared/rpc';
import { Button } from '../../components/ui/Button';
import { Kbd, Dot } from '../../components/ui/Atoms';
import { Mascot } from '../../components/Mascot';
import { useToast } from '../../components/ui/Toast';
import { ActionCard } from '../../components/ActionCard';
import { Input } from '../../components/ui/Input';
import { Markdown } from '../../components/Markdown';
import { InlineProfileSwitcher } from '../../components/InlineProfileSwitcher';
import { relTime } from '../../lib/time';

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
  const activeProvider = useSession((s) => s.activeProvider);
  const activeProfile = useSession((s) => s.activeProfile);
  const append = useSession((s) => s.appendMessage);
  const update = useSession((s) => s.updateLastAssistantMessage);
  const patch = useSession((s) => s.patchAssistantDelta);
  const setStreaming = useSession((s) => s.setStreaming);
  const reset = useSession((s) => s.resetThread);
  const truncate = useSession((s) => s.truncateMessages);
  const editUserMessage = useSession((s) => s.editUserMessage);
  const userName = useSession((s) => s.userName);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadQuery, setThreadQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    (Thread & { match?: { where: string; snippet: string; message_index?: number } })[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);
  const [openedSessionId, setOpenedSessionId] = useState<string | null>(null);
  const pushToast = useToast((s) => s.push);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    async (
      content: string,
      opts?: { alreadyAppended?: boolean; attachments?: Attachment[] },
    ) => {
      const text = content.trim();
      const atts = opts?.attachments ?? pendingAttachments;
      if ((!text && atts.length === 0) || streaming) return;
      if (text === '/new') {
        reset();
        setDraft('');
        return;
      }
      if (!opts?.alreadyAppended) {
        append({
          id: `u${Date.now()}`,
          role: 'user',
          content: text,
          createdAt: Date.now(),
          attachments: atts.length > 0 ? atts : undefined,
        });
      }
      setDraft('');
      setPendingAttachments([]);
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
            attachments: atts.length > 0 ? atts : undefined,
          },
        },
        (chunk) => {
          if (chunk.type === 'token') {
            patch(chunk.delta);
          } else if (chunk.type === 'action') {
            update((m) => ({ ...m, actions: [...(m.actions ?? []), chunk.action] }));
          } else if (chunk.type === 'action-update') {
            update((m) => ({
              ...m,
              actions: (m.actions ?? []).map((a) => (a.id === chunk.id ? { ...a, ...chunk.patch } : a)),
            }));
          } else if (chunk.type === 'session') {
            // Arrives up-front so Cancel can work mid-turn on brand-new sessions.
            setOpenedSessionId(chunk.sessionId);
          } else if (chunk.type === 'done') {
            if (chunk.sessionId) setOpenedSessionId(chunk.sessionId);
            if (chunk.usage) {
              update((m) => ({ ...m, usage: chunk.usage }));
            }
            void loadThreads();
          } else if (chunk.type === 'error') {
            patch(`\n\n⚠️ ${chunk.message}`);
            pushToast({ kind: 'error', title: 'Hermes failed', description: chunk.message });
            setStreaming(false);
          }
        },
        () => setStreaming(false),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, activeProvider, activeProfile, openedSessionId, pendingAttachments],
  );

  const cancel = useCallback(() => {
    // First, tell the ACP agent to abort its turn so we stop burning tokens.
    // Only after that do we close the SSE stream — otherwise the agent keeps
    // running to completion and the next turn has to wait behind it.
    if (openedSessionId) {
      void call({
        method: 'POST',
        path: '/chat/cancel',
        body: { session_id: openedSessionId, profile: activeProfile },
      });
    }
    cancelRef.current?.();
    setStreaming(false);
  }, [setStreaming, openedSessionId, activeProfile]);

  const newThread = useCallback(() => {
    cancelRef.current?.();
    setOpenedSessionId(null);
    setPendingAttachments([]);
    reset();
  }, [reset]);

  /** Read a File off a drop/paste/picker and turn it into an Attachment. */
  const ingestFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, 6); // cap burst to keep the UI sane
      const next: Attachment[] = [];
      for (const f of list) {
        if (f.size > 8 * 1024 * 1024) {
          pushToast({
            kind: 'info',
            title: `${f.name} is too large`,
            description: 'Attachments must be under 8MB.',
          });
          continue;
        }
        const mime = f.type || 'application/octet-stream';
        const isImage = mime.startsWith('image/');
        const isText =
          mime.startsWith('text/') ||
          /\.(md|json|ya?ml|toml|csv|txt|log|ts|tsx|js|jsx|py|go|rs|sh)$/i.test(f.name);
        try {
          let data: string;
          if (isImage) {
            data = await fileToBase64(f);
          } else if (isText) {
            data = await f.text();
          } else {
            data = await fileToBase64(f); // keep bytes, server will mention
          }
          next.push({
            id: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: f.name,
            mime,
            size: f.size,
            kind: isImage ? 'image' : 'file',
            data,
            preview: isText ? data.slice(0, 140) : undefined,
          });
        } catch (err) {
          pushToast({
            kind: 'error',
            title: `Failed to read ${f.name}`,
            description: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (next.length) setPendingAttachments((cur) => [...cur, ...next]);
    },
    [pushToast],
  );

  const removeAttachment = useCallback(
    (id: string) => setPendingAttachments((cur) => cur.filter((a) => a.id !== id)),
    [],
  );

  // --- Voice input ---
  const voiceRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(null);
  const [recording, setRecording] = useState(false);
  const toggleVoice = useCallback(async () => {
    // Start: lazily construct the recorder so we don't request mic permission
    // on mount. Stop: produce a Blob and push as an audio attachment.
    if (!recording) {
      try {
        const rec = createVoiceRecorder();
        voiceRef.current = rec;
        await rec.start();
        setRecording(true);
      } catch (err) {
        pushToast({
          kind: 'error',
          title: 'Mic unavailable',
          description: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    const rec = voiceRef.current;
    if (!rec) {
      setRecording(false);
      return;
    }
    try {
      const blob = await rec.stop();
      setRecording(false);
      if (blob.size === 0) return;
      const data = await blobToBase64(blob);
      const sec = Math.max(1, Math.round(blob.size / 16000)); // rough estimate
      setPendingAttachments((cur) => [
        ...cur,
        {
          id: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `voice_${sec}s.webm`,
          mime: blob.type || 'audio/webm',
          size: blob.size,
          kind: 'audio',
          data,
        },
      ]);
    } catch (err) {
      setRecording(false);
      pushToast({
        kind: 'error',
        title: 'Recording failed',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [recording, pushToast]);

  /** Capture the desktop via the main process and attach it as a screenshot. */
  const captureScreenshot = useCallback(async () => {
    const api = window.stark.capture;
    if (!api?.screen) {
      pushToast({ kind: 'error', title: 'Screenshot unsupported' });
      return;
    }
    try {
      const r = await api.screen();
      if (!r.ok) {
        pushToast({
          kind: 'error',
          title: 'Screenshot failed',
          description: r.error,
        });
        return;
      }
      const id = `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const sizeBytes = Math.ceil((r.dataBase64.length * 3) / 4);
      const now = new Date();
      const stamp = `${now.getHours().toString().padStart(2, '0')}${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
      setPendingAttachments((cur) => [
        ...cur,
        {
          id,
          name: `screenshot_${stamp}.png`,
          mime: r.mime,
          size: sizeBytes,
          kind: 'screenshot',
          data: r.dataBase64,
        },
      ]);
    } catch (err) {
      pushToast({
        kind: 'error',
        title: 'Screenshot failed',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [pushToast]);

  /** Re-run the last user prompt: drop the trailing assistant reply and resubmit. */
  const regenerate = useCallback(
    (assistantIndex: number) => {
      if (streaming) return;
      // Find the user message directly above this assistant reply.
      let userIdx = assistantIndex - 1;
      while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx -= 1;
      if (userIdx < 0) return;
      const prompt = messages[userIdx].content;
      // Drop the assistant message (and any later messages) and resubmit.
      truncate(assistantIndex);
      // Ensure cancel is dispatched in case a stale stream is still open.
      cancelRef.current?.();
      void submit(prompt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, messages, truncate],
  );

  /** Edit a user message in place: truncate everything after it and resubmit. */
  const editAndResend = useCallback(
    (userIndex: number, newContent: string) => {
      if (streaming) return;
      const msg = messages[userIndex];
      if (!msg) return;
      editUserMessage(msg.id, newContent);
      // Drop everything after this user message so the re-prompt looks clean.
      truncate(userIndex + 1);
      cancelRef.current?.();
      void submit(newContent, { alreadyAppended: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, messages, editUserMessage, truncate],
  );

  /** Copy the full thread as markdown. */
  const copyThreadMarkdown = useCallback(async () => {
    const md = formatThreadMarkdown(messages);
    try {
      await navigator.clipboard.writeText(md);
      pushToast({ kind: 'success', title: 'Copied', description: 'Thread copied as markdown.' });
    } catch {
      pushToast({ kind: 'error', title: 'Copy failed' });
    }
  }, [messages, pushToast]);

  /** Export thread to a .md file via a blob download. */
  const exportThread = useCallback(() => {
    const md = formatThreadMarkdown(messages);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `stark-thread-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages]);

  // Pane-scoped hotkeys. We don't register these globally because they only
  // make sense when Threads is the active view.
  //   Esc    – stop streaming, or clear the composer if idle
  //   ⌘⇧C    – copy full thread as markdown
  //   ⌘⇧E    – export full thread as .md
  //   ⌘↑     – focus the composer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (streaming) {
          e.preventDefault();
          cancel();
        } else if (draft) {
          e.preventDefault();
          setDraft('');
        }
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.shiftKey && e.key.toLowerCase() === 'c' && messages.length > 0) {
        e.preventDefault();
        void copyThreadMarkdown();
      } else if (e.shiftKey && e.key.toLowerCase() === 'e' && messages.length > 0) {
        e.preventDefault();
        exportThread();
      } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey) {
        // ⌘↑ — jump focus back to the composer.
        e.preventDefault();
        textRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [streaming, draft, messages.length, cancel, copyThreadMarkdown, exportThread]);

  // Debounced server-side search. Below 2 chars we fall back to a local filter
  // so the sidebar is instant on short queries. At 2+ chars we hit
  // /sessions/search, which reads message bodies to find deep matches.
  useEffect(() => {
    const raw = threadQuery.trim();
    if (raw.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(async () => {
      const r = await call<{
        results: (Thread & { match?: { where: string; snippet: string; message_index?: number } })[];
      }>({
        method: 'GET',
        path: '/sessions/search',
        query: {
          q: raw,
          ...(activeProfile ? { profile: activeProfile } : {}),
          limit: '30',
        },
      });
      if (r.ok && r.data) setSearchResults(r.data.results);
      setSearching(false);
    }, 220);
    return () => {
      window.clearTimeout(handle);
    };
  }, [threadQuery, activeProfile]);

  const q = threadQuery.trim();
  const filteredThreads: (Thread & {
    match?: { where: string; snippet: string; message_index?: number };
  })[] =
    q.length >= 2
      ? searchResults
      : q
        ? threads.filter((t) =>
            (t.title + ' ' + t.preview).toLowerCase().includes(q.toLowerCase()),
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
          {searching && q.length >= 2 && (
            <div className="px-4 pb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
              Searching…
            </div>
          )}
          {filteredThreads.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-[var(--fg-muted)]">
              {q.length >= 2 ? (searching ? ' ' : `No matches for “${q}”.`) : 'No threads yet.'}
            </div>
          ) : (
            <ul className="stagger px-2">
              {filteredThreads.map((t) => {
                const opened = t.id === openedSessionId;
                const loading = t.id === loadingSession;
                const match = t.match;
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
                          <div className="truncate text-[13px]">{highlight(t.title, q)}</div>
                          {t.pinned && <Pin className="h-2.5 w-2.5 text-[var(--accent-signal)]" />}
                        </div>
                        {match?.snippet ? (
                          <div className="line-clamp-2 text-[11px] text-[var(--fg-muted)]">
                            {highlight(match.snippet, q)}
                          </div>
                        ) : (
                          <div className="truncate text-[11px] text-[var(--fg-muted)]">
                            {highlight(t.preview, q)}
                          </div>
                        )}
                        <div className="font-mono mt-0.5 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                          <span>{relTime(t.updated_at * 1000)}</span>
                          {(t as Thread & { source?: string }).source && (
                            <span className="rounded bg-[var(--surface-2)] px-1 py-px">{(t as Thread & { source?: string }).source}</span>
                          )}
                          {match && match.where.startsWith('message:') && (
                            <span className="rounded bg-[var(--primary-wash)] px-1 py-px text-[var(--primary)]">
                              match
                            </span>
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
      <div
        className={cn(
          'stark-bg relative flex min-w-0 flex-1 flex-col',
          dragOver && 'ring-2 ring-[var(--primary)]/70 ring-inset',
        )}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          void ingestFiles(e.dataTransfer.files);
        }}
      >
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
                  leading={<Copy className="h-3 w-3" />}
                  onClick={() => void copyThreadMarkdown()}
                  title="Copy thread as markdown"
                >
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<Download className="h-3 w-3" />}
                  onClick={exportThread}
                  title="Export thread as .md"
                >
                  Export
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" leading={<Trash2 className="h-3 w-3" />} onClick={newThread}>
              Clear
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
          {messages.length === 0 && <EmptyThread ready={agentReady} />}
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m, i) => (
              <Message
                key={m.id}
                msg={m}
                onEdit={
                  m.role === 'user' && !streaming
                    ? (next) => editAndResend(i, next)
                    : undefined
                }
                onRegenerate={
                  m.role === 'assistant' && !streaming && i === messages.length - 1
                    ? () => regenerate(i)
                    : undefined
                }
                canRegenerate={m.role === 'assistant' && !streaming && i === messages.length - 1}
              />
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
            {pendingAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingAttachments.map((att) => (
                  <AttachmentChip
                    key={att.id}
                    att={att}
                    onRemove={() => removeAttachment(att.id)}
                  />
                ))}
              </div>
            )}
            <div
              className={cn(
                'flex items-end gap-2 rounded-[var(--radius-lg)] border bg-[var(--surface)] px-3 py-2.5 transition-colors',
                draft || pendingAttachments.length > 0
                  ? 'border-[var(--primary)] shadow-[0_0_0_3px_var(--primary-wash)]'
                  : 'border-[var(--line)]',
              )}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!agentReady}
                title="Attach image or file"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void captureScreenshot()}
                disabled={!agentReady}
                title="Capture screenshot"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-40"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void toggleVoice()}
                disabled={!agentReady}
                title={recording ? 'Stop recording' : 'Record voice message'}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors disabled:opacity-40',
                  recording
                    ? 'bg-[var(--bad-wash)] text-[var(--bad)] animate-[stark-pulse_1.6s_ease-in-out_infinite]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
                )}
              >
                {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,text/*,.md,.json,.yaml,.yml,.toml,.csv,.txt,.log,.ts,.tsx,.js,.jsx,.py,.go,.rs,.sh,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void ingestFiles(e.target.files);
                  e.target.value = '';
                }}
              />
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
                onPaste={(e) => {
                  const files: File[] = [];
                  for (const item of Array.from(e.clipboardData.items)) {
                    const f = item.getAsFile();
                    if (f) files.push(f);
                  }
                  if (files.length) {
                    e.preventDefault();
                    void ingestFiles(files);
                  }
                }}
                placeholder={agentReady ? 'Type a message, drop files, or / for commands…' : 'Warming up…'}
                disabled={!agentReady}
                rows={1}
                style={{ height: 44 }}
                className="flex-1 resize-none bg-transparent px-1 py-1 text-[14px] outline-none placeholder:text-[var(--fg-ghost)] disabled:opacity-60"
              />
              <button
                onClick={() => void submit(draft)}
                disabled={
                  !agentReady ||
                  (!draft.trim() && pendingAttachments.length === 0) ||
                  streaming
                }
                className={cn(
                  'flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-all',
                  (draft.trim() || pendingAttachments.length > 0) && !streaming
                    ? 'bg-[var(--primary)] text-[var(--primary-ink)] shadow-[0_8px_20px_-10px_var(--primary-glow)] hover:bg-[var(--primary-hover)]'
                    : 'bg-[var(--surface-2)] text-[var(--fg-ghost)]',
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--fg-ghost)]">
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
              <div className="flex items-center gap-2">
                <InlineProfileSwitcher />
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
          ? 'Ask anything. Hermes may use files, the browser, the terminal, memory, the web — every action will appear as a card you can pause or approve.'
          : 'The Hermes engine is warming up. This only takes a moment on first launch.'}
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

function Message({
  msg,
  onEdit,
  onRegenerate,
  canRegenerate,
}: {
  msg: ChatMessage;
  onEdit?: (newContent: string) => void;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [speaking, setSpeaking] = useState(false);
  const pushToast = useToast((s) => s.push);

  const copyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      pushToast({ kind: 'error', title: 'Copy failed', description: 'Clipboard access denied.' });
    }
  }, [msg.content, pushToast]);

  const toggleSpeak = useCallback(async () => {
    const { speak, stopSpeaking, isTtsSupported } = await import('../../lib/tts');
    if (!isTtsSupported()) {
      pushToast({ kind: 'error', title: 'Text-to-speech unsupported' });
      return;
    }
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(msg.content, { onEnd: () => setSpeaking(false) });
  }, [speaking, msg.content, pushToast]);

  return (
    <div className={cn('group/msg flex gap-4 anim-in', isUser && 'justify-end')}>
      {!isUser && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border-2 border-[#1C2340] bg-[#F4EEDF]">
          <Mascot scale={1} expr="happy" pose="idle" accessory="wings" animate />
        </div>
      )}
      <div className={cn('max-w-[82%] min-w-0', isUser && 'max-w-[75%]')}>
        {isUser ? (
          editing ? (
            <div className="rounded-[var(--radius-lg)] rounded-tr-sm border border-[var(--primary)] bg-[var(--primary-wash)] p-2">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(10, Math.max(2, draft.split('\n').length))}
                className="w-full resize-none bg-transparent px-2 py-1 text-[14.5px] leading-relaxed text-[var(--fg)] outline-none"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setDraft(msg.content);
                    setEditing(false);
                  }}
                  className="font-mono rounded px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const next = draft.trim();
                    if (next && next !== msg.content) onEdit?.(next);
                    setEditing(false);
                  }}
                  className="font-mono rounded bg-[var(--primary)] px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--primary-ink)] hover:bg-[var(--primary-hover)]"
                >
                  Resend
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="rounded-[var(--radius-lg)] rounded-tr-sm bg-[var(--primary-wash)] px-4 py-3 text-[14.5px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap">
                {msg.content}
              </div>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  {msg.attachments.map((att) => (
                    <AttachmentThumb key={att.id} att={att} />
                  ))}
                </div>
              )}
              {onEdit && (
                <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-[var(--fg-ghost)] opacity-0 transition-opacity group-hover/msg:opacity-100">
                  <button
                    onClick={() => {
                      setDraft(msg.content);
                      setEditing(true);
                    }}
                    className="font-mono uppercase tracking-[0.14em] hover:text-[var(--fg)]"
                  >
                    edit
                  </button>
                  <span>·</span>
                  <button
                    onClick={copyMessage}
                    className="font-mono uppercase tracking-[0.14em] hover:text-[var(--fg)]"
                  >
                    {copied ? 'copied' : 'copy'}
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="relative">
            {msg.actions && msg.actions.length > 0 && (
              <div className="mb-3 space-y-2">
                {msg.actions.map((a: Action) => (
                  <ActionCard key={a.id} action={a} />
                ))}
              </div>
            )}
            <div className="font-display text-[15.5px] leading-[1.6] text-[var(--fg)]">
              {msg.content ? (
                <Markdown source={msg.content} />
              ) : (
                <span className="text-[var(--fg-ghost)]">…</span>
              )}
            </div>
            {msg.content && (
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--fg-ghost)] opacity-0 transition-opacity group-hover/msg:opacity-100">
                <button
                  onClick={copyMessage}
                  className="font-mono uppercase tracking-[0.14em] hover:text-[var(--fg)]"
                >
                  {copied ? 'copied' : 'copy'}
                </button>
                <span>·</span>
                <button
                  onClick={() => void toggleSpeak()}
                  className={cn(
                    'font-mono uppercase tracking-[0.14em] hover:text-[var(--fg)]',
                    speaking && 'text-[var(--primary)]',
                  )}
                >
                  {speaking ? 'stop' : 'speak'}
                </button>
                {canRegenerate && onRegenerate && (
                  <>
                    <span>·</span>
                    <button
                      onClick={onRegenerate}
                      className="font-mono uppercase tracking-[0.14em] hover:text-[var(--fg)]"
                    >
                      regenerate
                    </button>
                  </>
                )}
                {msg.usage?.totalTokens ? (
                  <>
                    <span>·</span>
                    <span className="font-mono tracking-[0.1em]">
                      {msg.usage.totalTokens.toLocaleString()} tokens
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Wrap substrings that match ``q`` in a <mark> so users can see why a
 *  result came back. Case-insensitive; preserves the original casing of the
 *  source text. */
function highlight(source: string, q: string) {
  if (!source) return source;
  const needle = q.trim();
  if (needle.length < 2) return source;
  const lower = source.toLowerCase();
  const nlow = needle.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < source.length) {
    const hit = lower.indexOf(nlow, i);
    if (hit < 0) {
      parts.push(source.slice(i));
      break;
    }
    if (hit > i) parts.push(source.slice(i, hit));
    parts.push(
      <mark
        key={hit}
        className="rounded-sm bg-[var(--primary)]/25 px-0.5 text-[var(--fg)]"
      >
        {source.slice(hit, hit + needle.length)}
      </mark>,
    );
    i = hit + needle.length;
  }
  return <>{parts}</>;
}

function formatThreadMarkdown(messages: ChatMessage[]): string {
  const lines: string[] = [];
  const d = new Date();
  lines.push(`# Stark Thread — ${d.toLocaleString()}`);
  lines.push('');
  for (const m of messages) {
    if (m.role === 'system') continue;
    const head = m.role === 'user' ? '## You' : '## Hermes';
    lines.push(head);
    lines.push('');
    lines.push(m.content || '_(empty)_');
    lines.push('');
    if (m.usage?.totalTokens) {
      lines.push(`> _${m.usage.totalTokens.toLocaleString()} tokens_`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** Read a File into a base64 string (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('read failed'));
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read error'));
    reader.readAsDataURL(file);
  });
}

/** Small pill in the composer showing a pending attachment with a remove button. */
function AttachmentChip({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  const isImage = att.kind === 'image' || att.kind === 'screenshot';
  const kb = att.size ? Math.max(1, Math.round(att.size / 1024)) : 0;
  return (
    <div className="group relative flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 pr-6 text-[11px] text-[var(--fg-muted)]">
      {isImage && att.data ? (
        <img
          src={`data:${att.mime};base64,${att.data}`}
          alt={att.name}
          className="h-6 w-6 rounded-sm object-cover"
        />
      ) : isImage ? (
        <ImageIcon className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
      ) : (
        <FileText className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
      )}
      <span className="max-w-[12rem] truncate text-[var(--fg)]">{att.name}</span>
      {kb > 0 && <span className="font-mono text-[10px] text-[var(--fg-ghost)]">{kb}KB</span>}
      <button
        onClick={onRemove}
        title="Remove"
        className="absolute top-1 right-1 rounded p-0.5 text-[var(--fg-ghost)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function AttachmentThumb({ att }: { att: { id: string; name: string; mime: string; kind: string; data?: string } }) {
  const isImage = att.kind === 'image' || att.kind === 'screenshot';
  if (isImage && att.data) {
    return (
      <img
        src={`data:${att.mime};base64,${att.data}`}
        alt={att.name}
        className="h-16 w-16 rounded-[var(--radius-sm)] border border-[var(--line)] object-cover"
      />
    );
  }
  return (
    <div className="font-mono rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--fg-muted)]">
      {att.name}
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
