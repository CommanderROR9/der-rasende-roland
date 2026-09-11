// render.js — Pixel-Renderer. Kein DOM-Zugriff beim Import (testbar in Node).
import { PAL } from './config.js';

const cache = new Map();

function paletteFor(key, palette) {
  return Object.assign({}, PAL, palette || {});
}

/** Baut eine Sprite-Matrix in ein eigenes Canvas (einmalig, gecacht). */
export function spriteCanvas(name, rows, palette) {
  const key = name + '|' + (palette ? Object.keys(palette).join('') : 'base');
  if (cache.has(key)) return cache.get(key);
  const pal = paletteFor(name, palette);
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  // Vollflächige Silhouette für Trefferblitze
  const solid = document.createElement('canvas');
  solid.width = w; solid.height = h;
  const sg = solid.getContext('2d');
  sg.drawImage(cv, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#ffffff';
  sg.fillRect(0, 0, w, h);
  const out = { canvas: cv, solid, w, h };
  cache.set(key, out);
  return out;
}

/** Zeichnet ein Sprite an Pixelkoordinaten (optional gespiegelt / weiß geblitzt). */
export function blit(ctx, spr, x, y, flip = false, flash = 0, alpha = 1) {
  const img = flash > 0 ? spr.solid : spr.canvas;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) {
    ctx.translate(spr.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Deterministischer Hash für prozedurale Kacheltexturen. */
export function hash2(x, y, seed = 0) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
