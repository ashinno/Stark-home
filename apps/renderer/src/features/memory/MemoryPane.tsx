import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Library,
  MessagesSquare,
  Pencil,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { SectionHeading, Badge, EmptyState, Dot } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea, Field } from '../../components/ui/Input';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { relTime } from '../../lib/time';
import { useSession } from '../../stores/session';
import { cn } from '../../lib/cn';

type Session = {
  id: string;
  title: string;
  preview: string;
  last_active?: string;
  source?: string;
  updated_at: number;
};

type Note = {
  id: string;
  text: string;
  /** Unix seconds. Missing on notes written before we started tracking. */
  created_at?: number;
  updated_at?: number;
};

/** Emit a short browser download for ``text`` as ``name``. No new deps: uses
 *  a throwaway object URL. Used for pinned-note export. */
function triggerDownload(name: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so Chromium has time to actually start the download.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function MemoryPane() {
  const activeProfile = useSession((s) => s.activeProfile);
  const setRoute = useSession((s) => s.setRoute);
  const setOpenedSession = useSession((s) => s.setActiveThreadId);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState('');
  const [nq, setNq] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const push = useToast((s) => s.push);

  async function loadAll() {
    const r = await call<{ threads: Session[] }>({
      method: 'GET',
      path: '/threads',
      query: activeProfile ? { profile: activeProfile } : undefined,
    });
    if (r.ok && r.data) setSessions(r.data.threads);
    const n = await call<{ notes: Note[] }>({ method: 'GET', path: '/memory/notes' });
    if (n.ok && n.data) setNotes(n.data.notes ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void loadAll();
  }, [activeProfile]);

  const filteredSessions = q.trim()
    ? sessions.filter((s) => (s.title + ' ' + s.preview).toLowerCase().includes(q.toLowerCase()))
    : sessions;

  const filteredNotes = useMemo(() => {
    const needle = nq.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((n) => n.text.toLowerCase().includes(needle));
  }, [notes, nq]);

  async function deleteNote(id: string) {
    await call({ method: 'DELETE', path: `/memory/notes/${id}` });
    await loadAll();
    push({ kind: 'info', title: 'Forgotten' });
  }

  async function updateNote(id: string, text: string) {
    const r = await call<{ note: Note }>({
      method: 'PATCH',
      path: `/memory/notes/${id}`,
      body: { text },
    });
    if (r.ok) {
      await loadAll();
      push({ kind: 'success', title: 'Saved' });
    } else {
      push({ kind: 'error', title: 'Could not save', description: 'Try again?' });
    }
  }

  async function exportNotes() {
    const r = await call<{ exported_at: number; count: number; notes: Note[] }>({
      method: 'GET',
      path: '/memory/notes/export',
    });
    if (!r.ok || !r.data) {
      push({ kind: 'error', title: 'Export failed' });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    triggerDownload(
      `hermes-notes-${stamp}.json`,
      JSON.stringify(r.data, null, 2),
      'application/json',
    );
    push({
      kind: 'success',
      title: 'Exported',
      description: `${r.data.count} note${r.data.count === 1 ? '' : 's'}`,
    });
  }

  function openSession(sid: string) {
    setOpenedSession(sid);
    setRoute('threads');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-8 py-5">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Memory"
            title="What Hermes remembers"
            description="Real sessions across this profile, plus pinned notes that surface in every conversation."
          />
          <div className="w-72">
            <Input
              leading={<Search className="h-3.5 w-3.5" />}
              placeholder="Search sessions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <h2 className="font-mono mb-3 text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
              {q ? `Search · ${filteredSessions.length}` : `Sessions · ${sessions.length}`}
            </h2>
            {loading && filteredSessions.length === 0 ? (
              <EmptyState loading title="" description="" />
            ) : filteredSessions.length === 0 ? (
              <EmptyState
                icon={<Library className="h-5 w-5" />}
                title={q ? 'No matches' : 'No sessions yet'}
                description={
                  q
                    ? 'Try a different phrase.'
                    : 'Conversations will appear here as you talk with Hermes.'
                }
              />
            ) : (
              <div key={q} className="stagger space-y-2">
                {filteredSessions.slice(0, 80).map((s, i) => (
                  <Card
                    key={s.id}
                    interactive
                    style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                    className={cn('group flex items-start gap-3 p-4')}
                    onClick={() => openSession(s.id)}
                  >
                    <div className="mt-1">
                      <Dot tone="dim" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium">{s.title || 'Untitled'}</h3>
                        {s.source && <Badge>{s.source}</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12.5px] text-[var(--fg-muted)]">
                        {s.preview}
                      </p>
                      <div className="font-mono mt-2 flex gap-3 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
                        <span>{relTime(s.updated_at * 1000)}</span>
                        <span>·</span>
                        <span>{s.id}</span>
                      </div>
                    </div>
                    <div className="opacity-0 transition-opacity group-hover:opacity-100">
                      <MessagesSquare className="h-4 w-4 text-[var(--fg-dim)]" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
                Pinned notes · {notes.length}
              </h2>
              <div className="flex items-center gap-1">
                {notes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leading={<Download className="h-3 w-3" />}
                    onClick={() => void exportNotes()}
                    title="Export all pinned notes as JSON"
                  >
                    Export
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<Plus className="h-3 w-3" />}
                  onClick={() => setAdding(true)}
                >
                  Add
                </Button>
              </div>
            </div>
            {notes.length > 2 && (
              <div className="mb-3">
                <Input
                  leading={<Search className="h-3 w-3" />}
                  placeholder="Filter notes…"
                  value={nq}
                  onChange={(e) => setNq(e.target.value)}
                />
              </div>
            )}
            {notes.length === 0 ? (
              <p className="text-xs text-[var(--fg-ghost)]">
                Notes you pin will surface across every session.
              </p>
            ) : filteredNotes.length === 0 ? (
              <p className="text-xs text-[var(--fg-ghost)]">No notes match “{nq}”.</p>
            ) : (
              <div className="stagger space-y-2">
                {filteredNotes.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    onForget={() => void deleteNote(n.id)}
                    onSave={(text) => void updateNote(n.id, text)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {adding && (
        <AddNoteDialog
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await loadAll();
            push({ kind: 'success', title: 'Pinned' });
          }}
        />
      )}
    </div>
  );
}

/**
 * Renders a single pinned note. Double-click (or the pencil button) flips it
 * into an inline edit mode backed by a textarea; Enter saves, Esc cancels.
 */
function NoteRow({
  note,
  onForget,
  onSave,
}: {
  note: Note;
  onForget: () => void;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (editing) setDraft(note.text);
  }, [editing, note.text]);

  const created = note.created_at ? note.created_at * 1000 : null;
  const updated = note.updated_at ? note.updated_at * 1000 : null;
  const wasEdited = created && updated && updated - created > 2;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === note.text) {
      setEditing(false);
      return;
    }
    onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--primary)]/40 bg-[var(--surface)] p-3 ring-1 ring-[var(--primary)]/20">
        <Textarea
          autoFocus
          rows={Math.max(3, Math.min(10, draft.split('\n').length + 1))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => {
            // Put the caret at the end of the existing text rather than at
            // the start so the user can type a continuation.
            const el = e.currentTarget;
            el.setSelectionRange(el.value.length, el.value.length);
          }}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter saves, Esc cancels. Plain Enter just adds a
            // newline so multi-line memories work.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="font-mono text-[12.5px]"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
            ⌘↵ save · esc cancel
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={commit}
              disabled={!draft.trim() || draft.trim() === note.text}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px] transition-colors hover:border-[var(--line-2)]"
      onDoubleClick={() => setEditing(true)}
    >
      <p className="whitespace-pre-wrap text-[var(--fg)]">{note.text}</p>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin className="h-3 w-3 text-[var(--accent-signal)]" />
          {created && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
              {relTime(created)}
              {wasEdited ? ' · edited' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={copyText}
            className="rounded p-1 text-[var(--fg-ghost)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-[var(--fg-ghost)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onForget}
            className="rounded p-1 text-[var(--fg-ghost)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--bad)]"
            title="Forget"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddNoteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Pin a memory" description="Hermes will see this in every session.">
      <Field label="Memory">
        <Textarea
          rows={4}
          placeholder="e.g. I prefer concise replies."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={saving}
          disabled={!text.trim()}
          onClick={async () => {
            setSaving(true);
            await call({ method: 'POST', path: '/memory/notes', body: { text } });
            setSaving(false);
            await onSaved();
          }}
        >
          Remember
        </Button>
      </div>
    </Dialog>
  );
}
