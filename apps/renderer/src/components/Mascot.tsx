import { useEffect, useRef } from 'react';
import { paintStark, blit, type Expr, type Pose, type Accessory } from '../lib/stark/sprite';
import { cn } from '../lib/cn';

type Props = {
  /** Pixel scale per cell. Resulting canvas = 32 * scale. */
  scale?: number;
  expr?: Expr;
  pose?: Pose;
  accessory?: Accessory;
  bodyColor?: string;
  /** Whether to run the breath/blink/antenna idle loop. */
  animate?: boolean;
  /** Whether to follow the cursor with eyes. */
  trackCursor?: boolean;
  /** Direct eye offset (-1, 0, 1). Overrides trackCursor. */
  lookDx?: number;
  lookDy?: number;
  className?: string;
  onClick?: () => void;
};

/**
 * <Mascot/> — drop-in pixel-art Stark.
 *
 * The canvas is internally sized to 32*scale for crisp pixels and
 * displayed at the same CSS dimension. Idle loop is built in.
 */
export function Mascot({
  scale = 4,
  expr = 'idle',
  pose = 'idle',
  accessory = 'none',
  bodyColor = '#1C2340',
  animate = true,
  trackCursor = false,
  lookDx,
  lookDy,
  className,
  onClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const blinkRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let mounted = true;

    function loop(tMs: number) {
      if (!mounted || !canvas || !ctx) return;
      const t = tMs / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let bob = 0;
      let pulse = false;
      let frame = 0;
      let drawExpr: Expr = expr;

      if (animate) {
        bob = Math.round(Math.sin(t * 1.6) * 1) * Math.max(1, scale / 4);
        pulse = Math.floor(t * 1.2) % 2 === 0;
        frame = Math.floor(t * 6) % 4;
        // Auto-blink when idle.
        if (expr === 'idle') {
          const cyc = t % 4.2;
          blinkRef.current = cyc > 4.0 && cyc < 4.15 ? 1 : 0;
          if (blinkRef.current) drawExpr = 'blink';
        }
        if (pose === 'hover' || pose === 'loading') {
          bob += Math.round(Math.sin(t * 3) * 1) * Math.max(1, scale / 4);
        }
      }

      const grid = paintStark({
        expr: drawExpr,
        pose,
        accessory,
        antennaPulse: pulse,
        frame,
        lookDx: lookDx ?? offRef.current.dx,
        lookDy: lookDy ?? offRef.current.dy,
      });
      const offX = (canvas.width - 32 * scale) / 2;
      const offY = (canvas.height - 32 * scale) / 2 + bob;
      blit(ctx, grid, scale, offX, offY, bodyColor);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [scale, expr, pose, accessory, bodyColor, animate, lookDx, lookDy]);

  // Cursor-tracking: write into a ref so the render loop reads the latest
  // values without re-running the effect.
  useEffect(() => {
    if (!trackCursor || lookDx !== undefined || lookDy !== undefined) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onMove(e: MouseEvent) {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const mag = Math.hypot(dx, dy);
      if (mag < 1) {
        offRef.current = { dx: 0, dy: 0 };
        return;
      }
      const nx = dx / Math.max(mag, 400);
      const ny = dy / Math.max(mag, 400);
      offRef.current = {
        dx: Math.round(nx * 1.6),
        dy: Math.round(ny * 1.6),
      };
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [trackCursor, lookDx, lookDy]);

  const cssSize = 32 * scale;

  return (
    <canvas
      ref={canvasRef}
      width={cssSize}
      height={cssSize}
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer', className)}
      style={{
        width: cssSize,
        height: cssSize,
        imageRendering: 'pixelated',
      }}
    />
  );
}
