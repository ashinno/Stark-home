import type { ChatMessage } from '@shared/rpc';

type ExportFormat = 'markdown' | 'json';

function filenameFor(format: ExportFormat) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = format === 'markdown' ? 'md' : 'json';
  return `stark-thread-${stamp}.${ext}`;
}

export function threadToMarkdown(messages: ChatMessage[], title?: string): string {
  const head = title ? `# ${title}\n\n` : '# Stark thread\n\n';
  const body = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const who = m.role === 'user' ? '**You**' : '**Stark**';
      return `${who}\n\n${m.content}\n`;
    })
    .join('\n---\n\n');
  return head + body + '\n';
}

export function threadToJSON(messages: ChatMessage[], title?: string): string {
  return JSON.stringify(
    {
      title: title ?? 'Stark thread',
      exported_at: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
      })),
    },
    null,
    2,
  );
}

export function downloadThread(
  messages: ChatMessage[],
  format: ExportFormat,
  title?: string,
) {
  const text = format === 'markdown' ? threadToMarkdown(messages, title) : threadToJSON(messages, title);
  const blob = new Blob([text], {
    type: format === 'markdown' ? 'text/markdown' : 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFor(format);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyThread(messages: ChatMessage[], title?: string): Promise<void> {
  await navigator.clipboard.writeText(threadToMarkdown(messages, title));
}
