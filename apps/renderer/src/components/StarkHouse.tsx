import { useEffect, useMemo, useRef, useState } from 'react';
import { Mascot } from './Mascot';
import { useSession } from '../stores/session';
import type { Expr, Pose, Accessory } from '../lib/stark/sprite';
import { call } from '../lib/rpc';
import type { Approval, Job } from '@shared/rpc';
import { cn } from '../lib/cn';

type StationId = 'meadow' | 'cottage' | 'workbench' | 'gate' | 'rest';

type StationDef = {
  x: number;
  y: number;
  expr: Expr;
  pose: Pose;
  accessory: Accessory;
  line: string;
};

const STATIONS: Record<StationId, StationDef> = {
  meadow: { x: 50, y: 20, expr: 'idle', pose: 'wave', accessory: 'wings', line: 'ready when you are.' },
  cottage: { x: 67, y: 24, expr: 'thinking', pose: 'think', accessory: 'none', line: 'working inside.' },
  workbench: { x: 42, y: 20, expr: 'loading', pose: 'loading', accessory: 'wings', line: 'running the job.' },
  gate: { x: 28, y: 18, expr: 'happy', pose: 'carry', accessory: 'envelope', line: 'approval at the gate.' },
  rest: { x: 57, y: 18, expr: 'sleepy', pose: 'idle', accessory: 'none', line: 'quiet for now.' },
};

export function StarkHouse({
  className,
  fullscreen = false,
}: {
  className?: string;
  fullscreen?: boolean;
}) {
  const streaming = useSession((s) => s.streaming);
  const userName = useSession((s) => s.userName);

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [station, setStation] = useState<StationId>('meadow');
  const [bubble, setBubble] = useState<string | null>(null);
  const [waving, setWaving] = useState(false);
  const idleSinceRef = useRef(Date.now());

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const [a, j] = await Promise.all([
        call<{ approvals: Approval[] }>({ method: 'GET', path: '/approvals' }),
        call<{ jobs: Job[] }>({ method: 'GET', path: '/jobs' }),
      ]);
      if (!mounted) return;
      if (a.ok && a.data) setApprovals(a.data.approvals);
      if (j.ok && j.data) setJobs(j.data.jobs);
    };
    void refresh();
    const i = window.setInterval(refresh, 6000);
    return () => {
      mounted = false;
      window.clearInterval(i);
    };
  }, []);

  useEffect(() => {
    if (streaming || approvals.length > 0 || jobs.length > 0) idleSinceRef.current = Date.now();
  }, [streaming, approvals.length, jobs.length]);

  useEffect(() => {
    const tick = () => {
      const idleSec = (Date.now() - idleSinceRef.current) / 1000;
      let next: StationId = 'meadow';
      if (waving) next = 'meadow';
      else if (streaming) next = 'cottage';
      else if (approvals.length > 0) next = 'gate';
      else if (jobs.length > 0) next = 'workbench';
      else if (idleSec > 90) next = 'rest';
      setStation((p) => (p === next ? p : next));
    };
    tick();
    const i = window.setInterval(tick, 2000);
    return () => window.clearInterval(i);
  }, [streaming, approvals.length, jobs.length, waving]);

  const def = STATIONS[station];
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    setWalking(true);
    const t = window.setTimeout(() => setWalking(false), 1200);
    return () => window.clearTimeout(t);
  }, [station]);

  const expr: Expr = walking ? 'idle' : def.expr;
  const pose: Pose = walking ? 'hover' : def.pose;
  const accessory: Accessory = walking ? 'wings' : def.accessory;
  const stationLine = bubble ?? (waving ? `Hi${userName ? `, ${userName}` : ''}.` : def.line);

  function onClickStark() {
    setWaving(true);
    setBubble(`Hi${userName ? `, ${userName}` : ''}. I'm Stark.`);
    window.setTimeout(() => {
      setWaving(false);
      setBubble(null);
    }, 2400);
  }

  const pills = useMemo(() => {
    const items: { tone: 'blue' | 'amber' | 'mint'; label: string }[] = [];
    if (streaming) items.push({ tone: 'amber', label: 'thinking' });
    if (approvals.length > 0) items.push({ tone: 'amber', label: `${approvals.length} approval${approvals.length > 1 ? 's' : ''}` });
    if (jobs.length > 0) items.push({ tone: 'mint', label: `${jobs.length} job${jobs.length > 1 ? 's' : ''}` });
    if (items.length === 0) items.push({ tone: 'blue', label: 'clear' });
    return items;
  }, [streaming, approvals.length, jobs.length]);

  return (
    <div className={cn('stark-meadow relative isolate overflow-hidden bg-[#7DB6E8]', fullscreen && 'h-full w-full', className)}>
      <Sky />
      <Cloud left="9%" top="12%" scale={1.05} />
      <Cloud left="33%" top="7%" scale={0.74} />
      <Cloud left="72%" top="13%" scale={0.9} />
      <FloatingIsland />
      <DistantHills />
      <Meadow />
      <Willow />
      <Cottage />
      <StoneGarden active={approvals.length > 0} />
      <Workbench active={jobs.length > 0 || streaming} />
      <Path />
      <Flowers />

      <div
        className="absolute z-30"
        style={{
          left: `clamp(76px, calc(${def.x}% - 48px), calc(100% - 118px))`,
          bottom: `clamp(54px, ${def.y}%, calc(100% - 144px))`,
          transition: 'left 1.2s cubic-bezier(.4,0,.2,1), bottom 1.2s cubic-bezier(.4,0,.2,1)',
        }}
      >
        <SpeechBubble>{stationLine}</SpeechBubble>
        <button onClick={onClickStark} className="block" title="Say hi to Stark">
          <Mascot
            scale={fullscreen ? 3 : 2.7}
            expr={waving ? 'happy' : expr}
            pose={waving ? 'wave' : pose}
            accessory={accessory}
            trackCursor={station === 'meadow' && !walking}
          />
        </button>
        <div
          aria-hidden
          className="absolute left-1/2 h-2 -translate-x-1/2 rounded-full bg-[#22311F]/25"
          style={{ bottom: -4, width: 64, filter: 'blur(1px)' }}
        />
      </div>

      <div className="absolute left-4 top-4 z-40 rounded-[10px] border border-[#23334E]/30 bg-[#F6F0D8]/86 px-3 py-2 shadow-[0_12px_26px_-18px_rgba(34,49,31,0.8)] backdrop-blur">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#273B3E]">Stark field</div>
      </div>

      <div className="absolute right-4 top-4 z-40 flex max-w-[min(42vw,260px)] flex-col items-end gap-1.5">
        {pills.map((p, i) => (
          <Pill key={i} tone={p.tone} label={p.label} />
        ))}
      </div>
    </div>
  );
}

function Sky() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #77B7EE 0%, #BDE1FF 46%, #EAF5D8 76%, #7CBF62 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[38%]"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(92,157,80,0.18) 28%, #4F9D47 100%)',
        }}
      />
    </>
  );
}

function Cloud({ left, top, scale }: { left: string; top: string; scale: number }) {
  return (
    <div
      aria-hidden
      className="absolute opacity-90"
      style={{ left, top, width: 120 * scale, height: 34 * scale, animation: 'stark-drift 18s ease-in-out infinite alternate' }}
    >
      <Blob x={0} y={12} w={58} h={18} color="#FFFFFF" />
      <Blob x={24} y={0} w={54} h={32} color="#F4FBFF" />
      <Blob x={66} y={8} w={54} h={22} color="#FFFFFF" />
    </div>
  );
}

function FloatingIsland() {
  return (
    <div className="absolute left-[24%] top-[16%] h-[12%] w-[18%]" aria-hidden>
      <Pixel
        layers={[
          { x: 14, y: 20, w: 112, h: 18, fill: '#5D8E54' },
          { x: 30, y: 38, w: 82, h: 10, fill: '#4C7549' },
          { x: 48, y: 48, w: 46, h: 12, fill: '#46613E' },
          { x: 26, y: 14, w: 82, h: 8, fill: '#8DD66D' },
          { x: 70, y: 4, w: 16, h: 18, fill: '#8F8B83' },
          { x: 74, y: 0, w: 8, h: 8, fill: '#B5B2AB' },
        ]}
        style={{ width: 140, height: 70 }}
      />
    </div>
  );
}

function DistantHills() {
  return (
    <>
      <div className="absolute bottom-[31%] left-[-5%] h-[19%] w-[62%] rounded-[55%_55%_0_0] bg-[#6FB45D]" aria-hidden />
      <div className="absolute bottom-[30%] right-[-8%] h-[22%] w-[72%] rounded-[55%_55%_0_0] bg-[#5EA354]" aria-hidden />
      <div className="absolute bottom-[29%] left-[18%] h-[16%] w-[55%] rounded-[55%_55%_0_0] bg-[#88C86E]" aria-hidden />
    </>
  );
}

function Meadow() {
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[#3D8D43]" aria-hidden />
      <div
        className="absolute inset-x-0 bottom-0 h-[34%] opacity-45"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(24,72,37,.28) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />
      <div className="absolute inset-x-0 bottom-[28%] h-[8%] bg-[#68BA58]" aria-hidden />
      <div className="absolute inset-x-0 bottom-[33%] h-4 bg-[#98D36B]" aria-hidden />
    </>
  );
}

function Cottage() {
  return (
    <div className="absolute bottom-[28%] left-[59%] h-[30%] w-[24%]" aria-hidden>
      <Pixel
        layers={[
          { x: 40, y: 74, w: 132, h: 82, fill: '#F1E2B4', stroke: '#2B3446' },
          { x: 24, y: 56, w: 164, h: 28, fill: '#6D4230', stroke: '#2B3446' },
          { x: 52, y: 34, w: 108, h: 32, fill: '#81523C', stroke: '#2B3446' },
          { x: 70, y: 96, w: 28, h: 28, fill: '#8ED7C2', stroke: '#2B3446' },
          { x: 120, y: 96, w: 28, h: 28, fill: '#8ED7C2', stroke: '#2B3446' },
          { x: 98, y: 112, w: 24, h: 44, fill: '#6D4230', stroke: '#2B3446' },
          { x: 116, y: 132, w: 4, h: 4, fill: '#F4B542' },
          { x: 144, y: 18, w: 16, h: 34, fill: '#5E4A3B', stroke: '#2B3446' },
          { x: 140, y: 10, w: 24, h: 10, fill: '#3B2F2A', stroke: '#2B3446' },
        ]}
        style={{ width: 210, height: 168 }}
      />
    </div>
  );
}

function Willow() {
  return (
    <div className="absolute bottom-[30%] right-[5%] h-[48%] w-[22%]" aria-hidden>
      <Pixel
        layers={[
          { x: 92, y: 88, w: 24, h: 156, fill: '#6A4434', stroke: '#2B3446' },
          { x: 80, y: 116, w: 24, h: 82, fill: '#7D4F39' },
          { x: 36, y: 74, w: 164, h: 56, fill: '#CFE6C9', stroke: '#6B8F79' },
          { x: 16, y: 104, w: 172, h: 58, fill: '#D8EBD5', stroke: '#6B8F79' },
          { x: 64, y: 142, w: 148, h: 54, fill: '#BED9B8', stroke: '#6B8F79' },
          { x: 46, y: 168, w: 24, h: 82, fill: '#B6D3AD' },
          { x: 82, y: 174, w: 22, h: 88, fill: '#CBE4C4' },
          { x: 124, y: 166, w: 24, h: 92, fill: '#B6D3AD' },
          { x: 164, y: 160, w: 20, h: 78, fill: '#CBE4C4' },
        ]}
        style={{ width: 220, height: 270, animation: 'stark-sway 7s ease-in-out infinite alternate', transformOrigin: '50% 100%' }}
      />
    </div>
  );
}

function StoneGarden({ active }: { active: boolean }) {
  return (
    <div className="absolute bottom-[30%] left-[16%] h-[18%] w-[30%]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Pixel
          key={i}
          layers={[
            { x: 4, y: 10, w: 32, h: 44, fill: i === 2 && active ? '#E7B953' : '#A7ABB2', stroke: '#4C5364' },
            { x: 10, y: 4, w: 20, h: 12, fill: '#C3C6CC', stroke: '#4C5364' },
            { x: 16, y: 24, w: 10, h: 4, fill: '#7B8292' },
          ]}
          style={{ left: `${i * 18 + (i % 2) * 5}%`, bottom: `${(i % 2) * 12}%`, width: 44, height: 62 }}
        />
      ))}
    </div>
  );
}

function Workbench({ active }: { active: boolean }) {
  return (
    <div className="absolute bottom-[22%] left-[38%] h-[16%] w-[18%]" aria-hidden>
      <Pixel
        layers={[
          { x: 0, y: 50, w: 116, h: 12, fill: '#6D4230', stroke: '#2B3446' },
          { x: 10, y: 62, w: 12, h: 46, fill: '#5B392B' },
          { x: 92, y: 62, w: 12, h: 46, fill: '#5B392B' },
          { x: 22, y: 18, w: 72, h: 36, fill: '#2E394E', stroke: '#2B3446' },
          { x: 30, y: 26, w: 56, h: 20, fill: active ? '#8ED7C2' : '#5F6F7D' },
          { x: 50, y: 6, w: 20, h: 14, fill: '#2E394E', stroke: '#2B3446' },
        ]}
        style={{ width: 118, height: 112 }}
      />
    </div>
  );
}

function Path() {
  return (
    <div
      className="absolute bottom-0 left-[48%] h-[31%] w-[12%]"
      aria-hidden
      style={{
        clipPath: 'polygon(40% 0, 58% 0, 92% 100%, 0 100%)',
        background: 'repeating-linear-gradient(0deg, #C59A62 0 16px, #B98851 16px 18px)',
        boxShadow: 'inset 0 0 0 2px rgba(43,52,70,.25)',
      }}
    />
  );
}

function Flowers() {
  const items = [
    ['18%', '9%', '#F6F0D8'],
    ['24%', '6%', '#EFA5A5'],
    ['33%', '12%', '#F6F0D8'],
    ['72%', '10%', '#EFA5A5'],
    ['80%', '7%', '#F6F0D8'],
    ['88%', '12%', '#EFA5A5'],
  ] as const;
  return (
    <>
      {items.map(([left, bottom, color]) => (
        <Pixel
          key={`${left}-${bottom}`}
          layers={[
            { x: 5, y: 0, w: 2, h: 14, fill: '#245B2E' },
            { x: 1, y: 12, w: 10, h: 5, fill: color, stroke: '#245B2E' },
            { x: 5, y: 10, w: 2, h: 2, fill: '#E7B953' },
          ]}
          style={{ left, bottom, width: 12, height: 20 }}
        />
      ))}
    </>
  );
}

type Layer = { x: number; y: number; w: number; h: number; fill: string; stroke?: string };

function Pixel({
  layers,
  style,
}: {
  layers: Layer[];
  style?: React.CSSProperties;
}) {
  return (
    <div className="absolute" style={style}>
      {layers.map((l, i) => (
        <span
          key={i}
          className="absolute"
          aria-hidden
          style={{
            left: l.x,
            top: l.y,
            width: l.w,
            height: l.h,
            background: l.fill,
            boxShadow: l.stroke ? `inset 0 0 0 2px ${l.stroke}` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function Blob({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  return <span className="absolute rounded-full" style={{ left: x, top: y, width: w, height: h, background: color }} />;
}

function SpeechBubble({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="font-mono pointer-events-none absolute -top-9 left-1/2 z-10 max-w-[170px] -translate-x-1/2 rounded-[10px] border border-[#2B3446] bg-[#FFF7E2] px-2.5 py-1.5 text-center text-[10px] font-bold leading-tight text-[#273B3E] shadow-[0_10px_20px_-16px_rgba(39,59,62,.8)]">
      {children}
    </div>
  );
}

function Pill({ tone, label }: { tone: 'blue' | 'amber' | 'mint'; label: string }) {
  const palette = {
    blue: 'border-[#5367C9] bg-[#E9EEFF] text-[#24315E]',
    amber: 'border-[#B98851] bg-[#FFF1C7] text-[#6A4320]',
    mint: 'border-[#4F9D47] bg-[#DDF4D6] text-[#245B2E]',
  }[tone];
  return (
    <span className={cn('font-mono inline-flex max-w-full rounded-[999px] border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]', palette)}>
      <span className="truncate">{label}</span>
    </span>
  );
}
