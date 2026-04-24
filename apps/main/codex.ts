import { spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CodexStatus } from '@shared/rpc';

const execFile = promisify(execFileCb);

export class CodexDetector {
  private cached: string | null | undefined;

  private findBin(): string | null {
    if (this.cached !== undefined) return this.cached;
    try {
      const { stdout } = spawnSync('which', ['codex'], { encoding: 'utf8' });
      const bin = ((stdout as string | undefined) ?? '').trim();
      this.cached = bin.length > 0 && existsSync(bin) ? bin : null;
    } catch {
      this.cached = null;
    }
    return this.cached;
  }

  async detect(): Promise<CodexStatus> {
    const bin = this.findBin();
    if (!bin) return { installed: false };
    let version = 'unknown';
    try {
      const { stdout } = await execFile(bin, ['--version'], { timeout: 5_000 });
      version = stdout.trim();
    } catch {
      /* best-effort */
    }
    const authPath = join(homedir(), '.codex', 'auth.json');
    if (!existsSync(authPath)) return { installed: true, version, signedIn: false };
    let account: string | undefined;
    try {
      const raw = JSON.parse(readFileSync(authPath, 'utf8'));
      account = raw?.email ?? raw?.account?.email ?? raw?.user?.email;
    } catch {
      /* ignore */
    }
    return { installed: true, version, signedIn: true, account };
  }

  async signIn(): Promise<void> {
    const bin = this.findBin();
    if (!bin) throw new Error('Codex CLI not installed');
    // The resolved path is embedded into an AppleScript string that we hand
    // to ``osascript``. A path containing quotes, backslashes, newlines, or
    // AppleScript metachars would escape the string and let an attacker who
    // planted a binary in the user's PATH run arbitrary AppleScript.
    // Accept only a conservative shape for the path — which matches every
    // ``which codex`` result in practice.
    if (!/^[A-Za-z0-9_./+-]+$/.test(bin)) {
      throw new Error('Codex CLI path contains unexpected characters; refusing to launch.');
    }
    const script = `tell application "Terminal" to do script "${bin} login"`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  }

  async signOut(): Promise<void> {
    const bin = this.findBin();
    if (!bin) return;
    try {
      await execFile(bin, ['logout'], { timeout: 10_000 });
    } catch {
      /* best-effort */
    }
  }
}
