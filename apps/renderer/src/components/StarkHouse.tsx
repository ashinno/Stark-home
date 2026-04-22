import { useEffect, useMemo, useRef, useState } from 'react';
import { Mascot } from './Mascot';
import { useSession } from '../stores/session';
import type { Expr, Pose, Accessory } from '../lib/stark/sprite';
import { call } from '../lib/rpc';
import type { Approval, Job } from '@shared/rpc';
import { cn } from '../lib/cn';

/* ───────────────────────────────────────────────────────────────
 * STARK'S HOME at twilight.
 *
 * A warm, illustrated cross-section of a small two-floor house.
 * Smooth vector shapes, layered radial glows, hardwood floor,
 * sage-green damask wallpaper. Not pixel-art — a storybook
 * companion that Stark wanders through as the agent works.
 *
 * Layering (back → front):
 *   1. Night sky (radial; moon in corner)
 *   2. Wallpaper with faint damask pattern
 *   3. Hardwood floor + mid-floor beam
 *   4. Architectural chrome (stairs, window, room dividers)
 *   5. Furniture (kitchen, couch, fridge, desk, shelves)
 *   6. Ambient lighting overlays (lamp glow, TV wash, hearth)
 *   7. Stark walking between stations
 *   8. HUD (status pills + brand plate)
 * ─────────────────────────────────────────────────────────── */

type StationId =
  | 'living'
  | 'kitchen'
  | 'stairs'
  | 'hallway'
  | 'study'
  | 'bedroom'
  | 'window';

type StationDef = {
  x: number; // % from left of the house frame
  y: number; // % from bottom
  expr: Expr;
  pose: Pose;
  accessory: Accessory;
  line: string;
};

const STATIONS: Record<StationId, StationDef> = {
  living:  { x: 54, y: 5,  expr: 'happy',    pose: 'wave',    accessory: 'wings',    line: 'warm in the living room.' },
  kitchen: { x: 26, y: 5,  expr: 'happy',    pose: 'idle',    accessory: 'none',     line: 'putting the kettle on.' },
  stairs:  { x: 14, y: 26, expr: 'idle',     pose: 'hover',   accessory: 'wings',    line: 'on the stairs.' },
  hallway: { x: 42, y: 46, expr: 'happy',    pose: 'carry',   accessory: 'envelope', line: 'bringing the mail up.' },
  study:   { x: 76, y: 46, expr: 'thinking', pose: 'think',   accessory: 'none',     line: 'working in the study.' },
  bedroom: { x: 20, y: 46, expr: 'sleepy',   pose: 'idle',    accessory: 'none',     line: 'taking five upstairs.' },
  window:  { x: 92, y: 46, expr: 'idle',     pose: 'idle',    accessory: 'none',     line: 'watching the moon.' },
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
  const [station, setStation] = useState<StationId>('living');
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
      let next: StationId = 'living';
      if (waving) next = 'living';
      else if (streaming) next = 'study';
      else if (approvals.length > 0) next = 'hallway';
      else if (jobs.length > 0) next = 'kitchen';
      else if (idleSec > 22 && idleSec < 90) {
        const wanderSpots: StationId[] = ['kitchen', 'stairs', 'hallway', 'window'];
        next = wanderSpots[Math.floor(idleSec / 6) % wanderSpots.length];
      } else if (idleSec >= 90) next = 'bedroom';
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
    const t = window.setTimeout(() => setWalking(false), 1400);
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
    const items: { tone: 'navy' | 'amber' | 'mint'; label: string }[] = [];
    if (streaming) items.push({ tone: 'amber', label: 'thinking' });
    if (approvals.length > 0)
      items.push({ tone: 'amber', label: `${approvals.length} approval${approvals.length > 1 ? 's' : ''}` });
    if (jobs.length > 0)
      items.push({ tone: 'mint', label: `${jobs.length} job${jobs.length > 1 ? 's' : ''}` });
    if (items.length === 0) items.push({ tone: 'navy', label: 'all quiet' });
    return items;
  }, [streaming, approvals.length, jobs.length]);

  return (
    <div
      className={cn(
        'stark-home relative isolate overflow-hidden',
        fullscreen && 'h-full w-full',
        className,
      )}
    >
      {/* 1. Night sky outside the window + subtle ambient */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 380px at 92% 20%, #2B3A52 0%, #1A2339 35%, #0F1626 70%, #0A1120 100%)',
        }}
      />

      {/* 2. Wallpaper — sage green with faint damask motif */}
      <Wallpaper />

      {/* Mid-floor wooden beam (separates floors) */}
      <div
        aria-hidden
        className="absolute left-0 right-0"
        style={{
          bottom: '44%',
          height: 14,
          background:
            'linear-gradient(180deg, #5B3B22 0%, #4A2F1A 50%, #38220F 100%)',
          boxShadow: '0 2px 0 rgba(0,0,0,0.35), 0 -1px 0 rgba(255,220,160,0.08) inset',
        }}
      />

      {/* 3. Hardwood floor — warm gradient + subtle plank lines */}
      <Floor />

      {/* 4. Window (upper right) + moonlight pool */}
      <Window />

      {/* 5. Stairs (left side, bridging floors) */}
      <Stairs />

      {/* ─── UPPER FLOOR ─── */}
      <UpperPictures />
      <BookshelfTall />
      <UpperDoors />
      <UpperSideTable />
      <UpperLamp />

      {/* ─── GROUND FLOOR ─── */}
      <KitchenCabinets />
      <Fridge />
      <Stove />
      <KitchenShelf />
      <CouchCluster />
      <TvConsole active={streaming || jobs.length > 0} />
      <SideTableRight />
      <WallClock />
      <Plant x="48.5%" y_bottom={9} />
      <Doormat x="2%" />

      {/* 6. Ambient glows overlaid on top of everything */}
      <LampGlow x="26%" y="62%" size={320} color="rgba(245, 200, 110, 0.16)" />
      <TvGlow active={streaming || jobs.length > 0} />
      <MoonGlow />

      {/* 7. Stark */}
      <div
        className="absolute z-30"
        style={{
          left: `clamp(56px, calc(${def.x}% - 48px), calc(100% - 120px))`,
          bottom: `clamp(16px, ${def.y}%, calc(100% - 120px))`,
          transition:
            'left 1.4s cubic-bezier(.4,0,.2,1), bottom 1.4s cubic-bezier(.4,0,.2,1)',
        }}
      >
        <SpeechBubble>{stationLine}</SpeechBubble>
        <button onClick={onClickStark} className="block" title="Say hi to Stark">
          <Mascot
            scale={fullscreen ? 3 : 2.5}
            expr={waving ? 'happy' : expr}
            pose={waving ? 'wave' : pose}
            accessory={accessory}
            trackCursor={station === 'living' && !walking}
          />
        </button>
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: -6,
            width: 70,
            height: 5,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(0,0,0,0.35), transparent 70%)',
          }}
        />
      </div>

      {/* 8. HUD */}
      <div className="absolute left-4 top-4 z-40">
        <div
          className="font-mono rounded-[6px] border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{
            borderColor: 'rgba(245,225,175,0.22)',
            background: 'rgba(23,25,36,0.78)',
            color: '#F4E1A7',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: '#F5A524', boxShadow: '0 0 8px #F5A524' }}
          />
          stark's home
        </div>
      </div>
      <div className="absolute right-4 top-4 z-40 flex max-w-[min(42vw,240px)] flex-col items-end gap-1.5">
        {pills.map((p, i) => (
          <Pill key={i} tone={p.tone} label={p.label} />
        ))}
      </div>
    </div>
  );
}

/* ─── Background ────────────────────────────────────────── */

function Wallpaper() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #2F4234 0%, #334837 40%, #2B3A2E 100%)',
        }}
      />
      {/* Damask-style repeat pattern */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
              '<g fill="none" stroke="rgba(245,220,160,0.06)" stroke-width="0.8">' +
              '<path d="M24 6 C 20 12, 14 14, 14 22 C 14 28, 20 32, 24 32 C 28 32, 34 28, 34 22 C 34 14, 28 12, 24 6 Z"/>' +
              '<circle cx="24" cy="22" r="3"/>' +
              '<path d="M6 24 L 14 24 M34 24 L 42 24" stroke-width="0.5"/>' +
              '</g></svg>',
          )}")`,
          backgroundRepeat: 'repeat',
          opacity: 0.75,
        }}
      />
      {/* very subtle vignette top/bottom */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 18%, transparent 70%, rgba(0,0,0,0.28) 100%)',
        }}
      />
    </>
  );
}

function Floor() {
  return (
    <>
      {/* Ground floor wood */}
      <div
        aria-hidden
        className="absolute inset-x-0"
        style={{
          bottom: 0,
          height: 14,
          background:
            'linear-gradient(180deg, #6E4A28 0%, #583B21 50%, #3F2912 100%)',
        }}
      />
      {/* plank divider lines on ground */}
      <div
        aria-hidden
        className="absolute inset-x-0"
        style={{
          bottom: 0,
          height: 14,
          background:
            'repeating-linear-gradient(90deg, transparent 0 56px, rgba(0,0,0,0.25) 56px 58px)',
        }}
      />
      {/* warm wash above the floor */}
      <div
        aria-hidden
        className="absolute inset-x-0"
        style={{
          bottom: 14,
          height: 50,
          background:
            'linear-gradient(180deg, transparent 0%, rgba(245,200,120,0.06) 100%)',
        }}
      />
    </>
  );
}

function Window() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        right: '4%',
        top: '7%',
        width: 110,
        height: 120,
      }}
    >
      {/* frame */}
      <div
        className="absolute inset-0 rounded-[6px]"
        style={{
          background:
            'linear-gradient(180deg, #1A2339 0%, #273757 55%, #1A2339 100%)',
          boxShadow: '0 0 0 3px #3D2914, inset 0 0 0 2px #0C1424',
        }}
      />
      {/* moon */}
      <div
        className="absolute"
        style={{
          left: 22,
          top: 16,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 32% 32%, #FFF6D4, #E9D99D 60%, #B29C66 100%)',
          boxShadow: '0 0 30px rgba(255, 238, 190, 0.55)',
        }}
      />
      {/* stars */}
      {[
        { l: 70, t: 24 },
        { l: 82, t: 42 },
        { l: 60, t: 50 },
        { l: 88, t: 76 },
        { l: 28, t: 82 },
      ].map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#F4E6B0]"
          style={{
            left: s.l,
            top: s.t,
            width: 2,
            height: 2,
            boxShadow: '0 0 6px rgba(255,245,200,0.6)',
          }}
        />
      ))}
      {/* window mullion cross */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, transparent 49%, #3D2914 49%, #3D2914 51%, transparent 51%), linear-gradient(to bottom, transparent 49%, #3D2914 49%, #3D2914 51%, transparent 51%)',
        }}
      />
      {/* sill */}
      <div
        className="absolute"
        style={{
          left: -6,
          right: -6,
          bottom: -10,
          height: 10,
          background: 'linear-gradient(180deg, #5B3B22 0%, #3E2A15 100%)',
          boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
}

function MoonGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        right: '2%',
        top: '12%',
        width: 260,
        height: 260,
        background:
          'radial-gradient(circle, rgba(255,235,170,0.14) 0%, rgba(255,235,170,0.06) 35%, transparent 60%)',
        filter: 'blur(8px)',
        mixBlendMode: 'screen',
      }}
    />
  );
}

/* ─── Architecture ──────────────────────────────────────── */

function Stairs() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left: '4%',
        bottom: 14,
        width: 180,
        height: '38%',
        pointerEvents: 'none',
      }}
    >
      {/* stairs built as a triangular stack of steps */}
      <svg
        viewBox="0 0 180 200"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="stepTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8C5E35" />
            <stop offset="100%" stopColor="#6E4A28" />
          </linearGradient>
          <linearGradient id="stepSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A2F17" />
            <stop offset="100%" stopColor="#2F1D0B" />
          </linearGradient>
        </defs>
        {/* staircase silhouette */}
        {Array.from({ length: 8 }).map((_, i) => {
          const w = 24 + i * 18;
          const h = 20;
          const y = 200 - (i + 1) * h;
          return (
            <g key={i}>
              <rect x={0} y={y} width={w} height={2} fill="url(#stepTop)" />
              <rect x={0} y={y + 2} width={w} height={h - 2} fill="url(#stepSide)" />
            </g>
          );
        })}
        {/* handrail */}
        <path
          d="M 8 200 L 158 40"
          stroke="#3D2914"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        {/* balusters */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line
            key={i}
            x1={8 + i * 20}
            y1={200 - i * 20}
            x2={8 + i * 20}
            y2={200 - (i + 0.8) * 20 - 6}
            stroke="#3D2914"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

/* ─── Upper floor pieces ────────────────────────────────── */

function UpperPictures() {
  const frames = [
    { left: '20%', top: '15%', w: 32, h: 36, tilt: -2, inner: '#3A2F1F', accent: '#BE4848' },
    { left: '26%', top: '17%', w: 38, h: 32, tilt: 1, inner: '#29374A', accent: '#D6B86E' },
    { left: '33%', top: '15%', w: 34, h: 34, tilt: -1, inner: '#2F4836', accent: '#7FB396' },
    { left: '46%', top: '16%', w: 36, h: 30, tilt: 2, inner: '#352536', accent: '#C27BAF' },
  ];
  return (
    <>
      {frames.map((f, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute"
          style={{
            left: f.left,
            top: f.top,
            width: f.w,
            height: f.h,
            transform: `rotate(${f.tilt}deg)`,
            background: '#3D2914',
            boxShadow: '2px 3px 6px rgba(0,0,0,0.4)',
            borderRadius: 2,
            padding: 3,
          }}
        >
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${f.inner} 0%, ${f.accent}55 70%, ${f.inner} 100%)`,
              borderRadius: 1,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      ))}
    </>
  );
}

function UpperDoors() {
  return (
    <>
      {/* center doorway opening to dark hallway */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: '38%',
          bottom: '46%',
          width: 46,
          height: 100,
          background:
            'linear-gradient(180deg, #15110B 0%, #0B0907 100%)',
          borderRadius: '4px 4px 0 0',
          boxShadow: 'inset 0 0 0 3px #3D2914, 0 0 8px rgba(0,0,0,0.4)',
        }}
      />
      {/* right door closed */}
      <div
        aria-hidden
        className="absolute"
        style={{
          right: '3%',
          bottom: '46%',
          width: 50,
          height: 100,
          background: 'linear-gradient(180deg, #6E4A28 0%, #3E2A15 100%)',
          borderRadius: '4px 4px 0 0',
          boxShadow: 'inset 0 0 0 2px #2A1C0A, inset 8px 8px 0 -6px #8C5E35, inset -8px 8px 0 -6px #8C5E35',
        }}
      >
        <span
          className="absolute"
          style={{
            right: 8,
            top: '50%',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#D9B86A',
            boxShadow: '0 0 2px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    </>
  );
}

function UpperSideTable() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left: '50%',
        bottom: '46%',
        width: 78,
        height: 70,
      }}
    >
      {/* table */}
      <div
        className="absolute"
        style={{
          left: 4,
          bottom: 0,
          width: 70,
          height: 44,
        }}
      >
        {/* tablecloth */}
        <div
          className="absolute inset-x-0 top-0 h-8"
          style={{
            background: 'linear-gradient(180deg, #9A2C2C 0%, #6E1A1A 100%)',
            borderRadius: 3,
            boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.3)',
          }}
        />
        {/* legs */}
        <div
          className="absolute"
          style={{ left: 4, bottom: 0, width: 4, height: 36, background: '#3D2914' }}
        />
        <div
          className="absolute"
          style={{ right: 4, bottom: 0, width: 4, height: 36, background: '#3D2914' }}
        />
      </div>
      {/* tiny laptop on the table */}
      <div
        className="absolute"
        style={{
          left: 20,
          bottom: 30,
          width: 30,
          height: 22,
        }}
      >
        {/* screen */}
        <div
          className="absolute inset-x-0 top-0 h-4 rounded-t"
          style={{
            background: 'linear-gradient(180deg, #1C2A3E 0%, #0F1626 100%)',
            boxShadow: 'inset 0 0 0 1px #3D2914',
          }}
        >
          <div
            className="absolute inset-1"
            style={{ background: '#4AE8C5', opacity: 0.8, borderRadius: 1 }}
          />
        </div>
        {/* base */}
        <div
          className="absolute inset-x-[-2px] bottom-0 h-2 rounded-b"
          style={{ background: '#2A3B5A' }}
        />
      </div>
    </div>
  );
}

function UpperLamp() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left: '64%',
        bottom: '46%',
        width: 48,
        height: 120,
      }}
    >
      {/* shade */}
      <div
        className="absolute"
        style={{
          left: 6,
          top: 0,
          width: 36,
          height: 30,
          background:
            'radial-gradient(ellipse at 50% 30%, #FFE9A7 0%, #E9C774 60%, #8A6B34 100%)',
          borderRadius: '50% 50% 10px 10px / 60% 60% 20% 20%',
          boxShadow: '0 4px 18px rgba(255, 222, 140, 0.45)',
        }}
      />
      {/* stem */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: 30,
          width: 2,
          height: 68,
          transform: 'translateX(-50%)',
          background: '#3D2914',
        }}
      />
      {/* base */}
      <div
        className="absolute"
        style={{
          left: 10,
          bottom: 10,
          width: 28,
          height: 8,
          background: 'linear-gradient(180deg, #5B3B22 0%, #3E2A15 100%)',
          borderRadius: '50%',
        }}
      />
    </div>
  );
}

function BookshelfTall() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left: '70%',
        bottom: '46%',
        width: 110,
        height: 120,
      }}
    >
      {/* case */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #6E4A28 0%, #4A2F17 100%)',
          boxShadow:
            'inset 0 0 0 3px #2F1D0B, inset 0 -30px 0 -24px rgba(0,0,0,0.4)',
          borderRadius: 2,
        }}
      />
      {/* shelves */}
      {[22, 52, 82].map((t, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: 6,
            right: 6,
            top: t,
            height: 3,
            background: '#2F1D0B',
          }}
        />
      ))}
      {/* books per shelf */}
      {[4, 36, 66, 96].map((shelfTop, idx) => (
        <Books key={idx} top={shelfTop} />
      ))}
    </div>
  );
}

function Books({ top }: { top: number }) {
  const cols = ['#9A2C2C', '#3A5B8A', '#A8843E', '#4F7A62', '#6A3F6A', '#2F4432', '#8C5E35'];
  return (
    <div
      className="absolute"
      style={{ left: 10, right: 10, top, height: 18 }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const color = cols[(top / 5 + i) % cols.length] ?? cols[i % cols.length];
        const w = 9 + ((i * 3) % 5);
        const h = 16 - ((i * 2) % 5);
        return (
          <span
            key={i}
            className="inline-block mr-[1px]"
            style={{
              width: w,
              height: h,
              background: color,
              verticalAlign: 'bottom',
              boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.3)',
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── Ground floor pieces ───────────────────────────────── */

function KitchenCabinets() {
  return (
    <div aria-hidden className="absolute" style={{ left: '14%', bottom: 14, width: '22%', height: '40%' }}>
      {/* upper cabinets */}
      <div
        className="absolute"
        style={{
          left: '8%',
          top: 6,
          width: '62%',
          height: 58,
          background: 'linear-gradient(180deg, #3AA9A0 0%, #2B8F88 100%)',
          border: '2px solid #0E3030',
          borderRadius: 4,
          boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="absolute top-1 bottom-1"
          style={{
            left: '50%',
            width: 2,
            background: '#0E3030',
          }}
        />
        {/* handles */}
        <span className="absolute" style={{ left: '22%', top: 26, width: 10, height: 2, background: '#F0E8D4' }} />
        <span className="absolute" style={{ right: '22%', top: 26, width: 10, height: 2, background: '#F0E8D4' }} />
      </div>
      {/* counter top */}
      <div
        className="absolute"
        style={{
          left: 0,
          right: 0,
          bottom: 60,
          height: 6,
          background: 'linear-gradient(180deg, #3D2914 0%, #2A1C0A 100%)',
        }}
      />
      {/* base cabinets */}
      <div
        className="absolute"
        style={{
          left: 0,
          right: 0,
          bottom: 0,
          height: 60,
          background: 'linear-gradient(180deg, #3AA9A0 0%, #2B8F88 100%)',
          border: '2px solid #0E3030',
          borderRadius: '3px 3px 0 0',
        }}
      >
        {/* cabinet grid */}
        {[25, 50, 75].map((l) => (
          <span
            key={l}
            className="absolute top-0 bottom-0"
            style={{ left: `${l}%`, width: 2, background: '#0E3030' }}
          />
        ))}
        {/* handles */}
        {[12, 37, 62, 87].map((l) => (
          <span
            key={l}
            className="absolute"
            style={{ left: `${l}%`, bottom: 20, width: 8, height: 2, background: '#F0E8D4' }}
          />
        ))}
      </div>
      {/* tiny jars on counter */}
      {[
        { l: 6, c: '#9A2C2C' },
        { l: 12, c: '#D9B86A' },
        { l: 18, c: '#4F7A62' },
      ].map((j, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${j.l}%`,
            bottom: 66,
            width: 5,
            height: 9,
            background: j.c,
            boxShadow: '0 1px 0 rgba(0,0,0,0.4), inset 0 0 0 0.5px rgba(0,0,0,0.3)',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function Stove() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ left: '22%', bottom: 14, width: 48, height: 50 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #1A1A1F 0%, #0A0A0D 100%)',
          border: '2px solid #0E1014',
          borderRadius: 3,
        }}
      />
      {/* burners */}
      <span
        className="absolute"
        style={{
          left: 8,
          top: 6,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #F5A524 0%, #C47808 60%, #3A1E05 100%)',
          boxShadow: '0 0 10px rgba(245,165,36,0.55)',
        }}
      />
      <span
        className="absolute"
        style={{
          right: 8,
          top: 6,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #2A2A30 0%, #0E0E12 100%)',
        }}
      />
      {/* oven window */}
      <div
        className="absolute"
        style={{
          left: 6,
          right: 6,
          bottom: 6,
          height: 22,
          background: 'linear-gradient(180deg, #2A1E0E 0%, #0E0A05 100%)',
          borderRadius: 2,
          boxShadow: 'inset 0 0 0 1px #3D2914',
        }}
      >
        <div
          className="absolute inset-1"
          style={{
            background: 'linear-gradient(180deg, rgba(245,165,36,0.3), rgba(245,165,36,0.05))',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
}

function Fridge() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ left: '32%', bottom: 14, width: 48, height: 140 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #F2EAD6 0%, #E4D8B6 100%)',
          border: '2px solid #2F1D0B',
          borderRadius: 3,
          boxShadow: 'inset 4px 0 0 -2px rgba(0,0,0,0.18)',
        }}
      />
      {/* split between freezer + fridge */}
      <div className="absolute inset-x-[2px]" style={{ top: 42, height: 2, background: '#2F1D0B' }} />
      {/* handles */}
      <span className="absolute" style={{ right: 6, top: 16, width: 3, height: 16, background: '#2F1D0B' }} />
      <span className="absolute" style={{ right: 6, top: 62, width: 3, height: 22, background: '#2F1D0B' }} />
      {/* little magnets */}
      <span className="absolute" style={{ left: 10, top: 58, width: 8, height: 8, background: '#9A2C2C', borderRadius: 1 }} />
      <span className="absolute" style={{ left: 22, top: 72, width: 6, height: 6, background: '#4F7A62', borderRadius: 1 }} />
      <span className="absolute" style={{ left: 14, top: 92, width: 9, height: 9, background: '#D9B86A', borderRadius: 1 }} />
    </div>
  );
}

function KitchenShelf() {
  return (
    <div aria-hidden className="absolute" style={{ left: '38%', bottom: 14, width: 40, height: 60 }}>
      <div className="absolute inset-x-0 top-4" style={{ height: 3, background: '#3D2914' }} />
      <div className="absolute inset-x-0 top-24" style={{ height: 3, background: '#3D2914' }} />
      {/* books / jars */}
      {[
        { l: 4, t: 8, w: 6, h: 14, c: '#9A2C2C' },
        { l: 12, t: 8, w: 5, h: 14, c: '#3A5B8A' },
        { l: 19, t: 8, w: 7, h: 14, c: '#A8843E' },
        { l: 28, t: 6, w: 6, h: 16, c: '#4F7A62' },
        { l: 6, t: 30, w: 7, h: 10, c: '#D9B86A' },
        { l: 16, t: 28, w: 5, h: 12, c: '#6A3F6A' },
        { l: 24, t: 30, w: 8, h: 10, c: '#9A2C2C' },
      ].map((b, i) => (
        <span
          key={i}
          className="absolute"
          style={{ left: b.l, top: b.t, width: b.w, height: b.h, background: b.c, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.3)' }}
        />
      ))}
    </div>
  );
}

function CouchCluster() {
  return (
    <div aria-hidden className="absolute" style={{ right: '4%', bottom: 14, width: '22%', height: 80 }}>
      {/* couch base */}
      <div
        className="absolute inset-x-0 bottom-0 h-14"
        style={{
          background: 'linear-gradient(180deg, #B04848 0%, #7E2E2E 100%)',
          borderRadius: '14px 14px 6px 6px',
          boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.35)',
        }}
      />
      {/* cushions */}
      {[6, 38, 70].map((l, i) => (
        <div
          key={i}
          className="absolute bottom-5"
          style={{
            left: `${l}%`,
            width: '24%',
            height: 22,
            background:
              'linear-gradient(180deg, #C66060 0%, #8E3636 100%)',
            borderRadius: 6,
            boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.3)',
          }}
        />
      ))}
      {/* back rest */}
      <div
        className="absolute inset-x-2 top-0 h-8"
        style={{
          background: 'linear-gradient(180deg, #9A3E3E 0%, #7E2E2E 100%)',
          borderRadius: '10px 10px 4px 4px',
        }}
      />
      {/* armrests */}
      <div
        className="absolute left-0 bottom-0 h-14 w-6"
        style={{
          background: 'linear-gradient(180deg, #9A3E3E 0%, #6A1E1E 100%)',
          borderRadius: '10px 4px 4px 10px',
        }}
      />
      <div
        className="absolute right-0 bottom-0 h-14 w-6"
        style={{
          background: 'linear-gradient(180deg, #9A3E3E 0%, #6A1E1E 100%)',
          borderRadius: '4px 10px 10px 4px',
        }}
      />
    </div>
  );
}

function TvConsole({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="absolute" style={{ left: '52%', bottom: 14, width: 110, height: 96 }}>
      {/* console (dresser) */}
      <div
        className="absolute inset-x-0 bottom-0 h-9"
        style={{
          background: 'linear-gradient(180deg, #6E4A28 0%, #4A2F17 100%)',
          border: '2px solid #2F1D0B',
          borderRadius: 3,
        }}
      />
      <div className="absolute inset-x-2" style={{ bottom: 10, height: 2, background: '#2F1D0B' }} />
      <div className="absolute inset-x-2" style={{ bottom: 24, height: 2, background: '#2F1D0B' }} />

      {/* TV */}
      <div
        className="absolute left-4 right-4 bottom-9"
        style={{
          height: 46,
          background: 'linear-gradient(180deg, #141826 0%, #0B1120 100%)',
          border: '3px solid #2F1D0B',
          borderRadius: 4,
          boxShadow: active
            ? '0 0 0 1px rgba(74,232,197,0.4), 0 0 20px rgba(74,232,197,0.3)'
            : '0 0 0 1px rgba(0,0,0,0.6)',
        }}
      >
        <div
          className="absolute inset-1"
          style={{
            background: active
              ? 'linear-gradient(135deg, #4AE8C5 0%, #2FA09A 100%)'
              : 'linear-gradient(135deg, #1A2B3A 0%, #0C1424 100%)',
            borderRadius: 2,
            boxShadow: active ? 'inset 0 0 22px rgba(160, 255, 230, 0.35)' : 'none',
          }}
        />
      </div>

      {/* tiny speaker */}
      <span
        className="absolute"
        style={{
          right: 4,
          bottom: 4,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #2F1D0B 0%, #0C1424 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}

function SideTableRight() {
  return (
    <div aria-hidden className="absolute" style={{ right: '28%', bottom: 14, width: 40, height: 58 }}>
      <div
        className="absolute inset-x-0 bottom-0 h-8"
        style={{
          background: 'linear-gradient(180deg, #6E4A28 0%, #3E2A15 100%)',
          borderRadius: 2,
        }}
      />
      <div
        className="absolute inset-x-2"
        style={{ bottom: 8, height: 2, background: '#2F1D0B' }}
      />
      {/* vase */}
      <span
        className="absolute"
        style={{
          left: 14,
          bottom: 30,
          width: 12,
          height: 18,
          borderRadius: '6px 6px 3px 3px',
          background: 'linear-gradient(180deg, #4A7F95 0%, #25465A 100%)',
        }}
      />
      {/* flowers */}
      <span className="absolute" style={{ left: 16, bottom: 46, width: 3, height: 3, background: '#F5A524', borderRadius: '50%' }} />
      <span className="absolute" style={{ left: 20, bottom: 50, width: 3, height: 3, background: '#E8708A', borderRadius: '50%' }} />
      <span className="absolute" style={{ left: 14, bottom: 50, width: 3, height: 3, background: '#D9B86A', borderRadius: '50%' }} />
    </div>
  );
}

function WallClock() {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ right: '32%', bottom: '36%', width: 28, height: 28 }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #F4E1A7 0%, #D9B86A 60%, #7C5818 100%)',
          boxShadow: '0 3px 6px rgba(0,0,0,0.3), inset 0 0 0 2px #3D2914',
        }}
      />
      {/* hour hand */}
      <div
        className="absolute left-1/2 top-1/2 h-[8px] w-[1.5px] -translate-x-1/2 bg-[#2F1D0B]"
        style={{ transformOrigin: '50% 100%', transform: 'translate(-50%, -100%) rotate(40deg)' }}
      />
      {/* minute hand */}
      <div
        className="absolute left-1/2 top-1/2 h-[11px] w-[1.5px] -translate-x-1/2 bg-[#2F1D0B]"
        style={{ transformOrigin: '50% 100%', transform: 'translate(-50%, -100%) rotate(170deg)' }}
      />
      {/* center dot */}
      <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2F1D0B]" />
    </div>
  );
}

function Plant({ x, y_bottom }: { x: string; y_bottom: number }) {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ left: x, bottom: y_bottom, width: 34, height: 60 }}
    >
      {/* pot */}
      <div
        className="absolute inset-x-2 bottom-0 h-6"
        style={{
          background: 'linear-gradient(180deg, #8C5E35 0%, #4A2F17 100%)',
          borderRadius: '3px 3px 6px 6px',
        }}
      />
      {/* leaves */}
      <span className="absolute" style={{ left: 2, bottom: 22, width: 14, height: 32, borderRadius: '60% 40% 55% 45%', background: 'linear-gradient(135deg, #4F7A62 0%, #2F4A3C 100%)', transform: 'rotate(-18deg)' }} />
      <span className="absolute" style={{ left: 12, bottom: 26, width: 12, height: 34, borderRadius: '55% 50% 50% 55%', background: 'linear-gradient(135deg, #5F8B72 0%, #34503F 100%)' }} />
      <span className="absolute" style={{ left: 20, bottom: 24, width: 12, height: 30, borderRadius: '50% 60% 45% 55%', background: 'linear-gradient(135deg, #4F7A62 0%, #2F4A3C 100%)', transform: 'rotate(14deg)' }} />
    </div>
  );
}

function Doormat({ x }: { x: string }) {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left: x,
        bottom: 10,
        width: 60,
        height: 6,
        background: 'repeating-linear-gradient(90deg, #6E3A2A 0 6px, #4A2515 6px 8px)',
        border: '1px solid #2F1208',
        borderRadius: 2,
      }}
    />
  );
}

/* ─── Lighting overlays ─────────────────────────────────── */

function LampGlow({ x, y, size, color }: { x: string; y: string; size: number; color: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${color} 0%, transparent 60%)`,
        mixBlendMode: 'screen',
      }}
    />
  );
}

function TvGlow({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: '58%',
        bottom: '6%',
        width: 240,
        height: 180,
        background: active
          ? 'radial-gradient(ellipse, rgba(74,232,197,0.22) 0%, transparent 65%)'
          : 'radial-gradient(ellipse, rgba(30,60,80,0.12) 0%, transparent 65%)',
        mixBlendMode: 'screen',
        transition: 'background 0.6s',
      }}
    />
  );
}

/* ─── Chrome ───────────────────────────────────────────── */

function SpeechBubble({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      className="font-mono pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[6px] border px-2.5 py-1 text-[10px] font-bold"
      style={{
        background: 'rgba(23,25,36,0.92)',
        color: '#F4E1A7',
        borderColor: 'rgba(245,225,175,0.35)',
        boxShadow: '0 8px 24px -10px rgba(0,0,0,0.7)',
        transform: 'translate(-50%, 0) rotate(-1deg)',
      }}
    >
      {children}
      <span
        aria-hidden
        className="absolute -bottom-[5px] left-1/2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '5px solid rgba(245,225,175,0.35)',
        }}
      />
    </div>
  );
}

function Pill({ tone, label }: { tone: 'navy' | 'amber' | 'mint'; label: string }) {
  const palette = {
    navy: { bg: 'rgba(23,25,36,0.78)', fg: '#E0E8F5', border: 'rgba(245,225,175,0.22)' },
    amber: { bg: 'rgba(74,44,12,0.78)', fg: '#F5A524', border: 'rgba(245,165,36,0.45)' },
    mint: { bg: 'rgba(12,48,44,0.78)', fg: '#4AE8C5', border: 'rgba(74,232,197,0.4)' },
  }[tone];
  return (
    <span
      className="font-mono inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur"
      style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.fg }} />
      {label}
    </span>
  );
}
