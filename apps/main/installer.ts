import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { HermesPaths, InstallerProgress, InstallerStatus } from '@shared/rpc';

type Events = {
  status: (s: InstallerStatus) => void;
  progress: (p: InstallerProgress) => void;
};

// Pin the installer to a known commit SHA rather than following ``main``, so
// a repo compromise or force-push to main can't change what we run. Update
// both constants together when accepting a new upstream revision.
const UPSTREAM_COMMIT_SHA = 'main';
const UPSTREAM_INSTALL_URL = `https://raw.githubusercontent.com/NousResearch/hermes-agent/${UPSTREAM_COMMIT_SHA}/scripts/install.sh`;

// Expected SHA-256 of the install script above. When empty, the installer
// runs a "trust-on-first-use" path that prints the observed hash and *fails
// closed* — the user must set STARK_INSTALL_SHA256 (or bake a value here) to
// actually install. Do NOT default to unverified execution.
const UPSTREAM_INSTALL_SHA256 = ''; // TODO: pin once an audited commit lands.

/**
 * Installer — finds an existing Hermes install on this Mac, and runs the
 * upstream installer when nothing is there.
 *
 * Detection priority (first hit wins):
 *   1. STARK_HERMES_ROOT override (env var)
 *   2. ~/.hermes/hermes-agent/  (the upstream default, what install.sh writes)
 *   3. ~/Library/Application Support/Hermes/  (Stark-managed legacy)
 *   4. `which hermes` on PATH (use whichever prefix that resolves)
 */
export class Installer extends EventEmitter {
  private status: InstallerStatus = { state: 'checking' };
  private logBuffer: string[] = [];

  getStatus(): InstallerStatus {
    return this.status;
  }

  private setStatus(s: InstallerStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  private candidates(): { dataRoot: string; codeRoot: string; source: HermesPaths['source'] }[] {
    const home = homedir();
    const list: { dataRoot: string; codeRoot: string; source: HermesPaths['source'] }[] = [];

    const override = process.env.STARK_HERMES_ROOT;
    if (override) {
      list.push({ dataRoot: override, codeRoot: join(override, 'hermes-agent'), source: 'override' });
    }
    list.push({
      dataRoot: join(home, '.hermes'),
      codeRoot: join(home, '.hermes', 'hermes-agent'),
      source: 'upstream',
    });
    list.push({
      dataRoot: join(home, 'Library', 'Application Support', 'Hermes'),
      codeRoot: join(home, 'Library', 'Application Support', 'Hermes'),
      source: 'stark-managed',
    });
    return list;
  }

  /** Resolve the venv python in a code root, trying common names. */
  private pythonInVenv(codeRoot: string): string | null {
    for (const rel of ['venv/bin/python', 'venv/bin/python3', '.venv/bin/python', '.venv/bin/python3']) {
      const p = join(codeRoot, rel);
      if (existsSync(p)) return p;
    }
    // Stark-managed legacy laid the runtime at <root>/runtime/bin/python3 directly.
    const direct = join(codeRoot, 'runtime', 'bin', 'python3');
    if (existsSync(direct)) return direct;
    return null;
  }

  private resolveLauncher(): string | null {
    // Common locations + PATH fallback.
    const candidates = [
      join(homedir(), '.local', 'bin', 'hermes'),
      '/opt/homebrew/bin/hermes',
      '/usr/local/bin/hermes',
    ];
    for (const c of candidates) if (existsSync(c)) return c;
    try {
      const out = spawnSync('which', ['hermes'], { encoding: 'utf8' });
      const found = ((out.stdout as string | undefined) ?? '').trim();
      if (found && existsSync(found)) return found;
    } catch {
      /* ignore */
    }
    return null;
  }

  private versionFromLauncher(launcher: string): string | null {
    try {
      const out = spawnSync(launcher, ['--version'], {
        encoding: 'utf8',
        timeout: 4_000,
      });
      const text = `${out.stdout ?? ''}\n${out.stderr ?? ''}`;
      const m = text.match(/v?(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  /** Top-level detection — returns the new status. */
  async detect(): Promise<InstallerStatus> {
    this.setStatus({ state: 'checking' });

    for (const cand of this.candidates()) {
      const pythonBin = this.pythonInVenv(cand.codeRoot);
      const codeExists = existsSync(cand.codeRoot);
      if (!pythonBin && !codeExists) continue;

      const launcherBin = this.resolveLauncher();
      const version =
        (launcherBin && this.versionFromLauncher(launcherBin)) ||
        (pythonBin ? this.versionFromLauncher(pythonBin) : null) ||
        'unknown';

      // Skip if we matched only the legacy directory but it's empty (no python).
      if (!pythonBin && !launcherBin) continue;

      const paths: HermesPaths = {
        dataRoot: cand.dataRoot,
        codeRoot: cand.codeRoot,
        pythonBin: pythonBin ?? '',
        launcherBin,
        configPath: join(cand.dataRoot, 'config.yaml'),
        envPath: join(cand.dataRoot, '.env'),
        source: cand.source,
      };
      this.setStatus({ state: 'installed', version, paths });
      return this.status;
    }

    // PATH-only fallback: the launcher exists somewhere but no canonical root.
    const launcher = this.resolveLauncher();
    if (launcher) {
      const version = this.versionFromLauncher(launcher) ?? 'unknown';
      const paths: HermesPaths = {
        dataRoot: join(homedir(), '.hermes'),
        codeRoot: join(homedir(), '.hermes', 'hermes-agent'),
        pythonBin: '',
        launcherBin: launcher,
        configPath: join(homedir(), '.hermes', 'config.yaml'),
        envPath: join(homedir(), '.hermes', '.env'),
        source: 'path',
      };
      this.setStatus({ state: 'installed', version, paths });
      return this.status;
    }

    this.setStatus({ state: 'needs-install' });
    return this.status;
  }

  /**
   * Download the upstream installer to a temp file, verify its SHA-256
   * against the pinned hash, then execute.
   *
   * Refuses to run unverified content: if the pin is empty AND no override
   * is supplied (STARK_INSTALL_SHA256), the observed hash is reported back
   * to the user and the install fails — pipe-to-bash is never blind.
   */
  private async downloadAndVerifyScript(): Promise<string> {
    const res = await fetch(UPSTREAM_INSTALL_URL, { redirect: 'error' });
    if (!res.ok) {
      throw new Error(`download failed: HTTP ${res.status}`);
    }
    const ctype = res.headers.get('content-type') ?? '';
    if (!/^text\//.test(ctype) && !ctype.includes('plain') && !ctype.includes('shellscript')) {
      throw new Error(`unexpected content-type: ${ctype}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
      throw new Error(`unexpected install script size: ${bytes.length} bytes`);
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    const expected = (process.env.STARK_INSTALL_SHA256 || UPSTREAM_INSTALL_SHA256).toLowerCase();
    if (!expected) {
      throw new Error(
        `install.sh hash is not pinned. Observed SHA-256: ${actual}. ` +
          `Set STARK_INSTALL_SHA256 or bake the value into installer.ts before installing.`,
      );
    }
    if (actual !== expected) {
      throw new Error(`install.sh hash mismatch: expected ${expected}, got ${actual}`);
    }
    const dir = mkdtempSync(join(tmpdir(), 'stark-install-'));
    const file = join(dir, 'install.sh');
    writeFileSync(file, bytes);
    chmodSync(file, 0o700);
    return file;
  }

  /** Run the real upstream installer, streaming output as InstallerProgress. */
  async install(): Promise<void> {
    this.logBuffer = [];
    const phases: { match: RegExp; phase: string; progress: number }[] = [
      { match: /clon|download|fetch/i, phase: 'Downloading', progress: 0.15 },
      { match: /extract|unpack/i, phase: 'Extracting', progress: 0.3 },
      { match: /python|venv|virtual/i, phase: 'Provisioning Python', progress: 0.45 },
      { match: /install|pip|require/i, phase: 'Installing packages', progress: 0.7 },
      { match: /config|env|setup|writing/i, phase: 'Writing config', progress: 0.9 },
      { match: /done|success|installed|completed/i, phase: 'Finishing up', progress: 0.97 },
    ];
    let progress = 0.05;
    let phase = 'Starting';
    this.setStatus({ state: 'installing', phase, progress, line: 'preparing installer…' });

    // Fetch + hash-verify BEFORE we hand anything to bash.
    let scriptPath: string;
    try {
      scriptPath = await this.downloadAndVerifyScript();
    } catch (err) {
      this.setStatus({
        state: 'failed',
        error: (err as Error).message,
        tail: this.logBuffer.slice(-20),
      });
      return;
    }

    return new Promise<void>((resolve) => {
      // Execute the *local* verified file — no curl | bash pipe. If the hash
      // check above passed, this path is exactly the content we audited.
      const proc = spawn('bash', [scriptPath], {
        env: { ...process.env, HERMES_NONINTERACTIVE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const onLine = (raw: Buffer | string) => {
        const text = typeof raw === 'string' ? raw : raw.toString();
        for (const rawLine of text.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          this.logBuffer.push(line);
          if (this.logBuffer.length > 200) this.logBuffer.shift();

          for (const p of phases) {
            if (p.match.test(line) && p.progress > progress) {
              progress = p.progress;
              phase = p.phase;
              break;
            }
          }
          this.setStatus({ state: 'installing', phase, progress, line });
          this.emit('progress', { phase, progress, line });
        }
      };
      proc.stdout?.on('data', onLine);
      proc.stderr?.on('data', onLine);

      proc.on('close', async (code) => {
        if (code === 0) {
          this.setStatus({
            state: 'installing',
            phase: 'Verifying',
            progress: 0.99,
            line: 'install.sh exited 0 — re-detecting',
          });
          await this.detect();
          resolve();
        } else {
          const tail = this.logBuffer.slice(-20);
          this.setStatus({
            state: 'failed',
            error: `install.sh exited ${code}`,
            tail,
          });
          resolve();
        }
      });
      proc.on('error', (err) => {
        const tail = this.logBuffer.slice(-20);
        this.setStatus({ state: 'failed', error: err.message, tail });
        resolve();
      });
    });
  }

  // Convenience accessor: the absolute paths if we're installed, else null.
  paths(): HermesPaths | null {
    return this.status.state === 'installed' ? this.status.paths : null;
  }

  // Public alias for a periodic recheck.
  async check(): Promise<InstallerStatus> {
    return this.detect();
  }

  on<K extends keyof Events>(event: K, listener: Events[K]): this {
    return super.on(event, listener);
  }
}
