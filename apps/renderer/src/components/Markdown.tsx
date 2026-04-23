import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Check, Copy, Play } from 'lucide-react';
import { cn } from '../lib/cn';

/** Best-effort copy using the Clipboard API. */
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard API unavailable'));
}

/** Parse a simple CSV (no escaped newlines inside quoted fields) into a
 *  2-D array of cells. Good enough for the model-generated CSVs we render. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') {
          inQuote = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function CsvPreview({ text }: { text: string }) {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="max-h-72 overflow-auto rounded border border-[var(--line)]">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-left font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="odd:bg-[var(--surface)] even:bg-[var(--surface-2)]/40">
              {r.map((c, j) => (
                <td key={j} className="border-b border-[var(--line)]/60 px-2 py-1 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // rehype-highlight adds `hljs language-X` classes; we also want the raw text
  // for copy + the language label.
  const lang = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? '';
  const raw = String(
    Array.isArray(children)
      ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
      : children ?? '',
  );
  const [copied, setCopied] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewCsv, setPreviewCsv] = useState(false);
  const [prettyJson, setPrettyJson] = useState<string | null>(null);
  const isHtml = /^(html|xml|svg)$/.test(lang);
  const isCsv = lang === 'csv' || lang === 'tsv';
  const isJson = lang === 'json';

  const tryPrettyJson = () => {
    if (prettyJson !== null) {
      setPrettyJson(null);
      return;
    }
    try {
      setPrettyJson(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      setPrettyJson(raw);
    }
  };

  return (
    <div className="tick-frame group/code relative my-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-white/5 bg-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
        <div className="flex items-center gap-2">
          <span className="inline-block h-px w-3 bg-[var(--primary)]/70" />
          <span>{lang || 'text'}</span>
        </div>
        <div className="flex items-center gap-1">
          {isHtml && (
            <button
              onClick={() =>
                setPreviewHtml((cur) => (cur === null ? raw : null))
              }
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title={previewHtml !== null ? 'Hide preview' : 'Preview'}
            >
              <Play className="h-3 w-3" />
              {previewHtml !== null ? 'hide' : 'preview'}
            </button>
          )}
          {isCsv && (
            <button
              onClick={() => setPreviewCsv((v) => !v)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title={previewCsv ? 'Hide table' : 'Show table'}
            >
              <Play className="h-3 w-3" />
              {previewCsv ? 'hide' : 'table'}
            </button>
          )}
          {isJson && (
            <button
              onClick={tryPrettyJson}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title={prettyJson !== null ? 'Hide formatted' : 'Format'}
            >
              <Play className="h-3 w-3" />
              {prettyJson !== null ? 'raw' : 'format'}
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await copyToClipboard(raw);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {
                /* ignore */
              }
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Copy"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="m-0 overflow-x-auto bg-[#0d1117] p-3 text-[12.5px] leading-[1.5]">
        <code className={className}>{prettyJson ?? children}</code>
      </pre>
      {previewHtml !== null && (
        <div className="border-t border-white/5 bg-[var(--surface)] p-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
            preview
          </div>
          <iframe
            srcDoc={previewHtml}
            sandbox=""
            className="h-56 w-full rounded border border-[var(--line)] bg-white"
            title="Preview"
          />
        </div>
      )}
      {previewCsv && (
        <div className="border-t border-white/5 bg-[var(--surface)] p-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
            table
          </div>
          <CsvPreview text={raw} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a markdown string as rich content: code blocks with copy + HTML
 * preview, tables, task lists, links that open externally, etc.
 *
 * Streaming-safe: re-renders as new tokens arrive; mid-code-fence content
 * just renders as a partial fenced block.
 */
export const Markdown = memo(function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={cn('stark-md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          // Open links in a new window (electron will catch and open in the
          // system browser).
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] underline-offset-2 hover:underline"
            />
          ),
          code: ({ className, children, ...rest }) => {
            // Inline code vs. block is distinguished by presence of newline
            // OR a language class (fenced blocks get `language-x`).
            const text = String(children);
            const isBlock =
              /language-/.test(className ?? '') || text.includes('\n');
            if (!isBlock) {
              return (
                <code
                  className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[12.5px] text-[var(--fg)]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded border border-[var(--line)]">
              <table className="w-full text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[var(--line)] px-3 py-1.5 align-top">
              {children}
            </td>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-[1.55]">{children}</li>,
          h1: ({ children }) => (
            <h1 className="font-display mt-4 mb-2 text-2xl">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-display mt-4 mb-2 text-xl">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-display mt-3 mb-1.5 text-lg">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-[var(--primary)]/60 pl-3 text-[var(--fg-muted)]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-[var(--line)]" />,
          p: ({ children }) => <p className="my-1.5 leading-[1.6]">{children}</p>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
