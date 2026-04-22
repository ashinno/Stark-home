import { useEffect, useMemo, useRef, useState } from 'react';
import { Mascot } from './Mascot';
import { useSession } from '../stores/session';
import type { Expr, Pose, Accessory } from '../lib/stark/sprite';
import { call } from '../lib/rpc';
import type { Approval, Job } from '@shared/rpc';
import { cn } from '../lib/cn';

/* ───────────────────────────────────────────────────────────────
 * STARK'S HOUSE — cozy pixel-art top-down.
 *
 * Two rooms side by side, seen from above, in warm daylight.
 *   Left:  the study — desk, monitor, chair, bookshelf, a lobster
 *          on the rug that Stark is fond of.
 *   Right: the kitchen + living nook — coffee bar, counter, couch,
 *          coffee table with a plant.
 * Everything is rendered with sharp blocks (no border-radius on
 * most surfaces) and a limited warm palette so it reads as
 * pixel-art without requiring a spritesheet.
 * ─────────────────────────────────────────────────────────── */

type StationId =
  | 'desk'     // working
  | 'couch'   // idle / jobs
  | 'kitchen' // approvals (carrying things)
  | 'pet'     // greeting the lobster
  | 'plant'   // wandering
  | 'door';   // waiting

type StationDef = {
  x: number;    // % from left of the house frame
  y: number;    // % from top
  expr: Expr;
  pose: Pose;
  accessory: Accessory;
  line: string;
};

const STATIONS: Record<StationId, StationDef> = {
  desk:    { x: 14, y: 28, expr: 'thinking', pose: 'think',   accessory: 'none',     line: 'at the desk, thinking it through.' },
  couch:   { x: 72, y: 58, expr: 'happy',    pose: 'idle',    accessory: 'none',     line: 'on the couch, waiting for you.' },
  kitchen: { x: 70, y: 20, expr: 'happy',    pose: 'carry',   accessory: 'envelope', line: 'brewing coffee + reading mail.' },
  pet:     { x: 26, y: 62, expr: 'happy',    pose: 'wave',    accessory: 'wings',    line: 'saying hi to the lobster.' },
  plant:   { x: 56, y: 78, expr: 'idle',     pose: 'hover',   accessory: 'wings',    line: 'watering the plant.' },
  door:    { x: 48, y: 48, expr: 'idle',     pose: 'idle',    accessory: 'none',     line: 'on the threshold.' },
};

/* Warm pixel-art palette — mirror of the reference. */
const C = {
  wallA: '#3A2E22',         // room edge shadow
  wallB: '#5A4632',         // panelled wall top
  wallLight: '#7A5B3E',     // wall face
  trim: '#2A1B10',          // dark wood trim
  plankA: '#C08451',        // plank highlight
  plankB: '#A56D3F',        // plank base
  plankC: '#8A562E',        // plank shadow
  plankD: '#6B3F1F',        // darkest plank
  rug: '#8F3A2A',           // burgundy rug
  rugTrim: '#5E2318',       // rug border
  wood: '#6B3F1F',           // furniture wood
  woodLight: '#8C5E35',
  woodDark: '#3D2312',
  couchA: '#D1A88A',        // couch cream/tan
  couchB: '#B98966',
  cushion: '#8A5A3C',
  sink: '#C9C3B1',
  countertop: '#E7DCC3',
  tile: '#E8D7B8',
  tileLine: '#B8A57F',
  appliance: '#2F241A',
  applianceHi: '#8C6E48',
  steel: '#6F6558',
  leaf: '#5B8A5E',
  leafDark: '#3F6B47',
  tv: '#18202E',
  tvOn: '#6BD4B3',
  neon: '#F3B93A',
  lobster: '#C93B2F',
  lobsterHi: '#E86A4F',
  window: '#E4E9B2',
  windowLight: '#F6F2C4',
  paper: '#F4EFD5',
  inkDark: '#17110A',
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
  const [station, setStation] = useState<StationId>('couch');
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
      let next: StationId = 'couch';
      if (waving) next = 'pet';
      else if (streaming) next = 'desk';
      else if (approvals.length > 0) next = 'kitchen';
      else if (jobs.length > 0) next = 'desk';
      else if (idleSec > 22 && idleSec < 90) {
        const wander: StationId[] = ['plant', 'kitchen', 'pet', 'door'];
        next = wander[Math.floor(idleSec / 6) % wander.length];
      } else if (idleSec >= 90) next = 'couch';
      setStation((p) => (p === next ? p : next));
    };
    tick();
    const i = window.setInterval(tick, 2200);
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
    const items: { tone: 'amber' | 'mint' | 'cream'; label: string }[] = [];
    if (streaming) items.push({ tone: 'amber', label: 'thinking' });
    if (approvals.length > 0)
      items.push({ tone: 'amber', label: `${approvals.length} approval${approvals.length > 1 ? 's' : ''}` });
    if (jobs.length > 0)
      items.push({ tone: 'mint', label: `${jobs.length} job${jobs.length > 1 ? 's' : ''}` });
    if (items.length === 0) items.push({ tone: 'cream', label: 'all quiet' });
    return items;
  }, [streaming, approvals.length, jobs.length]);

  return (
    <div
      className={cn(
        'stark-home relative isolate overflow-hidden select-none',
        fullscreen && 'h-full w-full',
        className,
      )}
      style={{
        imageRendering: 'pixelated',
        background: '#2B1C12',
      }}
    >
      {/* outer wall frame — a warm dark surround */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${C.wallB} 0%, ${C.wallA} 100%)`,
        }}
      />

      {/* The living floor — two rooms separated by a partition wall.
         We lay a single plank floor then draw the rooms + partition on top. */}
      <PlankFloor />

      {/* Inner rooms: left study + right kitchen/living */}
      <StudyRoom active={station === 'desk' || streaming} />
      <LivingRoom active={station === 'couch' || station === 'kitchen'} />

      {/* Partition wall between the two rooms */}
      <PartitionWall />

      {/* Sunlight wash from the right (big window) */}
      <SunlightWash />

      {/* Stark — walks between stations */}
      <div
        className="absolute z-30"
        style={{
          left: `calc(${def.x}% - 22px)`,
          top: `calc(${def.y}% - 28px)`,
          transition:
            'left 1.4s cubic-bezier(.4,0,.2,1), top 1.4s cubic-bezier(.4,0,.2,1)',
        }}
      >
        <SpeechBubble>{stationLine}</SpeechBubble>
        <button onClick={onClickStark} className="block" title="Say hi to Stark">
          <Mascot
            scale={fullscreen ? 2.25 : 1.8}
            expr={waving ? 'happy' : expr}
            pose={waving ? 'wave' : pose}
            accessory={accessory}
            trackCursor={station === 'couch' && !walking}
          />
        </button>
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: -4,
            width: 46,
            height: 4,
            background: 'rgba(0,0,0,0.3)',
          }}
        />
      </div>

      {/* HUD — top-left brand plate + right pills */}
      <div className="absolute left-3 top-3 z-40">
        <PixelTag>stark's home</PixelTag>
      </div>
      <div className="absolute right-3 top-3 z-40 flex max-w-[min(42vw,240px)] flex-col items-end gap-1.5">
        {pills.map((p, i) => (
          <Pill key={i} tone={p.tone} label={p.label} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * Floor
 * ──────────────────────────────────────────────────────────── */

function PlankFloor() {
  // Repeating horizontal planks with hard 2px shadow seams.
  return (
    <div
      aria-hidden
      className="absolute inset-[10px]"
      style={{
        backgroundColor: C.plankB,
        backgroundImage:
          `repeating-linear-gradient(0deg,
            ${C.plankB} 0px, ${C.plankB} 22px,
            ${C.plankC} 22px, ${C.plankC} 24px,
            ${C.plankA} 24px, ${C.plankA} 44px,
            ${C.plankD} 44px, ${C.plankD} 46px),
           repeating-linear-gradient(90deg,
            transparent 0 120px,
            rgba(0,0,0,0.20) 120px 122px)`,
        boxShadow: `inset 0 0 0 3px ${C.trim}, inset 0 0 0 6px ${C.wallLight}`,
      }}
    />
  );
}

function PartitionWall() {
  return (
    <>
      {/* partition vertical wall (top-down) */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: '42%',
          top: '10px',
          bottom: '10px',
          width: 10,
          background: `linear-gradient(90deg, ${C.wallA} 0%, ${C.wallLight} 50%, ${C.wallA} 100%)`,
          boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.08), 6px 0 14px rgba(0,0,0,0.25)',
          zIndex: 10,
        }}
      />
      {/* gap — doorway */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: '41%',
          top: '42%',
          width: '3%',
          height: '14%',
          background: C.plankB,
          boxShadow: `inset 0 0 0 2px ${C.trim}`,
          zIndex: 11,
        }}
      />
    </>
  );
}

function SunlightWash() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        right: 0,
        top: 0,
        width: '60%',
        height: '60%',
        background:
          'linear-gradient(225deg, rgba(255,232,170,0.16) 0%, transparent 55%)',
        mixBlendMode: 'screen',
        zIndex: 20,
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────
 * Left room — the study
 * ──────────────────────────────────────────────────────────── */

function StudyRoom({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="absolute" style={{ left: '3%', top: '3%', width: '38%', height: '94%' }}>
      {/* whiteboard / pinned items on back wall */}
      <PixelRect left="6%" top="4%" width="36%" height="12%" bg="#E8E1C5" border={C.trim}>
        {/* pinned notes */}
        <span className="absolute" style={{ left: 6, top: 4, width: 10, height: 8, background: '#FFD479' }} />
        <span className="absolute" style={{ left: 22, top: 6, width: 12, height: 8, background: '#B4E39F' }} />
        <span className="absolute" style={{ left: 38, top: 4, width: 10, height: 8, background: '#F6A68E' }} />
        <span className="absolute" style={{ left: 6, top: 16, width: 46, height: 2, background: '#8A7A52' }} />
      </PixelRect>

      {/* picture frame (small) */}
      <PixelRect left="44%" top="6%" width="7%" height="9%" bg="#4C3320" border={C.trim}>
        <div className="absolute inset-[2px]" style={{ background: '#C98A5E' }} />
      </PixelRect>

      {/* Desk — big dark wood slab */}
      <PixelRect left="4%" top="20%" width="42%" height="18%" bg={C.wood} border={C.trim}>
        {/* keyboard */}
        <div className="absolute" style={{ left: '14%', top: '60%', width: '36%', height: 6, background: '#0E0A07', boxShadow: `inset 0 -1px 0 ${C.trim}` }} />
        {/* mouse */}
        <div className="absolute" style={{ left: '54%', top: '62%', width: 7, height: 10, background: '#0E0A07' }} />
        {/* mug */}
        <div className="absolute" style={{ left: '70%', top: '26%', width: 10, height: 10, background: '#D9B86A', boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
        <div className="absolute" style={{ left: '72%', top: '24%', width: 4, height: 2, background: 'rgba(180,220,255,0.5)' }} />
      </PixelRect>

      {/* monitor — with live "glow" when agent is active */}
      <PixelRect left="10%" top="17%" width="30%" height="10%" bg={C.tv} border={C.trim}>
        <div
          className="absolute inset-[2px]"
          style={{
            background: active
              ? `linear-gradient(135deg, ${C.tvOn} 0%, #2E9C82 100%)`
              : `linear-gradient(135deg, #24324B 0%, #0F1626 100%)`,
            boxShadow: active ? `inset 0 0 18px rgba(160,255,230,0.4)` : 'none',
          }}
        >
          {/* ascii-ish rows */}
          {[3, 8, 13, 18].map((t) => (
            <span
              key={t}
              className="absolute"
              style={{
                left: 3,
                top: t,
                height: 2,
                width: active ? 36 : 28,
                background: active ? 'rgba(255,255,255,0.6)' : 'rgba(200,220,255,0.25)',
              }}
            />
          ))}
        </div>
      </PixelRect>

      {/* desk chair (office swivel, top-down) */}
      <PixelRect left="20%" top="40%" width="10%" height="12%" bg="#191B22" border={C.trim}>
        <div className="absolute inset-[3px]" style={{ background: '#2A2F3D' }} />
      </PixelRect>
      {/* wheels */}
      <span className="absolute" style={{ left: '22%', top: '52%', width: 4, height: 3, background: C.trim }} />
      <span className="absolute" style={{ left: '28%', top: '52%', width: 4, height: 3, background: C.trim }} />

      {/* floor lamp */}
      <div className="absolute" style={{ left: '3%', top: '42%', width: 22, height: 22 }}>
        <div
          className="absolute"
          style={{
            left: 2, top: 0, width: 18, height: 12,
            background: 'radial-gradient(ellipse at 50% 40%, #FFE9A7 0%, #E9C774 55%, #8A6B34 100%)',
            boxShadow: `inset 0 0 0 2px ${C.trim}, 0 0 22px rgba(255,225,140,0.45)`,
          }}
        />
        <div className="absolute" style={{ left: 9, top: 12, width: 2, height: 8, background: C.trim }} />
        <div className="absolute" style={{ left: 6, top: 20, width: 10, height: 2, background: C.trim }} />
      </div>

      {/* Bookshelf (tall, right edge) */}
      <PixelRect left="70%" top="18%" width="26%" height="32%" bg={C.wood} border={C.trim}>
        {/* shelf lines */}
        {[20, 42, 64, 86].map((t) => (
          <div key={t} className="absolute" style={{ left: 2, right: 2, top: `${t}%`, height: 2, background: C.trim }} />
        ))}
        {/* books */}
        {[
          { t: 3, cols: ['#B8433B', '#2F6F8C', '#CE9A3E', '#4C7A52', '#7A3C5B'] },
          { t: 25, cols: ['#CE9A3E', '#4C7A52', '#B8433B', '#2F6F8C'] },
          { t: 47, cols: ['#4C7A52', '#B8433B', '#CE9A3E'] },
          { t: 69, cols: ['#7A3C5B', '#2F6F8C', '#B8433B', '#4C7A52'] },
        ].map((row, i) => (
          <div key={i} className="absolute" style={{ left: 3, right: 3, top: `${row.t}%`, height: 18 }}>
            {row.cols.map((c, j) => (
              <span
                key={j}
                className="inline-block mr-[1px]"
                style={{ width: 7 + ((j * 3) % 5), height: 16 - ((j * 2) % 5), background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)', verticalAlign: 'bottom' }}
              />
            ))}
          </div>
        ))}
      </PixelRect>

      {/* Rug in front of the desk */}
      <PixelRect left="6%" top="54%" width="58%" height="28%" bg={C.rug} border={C.rugTrim}>
        <div className="absolute inset-[3px]" style={{ boxShadow: `inset 0 0 0 2px ${C.rug}`, background: 'repeating-linear-gradient(45deg, transparent 0 5px, rgba(255,210,160,0.08) 5px 7px)' }} />
      </PixelRect>

      {/* Lobster on the rug — nod to the reference scene */}
      <Lobster left="22%" top="56%" />

      {/* Floor plant near the bookshelf */}
      <FloorPlant left="74%" top="54%" big />

      {/* Shoes by the doorway */}
      <PixelRect left="60%" top="86%" width="7%" height="4%" bg={C.woodDark} border={C.trim} />
      <PixelRect left="69%" top="86%" width="7%" height="4%" bg={C.woodDark} border={C.trim} />
    </div>
  );
}

function Lobster({ left, top }: { left: string; top: string }) {
  return (
    <div className="absolute" style={{ left, top, width: 70, height: 56 }}>
      {/* body */}
      <div className="absolute" style={{ left: 14, top: 20, width: 42, height: 24, background: C.lobster, boxShadow: `inset 0 0 0 2px ${C.trim}, inset -6px 0 0 -3px ${C.lobsterHi}` }} />
      {/* tail */}
      <div className="absolute" style={{ left: 6, top: 22, width: 12, height: 20, background: C.lobster, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      <div className="absolute" style={{ left: 0, top: 26, width: 10, height: 12, background: C.lobster, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      {/* claws */}
      <div className="absolute" style={{ right: -4, top: 6, width: 18, height: 12, background: C.lobster, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      <div className="absolute" style={{ right: -4, top: 36, width: 18, height: 12, background: C.lobster, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      <div className="absolute" style={{ right: 10, top: 8, width: 4, height: 4, background: C.trim }} />
      <div className="absolute" style={{ right: 10, top: 38, width: 4, height: 4, background: C.trim }} />
      {/* antennae */}
      <div className="absolute" style={{ right: 8, top: 18, width: 10, height: 2, background: C.trim, transform: 'rotate(-18deg)' }} />
      <div className="absolute" style={{ right: 8, top: 26, width: 10, height: 2, background: C.trim, transform: 'rotate(14deg)' }} />
      {/* eyes */}
      <div className="absolute" style={{ right: 14, top: 22, width: 2, height: 2, background: '#111' }} />
      <div className="absolute" style={{ right: 14, top: 28, width: 2, height: 2, background: '#111' }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * Right room — kitchen + living
 * ──────────────────────────────────────────────────────────── */

function LivingRoom({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="absolute" style={{ left: '44%', top: '3%', width: '53%', height: '94%' }}>
      {/* Big window on back wall */}
      <PixelRect left="32%" top="3%" width="38%" height="11%" bg={C.window} border={C.trim}>
        <div className="absolute inset-[2px]" style={{ background: C.windowLight }} />
        {/* mullions */}
        <div className="absolute" style={{ left: '50%', top: 0, bottom: 0, width: 2, background: C.trim }} />
        <div className="absolute" style={{ left: 0, right: 0, top: '50%', height: 2, background: C.trim }} />
      </PixelRect>

      {/* Kitchen counter — L-shape along top + left */}
      <PixelRect left="4%" top="14%" width="62%" height="9%" bg={C.countertop} border={C.trim}>
        {/* counter seam */}
        <div className="absolute inset-[2px]" style={{ background: `linear-gradient(180deg, ${C.countertop} 0%, #D3C5A1 100%)` }} />
      </PixelRect>
      {/* cabinets beneath counter */}
      <PixelRect left="4%" top="22%" width="62%" height="3%" bg={C.tile} border={C.trim} />

      {/* Kettle */}
      <PixelRect left="8%" top="16%" width="5%" height="6%" bg="#D14A3A" border={C.trim}>
        <div className="absolute" style={{ left: 3, top: 2, width: 4, height: 2, background: C.trim }} />
      </PixelRect>
      {/* Two coffee machines side by side */}
      <CoffeeMachine left="18%" top="14%" />
      <CoffeeMachine left="30%" top="14%" />

      {/* Mugs on the counter */}
      <span className="absolute" style={{ left: '44%', top: '19%', width: 6, height: 6, background: '#F4EFD5', boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
      <span className="absolute" style={{ left: '50%', top: '19%', width: 6, height: 6, background: '#F4EFD5', boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
      <span className="absolute" style={{ left: '56%', top: '19%', width: 6, height: 6, background: '#F4EFD5', boxShadow: `inset 0 0 0 1px ${C.trim}` }} />

      {/* Fridge at the right end of counter */}
      <PixelRect left="68%" top="14%" width="10%" height="18%" bg={C.tile} border={C.trim}>
        <div className="absolute" style={{ left: 2, right: 2, top: '33%', height: 2, background: C.trim }} />
        <span className="absolute" style={{ right: 4, top: 6, width: 2, height: 10, background: C.trim }} />
        <span className="absolute" style={{ right: 4, top: '45%', width: 2, height: 14, background: C.trim }} />
        {/* magnet */}
        <span className="absolute" style={{ left: 6, top: '60%', width: 4, height: 4, background: '#4C7A52' }} />
      </PixelRect>

      {/* Tile splashback (subtle) */}
      <div className="absolute" style={{ left: '4%', right: '22%', top: '12%', height: 2, background: C.tileLine }} />

      {/* Sofa — cream, top-down */}
      <PixelRect left="40%" top="48%" width="54%" height="18%" bg={C.couchB} border={C.trim}>
        {/* back cushion */}
        <div className="absolute" style={{ left: 3, right: 3, top: 2, height: '40%', background: C.couchA, boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
        {/* seat cushions */}
        {[4, 36, 68].map((l, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${l}%`, top: '44%', width: '28%', height: '48%',
              background: C.couchA,
              boxShadow: `inset 0 0 0 1px ${C.trim}`,
            }}
          />
        ))}
      </PixelRect>
      {/* armrests */}
      <PixelRect left="38%" top="48%" width="3%" height="18%" bg={C.couchB} border={C.trim} />
      <PixelRect left="93%" top="48%" width="3%" height="18%" bg={C.couchB} border={C.trim} />

      {/* Coffee table */}
      <PixelRect left="52%" top="70%" width="28%" height="10%" bg={C.wood} border={C.trim}>
        <div className="absolute inset-[2px]" style={{ background: 'linear-gradient(180deg, #8C5E35 0%, #5A3A1E 100%)' }} />
        {/* potted plant centerpiece */}
        <div className="absolute" style={{ left: '36%', top: '15%', width: 12, height: 10, background: C.woodDark, boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
        <div className="absolute" style={{ left: '33%', top: '-40%', width: 18, height: 14, background: C.leaf, boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
        <div className="absolute" style={{ left: '40%', top: '-55%', width: 8, height: 10, background: C.leafDark }} />
      </PixelRect>

      {/* TV on the sidewall */}
      <PixelRect left="2%" top="52%" width="5%" height="16%" bg={C.tv} border={C.trim}>
        <div
          className="absolute inset-[2px]"
          style={{
            background: active ? `linear-gradient(135deg, ${C.tvOn} 0%, #2E9C82 100%)` : `linear-gradient(135deg, #24324B 0%, #0F1626 100%)`,
            boxShadow: active ? `0 0 16px rgba(107,212,179,0.45)` : 'none',
          }}
        />
      </PixelRect>
      {/* TV console */}
      <PixelRect left="1%" top="70%" width="8%" height="4%" bg={C.wood} border={C.trim} />

      {/* Rug under coffee table */}
      <PixelRect left="44%" top="76%" width="44%" height="16%" bg="#D4B994" border={C.trim}>
        <div className="absolute inset-[3px]" style={{ background: 'repeating-linear-gradient(0deg, transparent 0 6px, rgba(0,0,0,0.08) 6px 7px)' }} />
      </PixelRect>

      {/* Floor plant in the corner */}
      <FloorPlant left="87%" top="64%" big />

      {/* Decorative shelf on sidewall */}
      <PixelRect left="0" top="24%" width="4%" height="20%" bg={C.wood} border={C.trim}>
        {[4, 28, 52, 76].map((t, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: 2, right: 2, top: `${t}%`, height: '14%',
              background: i % 2 ? '#CE9A3E' : '#4C7A52',
              boxShadow: `inset 0 0 0 1px ${C.trim}`,
            }}
          />
        ))}
      </PixelRect>
    </div>
  );
}

function CoffeeMachine({ left, top }: { left: string; top: string }) {
  return (
    <div className="absolute" style={{ left, top, width: 28, height: 34 }}>
      {/* body */}
      <div className="absolute inset-0" style={{ background: C.appliance, boxShadow: `inset 0 0 0 2px ${C.trim}, inset 0 -4px 0 ${C.applianceHi}` }} />
      {/* carafe */}
      <div className="absolute" style={{ left: 6, top: 14, width: 16, height: 14, background: '#1B1613', boxShadow: `inset 0 0 0 1px ${C.trim}` }} />
      <div className="absolute" style={{ left: 8, top: 16, width: 12, height: 8, background: '#6B4430' }} />
      {/* steam */}
      <span className="absolute" style={{ left: 10, top: -6, width: 2, height: 6, background: 'rgba(255,255,255,0.35)' }} />
      <span className="absolute" style={{ left: 16, top: -4, width: 2, height: 4, background: 'rgba(255,255,255,0.25)' }} />
      {/* button */}
      <span className="absolute" style={{ right: 4, top: 6, width: 3, height: 3, background: C.neon, boxShadow: `0 0 6px ${C.neon}` }} />
    </div>
  );
}

function FloorPlant({ left, top, big }: { left: string; top: string; big?: boolean }) {
  const size = big ? 44 : 32;
  return (
    <div className="absolute" style={{ left, top, width: size, height: size }}>
      {/* pot */}
      <div
        className="absolute"
        style={{
          left: size * 0.25, bottom: 0, width: size * 0.5, height: size * 0.38,
          background: C.woodDark,
          boxShadow: `inset 0 0 0 2px ${C.trim}, inset 0 -3px 0 #20140A`,
        }}
      />
      {/* leaves — blocky monstera-ish */}
      <div className="absolute" style={{ left: size * 0.08, top: 2, width: size * 0.35, height: size * 0.52, background: C.leafDark, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      <div className="absolute" style={{ left: size * 0.32, top: -2, width: size * 0.4, height: size * 0.6, background: C.leaf, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      <div className="absolute" style={{ left: size * 0.58, top: 4, width: size * 0.3, height: size * 0.5, background: C.leafDark, boxShadow: `inset 0 0 0 2px ${C.trim}` }} />
      {/* leaf slit */}
      <div className="absolute" style={{ left: size * 0.42, top: 10, width: 2, height: size * 0.35, background: C.trim }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * Shared pixel primitives
 * ──────────────────────────────────────────────────────────── */

function PixelRect({
  left, top, width, height, bg, border, children,
}: {
  left: string | number;
  top: string | number;
  width: string | number;
  height: string | number;
  bg: string;
  border?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="absolute"
      style={{
        left,
        top,
        width,
        height,
        background: bg,
        boxShadow: border ? `inset 0 0 0 2px ${border}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Chrome ───────────────────────────────────────────── */

function SpeechBubble({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      className="font-mono pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
      style={{
        background: C.paper,
        color: C.inkDark,
        boxShadow: `inset 0 0 0 2px ${C.trim}, 3px 3px 0 ${C.trim}`,
        transform: 'translate(-50%, 0) rotate(-1deg)',
      }}
    >
      {children}
    </div>
  );
}

function PixelTag({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
      style={{
        background: C.paper,
        color: C.inkDark,
        boxShadow: `inset 0 0 0 2px ${C.trim}, 3px 3px 0 ${C.trim}`,
      }}
    >
      <span
        className="mr-1.5 inline-block h-2 w-2 align-middle"
        style={{ background: C.neon, boxShadow: `inset 0 0 0 1px ${C.trim}` }}
      />
      {children}
    </div>
  );
}

function Pill({ tone, label }: { tone: 'amber' | 'mint' | 'cream'; label: string }) {
  const palette = {
    amber: { bg: '#FFD479', fg: C.inkDark, dot: '#C83E2F' },
    mint: { bg: '#B4E39F', fg: C.inkDark, dot: '#2B5B3A' },
    cream: { bg: C.paper, fg: C.inkDark, dot: C.trim },
  }[tone];
  return (
    <span
      className="font-mono inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
      style={{
        background: palette.bg,
        color: palette.fg,
        boxShadow: `inset 0 0 0 2px ${C.trim}, 2px 2px 0 ${C.trim}`,
      }}
    >
      <span className="inline-block h-2 w-2" style={{ background: palette.dot }} />
      {label}
    </span>
  );
}
