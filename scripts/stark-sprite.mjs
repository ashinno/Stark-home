/**
 * Plain-ESM mirror of apps/renderer/src/lib/stark/sprite.ts so Node scripts
 * can render the mascot without a build step. Logic stays identical.
 */

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
};

const IDX = {
  0: null, 1: 'ink', 2: 'body', 3: 'bodyHi', 4: 'bodyLo', 5: 'visor', 6: 'visorOff',
  7: 'amber', 8: 'amberHi', 9: 'rose', 10: 'mint', 11: 'white', 12: 'cream',
  13: 'steel', 14: 'steelLo',
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function deriveBodyTones(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hh = 0, ss = 0;
  const ll = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hh = (b - r) / d + 2; break;
      case b: hh = (r - g) / d + 4; break;
    }
    hh /= 6;
  }
  const toHex = (H, S, L) => {
    if (S === 0) {
      const v = Math.round(L * 255);
      return '#' + [v, v, v].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
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
    return '#' + [rr, gg, bb].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  };
  return {
    body: hex,
    bodyHi: toHex(hh, Math.min(1, ss * 0.9), Math.min(0.75, ll + 0.15)),
    bodyLo: toHex(hh, Math.min(1, ss * 1.1), Math.max(0.04, ll - 0.12)),
  };
}

function makeGrid(w, h) { return { w, h, d: new Uint8Array(w * h) }; }
function put(g, x, y, v) { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return; g.d[y * g.w + x] = v; }
function fillRect(g, x, y, w, h, v) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, v); }
function rectOutline(g, x, y, w, h, v) {
  for (let i = 0; i < w; i++) { put(g, x + i, y, v); put(g, x + i, y + h - 1, v); }
  for (let j = 0; j < h; j++) { put(g, x, y + j, v); put(g, x + w - 1, y + j, v); }
}

function paintBase(g, opts) {
  const { pose = 'idle', accessory = 'none' } = opts;
  // antenna
  put(g, 15, 1, 1); put(g, 16, 1, 1); put(g, 15, 2, 1); put(g, 16, 2, 1); put(g, 15, 3, 1); put(g, 16, 3, 1);
  put(g, 14, 0, 1); put(g, 15, 0, 7); put(g, 16, 0, 7); put(g, 17, 0, 1);
  // head
  fillRect(g, 8, 4, 16, 14, 2);
  fillRect(g, 9, 5, 14, 1, 3); fillRect(g, 9, 5, 1, 12, 3);
  fillRect(g, 9, 16, 14, 1, 4); fillRect(g, 22, 5, 1, 12, 4);
  rectOutline(g, 7, 4, 18, 14, 1);
  put(g, 7, 4, 0); put(g, 24, 4, 0); put(g, 7, 17, 0); put(g, 24, 17, 0);
  put(g, 8, 4, 1); put(g, 23, 4, 1); put(g, 8, 17, 1); put(g, 23, 17, 1);
  put(g, 7, 5, 1); put(g, 24, 5, 1); put(g, 7, 16, 1); put(g, 24, 16, 1);
  put(g, 8, 5, 3); put(g, 23, 5, 3); put(g, 8, 16, 4); put(g, 23, 16, 4);
  // visor
  fillRect(g, 9, 8, 14, 6, 6);
  fillRect(g, 10, 9, 12, 4, 5);
  rectOutline(g, 9, 8, 14, 6, 1);
  put(g, 10, 9, 11); put(g, 11, 9, 11);
  // ear vents
  for (const y of [9, 10, 11, 12, 13]) { put(g, 6, y, 1); put(g, 25, y, 1); }
  put(g, 5, 10, 1); put(g, 5, 12, 1); put(g, 26, 10, 1); put(g, 26, 12, 1);
  // neck
  fillRect(g, 14, 17, 4, 2, 1);
  fillRect(g, 15, 17, 2, 1, 13);
  // body
  fillRect(g, 7, 19, 18, 9, 2);
  fillRect(g, 8, 20, 16, 1, 3); fillRect(g, 8, 20, 1, 7, 3);
  fillRect(g, 8, 26, 16, 1, 4); fillRect(g, 23, 20, 1, 7, 4);
  rectOutline(g, 6, 19, 20, 9, 1);
  put(g, 6, 19, 0); put(g, 25, 19, 0); put(g, 6, 27, 0); put(g, 25, 27, 0);
  put(g, 7, 19, 1); put(g, 24, 19, 1); put(g, 7, 27, 1); put(g, 24, 27, 1);
  put(g, 6, 20, 1); put(g, 25, 20, 1); put(g, 6, 26, 1); put(g, 25, 26, 1);
  put(g, 7, 20, 3); put(g, 24, 20, 3); put(g, 7, 26, 4); put(g, 24, 26, 4);
  // chest
  fillRect(g, 13, 21, 6, 4, 14);
  rectOutline(g, 13, 21, 6, 4, 1);
  put(g, 15, 22, 7); put(g, 16, 22, 7); put(g, 15, 23, 8); put(g, 16, 23, 8);
  // belly seam
  for (let i = 8; i < 24; i++) if (i !== 13 && i !== 18) put(g, i, 25, 4);
  // feet
  fillRect(g, 9, 28, 5, 3, 1); fillRect(g, 18, 28, 5, 3, 1);
  fillRect(g, 10, 29, 3, 1, 13); fillRect(g, 19, 29, 3, 1, 13);
  // arms
  if (pose === 'idle' || pose === 'hover') {
    fillRect(g, 4, 20, 2, 5, 1); put(g, 5, 20, 13); put(g, 5, 21, 13);
    fillRect(g, 26, 20, 2, 5, 1); put(g, 26, 20, 13); put(g, 26, 21, 13);
    put(g, 4, 25, 1); put(g, 5, 25, 1); put(g, 26, 25, 1); put(g, 27, 25, 1);
  }
  // accessory: wings (Hermes nod)
  if (accessory === 'wings') {
    put(g, 8, 27, 8); put(g, 7, 28, 7); put(g, 6, 29, 7);
    put(g, 8, 28, 8); put(g, 7, 29, 8);
    put(g, 23, 27, 8); put(g, 24, 28, 7); put(g, 25, 29, 7);
    put(g, 23, 28, 8); put(g, 24, 29, 8);
    put(g, 6, 30, 1); put(g, 25, 30, 1);
  }
}

function paintEyes(g, expr) {
  fillRect(g, 10, 9, 12, 4, 5);
  put(g, 10, 9, 11); put(g, 11, 9, 11);
  const ink = 1;
  const L = { x: 13, y: 10 };
  const R = { x: 18, y: 10 };
  if (expr === 'happy') {
    fillRect(g, L.x, L.y + 1, 2, 1, ink);
    put(g, L.x - 1, L.y, ink); put(g, L.x + 2, L.y, ink);
    fillRect(g, R.x, R.y + 1, 2, 1, ink);
    put(g, R.x - 1, R.y, ink); put(g, R.x + 2, R.y, ink);
    put(g, 15, 15, 1); put(g, 16, 15, 1); put(g, 14, 14, 1); put(g, 17, 14, 1);
    put(g, 9, 14, 9); put(g, 23, 14, 9);
  } else {
    fillRect(g, L.x, L.y, 2, 2, ink);
    fillRect(g, R.x, R.y, 2, 2, ink);
  }
}

export function paintStark({ expr = 'happy', pose = 'idle', accessory = 'wings' } = {}) {
  const g = makeGrid(32, 32);
  paintBase(g, { pose, accessory });
  paintEyes(g, expr);
  // bright antenna pulse for the icon
  put(g, 15, 0, 8); put(g, 16, 0, 8); put(g, 14, 0, 7); put(g, 17, 0, 7);
  return g;
}

/** Paint to an RGBA byte buffer, scaled by `scale`. */
export function rasterize(grid, scale, bodyHex = '#1C2340', bg = null) {
  const tones = deriveBodyTones(bodyHex);
  const palette = { ...PAL, body: tones.body, bodyHi: tones.bodyHi, bodyLo: tones.bodyLo };
  const w = grid.w * scale;
  const h = grid.h * scale;
  const buf = new Uint8Array(w * h * 4);
  // Optional background fill
  if (bg) {
    const [br, bgr, bb] = hexToRgb(bg);
    for (let i = 0; i < buf.length; i += 4) { buf[i] = br; buf[i + 1] = bgr; buf[i + 2] = bb; buf[i + 3] = 255; }
  }
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const v = grid.d[y * grid.w + x];
      if (!v) continue;
      const key = IDX[v];
      if (!key) continue;
      const [r, g, b] = hexToRgb(palette[key]);
      // paint a `scale × scale` block
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = x * scale + dx;
          const py = y * scale + dy;
          const off = (py * w + px) * 4;
          buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = 255;
        }
      }
    }
  }
  return { width: w, height: h, data: buf };
}
