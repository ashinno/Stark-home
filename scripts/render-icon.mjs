/**
 * Render the Stark mascot as a real macOS-style app icon.
 *
 * Apple's Big Sur+ guidance: a "squircle" rounded rectangle (corner radius
 * ≈ 22.37% of the side), gentle gradient or material background, content
 * inset by ~12% so the glyph sits on its tile, soft shadow under the glyph.
 *
 * Output:
 *   resources/icon.png            1024×1024 — packaged DMG icon
 *   resources/icon-512.png
 *   resources/icon-256.png
 *   resources/icon-128.png
 *   resources/tray-icon.png       16×16 monochrome silhouette template
 *   resources/tray-icon@2x.png    32×32
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { paintStark } from './stark-sprite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES = resolve(__dirname, '..', 'resources');
mkdirSync(RES, { recursive: true });

// ─── pixel ops ────────────────────────────────────────

function hex(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function lerp(a, b, t) { return a + (b - a) * t; }

function setPx(buf, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const off = (y * w + x) * 4;
  if (a === 255) { buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = 255; return; }
  // simple over-compositing
  const sa = a / 255;
  const da = buf[off + 3] / 255;
  const oa = sa + da * (1 - sa);
  buf[off] = Math.round((r * sa + buf[off] * da * (1 - sa)) / Math.max(oa, 1e-6));
  buf[off + 1] = Math.round((g * sa + buf[off + 1] * da * (1 - sa)) / Math.max(oa, 1e-6));
  buf[off + 2] = Math.round((b * sa + buf[off + 2] * da * (1 - sa)) / Math.max(oa, 1e-6));
  buf[off + 3] = Math.round(oa * 255);
}

/** Apple-ish squircle: rounded rect with corner radius r. Returns alpha 0–1 per pixel
 * with subpixel sampling so the corner is smooth (not jaggy). */
function squircleAlpha(x, y, size, radius) {
  const cx = size / 2;
  const cy = size / 2;
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const half = size / 2;
  const corner = half - radius;
  if (dx <= corner || dy <= corner) return 1;
  const px = dx - corner;
  const py = dy - corner;
  const d = Math.sqrt(px * px + py * py);
  // anti-alias the edge over ~1px
  const t = radius - d;
  if (t > 1) return 1;
  if (t < 0) return 0;
  return t;
}

function fillBackground(buf, size, top, bot) {
  const radius = Math.round(size * 0.2237);
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(lerp(top[0], bot[0], t));
    const g = Math.round(lerp(top[1], bot[1], t));
    const b = Math.round(lerp(top[2], bot[2], t));
    for (let x = 0; x < size; x++) {
      const a = squircleAlpha(x + 0.5, y + 0.5, size, radius);
      if (a <= 0) continue;
      setPx(buf, size, x, y, r, g, b, Math.round(a * 255));
    }
  }
}

/** Subtle inner highlight: light glow at top, vignette at bottom. */
function addLighting(buf, size) {
  const radius = Math.round(size * 0.2237);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = squircleAlpha(x + 0.5, y + 0.5, size, radius);
      if (a <= 0) continue;
      // top highlight (warm)
      const distTop = y / size;
      const hi = Math.max(0, 1 - distTop * 1.6) * 0.18;
      // bottom vignette
      const vig = Math.max(0, (y / size - 0.7) / 0.3) * 0.15;
      const off = (y * size + x) * 4;
      const r = buf[off], g = buf[off + 1], b = buf[off + 2];
      const newR = Math.min(255, Math.round(r + (255 - r) * hi - r * vig));
      const newG = Math.min(255, Math.round(g + (255 - g) * hi - g * vig));
      const newB = Math.min(255, Math.round(b + (255 - b) * hi - b * vig));
      buf[off] = newR; buf[off + 1] = newG; buf[off + 2] = newB;
    }
  }
}

/** Subtle hairline rim along the squircle edge (Apple-ish). */
function addRim(buf, size) {
  const radius = Math.round(size * 0.2237);
  const rim = Math.max(1, Math.round(size / 384));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = squircleAlpha(x + 0.5, y + 0.5, size, radius);
      if (a <= 0 || a >= 1) continue;
      // edge pixel — darken for the rim
      for (let i = 0; i < rim; i++) {
        const off = (y * size + x) * 4;
        buf[off] = Math.round(buf[off] * 0.7);
        buf[off + 1] = Math.round(buf[off + 1] * 0.7);
        buf[off + 2] = Math.round(buf[off + 2] * 0.7);
      }
    }
  }
}

/** Drop a soft elliptical shadow under the glyph. */
function dropShadow(buf, size, cx, cy, w, h) {
  const radius = Math.round(size * 0.2237);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (squircleAlpha(x + 0.5, y + 0.5, size, radius) <= 0) continue;
      const dx = (x - cx) / (w / 2);
      const dy = (y - cy) / (h / 2);
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const a = (1 - d) * 0.35;
      const off = (y * size + x) * 4;
      buf[off] = Math.round(buf[off] * (1 - a));
      buf[off + 1] = Math.round(buf[off + 1] * (1 - a));
      buf[off + 2] = Math.round(buf[off + 2] * (1 - a));
    }
  }
}

/** Paint the Stark sprite at a target size, returning {data, w, h}. */
function paintSpriteRGBA(targetPx, body = '#1C2340') {
  const grid = paintStark({ expr: 'happy', pose: 'idle', accessory: 'wings' });
  const scale = Math.max(1, Math.floor(targetPx / 32));
  const w = grid.w * scale;
  const h = grid.h * scale;
  const data = new Uint8Array(w * h * 4);

  const PAL = {
    1: '#141725', 2: body, 3: '#3a4a8a', 4: '#0c1028',
    5: '#9EE6C9', 6: '#2A2E44', 7: '#F5A524', 8: '#FFD277',
    9: '#E8708A', 10: '#9EE6C9', 11: '#F4EEDF', 12: '#EBE2CB',
    13: '#586179', 14: '#3A4256',
  };

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const v = grid.d[y * grid.w + x];
      if (!v) continue;
      const [r, g, b] = hex(PAL[v] || '#000');
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = x * scale + dx;
          const py = y * scale + dy;
          const off = (py * w + px) * 4;
          data[off] = r; data[off + 1] = g; data[off + 2] = b; data[off + 3] = 255;
        }
      }
    }
  }
  return { data, w, h };
}

/** Compose a macOS-style icon at `size` px. */
function makeMacIcon(size) {
  const buf = new Uint8Array(size * size * 4); // transparent
  // Background: warm parchment top → cream bottom (subtle)
  fillBackground(buf, size, hex('#FAEFD0'), hex('#E5D4A8'));
  addLighting(buf, size);

  // Drop-shadow under Stark
  const shadowCx = Math.round(size * 0.5);
  const shadowCy = Math.round(size * 0.78);
  dropShadow(buf, size, shadowCx, shadowCy, size * 0.66, size * 0.18);

  // Stark — paint to a temporary buffer at ~62% of icon size, then composite
  const sprBoxFraction = 0.62;
  const sprBox = Math.round(size * sprBoxFraction);
  // sprite scales by floor(sprBox/32). Need a multiple of 32 for crisp scale.
  const scale = Math.max(1, Math.floor(sprBox / 32));
  const spr = paintSpriteRGBA(32 * scale, '#1C2340');
  const offX = Math.round((size - spr.w) / 2);
  const offY = Math.round((size - spr.h) / 2 - size * 0.02); // slight upward bias
  for (let y = 0; y < spr.h; y++) {
    for (let x = 0; x < spr.w; x++) {
      const sOff = (y * spr.w + x) * 4;
      if (spr.data[sOff + 3] === 0) continue;
      const px = x + offX;
      const py = y + offY;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const off = (py * size + px) * 4;
      buf[off] = spr.data[sOff];
      buf[off + 1] = spr.data[sOff + 1];
      buf[off + 2] = spr.data[sOff + 2];
      buf[off + 3] = spr.data[sOff + 3];
    }
  }

  addRim(buf, size);
  return { width: size, height: size, data: buf };
}

/** Tray template: black silhouette of Stark on transparent bg. */
function makeTrayTemplate(size) {
  const grid = paintStark({ expr: 'idle', pose: 'idle', accessory: 'wings' });
  const scale = Math.max(1, Math.floor(size / 32));
  const buf = new Uint8Array(size * size * 4);
  const offX = Math.floor((size - 32 * scale) / 2);
  const offY = Math.floor((size - 32 * scale) / 2);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (!grid.d[y * 32 + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = x * scale + dx + offX;
          const py = y * scale + dy + offY;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const off = (py * size + px) * 4;
          buf[off] = 0; buf[off + 1] = 0; buf[off + 2] = 0; buf[off + 3] = 255;
        }
      }
    }
  }
  return { width: size, height: size, data: buf };
}

function writePng(filepath, { width, height, data }) {
  const png = new PNG({ width, height });
  for (let i = 0; i < data.length; i++) png.data[i] = data[i];
  writeFileSync(filepath, PNG.sync.write(png));
}

console.log('[stark-icon] writing macOS-style PNGs to', RES);
for (const s of [1024, 512, 256, 128]) {
  writePng(resolve(RES, s === 1024 ? 'icon.png' : `icon-${s}.png`), makeMacIcon(s));
}
writePng(resolve(RES, 'tray-icon.png'), makeTrayTemplate(16));
writePng(resolve(RES, 'tray-icon@2x.png'), makeTrayTemplate(32));
console.log('[stark-icon] done.');
