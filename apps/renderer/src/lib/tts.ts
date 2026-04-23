/**
 * Thin wrapper around the browser's SpeechSynthesis API.
 *
 * We keep a single in-flight utterance so UI "speak" buttons act as a toggle:
 * clicking one stops the previous and starts the new one. No new deps — this
 * is all built into Chromium, so it works in the Electron renderer as-is.
 */

type SpeakHandle = {
  stop(): void;
};

let current: { utter: SpeechSynthesisUtterance; onEnd?: () => void } | null = null;

function cleanup() {
  current = null;
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

export function stopSpeaking() {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
  cleanup();
}

export function isCurrentlySpeaking(): boolean {
  return isTtsSupported() && window.speechSynthesis.speaking;
}

/**
 * Speak ``text`` through the current default voice. Returns a handle whose
 * ``stop()`` method cancels playback. If another utterance is already
 * playing, it is cancelled first.
 */
export function speak(text: string, opts?: { onEnd?: () => void }): SpeakHandle {
  if (!isTtsSupported() || !text.trim()) {
    opts?.onEnd?.();
    return { stop() {} };
  }
  // Strip markdown-ish noise so the voice doesn't read asterisks, hashes, etc.
  const sanitized = text
    .replace(/```[\s\S]*?```/g, ' ') // drop code blocks entirely
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/>\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  stopSpeaking();
  const utter = new SpeechSynthesisUtterance(sanitized);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.onend = () => {
    if (current?.utter === utter) cleanup();
    opts?.onEnd?.();
  };
  utter.onerror = () => {
    if (current?.utter === utter) cleanup();
    opts?.onEnd?.();
  };
  current = { utter, onEnd: opts?.onEnd };
  window.speechSynthesis.speak(utter);
  return {
    stop() {
      if (current?.utter === utter) {
        window.speechSynthesis.cancel();
        cleanup();
      }
    },
  };
}
