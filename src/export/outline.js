// «الشجرة المسطّرة»: the family as lines, one person to a line, each generation set in a step further,
// with a line from every father down past his children and a short stroke to each of them. Set in
// columns on pages of any size (or one long page for a phone), so every name reads easily however
// big the tree: where a family goes on in the next column, its father is repeated faintly on top.
import { descendantData } from '../chart/layout.js';
import { fitText } from '../chart/draw.js';
import { posterTheme, innerTheme, branchColor } from '../chart/themes.js';
import { frameItems } from '../chart/ornaments.js';
import { makeInfo } from '../chart/info.js';
import { PAPERS, drawTitles, titleHeight, legendHeight, legendItems, countLine, defaultTitles } from './poster.js';
import { nameSizeOf } from './atlas.js';
import { lang, dig } from '../core/i18n.js';
import { lineageText, familyTitle } from '../core/names.js';
import { makeD } from '../core/dates.js';

const MAX_SIDE = 14400; // a PDF page's limit

/**
 * opts: { root, fromGen, women, dKids, dates, colors, hideLiving, size: 's'|'m'|'l', paper: 'A4'…'A0'|'auto',
 *         orient, theme, head, title, sub, by, legend, single (one page however long: images) }
 * env:  { measure(font, text, size), today }
 * → { W, H, scene, pages: [{ W, H, scene }], nameSize, warn, people, lines }
 */
export function buildOutline(ix, s, opts, env) {
  const root = opts.root && ix.P[opts.root] ? opts.root : (s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me));
  if (!root) return null;
  const ar = lang.value === 'ar', rtl = ar, dir = rtl ? -1 : 1;
  const measure = env.measure;
  const th = innerTheme(posterTheme(opts.theme));
  const women = opts.women !== false;
  const fromGen = Math.max(1, opts.fromGen || 1);
  const data = descendantData(ix, root, { dKids: !!opts.dKids, women, fromGen, collapsed: new Set() });
  if (!data) return null;
  const tops = data.virtual ? data.children : [data];
  if (!tops.length) return null;
  const info = makeInfo(ix, s, { hideLiving: opts.hideLiving, photoIds: new Set() });
  const colors = opts.colors !== false, dates = opts.dates !== false;

  /* sizes (points): the names, and everything else from them */
  const S = nameSizeOf(opts.size);
  const Z = { name: S, top: S * 1.22, years: S * 0.78, lead: S * 1.62, step: S * 1.35, mark: S * 0.3, gapMark: S * 0.5, gapYears: S * 0.55, colGap: S * 1.8 };
  const F = { name: th.fonts.name, years: th.fonts.years, ghost: th.fonts.sub || th.fonts.text };

  /* the lines, in reading order: a father, then each of his children with their own families */
  const lines = [];
  const walk = (n, depth, parent) => {
    const line = { n, id: n.id, depth, parent, kids: [], i: lines.length };
    lines.push(line);
    if (parent) parent.kids.push(line);
    for (const c of n.children) walk(c, depth + 1, line);
  };
  for (const t0 of tops) walk(t0, 0, null);
  const label = l => {
    let s1 = info(l.id).name;
    if (!data.virtual && l.depth === 0) { const fam = ix.familyOf(l.id); if (fam && !s1.includes(fam)) s1 += ' ' + fam; }
    return s1;
  };
  for (const l of lines) {
    const inf = info(l.id);
    l.name = label(l);
    l.size = l.depth === 0 && !data.virtual ? Z.top : Z.name;
    l.years = dates && inf.years ? inf.years : '';
    l.nameW = measure(F.name, l.name, l.size);
    l.yearsW = l.years ? measure(F.years, l.years, Z.years) : 0;
  }
  const maxDepth = Math.max(...lines.map(l => l.depth));
  const indent = d => d * Z.step;
  const lineW = l => indent(l.depth) + 2 * Z.mark + Z.gapMark + l.nameW + (l.years ? Z.gapYears + l.yearsW : 0) + S * 0.6;
  // the room a column needs: enough for nearly every line (the very longest few may set a touch smaller)
  const widths = lines.map(lineW).sort((a, b) => a - b);
  const want = Math.max(S * 14, widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.97))]);

  /* titles */
  const titles = defaultTitles(ix, root, fromGen);
  const head = opts.head != null ? opts.head : titles.head;
  const title = opts.title || titles.title;
  const sub = opts.sub != null ? opts.sub : titles.sub;
  const fam = ix.familyOf(root);
  const famTitle = fam ? familyTitle(fam) : ix.P[root].n;
  const people = lines.filter(l => !l.n.dup).length;
  const now = env.today || new Date();
  const today = makeD({ cal: 'g', y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
  const countText = countLine(people, maxDepth + 1, today, opts.by);

  /* the pages: their size, and the frame of the text on each */
  const auto = !PAPERS[opts.paper];
  let W, H;
  if (auto) {
    W = Math.max(420, Math.ceil(Math.min(want, 900) + 2 * 36));
    H = 0; // set once the lines are counted
  } else {
    [W, H] = PAPERS[opts.paper];
    if (opts.orient === 'landscape') [W, H] = [H, W];
  }
  const u = () => Math.min(W, H || W) / 595;
  const legendOn = opts.legend !== false;
  // the first page: the look's frame and the title block; the others: a rule with the family's name
  const firstFrame = () => {
    const uu = u();
    const fr = frameItems(th.frame, W, H || W * 1.414, th);
    const tH = titleHeight(uu, !!head, !!sub);
    const lH = legendOn ? legendHeight(uu, { legend: true }) : 10 * uu;
    return { fr, uu, x0: fr.inset + 4 * uu, x1: W - fr.inset - 4 * uu, top: fr.inset + tH + 10 * uu, bottom: lH + fr.inset + 4 * uu, lH };
  };
  const innerFrame = () => {
    const uu = u();
    return { uu, x0: 40 * uu, x1: W - 40 * uu, top: 58 * uu, bottom: 58 * uu };
  };

  /* columns: as many side by side as fit the line that needs the most room (one if none fit) */
  const columnsOn = fr => {
    const usable = fr.x1 - fr.x0;
    const n = Math.max(1, Math.floor((usable + Z.colGap) / (want + Z.colGap)));
    const cw = (usable - (n - 1) * Z.colGap) / n;
    // in Arabic the first column is on the right
    return Array.from({ length: n }, (_, c) => {
      const k = rtl ? n - 1 - c : c;
      const x0 = fr.x0 + k * (cw + Z.colGap);
      return { x0, x1: x0 + cw };
    });
  };

  /* flow the lines into columns, page after page */
  const pagesOut = []; // { fr, cols: [{ x0, x1, top, rows, lines: [line], ghost }] }
  let idx = 0;
  const longRows = auto ? Math.floor((MAX_SIDE - 200) / Z.lead) : 0;
  while (idx < lines.length) {
    const first = pagesOut.length === 0;
    let fr;
    if (auto) {
      // one long page (more only when it would pass a PDF page's limit): its height from what is left
      const left = lines.length - idx;
      const rows = opts.single ? left + 1 : Math.min(left + 1, longRows);
      H = Math.round(W * 1.414); // (for the frame, which only depends on the width here)
      fr = first ? firstFrame() : innerFrame();
      H = Math.max(W, Math.ceil(fr.top + rows * Z.lead + fr.bottom));
    } else fr = first ? firstFrame() : innerFrame();
    const cols = columnsOn(fr);
    const rowsPer = Math.max(3, Math.floor((H - fr.bottom - fr.top) / Z.lead + 1e-6));
    const page = { fr, cols: [], W, H };
    for (const col of cols) {
      if (idx >= lines.length) break;
      const c = { ...col, top: fr.top, rows: rowsPer, lines: [], ghost: null };
      let r = 0;
      // a family going on from the column before: its father, faintly, on the top row
      const l0 = lines[idx];
      if (l0.parent && !(pagesOut.length === 0 && page.cols.length === 0)) { c.ghost = l0.parent; r = 1; }
      while (r < rowsPer && idx < lines.length) {
        const l = lines[idx];
        // a father is not left alone at the foot of a column, away from his children
        if (r === rowsPer - 1 && l.kids.length && r > 1) break;
        l.col = c; l.row = r;
        c.lines.push(l);
        idx++; r++;
      }
      page.cols.push(c);
    }
    pagesOut.push(page);
    if (pagesOut.length > 400) break; // (never: a safety stop)
  }

  /* draw */
  const rowY = (c, r) => c.top + (r + 0.5) * Z.lead;
  const markX = (c, d) => (rtl ? c.x1 - indent(d) - Z.mark : c.x0 + indent(d) + Z.mark);
  const colorOf = l => branchColor(th, l.n.branch, colors);
  const many = pagesOut.length > 1;
  const pages = pagesOut.map((pg, pi) => {
    const { fr } = pg;
    const PW = pg.W, PH = pg.H;
    const uu = Math.min(PW, PH) / 595;
    const scene = [{ t: 'rect', x: 0, y: 0, w: PW, h: PH, fill: th.bg }];
    if (pi === 0) {
      const frame = frameItems(th.frame, PW, PH, th);
      scene.push(...frame.items);
      drawTitles(scene, th, measure, PW, frame.inset, uu, { head, title, sub, line: countText });
      if (legendOn) {
        // the shapes, and the colour of each branch
        const fakeL = { inside: false, nodes: lines.filter(l => (data.virtual ? l.depth === 0 : l.depth === 1)).map(l => ({ id: l.id, depth: 1, dup: !!l.n.dup, branch: l.n.branch })) };
        scene.push(...legendItems(ix, fakeL, th, { women, colors, legendInset: frame.inset + 8 * uu }, measure, PW, PH - frame.inset - legendHeight(uu, { legend: true }) + 6 * uu, uu, root, 'v'));
      }
    } else {
      scene.push({ t: 'path', d: `M${fr.x0} ${40 * uu}H${fr.x1}`, fill: 'none', stroke: th.line, sw: 0.7 * uu });
      const ft = fitText(measure, famTitle, th.fonts.title, 11 * uu, PW / 3);
      scene.push({ t: 'text', x: rtl ? fr.x1 - ft.w / 2 : fr.x0 + ft.w / 2, y: 32 * uu, s: ft.s, font: th.fonts.title, size: ft.size, fill: th.ink3, w: ft.w });
      scene.push({ t: 'path', d: `M${fr.x0} ${PH - 44 * uu}H${fr.x1}`, fill: 'none', stroke: th.line, sw: 0.7 * uu });
    }
    if (many && pi > 0) {
      const pn = ar ? `صفحة ${dig(pi + 1)} من ${dig(pagesOut.length)}` : `Page ${pi + 1} of ${pagesOut.length}`;
      const fs = 8.5 * uu;
      scene.push({ t: 'text', x: PW / 2, y: PH - 28 * uu, s: pn, font: th.fonts.text, size: fs, fill: th.ink3, w: measure(th.fonts.text, pn, fs) });
    }
    for (const c of pg.cols) drawColumn(scene, c);
    return { W: PW, H: PH, scene };
  });

  function drawColumn(scene, c) {
    const lineIn = new Set(c.lines);
    const yTop = c.top + 1, yBottom = c.top + c.rows * Z.lead - 1;
    const lineSw = Math.max(0.6, S * 0.075);
    // the father's line: down from him (or from the top) past his children here (or to the foot)
    const fathers = new Set();
    for (const l of c.lines) if (l.parent) fathers.add(l.parent);
    // fathers above this column whose families go on past it: their line runs through
    const firstI = c.lines.length ? c.lines[0].i : 0, lastI = c.lines.length ? c.lines[c.lines.length - 1].i : -1;
    for (let p = c.lines.length ? c.lines[0].parent : null; p; p = p.parent) {
      const end = p.kids[p.kids.length - 1];
      if (end.i > lastI) fathers.add(p);
    }
    for (const p of fathers) {
      const x = markX(c, p.depth);
      const lastKid = p.kids[p.kids.length - 1];
      const y0 = lineIn.has(p) ? rowY(c, p.row) + Z.mark + 1 : c.ghost === p ? rowY(c, 0) + Z.mark + 1 : yTop;
      const y1 = lastKid.i <= lastI && lastKid.i >= firstI ? rowY(c, lastKid.row) : lastKid.i > lastI ? yBottom : null;
      if (y1 == null || y1 <= y0) continue;
      const faint = p.kids.every(k => k.n.faint);
      scene.push({ t: 'path', d: `M${x.toFixed(2)} ${y0.toFixed(2)}V${y1.toFixed(2)}`, fill: 'none', stroke: colorOf(p.kids[0]), sw: lineSw, cap: 'round', op: faint ? 0.4 : undefined });
    }
    if (c.ghost) drawLine(scene, c, c.ghost, 0, true);
    for (const l of c.lines) {
      if (l.parent) {
        // the short stroke from the father's line to the mark
        const x0 = markX(c, l.parent.depth), x1 = markX(c, l.depth) - dir * Z.mark;
        scene.push({ t: 'path', d: `M${x0.toFixed(2)} ${rowY(c, l.row).toFixed(2)}H${x1.toFixed(2)}`, fill: 'none', stroke: colorOf(l), sw: lineSw, cap: 'round', op: l.n.faint ? 0.4 : undefined });
      }
      drawLine(scene, c, l, l.row, false);
    }
  }

  function drawLine(scene, c, l, row, ghost) {
    const inf = info(l.id);
    const y = rowY(c, row);
    const x = markX(c, l.depth);
    const col = colorOf(l);
    const m = l.depth === 0 && !data.virtual ? Z.mark * 1.3 : Z.mark;
    const items = [];
    const dash = l.n.dup || ghost ? [S * 0.2, S * 0.16] : null;
    const fill = inf.dead || ghost ? th.bg : col;
    if (inf.g === 'f') items.push({ t: 'circle', cx: x, cy: y, r: m, fill, stroke: col, sw: S * 0.1, dash });
    else items.push({ t: 'rect', x: x - m, y: y - m, w: 2 * m, h: 2 * m, r: m * 0.28, fill, stroke: col, sw: S * 0.1, dash });
    const start = x + dir * (m + Z.gapMark);
    const edge = rtl ? c.x0 : c.x1;
    const room = Math.abs(edge - start) - S * 0.3;
    if (ghost) {
      // the father of a family going on from the column before, with his own father and grandfather
      const linOf = k => lineageText(ix.paternalLine(l.id, k).map(id => ix.P[id].n || '؟'), { gender: inf.g, style: 'bin', lang: lang.value });
      let lin = linOf(3);
      if (measure(F.ghost, lin, Z.name * 0.92) * 0.75 > room) lin = linOf(2);
      const gt = fitText(measure, lin, F.ghost, Z.name * 0.92, room, 0.7);
      items.push({ t: 'text', x: start + dir * gt.w / 2, y: y + gt.size * 0.34, s: gt.s, font: F.ghost, size: gt.size, fill: th.ink3, w: gt.w });
      for (const it of items) it.op = 0.75;
      scene.push(...items);
      return;
    }
    // the name first; the years beside it when they fit whole (never cut)
    let yr = l.years ? { s: l.years, size: Z.years, w: l.yearsW } : null;
    if (yr && l.nameW + Z.gapYears + yr.w > room) {
      const k = Math.max(0, (room - l.nameW - Z.gapYears) / yr.w);
      yr = k >= 0.85 ? { s: l.years, size: Z.years * k, w: yr.w * k } : null;
    }
    const nm = fitText(measure, l.name, F.name, l.size, room - (yr ? yr.w + Z.gapYears : 0), 0.8);
    items.push({ t: 'text', x: start + dir * nm.w / 2, y: y + nm.size * 0.34, s: nm.s, font: F.name, size: nm.size, fill: l.n.dup ? th.ink3 : th.ink, w: nm.w });
    if (yr) items.push({ t: 'text', x: start + dir * (nm.w + Z.gapYears + yr.w / 2), y: y + yr.size * 0.34, s: yr.s, font: F.years, size: yr.size, fill: th.ink2, w: yr.w });
    // a daughter's child (under the mother): faded, like a watermark
    if (l.n.faint) for (const it of items) it.op = 0.4;
    scene.push(...items);
  }

  return { W: pages[0].W, H: pages[0].H, scene: pages[0].scene, pages, nameSize: S, warn: false, people, lines: lines.length, theme: th };
}
