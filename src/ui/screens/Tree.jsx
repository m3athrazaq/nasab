// The tree: pan and pinch to move around, tap a person for his card. Four views: top-down, right to
// left, the canopy (a real tree), and the ancestors' fan. The selected person's line to the top of the
// tree is drawn as a red thread.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import { state } from '../../core/store.js';
import { setView, setRoot, toggleCollapsed } from '../../core/actions.js';
import { t, num, count, lang } from '../../core/i18n.js';
import { familyTitle } from '../../core/names.js';
import { generations } from '../../core/model.js';
import { layoutDescendants, layoutFan } from '../../chart/layout.js';
import { drawDescendants, drawFan, threadKeys } from '../../chart/draw.js';
import { cssFont } from '../../chart/themes.js';
import { makeInfo } from '../../chart/info.js';
import { IX, ROOT, screenTheme, personSheet, openPerson, openAdd, viewSheet, focusRequest, pickPerson, focusOn } from '../app-state.js';
import { go, route } from '../router.js';
import { Icon } from '../icons.jsx';
import { Sheet, Toggle, Seg, PersonRow } from '../kit.jsx';
import { SceneItems } from '../scene.jsx';
import { photoURL } from '../../core/photos.js';
import { nameOf, lineOf } from '../people.js';

/* text widths on the screen (the same web fonts the chart is drawn with) */
export const fontsReady = signal(0);
const mctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
const mcache = new Map();
export function measureScreen(font, text, size) {
  const k = font + '|' + size + '|' + text;
  let v = mcache.get(k);
  if (v == null) {
    mctx.font = cssFont(font, size);
    v = mctx.measureText(text).width;
    if (mcache.size > 30000) mcache.clear();
    mcache.set(k, v);
  }
  return v;
}
if (typeof document !== 'undefined' && document.fonts) {
  Promise.all(['700 16px "Nasab Naskh"', '400 12px "Nasab Readex"', '600 12px "Nasab Readex"', '700 20px "Nasab Ruqaa"'].map(f => document.fonts.load(f, 'محمد 1950').catch(() => {})))
    .then(() => { mcache.clear(); fontsReady.value++; });
}

export const fanPerson = signal(null);
const photoUrls = signal(new Map());
let photoKey = '';
function loadPhotoUrls(ix) {
  const ids = Object.values(ix.P).map(p => p.photo).filter(Boolean);
  const key = ids.join(',');
  if (key === photoKey) return;
  photoKey = key;
  Promise.all(ids.map(id => photoURL(id).then(u => [id, u]))).then(list => { photoUrls.value = new Map(list.filter(x => x[1])); });
}

function TreeCanvas() {
  const s = state.value, ix = IX.value, root = ROOT.value, v = s.view;
  const th = screenTheme.value;
  const rtl = lang.value === 'ar';
  const svgRef = useRef(), gRef = useRef(), zRef = useRef(), tRef = useRef(zoomIdentity), fitKey = useRef('');
  const [sel, setSel] = useState(null);
  const open = personSheet.value;
  useEffect(() => { if (open) setSel(open); }, [open]);
  useEffect(() => { loadPhotoUrls(ix); }, [ix]);
  const fp = fanPerson.value && ix.P[fanPerson.value] ? fanPerson.value : (s.me && ix.P[s.me] ? s.me : root);
  const collapsed = v.collapsed.join(',');
  const L = useMemo(() => {
    if (!root) return null;
    if (v.mode === 'f') {
      const known = Math.max(0, ...ix.ancestors(fp, 8).values());
      return layoutFan(ix, fp, { gens: Math.min(6, Math.max(3, known + 1)), rtl });
    }
    return layoutDescendants(ix, root, { mode: v.mode, dKids: v.dKids, spouses: v.spouses, dates: v.dates, rtl, collapsed: new Set(v.collapsed) });
  }, [ix, root, v.mode, v.dKids, v.spouses, v.dates, collapsed, rtl, fp, fontsReady.value]);
  const info = useMemo(() => makeInfo(ix, s, {}), [ix, s.settings, lang.value]);
  const thread = useMemo(() => (L && sel && v.mode !== 'f' ? threadKeys(L, sel) : new Set()), [L, sel, v.mode]);
  const scene = useMemo(() => {
    if (!L) return null;
    const o = {
      info, measure: measureScreen, photos: v.photos, dates: v.dates, spouses: v.spouses, colors: v.colors, bands: v.bands,
      genLabel: n => t('gen_n', { n: num(n) }), me: s.me, selected: sel, thread, screen: true, num: n => num(n),
      motherLabel: u => { const w = ix.U[u] && ix.U[u].w; return w && ix.P[w] ? t('from_mother', { name: ix.P[w].n }) : ''; }
    };
    return v.mode === 'f' ? drawFan(L, th, o) : drawDescendants(L, th, o);
  }, [L, th, v.photos, v.dates, v.spouses, v.colors, v.bands, sel, thread, s.me, info, fontsReady.value]);

  /* pan & zoom */
  useEffect(() => {
    const svg = select(svgRef.current);
    const z = zoom().scaleExtent([0.06, 3.2]).clickDistance(8)
      .on('zoom', e => { tRef.current = e.transform; if (gRef.current) gRef.current.setAttribute('transform', e.transform.toString()); });
    svg.call(z).on('dblclick.zoom', null);
    zRef.current = z;
    return () => svg.on('.zoom', null);
  }, []);
  const size = () => { const r = svgRef.current.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const apply = tr => select(svgRef.current).call(zRef.current.transform, tr);
  const animateTo = (cx, cy, k, ms = 520) => {
    const { w, h } = size();
    const cur = tRef.current;
    const from = [(w / 2 - cur.x) / cur.k, (h / 2 - cur.y) / cur.k, w / cur.k];
    const to = [cx, cy, w / k];
    const ip = interpolateZoom(from, to);
    const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.min(900, Math.max(ms, ip.duration * 0.6));
    const t0 = performance.now();
    const step = now => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const [x, y, vw] = ip(e);
      const kk = w / vw;
      apply(zoomIdentity.translate(w / 2 - x * kk, h / 2 - y * kk).scale(kk));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const fit = (animate = true) => {
    if (!L) return;
    const { w, h } = size();
    const b = L.bounds;
    const top = 70, bottom = 70;
    const k = Math.min(1.25, Math.min(w / (b.x1 - b.x0 + 24), (h - top - bottom) / (b.y1 - b.y0 + 24)));
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2 - (top - bottom) / 2 / k;
    if (animate) animateTo(cx, cy, k);
    else apply(zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k));
  };
  const centerOn = (id, k) => {
    if (!L) return false;
    const n = v.mode === 'f' ? null : L.nodes.find(x => x.id === id && !x.dup);
    if (!n) return false;
    animateTo(n.x, n.y + 30, k || Math.max(tRef.current.k, 0.95));
    return true;
  };
  // a new layout: show it whole if it is readable, else start at "me" (or the top)
  const visible = route.value.name === 'tree';
  useEffect(() => {
    if (!L || !visible) return;
    const key = v.mode + '|' + root + '|' + (v.mode === 'f' ? fp : '');
    if (fitKey.current === key) return;
    const { w, h } = size();
    if (!w || !h) return; // hidden: fitted when it is shown
    fitKey.current = key;
    const b = L.bounds;
    const k = Math.min(w / (b.x1 - b.x0 + 24), (h - 140) / (b.y1 - b.y0 + 24));
    if (k >= 0.55 || v.mode === 'f' || v.mode === 'r') fit(false);
    else {
      const start = s.me && L.nodes.find(x => x.id === s.me) ? s.me : root;
      const n = L.nodes.find(x => x.id === start);
      apply(zoomIdentity.translate(w / 2 - n.x * 0.9, h / 2 - (n.y + 40) * 0.9).scale(0.9));
    }
  }, [L, visible]);
  // "show in the tree" from elsewhere
  useEffect(() => {
    const r = focusRequest.value;
    if (!r || !L || !visible) return;
    if (centerOn(r.id, 1.05)) { setSel(r.id); focusRequest.value = null; }
  }, [focusRequest.value, L, visible]);
  useEffect(() => {
    window.__nasabTree = { fit: () => fit(), zoomBy: f => { const tr = tRef.current, { w, h } = size(); animateTo((w / 2 - tr.x) / tr.k, (h / 2 - tr.y) / tr.k, Math.min(3.2, Math.max(0.06, tr.k * f)), 260); }, centerOn };
    return () => { delete window.__nasabTree; };
  });

  const onClick = e => {
    const g = e.target.closest && e.target.closest('[data-key]');
    if (!g) { setSel(null); return; }
    const key = g.getAttribute('data-key');
    const id = g.getAttribute('data-id');
    if (key && key.startsWith('fan:') && !id) {
      // an empty place in the fan: add that father or mother
      const sl = L.slots.find(x => `fan:${x.g}:${x.i}` === key);
      if (sl && sl.child) openAdd(sl.role === 'h' ? 'father' : 'mother', sl.child);
      return;
    }
    if (id) { setSel(id); openPerson(id); }
  };
  if (!root) return null;
  return (
    <div class="treeview">
      <svg class="chart" ref={svgRef} onClick={onClick} role="img" aria-label={t('tree_aria')}>
        <g ref={gRef} transform={tRef.current.toString()}>
          {scene && <SceneItems items={scene.items} photoUrls={photoUrls.value} dir={rtl ? 'rtl' : 'ltr'} />}
        </g>
      </svg>
    </div>
  );
}

const MODES = [['v', 'vtree', 'mode_v'], ['h', 'htree', 'mode_h'], ['r', 'canopy', 'mode_r'], ['f', 'fan', 'mode_f']];

export function TreeScreen() {
  const s = state.value, ix = IX.value, root = ROOT.value;
  const [rootSheet, setRootSheet] = useState(false);
  const gens = useMemo(() => generations(ix, root, { daughtersKids: s.view.dKids }), [ix, root, s.view.dKids]);
  if (!root) {
    return (
      <div class="screen"><div class="wrap" style="padding-top:80px;text-align:center">
        <h2 style="font-family:var(--ruqaa);font-size:32px;margin:0">{t('tree_empty_t')}</h2>
        <p class="muted">{t('tree_empty_p')}</p>
        <button class="btn" onClick={() => openAdd('person')}><Icon name="userPlus" />{t('add_first')}</button>
      </div></div>
    );
  }
  const fam = ix.familyOf(root);
  const isFan = s.view.mode === 'f';
  const fp = fanPerson.value && ix.P[fanPerson.value] ? fanPerson.value : (s.me && ix.P[s.me] ? s.me : root);
  const maxGen = Math.max(1, ...gens.values());
  const title = isFan ? t('fan_of', { name: nameOf(fp) }) : (fam ? familyTitle(fam) : t('tree_of', { name: nameOf(root) }));
  const sub = isFan ? lineOf(fp, { depth: 4 }) : t('tree_sub', { people: count(gens.size, 'person'), gens: count(maxGen, 'generation') });
  return (
    <>
      <TreeCanvas />
      <div class="tree-top">
        <button class="tree-title" onClick={() => setRootSheet(true)} aria-label={t('choose_root')}>
          <b>{title}</b>
          <span>{sub}<Icon name="caret" /></span>
        </button>
        <button class="iconbtn" onClick={() => pickPerson({ title: t('find_in_tree'), onPick: id => { focusOn(id); openPerson(id); } })} aria-label={t('search')}><Icon name="search" /></button>
        <button class="iconbtn" onClick={() => { viewSheet.value = true; }} aria-label={t('view_options')}><Icon name="sliders" /></button>
        <button class="iconbtn" onClick={() => go('poster')} aria-label={t('print_tree')}><Icon name="print" /></button>
      </div>
      <div class="zoombar">
        <button onClick={() => window.__nasabTree && window.__nasabTree.zoomBy(1.45)} aria-label={t('zoom_in')}><Icon name="plus" /></button>
        <button onClick={() => window.__nasabTree && window.__nasabTree.zoomBy(1 / 1.45)} aria-label={t('zoom_out')}><Icon name="minus" /></button>
        <button onClick={() => window.__nasabTree && window.__nasabTree.fit()} aria-label={t('fit')}><Icon name="fit" /></button>
        {s.me && ix.P[s.me] && !isFan && <button onClick={() => window.__nasabTree && window.__nasabTree.centerOn(s.me, 1.05)} aria-label={t('find_me')}><Icon name="target" /></button>}
      </div>
      <div class="modebar" role="group" aria-label={t('view_mode')}>
        {MODES.map(([m, icon, label]) => (
          <button key={m} aria-pressed={s.view.mode === m ? 'true' : 'false'} onClick={() => setView({ mode: m })} aria-label={t(label)} title={t(label)}><Icon name={icon} /></button>
        ))}
      </div>
      {rootSheet && <RootSheet onClose={() => setRootSheet(false)} />}
    </>
  );
}

/** where the tree starts */
function RootSheet({ onClose }) {
  const s = state.value, ix = IX.value, root = ROOT.value;
  const tops = ix.tops().filter(id => ix.children(id).length).slice(0, 12);
  const choose = id => { setRoot(id); onClose(); setTimeout(() => window.__nasabTree && window.__nasabTree.fit(), 80); };
  return (
    <Sheet onClose={onClose} title={t('choose_root')}>
      <p class="hint" style="margin-top:0">{t('choose_root_hint')}</p>
      <div class="list" style="box-shadow:none;margin-top:8px">
        {tops.map(id => <PersonRow key={id} id={id} meta={t('descendants_n', { n: count(ix.descendants(id).size, 'person') })} end={id === root ? <Icon name="check" /> : null} chevron={false} onClick={() => choose(id)} />)}
      </div>
      <button class="btn ghost wide" style="margin-top:12px" onClick={() => { onClose(); pickPerson({ title: t('choose_root'), onPick: choose }); }}><Icon name="search" />{t('choose_other_root')}</button>
      {s.root && <button class="btn ghost wide" style="margin-top:8px" onClick={() => choose('')}>{t('root_auto')}</button>}
    </Sheet>
  );
}

/** what the tree shows */
export function ViewSheet() {
  if (!viewSheet.value) return null;
  const v = state.value.view;
  const close = () => { viewSheet.value = false; };
  const collapsedAny = v.collapsed.length > 0;
  return (
    <Sheet onClose={close} title={t('view_options')}>
      <Seg value={v.mode} onChange={m => setView({ mode: m })} options={MODES.map(([m, , l]) => [m, t(l)])} label={t('view_mode')} />
      <p class="hint">{t('mode_hint_' + v.mode)}</p>
      <div class="list" style="box-shadow:none;margin-top:12px;background:var(--paper-2)">
        <Toggle checked={v.photos} onChange={x => setView({ photos: x })} label={t('opt_photos')} />
        <Toggle checked={v.dates} onChange={x => setView({ dates: x })} label={t('opt_dates')} />
        <Toggle checked={v.spouses} onChange={x => setView({ spouses: x })} label={t('opt_spouses')} sub={t('opt_spouses_sub')} />
        <Toggle checked={v.dKids} onChange={x => setView({ dKids: x })} label={t('opt_dkids')} sub={t('opt_dkids_sub')} />
        <Toggle checked={v.colors} onChange={x => setView({ colors: x })} label={t('opt_colors')} />
        <Toggle checked={v.bands} onChange={x => setView({ bands: x })} label={t('opt_bands')} />
      </div>
      {collapsedAny && <button class="btn ghost wide" style="margin-top:12px" onClick={() => setView({ collapsed: [] })}>{t('expand_all')}</button>}
    </Sheet>
  );
}
export { toggleCollapsed };
