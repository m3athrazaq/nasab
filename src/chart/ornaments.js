// Frames for printed trees: a Sadu weaving band (Kuwait's Bedouin weaving), Islamic eight-point stars,
// golden arabesque with palm fronds, a plain rule, and a starry night. All vector.
import { seeded } from '../core/util.js';
import { mix } from './themes.js';

const f = v => (Math.round(v * 100) / 100).toString();
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
/** an eight-point star (two squares) as a path, centre (cx, cy), outer radius R */
export function star8(cx, cy, R, rot = 0) {
  const r = R * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const a = rot + k * Math.PI / 8 - Math.PI / 2;
    const rr = k % 2 ? r : R;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return poly(pts);
}
const diamond = (cx, cy, w, h) => poly([[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]]);

/* ---------------- Sadu ---------------- */
const SADU = { red: '#A3271F', black: '#1D1714', wool: '#F1EADC', saffron: '#C8962E' };
/** one band along u (length) and v (thickness T); map(u, v) → page point */
function saduBand(len, T, map) {
  const items = [];
  const P = pts => poly(pts.map(([u, v]) => map(u, v)));
  const rect = (u0, v0, u1, v1, fill) => items.push({ t: 'path', d: P([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]), fill, stroke: 'none' });
  const e = T * 0.09, w = T * 0.07;
  rect(0, 0, len, T, SADU.red);
  rect(0, 0, len, e, SADU.black); rect(0, T - e, len, T, SADU.black);
  rect(0, e, len, e + w, SADU.wool); rect(0, T - e - w, len, T - e, SADU.wool);
  const f0 = e + w, f1 = T - e - w, fh = f1 - f0, mid = (f0 + f1) / 2;
  const U = T * 1.15;
  const n = Math.max(1, Math.round(len / U));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5) * step;
    // black diamond with a red heart and a wool dot
    items.push({ t: 'path', d: P([[c, f0 + fh * 0.08], [c + step * 0.34, mid], [c, f1 - fh * 0.08], [c - step * 0.34, mid]]), fill: SADU.black, stroke: 'none' });
    items.push({ t: 'path', d: P([[c, f0 + fh * 0.3], [c + step * 0.16, mid], [c, f1 - fh * 0.3], [c - step * 0.16, mid]]), fill: SADU.red, stroke: 'none' });
    items.push({ t: 'path', d: P([[c, mid - fh * 0.08], [c + step * 0.05, mid], [c, mid + fh * 0.08], [c - step * 0.05, mid]]), fill: SADU.wool, stroke: 'none' });
    // teeth (ضرس) between the diamonds, from both edges
    const b = i * step;
    for (const k of [0.0, 1.0]) {
      const u = b + k * step;
      if (k === 1 && i < n - 1) continue;
      items.push({ t: 'path', d: P([[u - step * 0.13, f0], [u + step * 0.13, f0], [u, f0 + fh * 0.36]]), fill: SADU.wool, stroke: 'none' });
      items.push({ t: 'path', d: P([[u - step * 0.13, f1], [u + step * 0.13, f1], [u, f1 - fh * 0.36]]), fill: SADU.wool, stroke: 'none' });
      items.push({ t: 'path', d: P([[u - step * 0.05, mid - fh * 0.06], [u + step * 0.05, mid - fh * 0.06], [u + step * 0.05, mid + fh * 0.06], [u - step * 0.05, mid + fh * 0.06]]), fill: SADU.saffron, stroke: 'none' });
    }
  }
  return items;
}
function saduCorner(x, y, T) {
  const items = [];
  items.push({ t: 'rect', x, y, w: T, h: T, fill: SADU.black, stroke: 'none' });
  const c = [x + T / 2, y + T / 2];
  items.push({ t: 'path', d: diamond(c[0], c[1], T * 0.84, T * 0.84), fill: SADU.red, stroke: 'none' });
  items.push({ t: 'path', d: diamond(c[0], c[1], T * 0.56, T * 0.56), fill: SADU.wool, stroke: 'none' });
  items.push({ t: 'path', d: diamond(c[0], c[1], T * 0.3, T * 0.3), fill: SADU.black, stroke: 'none' });
  items.push({ t: 'path', d: diamond(c[0], c[1], T * 0.1, T * 0.1), fill: SADU.saffron, stroke: 'none' });
  return items;
}

/* ---------------- arabesque + palm fronds ---------------- */
function frond(x, y, len, dirX, dirY, bend, color, sw) {
  // a curved spine with leaflets on both sides
  const items = [];
  const nx = -dirY, ny = dirX; // normal
  const ex = x + dirX * len + nx * bend, ey = y + dirY * len + ny * bend;
  const cx = x + dirX * len * 0.5 + nx * bend * 1.6, cy = y + dirY * len * 0.5 + ny * bend * 1.6;
  items.push({ t: 'path', d: `M${f(x)} ${f(y)}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`, fill: 'none', stroke: color, sw: sw * 1.4, cap: 'round' });
  const pt = t => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey];
  const tan = t => { const dx = 2 * (1 - t) * (cx - x) + 2 * t * (ex - cx), dy = 2 * (1 - t) * (cy - y) + 2 * t * (ey - cy); const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const N = 16;
  for (let i = 2; i < N; i++) {
    const t = i / N;
    const [px, py] = pt(t), [tx, ty] = tan(t);
    const L = len * 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + len * 0.03;
    for (const s of [1, -1]) {
      // leaflet leaning forward along the spine
      const lx = px + (tx * 0.55 + -ty * s * 0.85) * L, ly = py + (ty * 0.55 + tx * s * 0.85) * L;
      items.push({ t: 'path', d: `M${f(px)} ${f(py)}Q${f(px + (tx * 0.3 - ty * s * 0.6) * L * 0.6)} ${f(py + (ty * 0.3 + tx * s * 0.6) * L * 0.6)} ${f(lx)} ${f(ly)}`, fill: 'none', stroke: color, sw, cap: 'round' });
    }
  }
  return items;
}
function rosetteCorner(cx, cy, R, sx, sy, color, sw) {
  // a quarter rosette pointing into the page from a corner (sx, sy = ±1 towards the inside)
  const items = [];
  for (const k of [0.45, 0.72, 1]) {
    const r = R * k;
    items.push({ t: 'path', d: `M${f(cx + sx * r)} ${f(cy)}A${f(r)} ${f(r)} 0 0 ${sx * sy > 0 ? 1 : 0} ${f(cx)} ${f(cy + sy * r)}`, fill: 'none', stroke: color, sw, cap: 'round' });
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI / 2;
    const ux = Math.cos(a) * sx, uy = Math.sin(a) * sy;
    const r0 = R * 0.45, r1 = R * 1.02;
    const px = -uy, py = ux;
    const w = R * 0.09;
    const p0 = [cx + ux * r0, cy + uy * r0], p1 = [cx + ux * r1, cy + uy * r1];
    items.push({ t: 'path', d: `M${f(p0[0])} ${f(p0[1])}Q${f((p0[0] + p1[0]) / 2 + px * w)} ${f((p0[1] + p1[1]) / 2 + py * w)} ${f(p1[0])} ${f(p1[1])}Q${f((p0[0] + p1[0]) / 2 - px * w)} ${f((p0[1] + p1[1]) / 2 - py * w)} ${f(p0[0])} ${f(p0[1])}Z`, fill: color, stroke: 'none', op: 0.85 });
  }
  items.push({ t: 'path', d: star8(cx + sx * R * 0.16, cy + sy * R * 0.16, R * 0.15), fill: color, stroke: 'none' });
  return items;
}

/**
 * the frame of a printed page. Returns { items, inset } — inset is where the content may start.
 */
export function frameItems(kind, W, H, th, { scale = 1 } = {}) {
  const items = [];
  const m = Math.round(Math.min(W, H) * 0.028) * scale; // outer margin
  const s = Math.min(W, H) / 842; // 1 on an A4's short side… grows with the paper
  if (kind === 'sadu') {
    const T = Math.max(18, 30 * s);
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
    items.push(...saduBand(x1 - x0 - 2 * T, T, (u, v) => [x0 + T + u, y0 + v]));
    items.push(...saduBand(x1 - x0 - 2 * T, T, (u, v) => [x0 + T + u, y1 - T + v]));
    items.push(...saduBand(y1 - y0 - 2 * T, T, (u, v) => [x0 + v, y0 + T + u]));
    items.push(...saduBand(y1 - y0 - 2 * T, T, (u, v) => [x1 - T + v, y0 + T + u]));
    for (const [x, y] of [[x0, y0], [x1 - T, y0], [x0, y1 - T], [x1 - T, y1 - T]]) items.push(...saduCorner(x, y, T));
    items.push({ t: 'rect', x: x0 + T + 6 * s, y: y0 + T + 6 * s, w: x1 - x0 - 2 * T - 12 * s, h: y1 - y0 - 2 * T - 12 * s, fill: 'none', stroke: SADU.black, sw: 0.8 * s, op: 0.5 });
    return { items, inset: m + T + 16 * s };
  }
  if (kind === 'stars') {
    const T = Math.max(16, 24 * s);
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
    const ink = th.ink2, fill = mix(th.gold, th.bg, 0.35);
    items.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: 'none', stroke: ink, sw: 1.6 * s });
    items.push({ t: 'rect', x: x0 + T, y: y0 + T, w: x1 - x0 - 2 * T, h: y1 - y0 - 2 * T, fill: 'none', stroke: ink, sw: 1.6 * s });
    items.push({ t: 'rect', x: x0 + 3 * s, y: y0 + 3 * s, w: x1 - x0 - 6 * s, h: y1 - y0 - 6 * s, fill: 'none', stroke: ink, sw: 0.5 * s });
    const along = (len, place) => {
      const n = Math.max(2, Math.round(len / (T * 1.25)));
      const st = len / n;
      for (let i = 0; i < n; i++) {
        const [cx, cy] = place((i + 0.5) * st);
        items.push({ t: 'path', d: star8(cx, cy, T * 0.36), fill, stroke: ink, sw: 0.7 * s });
        items.push({ t: 'circle', cx, cy, r: T * 0.08, fill: th.accent, stroke: 'none' });
        if (i < n - 1) { const [dx, dy] = place((i + 1) * st); items.push({ t: 'path', d: diamond(dx, dy, T * 0.22, T * 0.22), fill: ink, stroke: 'none' }); }
      }
    };
    along(x1 - x0 - 2 * T, u => [x0 + T + u, y0 + T / 2]);
    along(x1 - x0 - 2 * T, u => [x0 + T + u, y1 - T / 2]);
    along(y1 - y0 - 2 * T, u => [x0 + T / 2, y0 + T + u]);
    along(y1 - y0 - 2 * T, u => [x1 - T / 2, y0 + T + u]);
    for (const [cx, cy] of [[x0 + T / 2, y0 + T / 2], [x1 - T / 2, y0 + T / 2], [x0 + T / 2, y1 - T / 2], [x1 - T / 2, y1 - T / 2]]) {
      items.push({ t: 'path', d: star8(cx, cy, T * 0.46, Math.PI / 8), fill: th.accent, stroke: ink, sw: 0.7 * s });
    }
    return { items, inset: m + T + 14 * s };
  }
  if (kind === 'arabesque') {
    const g = th.gold;
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
    const gap = 7 * s;
    items.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: 'none', stroke: g, sw: 2.2 * s });
    items.push({ t: 'rect', x: x0 + gap, y: y0 + gap, w: x1 - x0 - 2 * gap, h: y1 - y0 - 2 * gap, fill: 'none', stroke: g, sw: 0.8 * s });
    const R = 64 * s;
    items.push(...rosetteCorner(x0 + gap, y0 + gap, R, 1, 1, g, 0.9 * s));
    items.push(...rosetteCorner(x1 - gap, y0 + gap, R, -1, 1, g, 0.9 * s));
    items.push(...rosetteCorner(x0 + gap, y1 - gap, R, 1, -1, g, 0.9 * s));
    items.push(...rosetteCorner(x1 - gap, y1 - gap, R, -1, -1, g, 0.9 * s));
    // palm fronds rising from the bottom corners
    const fl = Math.min(W, H) * 0.2;
    for (const [x, sx] of [[x0 + gap + R * 0.5, 1], [x1 - gap - R * 0.5, -1]]) {
      const y = y1 - gap - R * 0.5;
      items.push(...frond(x, y, fl, sx * 0.35, -0.94, sx * fl * 0.12, mix(g, th.bg, 0.55), 0.9 * s));
      items.push(...frond(x, y, fl * 0.82, sx * 0.78, -0.62, sx * fl * 0.1, mix(g, th.bg, 0.45), 0.8 * s));
    }
    // a medallion in the middle of the top rule
    items.push({ t: 'circle', cx: W / 2, cy: y0 + gap / 2, r: 11 * s, fill: th.bg, stroke: g, sw: 1.2 * s });
    items.push({ t: 'path', d: star8(W / 2, y0 + gap / 2, 8 * s), fill: g, stroke: 'none' });
    return { items, inset: m + gap + 18 * s };
  }
  if (kind === 'night') {
    const g = th.gold;
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m, gap = 6 * s;
    items.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: 'none', stroke: g, sw: 1.4 * s, op: 0.9 });
    items.push({ t: 'rect', x: x0 + gap, y: y0 + gap, w: x1 - x0 - 2 * gap, h: y1 - y0 - 2 * gap, fill: 'none', stroke: g, sw: 0.6 * s, op: 0.7 });
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      items.push({ t: 'circle', cx, cy, r: 14 * s, fill: th.bg, stroke: g, sw: 1 * s });
      items.push({ t: 'path', d: star8(cx, cy, 10 * s), fill: g, stroke: 'none' });
    }
    // a sky of small stars in the margin
    const rnd = seeded(7 + Math.round(W + H));
    const count = Math.round((W + H) / 18);
    for (let i = 0; i < count; i++) {
      const side = rnd();
      let x, y;
      if (side < 0.5) { x = rnd() * W; y = rnd() < 0.5 ? rnd() * (m - 4) : H - rnd() * (m - 4); }
      else { y = rnd() * H; x = rnd() < 0.5 ? rnd() * (m - 4) : W - rnd() * (m - 4); }
      const r = (0.6 + rnd() * 1.6) * s;
      items.push({ t: 'circle', cx: x, cy: y, r, fill: rnd() < 0.3 ? g : th.ink2, stroke: 'none', op: 0.35 + rnd() * 0.5 });
    }
    return { items, inset: m + gap + 16 * s };
  }
  // plain rule
  const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
  items.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: 'none', stroke: th.line, sw: 1 * s });
  const k = 16 * s;
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    items.push({ t: 'path', d: `M${f(cx)} ${f(cy + sy * k)}V${f(cy)}H${f(cx + sx * k)}`, fill: 'none', stroke: th.accent, sw: 3 * s, cap: 'square' });
  }
  return { items, inset: m + 18 * s };
}

/** a short ornamental divider under a title */
export function dividerItems(kind, cx, y, w, th, s = 1) {
  const items = [];
  const c = kind === 'sadu' ? '#A3271F' : th.gold;
  items.push({ t: 'path', d: `M${f(cx - w / 2)} ${f(y)}H${f(cx - 14 * s)}M${f(cx + 14 * s)} ${f(y)}H${f(cx + w / 2)}`, fill: 'none', stroke: c, sw: 1 * s, cap: 'round' });
  items.push({ t: 'path', d: kind === 'sadu' ? diamond(cx, y, 16 * s, 12 * s) : star8(cx, y, 8 * s), fill: c, stroke: 'none' });
  items.push({ t: 'circle', cx: cx - w / 2, cy: y, r: 1.8 * s, fill: c, stroke: 'none' });
  items.push({ t: 'circle', cx: cx + w / 2, cy: y, r: 1.8 * s, fill: c, stroke: 'none' });
  return items;
}
