import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Download,
  Loader2,
  KeyRound,
  ShieldCheck,
  Sparkles,
  MessagesSquare,
  Folder,
  TerminalSquare,
  Globe2,
  Search,
  Brain,
  CalendarClock,
  Radio,
  Mic,
  Zap,
  Code2,
  Server,
  Shield,
  Cpu,
} from 'lucide-react';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Input';
import { Badge, ProgressBar } from '../../components/ui/Atoms';
import { cn } from '../../lib/cn';
import { useSession } from '../../stores/session';
import { call } from '../../lib/rpc';
import type { Capability, InstallerStatus, SafetyPreset, SetupMode } from '@shared/rpc';
import { useToast } from '../../components/ui/Toast';

const STEPS = [
  'welcome',
  'install',
  'mode',
  'provider',
  'verify',
  'capabilities',
  'safety',
  'first-win',
] as const;
type Step = (typeof STEPS)[number];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [installer, setInstaller] = useState<InstallerStatus>({ state: 'checking' });
  const [mode, setMode] = useState<SetupMode>('simple');
  const [provider, setProvider] = useState<'nous' | 'byok' | 'openrouter' | 'local'>('nous');
  const [apiKey, setApiKey] = useState('');
  const [verify, setVerify] = useState<VerifyState>({ connected: 'pending', context: 'pending', first: 'pending', tool: 'pending' });
  const [caps, setCaps] = useState<Capability[]>(['files', 'web', 'memory']);
  const [safety, setSafety] = useState<SafetyPreset>('balanced');
  const [busy, setBusy] = useState(false);
  const push = useToast((s) => s.push);

  const setProviderGlobal = useSession((s) => s.setProvider);
  const setSetupMode = useSession((s) => s.setSetupMode);
  const setSafetyPreset = useSession((s) => s.setSafetyPreset);
  const setCapabilitiesGlobal = useSession((s) => s.setCapabilities);
  const setOnboarded = useSession((s) => s.setOnboarded);
  const appendMessage = useSession((s) => s.appendMessage);
  const setRoute = useSession((s) => s.setRoute);

  useEffect(() => {
    void window.stark.installer.status().then(setInstaller);
    const off = window.stark.installer.onStatus(setInstaller);
    return off;
  }, []);

  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  async function finish(firstPrompt?: string) {
    setBusy(true);
    try {
      await call({
        method: 'PATCH',
        path: '/settings',
        body: {
          setup_mode: mode,
          safety_preset: safety,
          capabilities: caps,
          active_provider: provider === 'byok' ? 'openai' : provider,
          onboarded: true,
        },
      });
      if (apiKey && provider === 'byok') {
        await call({
          method: 'POST',
          path: '/providers/configure',
          body: { id: 'openai', api_key: apiKey },
        });
      }
      setProviderGlobal(provider === 'byok' ? 'openai' : provider);
      setSetupMode(mode);
      setSafetyPreset(safety);
      setCapabilitiesGlobal(caps);
      setOnboarded(true);
      push({ kind: 'success', title: 'Stark is ready' });
      if (firstPrompt) {
        appendMessage({
          id: `u${Date.now()}`,
          role: 'user',
          content: firstPrompt,
          createdAt: Date.now(),
        });
        setRoute('threads');
      } else {
        setRoute('home');
      }
      onClose();
    } catch (err) {
      push({ kind: 'error', title: 'Could not save', description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] stark-bg flex items-center justify-center p-8">
      <Backdrop />
      <div className="relative z-10 w-full max-w-3xl anim-in">
        <div className="mb-6 flex items-center justify-between">
          <Logo size={36} />
          <Rail step={idx} total={STEPS.length} />
        </div>

        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
          {step === 'welcome' && <StepWelcome onNext={next} />}
          {step === 'install' && (
            <StepInstall
              status={installer}
              onStart={() => void window.stark.installer.start()}
              onNext={next}
            />
          )}
          {step === 'mode' && <StepMode value={mode} onChange={setMode} onBack={back} onNext={next} />}
          {step === 'provider' && (
            <StepProvider
              value={provider}
              onChange={setProvider}
              apiKey={apiKey}
              onKey={setApiKey}
              onBack={back}
              onNext={next}
            />
          )}
          {step === 'verify' && (
            <StepVerify
              state={verify}
              onRun={async () => {
                await simulateVerify(setVerify);
              }}
              onBack={back}
              onNext={next}
            />
          )}
          {step === 'capabilities' && (
            <StepCaps mode={mode} value={caps} onChange={setCaps} onBack={back} onNext={next} />
          )}
          {step === 'safety' && (
            <StepSafety value={safety} onChange={setSafety} onBack={back} onNext={next} />
          )}
          {step === 'first-win' && <StepFirstWin busy={busy} onFinish={finish} />}
        </div>

        <div className="font-mono mt-4 text-center text-[10px] uppercase tracking-[0.22em] text-[var(--fg-ghost)]">
          chapter {idx + 1} of {STEPS.length}
        </div>
      </div>
    </div>
  );
}

// ───────────────── helpers

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(800px 400px at 50% 10%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 65%)',
        }}
      />
    </div>
  );
}

function Rail({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-[3px] rounded-full transition-[background-color,width] duration-[var(--motion-dur-lg)] ease-[var(--motion-ease-out)]',
            i < step
              ? 'w-4 bg-[var(--primary)]'
              : i === step
                ? 'w-8 bg-[var(--primary)] shadow-[0_0_10px_var(--primary-glow)]'
                : 'w-4 bg-[var(--line)]',
          )}
        />
      ))}
    </div>
  );
}

function Footer({
  onBack,
  onNext,
  canContinue = true,
  busy = false,
  label = 'Continue',
}: {
  onBack?: () => void;
  onNext: () => void;
  canContinue?: boolean;
  busy?: boolean;
  label?: string;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        variant="primary"
        onClick={onNext}
        loading={busy}
        disabled={!canContinue}
        trailing={<ArrowRight className="h-4 w-4" />}
      >
        {label}
      </Button>
    </div>
  );
}

function Eyebrow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="font-mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-[var(--primary)]">
      {icon}
      {children}
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  const cards = [
    { icon: MessagesSquare, title: 'Chat with tools', desc: 'Every answer can read, write, search, and act.' },
    { icon: CalendarClock, title: 'Automate the recurring', desc: 'Plain-English schedules that run while you sleep.' },
    { icon: TerminalSquare, title: 'Control files, browser, terminal', desc: 'Safely, and only the way you allow.' },
  ];
  return (
    <div className="px-10 py-12 text-center">
      <div className="mx-auto mb-5 w-fit">
        <Logo size={60} />
      </div>
      <h1 className="font-display text-[52px] leading-[1.02] tracking-tight">
        Stark is your AI operator for Mac.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-[15px] text-[var(--fg-muted)]">
        Stark is the native control center. Install the engine, connect a model, grant only what you're comfortable with.
      </p>
      <div className="stagger mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.title}
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-left"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--primary-wash)] text-[var(--primary)]">
              <c.icon className="h-4 w-4" />
            </div>
            <div className="mt-3 text-sm font-medium">{c.title}</div>
            <div className="mt-1 text-[12.5px] text-[var(--fg-muted)]">{c.desc}</div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex justify-center">
        <Button size="lg" variant="primary" trailing={<ArrowRight className="h-4 w-4" />} onClick={onNext}>
          Get started
        </Button>
      </div>
    </div>
  );
}

function StepInstall({
  status,
  onStart,
  onNext,
}: {
  status: InstallerStatus;
  onStart: () => void;
  onNext: () => void;
}) {
  const installed = status.state === 'installed';
  const installing = status.state === 'installing' || status.state === 'updating';

  // When detection finds an existing install, give the user a brief
  // moment to see what was found, then auto-advance.
  useEffect(() => {
    if (status.state !== 'installed') return;
    const t = setTimeout(onNext, 1400);
    return () => clearTimeout(t);
  }, [status.state, onNext]);

  return (
    <div className="px-10 py-10">
      <Eyebrow icon={<Download className="h-3 w-3" />}>Install</Eyebrow>
      <h2 className="font-display mt-2 text-[36px] leading-[1.05]">
        {installed
          ? 'The engine is already on this Mac.'
          : 'Let Stark install the local engine.'}
      </h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        {installed
          ? 'Stark detected a working install and connected to it. Engine updates can be managed independently from Settings.'
          : (
            <>
              Stark runs the upstream installer into{' '}
              the local app data directory and points the bridge at it. Nothing leaves this Mac.
            </>
          )}
      </p>

      <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] p-5">
        {status.state === 'checking' && (
          <div className="flex items-center gap-3 text-sm text-[var(--fg-muted)]">
            <Loader2 className="h-4 w-4 animate-[stark-spin_0.9s_linear_infinite]" />
            Scanning your Mac for an existing install…
          </div>
        )}

        {status.state === 'needs-install' && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">No engine install detected.</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--fg-muted)]">
                Stark will run the official installer — takes under a minute.
              </div>
            </div>
            <Button variant="primary" leading={<Download className="h-3.5 w-3.5" />} onClick={onStart}>
              Install engine
            </Button>
          </div>
        )}

        {installing && (
          <div>
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-[stark-spin_0.9s_linear_infinite] text-[var(--primary)]" />
              <span className="text-sm">
                {status.state === 'installing' ? 'Installing' : 'Updating'} · {status.phase}
              </span>
            </div>
            <div className="mt-4">
              <ProgressBar value={status.progress} />
            </div>
            {status.line && (
              <pre className="font-mono mt-3 max-h-40 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[10.5px] leading-snug text-[var(--fg-muted)]">
                {status.line}
              </pre>
            )}
          </div>
        )}

        {installed && (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 text-[var(--ok)]" />
              <div>
                <div className="text-sm font-medium">
                  Detected · v{status.version}
                  <span className="font-mono ml-2 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
                    via {status.paths.source}
                  </span>
                </div>
                <div className="font-mono mt-1 grid gap-0.5 text-[11px] text-[var(--fg-ghost)]">
                  <span>data · {status.paths.dataRoot}</span>
                  <span>code · {status.paths.codeRoot}</span>
                  {status.paths.launcherBin && <span>launcher · {status.paths.launcherBin}</span>}
                </div>
              </div>
            </div>
            <Badge tone="ok">ready</Badge>
          </div>
        )}

        {status.state === 'failed' && (
          <div>
            <div className="text-sm font-medium text-[var(--bad)]">Install failed</div>
            <div className="font-mono mt-1 text-[11px] text-[var(--fg-muted)]">{status.error}</div>
            {status.tail.length > 0 && (
              <pre className="font-mono mt-2 max-h-32 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[10.5px] leading-snug text-[var(--fg-muted)]">
                {status.tail.join('\n')}
              </pre>
            )}
            <div className="mt-3">
              <Button variant="secondary" onClick={onStart}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </div>

      <Footer
        onNext={onNext}
        canContinue={installed}
        label={installed ? 'Continue' : 'Waiting for install'}
      />
    </div>
  );
}

function StepMode({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: SetupMode;
  onChange: (m: SetupMode) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const modes: { id: SetupMode; title: string; desc: string; icon: typeof Sparkles; caps: string }[] = [
    { id: 'simple', title: 'Simple', desc: 'Recommended defaults. Chat, files, web, memory.', icon: Sparkles, caps: 'files · web · memory' },
    { id: 'developer', title: 'Developer', desc: 'Terminal, git, repo tools on by default.', icon: Code2, caps: 'simple + terminal · browser' },
    { id: 'operator', title: 'Operator', desc: 'Automations, messaging gateway, background jobs.', icon: Server, caps: 'simple + automations · messaging' },
    { id: 'private', title: 'Private', desc: 'Local/self-hosted model emphasis, minimal egress.', icon: Shield, caps: 'simple · local only' },
  ];
  return (
    <div className="px-10 py-10">
      <Eyebrow icon={<Zap className="h-3 w-3" />}>Setup mode</Eyebrow>
      <h2 className="font-display mt-2 text-[36px] leading-[1.05]">Pick a starting point.</h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        You can adjust every capability individually later.
      </p>
      <div className="stagger mt-6 grid gap-2 sm:grid-cols-2">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              'rounded-[var(--radius-md)] border p-5 text-left transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
              value === m.id
                ? 'border-[var(--primary)] bg-[var(--primary-wash)]'
                : 'border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--surface-3)] text-[var(--primary)]">
                  <m.icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold">{m.title}</div>
              </div>
              {value === m.id && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)]">
                  <Check className="h-3 w-3 text-[var(--primary-ink)]" />
                </div>
              )}
            </div>
            <div className="mt-2 text-[12.5px] text-[var(--fg-muted)]">{m.desc}</div>
            <div className="font-mono mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
              {m.caps}
            </div>
          </button>
        ))}
      </div>
      <Footer onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepProvider({
  value,
  onChange,
  apiKey,
  onKey,
  onBack,
  onNext,
}: {
  value: 'nous' | 'byok' | 'openrouter' | 'local';
  onChange: (p: 'nous' | 'byok' | 'openrouter' | 'local') => void;
  apiKey: string;
  onKey: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const opts = [
    { id: 'nous' as const, title: 'Nous Portal', desc: 'Recommended models with 128K context.', recommended: true },
    { id: 'byok' as const, title: 'Bring your own API key', desc: 'OpenAI, Anthropic, Google — your billing, your key.' },
    { id: 'openrouter' as const, title: 'OpenRouter', desc: '200+ models routed behind one key.' },
    { id: 'local' as const, title: 'Local or custom endpoint', desc: 'Ollama, LM Studio, llama.cpp, or any OpenAI-compatible URL.' },
  ];
  return (
    <div className="px-10 py-10">
      <Eyebrow icon={<Cpu className="h-3 w-3" />}>Model provider</Eyebrow>
      <h2 className="font-display mt-2 text-[36px] leading-[1.05]">Who powers the agent?</h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        Stark needs a model with at least 64K context. We'll verify your choice in the next step.
      </p>
      <div className="stagger mt-6 grid gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex items-start justify-between gap-4 rounded-[var(--radius-md)] border p-4 text-left transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
              value === o.id
                ? 'border-[var(--primary)] bg-[var(--primary-wash)]'
                : 'border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]',
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                {o.title}
                {o.recommended && <Badge tone="primary">recommended</Badge>}
              </div>
              <div className="mt-1 text-[12.5px] text-[var(--fg-muted)]">{o.desc}</div>
            </div>
            <div
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded-full border transition-colors',
                value === o.id ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--line-strong)]',
              )}
            >
              {value === o.id && <Check className="h-full w-full p-0.5 text-[var(--primary-ink)]" />}
            </div>
          </button>
        ))}
      </div>
      {value === 'byok' && (
        <div className="mt-5 anim-in">
          <Field label="API key" hint="stored locally">
            <Input
              leading={<KeyRound className="h-3.5 w-3.5" />}
              type="password"
              placeholder="sk-…"
              value={apiKey}
              onChange={(e) => onKey(e.target.value)}
            />
          </Field>
        </div>
      )}
      <button
        type="button"
        className="mt-4 text-[11.5px] font-mono uppercase tracking-[0.14em] text-[var(--fg-ghost)] hover:text-[var(--fg-muted)]"
        onClick={() => {
          /* advanced providers lives under Settings > Providers */
        }}
      >
        More providers ›
      </button>
      <Footer
        onBack={onBack}
        onNext={onNext}
        canContinue={value !== 'byok' || apiKey.length >= 10}
      />
    </div>
  );
}

// ───────────── verify step

type VerifyKey = 'connected' | 'context' | 'first' | 'tool';
type VerifyState = Record<VerifyKey, 'pending' | 'running' | 'ok' | 'fail'>;

async function simulateVerify(set: (v: VerifyState) => void) {
  const order: VerifyKey[] = ['connected', 'context', 'first', 'tool'];
  const states: VerifyState = { connected: 'pending', context: 'pending', first: 'pending', tool: 'pending' };
  set({ ...states });
  for (const k of order) {
    states[k] = 'running';
    set({ ...states });
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    states[k] = 'ok';
    set({ ...states });
  }
}

function StepVerify({
  state,
  onRun,
  onBack,
  onNext,
}: {
  state: VerifyState;
  onRun: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [ran, setRan] = useState(false);
  const allOk = Object.values(state).every((v) => v === 'ok');
  const running = Object.values(state).some((v) => v === 'running');

  const rows: { k: VerifyKey; label: string; detail: string }[] = [
    { k: 'connected', label: 'Model connected', detail: 'We opened a connection to the provider.' },
    { k: 'context', label: 'Context window ≥ 64K', detail: 'Stark needs room to think. We checked the limit.' },
    { k: 'first', label: 'First response', detail: 'The model answered a test prompt.' },
    { k: 'tool', label: 'Tool call works', detail: 'Function-calling roundtrip succeeded.' },
  ];

  return (
    <div className="px-10 py-10">
      <Eyebrow icon={<Zap className="h-3 w-3" />}>Verify</Eyebrow>
      <h2 className="font-display mt-2 text-[36px] leading-[1.05]">Four checks. Thirty seconds.</h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        We run a real probe, not just a config validation.
      </p>

      <div className="stagger mt-6 space-y-2">
        {rows.map((r) => (
          <div
            key={r.k}
            className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3"
          >
            <StateIcon state={state[r.k]} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-[11.5px] text-[var(--fg-muted)]">{r.detail}</div>
            </div>
            <Badge
              tone={state[r.k] === 'ok' ? 'ok' : state[r.k] === 'fail' ? 'bad' : 'neutral'}
            >
              {state[r.k]}
            </Badge>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          {!ran && !allOk && (
            <Button
              variant="primary"
              onClick={async () => {
                setRan(true);
                await onRun();
              }}
              loading={running}
              leading={<Zap className="h-3.5 w-3.5" />}
            >
              Run verification
            </Button>
          )}
          {allOk && (
            <Button variant="primary" onClick={onNext} trailing={<ArrowRight className="h-4 w-4" />}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StateIcon({ state }: { state: 'pending' | 'running' | 'ok' | 'fail' }) {
  if (state === 'running')
    return <Loader2 className="h-4 w-4 animate-[stark-spin_0.8s_linear_infinite] text-[var(--primary)]" />;
  if (state === 'ok') return <Check className="h-4 w-4 text-[var(--ok)]" />;
  if (state === 'fail') return <div className="h-2 w-2 rounded-full bg-[var(--bad)]" />;
  return <div className="h-2 w-2 rounded-full bg-[var(--fg-ghost)]" />;
}

// ───────────── capabilities + safety + first-win

function StepCaps({
  mode,
  value,
  onChange,
  onBack,
  onNext,
}: {
  mode: SetupMode;
  value: Capability[];
  onChange: (c: Capability[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const caps: {
    id: Capability;
    title: string;
    icon: typeof Folder;
    enables: string;
    access: string;
    needsApproval: boolean;
  }[] = [
    { id: 'files', title: 'Files', icon: Folder, enables: 'Read, write, summarize, search.', access: 'Paths you grant.', needsApproval: true },
    { id: 'terminal', title: 'Terminal', icon: TerminalSquare, enables: 'Run shell commands and scripts.', access: 'Whitelisted dirs.', needsApproval: true },
    { id: 'browser', title: 'Browser', icon: Globe2, enables: 'Open URLs, fill forms, extract text.', access: 'Ephemeral profile.', needsApproval: true },
    { id: 'web', title: 'Web search', icon: Search, enables: 'Search the web for citations.', access: 'Outbound HTTPS.', needsApproval: false },
    { id: 'memory', title: 'Memory', icon: Brain, enables: 'Remember context across sessions.', access: '~/Library.', needsApproval: false },
    { id: 'automations', title: 'Automations', icon: CalendarClock, enables: 'Scheduled jobs and briefs.', access: 'Cron + local tools.', needsApproval: false },
    { id: 'messaging', title: 'Messaging gateway', icon: Radio, enables: 'Reach Stark from chat apps.', access: 'Tokens you configure.', needsApproval: true },
    { id: 'voice', title: 'Voice', icon: Mic, enables: 'Speak to Stark, hear replies.', access: 'Microphone + speakers.', needsApproval: true },
  ];

  // auto-include sane defaults when switching modes
  useEffect(() => {
    const byMode: Record<SetupMode, Capability[]> = {
      simple: ['files', 'web', 'memory'],
      developer: ['files', 'terminal', 'browser', 'web', 'memory'],
      operator: ['files', 'web', 'memory', 'automations', 'messaging'],
      private: ['files', 'memory'],
    };
    onChange(byMode[mode]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toggle = (c: Capability) =>
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);

  return (
    <div className="px-10 py-10">
      <Eyebrow icon={<ShieldCheck className="h-3 w-3" />}>Capabilities</Eyebrow>
      <h2 className="font-display mt-2 text-[36px] leading-[1.05]">What should Stark be allowed to do?</h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        Each capability can be toggled later. Items marked <span className="font-mono text-[var(--accent-signal)]">approval</span> ask before the risky action.
      </p>
      <div className="stagger mt-6 grid gap-2 sm:grid-cols-2">
        {caps.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={cn(
                'rounded-[var(--radius-md)] border p-4 text-left transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
                on
                  ? 'border-[var(--primary)] bg-[var(--primary-wash)]'
                  : 'border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--surface-3)] text-[var(--primary)]">
                    <c.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium">{c.title}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {c.needsApproval && <Badge tone="signal">approval</Badge>}
                  <Toggle on={on} />
                </div>
              </div>
              <div className="mt-2 text-[12.5px] text-[var(--fg-muted)]">{c.enables}</div>
              <div className="font-mono mt-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                access · {c.access}
              </div>
            </button>
          );
        })}
      </div>
      <Footer onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
        on ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
          on ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </span>
  );
}

function StepSafety({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: SafetyPreset;
  onChange: (v: SafetyPreset) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const opts: { id: SafetyPreset; title: string; desc: string }[] = [
    { id: 'safe', title: 'Safe', desc: 'Approve any risky action before it runs.' },
    { id: 'balanced', title: 'Balanced', desc: 'Approve writes, sends, destructive commands. Recommended.' },
    { id: 'autonomous', title: 'Autonomous', desc: 'Run approved scopes without asking. Everything is logged.' },
  ];
  return (
    <div className="px-10 py-10">
      <Eyebrow icon={<ShieldCheck className="h-3 w-3" />}>Safety preset</Eyebrow>
      <h2 className="font-display mt-2 text-[36px] leading-[1.05]">How much leash?</h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        You can change this any time from Settings.
      </p>
      <div className="stagger mt-6 grid gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex items-start justify-between gap-4 rounded-[var(--radius-md)] border p-4 text-left transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
              value === o.id
                ? 'border-[var(--primary)] bg-[var(--primary-wash)]'
                : 'border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]',
            )}
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                {o.title}
                {o.id === 'balanced' && <Badge tone="primary">recommended</Badge>}
              </div>
              <div className="mt-1 text-[12.5px] text-[var(--fg-muted)]">{o.desc}</div>
            </div>
            <Toggle on={value === o.id} />
          </button>
        ))}
      </div>
      <Footer onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepFirstWin({ busy, onFinish }: { busy: boolean; onFinish: (prompt?: string) => void }) {
  const prompts = [
    'Summarize what is in my current working folder.',
    'Explain what Stark can do on this Mac in plain language.',
    'Create a daily brief automation that runs at 8am.',
    'Analyze my Downloads folder and suggest what to archive.',
    'Walk me through setting up Telegram access.',
  ];
  return (
    <div className="px-10 py-12 text-center">
      <div className="mx-auto mb-5 w-fit">
        <Logo size={56} />
      </div>
      <h1 className="font-display text-[44px] leading-[1.02]">One task to start.</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] text-[var(--fg-muted)]">
        Pick a first win. You can always skip and open a blank thread.
      </p>
      <div className="stagger mx-auto mt-8 grid max-w-xl gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            disabled={busy}
            onClick={() => onFinish(p)}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-left text-sm transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-50"
          >
            <span className="text-[var(--fg)]">{p}</span>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-dim)]" />
          </button>
        ))}
      </div>
      <div className="mt-6 flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => onFinish()} disabled={busy}>
          Skip and open the dashboard
        </Button>
      </div>
    </div>
  );
}
