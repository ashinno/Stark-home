import type { SidecarRequest, SidecarResponse, StreamChunk } from '@shared/rpc';

export async function call<T = unknown>(req: SidecarRequest): Promise<SidecarResponse<T>> {
  return window.stark.sidecar.request<T>(req);
}

export function stream(
  req: SidecarRequest,
  onChunk: (c: StreamChunk) => void,
  onEnd?: (reason?: string) => void,
): () => void {
  return window.stark.sidecar.stream(req, (e) => {
    if (e.type === 'data') {
      try {
        onChunk(JSON.parse(e.chunk) as StreamChunk);
      } catch {
        onChunk({ type: 'token', delta: e.chunk });
      }
    } else if (e.type === 'end') {
      onEnd?.();
    } else if (e.type === 'error') {
      onChunk({ type: 'error', message: e.message });
      onEnd?.(e.message);
    }
  });
}
