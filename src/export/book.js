// «كتاب العائلة»: a printable book (A4) — cover, introduction, the tree and each branch on its own
// page, a page of life details for everyone, and an index of names with page numbers.
import { posterTheme, branchColor, mix, hexToRgb, SCREEN } from '../chart/themes.js';
import { frameItems, dividerItems, star8 } from '../chart/ornaments.js';
import { layoutDescendants } from '../chart/layout.js';
import { drawDescendants, fitText } from '../chart/draw.js';
import { makeInfo } from '../chart/info.js';
import { pageWriter } from './typeset.js';
import { defaultTitles, PAPERS } from './poster.js';
import { t, count, num, fmtDateParts, lang, fmtAge, ageOf, dig, byName } from '../core/i18n.js';
import { lineageText, mercy } from '../core/names.js';
import { generations } from '../core/model.js';
import { makeD } from '../core/dates.js';

const lum = hex => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** inner pages are always light (a whole book on dark paper would drink ink); the cover keeps the look */
export function innerTheme(th) {
  if (lum(th.bg) > 0.5) return th;
  return {
    ...th, bg: '#FAF7F0', paper: '#FAF7F0', ink: '#1F1A16', ink2: '#5B5148', ink3: '#8E847A', line: mix(th.gold, '#8E847A', 0.45),
    pill: '#F2EDE2', pillInk: '#5B5148', deadFill: '#FAF7F0', band: 'rgba(31,26,22,0.04)', bandText: '#8E847A',
    branch: SCREEN.light.branch, neutral: '#4E5A52', accent: mix(th.gold, '#1F1A16', 0.7), thread: '#A3271F', gold: mix(th.gold, '#1F1A16', 0.75)
  };
}

/**
 * opts: { theme, root, dKids, photos }; env: { measure, photoIds, today }
 * → { pages: [{ W, H, scene }], title }
 */
export function buildBook(ix, s, opts, env) {
  const root = opts.root && ix.P[opts.root] ? opts.root : (s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me));
  if (!root) return null;
  const cover = posterTheme(opts.theme);
  const th = innerTheme(cover);
  const measure = env.measure;
  const rtl = lang.value === 'ar', ar = rtl;
  const [W, H] = PAPERS.A4;
  const info = makeInfo(ix, s, { photoIds: opts.photos === false ? new Set() : env.photoIds });
  const titles = defaultTitles(ix, root);
  const famTitle = titles.title;
  const pages = [];
  const newPageScene = (w = W, h = H, theme = th) => {
    const scene = [{ t: 'rect', x: 0, y: 0, w, h, fill: theme.bg }];
    pages.push({ W: w, H: h, scene });
    return scene;
  };
  const today = env.today || new Date();
  const todayD = makeD({ cal: 'g', y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() });

  /* ---------- cover ---------- */
  {
    const sc = newPageScene(W, H, cover);
    const fr = frameItems(cover.frame, W, H, cover);
    sc.push(...fr.items);
    const cx = W / 2;
    const T = cover.fonts.title;
    let y = H * 0.2;
    const head = ar ? 'كتاب عائلة' : 'The family book of';
    const h1 = fitText(measure, head, T, 26, W - 2 * fr.inset);
    sc.push({ t: 'text', x: cx, y, s: h1.s, font: T, size: h1.size, fill: cover.ink2, w: h1.w });
    y += 72;
    const tt = fitText(measure, famTitle, T, 62, W - 2 * fr.inset, 0.45);
    sc.push({ t: 'text', x: cx, y, s: tt.s, font: T, size: tt.size, fill: cover.accent === cover.gold ? cover.gold : cover.ink, w: tt.w });
    y += 26;
    sc.push(...dividerItems(cover.frame, cx, y, 220, cover, 1.1));
    y += 34;
    const st = fitText(measure, titles.sub, cover.fonts.sub || cover.fonts.text, 15, W - 2 * fr.inset - 20, 0.6);
    sc.push({ t: 'text', x: cx, y, s: st.s, font: cover.fonts.sub || cover.fonts.text, size: st.size, fill: cover.ink2, w: st.w });
    // the founder's seal in the middle of the page
    const R = 48, sy = H * 0.56;
    const inf = info(root);
    const col = cover.accent;
    sc.push({ t: 'path', d: star8(cx, sy, R + 26), fill: 'none', stroke: cover.gold, sw: 1.2 });
    sc.push({ t: 'circle', cx, cy: sy, r: R + 8, fill: 'none', stroke: cover.gold, sw: 0.8 });
    if (inf.photo) {
      sc.push({ t: 'circle', cx, cy: sy, r: R, fill: mix(col, cover.paper, 0.2), stroke: col, sw: 2 });
      sc.push({ t: 'image', photo: inf.photo, x: cx - R + 2, y: sy - R + 2, w: 2 * R - 4, h: 2 * R - 4, clip: { shape: 'circle' } });
    } else {
      sc.push({ t: 'circle', cx, cy: sy, r: R, fill: mix(col, cover.paper, 0.2), stroke: col, sw: 2 });
      sc.push({ t: 'text', x: cx, y: sy + 17, s: inf.initial, font: cover.fonts.initial, size: 50, fill: col, w: measure(cover.fonts.initial, inf.initial, 50) });
    }
    y = sy + R + 46;
    const fn = fitText(measure, inf.name, cover.fonts.name, 24, 300);
    sc.push({ t: 'text', x: cx, y, s: fn.s, font: cover.fonts.name, size: fn.size, fill: cover.ink, w: fn.w });
    if (inf.years) { y += 20; sc.push({ t: 'text', x: cx, y, s: inf.years, font: cover.fonts.text, size: 11, fill: cover.ink2, w: measure(cover.fonts.text, inf.years, 11) }); }
    const gens = generations(ix, root, { daughtersKids: !!opts.dKids });
    const maxG = Math.max(1, ...gens.values());
    const line = ar ? `${count(gens.size, 'person')} في ${count(maxG, 'generation')}` : `${count(gens.size, 'person')} in ${count(maxG, 'generation')}`;
    sc.push({ t: 'text', x: cx, y: H * 0.8, s: line, font: cover.fonts.text, size: 12, fill: cover.ink2, w: measure(cover.fonts.text, line, 12) });
    const dl = fmtDateParts(todayD);
    const dateLine = (ar ? 'حُرّر في ' : 'Made on ') + dl.main + (dl.alt ? (ar ? ' الموافق ' : ' — ') + dl.alt : '');
    const dt = fitText(measure, dateLine, cover.fonts.text, 10, W - 2 * fr.inset);
    sc.push({ t: 'text', x: cx, y: H * 0.8 + 20, s: dt.s, font: cover.fonts.text, size: dt.size, fill: cover.ink3, w: dt.w });
  }

  /* ---------- inner page furniture ---------- */
  const M = { top: 66, bottom: 66, side: 56 };
  const furnish = (scene, w, h) => {
    // a thin double rule, the family's name at the top, the page number at the bottom
    scene.push({ t: 'path', d: `M${M.side} 44H${w - M.side}`, fill: 'none', stroke: th.line, sw: 0.7 });
    scene.push({ t: 'path', d: `M${M.side} ${h - 44}H${w - M.side}`, fill: 'none', stroke: th.line, sw: 0.7 });
    const ft = fitText(measure, famTitle, th.fonts.title, 11, 200);
    scene.push({ t: 'text', x: rtl ? w - M.side - ft.w / 2 : M.side + ft.w / 2, y: 36, s: ft.s, font: th.fonts.title, size: ft.size, fill: th.ink3, w: ft.w });
  };
  const numberPages = () => {
    pages.forEach((pg, i) => {
      if (i === 0) return;
      const n = dig(i + 1);
      const cx = pg.W / 2, y = pg.H - 44;
      pg.scene.push({ t: 'circle', cx, cy: y, r: 11, fill: th.bg, stroke: th.line, sw: 0.7 });
      pg.scene.push({ t: 'text', x: cx, y: y + 3.6, s: n, font: th.fonts.text, size: 9.5, fill: th.ink2, w: measure(th.fonts.text, n, 9.5) });
    });
  };
  const innerPage = (w = W, h = H) => { const sc = newPageScene(w, h, th); furnish(sc, w, h); return sc; };
  const writer = () => pageWriter({ W, H, top: M.top + 8, bottom: M.bottom + 10, left: M.side, right: M.side, rtl, measure, newPage: () => innerPage() });
  const heading = (wr, text) => {
    wr.need(80);
    wr.space(6);
    wr.text(text, th.fonts.title, 24, th.ink, { align: 'center', gap: 0.5 });
    wr.items.push(...dividerItems(th.frame, W / 2, wr.y + 4, 150, th, 0.8));
    wr.space(26);
  };

  /* ---------- introduction ---------- */
  const contents = [];
  {
    const wr = writer();
    heading(wr, ar ? 'تمهيد' : 'Introduction');
    const p = ix.P[root];
    const line = ix.paternalLine(root).map(x => ix.P[x].n || '؟');
    if (line.length > 1) {
      wr.para((ar ? 'هو ' : '') + lineageText(line, { gender: p.g, style: 'bin', family: ix.familyOf(root), lang: lang.value }) + '.', th.fonts.name, 15, th.ink, { align: 'center', lead: 1.9 });
      wr.space(8);
    }
    if (p.note) { wr.para(p.note, th.fonts.sub || th.fonts.text, 12.5, th.ink, { lead: 1.95 }); wr.space(10); }
    const gens = generations(ix, root, { daughtersKids: !!opts.dKids });
    const all = [...gens.keys()];
    const living = all.filter(id => ix.living(id)).length;
    const intro = ar
      ? `يضم هذا الكتاب ذرية ${p.n} كما سُجّلت في تطبيق نَسَب: ${count(all.length, 'person')} في ${count(Math.max(1, ...gens.values()), 'generation')}، الأحياء منهم ${num(living)}. تجد فيه الشجرة كاملة، ثم كل فرع من فروعها في صفحته، ثم سِيَر الأفراد وتواريخهم بالتقويمين، وفي آخره فهرس الأسماء.`
      : `This book holds the descendants of ${p.n} as recorded in Nasab: ${count(all.length, 'person')} in ${count(Math.max(1, ...gens.values()), 'generation')}, ${num(living)} of them living. It has the whole tree, each branch on its own page, everyone's life details, and an index of names.`;
    wr.para(intro, th.fonts.text, 11.5, th.ink2, { lead: 1.95 });
    wr.space(16);
    contents.push({ wr, y: wr.y, items: wr.items });
  }

  /* ---------- the tree and its branches ---------- */
  const treeStart = pages.length;
  const branchPages = [];
  const placeTree = (L, title, sub) => {
    const b = L.bounds, cw = b.x1 - b.x0, ch = b.y1 - b.y0;
    const land = cw / ch > 1.05;
    const [pw, ph] = land ? [H, W] : [W, H];
    const box = { x: M.side, y: M.top + 58, w: pw - 2 * M.side, h: ph - M.top - 58 - M.bottom - 6 };
    const scale = Math.min(box.w / cw, box.h / ch, 1.3);
    return { pw, ph, scale, box, nameSize: L.M.nameSize * scale, place: () => {
      const sc = innerPage(pw, ph);
      const tt = fitText(measure, title, th.fonts.title, 22, pw - 2 * M.side);
      sc.push({ t: 'text', x: pw / 2, y: M.top + 18, s: tt.s, font: th.fonts.title, size: tt.size, fill: th.ink, w: tt.w });
      if (sub) { const st = fitText(measure, sub, th.fonts.text, 10, pw - 2 * M.side); sc.push({ t: 'text', x: pw / 2, y: M.top + 38, s: st.s, font: th.fonts.text, size: st.size, fill: th.ink3, w: st.w }); }
      const o = { info, measure, photos: opts.photos !== false, dates: true, spouses: false, colors: true, bands: false, num: n => num(n) };
      const chart = drawDescendants(L, th, o);
      const tx = box.x + (box.w - cw * scale) / 2 - b.x0 * scale, ty = box.y + (box.h - ch * scale) / 2 - b.y0 * scale;
      sc.push({ t: 'g', tf: [scale, tx, ty], items: chart.items });
      return pages.length - 1;
    } };
  };
  const lay = (id, maxGen = 0) => layoutDescendants(ix, id, { mode: 'v', dKids: !!opts.dKids, dates: true, rtl, metrics: { w: 104 }, maxGen });
  const MIN_NAME = 6.2;
  // the whole tree on one page when it is readable, else its top
  {
    const L = lay(root);
    const fit = placeTree(L, ar ? 'الشجرة' : 'The tree', titles.sub);
    if (fit.nameSize >= MIN_NAME) { fit.place(); }
    else {
      let g = 4, f2;
      do { f2 = placeTree(lay(root, g), ar ? 'الشجرة: الأجيال الأولى' : 'The tree: first generations', ar ? 'وتتبعها الفروع في الصفحات التالية' : 'Each branch follows on its own page'); g--; } while (f2.nameSize < MIN_NAME && g > 2);
      f2.place();
    }
    // branches: each son's family; too big → his family first, then each of his sons'
    const branch = (id, depth) => {
      const kids = ix.children(id).filter(c => ix.children(c).length);
      if (!ix.children(id).length) return;
      const L = lay(id);
      const title = (ar ? 'فرع ' : '') + lineageText(ix.paternalLine(id, 3).map(x => ix.P[x].n || '؟'), { gender: ix.P[id].g, style: 'bin', lang: lang.value }) + (ar ? '' : "'s branch");
      const fit = placeTree(L, title, '');
      if (fit.nameSize >= MIN_NAME || depth > 6) { branchPages.push({ id, page: fit.place() }); return; }
      let g = 3, f2;
      do { f2 = placeTree(lay(id, g), title, ''); g--; } while (f2.nameSize < MIN_NAME && g > 1);
      branchPages.push({ id, page: f2.place() });
      for (const c of kids) if (ix.P[c].g !== 'f' || opts.dKids) branch(c, depth + 1);
    };
    const tops = ix.children(root).filter(c => ix.children(c).length && (ix.P[c].g !== 'f' || opts.dKids));
    if (L.nodes.length > 12) for (const c of tops) branch(c, 1);
  }

  /* ---------- everyone's details ---------- */
  const order = [];
  const seen = new Set();
  const dfs = id => {
    if (seen.has(id)) return;
    seen.add(id); order.push(id);
    if (id !== root && ix.P[id].g === 'f' && !opts.dKids) return;
    for (const c of ix.children(id)) dfs(c);
  };
  dfs(root);
  const others = Object.keys(ix.P).filter(id => !seen.has(id)).sort((a, b) => byName(ix.P[a].n, ix.P[b].n));
  const gen = generations(ix, root, { daughtersKids: true });
  const pageOf = new Map();
  const detailStart = pages.length;
  {
    const wr = writer();
    heading(wr, ar ? 'سِيَر الأفراد' : 'Everyone in the family');
    const entry = id => {
      const p = ix.P[id];
      const inf = info(id);
      wr.need(70);
      pageOf.set(id, pages.length);
      const y0 = wr.y;
      // seal at the start edge, name beside it, generation at the end edge
      const R = 12;
      const sx = wr.at(R), sy = y0 + R + 2;
      const col = branchColor(th, -1, false);
      if (p.g === 'f') wr.items.push({ t: 'circle', cx: sx, cy: sy, r: R, fill: inf.dead ? th.bg : mix(th.accent, th.bg, 0.15), stroke: th.accent, sw: 1.2 });
      else wr.items.push({ t: 'rect', x: sx - R, y: sy - R, w: 2 * R, h: 2 * R, r: 4, fill: inf.dead ? th.bg : mix(th.accent, th.bg, 0.15), stroke: th.accent, sw: 1.2 });
      if (inf.photo) wr.items.push({ t: 'image', photo: inf.photo, x: sx - R + 1.5, y: sy - R + 1.5, w: 2 * R - 3, h: 2 * R - 3, clip: p.g === 'f' ? { shape: 'circle' } : { shape: 'rect', r: 3 } });
      else wr.items.push({ t: 'text', x: sx, y: sy + 4.6, s: inf.initial, font: th.fonts.initial, size: 13, fill: th.accent, w: measure(th.fonts.initial, inf.initial, 13) });
      const nm = fitText(measure, p.n || '؟', th.fonts.name, 15, wr.width - 120);
      wr.items.push({ t: 'text', x: wr.startX(nm.w, 2 * R + 10), y: y0 + 18, s: nm.s, font: th.fonts.name, size: nm.size, fill: th.ink, w: nm.w });
      const g = gen.get(id);
      if (g) { const gl = ar ? 'الجيل ' + dig(g) : 'Gen. ' + g; const gw = measure(th.fonts.text, gl, 9); wr.items.push({ t: 'text', x: wr.endX(gw), y: y0 + 16, s: gl, font: th.fonts.text, size: 9, fill: th.ink3, w: gw }); }
      wr.y = y0 + 2 * R + 8;
      const lin = ix.paternalLine(id).map(x => ix.P[x].n || '؟');
      const ind = 2 * R + 10;
      if (lin.length > 1) wr.para(lineageText(lin, { gender: p.g, style: 'bin', family: ix.familyOf(id), lang: lang.value }), th.fonts.sub || th.fonts.text, 10.5, th.ink2, { indent: ind, lead: 1.7 });
      const facts = [];
      const bd = fmtDateParts(p.b), dd = fmtDateParts(p.d);
      if (bd.main || p.bp) facts.push((ar ? 'وُلد' + (p.g === 'f' ? 'ت' : '') + ': ' : 'Born: ') + [bd.main + (bd.alt ? ' (' + bd.alt + ')' : ''), p.bp].filter(Boolean).join(ar ? '، ' : ', '));
      if (inf.dead) facts.push((ar ? (p.g === 'f' ? 'تُوفيت' : 'تُوفي') + ': ' : 'Died: ') + ([dd.main + (dd.alt ? ' (' + dd.alt + ')' : ''), p.dp].filter(Boolean).join(ar ? '، ' : ', ') || (ar ? mercy(p.g) : '—')));
      const age = ageOf(p);
      if (age && inf.dead) facts.push((ar ? 'عن عمر ' : 'Aged ') + fmtAge(age));
      const sp = ix.spouses(id).map(x => ix.P[x].n + (ix.familyOf(x) && ix.familyOf(x) !== ix.familyOf(id) ? ' ' + ix.familyOf(x) : ''));
      if (sp.length) facts.push((ar ? (p.g === 'f' ? 'الزوج: ' : sp.length > 1 ? 'الزوجات: ' : 'الزوجة: ') : 'Married: ') + sp.join(ar ? '، ' : ', '));
      const kids = ix.children(id).map(x => ix.P[x].n || '؟');
      if (kids.length) facts.push((ar ? 'الأبناء (' + dig(kids.length) + '): ' : `Children (${kids.length}): `) + kids.join(ar ? '، ' : ', '));
      const work = [p.job, p.edu, p.res].filter(Boolean);
      if (work.length) facts.push(work.join(ar ? '، ' : ', '));
      for (const f of facts) wr.para(f, th.fonts.text, 9.8, th.ink, { indent: ind, lead: 1.75 });
      if (p.note) { wr.space(2); wr.para(p.note, th.fonts.sub || th.fonts.text, 10.5, th.ink2, { indent: ind, lead: 1.85 }); }
      wr.space(7);
      wr.rule(th.line, 0.45, 0);
      wr.space(9);
    };
    for (const id of order) entry(id);
    if (others.length) {
      wr.need(120);
      wr.space(10);
      wr.text(ar ? 'أصهار وأقارب آخرون' : 'In-laws and other relatives', th.fonts.title, 17, th.ink, { align: 'center' });
      wr.space(12);
      for (const id of others) entry(id);
    }
  }

  /* ---------- index of names ---------- */
  const indexStart = pages.length;
  {
    const wr = writer();
    heading(wr, ar ? 'فهرس الأسماء' : 'Index of names');
    const ids = Object.keys(ix.P).sort((a, b) => byName(ix.P[a].n, ix.P[b].n) || (ix.P[a].at || 0) - (ix.P[b].at || 0));
    const colGap = 24, colW = (wr.width - colGap) / 2;
    let col = 0, yStart = wr.y;
    const lineH = 17;
    for (const id of ids) {
      if (wr.y + lineH > H - M.bottom - 10) {
        if (col === 0) { col = 1; wr.y = yStart; }
        else { wr.items = innerPage(); col = 0; wr.y = M.top + 8; yStart = wr.y; }
      }
      const lin = lineageText(ix.paternalLine(id, 3).map(x => ix.P[x].n || '؟'), { gender: ix.P[id].g, style: 'bin', lang: lang.value });
      const pg = dig((pageOf.get(id) ?? 0) + 1);
      const pw = measure(th.fonts.text, pg, 9.5);
      const start = col === 0 ? 0 : colW + colGap;
      const nm = fitText(measure, lin, th.fonts.sub || th.fonts.text, 10.5, colW - pw - 14, 0.85);
      const xName = rtl ? wr.x1 - start - nm.w / 2 : wr.x0 + start + nm.w / 2;
      const xPage = rtl ? wr.x1 - start - colW + pw / 2 : wr.x0 + start + colW - pw / 2;
      wr.items.push({ t: 'text', x: xName, y: wr.y + 11, s: nm.s, font: th.fonts.sub || th.fonts.text, size: nm.size, fill: th.ink, w: nm.w });
      wr.items.push({ t: 'text', x: xPage, y: wr.y + 11, s: pg, font: th.fonts.text, size: 9.5, fill: th.ink2, w: pw });
      wr.y += lineH;
    }
  }

  /* ---------- contents (now that the pages are known) ---------- */
  {
    const c = contents[0];
    const wr = c.wr;
    wr.items = c.items; wr.y = c.y;
    wr.text(ar ? 'محتويات الكتاب' : 'Contents', th.fonts.title, 17, th.ink, { gap: 0.8 });
    const rows = [[ar ? 'الشجرة' : 'The tree', treeStart]];
    for (const b of branchPages.slice(0, 18)) rows.push([(ar ? 'فرع ' : '') + lineageText(ix.paternalLine(b.id, 2).map(x => ix.P[x].n || '؟'), { gender: ix.P[b.id].g, style: 'bin', lang: lang.value }), b.page]);
    if (branchPages.length > 18) rows.push([ar ? 'وبقية الفروع' : 'More branches', branchPages[18].page]);
    rows.push([ar ? 'سِيَر الأفراد' : 'Everyone in the family', detailStart]);
    rows.push([ar ? 'فهرس الأسماء' : 'Index of names', indexStart]);
    for (const [label, pg] of rows) {
      if (!wr.room(20)) break;
      const n = dig(pg + 1);
      const nw = measure(th.fonts.text, n, 11);
      const lw = measure(th.fonts.sub || th.fonts.text, label, 12);
      wr.items.push({ t: 'text', x: wr.startX(lw, 8), y: wr.y + 13, s: label, font: th.fonts.sub || th.fonts.text, size: 12, fill: th.ink, w: lw });
      wr.items.push({ t: 'text', x: wr.endX(nw, 8), y: wr.y + 13, s: n, font: th.fonts.text, size: 11, fill: th.ink2, w: nw });
      // dotted leader
      const a = rtl ? wr.x0 + 8 + nw + 8 : wr.x0 + 8 + lw + 8, b2 = rtl ? wr.x1 - 8 - lw - 8 : wr.x1 - 8 - nw - 8;
      if (b2 > a) wr.items.push({ t: 'path', d: `M${a} ${wr.y + 11}H${b2}`, fill: 'none', stroke: th.ink3, sw: 0.7, dash: [0.6, 3.2], cap: 'round' });
      wr.y += 22;
    }
  }
  numberPages();
  return { pages, title: (ar ? 'كتاب ' : '') + famTitle, th, cover };
}
