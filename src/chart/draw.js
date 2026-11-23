// From a layout to a list of things to draw (the "scene"), in a theme. The same scene is drawn on the
// screen (SVG), into a PDF (vector), and into a PNG image — so what you see is what you print.
//
// Scene items: { t: 'path', d, fill, stroke, sw, op, cap, join, dash }
//              { t: 'rect', x, y, w, h, r, fill, stroke, sw, op, dash }
//              { t: 'circle', cx, cy, r, fill, stroke, sw, op, dash }
//              { t: 'text', x, y, s, font, size, fill, rot, op }        (x = centre, y = baseline)
//              { t: 'image', photo, x, y, w, h, clip: { shape: 'circle'|'rect', r } }
//              { t: 'g', key, id, items, hit: {x,y,w,h}, tf: [scale, tx, ty] }
import { branchColor, mix } from './themes.js';

const rad = a => a * Math.PI / 180;
const norm = deg => { let d = ((deg % 360) + 360) % 360; if (d > 180) d -= 360; return d; };
/** a rotation that keeps text upright */
const upright = deg => { const d = norm(deg); return Math.abs(d) > 90 ? d + 180 : d; };

/** the text at its size if it fits, else smaller (down to 72%), else cut with an ellipsis */
export function fitText(measure, s, font, size, maxW, minScale = 0.72) {
  if (!s) return { s: '', size, w: 0 };
  let w = measure(font, s, size);
  if (w <= maxW) return { s, size, w };
  const size2 = Math.max(size * minScale, size * maxW / w);
  w = measure(font, s, size2);
  if (w <= maxW) return { s, size: size2, w };
  let cut = [...s];
  while (cut.length > 1 && measure(font, cut.join('') + '…', size2) > maxW) cut.pop();
  const out = cut.join('').trim() + '…';
  return { s: out, size: size2, w: measure(font, out, size2) };
}

/** a rounded box centred at (cx, cy), turned by deg (a pill when r is half the height), as a path */
export function boxPath(cx, cy, w, h, r, deg = 0) {
  r = Math.max(0, Math.min(r, h / 2, w / 2));
  const a = rad(deg), c = Math.cos(a), sn = Math.sin(a), X = w / 2, Y = h / 2;
  const n1 = v => (Math.round(v * 100) / 100).toString();
  const P = (x, y) => n1(cx + x * c - y * sn) + ' ' + n1(cy + x * sn + y * c);
  const A = (x, y) => `A${n1(r)} ${n1(r)} 0 0 1 ${P(x, y)}`;
  return `M${P(-X + r, -Y)}L${P(X - r, -Y)}${A(X, -Y + r)}L${P(X, Y - r)}${A(X - r, Y)}L${P(-X + r, Y)}${A(-X, Y - r)}L${P(-X, -Y + r)}${A(-X + r, -Y)}Z`;
}
/** the fill of a person's shape: his branch's tint, or hollow once deceased */
const shapeFill = (th, inf, col) => (inf.dead ? th.deadFill : mix(col, th.paper, th.sealFillAlpha));

/** the seal of a person: square (rounded) for men, round for women; hollow once deceased */
function seal(items, th, cx, cy, R, inf, col, { dup = false, photos = true, measure, ring = '', ringW = 2.2 }) {
  const female = inf.g === 'f';
  const fill = inf.dead ? th.deadFill : mix(col, th.paper, th.sealFillAlpha);
  const r = female ? R : R * 0.34;
  if (ring) {
    const g = 3.2 + ringW / 2;
    if (female) items.push({ t: 'circle', cx, cy, r: R + g, fill: 'none', stroke: ring, sw: ringW });
    else items.push({ t: 'rect', x: cx - R - g, y: cy - R - g, w: 2 * (R + g), h: 2 * (R + g), r: r + g, fill: 'none', stroke: ring, sw: ringW });
  }
  const dash = dup ? [3, 2.5] : null;
  if (female) items.push({ t: 'circle', cx, cy, r: R, fill, stroke: col, sw: 1.7, dash });
  else items.push({ t: 'rect', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, r, fill, stroke: col, sw: 1.7, dash });
  if (photos && inf.photo && !dup) {
    const i = 2;
    items.push({ t: 'image', photo: inf.photo, x: cx - R + i, y: cy - R + i, w: 2 * (R - i), h: 2 * (R - i), clip: female ? { shape: 'circle' } : { shape: 'rect', r: Math.max(0, r - i) } });
  } else {
    const ch = inf.initial || '';
    const size = R * 1.02;
    items.push({ t: 'text', x: cx, y: cy + size * 0.3, s: ch, font: th.fonts.initial, size, fill: inf.dead ? mix(col, th.paper, 0.75) : col, w: measure(th.fonts.initial, ch, size) });
  }
}

/** how strongly daughters' children (shown under their mothers) are drawn: a watermark */
export const FAINT = 0.36, FAINT_LINK = 0.3;

/**
 * o: { info(id) → { name, initial, years, dead, g, photo, spouses }, measure(font, text, size),
 *      photos, dates, spouses, colors, bands, genLabel(n), me, selected, thread: Set of node keys,
 *      screen, motherLabel(unionId), tags: Map id → label (a branch that goes on on another page:
 *      the label, such as its page number, instead of the "+N" of a folded branch) }
 */
export function drawDescendants(L, th, o) {
  const items = [];
  const M = L.M;
  const measure = o.measure;
  const byKey = new Map(L.nodes.map(n => [n.key, n]));
  const thread = o.thread || new Set();
  const b = L.bounds;

  /* generation bands */
  if (o.bands && (L.mode === 'v' || L.mode === 'h')) {
    const maxDepth = Math.max(0, ...L.nodes.map(n => n.depth));
    const base = L.genBase || 1; // row d is generation d + base (a tree drawn from a lower generation starts there)
    for (let d = L.firstRow || 0; d <= maxDepth; d++) {
      const label = o.genLabel ? o.genLabel(d + base) : '';
      const odd = (d + base) % 2 === 1;
      if (L.mode === 'v') {
        const y0 = d * M.level - L.box.top - 10, y1 = d * M.level + L.box.bottom + 6;
        if (odd) items.push({ t: 'rect', x: b.x0 - 60, y: y0, w: b.x1 - b.x0 + 120, h: y1 - y0, r: 8, fill: th.band });
        if (label) {
          const size = 11;
          const w = measure(th.fonts.years, label, size);
          const x = L.rtl ? b.x1 + 52 - w / 2 : b.x0 - 52 + w / 2;
          items.push({ t: 'text', x, y: (y0 + y1) / 2 + 4, s: label, font: th.fonts.years, size, fill: th.bandText, w, rot: L.rtl ? 90 : -90 });
        }
      } else {
        const x = (L.rtl ? -1 : 1) * d * M.level;
        if (odd) items.push({ t: 'rect', x: x - M.w / 2 - 8, y: b.y0 - 34, w: M.w + 16, h: b.y1 - b.y0 + 60, r: 8, fill: th.band });
        if (label) {
          const size = 11, w = measure(th.fonts.years, label, size);
          items.push({ t: 'text', x, y: b.y0 - 14, s: label, font: th.fonts.years, size, fill: th.bandText, w });
        }
      }
    }
  }

  /* trunk and ground under the canopy */
  if (L.mode === 'r') {
    const trunk = mix(th.line, th.ink, 0.6);
    const H = M.trunk + 30;
    items.push({ t: 'path', d: `M-15 ${H}C-9 ${H * 0.6} -8 ${H * 0.3} -6 0L6 0C8 ${H * 0.3} 9 ${H * 0.6} 15 ${H}Z`, fill: trunk, stroke: 'none' });
    items.push({ t: 'path', d: `M-15 ${H}C-30 ${H + 6} -46 ${H + 4} -60 ${H + 12}M15 ${H}C30 ${H + 6} 46 ${H + 4} 60 ${H + 12}M-4 ${H}C-6 ${H + 10} -12 ${H + 16} -18 ${H + 22}M4 ${H}C6 ${H + 10} 12 ${H + 16} 18 ${H + 22}`, fill: 'none', stroke: trunk, sw: 3, cap: 'round' });
    items.push({ t: 'path', d: `M-150 ${H + 14}Q0 ${H + 2} 150 ${H + 14}`, fill: 'none', stroke: th.line, sw: 1, op: 0.6, cap: 'round' });
  }
  const trunkPlaque = (label, cx) => {
    // a name on a plaque across the trunk (the founder, or the family when the tree starts lower)
    const nm = fitText(measure, label, th.fonts.title || th.fonts.name, M.nameSize * 1.45, 150);
    const pw = nm.w + 26, ph = nm.size * 1.55, py = M.trunk * 0.5;
    return [
      { t: 'rect', x: cx - pw / 2, y: py - ph / 2, w: pw, h: ph, r: ph / 2, fill: th.pill, stroke: th.gold, sw: 1.2 },
      { t: 'text', x: cx, y: py + nm.size * 0.36, s: nm.s, font: th.fonts.title || th.fonts.name, size: nm.size, fill: th.ink, w: nm.w }
    ];
  };

  /* links (the lineage thread on top) */
  const plain = [], lit = [];
  for (const l of L.links) {
    const to = byKey.get(l.to);
    const on = thread.has(l.to) && thread.has(l.from);
    const base = L.mode === 'r' ? mix(branchColor(th, to.branch, o.colors), mix(th.line, th.ink, 0.55), o.colors ? 0.45 : 0) : (o.colors ? mix(branchColor(th, to.branch, true), th.line, 0.38) : th.line);
    const sw = (l.w || th.lineW) * (on ? (L.mode === 'r' ? 1.25 : 1.9) : 1);
    (on ? lit : plain).push({ t: 'path', d: l.d, fill: 'none', stroke: on ? th.thread : base, sw, cap: 'round', join: 'round', op: l.faint && !on ? FAINT_LINK : undefined });
  }
  items.push(...plain, ...lit);

  /* wives' names over their children's group, when a man's children have more than one mother */
  for (const gp of L.groups || []) {
    const label = o.motherLabel ? o.motherLabel(gp.union) : '';
    if (!label) continue;
    const size = 10, w = measure(th.fonts.years, label, size) + 14;
    items.push({ t: 'rect', x: gp.x - w / 2, y: gp.y - 9, w, h: 17, r: 8.5, fill: th.pill, stroke: th.line, sw: 0.8 });
    items.push({ t: 'text', x: gp.x, y: gp.y + 3.5, s: label, font: th.fonts.years, size, fill: th.pillInk, w: w - 14 });
  }

  /* people */
  const parents = new Set(L.nodes.map(n => n.parent).filter(Boolean));
  const tagOf = n => (n.hidden && o.tags && o.tags.get(n.id)) || '';
  const plus = n => '+' + (o.num ? o.num(n.hidden) : n.hidden);
  for (const n of L.nodes) {
    const inf = o.info(n.id);
    if (!inf) continue;
    // (the founder's branch is -1, his own colour; the top of an atlas page keeps its branch's colour)
    const col = branchColor(th, n.branch, o.colors);
    const g = { t: 'g', key: n.key, id: n.id, dup: n.dup, items: [] };
    const ring = o.selected === n.id ? th.thread : o.me === n.id ? th.gold : '';
    const nameInk = n.dup ? th.ink3 : th.ink;
    if (n.row) {
      // one of a list of brothers and sisters: a small mark on the list's rail (square for men, round
      // for women, hollow once deceased), the name, then the years
      const rw = n.row, dir = rw.rtl ? -1 : 1, m = Math.min(5.2, rw.h * 0.2);
      const mx = rw.rail + dir * (6 + m + 1);
      const fill = inf.dead ? th.deadFill : col, dash = n.dup ? [2, 1.6] : null;
      if (inf.g === 'f') g.items.push({ t: 'circle', cx: mx, cy: n.y, r: m, fill, stroke: col, sw: 1.3, dash });
      else g.items.push({ t: 'rect', x: mx - m, y: n.y - m, w: 2 * m, h: 2 * m, r: m * 0.3, fill, stroke: col, sw: 1.3, dash });
      const start = mx + dir * (m + 5), room = Math.abs((rw.rtl ? rw.x0 : rw.x1) - start) - 2;
      const yr = o.dates && inf.years ? fitText(measure, inf.years, th.fonts.years, M.yearSize, room * 0.42) : null;
      const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize, room - (yr ? yr.w + 6 : 0));
      g.items.push({ t: 'text', x: start + dir * nm.w / 2, y: n.y + nm.size * 0.34, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w });
      if (yr) g.items.push({ t: 'text', x: start + dir * (nm.w + 6 + yr.w / 2), y: n.y + yr.size * 0.34, s: yr.s, font: th.fonts.years, size: yr.size, fill: th.ink2, w: yr.w });
      if (ring) g.items.push({ t: 'rect', x: rw.x0, y: n.y - rw.h / 2, w: rw.x1 - rw.x0, h: rw.h, r: 6, fill: 'none', stroke: ring, sw: 1.6 });
      g.hit = { x: rw.x0, y: n.y - rw.h / 2, w: rw.x1 - rw.x0, h: rw.h };
    } else if (L.mode === 'v' && L.inside) {
      // a card with the name (and the years) inside: square corners for men, round ends for women
      const ch = L.box.cardH, cw = M.w - 8, female = inf.g === 'f';
      const x0 = n.x - cw / 2, y0 = n.y - ch / 2, r = female ? ch / 2 : 8;
      if (ring) g.items.push({ t: 'rect', x: x0 - 3.5, y: y0 - 3.5, w: cw + 7, h: ch + 7, r: r + 3.5, fill: 'none', stroke: ring, sw: 2.2 });
      g.items.push({ t: 'rect', x: x0, y: y0, w: cw, h: ch, r, fill: shapeFill(th, inf, col), stroke: col, sw: n.depth === 0 ? 2.3 : 1.6, dash: n.dup ? [3, 2.5] : null });
      const avail = cw - (female ? ch * 0.55 : 12);
      const two = o.dates && inf.years;
      const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize, avail);
      g.items.push({ t: 'text', x: n.x, y: two ? n.y + 0.5 : n.y + nm.size * 0.36, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w });
      if (two) {
        const yr = fitText(measure, inf.years, th.fonts.years, M.yearSize, avail);
        g.items.push({ t: 'text', x: n.x, y: n.y + 15, s: yr.s, font: th.fonts.years, size: yr.size, fill: th.ink2, w: yr.w });
      }
      if (o.spouses && inf.spouses) {
        const sp = fitText(measure, inf.spouses, th.fonts.years, M.spouseSize, M.w);
        g.items.push({ t: 'text', x: n.x, y: n.y + ch / 2 + 13, s: sp.s, font: th.fonts.years, size: sp.size, fill: th.ink3, w: sp.w });
      }
      g.hit = { x: n.x - M.w / 2, y: y0 - 4, w: M.w, h: L.box.top + L.box.bottom + 8 };
      // (a page tag stands a little lower, clear of a wife's name)
      if (n.hidden) badge(g.items, th, measure, n.x, n.y + L.box.bottom + (tagOf(n) ? 9 : 4), tagOf(n) || plus(n), col);
    } else if (L.mode === 'v') {
      const R = n.depth === 0 ? M.R * 1.12 : M.R;
      seal(g.items, th, n.x, n.y, R, inf, col, { dup: n.dup, photos: o.photos && !n.faint, measure, ring });
      let y = n.y + M.R + M.nameGap - 1;
      const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize, M.w - 4);
      g.items.push({ t: 'text', x: n.x, y, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w });
      if (o.dates && inf.years) {
        y += M.yearGap;
        const yr = fitText(measure, inf.years, th.fonts.years, M.yearSize, M.w);
        g.items.push({ t: 'text', x: n.x, y, s: yr.s, font: th.fonts.years, size: yr.size, fill: th.ink2, w: yr.w });
      }
      if (o.spouses && inf.spouses) {
        y += 13;
        const sp = fitText(measure, inf.spouses, th.fonts.years, M.spouseSize, M.w);
        g.items.push({ t: 'text', x: n.x, y, s: sp.s, font: th.fonts.years, size: sp.size, fill: th.ink3, w: sp.w });
      }
      g.hit = { x: n.x - M.w / 2, y: n.y - M.R - 6, w: M.w, h: M.R + L.box.bottom + 6 };
      // (a page tag stands a little lower, clear of a wife's name)
      if (n.hidden) badge(g.items, th, measure, n.x, n.y + L.box.bottom + (tagOf(n) ? 9 : 4), tagOf(n) || plus(n), col);
    } else if (L.mode === 'h') {
      const w = M.w, h = M.h, x0 = n.x - w / 2, y0 = n.y - h / 2;
      const female = inf.g === 'f';
      if (ring) g.items.push({ t: 'rect', x: x0 - 3.5, y: y0 - 3.5, w: w + 7, h: h + 7, r: female ? h / 2 + 3.5 : 13.5, fill: 'none', stroke: ring, sw: 2.2 });
      let tx0, tx1;
      if (L.inside) {
        // the card itself carries the branch colour and the name, no seal
        g.items.push({ t: 'rect', x: x0, y: y0, w, h, r: female ? h / 2 : 10, fill: shapeFill(th, inf, col), stroke: col, sw: n.depth === 0 ? 2.2 : 1.4, dash: n.dup ? [3, 2.5] : null });
        tx0 = x0 + (female ? h * 0.36 : 10); tx1 = x0 + w - (female ? h * 0.36 : 10);
      } else {
        g.items.push({ t: 'rect', x: x0, y: y0, w, h, r: female ? h / 2 : 10, fill: th.pill, stroke: mix(col, th.line, 0.55), sw: 1, dash: n.dup ? [3, 2.5] : null });
        const sx = L.rtl ? x0 + w - h / 2 : x0 + h / 2;
        seal(g.items, th, sx, n.y, M.R, inf, col, { dup: n.dup, photos: o.photos && !n.faint, measure });
        tx0 = L.rtl ? x0 + 8 : sx + M.R + 6; tx1 = L.rtl ? sx - M.R - 6 : x0 + w - 8;
      }
      const cx = (tx0 + tx1) / 2, avail = tx1 - tx0;
      const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize, avail);
      const two = o.dates && inf.years;
      g.items.push({ t: 'text', x: cx, y: n.y + (two ? -1 : 5), s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w });
      if (two) {
        const yr = fitText(measure, inf.years, th.fonts.years, M.yearSize, avail);
        g.items.push({ t: 'text', x: cx, y: n.y + 13, s: yr.s, font: th.fonts.years, size: yr.size, fill: th.ink2, w: yr.w });
      }
      g.hit = { x: x0, y: y0, w, h };
      if (n.hidden) {
        // beside the card, on the side its children would be
        const label = tagOf(n) || plus(n), bw = badgeW(th, measure, label);
        badge(g.items, th, measure, L.rtl ? x0 - 6 - bw / 2 : x0 + w + 6 + bw / 2, n.y + 4, label, col);
      }
    } else if (L.inside) {
      // canopy, the names inside: the founder on the trunk, the others in small frames on the branches
      const female = inf.g === 'f', dash = n.dup ? [3, 2.5] : null, fill = shapeFill(th, inf, col);
      const frame = (cx, cy, pw, ph, deg) => {
        if (ring) g.items.push({ t: 'path', d: boxPath(cx, cy, pw + 7, ph + 7, female ? (ph + 7) / 2 : 7.5, deg), fill: 'none', stroke: ring, sw: 2 });
        g.items.push({ t: 'path', d: boxPath(cx, cy, pw, ph, female ? ph / 2 : 4, deg), fill, stroke: col, sw: 1.3, dash });
      };
      if (n.depth === 0) {
        g.items.push(...trunkPlaque(inf.name, n.x));
        g.hit = { x: n.x - 60, y: n.y - 10, w: 120, h: M.trunk * 0.5 + 30 };
      } else if (parents.has(n.key)) {
        const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize * 0.92, M.ring * 0.62);
        const ph = nm.size * 1.75, pw = nm.w + 16;
        frame(n.x, n.y, pw, ph, 0);
        g.items.push({ t: 'text', x: n.x, y: n.y + nm.size * 0.36, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w });
        g.hit = { x: n.x - pw / 2 - 4, y: n.y - ph / 2 - 4, w: pw + 8, h: ph + 8 };
      } else {
        const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize * 0.92, M.ring - 2 * M.R - 8);
        const ph = nm.size * 1.7, pw = nm.w + 14, off = pw / 2 - 3;
        const c = Math.cos(rad(n.ang)), sn = Math.sin(rad(n.ang));
        const cx = n.x + c * off, cy = n.y + sn * off;
        frame(cx, cy, pw, ph, n.ang);
        g.items.push({ t: 'text', x: cx, y: cy + nm.size * 0.34, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w, rot: upright(n.ang), rx: cx, ry: cy });
        g.hit = { x: Math.min(n.x, n.x + c * pw) - ph / 2, y: Math.min(n.y, n.y + sn * pw) - ph / 2, w: Math.abs(c * pw) + ph, h: Math.abs(sn * pw) + ph };
        if (tagOf(n)) tagAlong(g.items, th, measure, n.x, n.y, n.ang, pw + 4, tagOf(n), col);
        else if (n.hidden) badge(g.items, th, measure, n.x + c * (pw + 10), n.y + sn * (pw + 10), '+', col);
      }
    } else {
      // canopy
      const root = n.depth === 0;
      const R = root ? M.R * 1.9 : M.R;
      seal(g.items, th, n.x, n.y, R, inf, col, { dup: n.dup, photos: o.photos && !n.faint, measure, ring });
      if (root) {
        g.items.push(...trunkPlaque(inf.name, n.x));
        g.hit = { x: n.x - Math.max(R, 60), y: n.y - R - 6, w: 2 * Math.max(R, 60), h: R + M.trunk * 0.5 + 30 };
      } else if (parents.has(n.key)) {
        // a branch that goes on: the name under the seal, upright, with a halo over the branches
        const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize * 0.92, M.ring * 0.62);
        g.items.push({ t: 'text', x: n.x, y: n.y + R + nm.size + 1, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w, halo: th.halo || th.bg, hw: 3.2 });
        g.hit = { x: n.x - Math.max(R, nm.w / 2) - 4, y: n.y - R - 4, w: 2 * Math.max(R, nm.w / 2) + 8, h: 2 * R + nm.size + 8 };
      } else {
        // a leaf: the name continues the branch outwards
        const avail = M.ring - 2 * M.R - 12;
        const nm = fitText(measure, inf.name, th.fonts.name, M.nameSize, avail);
        const off = M.R + 5 + nm.w / 2, c = Math.cos(rad(n.ang)), s = Math.sin(rad(n.ang));
        g.items.push({ t: 'text', x: n.x + c * off, y: n.y + s * off + nm.size * 0.33, s: nm.s, font: th.fonts.name, size: nm.size, fill: nameInk, w: nm.w, rot: upright(n.ang), rx: n.x + c * off, ry: n.y + s * off });
        g.hit = { x: n.x - R - 4, y: n.y - R - 4, w: 2 * R + 8, h: 2 * R + 8 };
        // a branch that goes on on another page: its page after the name, along the branch
        if (tagOf(n)) tagAlong(g.items, th, measure, n.x, n.y, n.ang, M.R + 5 + nm.w + 5, tagOf(n), col);
      }
      if (n.hidden && !(tagOf(n) && !root && !parents.has(n.key))) badge(g.items, th, measure, n.x + Math.cos(rad(n.ang)) * (M.R + 14), n.y + Math.sin(rad(n.ang)) * (M.R + 14), tagOf(n) || '+', col);
    }
    // a daughter's child (shown under the mother): like a watermark, unless picked
    if (n.faint && o.selected !== n.id) for (const it of g.items) it.op = (it.op == null ? 1 : it.op) * FAINT;
    if (n.faint) g.faint = true;
    items.push(g);
  }
  if (L.mode === 'r' && L.virtual && o.trunkLabel) items.push(...trunkPlaque(o.trunkLabel, 0));
  return { items, bounds: b };
}
const badgeW = (th, measure, label) => Math.max(18, measure(th.fonts.years, label, 10) + 10);
function badge(items, th, measure, x, y, label, col) {
  const size = 10, w = badgeW(th, measure, label);
  items.push({ t: 'rect', x: x - w / 2, y: y - 8, w, h: 16, r: 8, fill: col, stroke: 'none' });
  items.push({ t: 'text', x, y: y + 3.6, s: label, font: th.fonts.years, size, fill: th.paper === 'transparent' ? '#fff' : th.paper, w: w - 10 });
}
/** a tag turned along a branch of the canopy, starting off units out from (x, y) */
function tagAlong(items, th, measure, x, y, ang, off, label, col) {
  const size = 10, w = badgeW(th, measure, label) + 2, h = 16;
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang));
  const cx = x + c * (off + w / 2), cy = y + s * (off + w / 2);
  items.push({ t: 'path', d: boxPath(cx, cy, w, h, h / 2, ang), fill: col, stroke: 'none' });
  items.push({ t: 'text', x: cx, y: cy + size * 0.34, s: label, font: th.fonts.years, size, fill: th.paper === 'transparent' ? '#fff' : th.paper, w: w - 12, rot: upright(ang), rx: cx, ry: cy });
}

/** the ancestors' fan */
export function drawFan(L, th, o) {
  const items = [];
  const measure = o.measure;
  for (const sl of L.slots) {
    const g = { t: 'g', key: `fan:${sl.g}:${sl.i}`, id: sl.id || '', fan: sl, items: [] };
    const fill = sl.id ? (sl.side === 'father' ? th.fanP[sl.g % 2] : th.fanM[sl.g % 2]) : th.fanEmpty;
    g.items.push({ t: 'path', d: sl.d, fill, stroke: th.fanLine, sw: 1.4 });
    const am = (sl.a0 + sl.a1) / 2, rm = (sl.r0 + sl.r1) / 2;
    const cx = rm * Math.cos(rad(am)), cy = rm * Math.sin(rad(am));
    const arc = rm * rad(sl.a1 - sl.a0), ring = sl.r1 - sl.r0;
    if (sl.id) {
      const inf = o.info(sl.id);
      if (sl.g <= 2) {
        const rot = upright(am + 90);
        const nm = fitText(measure, inf.name, th.fonts.name, Math.min(17, ring * 0.24), arc - 14);
        const two = o.dates && inf.years;
        // name and years stacked across the ring (towards the centre is "down" once upright)
        const flip = Math.abs(norm(am + 90)) > 90 ? -1 : 1;
        const off = two ? 7 : 0;
        const nx = cx + Math.cos(rad(am)) * off * flip, ny = cy + Math.sin(rad(am)) * off * flip;
        g.items.push({ t: 'text', x: nx, y: ny + nm.size * 0.33, s: nm.s, font: th.fonts.name, size: nm.size, fill: th.ink, w: nm.w, rot, rx: nx, ry: ny });
        if (two) {
          const yr = fitText(measure, inf.years, th.fonts.years, 10, arc - 14);
          const yx = cx - Math.cos(rad(am)) * 12 * flip, yy = cy - Math.sin(rad(am)) * 12 * flip;
          g.items.push({ t: 'text', x: yx, y: yy + 3.4, s: yr.s, font: th.fonts.years, size: yr.size, fill: th.ink2, w: yr.w, rot, rx: yx, ry: yy });
        }
      } else {
        const rot = upright(am);
        const size = Math.min(13, Math.max(7, arc * 0.5));
        const nm = fitText(measure, inf.name, th.fonts.name, size, ring - 12);
        g.items.push({ t: 'text', x: cx, y: cy + nm.size * 0.33, s: nm.s, font: th.fonts.name, size: nm.size, fill: th.ink, w: nm.w, rot, rx: cx, ry: cy });
      }
    } else if (o.screen && sl.child) {
      const size = Math.min(16, arc * 0.5);
      g.items.push({ t: 'text', x: cx, y: cy + size * 0.35, s: '+', font: th.fonts.years, size, fill: th.ink3, w: measure(th.fonts.years, '+', size) });
    }
    items.push(g);
  }
  // the person in the middle
  const inf = o.info(L.person);
  const r0 = L.M.r0 - 6;
  const g = { t: 'g', key: 'fan:0', id: L.person, items: [] };
  g.items.push({ t: 'circle', cx: 0, cy: 0, r: r0, fill: th.paper === 'transparent' ? th.pill : th.pill, stroke: th.thread, sw: 2 });
  const nm = fitText(measure, inf.name, th.fonts.name, 17, r0 * 1.6);
  g.items.push({ t: 'text', x: 0, y: o.dates && inf.years ? 0 : 6, s: nm.s, font: th.fonts.name, size: nm.size, fill: th.ink, w: nm.w });
  if (o.dates && inf.years) {
    const yr = fitText(measure, inf.years, th.fonts.years, 10, r0 * 1.5);
    g.items.push({ t: 'text', x: 0, y: 16, s: yr.s, font: th.fonts.years, size: yr.size, fill: th.ink2, w: yr.w });
  }
  g.hit = { x: -r0, y: -r0, w: 2 * r0, h: 2 * r0 };
  items.push(g);
  return { items, bounds: L.bounds };
}

/** the keys of the nodes on the way from a person up to the top of the tree (the red thread) */
export function threadKeys(L, id) {
  const out = new Set();
  const byKey = new Map(L.nodes.map(n => [n.key, n]));
  let n = byKey.get(id);
  while (n) { out.add(n.key); n = n.parent ? byKey.get(n.parent) : null; }
  return out;
}
