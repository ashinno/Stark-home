import { useEffect, useState } from 'react';
import { Library, Pin, Plus, Search, MessagesSquare } from 'lucide-react';
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
type Note = { id: string; text: string };

export function MemoryPane() {
  const activeProfile = useSession((s) => s.activeProfile);
  const setRoute = useSession((s) => s.setRoute);
  const setOpenedSession = useSession((s) => s.setActiveThreadId);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState('');
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

  const filtered = q.trim()
    ? sessions.filter((s) => (s.title + ' ' + s.preview).toLowerCase().includes(q.toLowerCase()))
    : sessions;

  async function deleteNote(id: string) {
    await call({ method: 'DELETE', path: `/memory/notes/${id}` });
    await loadAll();
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
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
          <section>
            <h2 className="font-mono mb-3 text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
              {q ? `Search · ${filtered.length}` : `Sessions · ${sessions.length}`}
            </h2>
            {loading && filtered.length === 0 ? (
              <EmptyState loading title="" description="" />
            ) : filtered.length === 0 ? (
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
                {filtered.slice(0, 80).map((s, i) => (
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
                Pinned notes · {notes.length}
              </h2>
              <Button variant="ghost" size="sm" leading={<Plus className="h-3 w-3" />} onClick={() => setAdding(true)}>
                Add
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-xs text-[var(--fg-ghost)]">
                Notes you pin will surface across every session.
              </p>
            ) : (
              <div className="stagger space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="group rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px]"
                  >
                    <p className="text-[var(--fg)]">{n.text}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Pin className="h-3 w-3 text-[var(--accent-signal)]" />
                      <button
                        onClick={() => void deleteNote(n.id)}
                        className="text-[10px] uppercase tracking-[0.15em] text-[var(--fg-ghost)] opacity-0 transition-opacity hover:text-[var(--bad)] group-hover:opacity-100"
                      >
                        forget
                      </button>
                    </div>
                  </div>
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
