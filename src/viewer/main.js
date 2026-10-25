// The shared family tree: one HTML file anyone can open in a browser (WhatsApp, email…) to explore the
// tree — pan, pinch, search, and tap a name for the details. No app, no internet needed.
// The page carries the data in window.NASAB_DATA (written by export/html.js).
import { buildIndex, searchPeople } from '../core/model.js';
import { layoutDescendants } from '../chart/layout.js';
import { drawDescendants, threadKeys } from '../chart/draw.js';
import { sceneToSvg } from '../chart/render.js';
import { SCREEN } from '../chart/themes.js';

const D = window.NASAB_DATA;
const ar = D.lang === 'ar';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = ar ? { gen: n => 'الجيل ' + n, search: 'ابحث عن اسم…', none: 'لا نتائج', born: 'الميلاد', died: 'الوفاة', parents: 'الوالدان', spouses: 'الزواج', children: 'الأبناء', siblings: 'الإخوة', v: 'عمودي', h: 'أفقي', made: 'صُنعت بتطبيق نَسَب', job: 'المهنة', place: 'المكان', close: 'إغلاق', fit: 'الشجرة كاملة', from: n => 'من ' + n }
  : { gen: n => 'Generation ' + n, search: 'Search a name…', none: 'No results', born: 'Born', died: 'Died', parents: 'Parents', spouses: 'Marriages', children: 'Children', siblings: 'Siblings', v: 'Top-down', h: 'Sideways', made: 'Made with Nasab', job: 'Work', place: 'Place', close: 'Close', fit: 'Whole tree', from: n => 'by ' + n };

// people as the app's index expects them
const state = { people: {}, unions: D.unions };
for (const [id, p] of Object.entries(D.people)) state.people[id] = { id, n: p.n, g: p.g, b: p.bk || '', d: p.dk || '', dead: !!p.dead, pu: p.pu || '', ord: p.o || 0, at: p.at || 0, fam: p.fam || '' };
const ix = buildIndex(state);
ix.living = id => !D.people[id].dead;
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const th = dark ? SCREEN.dark : SCREEN.light;

const cv = document.createElement('canvas').getContext('2d');
const FAM = { naskhB: '700 {s}px ' + (ar ? '"Noto Naskh Arabic","Geeza Pro","Traditional Arabic",serif' : 'Georgia,serif'), ui: '400 {s}px system-ui,-apple-system,"Segoe UI",sans-serif', uiB: '600 {s}px system-ui,-apple-system,sans-serif' };
const fontCss = (k, s) => (FAM[k] || FAM.ui).replace('{s}', s);
const measure = (k, text, size) => { cv.font = fontCss(k, size); return cv.measureText(text).width; };
const info = id => {
  const p = D.people[id];
  return p ? { name: p.n || '؟', initial: p.i || '', years: p.y || '', dead: !!p.dead, g: p.g, photo: p.ph ? id : '', spouses: '' } : null;
};
// photos are small JPEGs written into the file by the app; anything else is ignored
for (const p of Object.values(D.people)) if (p.ph && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.ph)) delete p.ph;
const photos = new Map(Object.entries(D.people).filter(([, p]) => p.ph).map(([id, p]) => [id, p.ph]));

let mode = 'v', sel = null, L = null;
const view = { x: 0, y: 0, k: 1 };
const svgHost = $('#tree');
function render() {
  L = layoutDescendants(ix, D.root, { mode, dKids: !!D.dKids, dates: true, rtl: ar });
  const thread = sel ? threadKeys(L, sel) : new Set();
  const sc = drawDescendants(L, { ...th, fonts: { name: 'naskhB', years: 'ui', initial: 'naskhB', title: 'naskhB', text: 'ui' } }, { info, measure, photos: true, dates: true, colors: true, bands: true, genLabel: T.gen, selected: sel, thread, me: D.me, num: n => n });
  const css = `text{font-family:${ar ? '"Noto Naskh Arabic","Geeza Pro","Traditional Arabic",serif' : 'Georgia,serif'}}`;
  const svg = sceneToSvg(sc.items, { width: 10, height: 10, text: 'fonts', dir: ar ? 'rtl' : 'ltr', fontCss: css, photoHref: id => photos.get(id) || '' });
  svgHost.innerHTML = svg.replace(/^<svg[^>]*>/, '<svg id="chart" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><g id="cam">').replace(/<\/svg>$/, '</g></svg>');
  // tag the person groups for taps (the scene groups are drawn in order)
  const groups = svgHost.querySelectorAll('#cam > g');
  const ids = sc.items.filter(it => it.t === 'g').map(it => it.id || '');
  groups.forEach((g, i) => { if (ids[i]) { g.setAttribute('data-id', ids[i]); g.style.cursor = 'pointer'; } });
  apply();
}
function apply() { const cam = $('#cam'); if (cam) cam.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); }
function fit() {
  const r = svgHost.getBoundingClientRect(), b = L.bounds;
  view.k = Math.min(1.2, Math.min(r.width / (b.x1 - b.x0 + 30), (r.height - 20) / (b.y1 - b.y0 + 30)));
  view.x = r.width / 2 - ((b.x0 + b.x1) / 2) * view.k;
  view.y = r.height / 2 - ((b.y0 + b.y1) / 2) * view.k;
  apply();
}
function center(id, k = 1) {
  const n = L.nodes.find(x => x.id === id && !x.dup);
  if (!n) return;
  const r = svgHost.getBoundingClientRect();
  view.k = k; view.x = r.width / 2 - n.x * k; view.y = r.height / 2.4 - n.y * k;
  apply();
}

/* pan, pinch, wheel */
const pts = new Map();
let last = null, moved = 0;
svgHost.addEventListener('pointerdown', e => { svgHost.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; last = null; });
svgHost.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId);
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]); apply(); }
  else if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (last) { zoomAt(c[0], c[1], d / last.d); view.x += c[0] - last.c[0]; view.y += c[1] - last.c[1]; apply(); }
    last = { d, c }; moved += 10;
  }
});
const up = e => { pts.delete(e.pointerId); if (pts.size < 2) last = null; };
svgHost.addEventListener('pointerup', e => {
  up(e);
  if (moved < 8) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const g = el && el.closest && el.closest('[data-id]');
    if (g) show(g.getAttribute('data-id'));
  }
});
svgHost.addEventListener('pointercancel', up);
svgHost.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function zoomAt(cx, cy, f) {
  const r = svgHost.getBoundingClientRect();
  const k = Math.min(3, Math.max(0.05, view.k * f));
  const px = cx - r.left, py = cy - r.top;
  view.x = px - (px - view.x) * (k / view.k); view.y = py - (py - view.y) * (k / view.k); view.k = k;
  apply();
}

/* details */
const panel = $('#panel');
function link(id) { const p = D.people[id]; return p ? `<button class="lk" data-go="${esc(id)}">${esc(p.n || '؟')}</button>` : ''; }
function show(id) {
  const p = D.people[id];
  if (!p) return;
  sel = id; render(); center(id, Math.max(view.k, 0.9));
  const f = ix.father(id), m = ix.mother(id);
  const sp = ix.spouses(id), kids = ix.children(id);
  const sib = ix.siblings(id);
  const rows = [];
  if (p.b || p.bp) rows.push([T.born, [p.b, p.bp].filter(Boolean).map(esc).join(' — ')]);
  if (p.dead) rows.push([T.died, [p.d, p.dp].filter(Boolean).map(esc).join(' — ') || esc(p.mercy || '')]);
  if (p.job) rows.push([T.job, esc(p.job)]);
  if (f || m) rows.push([T.parents, [f, m].filter(Boolean).map(link).join(' ')]);
  if (sp.length) rows.push([T.spouses, sp.map(link).join(' ')]);
  if (kids.length) rows.push([T.children, kids.map(link).join(' ')]);
  const sibs = [...sib.full, ...sib.paternal, ...sib.maternal];
  if (sibs.length) rows.push([T.siblings, sibs.map(link).join(' ')]);
  panel.innerHTML = `<div class="ph">${p.ph ? `<img src="${p.ph}" alt="">` : `<span class="seal ${p.g === 'f' ? 'f' : ''}">${esc(p.i || '')}</span>`}<div><h2>${esc(p.n || '؟')}</h2><p class="lin">${esc(p.lin || '')}</p></div><button class="x" aria-label="${T.close}">✕</button></div>`
    + `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` + (p.note ? `<p class="note">${esc(p.note)}</p>` : '');
  panel.hidden = false;
}
panel.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (b) show(b.getAttribute('data-go'));
  if (e.target.closest('.x')) { panel.hidden = true; sel = null; render(); }
});

/* search */
const q = $('#q'), res = $('#res');
q.placeholder = T.search;
q.addEventListener('input', () => {
  const v = q.value.trim();
  if (!v) { res.hidden = true; return; }
  const ids = searchPeople(ix, v, 30);
  res.innerHTML = ids.length ? ids.map(id => `<button data-go="${esc(id)}">${esc(D.people[id].lin || D.people[id].n)}</button>`).join('') : `<p>${T.none}</p>`;
  res.hidden = false;
});
res.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { res.hidden = true; q.value = ''; show(b.getAttribute('data-go')); } });

/* header and modes */
$('#title').textContent = D.title;
$('#sub').textContent = D.sub || '';
$('#made').textContent = T.made;
for (const b of document.querySelectorAll('[data-mode]')) {
  b.textContent = T[b.getAttribute('data-mode')];
  b.addEventListener('click', () => { mode = b.getAttribute('data-mode'); document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); render(); fit(); });
}
$('#fit').textContent = T.fit;
$('#fit').addEventListener('click', fit);
document.documentElement.lang = D.lang; document.documentElement.dir = ar ? 'rtl' : 'ltr';
document.title = D.title;
render();
fit();
addEventListener('resize', () => apply());
