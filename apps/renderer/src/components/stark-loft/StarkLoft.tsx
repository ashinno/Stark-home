import { useEffect, useRef } from 'react';
import { blit, paintStark, type Expr, type Pose } from '../../lib/stark/sprite';
import { cn } from '../../lib/cn';

/* ============================================================
 * Stark cozy loft — side-view pixel scene.
 *
 * Ported from the design handoff (stark-loft.html / stark-loft.js).
 * 1600×480 native canvas, scaled to fit its container. Walls and floor
 * are painted procedurally; furniture blits tile regions out of the
 * Bitglow pixel-interior sheets already shipped at
 *   apps/renderer/src/assets/pixelinterior/*.png
 *
 * Stark wanders between five zones (kitchen, desk, reading, lounge,
 * plants) on a per-hour schedule, fireplace flickers, window swaps
 * day/sunset/night over a compressed 24h clock.
 * ============================================================ */

const SHEET_URLS = {
  living: new URL('../../assets/pixelinterior/livingroom_LRK.png', import.meta.url).href,
  kitchen: new URL('../../assets/pixelinterior/kitchen_LRK.png', import.meta.url).href,
  cabinets: new URL('../../assets/pixelinterior/cabinets_LRK.png', import.meta.url).href,
  deco: new URL('../../assets/pixelinterior/decorations_LRK.png', import.meta.url).href,
  doors: new URL('../../assets/pixelinterior/doorswindowsstairs_LRK.png', import.meta.url).href,
} as const;

type SheetId = keyof typeof SHEET_URLS;
type SpriteRegion = [SheetId, number, number, number, number]; // sheet, sx, sy, sw, sh

const SPR = {
  sofa_brown: ['living', 16, 32, 48, 32],
  armchair_gray: ['living', 240, 96, 32, 32],
  armchair_brown: ['living', 240, 32, 32, 32],
  fireplace_lit_a: ['living', 528, 16, 32, 48],
  fireplace_lit_b: ['living', 576, 16, 32, 48],
  coffee_table_brown: ['living', 568, 182, 32, 16],
  chair_wood: ['living', 128, 144, 16, 32],
  rug_cream: ['living', 16, 160, 48, 32],
  rug_patterned: ['living', 288, 160, 48, 32],

  kitchen_full_brown: ['kitchen', 23, 11, 145, 65],
  upper_brown: ['kitchen', 192, 9, 128, 23],
  fridge_white: ['kitchen', 356, 24, 28, 56],

  shelf_tall: ['cabinets', 16, 16, 48, 48],
  desk_brown: ['cabinets', 528, 32, 48, 25],
  low_cabinet: ['cabinets', 688, 32, 48, 14],

  floor_lamp1: ['deco', 16, 16, 16, 46],
  floor_lamp2: ['deco', 48, 15, 16, 47],
  table_lamp1: ['deco', 120, 22, 16, 25],
  painting_landscape: ['deco', 112, 64, 32, 16],
  painting_mountain: ['deco', 112, 96, 32, 16],
  plant_big: ['deco', 16, 81, 16, 31],
  plant_mid: ['deco', 48, 80, 16, 31],
  plant_small: ['deco', 80, 80, 16, 31],
  pot_red: ['deco', 16, 128, 16, 16],
  clock: ['deco', 160, 128, 16, 16],

  window_day: ['doors', 208, 17, 48, 30],
  window_sunset: ['doors', 208, 177, 48, 30],
  window_night: ['doors', 208, 49, 48, 30],
} as const satisfies Record<string, SpriteRegion>;

type SpriteId = keyof typeof SPR;

const W = 1600;
const H = 480;
const SCALE = 3;
const FLOOR_Y = 380;
const WALL_TOP = 30;
const L_WALL = 40;
const R_WALL = 1560;

type ZoneId = 'kitchen' | 'desk' | 'reading' | 'lounge' | 'plants';

const ZONES: Record<ZoneId, { x: number; floorX: [number, number] }> = {
  kitchen: { x: 300, floorX: [80, 520] },
  desk: { x: 660, floorX: [540, 760] },
  reading: { x: 880, floorX: [780, 980] },
  lounge: { x: 1180, floorX: [990, 1360] },
  plants: { x: 1460, floorX: [1370, 1540] },
};

type ActivityKey =
  | 'coffee'
  | 'cook'
  | 'work'
  | 'code'
  | 'read'
  | 'sit'
  | 'fire'
  | 'nap'
  | 'water'
  | 'stretch'
  | 'success';

type Activity = {
  zone: ZoneId;
  expr: Expr;
  pose?: Pose;
  dur: number;
};

const ACTIVITIES: Record<ActivityKey, Activity> = {
  coffee: { zone: 'kitchen', expr: 'happy', dur: 5000 },
  cook: { zone: 'kitchen', expr: 'happy', dur: 5500 },
  work: { zone: 'desk', expr: 'thinking', pose: 'think', dur: 6500 },
  code: { zone: 'desk', expr: 'loading', dur: 6000 },
  read: { zone: 'reading', expr: 'wink', dur: 6000 },
  sit: { zone: 'reading', expr: 'happy', dur: 4000 },
  fire: { zone: 'lounge', expr: 'happy', dur: 5500 },
  nap: { zone: 'lounge', expr: 'sleepy', dur: 7000 },
  water: { zone: 'plants', expr: 'happy', dur: 4500 },
  stretch: { zone: 'desk', expr: 'happy', dur: 2500 },
  success: { zone: 'desk', expr: 'success', dur: 3000 },
};

const SCHEDULE: Record<number, Partial<Record<ActivityKey, number>>> = {
  7: { coffee: 4, stretch: 1 },
  8: { coffee: 2, work: 3, code: 1 },
  9: { work: 3, code: 3 },
  10: { work: 2, code: 3, stretch: 1 },
  11: { coffee: 2, work: 2, water: 1 },
  12: { cook: 4, sit: 1 },
  13: { read: 3, nap: 2, fire: 1 },
  14: { work: 3, code: 2 },
  15: { code: 3, stretch: 1 },
  16: { success: 1, coffee: 2, water: 1 },
  17: { water: 2, read: 2, fire: 1 },
  18: { cook: 2, fire: 2, read: 1 },
  19: { fire: 3, read: 3, sit: 1 },
  20: { read: 2, fire: 2, nap: 1 },
  21: { nap: 2, fire: 2, sit: 1 },
  22: { nap: 3 },
  23: { nap: 5 },
  0: { nap: 5 },
  1: { nap: 5 },
  2: { nap: 5 },
  3: { nap: 5 },
  4: { nap: 5 },
  5: { nap: 3, stretch: 1 },
  6: { stretch: 2, coffee: 1 },
};

function pickActivity(hour: number): ActivityKey {
  const pool = SCHEDULE[hour] ?? SCHEDULE[10];
  const entries = Object.entries(pool) as [ActivityKey, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

async function loadSheets(): Promise<Record<SheetId, HTMLImageElement>> {
  const entries = await Promise.all(
    (Object.entries(SHEET_URLS) as [SheetId, string][]).map(
      ([id, url]) =>
        new Promise<[SheetId, HTMLImageElement]>((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve([id, im]);
          im.onerror = () => reject(new Error(`failed to load ${url}`));
          im.src = url;
        }),
    ),
  );
  return Object.fromEntries(entries) as Record<SheetId, HTMLImageElement>;
}

type Brain = {
  simMinutes: number;
  pos: number;
  facing: 'left' | 'right';
  actKey: ActivityKey;
  actStart: number;
  actDur: number;
  phase: 'walking' | 'acting';
  target: number;
};

export function StarkLoft({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let cancelled = false;
    let images: Record<SheetId, HTMLImageElement> | null = null;

    const brain: Brain = {
      simMinutes: 7 * 60,
      pos: ZONES.kitchen.x,
      facing: 'right',
      actKey: 'coffee',
      actStart: 0,
      actDur: ACTIVITIES.coffee.dur,
      phase: 'walking',
      target: ZONES.kitchen.x,
    };

    function draw(name: SpriteId, dx: number, dy: number, scale = SCALE) {
      if (!images || !ctx) return;
      const [sheet, sx, sy, sw, sh] = SPR[name];
      const img = images[sheet];
      if (!img) return;
      ctx.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        Math.round(dx),
        Math.round(dy),
        Math.round(sw * scale),
        Math.round(sh * scale),
      );
    }

    function paintScene() {
      if (!ctx) return;
      // back wall base
      ctx.fillStyle = '#1A1008';
      ctx.fillRect(0, 0, W, H);
      // warm lamp glow
      const g = ctx.createRadialGradient(W * 0.35, H * 0.35, 60, W * 0.5, H * 0.5, W * 0.8);
      g.addColorStop(0, 'rgba(242,178,74,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // warm plaster wall
      ctx.fillStyle = '#5A3A26';
      ctx.fillRect(L_WALL, WALL_TOP, R_WALL - L_WALL, FLOOR_Y - WALL_TOP);
      for (let y = WALL_TOP; y < FLOOR_Y; y += 6) {
        ctx.fillStyle = y % 12 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.02)';
        ctx.fillRect(L_WALL, y, R_WALL - L_WALL, 2);
      }

      // wainscot + vertical plank seams
      const wainH = 150;
      ctx.fillStyle = '#3B2418';
      ctx.fillRect(L_WALL, FLOOR_Y - wainH, R_WALL - L_WALL, wainH);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = L_WALL + 40; x < R_WALL; x += 60) {
        ctx.fillRect(x, FLOOR_Y - wainH, 2, wainH);
      }
      // baseboard
      ctx.fillStyle = '#2A1810';
      ctx.fillRect(L_WALL, FLOOR_Y - 8, R_WALL - L_WALL, 8);
      ctx.fillStyle = '#5A3526';
      ctx.fillRect(L_WALL, FLOOR_Y - 6, R_WALL - L_WALL, 2);
      // top molding
      ctx.fillStyle = '#3B2418';
      ctx.fillRect(L_WALL, WALL_TOP - 6, R_WALL - L_WALL, 6);
      ctx.fillStyle = '#8B5A30';
      ctx.fillRect(L_WALL, WALL_TOP - 2, R_WALL - L_WALL, 2);

      // side gutters
      ctx.fillStyle = '#0F0804';
      ctx.fillRect(0, 0, L_WALL, H);
      ctx.fillRect(R_WALL, 0, W - R_WALL, H);

      // ceiling beam
      ctx.fillStyle = '#2A1810';
      ctx.fillRect(L_WALL, WALL_TOP - 20, R_WALL - L_WALL, 14);
      ctx.fillStyle = '#4A2A18';
      ctx.fillRect(L_WALL, WALL_TOP - 18, R_WALL - L_WALL, 2);

      // wood plank floor
      const FLOOR_H = H - FLOOR_Y;
      ctx.fillStyle = '#4A2A18';
      ctx.fillRect(0, FLOOR_Y, W, FLOOR_H);
      for (let y = FLOOR_Y; y < H; y += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, y, W, 2);
      }
      for (let x = 0; x < W; x += 120) {
        const off = Math.floor((x / 120) % 2) * 60;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x + off, FLOOR_Y, 2, FLOOR_H);
      }
      for (let y = FLOOR_Y + 2; y < H; y += 16) {
        ctx.fillStyle = 'rgba(200,150,80,0.05)';
        ctx.fillRect(0, y, W, 1);
      }
    }

    function paintWallDecor() {
      const hour = Math.floor(brain.simMinutes / 60) % 24;
      let win: SpriteId = 'window_day';
      if (hour >= 20 || hour < 6) win = 'window_night';
      else if (hour >= 17 && hour < 20) win = 'window_sunset';
      else if (hour >= 6 && hour < 8) win = 'window_sunset';

      draw(win, 200, 220);
      draw(win, 560, 220);
      draw(win, 820, 220);

      draw('painting_landscape', 1050, 260);
      draw('painting_mountain', 1200, 260);
      draw('clock', 1430, 280);
    }

    function paintRoom(t: number) {
      // kitchen
      const kx = 120;
      const kyCounter = FLOOR_Y - 65 * SCALE;
      draw('upper_brown', kx + 8 * SCALE, kyCounter - 23 * SCALE - 4);
      draw('kitchen_full_brown', kx, kyCounter);
      draw('fridge_white', kx + 145 * SCALE + 6, FLOOR_Y - 56 * SCALE);

      // desk + chair + lamp
      draw('desk_brown', 560, FLOOR_Y - 25 * SCALE);
      draw('chair_wood', 560 + 16 * SCALE, FLOOR_Y - 32 * SCALE + 10);
      draw('table_lamp1', 560 + 4 * SCALE, FLOOR_Y - 25 * SCALE - 25 * SCALE + 4);

      // reading nook
      draw('rug_cream', 790, FLOOR_Y - 32 * SCALE + 8);
      draw('shelf_tall', 800, FLOOR_Y - 48 * SCALE);
      draw('armchair_brown', 800 + 48 * SCALE + 8, FLOOR_Y - 32 * SCALE);
      draw('floor_lamp1', 800 + 48 * SCALE + 8 + 32 * SCALE + 6, FLOOR_Y - 46 * SCALE);

      // lounge (rug, fireplace w/ flicker, sofa, coffee table, armchair, lamp)
      draw('rug_patterned', 1020, FLOOR_Y - 32 * SCALE + 6);
      const flame: SpriteId = Math.floor(t * 2) % 2 === 0 ? 'fireplace_lit_a' : 'fireplace_lit_b';
      draw(flame, 1030, FLOOR_Y - 48 * SCALE);
      draw('sofa_brown', 1150, FLOOR_Y - 32 * SCALE);
      draw('coffee_table_brown', 1180, FLOOR_Y - 16 * SCALE - 4);
      draw('armchair_gray', 1290, FLOOR_Y - 32 * SCALE);
      draw('floor_lamp2', 1145, FLOOR_Y - 46 * SCALE);

      // plants corner
      draw('plant_big', 1390, FLOOR_Y - 31 * SCALE);
      draw('plant_mid', 1430, FLOOR_Y - 31 * SCALE);
      draw('plant_small', 1470, FLOOR_Y - 31 * SCALE);
      draw('pot_red', 1510, FLOOR_Y - 16 * SCALE);

      // far-left low cabinet + small plant
      draw('low_cabinet', 80, FLOOR_Y - 14 * SCALE);
      draw('plant_small', 80 + 4 * SCALE, FLOOR_Y - 14 * SCALE - 31 * SCALE);
    }

    const STARK_NATIVE = 32;
    const STARK_SCALE = 4;

    function drawStark(t: number) {
      if (!ctx) return;
      const a = ACTIVITIES[brain.actKey];
      const walking = brain.phase === 'walking';
      const frame = walking ? Math.floor(t * 6) % 4 : 0;
      const expr: Expr = walking ? 'idle' : a.expr;
      const pose: Pose = walking ? 'hover' : a.pose ?? 'idle';
      const pulse = Math.floor(t * 1.2) % 2 === 0;
      const bob = walking ? Math.abs(Math.sin(t * 12)) * 3 : Math.sin(t * 2) * 1;

      const grid = paintStark({ expr, pose, accessory: 'none', antennaPulse: pulse, frame });
      const w = STARK_NATIVE * STARK_SCALE;
      const h = STARK_NATIVE * STARK_SCALE;
      const px = Math.round(brain.pos - w / 2);
      const py = Math.round(FLOOR_Y - h + 12 + bob);

      // floor shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(brain.pos, FLOOR_Y + 4, 34, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (brain.facing === 'left') {
        ctx.save();
        ctx.translate(Math.round(brain.pos), 0);
        ctx.scale(-1, 1);
        blit(ctx, grid, STARK_SCALE, -Math.round(w / 2), py, '#1C2340');
        ctx.restore();
      } else {
        blit(ctx, grid, STARK_SCALE, px, py, '#1C2340');
      }

      // activity overlays
      if (!walking) {
        if (brain.actKey === 'nap') {
          const k = Math.floor(t * 2) % 3;
          ctx.fillStyle = '#F8E7BC';
          ctx.font = '28px "VT323", monospace';
          for (let i = 0; i <= k; i++) {
            ctx.fillText('z', px + w + 2 + i * 10, py + 30 - i * 8);
          }
        } else if (brain.actKey === 'coffee') {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          for (let k = 0; k < 3; k++) {
            const off = (t * 20 + k * 13) % 30;
            const sx = brain.pos + Math.sin((off + k * 10) / 6) * 4;
            const sy = py + 20 - off;
            ctx.fillRect(sx, sy, 3, 3);
          }
        } else if (brain.actKey === 'success') {
          ctx.fillStyle = '#F2B24A';
          ctx.font = '22px "VT323", monospace';
          ctx.fillText('✓ shipped', px + w + 4, py + 36);
        }
      }
    }

    function startActivity(key: ActivityKey) {
      const a = ACTIVITIES[key];
      brain.actKey = key;
      brain.actDur = a.dur;
      const z = ZONES[a.zone];
      const [zx1, zx2] = z.floorX;
      const jitter = 20 + Math.random() * (zx2 - zx1 - 40);
      brain.target = Math.round(zx1 + jitter);
      brain.facing = brain.target >= brain.pos ? 'right' : 'left';
      brain.phase = 'walking';
    }

    function nextActivity() {
      const hour = Math.floor(brain.simMinutes / 60) % 24;
      let k: ActivityKey;
      let tries = 0;
      do {
        k = pickActivity(hour);
        tries++;
      } while (k === brain.actKey && tries < 4);
      startActivity(k);
    }

    function tick(dtMs: number) {
      brain.simMinutes = (brain.simMinutes + dtMs / 1000) % (24 * 60);
      if (brain.phase === 'walking') {
        const speed = 80;
        const dir = Math.sign(brain.target - brain.pos);
        brain.pos += dir * speed * (dtMs / 1000);
        if (Math.abs(brain.target - brain.pos) < 2) {
          brain.pos = brain.target;
          brain.phase = 'acting';
          brain.actStart = performance.now();
        }
      } else if (brain.phase === 'acting') {
        if (performance.now() - brain.actStart >= brain.actDur) {
          nextActivity();
        }
      }
    }

    let last = performance.now();
    function render() {
      if (cancelled) return;
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      tick(dt);

      paintScene();
      paintWallDecor();
      paintRoom(now / 1000);
      drawStark(now / 1000);

      raf = window.requestAnimationFrame(render);
    }

    void loadSheets().then((loaded) => {
      if (cancelled) return;
      images = loaded;
      nextActivity();
      raf = window.requestAnimationFrame(render);
    });

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[#0F0804] shadow-[var(--shadow-sm)]',
        className,
      )}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label="Stark's loft — side-view pixel home"
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
