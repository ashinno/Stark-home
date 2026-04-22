/* =============================================================
 * STARK — pixel-art mascot sprite engine.
 *
 * Ported from the design handoff (stark-sprite.js). 32×32 indexed
 * grid painted procedurally per frame, then blitted to canvas with
 * imageSmoothing OFF for crisp pixels. Body color is a runtime tint;
 * everything else is fixed for visual consistency.
 *
 * Public surface:
 *   paintStark(opts) → grid
 *   blit(ctx, grid, scale, x, y, bodyHex)
 *   PALETTE — the 5 brand colors
 * ============================================================= */

export type Expr =
  | 'idle'
  | 'blink'
  | 'happy'
  | 'thinking'
  | 'loading'
  | 'success'
  | 'error'
  | 'sleepy'
  | 'wink'
  | 'track';

export type Pose = 'idle' | 'wave' | 'think' | 'hover' | 'carry' | 'loading';
export type Accessory = 'none' | 'wings' | 'helmet' | 'envelope';

export type PaintOpts = {
  expr?: Expr;
  pose?: Pose;
  accessory?: Accessory;
  lookDx?: number;
  lookDy?: number;
  antennaPulse?: boolean;
  frame?: number;
};

export type Grid = { w: number; h: number; d: Uint8Array };

const PAL = {
  ink: '#141725',
  body: '#1C2340',
  bodyHi: '#2E3A66',
  bodyLo: '#0C1028',
  visor: '#9EE6C9',
  visorOff: '#2A2E44',
  amber: '#F5A524',
  amberHi: '#FFD277',
  rose: '#E8708A',
  mint: '#9EE6C9',
  white: '#F4EEDF',
  cream: '#EBE2CB',
  steel: '#586179',
  steelLo: '#3A4256',
} as const;

export const PALETTE = {
  parchment: '#F4EEDF',
  navy: '#1C2340',
  amber: '#F5A524',
  mint: '#9EE6C9',
  rose: '#E8708A',
} as const;

const IDX: Record<number, keyof typeof PAL | null> = {
  0: null,
  1: 'ink',
  2: 'body',
  3: 'bodyHi',
  4: 'bodyLo',
  5: 'visor',
  6: 'visorOff',
  7: 'amber',
  8: 'amberHi',
  9: 'rose',
  10: 'mint',
  11: 'white',
  12: 'cream',
  13: 'steel',
  14: 'steelLo',
};

// ─── helpers ────────────────────────────────────────────

function makeGrid(w: number, h: number): Grid {
  return { w, h, d: new Uint8Array(w * h) };
}

function put(g: Grid, x: number, y: number, v: number) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  g.d[y * g.w + x] = v;
}

function fillRect(g: Grid, x: number, y: number, w: number, h: number, v: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, v);
}

function rectOutline(g: Grid, x: number, y: number, w: number, h: number, v: number) {
  for (let i = 0; i < w; i++) {
    put(g, x + i, y, v);
    put(g, x + i, y + h - 1, v);
  }
  for (let j = 0; j < h; j++) {
    put(g, x, y + j, v);
    put(g, x + w - 1, y + j, v);
  }
}

function deriveBodyTones(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let hh = 0;
  let ss = 0;
  const ll = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hh = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hh = (b - r) / d + 2;
        break;
      case b:
        hh = (r - g) / d + 4;
        break;
    }
    hh /= 6;
  }
  const toHex = (H: number, S: number, L: number) => {
    if (S === 0) {
      const v = Math.round(L * 255);
      return '#' + [v, v, v].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
    const p = 2 * L - q;
    const rr = hue2rgb(p, q, H + 1 / 3);
    const gg = hue2rgb(p, q, H);
    const bb = hue2rgb(p, q, H - 1 / 3);
    return (
      '#' +
      [rr, gg, bb].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
    );
  };
  return {
    body: hex,
    bodyHi: toHex(hh, Math.min(1, ss * 0.9), Math.min(0.75, ll + 0.15)),
    bodyLo: toHex(hh, Math.min(1, ss * 1.1), Math.max(0.04, ll - 0.12)),
  };
}

// ─── base silhouette (32×32) ───────────────────────────

function paintBase(g: Grid, opts: { pose: Pose; accessory: Accessory }) {
  const { pose, accessory } = opts;

  // antenna stalk
  put(g, 15, 1, 1);
  put(g, 16, 1, 1);
  put(g, 15, 2, 1);
  put(g, 16, 2, 1);
  put(g, 15, 3, 1);
  put(g, 16, 3, 1);
  // antenna tip (amber bulb)
  put(g, 14, 0, 1);
  put(g, 15, 0, 7);
  put(g, 16, 0, 7);
  put(g, 17, 0, 1);

  // head
  fillRect(g, 8, 4, 16, 14, 2);
  fillRect(g, 9, 5, 14, 1, 3);
  fillRect(g, 9, 5, 1, 12, 3);
  fillRect(g, 9, 16, 14, 1, 4);
  fillRect(g, 22, 5, 1, 12, 4);
  rectOutline(g, 7, 4, 18, 14, 1);
  // chip corners
  put(g, 7, 4, 0);
  put(g, 24, 4, 0);
  put(g, 7, 17, 0);
  put(g, 24, 17, 0);
  put(g, 8, 4, 1);
  put(g, 23, 4, 1);
  put(g, 8, 17, 1);
  put(g, 23, 17, 1);
  put(g, 7, 5, 1);
  put(g, 24, 5, 1);
  put(g, 7, 16, 1);
  put(g, 24, 16, 1);
  put(g, 8, 5, 3);
  put(g, 23, 5, 3);
  put(g, 8, 16, 4);
  put(g, 23, 16, 4);

  // visor
  fillRect(g, 9, 8, 14, 6, 6);
  fillRect(g, 10, 9, 12, 4, 5);
  rectOutline(g, 9, 8, 14, 6, 1);
  put(g, 10, 9, 11);
  put(g, 11, 9, 11);

  // ear vents
  for (const y of [9, 10, 11, 12, 13]) {
    put(g, 6, y, 1);
    put(g, 25, y, 1);
  }
  put(g, 5, 10, 1);
  put(g, 5, 12, 1);
  put(g, 26, 10, 1);
  put(g, 26, 12, 1);

  // neck
  fillRect(g, 14, 17, 4, 2, 1);
  fillRect(g, 15, 17, 2, 1, 13);

  // body chassis
  fillRect(g, 7, 19, 18, 9, 2);
  fillRect(g, 8, 20, 16, 1, 3);
  fillRect(g, 8, 20, 1, 7, 3);
  fillRect(g, 8, 26, 16, 1, 4);
  fillRect(g, 23, 20, 1, 7, 4);
  rectOutline(g, 6, 19, 20, 9, 1);
  put(g, 6, 19, 0);
  put(g, 25, 19, 0);
  put(g, 6, 27, 0);
  put(g, 25, 27, 0);
  put(g, 7, 19, 1);
  put(g, 24, 19, 1);
  put(g, 7, 27, 1);
  put(g, 24, 27, 1);
  put(g, 6, 20, 1);
  put(g, 25, 20, 1);
  put(g, 6, 26, 1);
  put(g, 25, 26, 1);
  put(g, 7, 20, 3);
  put(g, 24, 20, 3);
  put(g, 7, 26, 4);
  put(g, 24, 26, 4);

  // chest plate + status light
  fillRect(g, 13, 21, 6, 4, 14);
  rectOutline(g, 13, 21, 6, 4, 1);
  put(g, 15, 22, 7);
  put(g, 16, 22, 7);
  put(g, 15, 23, 8);
  put(g, 16, 23, 8);

  // belly seam
  for (let i = 8; i < 24; i++) if (i !== 13 && i !== 18) put(g, i, 25, 4);

  // feet / hover
  if (pose === 'hover' || pose === 'loading') {
    put(g, 11, 29, 7);
    put(g, 12, 29, 8);
    put(g, 13, 29, 7);
    put(g, 18, 29, 7);
    put(g, 19, 29, 8);
    put(g, 20, 29, 7);
    put(g, 12, 30, 7);
    put(g, 19, 30, 7);
  } else {
    fillRect(g, 9, 28, 5, 3, 1);
    fillRect(g, 18, 28, 5, 3, 1);
    fillRect(g, 10, 29, 3, 1, 13);
    fillRect(g, 19, 29, 3, 1, 13);
  }

  // arms
  if (pose === 'idle' || pose === 'hover') {
    fillRect(g, 4, 20, 2, 5, 1);
    put(g, 5, 20, 13);
    put(g, 5, 21, 13);
    fillRect(g, 26, 20, 2, 5, 1);
    put(g, 26, 20, 13);
    put(g, 26, 21, 13);
    put(g, 4, 25, 1);
    put(g, 5, 25, 1);
    put(g, 26, 25, 1);
    put(g, 27, 25, 1);
  } else if (pose === 'wave') {
    fillRect(g, 4, 20, 2, 5, 1);
    put(g, 5, 20, 13);
    put(g, 4, 25, 1);
    put(g, 5, 25, 1);
    fillRect(g, 26, 14, 2, 7, 1);
    put(g, 27, 14, 13);
    put(g, 27, 15, 13);
    fillRect(g, 28, 12, 3, 4, 1);
    fillRect(g, 29, 13, 1, 2, 13);
  } else if (pose === 'think') {
    fillRect(g, 4, 20, 2, 5, 1);
    put(g, 5, 20, 13);
    put(g, 4, 25, 1);
    put(g, 5, 25, 1);
    fillRect(g, 24, 16, 2, 4, 1);
    fillRect(g, 22, 16, 2, 2, 1);
    put(g, 23, 17, 13);
  } else if (pose === 'carry') {
    fillRect(g, 5, 21, 2, 2, 1);
    fillRect(g, 25, 21, 2, 2, 1);
    fillRect(g, 12, 20, 8, 5, 12);
    rectOutline(g, 12, 20, 8, 5, 1);
    fillRect(g, 15, 20, 2, 5, 7);
    fillRect(g, 12, 22, 8, 1, 7);
  }

  // accessories
  if (accessory === 'wings') {
    put(g, 8, 27, 8);
    put(g, 7, 28, 7);
    put(g, 6, 29, 7);
    put(g, 8, 28, 8);
    put(g, 7, 29, 8);
    put(g, 23, 27, 8);
    put(g, 24, 28, 7);
    put(g, 25, 29, 7);
    put(g, 23, 28, 8);
    put(g, 24, 29, 8);
    put(g, 6, 30, 1);
    put(g, 25, 30, 1);
  } else if (accessory === 'helmet') {
    fillRect(g, 10, 2, 12, 3, 7);
    rectOutline(g, 10, 2, 12, 3, 1);
    fillRect(g, 11, 3, 10, 1, 8);
    put(g, 9, 2, 8);
    put(g, 8, 3, 8);
    put(g, 22, 2, 8);
    put(g, 23, 3, 8);
    put(g, 9, 3, 7);
    put(g, 22, 3, 7);
  } else if (accessory === 'envelope') {
    fillRect(g, 1, 6, 6, 4, 11);
    rectOutline(g, 1, 6, 6, 4, 1);
    put(g, 2, 7, 1);
    put(g, 3, 8, 1);
    put(g, 4, 8, 1);
    put(g, 5, 7, 1);
    put(g, 1, 11, 1);
    put(g, 6, 11, 1);
  }
}

// ─── expressions (paint over visor) ────────────────────

function paintEyes(g: Grid, expr: Expr, t: number) {
  fillRect(g, 10, 9, 12, 4, 5);
  put(g, 10, 9, 11);
  put(g, 11, 9, 11);

  const ink = 1;
  const L = { x: 13, y: 10 };
  const R = { x: 18, y: 10 };
  const dr = (x: number, y: number, w: number, h: number, v: number) =>
    fillRect(g, x, y, w, h, v);

  switch (expr) {
    case 'idle':
    case 'track':
      dr(L.x, L.y, 2, 2, ink);
      dr(R.x, R.y, 2, 2, ink);
      break;
    case 'blink':
      dr(L.x, L.y + 1, 2, 1, ink);
      dr(R.x, R.y + 1, 2, 1, ink);
      break;
    case 'happy':
      dr(L.x, L.y + 1, 2, 1, ink);
      put(g, L.x - 1, L.y, ink);
      put(g, L.x + 2, L.y, ink);
      dr(R.x, R.y + 1, 2, 1, ink);
      put(g, R.x - 1, R.y, ink);
      put(g, R.x + 2, R.y, ink);
      put(g, 15, 15, 1);
      put(g, 16, 15, 1);
      put(g, 14, 14, 1);
      put(g, 17, 14, 1);
      put(g, 9, 14, 9);
      put(g, 23, 14, 9);
      break;
    case 'thinking':
      dr(L.x, L.y, 2, 2, ink);
      dr(R.x, R.y + 1, 2, 1, ink);
      put(g, 27, 3, 1);
      put(g, 28, 3, 1);
      put(g, 27, 4, 1);
      put(g, 28, 4, 1);
      put(g, 25, 6, 1);
      break;
    case 'loading': {
      const dotsL = [
        [L.x, L.y],
        [L.x + 1, L.y],
        [L.x + 1, L.y + 1],
        [L.x, L.y + 1],
      ];
      const dotsR = [
        [R.x + 1, R.y],
        [R.x + 1, R.y + 1],
        [R.x, R.y + 1],
        [R.x, R.y],
      ];
      const i = t % 4;
      put(g, dotsL[i][0], dotsL[i][1], ink);
      put(g, dotsR[i][0], dotsR[i][1], ink);
      break;
    }
    case 'error':
      put(g, L.x, L.y, ink);
      put(g, L.x + 1, L.y + 1, ink);
      put(g, L.x + 1, L.y, ink);
      put(g, L.x, L.y + 1, ink);
      put(g, R.x, R.y, ink);
      put(g, R.x + 1, R.y + 1, ink);
      put(g, R.x + 1, R.y, ink);
      put(g, R.x, R.y + 1, ink);
      for (let y = 9; y < 13; y++) for (let x = 10; x < 22; x++) {
        const idx = y * g.w + x;
        if (g.d[idx] === 5) g.d[idx] = 9;
      }
      put(g, 14, 15, 1);
      put(g, 17, 15, 1);
      put(g, 15, 14, 1);
      put(g, 16, 14, 1);
      break;
    case 'success':
      dr(L.x, L.y + 1, 2, 1, ink);
      put(g, L.x - 1, L.y, ink);
      put(g, L.x + 2, L.y, ink);
      dr(R.x, R.y + 1, 2, 1, ink);
      put(g, R.x - 1, R.y, ink);
      put(g, R.x + 2, R.y, ink);
      put(g, 5, 5, 10);
      put(g, 6, 6, 10);
      put(g, 26, 6, 10);
      put(g, 27, 5, 10);
      for (let x = 13; x < 19; x++) put(g, x, 15, 1);
      put(g, 12, 14, 1);
      put(g, 19, 14, 1);
      for (let y = 22; y < 24; y++)
        for (let x = 15; x < 17; x++) g.d[y * g.w + x] = 10;
      break;
    case 'sleepy':
      dr(L.x, L.y + 1, 2, 1, ink);
      put(g, L.x - 1, L.y + 1, ink);
      put(g, L.x + 2, L.y + 1, ink);
      dr(R.x, R.y + 1, 2, 1, ink);
      put(g, R.x - 1, R.y + 1, ink);
      put(g, R.x + 2, R.y + 1, ink);
      for (let y = 9; y < 13; y++) for (let x = 10; x < 22; x++) {
        const idx = y * g.w + x;
        if (g.d[idx] === 5) g.d[idx] = 6;
      }
      // Z's
      for (const [x, y] of [
        [27, 3],
        [28, 3],
        [29, 3],
        [29, 4],
        [28, 5],
        [27, 6],
        [27, 7],
        [28, 7],
        [29, 7],
      ]) put(g, x, y, 1);
      break;
    case 'wink':
      dr(L.x, L.y + 1, 2, 1, ink);
      dr(R.x, R.y, 2, 2, ink);
      put(g, 15, 15, 1);
      put(g, 16, 15, 1);
      put(g, 14, 14, 1);
      put(g, 17, 14, 1);
      break;
  }
}

function shiftEyes(g: Grid, dx: number, dy: number) {
  fillRect(g, 10, 9, 12, 4, 5);
  put(g, 10, 9, 11);
  put(g, 11, 9, 11);
  fillRect(g, 13 + dx, 10 + dy, 2, 2, 1);
  fillRect(g, 18 + dx, 10 + dy, 2, 2, 1);
}

// ─── public API ────────────────────────────────────────

export function paintStark(opts: PaintOpts): Grid {
  const g = makeGrid(32, 32);
  const pose = opts.pose ?? 'idle';
  const accessory = opts.accessory ?? 'none';
  const expr = opts.expr ?? 'idle';
  paintBase(g, { pose, accessory });
  paintEyes(g, expr, opts.frame ?? 0);
  if ((expr === 'idle' || expr === 'track' || expr === 'wink') && (opts.lookDx || opts.lookDy)) {
    if (expr !== 'wink') {
      shiftEyes(
        g,
        Math.max(-1, Math.min(1, opts.lookDx ?? 0)),
        Math.max(-1, Math.min(1, opts.lookDy ?? 0)),
      );
    }
  }
  if (opts.antennaPulse) {
    put(g, 15, 0, 8);
    put(g, 16, 0, 8);
    put(g, 14, 0, 7);
    put(g, 17, 0, 7);
  }
  return g;
}

export function blit(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  scale: number,
  offsetX = 0,
  offsetY = 0,
  bodyHex: string = PAL.body,
) {
  const tones = deriveBodyTones(bodyHex);
  const palette: Record<string, string> = {
    ...PAL,
    body: tones.body,
    bodyHi: tones.bodyHi,
    bodyLo: tones.bodyLo,
  };
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const v = grid.d[y * grid.w + x];
      if (!v) continue;
      const key = IDX[v];
      if (!key) continue;
      ctx.fillStyle = palette[key];
      ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
    }
  }
}
