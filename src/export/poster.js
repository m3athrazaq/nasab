// A printed family tree: the chart, a title block, a frame from the chosen look, a legend.
// Builds the page as a scene (see chart/draw.js); pdf.js, image.js and the preview draw it.
import { layoutDescendants, layoutFan } from '../chart/layout.js';
import { drawDescendants, drawFan } from '../chart/draw.js';
import { posterTheme, branchColor } from '../chart/themes.js';
import { frameItems, dividerItems } from '../chart/ornaments.js';
import { fitText } from '../chart/draw.js';
import { makeInfo } from '../chart/info.js';
import { t, count, num, lang, fmtDate, lifeYears } from '../core/i18n.js';
import { familyTitle, lineageText } from '../core/names.js';
import { generations } from '../core/model.js';
import { makeD } from '../core/dates.js';

export const PAPERS = {
  A4: [595.28, 841.89], A3: [841.89, 1190.55], A2: [1190.55, 1683.78], A1: [1683.78, 2383.94], A0: [2383.94, 3370.39]
};
const MAX_SIDE = 14400; // PDF page limit (200 inches)

/** the title and subtitle a tree gets unless the user wrote his own */
export function defaultTitles(ix, root) {
  const p = ix.P[root];
  if (!p) return { head: '', title: '', sub: '' };
  const fam = ix.familyOf(root);
  const ar = lang.value === 'ar';
  const line = ix.paternalLine(root, 3).map(x => ix.P[x].n);
  const lin = lineageText(line, { gender: p.g, style: 'bin', lang: lang.value });
  const yrs = lifeYears(p);
  if (ar) return { head: fam ? 'شجرة عائلة' : 'شجرة', title: fam ? familyTitle(fam) : 'ذرية ' + p.n, sub: 'ذرية الجد ' + lin + (yrs ? ' (' + yrs + ')' : '') };
  return { head: 'The family tree of', title: fam ? (fam.replace(/^(آل|ال)\s?/, '') || fam) : p.n, sub: 'Descendants of ' + lin + (yrs ? ' (' + yrs + ')' : '') };
}

/** titles of an ancestors' fan: the person's own lineage */
export function fanTitles(ix, id) {
  const p = ix.P[id];
  if (!p) return { head: '', title: '', sub: '' };
  const ar = lang.value === 'ar';
  const line = ix.paternalLine(id, 3).map(x => ix.P[x].n);
  const fam = ix.familyOf(id);
  const lin = lineageText(line, { gender: p.g, style: 'bin', lang: lang.value });
  if (ar) return { head: 'شجرة أصول', title: lin, sub: (p.g === 'f' ? 'آباؤها وأمهاتها' : 'آباؤه وأمهاته') + (fam ? ' — ' + familyTitle(fam) : '') };
  return { head: 'The ancestors of', title: lin, sub: fam ? fam : '' };
}

/**
 * opts: { mode: 'v'|'h'|'r'|'f', theme, paper: 'A4'…'A0'|'auto', orient: 'auto'|'portrait'|'landscape',
 *         root, title, head, sub, photos, dates, spouses, dKids, colors, hideLiving, legend, gens (fan) }
 * env:  { measure(font, text, size), photoIds: Set (photos that will be drawn), today: Date }
 * → { W, H, scene, scale, nameSize, warn }
 */
export function buildPoster(ix, s, opts, env) {
  const th = posterTheme(opts.theme);
  const mode = opts.mode || 'v';
  const root = opts.root && ix.P[opts.root] ? opts.root : (s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me));
  if (!root) return null;
  const info = makeInfo(ix, s, { hideLiving: opts.hideLiving, photoIds: env.photoIds });
  const rtl = lang.value === 'ar';
  const measure = env.measure;
  const o = {
    info, measure, photos: opts.photos !== false, dates: opts.dates !== false, spouses: !!opts.spouses, colors: opts.colors !== false,
    bands: false, num: n => num(n),
    motherLabel: u => { const w = ix.U[u] && ix.U[u].w; return w && ix.P[w] ? (rtl ? 'من ' : 'by ') + ix.P[w].n : ''; }
  };
  let L, chart;
  const person = opts.person && ix.P[opts.person] ? opts.person : (s.me && ix.P[s.me] ? s.me : root);
  if (mode === 'f') {
    // as many rings as there are known ancestors (2 to 7)
    const known = Math.max(0, ...ix.ancestors(person, 8).values());
    L = layoutFan(ix, person, { gens: opts.gens || Math.min(7, Math.max(2, known)), rtl });
    chart = drawFan(L, th, o);
  } else {
    // wider cards in print (names are not cut as often)
    const metrics = mode === 'v' ? { w: 104 } : mode === 'h' ? { w: 180 } : {};
    L = layoutDescendants(ix, root, { mode, dKids: !!opts.dKids, spouses: !!opts.spouses, dates: o.dates, rtl, metrics, collapsed: new Set() });
    chart = drawDescendants(L, th, o);
  }
  const b = L.bounds;
  const cw = b.x1 - b.x0, ch = b.y1 - b.y0;

  /* page size */
  let W, H;
  const landscape = opts.orient === 'landscape' || (opts.orient !== 'portrait' && cw / ch > 1.08);
  const titles = mode === 'f' ? fanTitles(ix, person) : defaultTitles(ix, root);
  const head = opts.head != null ? opts.head : titles.head;
  const title = opts.title || titles.title;
  const sub = opts.sub != null ? opts.sub : titles.sub;
  if (opts.paper === 'auto' || !PAPERS[opts.paper]) {
    // chart at full size (names at their natural size), page around it
    let w = Math.max(cw + 200, 595), h = Math.max(ch + 360, 595);
    for (let k = 0; k < 3; k++) {
      const u0 = Math.min(w, h) / 595;
      const inset = frameItems(th.frame, w, h, th).inset;
      const tH = titleHeight(u0, !!head, !!sub), lH = legendHeight(u0, opts);
      w = Math.max(cw + 2 * inset + 20, 420); h = Math.max(ch + 2 * inset + tH + lH + 20, 420);
    }
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    W = Math.round(w * k); H = Math.round(h * k);
  } else {
    [W, H] = PAPERS[opts.paper];
    if (landscape) [W, H] = [H, W];
  }
  const u = Math.min(W, H) / 595; // 1 on A4's short side
  const fr = frameItems(th.frame, W, H, th);
  const inset = fr.inset;
  const scene = [{ t: 'rect', x: 0, y: 0, w: W, h: H, fill: th.bg }];
  scene.push(...fr.items);

  /* title block */
  const tH = titleHeight(u, !!head, !!sub);
  let y = inset + 4 * u;
  const cx = W / 2, maxW = W - 2 * inset;
  const ttl = th.fonts.title;
  if (head) {
    const hs = 17 * u;
    y += hs;
    const h1 = fitText(measure, head, ttl, hs, maxW);
    scene.push({ t: 'text', x: cx, y, s: h1.s, font: ttl, size: h1.size, fill: th.ink2, w: h1.w });
    y += 8 * u;
  }
  const ts = (ttl === 'ruqaa' ? 46 : 40) * u;
  y += ts * 0.95;
  const tt = fitText(measure, title, ttl, ts, maxW, 0.5);
  scene.push({ t: 'text', x: cx, y, s: tt.s, font: ttl, size: tt.size, fill: th.accent === th.gold ? th.gold : th.ink, w: tt.w });
  y += 14 * u;
  scene.push(...dividerItems(th.frame, cx, y, Math.min(maxW * 0.5, 260 * u), th, u));
  y += 8 * u;
  if (sub) {
    const ss = 13.5 * u;
    y += ss + 4 * u;
    const st = fitText(measure, sub, th.fonts.sub || th.fonts.text, ss, maxW * 0.9, 0.6);
    scene.push({ t: 'text', x: cx, y, s: st.s, font: th.fonts.sub || th.fonts.text, size: st.size, fill: th.ink2, w: st.w });
  }
  {
    // how many people and generations, and the date
    const n = mode === 'f' ? L.slots.filter(x => x.id).length + 1 : L.nodes.filter(x => !x.dup).length;
    const gens = mode === 'f' ? Math.max(1, ...L.slots.filter(x => x.id).map(x => x.g + 1)) : Math.max(0, ...L.nodes.map(x => x.depth)) + 1;
    const now = env.today || new Date();
    const today = makeD({ cal: 'g', y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
    const line = lang.value === 'ar'
      ? `${count(n, 'person')} في ${count(gens, 'generation')} — حتى ${fmtDate(today, { alt: false })}`
      : `${count(n, 'person')} in ${count(gens, 'generation')} — as of ${fmtDate(today, { alt: false })}`;
    const fs2 = 10 * u;
    y += fs2 + 7 * u;
    scene.push({ t: 'text', x: cx, y, s: line, font: th.fonts.text, size: fs2, fill: th.ink3, w: measure(th.fonts.text, line, fs2) });
  }
  const top = inset + tH;

  /* legend */
  const lH = legendHeight(u, opts);
  const legendY = H - inset - lH + 6 * u;
  if (opts.legend !== false) scene.push(...legendItems(ix, L, th, opts, measure, W, legendY, u, root, mode));

  /* the chart, scaled into what is left */
  const box = { x: inset, y: top + 6 * u, w: W - 2 * inset, h: H - inset - lH - top - 10 * u };
  const scale = Math.min(box.w / cw, box.h / ch, opts.paper === 'auto' ? 1 : 2.4);
  const tx = box.x + (box.w - cw * scale) / 2 - b.x0 * scale;
  const ty = box.y + (box.h - ch * scale) / 2 - b.y0 * scale;
  scene.push({ t: 'g', tf: [scale, tx, ty], items: chart.items });
  const nameSize = (mode === 'f' ? 9 : L.M.nameSize || 12) * scale;
  return { W, H, scene, scale, nameSize, warn: nameSize < 5.5, theme: th, people: mode === 'f' ? 0 : L.nodes.length };
}
function titleHeight(u, head, sub) { return (head ? 25 : 0) * u + 46 * u * 0.95 + 22 * u + (sub ? 17.5 : 0) * u + 17 * u + 16 * u; }
function legendHeight(u, opts) { return opts.legend === false ? 8 * u : 40 * u; }

function legendItems(ix, L, th, opts, measure, W, y, u, root, mode) {
  const items = [];
  const fs = 9.5 * u, font = th.fonts.text;
  const parts = [];
  const ar = lang.value === 'ar';
  const R = 6 * u;
  // shapes
  const shape = (kind, col) => {
    const a = [];
    if (kind === 'm') a.push({ t: 'rect', x: -R, y: -R, w: 2 * R, h: 2 * R, r: R * 0.34, fill: 'none', stroke: col, sw: 1.2 * u });
    if (kind === 'f') a.push({ t: 'circle', cx: 0, cy: 0, r: R, fill: 'none', stroke: col, sw: 1.2 * u });
    if (kind === 'dot') a.push({ t: 'circle', cx: 0, cy: 0, r: R * 0.8, fill: col, stroke: 'none' });
    return a;
  };
  if (mode !== 'f') {
    parts.push({ icon: shape('m', th.ink2), label: ar ? 'ذكر' : 'male' });
    parts.push({ icon: shape('f', th.ink2), label: ar ? 'أنثى' : 'female' });
    parts.push({ icon: [{ t: 'circle', cx: 0, cy: 0, r: R, fill: th.bg, stroke: th.ink3, sw: 1.2 * u }], label: ar ? 'المفرغ: متوفى' : 'hollow: deceased' });
    if (opts.colors !== false && L.nodes) {
      const kids = L.nodes.filter(n => n.depth === 1 && !n.dup);
      for (const n of kids.slice(0, 8)) parts.push({ icon: shape('dot', branchColor(th, n.branch, true)), label: (ar ? 'فرع ' : '') + ix.P[n.id].n + (ar ? '' : "'s branch") });
    }
  } else {
    parts.push({ icon: [{ t: 'rect', x: -R, y: -R, w: 2 * R, h: 2 * R, r: 2 * u, fill: th.fanP[0], stroke: th.line, sw: 0.6 * u }], label: ar ? 'جهة الأب' : "father's side" });
    parts.push({ icon: [{ t: 'rect', x: -R, y: -R, w: 2 * R, h: 2 * R, r: 2 * u, fill: th.fanM[0], stroke: th.line, sw: 0.6 * u }], label: ar ? 'جهة الأم' : "mother's side" });
  }
  // lay out right to left (Arabic) centred
  const gap = 14 * u, ig = 5 * u;
  const widths = parts.map(p => 2 * R + ig + measure(font, p.label, fs));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  let x = ar ? W / 2 + total / 2 : W / 2 - total / 2;
  const cy = y + 6 * u;
  parts.forEach((p, i) => {
    const w = widths[i];
    const iconX = ar ? x - R : x + R;
    items.push({ t: 'g', tf: [1, iconX, cy], items: p.icon });
    const lw = w - 2 * R - ig;
    const tx = ar ? x - 2 * R - ig - lw / 2 : x + 2 * R + ig + lw / 2;
    items.push({ t: 'text', x: tx, y: cy + fs * 0.35, s: p.label, font, size: fs, fill: th.ink2, w: lw });
    x += (ar ? -1 : 1) * (w + gap);
  });
  // maker's mark
  const mark = ar ? 'صُنعت بتطبيق نَسَب' : 'Made with Nasab';
  const ms = 7.5 * u;
  items.push({ t: 'text', x: W / 2, y: cy + 16 * u, s: mark, font, size: ms, fill: th.ink3, w: measure(font, mark, ms), op: 0.8 });
  return items;
}
