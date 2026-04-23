import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge, EmptyState } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Input';
import { TabStrip, type Tab as TabDef } from '../../components/ui/TabStrip';
import { useToast } from '../../components/ui/Toast';
import { call } from '../../lib/rpc';
import { cn } from '../../lib/cn';

type InstalledServer = {
  id: string;
  name: string;
  url: string;
  description?: string;
  category?: string;
  install_hint?: string;
  enabled: boolean;
  tools?: number;
  source?: string;
};

type GalleryItem = {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string;
  tag: string;
  install_hint: string;
  installed: boolean;
};

type GalleryResponse = {
  items: GalleryItem[];
  categories: string[];
  total: number;
};

const MCP_TABS: readonly TabDef<'installed' | 'gallery'>[] = [
  { id: 'installed', label: 'Installed' },
  { id: 'gallery', label: 'Gallery' },
];

/**
 * Richer MCP management surface that replaces the bare list-with-configure
 * view. Has two tabs:
 *   • Installed — servers currently wired up. Toggle on/off, remove, see url.
 *   • Gallery — curated starter set. One-click add into the Installed tab.
 *
 * The sidecar already handles de-dup (by url) so pressing "Add" on a gallery
 * entry twice is safe; it just re-enables the existing row.
 */
export function McpGalleryTab() {
  const [tab, setTab] = useState<'installed' | 'gallery'>('installed');
  const [servers, setServers] = useState<InstalledServer[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['all']);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const push = useToast((s) => s.push);

  async function loadInstalled() {
    const r = await call<{ servers: InstalledServer[] }>({ method: 'GET', path: '/mcp' });
    if (r.ok && r.data) setServers(r.data.servers ?? []);
  }

  async function loadGallery() {
    const q: Record<string, string> = {};
    if (category && category !== 'all') q.category = category;
    if (query.trim()) q.q = query.trim();
    const r = await call<GalleryResponse>({ method: 'GET', path: '/mcp/gallery', query: q });
    if (r.ok && r.data) {
      setGallery(r.data.items);
      if (r.data.categories) setCategories(r.data.categories);
    }
  }

  // First mount: pull both. Subsequent mounts rely on the effects below.
  useEffect(() => {
    void loadInstalled();
    void loadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gallery re-queries when filters change so the server does the work.
  useEffect(() => {
    if (tab === 'gallery') void loadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, tab]);

  async function installFromGallery(item: GalleryItem) {
    setBusy(item.id);
    const r = await call<{ server: InstalledServer }>({
      method: 'POST',
      path: '/mcp/gallery/install',
      body: { id: item.id },
    });
    setBusy(null);
    if (!r.ok) {
      push({ kind: 'error', title: 'Install failed', description: r.error });
      return;
    }
    push({ kind: 'success', title: `${item.name} added`, description: 'Server queued in the Installed tab.' });
    await Promise.all([loadInstalled(), loadGallery()]);
  }

  async function toggle(sid: string) {
    setBusy(sid);
    const r = await call({ method: 'POST', path: `/mcp/${sid}/toggle` });
    setBusy(null);
    if (!r.ok) push({ kind: 'error', title: 'Toggle failed' });
    await loadInstalled();
  }

  async function remove(sid: string) {
    setBusy(sid);
    const r = await call({ method: 'DELETE', path: `/mcp/${sid}` });
    setBusy(null);
    if (!r.ok) push({ kind: 'error', title: 'Remove failed' });
    await Promise.all([loadInstalled(), loadGallery()]);
  }

  function onGallerySearch(e: FormEvent) {
    e.preventDefault();
    void loadGallery();
  }

  const galleryFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return gallery;
    return gallery.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        i.description.toLowerCase().includes(needle) ||
        i.id.toLowerCase().includes(needle),
    );
  }, [gallery, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-[var(--fg-muted)]">
          <Plug className="h-3.5 w-3.5" />
          <span>
            {servers.length} installed · {gallery.length} in gallery
          </span>
        </div>
        <Button
          size="sm"
          variant="primary"
          leading={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setManualOpen(true)}
        >
          Add by URL
        </Button>
      </div>

      <div className="-mb-2">
        <TabStrip tabs={MCP_TABS} active={tab} onSelect={setTab} />
      </div>

      {tab === 'installed' ? (
        servers.length === 0 ? (
          <EmptyState
            icon={<Plug className="h-5 w-5" />}
            title="No MCP servers yet"
            description="Pick one from the Gallery tab or paste a URL via Add."
            action={
              <Button variant="primary" size="sm" onClick={() => setTab('gallery')}>
                Browse gallery
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {servers.map((s) => (
              <InstalledRow
                key={s.id}
                server={s}
                busy={busy === s.id}
                onToggle={() => toggle(s.id)}
                onRemove={() => remove(s.id)}
              />
            ))}
          </div>
        )
      ) : (
        <div>
          <form
            onSubmit={onGallerySearch}
            className="mb-3 flex flex-col gap-2 md:flex-row md:items-center"
          >
            <Input
              leading={<Search className="h-4 w-4" />}
              placeholder="Filter gallery…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--fg)] outline-none hover:border-[var(--line-strong)] focus:border-[var(--primary)] focus:[box-shadow:var(--ring-focus)]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leading={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void loadGallery()}
            >
              Refresh
            </Button>
          </form>
          {galleryFiltered.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No matches"
              description="Try a different filter or category."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {galleryFiltered.map((item) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  busy={busy === item.id}
                  onInstall={() => installFromGallery(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {manualOpen && (
        <AddManualDialog
          onClose={() => setManualOpen(false)}
          onAdded={async () => {
            setManualOpen(false);
            await loadInstalled();
          }}
        />
      )}
    </div>
  );
}

function InstalledRow({
  server,
  busy,
  onToggle,
  onRemove,
}: {
  server: InstalledServer;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(server.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
            server.enabled
              ? 'bg-[var(--primary-wash)] text-[var(--primary)]'
              : 'bg-[var(--surface-2)] text-[var(--fg-dim)]',
          )}
        >
          <Plug className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{server.name}</span>
            <Badge tone={server.enabled ? 'ok' : 'neutral'}>
              {server.enabled ? 'on' : 'off'}
            </Badge>
            {typeof server.tools === 'number' && server.tools > 0 && (
              <Badge tone="neutral">{server.tools} tools</Badge>
            )}
            {server.category && <Badge tone="neutral">{server.category}</Badge>}
            {server.source === 'gallery' && <Badge tone="primary">gallery</Badge>}
          </div>
          {server.description && (
            <p className="mt-1.5 text-[12.5px] text-[var(--fg-muted)]">{server.description}</p>
          )}
          <div className="font-mono mt-2 flex items-center gap-1.5 text-[10.5px] text-[var(--fg-ghost)]">
            <span className="truncate">{server.url}</span>
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 rounded p-0.5 text-[var(--fg-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
              title={copied ? 'Copied' : 'Copy url'}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          {server.install_hint && (
            <p className="font-mono mt-1 text-[10.5px] italic text-[var(--fg-ghost)]">
              $ {server.install_hint}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggle}
            loading={busy}
            disabled={busy}
          >
            {server.enabled ? 'Disable' : 'Enable'}
          </Button>
          <button
            onClick={onRemove}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-dim)] transition-colors hover:bg-[var(--bad-wash)] hover:text-[var(--bad)] disabled:opacity-40"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function GalleryCard({
  item,
  busy,
  onInstall,
}: {
  item: GalleryItem;
  busy: boolean;
  onInstall: () => void;
}) {
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)]">
            <Plug className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{item.name}</span>
              {item.tag === 'official' && <Badge tone="primary">official</Badge>}
              <Badge tone="neutral">{item.category}</Badge>
              {item.installed && <Badge tone="ok">installed</Badge>}
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
              {item.description}
            </p>
            <div className="font-mono mt-2 truncate text-[10.5px] text-[var(--fg-ghost)]">
              {item.id}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-4 py-2.5">
        <Button
          size="sm"
          variant={item.installed ? 'secondary' : 'primary'}
          leading={<Plus className="h-3.5 w-3.5" />}
          loading={busy}
          disabled={busy}
          onClick={onInstall}
        >
          {item.installed ? 'Re-enable' : 'Add'}
        </Button>
      </div>
    </Card>
  );
}

function AddManualDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const push = useToast((s) => s.push);

  async function save() {
    setSaving(true);
    const r = await call({ method: 'POST', path: '/mcp', body: { name, url } });
    setSaving(false);
    if (!r.ok) {
      push({ kind: 'error', title: 'Could not add server' });
      return;
    }
    push({ kind: 'success', title: 'Server added' });
    await onAdded();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add MCP server"
      description="Point Stark at a running MCP server by URL. stdio:// for npm launchers, https:// for hosted."
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My data source"
            autoFocus
          />
        </Field>
        <Field label="URL" hint="stdio://package or https://host">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="stdio://@modelcontextprotocol/server-filesystem"
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          disabled={!name.trim() || !url.trim()}
          onClick={save}
        >
          Add server
        </Button>
      </div>
    </Dialog>
  );
}
