import { useEffect, useMemo, useRef, useState } from 'react';
import { Mascot } from './Mascot';
import { useSession } from '../stores/session';
import type { Expr, Pose, Accessory } from '../lib/stark/sprite';
import { call } from '../lib/rpc';
import type { Approval, Job } from '@shared/rpc';
import { cn } from '../lib/cn';

/* ─── Stark's mansion ──────────────────────────────────────────
 *
 * A multi-floor pixel-art house. Stark walks between rooms
 * (left + top transitions) based on what the agent is doing.
 *
 * Floors (top → bottom):
 *   3. Roof          — chimney with rising smoke
 *   2. Top floor     — Bedroom · Bathroom · Library
 *   1. Mid floor     — Kitchen · Server room · Mailroom
 *   0. Ground floor  — Living/Office (Desk · Clock · Bookshelf · Plant)
 *  -1. Garden        — Path · Tree · Mailbox · Flowers · Pond
 *
 * Stark's `(x, y)` is computed in % of the viewport so the layout
 * scales with the panel size.
 * ─────────────────────────────────────────────────────────── */

type StationId =
  | 'bed'
  | 'library'
  | 'kitchen'
  | 'servers'
  | 'mailroom'
  | 'desk'
  | 'shelf'
  | 'garden'
  | 'hero';

type StationDef = {
  // % from left, % from bottom (so floors line up with bottom).
  x: number;
  y: number;
  expr: Expr;
  pose: Pose;
  accessory: Accessory;
  line: string;
};

const STATIONS: Record<StationId, StationDef> = {
  // Top floor
  bed:      { x: 12, y: 56, expr: 'sleepy',   pose: 'idle',  accessory: 'none',     line: 'taking five.' },
  library:  { x: 80, y: 56, expr: 'idle',     pose: 'idle',  accessory: 'none',     line: 'reading up on something.' },
  // Middle floor
  kitchen:  { x: 14, y: 30, expr: 'happy',    pose: 'idle',  accessory: 'none',     line: 'making something warm.' },
  servers:  { x: 50, y: 30, expr: 'loading',  pose: 'loading', accessory: 'wings',  line: 'spinning up the racks…' },
  mailroom: { x: 82, y: 30, expr: 'happy',    pose: 'carry', accessory: 'envelope', line: 'sorting your inbox…' },
  // Ground floor
  desk:     { x: 50, y: 6,  expr: 'thinking', pose: 'think', accessory: 'none',     line: 'on it — give me a second.' },
  shelf:    { x: 78, y: 6,  expr: 'idle',     pose: 'idle',  accessory: 'none',     line: 'browsing skills.' },
  // Garden + hero
  garden:   { x: 22, y: -14, expr: 'happy',   pose: 'idle',  accessory: 'wings',    line: 'a little fresh air.' },
  hero:     { x: 50, y: 6,  expr: 'idle',     pose: 'wave',  accessory: 'wings',    line: 'ready when you are.' },
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
  const [station, setStation] = useState<StationId>('hero');
  const [bubble, setBubble] = useState<string | null>(null);
  const [waving, setWaving] = useState(false);
  const idleSinceRef = useRef<number>(Date.now());

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
    if (streaming || approvals.length > 0 || jobs.length > 0) {
      idleSinceRef.current = Date.now();
    }
  }, [streaming, approvals.length, jobs.length]);

  // Choose where Stark goes based on real state.
  useEffect(() => {
    const tick = () => {
      const idleSec = (Date.now() - idleSinceRef.current) / 1000;
      let next: StationId = 'hero';
      if (waving) next = 'hero';
      else if (streaming) next = 'desk';
      else if (approvals.length > 0) next = 'mailroom';
      else if (jobs.length > 0) next = 'servers';
      else if (idleSec > 18 && idleSec < 90) {
        // wander gently
        const wanderSpots: StationId[] = ['library', 'kitchen', 'shelf', 'garden'];
        next = wanderSpots[Math.floor(idleSec / 6) % wanderSpots.length];
      } else if (idleSec >= 90) next = 'bed';
      else next = 'hero';
      setStation((p) => (p === next ? p : next));
    };
    tick();
    const i = window.setInterval(tick, 2000);
    return () => window.clearInterval(i);
  }, [streaming, approvals.length, jobs.length, waving]);

  const def = STATIONS[station];

  // Walking choreography — pose=hover while transitioning.
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    setWalking(true);
    const t = window.setTimeout(() => setWalking(false), 1500);
    return () => window.clearTimeout(t);
  }, [station]);

  const expr: Expr = walking ? 'idle' : def.expr;
  const pose: Pose = walking ? 'hover' : def.pose;
  const accessory: Accessory = walking ? 'wings' : def.accessory;
  const stationLine = bubble ?? (waving ? `Hi${userName ? `, ${userName}` : ''}!` : def.line);

  function onClickStark() {
    setWaving(true);
    setBubble(`Hi${userName ? `, ${userName}` : ''}! I'm Stark.`);
    window.setTimeout(() => {
      setWaving(false);
      setBubble(null);
    }, 2500);
  }

  const pills = useMemo(() => {
    const items: { tone: 'navy' | 'amber' | 'mint' | 'rose'; label: string }[] = [];
    if (streaming) items.push({ tone: 'amber', label: 'thinking' });
    if (approvals.length > 0)
      items.push({ tone: 'amber', label: `${approvals.length} approval${approvals.length > 1 ? 's' : ''}` });
    if (jobs.length > 0)
      items.push({ tone: 'mint', label: `${jobs.length} job${jobs.length > 1 ? 's' : ''} running` });
    if (items.length === 0) items.push({ tone: 'navy', label: 'all caught up' });
    return items;
  }, [streaming, approvals.length, jobs.length]);

  return (
    <div
      className={cn(
        'stark-mansion relative isolate overflow-hidden',
        fullscreen && 'h-full w-full',
        className,
      )}
    >
      {/* ───── Sky ───── */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #C7D9F2 0%, #DCE6F4 30%, #F4EEDF 55%, #DDC9A6 100%)',
        }}
      />
      {/* faint grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(20,23,37,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(20,23,37,.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* sun */}
      <div
        aria-hidden
        className="absolute"
        style={{
          right: '12%',
          top: '6%',
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #FFD277 0%, #F5A524 60%, transparent 75%)',
          filter: 'drop-shadow(0 0 30px rgba(245,165,36,0.45))',
        }}
      />
      {/* clouds */}
      <Cloud left="8%" top="10%" />
      <Cloud left="42%" top="6%" small />
      <Cloud left="68%" top="14%" />

      {/* ───── Mansion silhouette ─────
          Anchored at the bottom; we draw from y-bottom upward. */}
      <div className="absolute inset-x-0 bottom-0 top-0">
        {/* Roof + chimney */}
        <Roof />
        {/* House body container — three floors */}
        <House />
        {/* Garden in front of the house */}
        <Garden approvalsPending={approvals.length > 0} />
      </div>

      {/* ───── Stark ───── */}
      <div
        className="absolute z-20"
        style={{
          left: `clamp(72px, calc(${def.x}% - 64px), calc(100% - 140px))`,
          bottom: `clamp(42px, calc(${def.y}% + 64px), calc(100% - 168px))`,
          transition:
            'left 1.4s cubic-bezier(.4,0,.2,1), bottom 1.4s cubic-bezier(.4,0,.2,1)',
        }}
      >
        <SpeechBubble>{stationLine}</SpeechBubble>
        <div onClick={onClickStark} title="Hi, I'm Stark — click for a wave.">
          <Mascot
            scale={3}
            expr={waving ? 'happy' : expr}
            pose={waving ? 'wave' : pose}
            accessory={accessory}
            trackCursor={station === 'hero' && !walking}
          />
        </div>
        {/* hover/floor shadow */}
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: -8,
            width: 76,
            height: 5,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse, rgba(20,23,37,0.28), transparent 70%)',
          }}
        />
      </div>

      {/* ───── Top-right HUD ───── */}
      <div className="absolute right-4 top-4 z-30 flex max-w-[min(42vw,260px)] flex-col items-end gap-1.5">
        {pills.map((p, i) => (
          <Pill key={i} tone={p.tone} label={p.label} />
        ))}
      </div>

      {/* ───── Top-left brand ───── */}
      <div
        className="font-mono absolute left-4 top-4 z-30 inline-flex max-w-[min(46vw,240px)] items-center gap-2 truncate rounded-[3px] border-2 border-[#1C2340] bg-[#F4EEDF] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1C2340]"
        style={{ boxShadow: '3px 3px 0 #1C2340' }}
      >
        <span className="inline-block h-2 w-2 bg-[#F5A524] outline outline-1 outline-[#1C2340]" />
        <span className="truncate">stark · the mansion</span>
      </div>
    </div>
  );
}

/* ─── Major scene parts ────────────────────────────────────────── */

function Roof() {
  return (
    <>
      {/* roof triangle */}
      <div
        className="absolute"
        aria-hidden
        style={{
          left: '6%',
          right: '6%',
          bottom: '74%',
          height: '12%',
          background:
            'linear-gradient(180deg, #6b3f1f 0%, #8a4f2a 40%, #6b3f1f 100%)',
          clipPath: 'polygon(0 100%, 50% 0, 100% 100%)',
          boxShadow: 'inset 0 -3px 0 #4a2a14',
        }}
      />
      {/* dormers — small triangle windows on the roof */}
      <Pixel
        className="absolute"
        style={{ left: '24%', bottom: '76%', width: 36, height: 28 }}
        layers={[
          { x: 0, y: 14, w: 36, h: 14, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 6, y: 18, w: 24, h: 8, fill: '#9EE6C9' },
          { x: 6, y: 0, w: 24, h: 18, fill: 'transparent' },
        ]}
      />
      <Pixel
        className="absolute"
        style={{ left: '64%', bottom: '76%', width: 36, height: 28 }}
        layers={[
          { x: 0, y: 14, w: 36, h: 14, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 6, y: 18, w: 24, h: 8, fill: '#9EE6C9' },
        ]}
      />

      {/* chimney */}
      <div
        className="absolute"
        aria-hidden
        style={{
          left: '78%',
          bottom: '82%',
          width: 22,
          height: 36,
          background: '#7a4f25',
          boxShadow: 'inset -3px 0 0 #4a2a14, 0 0 0 2px #1C2340',
        }}
      />
      {/* chimney smoke */}
      <Smoke left="79%" bottom="90%" delay={0} />
      <Smoke left="80%" bottom="92%" delay={1.2} />
      <Smoke left="78%" bottom="94%" delay={2.4} />
    </>
  );
}

function House() {
  return (
    <>
      {/* main facade — three floors, anchored bottom */}
      <div
        className="absolute"
        aria-hidden
        style={{
          left: '6%',
          right: '6%',
          bottom: '12%',
          top: '14%',
          background:
            'linear-gradient(180deg, #F4EEDF 0%, #EBE2CB 100%)',
          border: '3px solid #1C2340',
          boxShadow: '6px 6px 0 #1C2340',
          backgroundImage:
            'linear-gradient(rgba(20,23,37,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(20,23,37,.07) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* floor dividers */}
      <div className="absolute" aria-hidden style={{ left: '6%', right: '6%', top: '37%', height: 3, background: '#1C2340' }} />
      <div className="absolute" aria-hidden style={{ left: '6%', right: '6%', top: '60%', height: 3, background: '#1C2340' }} />
      <div className="absolute" aria-hidden style={{ left: '6%', right: '6%', bottom: '12%', height: 8, background: '#C28a55', boxShadow: 'inset 0 2px 0 #F4EEDF, inset 0 -2px 0 #1C2340' }} />

      {/* room dividers — interior walls (slim) */}
      <Wall left="35%" topPct={14} bottomPct={37} />
      <Wall left="65%" topPct={14} bottomPct={37} />
      <Wall left="35%" topPct={37} bottomPct={60} />
      <Wall left="65%" topPct={37} bottomPct={60} />

      {/* ─── TOP FLOOR ─── */}
      <Bedroom left="6%" right="35%" />
      <Bathroom left="35%" right="65%" />
      <Library left="65%" right="94%" />

      {/* ─── MIDDLE FLOOR ─── */}
      <Kitchen left="6%" right="35%" />
      <ServerRoom left="35%" right="65%" />
      <Mailroom left="65%" right="94%" />

      {/* ─── GROUND FLOOR ─── */}
      <LivingRoom left="6%" right="65%" />
      <BookshelfWall left="65%" right="94%" />
      <FrontSteps />
    </>
  );
}

/* ─── Top floor rooms ─── */

function Bedroom({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '14%', '37%')}>
      <RoomLabel>bedroom</RoomLabel>
      <Pixel
        className="absolute"
        style={{ left: 14, bottom: 8, width: 90, height: 38 }}
        layers={[
          { x: 0, y: 24, w: 90, h: 14, fill: '#EBE2CB', stroke: '#1C2340' },
          { x: 6, y: 14, w: 26, h: 14, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 32, y: 24, w: 56, h: 14, fill: '#9EE6C9', stroke: '#1C2340' },
          { x: 4, y: 38, w: 4, h: 6, fill: '#1C2340' },
          { x: 82, y: 38, w: 4, h: 6, fill: '#1C2340' },
        ]}
      />
      {/* lamp */}
      <Pixel
        className="absolute"
        style={{ right: 14, bottom: 22, width: 16, height: 32 }}
        layers={[
          { x: 6, y: 0, w: 4, h: 22, fill: '#1C2340' },
          { x: 0, y: 22, w: 16, h: 8, fill: '#F5A524', stroke: '#1C2340' },
        ]}
      />
      {/* moonlight glow on lamp */}
      <span
        aria-hidden
        className="absolute"
        style={{
          right: 18,
          bottom: 44,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #FFD277, transparent)',
          filter: 'blur(1px)',
        }}
      />
    </div>
  );
}

function Bathroom({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '14%', '37%')}>
      <RoomLabel>bath</RoomLabel>
      {/* tub */}
      <Pixel
        className="absolute"
        style={{ left: 12, bottom: 8, width: 60, height: 28 }}
        layers={[
          { x: 0, y: 8, w: 60, h: 20, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 6, y: 12, w: 48, h: 12, fill: '#9EE6C9' },
          { x: 50, y: 0, w: 6, h: 12, fill: '#1C2340' }, // faucet
        ]}
      />
    </div>
  );
}

function Library({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '14%', '37%')}>
      <RoomLabel>library</RoomLabel>
      {/* tall shelves */}
      <Pixel
        className="absolute"
        style={{ left: 12, bottom: 6, width: 100, height: 80 }}
        layers={[
          { x: 0, y: 0, w: 100, h: 6, fill: '#7a4f25' },
          { x: 0, y: 28, w: 100, h: 4, fill: '#7a4f25' },
          { x: 0, y: 56, w: 100, h: 4, fill: '#7a4f25' },
          { x: 0, y: 78, w: 100, h: 2, fill: '#7a4f25' },
          ...books(0, 6, 100, 22),
          ...books(0, 32, 100, 22),
          ...books(0, 60, 100, 16),
        ]}
      />
      {/* armchair */}
      <Pixel
        className="absolute"
        style={{ right: 8, bottom: 6, width: 28, height: 26 }}
        layers={[
          { x: 0, y: 6, w: 28, h: 14, fill: '#E8708A', stroke: '#1C2340' },
          { x: 0, y: 0, w: 8, h: 14, fill: '#E8708A', stroke: '#1C2340' },
        ]}
      />
    </div>
  );
}

/* ─── Middle floor rooms ─── */

function Kitchen({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '37%', '60%')}>
      <RoomLabel>kitchen</RoomLabel>
      {/* counter */}
      <Pixel
        className="absolute"
        style={{ left: 6, bottom: 6, width: 110, height: 40 }}
        layers={[
          { x: 0, y: 30, w: 110, h: 10, fill: '#7a4f25', stroke: '#1C2340' },
          // lower cupboards
          { x: 0, y: 0, w: 30, h: 30, fill: '#EBE2CB', stroke: '#1C2340' },
          { x: 30, y: 0, w: 30, h: 30, fill: '#EBE2CB', stroke: '#1C2340' },
          { x: 60, y: 0, w: 50, h: 30, fill: '#EBE2CB', stroke: '#1C2340' },
          // stove
          { x: 65, y: 30, w: 30, h: 6, fill: '#1C2340' },
          { x: 70, y: 32, w: 6, h: 4, fill: '#F5A524' },
          { x: 84, y: 32, w: 6, h: 4, fill: '#F5A524' },
        ]}
      />
      {/* fridge */}
      <Pixel
        className="absolute"
        style={{ right: 4, bottom: 6, width: 24, height: 56 }}
        layers={[
          { x: 0, y: 0, w: 24, h: 56, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 0, y: 24, w: 24, h: 2, fill: '#1C2340' },
          { x: 18, y: 28, w: 2, h: 6, fill: '#1C2340' },
          { x: 18, y: 6, w: 2, h: 6, fill: '#1C2340' },
        ]}
      />
    </div>
  );
}

function ServerRoom({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '37%', '60%')}>
      <RoomLabel>servers</RoomLabel>
      {/* server racks */}
      {[10, 60].map((x, i) => (
        <Pixel
          key={i}
          className="absolute"
          style={{ left: x, bottom: 6, width: 44, height: 70 }}
          layers={[
            { x: 0, y: 0, w: 44, h: 70, fill: '#1C2340' },
            { x: 4, y: 6, w: 36, h: 8, fill: '#0c1028' },
            { x: 4, y: 18, w: 36, h: 8, fill: '#0c1028' },
            { x: 4, y: 30, w: 36, h: 8, fill: '#0c1028' },
            { x: 4, y: 42, w: 36, h: 8, fill: '#0c1028' },
            { x: 4, y: 54, w: 36, h: 8, fill: '#0c1028' },
            // status leds
            { x: 38, y: 9, w: 2, h: 2, fill: '#9EE6C9' },
            { x: 38, y: 21, w: 2, h: 2, fill: '#F5A524' },
            { x: 38, y: 33, w: 2, h: 2, fill: '#9EE6C9' },
            { x: 38, y: 45, w: 2, h: 2, fill: '#9EE6C9' },
            { x: 38, y: 57, w: 2, h: 2, fill: '#E8708A' },
          ]}
        />
      ))}
      {/* blinking led */}
      <span
        aria-hidden
        className="absolute"
        style={{
          left: 'calc(10px + 38px)',
          bottom: 60,
          width: 3,
          height: 3,
          background: '#9EE6C9',
          animation: 'stark-pulse 1.6s ease-in-out infinite',
          boxShadow: '0 0 4px #9EE6C9',
        }}
      />
    </div>
  );
}

function Mailroom({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '37%', '60%')}>
      <RoomLabel>mailroom</RoomLabel>
      {/* mail cubbies */}
      <Pixel
        className="absolute"
        style={{ left: 6, bottom: 8, width: 100, height: 70 }}
        layers={[
          { x: 0, y: 0, w: 100, h: 70, fill: '#EBE2CB', stroke: '#1C2340' },
          // grid
          { x: 0, y: 18, w: 100, h: 1, fill: '#1C2340' },
          { x: 0, y: 36, w: 100, h: 1, fill: '#1C2340' },
          { x: 0, y: 54, w: 100, h: 1, fill: '#1C2340' },
          { x: 25, y: 0, w: 1, h: 70, fill: '#1C2340' },
          { x: 50, y: 0, w: 1, h: 70, fill: '#1C2340' },
          { x: 75, y: 0, w: 1, h: 70, fill: '#1C2340' },
          // some mail in cubbies
          { x: 4, y: 4, w: 18, h: 12, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 28, y: 22, w: 18, h: 12, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 53, y: 4, w: 18, h: 12, fill: '#F5A524', stroke: '#1C2340' },
          { x: 78, y: 40, w: 18, h: 12, fill: '#F4EEDF', stroke: '#1C2340' },
        ]}
      />
    </div>
  );
}

/* ─── Ground floor rooms ─── */

function LivingRoom({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '60%', '86%')}>
      <RoomLabel>living room</RoomLabel>
      {/* desk + monitor */}
      <Pixel
        className="absolute"
        style={{ left: '40%', bottom: 8, width: 130, height: 88 }}
        layers={[
          { x: 0, y: 80, w: 130, h: 8, fill: '#7a4f25', stroke: '#1C2340' },
          { x: 6, y: 88, w: 8, h: 16, fill: '#7a4f25', stroke: '#1C2340' },
          { x: 116, y: 88, w: 8, h: 16, fill: '#7a4f25', stroke: '#1C2340' },
          { x: 56, y: 70, w: 18, h: 10, fill: '#1C2340' },
          { x: 18, y: 22, w: 94, h: 50, fill: '#1C2340' },
          { x: 22, y: 26, w: 86, h: 42, fill: '#9EE6C9' },
          { x: 22, y: 32, w: 86, h: 1, fill: 'rgba(20,23,37,0.18)' },
          { x: 22, y: 44, w: 86, h: 1, fill: 'rgba(20,23,37,0.18)' },
          { x: 22, y: 56, w: 86, h: 1, fill: 'rgba(20,23,37,0.18)' },
        ]}
      />
      <span
        aria-hidden
        className="absolute"
        style={{
          left: 'calc(40% + 38px)',
          bottom: 56,
          width: 4,
          height: 8,
          background: '#1C2340',
          animation: 'stark-blink 1s steps(2) infinite',
        }}
      />
      {/* couch */}
      <Pixel
        className="absolute"
        style={{ left: 14, bottom: 6, width: 110, height: 36 }}
        layers={[
          { x: 0, y: 6, w: 110, h: 22, fill: '#9EE6C9', stroke: '#1C2340' },
          { x: 0, y: 22, w: 12, h: 14, fill: '#7faf99', stroke: '#1C2340' },
          { x: 98, y: 22, w: 12, h: 14, fill: '#7faf99', stroke: '#1C2340' },
          { x: 14, y: 8, w: 22, h: 14, fill: '#7faf99' },
          { x: 44, y: 8, w: 22, h: 14, fill: '#7faf99' },
          { x: 74, y: 8, w: 22, h: 14, fill: '#7faf99' },
        ]}
      />
      {/* clock on wall */}
      <Pixel
        className="absolute"
        style={{ left: '32%', top: 14, width: 38, height: 38 }}
        layers={[
          { x: 0, y: 0, w: 38, h: 38, fill: '#1C2340' },
          { x: 4, y: 4, w: 30, h: 30, fill: '#F4EEDF', stroke: '#1C2340' },
          { x: 17, y: 6, w: 4, h: 3, fill: '#1C2340' },
          { x: 17, y: 30, w: 4, h: 3, fill: '#1C2340' },
          { x: 6, y: 17, w: 3, h: 4, fill: '#1C2340' },
          { x: 30, y: 17, w: 3, h: 4, fill: '#1C2340' },
        ]}
      />
      {/* clock hands */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: 'calc(32% + 17px)',
          top: 32,
          width: 4,
          height: 14,
          marginTop: -12,
          background: '#1C2340',
          transformOrigin: '50% 100%',
          animation: 'stark-rotate 60s linear infinite',
        }}
      />
      <div
        aria-hidden
        className="absolute"
        style={{
          left: 'calc(32% + 17px)',
          top: 32,
          width: 3,
          height: 9,
          marginTop: -7,
          background: '#F5A524',
          transformOrigin: '50% 100%',
          animation: 'stark-rotate 4s linear infinite',
        }}
      />
      {/* potted plant */}
      <Pixel
        className="absolute"
        style={{ left: 'calc(40% - 30px)', bottom: 6, width: 22, height: 36 }}
        layers={[
          { x: 4, y: 0, w: 14, h: 12, fill: '#7a4f25', stroke: '#1C2340' },
          { x: 0, y: 10, w: 22, h: 14, fill: '#2E5A3A' },
          { x: 4, y: 20, w: 14, h: 14, fill: '#3a7a4f' },
        ]}
      />
    </div>
  );
}

function BookshelfWall({ left, right }: { left: string; right: string }) {
  return (
    <div className="absolute" aria-hidden style={roomBox(left, right, '60%', '86%')}>
      <RoomLabel>study</RoomLabel>
      {/* books spanning full height */}
      <Pixel
        className="absolute"
        style={{ left: 8, bottom: 6, width: 110, height: 100 }}
        layers={[
          { x: 0, y: 0, w: 110, h: 6, fill: '#7a4f25' },
          { x: 0, y: 28, w: 110, h: 4, fill: '#7a4f25' },
          { x: 0, y: 56, w: 110, h: 4, fill: '#7a4f25' },
          { x: 0, y: 84, w: 110, h: 4, fill: '#7a4f25' },
          ...books(0, 6, 110, 22),
          ...books(0, 32, 110, 24),
          ...books(0, 60, 110, 24),
        ]}
      />
      {/* small framed art */}
      <Pixel
        className="absolute"
        style={{ right: 8, bottom: 14, width: 28, height: 32 }}
        layers={[
          { x: 0, y: 0, w: 28, h: 32, fill: '#1C2340' },
          { x: 3, y: 3, w: 22, h: 26, fill: '#F5A524' },
          { x: 3, y: 17, w: 22, h: 12, fill: '#9EE6C9' },
        ]}
      />
    </div>
  );
}

function FrontSteps() {
  return (
    <>
      <Pixel
        className="absolute"
        style={{ left: '46%', bottom: '12%', width: 82, height: 76 }}
        layers={[
          { x: 12, y: 0, w: 58, h: 58, fill: '#7a4f25', stroke: '#1C2340' },
          { x: 18, y: 8, w: 46, h: 50, fill: '#1C2340' },
          { x: 22, y: 12, w: 17, h: 42, fill: '#F4EEDF' },
          { x: 43, y: 12, w: 17, h: 42, fill: '#F4EEDF' },
          { x: 39, y: 34, w: 4, h: 4, fill: '#F5A524' },
          { x: 0, y: 58, w: 82, h: 8, fill: '#C28a55', stroke: '#1C2340' },
          { x: 8, y: 66, w: 66, h: 8, fill: '#B87F4B', stroke: '#1C2340' },
        ]}
      />
      <span
        aria-hidden
        className="absolute"
        style={{
          left: 'calc(46% + 37px)',
          bottom: 'calc(12% + 44px)',
          width: 8,
          height: 8,
          background: '#FFD277',
          boxShadow: '0 0 18px rgba(255,210,119,0.8)',
          animation: 'stark-pulse 2.6s ease-in-out infinite',
        }}
      />
    </>
  );
}

/* ─── Garden ─── */

function Garden({ approvalsPending }: { approvalsPending: boolean }) {
  return (
    <>
      {/* grass */}
      <div
        className="absolute inset-x-0"
        aria-hidden
        style={{
          bottom: 0,
          height: '14%',
          background:
            'linear-gradient(180deg, #7faf99 0%, #5a8978 60%, #4a7967 100%)',
        }}
      />
      {/* path */}
      <div
        className="absolute"
        aria-hidden
        style={{
          left: '46%',
          right: '46%',
          bottom: 0,
          height: '14%',
          background:
            'repeating-linear-gradient(90deg, #C28a55 0 12px, #b87f4b 12px 13px, #C28a55 13px 24px), #b87f4b',
          boxShadow: 'inset 0 0 0 2px #7a4f25',
        }}
      />
      {/* tree */}
      <Pixel
        className="absolute"
        style={{ left: '6%', bottom: '4%', width: 60, height: 90 }}
        layers={[
          { x: 24, y: 0, w: 12, h: 30, fill: '#7a4f25', stroke: '#1C2340' },
          { x: 0, y: 26, w: 60, h: 40, fill: '#2E5A3A', stroke: '#1C2340' },
          { x: 6, y: 60, w: 48, h: 14, fill: '#3a7a4f', stroke: '#1C2340' },
          { x: 14, y: 70, w: 32, h: 14, fill: '#4d8e60', stroke: '#1C2340' },
        ]}
      />
      {/* mailbox out front */}
      <Pixel
        className="absolute"
        style={{ left: '38%', bottom: '3%', width: 38, height: 54 }}
        layers={[
          { x: 16, y: 28, w: 6, h: 26, fill: '#7a4f25' },
          { x: 0, y: 6, w: 38, h: 24, fill: '#F5A524', stroke: '#1C2340' },
          { x: 6, y: 14, w: 26, h: 4, fill: '#1C2340' },
          { x: 30, y: 4, w: 8, h: 12, fill: approvalsPending ? '#E8708A' : '#1C2340' },
        ]}
      />
      {approvalsPending && (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: '40%',
            bottom: '12%',
            width: 8,
            height: 8,
            background: '#F5A524',
            borderRadius: '50%',
            animation: 'stark-pulse 1.4s ease-in-out infinite',
            boxShadow: '0 0 12px #F5A524',
          }}
        />
      )}
      {/* flowers */}
      <Flower left="22%" />
      <Flower left="32%" />
      <Flower left="58%" />
      <Flower left="68%" />
      <Flower left="78%" />
      {/* pond */}
      <Pixel
        className="absolute"
        style={{ left: '78%', bottom: '2%', width: 80, height: 36 }}
        layers={[
          { x: 0, y: 0, w: 80, h: 36, fill: '#9EE6C9', stroke: '#1C2340' },
          { x: 8, y: 8, w: 32, h: 4, fill: '#7faf99' },
          { x: 24, y: 18, w: 24, h: 4, fill: '#7faf99' },
        ]}
      />
    </>
  );
}

/* ─── Atomic helpers ─── */

function Wall({
  left,
  topPct,
  bottomPct,
}: {
  left: string;
  topPct: number;
  bottomPct: number;
}) {
  return (
    <div
      className="absolute"
      aria-hidden
      style={{
        left,
        top: `${100 - bottomPct}%`,
        bottom: `${topPct + 11}%`, // pad above floor divider
        width: 3,
        background: '#1C2340',
      }}
    />
  );
}

function roomBox(left: string, right: string, topPct: string, bottomPct: string) {
  return {
    left,
    right: `calc(100% - ${right})`,
    top: `calc(100% - ${bottomPct})`,
    bottom: topPct,
  } as const;
}

function RoomLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono pointer-events-none absolute z-10 inline-block bg-[#1C2340] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.18em] text-[#F4EEDF]"
      style={{ left: 4, top: 4 }}
    >
      {children}
    </span>
  );
}

function Cloud({ left, top, small }: { left: string; top: string; small?: boolean }) {
  const w = small ? 60 : 96;
  const h = small ? 22 : 30;
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left,
        top,
        width: w,
        height: h,
        background: '#FFFFFF',
        borderRadius: h / 2,
        opacity: 0.85,
        filter: 'drop-shadow(0 4px 8px rgba(20,23,37,0.06))',
      }}
    />
  );
}

function Smoke({ left, bottom, delay }: { left: string; bottom: string; delay: number }) {
  return (
    <span
      aria-hidden
      className="absolute"
      style={{
        left,
        bottom,
        width: 8,
        height: 8,
        background: 'rgba(255,255,255,0.7)',
        borderRadius: '50%',
        animation: `stark-ember-rise 5s ease-in ${delay}s infinite`,
      }}
    />
  );
}

function Flower({ left }: { left: string }) {
  return (
    <Pixel
      className="absolute"
      style={{ left, bottom: '2%', width: 12, height: 22 }}
      layers={[
        { x: 5, y: 0, w: 2, h: 14, fill: '#2E5A3A' },
        { x: 0, y: 12, w: 4, h: 4, fill: '#3a7a4f' },
        { x: 8, y: 14, w: 4, h: 4, fill: '#3a7a4f' },
        { x: 3, y: 18, w: 6, h: 4, fill: '#E8708A', stroke: '#1C2340' },
        { x: 5, y: 16, w: 2, h: 2, fill: '#F5A524' },
      ]}
    />
  );
}

function books(x0: number, y0: number, w: number, h: number) {
  // Generate alternating colored book spines.
  const cols = ['#1C2340', '#F5A524', '#9EE6C9', '#E8708A', '#7a4f25', '#5A3A2E'];
  const out: { x: number; y: number; w: number; h: number; fill: string; stroke?: string }[] = [];
  let x = x0;
  let i = 0;
  const bookW = 8;
  while (x + bookW <= x0 + w) {
    const ww = bookW + (i % 3 === 0 ? 4 : 0);
    const hh = h - (i % 4) * 2;
    out.push({ x, y: y0 + (h - hh), w: ww, h: hh, fill: cols[i % cols.length], stroke: '#1C2340' });
    x += ww;
    i += 1;
  }
  return out;
}

/* ─── Pixel + chrome bits ─── */

type Layer = { x: number; y: number; w: number; h: number; fill: string; stroke?: string };

function Pixel({
  layers,
  className,
  style,
}: {
  layers: Layer[];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{ ...style, position: style?.position ?? 'absolute' }}>
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
            boxShadow: l.stroke ? `inset 0 0 0 1.5px ${l.stroke}` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function SpeechBubble({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      className="font-mono pointer-events-none absolute -top-10 left-1/2 z-10 max-w-[168px] -translate-x-1/2 rounded-[4px] border-2 border-[#1C2340] bg-[#FBF7EC] px-2 py-1 text-center text-[10px] font-bold leading-tight text-[#1C2340]"
      style={{ boxShadow: '3px 3px 0 #1C2340', transform: 'translate(-50%, 0) rotate(-1deg)' }}
    >
      {children}
      <span
        aria-hidden
        className="absolute -bottom-[6px] left-1/2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '6px solid #1C2340',
        }}
      />
    </div>
  );
}

function Pill({ tone, label }: { tone: 'navy' | 'amber' | 'mint' | 'rose'; label: string }) {
  const palette = {
    navy: { bg: '#1C2340', fg: '#F4EEDF' },
    amber: { bg: '#F5A524', fg: '#1C2340' },
    mint: { bg: '#9EE6C9', fg: '#1C2340' },
    rose: { bg: '#E8708A', fg: '#1C2340' },
  }[tone];
  return (
    <span
      className="font-mono inline-flex max-w-full items-center gap-1.5 rounded-[3px] border-2 border-[#1C2340] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
      style={{ background: palette.bg, color: palette.fg, boxShadow: '3px 3px 0 #1C2340' }}
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: palette.fg }} />
      <span className="truncate">{label}</span>
    </span>
  );
}
