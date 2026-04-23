import { useEffect, useRef, useState } from 'react';
import { drawScene } from './renderers';
import { MAP_COLS, MAP_ROWS, WORLD_H, WORLD_W, roomFor, spawn, zoneAt } from './scene';
import { loadTilesetImages, type TilesetImages } from './tileset';
import type { Point, RobotMode, ZoneId } from './types';

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stepToward(current: Point, target: Point, amount: number): Point {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const d = Math.hypot(dx, dy);
  if (d <= amount || d === 0) return target;
  return {
    x: current.x + (dx / d) * amount,
    y: current.y + (dy / d) * amount,
  };
}

function modeFor(zone: ZoneId): RobotMode {
  if (zone === 'work') return 'typing';
  if (zone === 'sleep') return 'sleeping';
  if (zone === 'rest') return 'sitting';
  return 'idle';
}

export function StarkHomeCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const robotRef = useRef<Point>(spawn);
  const targetRef = useRef<Point>(roomFor('work').target);
  const activeZoneRef = useRef<ZoneId>('work');
  const hoverZoneRef = useRef<ZoneId | null>(null);
  const imagesRef = useRef<TilesetImages | null>(null);
  const dprRef = useRef(1);
  const lastRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  const [activeZone, setActiveZone] = useState<ZoneId>('work');
  const [hoverZone, setHoverZone] = useState<ZoneId | null>(null);
  const [box, setBox] = useState({ w: WORLD_W, h: WORLD_H });

  useEffect(() => {
    let cancelled = false;
    void loadTilesetImages().then((images) => {
      if (!cancelled) imagesRef.current = images;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const scale = Math.max(1, Math.max(rect.width / WORLD_W, rect.height / WORLD_H));
      dprRef.current = window.devicePixelRatio || 1;
      setBox({
        w: Math.floor(WORLD_W * scale),
        h: Math.floor(WORLD_H * scale),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    activeZoneRef.current = activeZone;
  }, [activeZone]);

  useEffect(() => {
    hoverZoneRef.current = hoverZone;
  }, [hoverZone]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      const images = imagesRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas || !images) {
        raf = window.requestAnimationFrame(tick);
        return;
      }

      const dpr = dprRef.current;
      const targetWidth = Math.round(WORLD_W * dpr);
      const targetHeight = Math.round(WORLD_H * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const last = lastRef.current ?? now;
      const delta = Math.min(0.05, (now - last) / 1000);
      lastRef.current = now;
      frameRef.current += 1;

      const target = targetRef.current;
      const moving = distance(robotRef.current, target) > 0.04;
      if (moving) {
        robotRef.current = stepToward(robotRef.current, target, delta * 5.5);
      }

      const mode: RobotMode = moving ? 'walk' : modeFor(activeZoneRef.current);
      drawScene(ctx, images, activeZoneRef.current, hoverZoneRef.current, robotRef.current, mode, frameRef.current);
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  function eventPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * MAP_COLS,
      y: ((e.clientY - rect.top) / rect.height) * MAP_ROWS,
    };
  }

  function moveTo(zone: ZoneId) {
    const room = roomFor(zone);
    targetRef.current = room.target;
    activeZoneRef.current = zone;
    setActiveZone(zone);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const zone = zoneAt(eventPoint(e));
    hoverZoneRef.current = zone;
    setHoverZone(zone);
  }

  function onPointerLeave() {
    hoverZoneRef.current = null;
    setHoverZone(null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const zone = zoneAt(eventPoint(e));
    if (zone) moveTo(zone);
  }

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center overflow-hidden bg-[#17161b]">
      <canvas
        ref={canvasRef}
        width={WORLD_W}
        height={WORLD_H}
        aria-label="Interactive tile-based Stark Home scene"
        className="block cursor-pointer bg-[#19191d]"
        style={{
          width: box.w,
          height: box.h,
          imageRendering: 'pixelated',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
}
