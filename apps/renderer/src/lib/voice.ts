/**
 * Minimal voice-capture helper built on the browser's MediaRecorder API.
 *
 * We record to webm/opus (or whatever the UA prefers), dump the bytes into a
 * single Blob on stop, and let callers decide what to do with it. The sidecar
 * can attach it to a chat message as an audio attachment — models that
 * support audio input (Gemini, some Claude paths) will ingest it directly.
 *
 * This file intentionally avoids imports so it's cheap to include from any
 * component that wants mic capture.
 */

export type VoiceRecorder = {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  cancel(): void;
  get state(): 'idle' | 'recording' | 'stopping';
};

/** Pick the best MIME type the UA will record natively. */
function pickMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

export function createVoiceRecorder(): VoiceRecorder {
  let stream: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let state: 'idle' | 'recording' | 'stopping' = 'idle';

  async function start() {
    if (state !== 'idle') return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.start();
    state = 'recording';
  }

  function stop(): Promise<Blob> {
    if (state !== 'recording' || !rec) return Promise.resolve(new Blob());
    state = 'stopping';
    return new Promise((resolve) => {
      rec!.onstop = () => {
        const mime = rec!.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        cleanup();
        resolve(blob);
      };
      rec!.stop();
    });
  }

  function cancel() {
    if (rec && state === 'recording') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
  }

  function cleanup() {
    state = 'idle';
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    rec = null;
    chunks = [];
  }

  return {
    start,
    stop,
    cancel,
    get state() {
      return state;
    },
  };
}

/** Convert a Blob to base64 (no `data:` prefix). Used for attachments. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const v = reader.result;
      if (typeof v !== 'string') return reject(new Error('read failed'));
      const comma = v.indexOf(',');
      resolve(comma >= 0 ? v.slice(comma + 1) : v);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read error'));
    reader.readAsDataURL(blob);
  });
}
