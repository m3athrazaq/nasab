// «أطلس الفروع»: a tree too big for one page, on pages of any size with every name readable. The top
// of the tree goes on the first page; a branch that would make a page's names too small goes on a page
// of its own (and its own big branches on pages after it), and where it was, a tag gives its page.
// The same plan lays out the tree pages of the family book.
import { descendantData, layoutDescendants, METRICS } from '../chart/layout.js';
import { drawDescendants, fitText } from '../chart/draw.js';
import { posterTheme, innerTheme } from '../chart/themes.js';
import { makeInfo } from '../chart/info.js';
import { PAPERS, posterPage, drawTitles, legendItems, countLine, defaultTitles } from './poster.js';
import { lang, num, dig, count } from '../core/i18n.js';
import { lineageText, familyTitle } from '../core/names.js';
import { makeD } from '../core/dates.js';

/** the smallest size names may come out on a page (points): small, medium, large */
export const NAME_SIZES = { s: 8, m: 9.5, l: 11.5 };
export const nameSizeOf = size => NAME_SIZES[size] || NAME_SIZES.m;
const TAG_EXT = 52; // room for a page tag after a name on the canopy's branches

/** where a branch goes on: «انظر ص ٥» */
export const pageTag = k => (lang.value === 'ar' ? 'انظر ص ' + dig(k) : 'see p. ' + k);

/** a page of the book or atlas other than the first: rules, the family at the top, a title, the box */
export function innerFrame(W, H) {
  const u = Math.min(W, H) / 595;
  const side = 40 * u, top = 40 * u, bottom = 44 * u;
  return { u, side, top, bottom, box: { x: side, y: top + 64 * u, w: W - 2 * side, h: H - top - 64 * u - bottom - 12 * u } };
}

/**
 * which people start a page, in reading order, and how each page fits its paper.
 * opts: { root, amode: 'r'|'v'|'h', paper, orient, size: 's'|'m'|'l', women, dKids, dates, spouses,
 *         inside, legend, head, sub, theme, first: false (no title page: the book), pageBox(W, H) (the
 *         room for the tree on a page without the title block, if not the atlas's own) }
 * → { root, mode, minName, pages: [{ id, first, from, L, fit: { W, H, box, scale, nameSize } }],
 *     pageOf: Map id → page index, nameSize (the smallest), people }
 */
export function atlasPlan(ix, s, opts = {}) {
  const root = opts.root && ix.P[opts.root] ? opts.root : (s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me));
  if (!root) return null;
  const mode = ['r', 'v', 'h'].includes(opts.amode) ? opts.amode : 'r';
  const rtl = lang.value === 'ar';
  const women = opts.women !== false, dKids = !!opts.dKids, inside = !!opts.inside;
  const spouses = mode === 'v' && !!opts.spouses && women;
  const dates = opts.dates !== false;
  const minName = nameSizeOf(opts.size);
  const th = posterTheme(opts.theme);
  const titled = opts.first !== false;
  const full = descendantData(ix, root, { dKids, women, collapsed: new Set() });
  if (!full) return null;
  const titles = defaultTitles(ix, root);
  const head = opts.head != null ? opts.head : titles.head;
  const sub = opts.sub != null ? opts.sub : titles.sub;
  // (top-down: a little more room between generations, for the page tags under the cards)
  const metrics = mode === 'v' ? { w: 104, ws: 150, level: METRICS[inside ? 'vi' : 'v'].level + 22 + (spouses ? 15 : 0) } : mode === 'h' ? { w: inside ? 160 : 180 } : {};

  // the whole tree, by person (someone drawn twice is found at his full place), and who is above whom
  const nodeOf = new Map(), up = new Map();
  let people = 0;
  const index = (n, parent) => { if (!n.dup) { nodeOf.set(n.id, n); people++; if (parent) up.set(n.id, parent.id); } n.children.forEach(c => index(c, n)); };
  index(full, null);

  const stubs = new Set(); // people whose families go on pages of their own
  const below = n => { let k = 0; for (const c of n.children) k += 1 + below(c); return k; };
  // a page's part of the tree: from its top down, each branch that has its own page cut to a tag
  const cut = (n, top) => {
    const out = { ...n, children: [] };
    delete out.hidden;
    if (!top && !n.dup && stubs.has(n.id) && n.children.length) { out.hidden = below(n); return out; }
    out.children = n.children.map(c => cut(c, false));
    return out;
  };
  const layoutOf = id => {
    const L = layoutDescendants(ix, id, { mode, rtl, dates, spouses, inside, metrics, stack: mode === 'v', tagExt: TAG_EXT, data: cut(nodeOf.get(id), true) });
    // (sideways: a tag stands beside the deepest cards)
    if (mode === 'h' && L.nodes.some(n => n.hidden)) { if (rtl) L.bounds.x0 -= 64; else L.bounds.x1 += 64; }
    return L;
  };
  // the page and the scale for a part of the tree: the first page has the title block and legend
  const paper = PAPERS[opts.paper] ? opts.paper : 'A4';
  const turns = opts.orient === 'portrait' ? ['portrait'] : opts.orient === 'landscape' ? ['landscape'] : ['portrait', 'landscape'];
  const fitOf = (L, first) => {
    const b = L.bounds, cw = b.x1 - b.x0, ch = b.y1 - b.y0;
    const cap = (minName * 1.5) / L.M.nameSize; // small branches no bigger than this
    let best = null;
    for (const orient of turns) {
      let W, H, box;
      if (first && titled) ({ W, H, box } = posterPage(th, cw, ch, { paper, orient, legend: opts.legend }, { head, sub }));
      else {
        [W, H] = PAPERS[paper];
        if (orient === 'landscape') [W, H] = [H, W];
        box = opts.pageBox ? opts.pageBox(W, H) : innerFrame(W, H).box;
      }
      const scale = Math.min(box.w / cw, box.h / ch, cap);
      if (!best || scale > best.scale + 1e-9) best = { W, H, box, scale, nameSize: L.M.nameSize * scale };
    }
    return best;
  };

  // from the bottom up: a family whose page would be too small sends its biggest branches to pages of
  // their own, one at a time, until it reads well (a single family too big for any page stays whole)
  const shown = n => { let k = 1; for (const c of n.children) if (!(stubs.has(c.id) && !c.dup)) k += shown(c); else k++; return k; };
  const order = [];
  const post = n => { for (const c of n.children) post(c); if (!n.dup && n.children.length) order.push(n); };
  post(full);
  for (const n of order) {
    const first = n === full;
    let f = fitOf(layoutOf(n.id), first);
    if (f.nameSize >= minName - 1e-6) continue;
    const kids = n.children.filter(c => !c.dup && c.children.length && !stubs.has(c.id)).sort((a, b) => shown(b) - shown(a));
    for (const c of kids) {
      stubs.add(c.id);
      f = fitOf(layoutOf(n.id), first);
      if (f.nameSize >= minName - 1e-6) break;
    }
  }

  // then fill the pages: a branch comes back onto the page it leaves from while that page still reads
  // well (the smallest first), so few pages are left half empty
  const ownerOf = id => { let x = up.get(id); while (x && x !== root && !stubs.has(x)) x = up.get(x); return x || root; };
  for (let again = true; again;) {
    again = false;
    for (const id of [...stubs].sort((a, b) => shown(nodeOf.get(a)) - shown(nodeOf.get(b)))) {
      const owner = ownerOf(id);
      stubs.delete(id);
      if (fitOf(layoutOf(owner), owner === root).nameSize >= minName - 1e-6) again = true;
      else stubs.add(id);
    }
  }

  // brothers whose families each have a page share one, side by side, while it reads well
  const groupLayout = ids => layoutDescendants(ix, null, {
    mode, rtl, dates, spouses, inside, metrics, stack: mode === 'v', tagExt: TAG_EXT,
    data: { id: '', virtual: true, depth: nodeOf.get(ids[0]).depth - 1, branch: -1, union: '', children: ids.map(id => cut(nodeOf.get(id), true)) }
  });
  const groupOf = new Map(); // first of a group → the group
  const inGroup = new Map(); // anyone in a group → its first
  for (const n of nodeOf.values()) {
    const kids = n.children.filter(c => !c.dup && stubs.has(c.id)).map(c => c.id);
    let g = [];
    const close = () => { if (g.length) { groupOf.set(g[0], g); for (const id of g) inGroup.set(id, g[0]); } g = []; };
    for (const id of kids) {
      if (g.length && fitOf(groupLayout([...g, id]), false).nameSize >= minName - 1e-6) g.push(id);
      else { close(); g = [id]; }
    }
    close();
  }

  // the pages in reading order: each branch's page right after the page it leaves from
  const pages = [];
  const pageOf = new Map();
  const visit = (n, owner) => {
    let here = owner;
    if (!n.dup && n === full) { here = 0; pageOf.set(n.id, 0); pages.push({ id: n.id, ids: [n.id], first: true, from: -1 }); }
    else if (!n.dup && stubs.has(n.id)) {
      const lead = inGroup.get(n.id) || n.id;
      if (!pageOf.has(lead)) {
        const ids = groupOf.get(lead) || [lead];
        for (const id of ids) pageOf.set(id, pages.length);
        pages.push({ id: lead, ids, first: false, from: owner, father: up.get(lead) });
      }
      here = pageOf.get(n.id);
    }
    if (n.dup) return;
    n.children.forEach(c => visit(c, here));
  };
  visit(full, -1);
  let smallest = Infinity;
  for (const pg of pages) {
    pg.L = pg.ids.length > 1 ? groupLayout(pg.ids) : layoutOf(pg.id);
    pg.fit = fitOf(pg.L, pg.first);
    pg.people = pg.L.nodes.filter(n => !n.dup).length;
    smallest = Math.min(smallest, pg.fit.nameSize);
  }
  return { root, mode, minName, paper, head, sub, title: titles.title, pages, pageOf, nameSize: smallest, people, generations: Math.max(...[...nodeOf.values()].map(n => n.depth)) + 1 };
}

/**
 * the atlas as pages (scenes): the first with the title block, the legend and the top of the tree,
 * then a page for each branch that goes on, with where it comes from.
 * opts: as atlasPlan, and { title, by, photos, colors, hideLiving }; env: { measure, photoIds, today }
 * → { W, H, scene, pages: [{ W, H, scene }], nameSize, warn, people, plan }
 */
export function buildAtlas(ix, s, opts, env) {
  const plan = atlasPlan(ix, s, opts);
  if (!plan) return null;
  const ar = lang.value === 'ar', rtl = ar;
  const measure = env.measure;
  const th = innerTheme(posterTheme(opts.theme));
  const info = makeInfo(ix, s, { hideLiving: opts.hideLiving, photoIds: env.photoIds });
  const women = opts.women !== false;
  const tags = new Map();
  for (const [id, k] of plan.pageOf) tags.set(id, pageTag(k + 1));
  const o = {
    info, measure, photos: opts.photos !== false, dates: opts.dates !== false, spouses: plan.mode === 'v' && !!opts.spouses && women, colors: opts.colors !== false,
    bands: false, num: n => num(n), tags,
    motherLabel: u => { const w = ix.U[u] && ix.U[u].w; return w && ix.P[w] ? (rtl ? 'من ' : 'by ') + ix.P[w].n : ''; }
  };
  const fam = ix.familyOf(plan.root);
  const famTitle = fam ? familyTitle(fam) : ix.P[plan.root].n;
  const now = env.today || new Date();
  const today = makeD({ cal: 'g', y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
  const many = plan.pages.length > 1;
  const pages = plan.pages.map((pg, k) => {
    const { W, H, box, scale } = pg.fit;
    const L = pg.L;
    const scene = [{ t: 'rect', x: 0, y: 0, w: W, h: H, fill: th.bg }];
    const u = Math.min(W, H) / 595;
    if (pg.first && opts.first !== false) {
      const P = posterPage(th, L.bounds.x1 - L.bounds.x0, L.bounds.y1 - L.bounds.y0, { paper: plan.paper, orient: W > H ? 'landscape' : 'portrait', legend: opts.legend }, { head: plan.head, sub: plan.sub });
      scene.push(...P.fr.items);
      const line = countLine(plan.people, plan.generations, today, opts.by);
      drawTitles(scene, th, measure, W, P.inset, u, { head: plan.head, title: opts.title || plan.title, sub: plan.sub, line });
      if (opts.legend !== false) scene.push(...legendItems(ix, L, th, { ...opts, legendInset: P.inset + 8 * u }, measure, W, H - P.inset - P.lH + 6 * u, u, plan.root, plan.mode));
    } else {
      // rules, the family at the top, the branch and where it comes from
      const F = innerFrame(W, H);
      scene.push({ t: 'path', d: `M${F.side} ${F.top}H${W - F.side}`, fill: 'none', stroke: th.line, sw: 0.7 * u });
      scene.push({ t: 'path', d: `M${F.side} ${H - F.bottom}H${W - F.side}`, fill: 'none', stroke: th.line, sw: 0.7 * u });
      const ft = fitText(measure, famTitle, th.fonts.title, 11 * u, W / 3);
      scene.push({ t: 'text', x: rtl ? W - F.side - ft.w / 2 : F.side + ft.w / 2, y: F.top - 8 * u, s: ft.s, font: th.fonts.title, size: ft.size, fill: th.ink3, w: ft.w });
      const lineOf = (id, n) => lineageText(ix.paternalLine(id, n).map(x => ix.P[x].n || '؟'), { gender: ix.P[id].g, style: 'bin', lang: lang.value });
      // one branch: "فرع علي بن محمد بن عبدالكريم"; brothers' branches: "فروع أبناء محمد بن عبدالكريم"
      const title = pg.ids.length > 1 && pg.father
        ? (ar ? 'فروع أبناء ' + lineOf(pg.father, 3) : 'The branches of ' + lineOf(pg.father, 3) + "'s sons")
        : (ar ? 'فرع ' + lineOf(pg.id, 3) : lineOf(pg.id, 3) + "'s branch");
      const tt = fitText(measure, title, th.fonts.title, 21 * u, W - 2 * F.side, 0.6);
      scene.push({ t: 'text', x: W / 2, y: F.top + 32 * u, s: tt.s, font: th.fonts.title, size: tt.size, fill: th.ink, w: tt.w });
      const subl = (pg.from >= 0 ? (ar ? `تكملةً للصفحة ${dig(pg.from + 1)}` : `Continued from page ${pg.from + 1}`) + (ar ? ' — ' : ' — ') : '') + count(pg.people, 'person');
      const st = fitText(measure, subl, th.fonts.text, 10 * u, W - 2 * F.side);
      scene.push({ t: 'text', x: W / 2, y: F.top + 52 * u, s: st.s, font: th.fonts.text, size: st.size, fill: th.ink3, w: st.w });
    }
    const chart = drawDescendants(L, th, { ...o, trunkLabel: pg.ids.length > 1 && pg.father ? ix.P[pg.father].n : '' });
    const b = L.bounds, cw = b.x1 - b.x0, ch = b.y1 - b.y0;
    const tx = box.x + (box.w - cw * scale) / 2 - b.x0 * scale;
    const ty = box.y + (box.h - ch * scale) / 2 - b.y0 * scale;
    scene.push({ t: 'g', tf: [scale, tx, ty], items: chart.items });
    if (many && !(pg.first && opts.first !== false)) {
      // (the title page needs no number)
      const pn = ar ? `صفحة ${dig(k + 1)} من ${dig(plan.pages.length)}` : `Page ${k + 1} of ${plan.pages.length}`;
      const fs = 8.5 * u;
      scene.push({ t: 'text', x: W / 2, y: H - innerFrame(W, H).bottom + 16 * u, s: pn, font: th.fonts.text, size: fs, fill: th.ink3, w: measure(th.fonts.text, pn, fs) });
    }
    return { W, H, scene };
  });
  return { W: pages[0].W, H: pages[0].H, scene: pages[0].scene, pages, nameSize: plan.nameSize, warn: plan.nameSize < 5.5, people: plan.people, plan, theme: th };
}
