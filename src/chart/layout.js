// Tree layouts: descendants top-down ('v'), right-to-left ('h'), the canopy ('r', a half circle of
// generations above a trunk), and the ancestors' fan ('f'). Pure geometry: positions and link paths in
// chart units; drawing (colours, text, photos) happens in draw.js.
import { hierarchy, tree } from 'd3-hierarchy';

/* sizes in chart units (1 unit = 1 CSS px on screen at zoom 1, 1 pt in a PDF before scaling) */
export const METRICS = {
  v: { R: 21, nameSize: 15, yearSize: 10.5, nameGap: 18, yearGap: 14, w: 96, gapSib: 10, gapCousin: 26, level: 118, spouseSize: 10 },
  h: { R: 15, nameSize: 14, yearSize: 10, w: 168, h: 46, gapSib: 8, gapCousin: 18, level: 216, spouseSize: 9.5 },
  r: { R: 13, nameSize: 13.5, yearSize: 8.5, ring: 122, trunk: 74 },
  f: { r0: 70, ring: 96 }
};

/**
 * the descendants of root as a nested structure, following the view's rules:
 * - a daughter's children show only with dKids (the tree follows the father's line by default)
 * - collapsed people hide their descendants (the count is kept for a "+N" badge)
 * - someone reached twice (cousins married) is drawn once in full, then as a reference
 */
export function descendantData(ix, root, { dKids = false, collapsed = new Set(), maxGen = 0 } = {}) {
  const placed = new Set();
  const countBelow = id => ix.descendants(id).size;
  function make(id, depth, branch, union) {
    const p = ix.P[id];
    const node = { id, depth, branch, union, children: [] };
    if (placed.has(id)) { node.dup = true; return node; }
    placed.add(id);
    const follow = depth === 0 || p.g !== 'f' || dKids;
    let kids = [];
    if (follow) for (const u of ix.unions(id)) for (const c of ix.childrenOfUnion(u)) kids.push([c, u]);
    if (kids.length && ((maxGen && depth + 1 >= maxGen) || collapsed.has(id))) { node.hidden = countBelow(id); kids = []; }
    node.hiddenKids = !follow ? ix.children(id).length : 0;
    node.children = kids.map(([c, u], i) => make(c, depth + 1, depth === 0 ? i : branch, u));
    return node;
  }
  if (!root || !ix.P[root]) return null;
  return make(root, 0, -1, '');
}

/** one person's card: what is shown decides its height (names, years, spouse line) */
function nodeBox(mode, M, opts) {
  if (mode === 'v') {
    const top = M.R;
    let bottom = M.R + M.nameGap;
    if (opts.dates) bottom += M.yearGap;
    if (opts.spouses) bottom += 13;
    return { top, bottom: bottom + 6 };
  }
  return { top: M.h / 2, bottom: M.h / 2 };
}

export function layoutDescendants(ix, root, opts = {}) {
  const mode = opts.mode || 'v';
  const M = { ...METRICS[mode], ...(opts.metrics || {}) };
  const data = descendantData(ix, root, opts);
  if (!data) return null;
  const h = hierarchy(data, d => d.children);
  const nodes = [], links = [];
  if (mode === 'v' || mode === 'h') {
    const box = nodeBox(mode, M, opts);
    const breadth = mode === 'v' ? M.w : M.h;
    const t = tree().nodeSize([1, 1]).separation((a, b) => breadth + (a.parent === b.parent ? M.gapSib : M.gapCousin));
    t(h);
    const rtl = opts.rtl !== false;
    h.each(n => {
      const along = n.x, depth = n.depth;
      let x, y;
      if (mode === 'v') { x = rtl ? -along : along; y = depth * M.level; }
      else { x = (rtl ? -1 : 1) * depth * M.level; y = along; }
      n.px = x; n.py = y;
    });
    let k = 0;
    h.each(n => {
      const d = n.data;
      const key = d.dup ? d.id + '#' + (k++) : d.id;
      d.key = key;
      nodes.push({ key, id: d.id, x: n.px, y: n.py, depth: n.depth, branch: d.branch, union: d.union, dup: !!d.dup, hidden: d.hidden || 0, hiddenKids: d.hiddenKids || 0, parent: n.parent ? n.parent.data.key : null });
    });
    const r = M.corner || 10;
    h.each(n => {
      if (!n.parent) return;
      const a = n.parent, b = n;
      let d;
      if (mode === 'v') {
        const x1 = a.px, y1 = a.py + box.bottom, x2 = b.px, y2 = b.py - box.top - 2;
        const ym = y1 + Math.max(10, (y2 - y1) * 0.45);
        d = elbowV(x1, y1, x2, y2, ym, r);
      } else {
        const dir = rtl ? -1 : 1;
        const x1 = a.px + dir * (M.w / 2), y1 = a.py, x2 = b.px - dir * (M.w / 2), y2 = b.py;
        const xm = x1 + dir * Math.max(10, Math.abs(x2 - x1) * 0.45);
        d = elbowH(x1, y1, x2, y2, xm, r);
      }
      links.push({ from: a.data.key, to: b.data.key, d, depth: b.depth, branch: b.data.branch, union: b.data.union });
    });
    // mother groups: where a father's children come from more than one wife
    const groups = [];
    if (mode === 'v' && opts.spouses) {
      h.each(n => {
        if (!n.children || n.children.length < 1) return;
        const byU = new Map();
        for (const c of n.children) { if (!byU.has(c.data.union)) byU.set(c.data.union, []); byU.get(c.data.union).push(c); }
        if (byU.size < 2) return;
        for (const [u, list] of byU) {
          const xs = list.map(c => c.px);
          groups.push({ parent: n.data.key, union: u, x: (Math.min(...xs) + Math.max(...xs)) / 2, x0: Math.min(...xs), x1: Math.max(...xs), y: n.py + box.bottom + (list[0].py - box.top - n.py - box.bottom) * 0.45 });
        }
      });
    }
    const b = bounds(nodes, mode === 'v' ? { l: M.w / 2 + 4, r: M.w / 2 + 4, t: box.top + 4, b: box.bottom + 18 } : { l: M.w / 2 + 6, r: M.w / 2 + 6, t: M.h / 2 + 4, b: M.h / 2 + 14 });
    return { mode, M, box, nodes, links, groups, bounds: b, rtl };
  }
  if (mode === 'r') {
    const span = opts.span || 200; // degrees of the canopy
    const t = tree().size([span, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth));
    t(h);
    const radius = d => d * M.ring;
    h.each(n => {
      // angle 0 = left end of the canopy, span = right end; drawn above the trunk
      const deg = 180 + (180 - span) / 2 + n.x; // from 180+… (left) to 360-… (right)
      const a = deg * Math.PI / 180;
      const rr = radius(n.depth);
      n.px = rr * Math.cos(a); n.py = rr * Math.sin(a); n.deg = deg;
      if (opts.rtl !== false) n.px = -n.px;
    });
    let k = 0;
    h.each(n => {
      const d = n.data;
      const key = d.dup ? d.id + '#' + (k++) : d.id;
      d.key = key;
      // reading direction of the name: along the radius, flipped on the left half so it is never upside down
      let ang = Math.atan2(n.py, n.px) * 180 / Math.PI;
      nodes.push({ key, id: d.id, x: n.px, y: n.py, depth: n.depth, branch: d.branch, union: d.union, dup: !!d.dup, hidden: d.hidden || 0, hiddenKids: d.hiddenKids || 0, parent: n.parent ? n.parent.data.key : null, ang });
    });
    h.each(n => {
      if (!n.parent) return;
      const a = n.parent, b = n;
      // a branch that leaves the parent outwards and bends towards the child
      const ra = Math.hypot(a.px, a.py), rb = Math.hypot(b.px, b.py);
      const ang = Math.atan2(b.py, b.px);
      const c1r = ra + (rb - ra) * 0.5;
      const c1x = a.depth === 0 ? a.px : (a.px / (ra || 1)) * c1r, c1y = a.depth === 0 ? a.py - M.ring * 0.5 : (a.py / (ra || 1)) * c1r;
      const c2x = Math.cos(ang) * (ra + (rb - ra) * 0.45), c2y = Math.sin(ang) * (ra + (rb - ra) * 0.45);
      const d = `M${f(a.px)} ${f(a.py)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(b.px)} ${f(b.py)}`;
      links.push({ from: a.data.key, to: b.data.key, d, depth: b.depth, branch: b.data.branch, union: b.data.union, w: Math.max(1.2, 7 - b.depth * 1.3) });
    });
    // bounds: every seal and the end of its name along the branch, the trunk and the ground
    let x0 = -170, x1 = 170, y0 = -M.R * 2.2, y1 = M.trunk + 30 + 40;
    const label = M.ring - 2 * M.R - 4;
    for (const n of nodes) {
      const ext = n.depth === 0 ? M.R * 2 : M.R + 6 + label;
      const ux = Math.cos(n.ang * Math.PI / 180), uy = Math.sin(n.ang * Math.PI / 180);
      for (const [px, py] of [[n.x - M.R, n.y - M.R], [n.x + M.R, n.y + M.R], [n.x + ux * ext, n.y + uy * ext]]) {
        x0 = Math.min(x0, px - 8); x1 = Math.max(x1, px + 8); y0 = Math.min(y0, py - 8); y1 = Math.max(y1, py + 8);
      }
    }
    return { mode, M, nodes, links, groups: [], bounds: { x0, y0, x1, y1 }, rtl: opts.rtl !== false };
  }
  return null;
}

/* elbow connectors with rounded corners */
const f = v => (Math.round(v * 10) / 10).toString();
function elbowV(x1, y1, x2, y2, ym, r) {
  if (Math.abs(x2 - x1) < 0.5) return `M${f(x1)} ${f(y1)}V${f(y2)}`;
  const s = x2 > x1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(x2 - x1) / 2, (ym - y1), (y2 - ym));
  return `M${f(x1)} ${f(y1)}V${f(ym - rr)}Q${f(x1)} ${f(ym)} ${f(x1 + s * rr)} ${f(ym)}H${f(x2 - s * rr)}Q${f(x2)} ${f(ym)} ${f(x2)} ${f(ym + rr)}V${f(y2)}`;
}
function elbowH(x1, y1, x2, y2, xm, r) {
  if (Math.abs(y2 - y1) < 0.5) return `M${f(x1)} ${f(y1)}H${f(x2)}`;
  const s = y2 > y1 ? 1 : -1, sx = x2 > x1 ? 1 : -1;
  const rr = Math.min(r, Math.abs(y2 - y1) / 2, Math.abs(xm - x1), Math.abs(x2 - xm));
  return `M${f(x1)} ${f(y1)}H${f(xm - sx * rr)}Q${f(xm)} ${f(y1)} ${f(xm)} ${f(y1 + s * rr)}V${f(y2 - s * rr)}Q${f(xm)} ${f(y2)} ${f(xm + sx * rr)} ${f(y2)}H${f(x2)}`;
}
function bounds(nodes, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - pad.l); x1 = Math.max(x1, n.x + pad.r);
    y0 = Math.min(y0, n.y - pad.t); y1 = Math.max(y1, n.y + pad.b);
  }
  if (!nodes.length) { x0 = y0 = 0; x1 = y1 = 1; }
  return { x0, y0, x1, y1 };
}

/**
 * the ancestors' fan: the person in the middle, parents in the first ring, grandparents in the
 * second… The father's side on the right (in Arabic) — slot i of generation g counts fathers as 0.
 * Unknown ancestors leave an empty slot (tap to add).
 */
export function layoutFan(ix, person, { gens = 5, rtl = true, span = 210 } = {}) {
  const M = METRICS.f;
  const slots = [];
  const start = 180 + (180 - span) / 2; // left end, degrees (y down)
  const parentIds = id => [ix.father(id), ix.mother(id)];
  let level = [{ id: person, i: 0 }];
  for (let g = 1; g <= gens; g++) {
    const next = [];
    const n = 2 ** g;
    for (let i = 0; i < n; i++) {
      const childSlot = level[i >> 1];
      const pid = childSlot && childSlot.id ? parentIds(childSlot.id)[i & 1] || '' : '';
      // fathers (even slots) to the right in Arabic: slot 0 sits at the right end
      const k = rtl ? n - 1 - i : i;
      const a0 = start + (span * k) / n, a1 = start + (span * (k + 1)) / n;
      const r0 = M.r0 + (g - 1) * M.ring, r1 = M.r0 + g * M.ring;
      slots.push({ g, i, id: pid, child: childSlot ? childSlot.id : '', role: i & 1 ? 'w' : 'h', a0, a1, r0, r1, side: i < n / 2 ? 'father' : 'mother', d: sector(r0, r1, a0, a1) });
      next.push({ id: pid, i });
    }
    level = next;
  }
  const R = M.r0 + gens * M.ring + 10;
  return { mode: 'f', M, person, slots, gens, bounds: { x0: -R, y0: -R, x1: R, y1: M.r0 + 60 } };
}
/** an annular sector (angles in degrees, y down) */
export function sector(r0, r1, a0, a1) {
  const rad = a => a * Math.PI / 180;
  const p = (r, a) => `${f(r * Math.cos(rad(a)))} ${f(r * Math.sin(rad(a)))}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  if (r0 <= 0) return `M0 0L${p(r1, a0)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${p(r1, a1)}Z`;
  return `M${p(r0, a0)}L${p(r1, a0)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${f(r0)} ${f(r0)} 0 ${large} 0 ${p(r0, a0)}Z`;
}
