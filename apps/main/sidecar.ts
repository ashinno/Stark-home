import { spawn, ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import type { SidecarRequest, SidecarResponse, SidecarStatus } from '@shared/rpc';

type Events = { status: (s: SidecarStatus) => void };

/**
 * SidecarManager — runs the Stark ↔ Hermes FastAPI bridge.
 *
 * In dev: uses the local venv + sidecar/ source tree.
 * In production: uses the Hermes install placed in
 *   ~/Library/Application Support/Hermes/ by the Installer.
 */
export class SidecarManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private port: number | null = null;
  private token = '';
  // A second per-launch secret that marks "this request came from the
  // Electron renderer, not an agent child". Strong-gates mutating endpoints
  // so a compromised skill — which inevitably has the bearer token because
  // it must authenticate at all — still can't rewrite config or install
  // more skills.
  private rendererOrigin = '';
  private status: SidecarStatus = { state: 'stopped' };
  private crashCount = 0;
  private crashWindowStart = 0;

  isRunning(): boolean {
    return this.status.state === 'ready' || this.status.state === 'starting';
  }

  getStatus(): SidecarStatus {
    return this.status;
  }

  private setStatus(s: SidecarStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  private resolvePython(): { bin: string; module: string } {
    // Dev override
    const devPython = process.env.STARK_PYTHON || process.env.HEARTH_PYTHON;
    const devModule = resolve(__dirname, '../../sidecar');
    if (devPython) return { bin: devPython, module: devModule };
    if (!app.isPackaged) return { bin: 'python3', module: devModule };

    // Production: ~/Library/Application Support/Hermes/runtime/bin/python3
    const home = app.getPath('home');
    const hermes = join(home, 'Library', 'Application Support', 'Hermes');
    return {
      bin: join(hermes, 'runtime', 'bin', 'python3'),
      module: join(hermes, 'lib', 'hermes_home'),
    };
  }

  async start(): Promise<void> {
    if (this.proc) return;
    this.setStatus({ state: 'starting' });
    this.token = randomBytes(32).toString('hex');
    this.rendererOrigin = randomBytes(32).toString('hex');

    const { bin, module } = this.resolvePython();
    if (!existsSync(bin) && app.isPackaged) {
      // If Hermes isn't installed yet, stay in `starting` — Installer will
      // drive the install flow and re-trigger start().
      this.setStatus({ state: 'error', message: 'Hermes engine not installed yet' });
      return;
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STARK_TOKEN: this.token,
      STARK_RENDERER_ORIGIN: this.rendererOrigin,
      STARK_DATA_DIR: join(app.getPath('userData'), 'data'),
      HEARTH_TOKEN: this.token,
      HEARTH_DATA_DIR: join(app.getPath('userData'), 'data'),
      HERMES_HOME_TOKEN: this.token,
      HERMES_HOME_DATA_DIR: join(app.getPath('userData'), 'data'),
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: module,
    };

    this.proc = spawn(bin, ['-m', 'hermes_home', '--port', '0'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (buf: Buffer) => {
      const line = buf.toString().trim();
      if (!line) return;
      if (this.port === null) {
        const match = line.match(/^PORT=(\d+)/);
        if (match) {
          this.port = Number(match[1]);
          this.setStatus({ state: 'ready', port: this.port });
          return;
        }
      }
      console.log('[sidecar]', line);
    });
    this.proc.stderr?.on('data', (b: Buffer) =>
      console.error('[sidecar:err]', b.toString().trim()),
    );
    this.proc.on('exit', (code, signal) => {
      console.warn(`[sidecar] exited code=${code} signal=${signal}`);
      this.proc = null;
      this.port = null;
      this.setStatus({ state: 'stopped' });
      this.maybeRestart();
    });
    this.proc.on('error', (err) => this.setStatus({ state: 'error', message: err.message }));
  }

  private maybeRestart(): void {
    const now = Date.now();
    if (now - this.crashWindowStart > 60_000) {
      this.crashWindowStart = now;
      this.crashCount = 0;
    }
    this.crashCount += 1;
    if (this.crashCount > 3) {
      this.setStatus({ state: 'error', message: 'Sidecar crashed repeatedly. See logs.' });
      return;
    }
    setTimeout(() => void this.start(), 500);
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.request({ method: 'POST', path: '/shutdown' }, 1500);
    } catch {
      /* best-effort */
    }
    const proc = this.proc;
    await new Promise<void>((resolveExit) => {
      const timer = setTimeout(() => proc.kill('SIGTERM'), 1500);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    this.proc = null;
    this.setStatus({ state: 'stopped' });
  }

  async request<T = unknown>(req: SidecarRequest, timeoutMs = 30_000): Promise<SidecarResponse<T>> {
    if (this.status.state !== 'ready' || this.port === null) {
      return { ok: false, status: 0, error: 'sidecar not ready' };
    }
    const url = new URL(`http://127.0.0.1:${this.port}${req.path}`);
    if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: req.method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
          'x-stark-origin': this.rendererOrigin,
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
      const text = await res.text();
      let data: T | undefined;
      try {
        data = text ? (JSON.parse(text) as T) : undefined;
      } catch {
        data = text as unknown as T;
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: (err as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(req: SidecarRequest): AsyncGenerator<string> {
    if (this.status.state !== 'ready' || this.port === null) {
      throw new Error('sidecar not ready');
    }
    const url = new URL(`http://127.0.0.1:${this.port}${req.path}`);
    if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);

    const res = await fetch(url, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${this.token}`,
        'x-stark-origin': this.rendererOrigin,
      },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
        if (dataLine) yield dataLine.slice(6);
      }
    }
  }

  on<K extends keyof Events>(event: K, listener: Events[K]): this {
    return super.on(event, listener);
  }
}
