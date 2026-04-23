import { useEffect, useRef, useState } from 'react';
import { Mascot } from './Mascot';
import type { Expr, Pose } from '../lib/stark/sprite';
import { cn } from '../lib/cn';

type Props = {
  scale?: number;
  /** Half-width of the wander box around the anchor. */
  radius?: number;
  className?: string;
};

/**
 * A tiny Stark that drifts around its anchor point with continuous
 * physics-based motion — acceleration toward a target, damping, and
 * small perturbations. Turns before walking, pauses between trips.
 */
export function FloatingMascot({ scale = 2, radius = 72, className }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pose, setPose] = useState<Pose>('idle');
  const [expr, setExpr] = useState<Expr>('happy');
  const [flipX, setFlipX] = useState(false);
  const [bounce, setBounce] = useState(false);

  // Physics state — refs so the animation loop doesn't cause re-renders.
  const stateRef = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    /** Wall-clock time (s) at which we should pick a new target. */
    nextPick: 0,
    /** Wall-clock seconds; accumulates dt. */
    t: 0,
    /** Time last frame. */
    last: 0,
    /** Walking vs idle threshold flag so we don't toggle pose every frame. */
    walking: false,
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const s = stateRef.current;

    const pickTarget = () => {
      // Bias toward the center so the mascot feels tethered to its anchor.
      const bias = 0.35;
      s.tx = (Math.random() * 2 - 1) * radius - s.x * bias;
      s.ty = (Math.random() * 2 - 1) * radius * 0.45 - s.y * bias;
      // Pause between trips varies — short dashes, long strolls.
      const pauseBefore = 0.6 + Math.random() * 1.8;
      s.nextPick = s.t + pauseBefore + 1.6 + Math.random() * 1.5;
    };

    const step = (nowMs: number) => {
      const now = nowMs / 1000;
      const dtRaw = s.last ? now - s.last : 0.016;
      s.last = now;
      // Clamp dt so tab-switches don't catapult the mascot.
      const dt = Math.min(dtRaw, 1 / 30);
      s.t += dt;

      if (s.t >= s.nextPick) pickTarget();

      // Spring toward target with strong damping — critically-damped feel.
      const kSpring = 5.5;
      const kDamp = 4.2;
      const ax = (s.tx - s.x) * kSpring - s.vx * kDamp;
      const ay = (s.ty - s.y) * kSpring - s.vy * kDamp;
      // Tiny noise so motion never looks mechanical.
      const noise = 3;
      s.vx += (ax + (Math.random() * 2 - 1) * noise) * dt;
      s.vy += (ay + (Math.random() * 2 - 1) * noise) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // A gentle vertical bob while walking, like footsteps.
      const speed = Math.hypot(s.vx, s.vy);
      const bob = speed > 12 ? Math.sin(s.t * 12) * Math.min(2.5, speed * 0.04) : 0;

      el.style.transform = `translate3d(${s.x.toFixed(2)}px, ${(s.y + bob).toFixed(2)}px, 0)`;

      // Face direction of motion, with a deadzone so it doesn't flicker.
      if (s.vx < -4) setFlipX((f) => (f ? f : true));
      else if (s.vx > 4) setFlipX((f) => (f ? false : f));

      // Pose switch: walking when speed exceeds a threshold.
      const moving = speed > 18;
      if (moving !== s.walking) {
        s.walking = moving;
        setPose(moving ? 'hover' : 'idle');
      }

      raf = requestAnimationFrame(step);
    };

    pickTarget();
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [radius]);

  // Subtle expression personality — independent of movement.
  useEffect(() => {
    const i = window.setInterval(() => {
      const moods: Expr[] = ['happy', 'happy', 'idle', 'thinking', 'happy'];
      setExpr(moods[Math.floor(Math.random() * moods.length)]);
    }, 4200);
    return () => window.clearInterval(i);
  }, []);

  const onClick = () => {
    setBounce(true);
    setPose('wave');
    setExpr('happy');
    // Shove the mascot a little so it feels reactive to the poke.
    const s = stateRef.current;
    s.vy -= 60;
    s.vx += (Math.random() * 2 - 1) * 40;
    window.setTimeout(() => {
      setBounce(false);
      setPose('idle');
    }, 700);
  };

  return (
    <button
      onClick={onClick}
      aria-label="Poke Stark"
      className={cn(
        'no-drag group relative inline-block align-middle focus-visible:outline-none',
        className,
      )}
      style={{ height: 32 * scale, width: 32 * scale }}
    >
      <span
        ref={wrapRef}
        className="absolute left-1/2 top-1/2 block will-change-transform"
        style={{
          width: 32 * scale,
          height: 32 * scale,
          marginLeft: -(32 * scale) / 2,
          marginTop: -(32 * scale) / 2,
        }}
      >
        <span
          className="block h-full w-full"
          style={{
            transform: `scaleX(${flipX ? -1 : 1}) ${bounce ? 'scale(1.12)' : ''}`,
            transition: 'transform 260ms cubic-bezier(0.34, 1.26, 0.64, 1)',
          }}
        >
          <Mascot
            scale={scale}
            expr={expr}
            pose={pose}
            accessory="wings"
            animate
            trackCursor
            className="cursor-pointer drop-shadow-[0_6px_14px_rgba(0,0,0,0.18)]"
          />
        </span>
      </span>
    </button>
  );
}
