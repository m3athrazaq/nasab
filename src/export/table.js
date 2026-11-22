// The family as a table of generations, the way family trees are often kept in a spreadsheet: a column
// for each generation in its own colour, each person a cell, his children in the next column starting
// on his row, and a line beside each family running down its list. Printed on pages (the row of
// generations repeated on each, the forefathers of the first row shown faintly), or as one long page.
import { descendantData } from '../chart/layout.js';
import { fitText } from '../chart/draw.js';
import { mix } from '../chart/themes.js';
import { num, lang } from '../core/i18n.js';
import { makeD } from '../core/dates.js';
import { defaultTitles, genName, countLine, PAPERS } from './poster.js';

/** the generations' colours: black through greys, then warm and fresh colours (then again) */
export const GEN_COLORS = ['#000000', '#404040', '#7F7F7F', '#BEC0BF', '#FFC072', '#9CE159', '#FFE061', '#64B2DF', '#C3A6E8', '#F4A3C0', '#7FD3C6', '#E5B98F'];
export const genColor = g => GEN_COLORS[(Math.max(1, g) - 1) % GEN_COLORS.length];
const light = hex => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255) >= 150; };
const inkOn = hex => (light(hex) ? '#151515' : '#FFFFFF');

/** the fonts of the table (names, the row of generations, small text); others fall back to 'ui' */
export const TABLE_FONTS = ['naskhB', 'naskh', 'amiri', 'ui', 'uiB'];
const F = { name: 'naskhB', head: 'amiri', title: 'naskhB', text: 'naskh' };
// sizes at scale 1 (points)
const N = { row: 17, name: 9.2, head: 8.8, gapHead: 9, pad: 7, minCol: 74, maxCol: 150, line: 1.1 };
const MAX_SIDE = 14400; // a PDF page's limit
const LINE = '#333333';

/** "الجيل الثالث" / "3rd Gen" */
export function genHeader(n) {
  if (lang.value === 'ar') return genName(n);
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return n + s + ' Gen';
}

/**
 * rows and columns. Each person is a cell: the column is his generation, his first child sits on his
 * row in the next column, brothers and sisters follow one under the other. A family that takes more
 * than one row is followed by a blank row. Those with no one below them may tuck in right under a
 * brother whose own family starts further down, when the cell beside them is free (as such tables are
 * usually written), so a sister is not pushed pages away from her father.
 * tops: the first column (the top of the tree, or a generation's people). Sets on each node: col, row,
 * ext (last row of everything below him), end (last row of his line beside his children), up (parent).
 */
export function tableLayout(tops) {
  const occ = new Map();
  const used = (c, r) => { const s = occ.get(c); return !!s && s.has(r); };
  const take = (c, r) => { let s = occ.get(c); if (!s) occ.set(c, (s = new Set())); s.add(r); };
  const cells = [];
  // one child after another all the way down: the whole line sits on one row (its length in columns, 0 if not)
  const chain = new Map();
  const chainLen = n => {
    if (chain.has(n)) return chain.get(n);
    const v = !n.children.length ? 1 : n.children.length === 1 && chainLen(n.children[0]) ? 1 + chainLen(n.children[0]) : 0;
    chain.set(n, v);
    return v;
  };
  const oneRow = n => chainLen(n) > 0;
  let maxCol = 0;
  // a one-row line fits on row r: its cells and the cell after its end are free (and for a line of more
  // than one person, the whole row beyond it, so it is not read as going on into someone else's family)
  const fits = (n, c, r) => {
    const len = chainLen(n);
    const last = len > 1 ? Math.max(maxCol, c + len) : c + len;
    for (let d = c; d <= last; d++) if (used(d, r)) return false;
    return true;
  };
  function place(n, c, r, up) {
    n.col = c; n.row = r; n.up = up; n.ext = r; n.end = r;
    take(c, r); cells.push(n); maxCol = Math.max(maxCol, c);
    if (n.children.length) kids(n, c + 1, r);
  }
  function kids(P, c, r0) {
    const list = P.children;
    let prev = null, ext = r0, i = 0;
    while (i < list.length) {
      const m = list[i];
      let row;
      if (!prev) row = r0;
      else if (oneRow(m) && oneRow(prev) && fits(m, c, prev.row + 1)) row = prev.row + 1;
      else if (!m.children.length && !oneRow(prev)) {
        // those with no one below them, right under a brother whose family starts lower down
        let j = i;
        while (j < list.length && !list[j].children.length) j++;
        let ok = true;
        for (let k = 1; k <= j - i && ok; k++) ok = !used(c, prev.row + k) && !used(c + 1, prev.row + k);
        if (ok) {
          for (let k = i; k < j; k++) { place(list[k], c, prev.row + 1 + (k - i), P); ext = Math.max(ext, list[k].ext); }
          prev = list[j - 1]; i = j;
          continue;
        }
        row = ext + 2;
      } else row = ext + 2;
      place(m, c, row, P);
      ext = Math.max(ext, m.ext);
      prev = m; i++;
    }
    for (const m of list) ext = Math.max(ext, m.ext);
    P.ext = Math.max(P.row == null ? r0 : P.row, ext);
    P.end = list.length ? list[list.length - 1].ext : P.row;
  }
  const top = { children: tops, row: 0 };
  kids(top, 0, 0);
  for (const n of cells) if (n.up === top) n.up = null;
  return { cells, rows: (cells.length ? Math.max(...cells.map(n => n.ext)) : 0) + 1, cols: (cells.length ? Math.max(...cells.map(n => n.col)) : 0) + 1, used };
}

/**
 * opts: { root, fromGen, women, dKids, colors, paper: 'A4'…'A0'|'auto', orient, gdir: 'ltr'|'rtl' (where the
 *         first generation stands), head, title, sub, by (prepared by), single (one page however long) }
 * env:  { measure(font, text, size), today }
 * → { W, H, scene, pages: [{ W, H, scene }], scale, nameSize, warn, people }
 */
export function buildTable(ix, s, opts, env) {
  const root = opts.root && ix.P[opts.root] ? opts.root : (s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me));
  if (!root) return null;
  const ar = lang.value === 'ar';
  const measure = env.measure;
  const women = opts.women !== false;
  const fromGen = Math.max(1, opts.fromGen || 1);
  const data = descendantData(ix, root, { dKids: !!opts.dKids, women, fromGen, collapsed: new Set() });
  if (!data) return null;
  const tops = data.virtual ? data.children : [data];
  if (!tops.length) return null;
  const genBase = data.virtual ? data.depth + 2 : 1; // the generation of the first column
  const T = tableLayout(tops);
  const colors = opts.colors !== false;
  const ltr = (opts.gdir || 'ltr') !== 'rtl';

  /* what each cell says: the first name (the founder with his family name) */
  const label = n => {
    const p = ix.P[n.id];
    let s1 = p.n || '؟';
    if (!data.virtual && n === data) { const fam = ix.familyOf(n.id); if (fam && !s1.includes(fam)) s1 += ' ' + fam; }
    return s1;
  };
  for (const n of T.cells) n.label = label(n);
  const nCols = T.cols;
  let colW = N.minCol;
  for (const n of T.cells) colW = Math.max(colW, measure(F.name, n.label, N.name) + 2 * N.pad);
  for (let c = 0; c < nCols; c++) colW = Math.max(colW, measure(F.head, genHeader(genBase + c), N.head) + 2 * N.pad);
  colW = Math.min(N.maxCol, Math.ceil(colW));
  const tableW = nCols * colW;

  /* titles and the line above the table */
  const titles = defaultTitles(ix, root, fromGen);
  const head = opts.head != null ? opts.head : titles.head;
  const title = opts.title || titles.title;
  const sub = opts.sub != null ? opts.sub : titles.sub;
  const by = String(opts.by || '').trim();
  const people = T.cells.filter(n => !n.dup).length;
  const now = env.today || new Date();
  const info = countLine(people, nCols, makeD({ cal: 'g', y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }));
  const prep = by ? (ar ? 'إعداد: ' : 'Prepared by ') + by : '';
  const TS = { head: 11, title: 21, sub: 10.5, info: 8.6, prep: 9.6 };
  // stacked when "prepared by" and the count do not fit side by side above the table
  const stack = prep && measure(F.title, prep, TS.prep) + measure(F.text, info, TS.info) + 24 > tableW;
  const titleH = (head ? TS.head * 1.75 : 0) + TS.title * 1.45 + (sub ? TS.sub * 1.75 : 0) + 12 + (stack ? 2 : 1) * TS.info * 1.9;
  const headBlock = N.row + N.gapHead; // the row of generations and the space under it

  /* the page(s) */
  let W, H, k, m;
  const auto = !PAPERS[opts.paper];
  const titleMinW = Math.max(measure(F.title, title, TS.title), head ? measure(F.text, head, TS.head) : 0, sub ? measure(F.text, sub, TS.sub) * 0.8 : 0);
  if (auto) {
    k = 1; m = 30;
    W = Math.ceil(Math.max(tableW, Math.min(titleMinW, 900)) + 2 * m);
    W = Math.max(W, 420);
    const full = m + titleH + headBlock + T.rows * N.row + m;
    H = Math.ceil(opts.single ? full : Math.min(full, MAX_SIDE));
  } else {
    const [pw, ph] = PAPERS[opts.paper];
    m = Math.round(Math.min(pw, ph) * 0.05);
    const kFor = w => Math.min(1.3, (w - 2 * m) / tableW);
    const land = opts.orient === 'landscape' || (opts.orient !== 'portrait' && kFor(pw) < 0.85 && kFor(ph) > kFor(pw));
    [W, H] = land ? [ph, pw] : [pw, ph];
    k = kFor(W);
  }
  const rowH = N.row * k;
  const x0 = (W - tableW * k) / 2; // the table's left edge
  const colX = c => x0 + (ltr ? c : nCols - 1 - c) * colW * k;
  const lineX = c => (ltr ? colX(c) + colW * k : colX(c)); // between column c and the next
  const footer = 16;
  const top1 = m + titleH * k, topN = m;
  const fitRows = (top, foot) => Math.max(2, Math.floor((H - m - foot - top - headBlock * k) / rowH + 1e-6));

  /* rows per page (the page number takes a line when there is more than one); never start on a blank row */
  const busy = new Set(T.cells.map(n => n.row));
  const pagesRows = [];
  if (fitRows(top1, 0) >= T.rows) pagesRows.push([0, T.rows]);
  else {
    let a = 0;
    while (a < T.rows) {
      while (a < T.rows && !busy.has(a)) a++;
      if (a >= T.rows) break;
      const n = fitRows(pagesRows.length ? topN : top1, footer);
      pagesRows.push([a, Math.min(T.rows, a + n)]);
      a += n;
    }
  }
  const many = pagesRows.length > 1;
  const byRow = new Map();
  for (const n of T.cells) { if (!byRow.has(n.row)) byRow.set(n.row, []); byRow.get(n.row).push(n); }

  const nameSize = N.name * k;
  const cellItems = (n, y, ghost) => {
    const g = genBase + n.col;
    const x = colX(n.col), w = colW * k;
    const base = colors ? genColor(g) : '#FFFFFF';
    const fill = ghost || n.dup ? mix(colors ? base : '#E6E6E6', '#FFFFFF', colors ? 0.32 : 0.6) : base;
    const ink = ghost || n.dup ? '#5A5A5A' : colors ? inkOn(base) : '#151515';
    const out = [{ t: 'rect', x, y, w, h: rowH, fill, stroke: colors ? 'none' : '#A8A8A8', sw: colors ? 0 : 0.5 * k }];
    const nm = fitText(measure, n.label, F.name, nameSize, w - 2 * N.pad * k * 0.6);
    out.push({ t: 'text', x: x + w / 2, y: y + rowH * 0.5 + nm.size * 0.36, s: nm.s, font: F.name, size: nm.size, fill: ink, w: nm.w });
    // a daughter's child (under the mother): faded, like a watermark
    if (n.faint) for (const it of out) it.op = 0.4;
    return out;
  };

  const pages = pagesRows.map(([a0, a1], pi) => {
    const scene = [{ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#FFFFFF' }];
    let y = m;
    if (pi === 0) {
      // the title block, centred over the page
      const cx = W / 2, maxW = W - 2 * m;
      if (head) {
        y += TS.head * k * 1.2;
        const h1 = fitText(measure, head, F.text, TS.head * k, maxW);
        scene.push({ t: 'text', x: cx, y, s: h1.s, font: F.text, size: h1.size, fill: '#555555', w: h1.w });
        y += TS.head * k * 0.55;
      }
      y += TS.title * k * 1.2;
      const tt = fitText(measure, title, F.title, TS.title * k, maxW, 0.5);
      scene.push({ t: 'text', x: cx, y, s: tt.s, font: F.title, size: tt.size, fill: '#111111', w: tt.w });
      y += TS.title * k * 0.25;
      if (sub) {
        y += TS.sub * k * 1.45;
        const st = fitText(measure, sub, F.text, TS.sub * k, maxW * 0.95, 0.6);
        scene.push({ t: 'text', x: cx, y, s: st.s, font: F.text, size: st.size, fill: '#555555', w: st.w });
        y += TS.sub * k * 0.3;
      }
      // "prepared by" at the first generation's side, the count at the other, just above the table
      const lineY = top1 - TS.info * k * 0.75;
      const left = x0, right = x0 + tableW * k;
      const startX = ltr ? left : right, endX = ltr ? right : left;
      const place = (text, font, size, x, alignStart, yy, fill) => {
        const f2 = fitText(measure, text, font, size, tableW * k);
        const half = f2.w / 2;
        // alignStart: text begins at x on the side of the first generation
        const cxx = alignStart ? (ltr ? x + half : x - half) : (ltr ? x - half : x + half);
        scene.push({ t: 'text', x: cxx, y: yy, s: f2.s, font, size: f2.size, fill, w: f2.w });
      };
      if (prep) place(prep, F.title, TS.prep * k, startX, true, stack ? lineY - TS.info * k * 1.9 : lineY, '#111111');
      place(info, F.text, TS.info * k, stack ? startX : endX, !!stack, lineY, '#6A6A6A');
      y = top1;
    } else y = topN;

    // the row of generations
    for (let c = 0; c < nCols; c++) {
      const g = genBase + c, x = colX(c), w = colW * k;
      const fill = colors ? genColor(g) : '#EDEDED';
      scene.push({ t: 'rect', x, y, w, h: rowH, fill, stroke: colors ? 'none' : '#A8A8A8', sw: colors ? 0 : 0.5 * k });
      const lb = fitText(measure, genHeader(g), F.head, N.head * k, w - 2 * N.pad * k * 0.6);
      scene.push({ t: 'text', x: x + w / 2, y: y + rowH * 0.5 + lb.size * 0.33, s: lb.s, font: F.head, size: lb.size, fill: colors ? inkOn(fill) : '#151515', w: lb.w });
    }
    const body = y + headBlock * k;
    const rowY = r => body + (r - a0) * rowH;

    // the people of these rows
    for (let r = a0; r < a1; r++) for (const n of byRow.get(r) || []) scene.push(...cellItems(n, rowY(r), false));
    // a later page starts with the forefathers of its first row, faintly
    if (pi > 0) {
      const first = (byRow.get(a0) || []).slice().sort((p, q) => p.col - q.col)[0];
      for (let up = first && first.up; up; up = up.up) if (up.row < a0 && !T.used(up.col, a0)) scene.push(...cellItems(up, rowY(a0), true));
    }
    // the line beside each family, from the father's row to the last of his children (and theirs)
    for (const n of T.cells) {
      if (!n.children.length || n.end < a0 || n.row >= a1) continue;
      const r0 = Math.max(n.row, a0), r1 = Math.min(n.end, a1 - 1);
      const x = lineX(n.col);
      scene.push({ t: 'path', d: `M${x.toFixed(2)} ${rowY(r0).toFixed(2)}V${(rowY(r1) + rowH).toFixed(2)}`, fill: 'none', stroke: LINE, sw: N.line * k, cap: 'butt' });
    }
    if (many) {
      const pn = ar ? `صفحة ${num(pi + 1)} من ${num(pagesRows.length)}` : `Page ${pi + 1} of ${pagesRows.length}`;
      const fs = 8;
      scene.push({ t: 'text', x: W / 2, y: H - m * 0.55, s: pn, font: F.text, size: fs, fill: '#8A8A8A', w: measure(F.text, pn, fs) });
    }
    return { W, H, scene };
  });
  return { W, H, scene: pages[0].scene, pages, scale: k, nameSize, warn: nameSize < 5.5, people, rows: T.rows, cols: nCols };
}
