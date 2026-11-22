// Designing what is printed: the tree poster (shape, look, paper, titles, what to show) with a live
// preview, the family book, and the lineage certificate.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { state } from '../../core/store.js';
import { setPoster } from '../../core/actions.js';
import { t, count, num, lang } from '../../core/i18n.js';
import { POSTER_THEMES, posterTheme } from '../../chart/themes.js';
import { IX, ROOT, pickPerson } from '../app-state.js';
import { route } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, Seg, Toggle, Field, toast, Spinner, PersonRow } from '../kit.jsx';
import { deliverFile, printPdf, isNative } from '../../core/native.js';
import { photoURL } from '../../core/photos.js';
import { runExport, fileBase } from './Export.jsx';
import { defaultTitles, fanTitles, genName } from '../../export/poster.js';
import { generations } from '../../core/model.js';
import { nameOf, lineOf } from '../people.js';
import { PeopleLook } from './Tree.jsx';

/* ---------- the preview: a page you can pinch and drag ---------- */
function usePhotoUrls() {
  const [m, setM] = useState(new Map());
  const ix = IX.value;
  useEffect(() => {
    const ids = Object.values(ix.P).map(p => p.photo).filter(Boolean);
    Promise.all(ids.map(id => photoURL(id).then(u => [id, u]))).then(list => setM(new Map(list.filter(x => x[1]))));
  }, [ix]);
  return m;
}
export function Preview({ make, deps }) {
  const box = useRef(), pg = useRef();
  const [res, setRes] = useState(null);
  const [working, setWorking] = useState(true);
  const view = useRef({ x: 0, y: 0, k: 1, fitted: '' });
  useEffect(() => {
    let alive = true;
    setWorking(true);
    const tm = setTimeout(async () => {
      try { const r = await make(); if (alive) { setRes(r); setWorking(false); } }
      catch (e) { console.error(e); if (alive) setWorking(false); }
    }, 220);
    return () => { alive = false; clearTimeout(tm); };
  }, deps);
  const apply = () => { if (pg.current) pg.current.style.transform = `translate(${view.current.x}px,${view.current.y}px) scale(${view.current.k})`; };
  useEffect(() => {
    if (!res || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const key = res.W + 'x' + res.H;
    if (view.current.fitted !== key) {
      const k = Math.min((r.width - 24) / res.W, (r.height - 24) / res.H);
      view.current = { k, x: (r.width - res.W * k) / 2, y: (r.height - res.H * k) / 2, fitted: key };
    }
    apply();
  }, [res]);
  // drag and pinch
  const pts = useRef(new Map()), last = useRef(null);
  const down = e => { box.current.setPointerCapture(e.pointerId); pts.current.set(e.pointerId, [e.clientX, e.clientY]); };
  const move = e => {
    if (!pts.current.has(e.pointerId)) return;
    const prev = pts.current.get(e.pointerId);
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    const v = view.current;
    if (pts.current.size === 1) { v.x += e.clientX - prev[0]; v.y += e.clientY - prev[1]; }
    else {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const rr = box.current.getBoundingClientRect();
      const c = [(a[0] + b[0]) / 2 - rr.left, (a[1] + b[1]) / 2 - rr.top];
      if (last.current) {
        const k = Math.min(12, Math.max(0.05, v.k * d / last.current));
        v.x = c[0] - (c[0] - v.x) * (k / v.k); v.y = c[1] - (c[1] - v.y) * (k / v.k); v.k = k;
      }
      last.current = d;
    }
    apply();
  };
  const up = e => { pts.current.delete(e.pointerId); if (pts.current.size < 2) last.current = null; };
  const wheel = e => {
    e.preventDefault();
    const v = view.current, rr = box.current.getBoundingClientRect();
    const k = Math.min(12, Math.max(0.05, v.k * Math.exp(-e.deltaY * 0.0015)));
    const c = [e.clientX - rr.left, e.clientY - rr.top];
    v.x = c[0] - (c[0] - v.x) * (k / v.k); v.y = c[1] - (c[1] - v.y) * (k / v.k); v.k = k;
    apply();
  };
  useEffect(() => { const el = box.current; el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel); }, []);
  return (
    <div class="preview" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={t('preview')}>
      {res && <div class="pg" ref={pg} style={{ width: res.W + 'px', height: res.H + 'px' }} dangerouslySetInnerHTML={{ __html: res.svg }} />}
      {working && <div class="busy"><Spinner /></div>}
    </div>
  );
}

/* ---------- looks ---------- */
function ThemeArt({ th }) {
  const f = th.frame;
  return (
    <i style={{ background: th.bg }}>
      <svg viewBox="0 0 62 62" width="62" height="62">
        {f === 'sadu' && <><rect x="0" y="0" width="62" height="9" fill="#A3271F" /><rect x="0" y="53" width="62" height="9" fill="#A3271F" />
          {[6, 18, 30, 42, 54].map(x => <path key={x} d={`M${x} 1.5l4 3-4 3-4-3z`} fill="#1D1714" />)}{[6, 18, 30, 42, 54].map(x => <path key={'b' + x} d={`M${x} 54.5l4 3-4 3-4-3z`} fill="#1D1714" />)}</>}
        {f === 'arabesque' && <><rect x="4" y="4" width="54" height="54" fill="none" stroke={th.gold} stroke-width="1.5" /><rect x="7" y="7" width="48" height="48" fill="none" stroke={th.gold} stroke-width=".6" /><circle cx="4" cy="4" r="5" fill={th.gold} /><circle cx="58" cy="58" r="5" fill={th.gold} /></>}
        {f === 'stars' && <><rect x="4" y="4" width="54" height="54" fill="none" stroke={th.ink2} stroke-width="1" /><rect x="10" y="10" width="42" height="42" fill="none" stroke={th.ink2} stroke-width="1" />{[13, 25, 37, 49].map(x => <circle key={x} cx={x} cy="7" r="1.6" fill={th.accent} />)}</>}
        {f === 'line' && <><rect x="5" y="5" width="52" height="52" fill="none" stroke={th.line} stroke-width="1" /><path d="M5 12V5h7M50 5h7v7M57 50v7h-7M12 57H5v-7" stroke={th.accent} stroke-width="2.4" fill="none" /></>}
        {f === 'night' && <><rect x="5" y="5" width="52" height="52" fill="none" stroke={th.gold} stroke-width="1" />{[[14, 2], [44, 3], [2, 30], [60, 22], [30, 60]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".9" fill={th.gold} />)}</>}
        <path d="M31 20v6M21 32v-3h20v3M21 32v5M31 29v8M41 32v5" stroke={th.line} stroke-width="1.4" fill="none" />
        <rect x="27" y="15" width="8" height="7" rx="2" fill={th.accent} />
        <circle cx="21" cy="40" r="3" fill="none" stroke={th.branch[1]} stroke-width="1.4" /><rect x="28" y="37" width="6" height="6" rx="1.6" fill="none" stroke={th.branch[0]} stroke-width="1.4" /><circle cx="41" cy="40" r="3" fill="none" stroke={th.branch[2]} stroke-width="1.4" />
      </svg>
    </i>
  );
}
export function ThemePicker({ value, onChange }) {
  return (
    <div class="swatches" role="group" aria-label={t('look')}>
      {POSTER_THEMES.map(th => (
        <button key={th.id} class="swatch" aria-pressed={value === th.id ? 'true' : 'false'} onClick={() => onChange(th.id)}>
          <ThemeArt th={th} />{th.name[lang.value === 'ar' ? 'ar' : 'en']}
        </button>
      ))}
    </div>
  );
}

const MODES = [['v', 'mode_v'], ['h', 'mode_h'], ['r', 'mode_r'], ['f', 'mode_f'], ['g', 'mode_g']];
const PAPERS = ['A4', 'A3', 'A2', 'A1', 'A0', 'auto'];
const TABLE_PAPERS = ['auto', 'A4', 'A3', 'A2', 'A1', 'A0']; // the table: one long page first (to read on a phone)

/* ---------- the tree poster ---------- */
export function PosterScreen() {
  const s = state.value, ix = IX.value, root = ROOT.value;
  const photoUrls = usePhotoUrls();
  const saved = s.poster || {};
  const [o, setO] = useState(() => ({
    mode: saved.layout || (s.view.mode === 'f' ? 'f' : s.view.mode) || 'v', theme: saved.theme || 'sadu', paper: saved.paper || 'A3', orient: saved.orient || 'auto',
    head: saved.head, title: saved.title || '', sub: saved.sub, root: saved.root && ix.P[saved.root] ? saved.root : '', person: '',
    photos: saved.photos !== false, dates: saved.dates !== false, spouses: !!saved.spouses, dKids: saved.dKids != null ? saved.dKids : s.settings.motherKids,
    women: saved.women != null ? saved.women : s.view.women !== false, fromGen: saved.fromGen || 1,
    colors: saved.colors !== false, legend: saved.legend !== false, hideLiving: !!saved.hideLiving,
    by: saved.by || '', gpaper: saved.gpaper || 'auto', gdir: saved.gdir || 'ltr',
    inside: saved.inside != null ? saved.inside : !!s.view.inside
  }));
  const set = patch => setO(x => ({ ...x, ...patch }));
  useEffect(() => {
    const tm = setTimeout(() => setPoster({ layout: o.mode, theme: o.theme, paper: o.paper, orient: o.orient, title: o.title, root: o.root, photos: o.photos, dates: o.dates, spouses: o.spouses, dKids: o.dKids, women: o.women, fromGen: o.fromGen, colors: o.colors, legend: o.legend, hideLiving: o.hideLiving, by: o.by, gpaper: o.gpaper, gdir: o.gdir, inside: o.inside }), 600);
    return () => clearTimeout(tm);
  }, [o]);
  const [warn, setWarn] = useState(null);
  const [pages, setPages] = useState(1);
  const table = o.mode === 'g';
  const paper = table ? o.gpaper : o.paper;
  const top = o.root && ix.P[o.root] ? o.root : root;
  const person = o.person && ix.P[o.person] ? o.person : (s.me && ix.P[s.me] ? s.me : top);
  // the generations under the top (with the same rules as the drawing): where the poster may start
  const gens = useMemo(() => generations(ix, top, { daughtersKids: o.dKids, women: o.women }), [ix, top, o.dKids, o.women]);
  const genCount = Math.max(1, ...gens.values());
  const fromGen = Math.min(o.fromGen || 1, genCount);
  const inGen = n => [...gens.values()].filter(g => g === n).length;
  const opts = { ...o, mode: o.mode, root: top, person, fromGen, paper, title: o.title || undefined, by: o.by.trim() };
  const def = o.mode === 'f' ? fanTitles(ix, person) : defaultTitles(ix, top, fromGen);
  const make = async () => {
    const { posterPreview } = await import('../../export/printed.js');
    const r = await posterPreview(ix, s, opts, photoUrls);
    if (!r) return null;
    setWarn(r.P.warn ? r.P.nameSize : null);
    setPages(r.P.pages ? r.P.pages.length : 1);
    return { svg: r.svg, W: r.W || r.P.W, H: r.H || r.P.H };
  };
  const name = () => fileBase() + (o.mode === 'f' ? '-' + nameOf(person) : '');
  const pdf = (print = false) => runExport(t('making_pdf'), async () => {
    const { posterPdf } = await import('../../export/printed.js');
    const { blob } = await posterPdf(ix, s, opts);
    if (print) await printPdf(blob, name() + '.pdf'); else await deliverFile(blob, name() + '.pdf', { title: t('ex_poster') });
  });
  const png = () => runExport(t('making_image'), async () => {
    const { posterPng } = await import('../../export/printed.js');
    const { blob } = await posterPng(ix, s, opts);
    await deliverFile(blob, name() + '.png', { title: t('ex_poster') });
  });
  const svg = () => runExport(t('making_file'), async () => {
    const { posterSvg } = await import('../../export/printed.js');
    const { blob } = await posterSvg(ix, s, opts);
    await deliverFile(blob, name() + '.svg', { title: t('ex_poster') });
  });
  if (!root) return <div class="screen"><TopBar back="export" title={t('ex_poster')} /><div class="wrap"><p class="muted">{t('export_empty')}</p></div></div>;
  return (
    <div class="screen">
      <TopBar back="export" title={t('ex_poster')} sub />
      <div class="wrap">
        <Preview make={make} deps={[JSON.stringify(opts), ix, photoUrls]} />
        {warn != null && <p class="warn">{t('small_names', { n: num(warn, 1) })}</p>}
        {table && pages > 1 && <p class="hint">{t('table_pages', { n: count(pages, 'page') })}</p>}
        <div class="btns" style="margin-top:12px">
          <button class="btn" onClick={() => pdf(false)}><Icon name="download" />PDF</button>
          <button class="btn ghost" onClick={png}><Icon name="image" />{t('image')}</button>
          {!isNative && <button class="btn ghost" onClick={svg}>SVG</button>}
        </div>
        <button class="btn ghost wide" style="margin-top:10px" onClick={() => pdf(true)}><Icon name="print" />{t('print')}</button>

        <div class="section">
          <h2>{t('shape')}</h2>
          <Seg value={o.mode} onChange={m => set({ mode: m })} options={MODES.map(([m, l]) => [m, t(l)])} label={t('shape')} />
          {table && <p class="hint">{t('mode_hint_g')}</p>}
        </div>
        {table ? (
          <div class="section">
            <h2>{t('gdir')}</h2>
            <Seg value={o.gdir} onChange={v => set({ gdir: v })} options={[['ltr', t('gdir_ltr')], ['rtl', t('gdir_rtl')]]} label={t('gdir')} />
          </div>
        ) : (
          <div class="section">
            <h2>{t('look')}</h2>
            <ThemePicker value={o.theme} onChange={th => set({ theme: th })} />
          </div>
        )}
        <div class="section">
          <h2>{t('paper')}</h2>
          <div class={'chips' + (table ? ' wrap' : '')}>{(table ? TABLE_PAPERS : PAPERS).map(p => <button key={p} class="chip" aria-pressed={paper === p ? 'true' : 'false'} onClick={() => set(table ? { gpaper: p } : { paper: p })}>{p === 'auto' ? t(table ? 'paper_long' : 'paper_auto') : p}</button>)}</div>
          {paper === 'auto' ? <p class="hint">{t(table ? 'paper_auto_hint_g' : 'paper_auto_hint')}</p> : <>
            <div style="margin-top:8px"><Seg mini value={o.orient} onChange={v => set({ orient: v })} options={[['auto', t('orient_auto')], ['portrait', t('portrait')], ['landscape', t('landscape')]]} label={t('orientation')} /></div>
            {table && <p class="hint">{t('paper_pages_hint_g')}</p>}
          </>}
        </div>
        <div class="section">
          <h2>{o.mode === 'f' ? t('fan_person') : t('starts_from')}</h2>
          <div class="list">
            <PersonRow id={o.mode === 'f' ? person : top} meta={o.mode === 'f' ? '' : t('descendants_n', { n: count(ix.descendants(top).size, 'person') })} onClick={() => pickPerson({ title: o.mode === 'f' ? t('fan_person') : t('starts_from'), onPick: id => set(o.mode === 'f' ? { person: id, fromGen: 1 } : { root: id, fromGen: 1 }) })} />
          </div>
          {o.mode !== 'f' && genCount > 1 && <>
            <h3 class="subh">{t('from_gen')}</h3>
            <div class="chips wrap" role="group" aria-label={t('from_gen')}>
              {Array.from({ length: genCount }, (_, i) => i + 1).map(n => (
                <button key={n} class="chip" aria-pressed={fromGen === n ? 'true' : 'false'} onClick={() => set({ fromGen: n })}>{genName(n).replace(/^(الجيل|generation) /, '')}</button>
              ))}
            </div>
            <p class="hint">{fromGen === 1 ? t('from_gen_all') : t('from_gen_hint', { gen: genName(fromGen), n: count(inGen(fromGen), 'person') })}</p>
          </>}
        </div>
        <div class="section">
          <h2>{t('titles')}</h2>
          <Field label={t('title_head')}><input class="input" value={o.head ?? def.head} onInput={e => set({ head: e.currentTarget.value })} /></Field>
          <Field label={t('title_main')}><input class="input" value={o.title} placeholder={def.title} onInput={e => set({ title: e.currentTarget.value })} /></Field>
          <Field label={t('title_sub')}><input class="input" value={o.sub ?? def.sub} onInput={e => set({ sub: e.currentTarget.value })} /></Field>
          <Field label={t('title_by')}><input class="input" value={o.by} placeholder={t('title_by_ph')} maxLength={80} onInput={e => set({ by: e.currentTarget.value })} /></Field>
        </div>
        <div class="section">
          <h2>{t('show')}</h2>
          {table ? (
            <div class="list">
              <Toggle checked={o.women} onChange={v => set({ women: v })} label={t('opt_women')} sub={t('opt_women_sub')} />
              {o.women && <Toggle checked={o.dKids} onChange={v => set({ dKids: v })} label={t('opt_dkids')} sub={t('opt_dkids_sub')} />}
              <Toggle checked={o.colors} onChange={v => set({ colors: v })} label={t('opt_gen_colors')} sub={t('opt_gen_colors_sub')} />
            </div>
          ) : (<>
            {o.mode !== 'f' && <PeopleLook value={o.inside} onChange={v => set({ inside: v })} />}
            <div class="list" style={o.mode !== 'f' ? 'margin-top:12px' : ''}>
              {!(o.inside && o.mode !== 'f') && <Toggle checked={o.photos} onChange={v => set({ photos: v })} label={t('opt_photos')} />}
              <Toggle checked={o.dates} onChange={v => set({ dates: v })} label={t('opt_dates')} />
              {o.mode !== 'f' && <Toggle checked={o.women} onChange={v => set({ women: v })} label={t('opt_women')} sub={t('opt_women_sub')} />}
              {o.mode === 'v' && o.women && <Toggle checked={o.spouses} onChange={v => set({ spouses: v })} label={t('opt_spouses')} sub={t('opt_spouses_sub')} />}
              {o.mode !== 'f' && o.women && <Toggle checked={o.dKids} onChange={v => set({ dKids: v })} label={t('opt_dkids')} sub={t('opt_dkids_sub')} />}
              {o.mode !== 'f' && <Toggle checked={o.colors} onChange={v => set({ colors: v })} label={t('opt_colors')} />}
              <Toggle checked={o.legend} onChange={v => set({ legend: v })} label={t('opt_legend')} />
              <Toggle checked={o.hideLiving} onChange={v => set({ hideLiving: v })} label={t('hide_living')} sub={t('hide_living_sub')} />
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

/* ---------- the family book ---------- */
export function BookScreen() {
  const s = state.value, ix = IX.value, root = ROOT.value;
  const photoUrls = usePhotoUrls();
  const [o, setO] = useState({ theme: (s.poster && s.poster.theme) || 'palm', root: '', dKids: s.settings.motherKids, photos: true, inside: !!(s.poster && s.poster.inside != null ? s.poster.inside : s.view.inside) });
  const set = patch => setO(x => ({ ...x, ...patch }));
  const top = o.root && ix.P[o.root] ? o.root : root;
  const opts = { ...o, root: top };
  const make = async () => {
    const { prepareBook, pagePreview } = await import('../../export/printed.js');
    const { B, keys } = await prepareBook(ix, s, opts);
    if (!B) return null;
    const svg = await pagePreview(B.pages[0], keys, photoUrls);
    return { svg, W: B.pages[0].W, H: B.pages[0].H, n: B.pages.length };
  };
  const pdf = (print = false) => runExport(t('making_book'), async () => {
    const { bookPdf } = await import('../../export/printed.js');
    const { blob, pages } = await bookPdf(ix, s, opts);
    const name = fileBase() + '-' + (lang.value === 'ar' ? 'كتاب' : 'book') + '.pdf';
    if (print) await printPdf(blob, name); else await deliverFile(blob, name, { title: t('ex_book') });
    toast(t('book_done', { n: count(pages, 'page') }));
  });
  if (!root) return <div class="screen"><TopBar back="export" title={t('ex_book')} /><div class="wrap"><p class="muted">{t('export_empty')}</p></div></div>;
  return (
    <div class="screen">
      <TopBar back="export" title={t('ex_book')} sub />
      <div class="wrap">
        <p class="lead" style="margin-top:0">{t('book_lead')}</p>
        <Preview make={make} deps={[JSON.stringify(opts), ix, photoUrls]} />
        <div class="btns" style="margin-top:12px">
          <button class="btn" onClick={() => pdf(false)}><Icon name="download" />PDF</button>
          <button class="btn ghost" onClick={() => pdf(true)}><Icon name="print" />{t('print')}</button>
        </div>
        <div class="section"><h2>{t('look')}</h2><ThemePicker value={o.theme} onChange={th => set({ theme: th })} /><p class="hint">{t('book_look_hint')}</p></div>
        <div class="section">
          <h2>{t('starts_from')}</h2>
          <div class="list"><PersonRow id={top} meta={t('descendants_n', { n: count(ix.descendants(top).size, 'person') })} onClick={() => pickPerson({ title: t('starts_from'), onPick: id => set({ root: id }) })} /></div>
        </div>
        <div class="section">
          <PeopleLook value={o.inside} onChange={v => set({ inside: v })} />
          <div class="list" style="margin-top:12px">
            {!o.inside && <Toggle checked={o.photos} onChange={v => set({ photos: v })} label={t('opt_photos')} />}
            <Toggle checked={o.dKids} onChange={v => set({ dKids: v })} label={t('opt_dkids')} sub={t('opt_dkids_sub')} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- the lineage certificate ---------- */
export function CertificateScreen() {
  const s = state.value, ix = IX.value;
  const photoUrls = usePhotoUrls();
  const q = route.value.query.get('p');
  const [o, setO] = useState({ person: q && ix.P[q] ? q : (s.me && ix.P[s.me] ? s.me : ''), theme: 'manuscript', basmala: true, mother: true });
  const set = patch => setO(x => ({ ...x, ...patch }));
  const id = o.person;
  const make = async () => {
    if (!id) return null;
    const { prepareCertificate, pagePreview } = await import('../../export/printed.js');
    const { C, keys } = await prepareCertificate(ix, s, id, o);
    const svg = await pagePreview(C, keys, photoUrls);
    return { svg, W: C.W, H: C.H };
  };
  const pdf = (print = false) => runExport(t('making_pdf'), async () => {
    const { certificatePdf } = await import('../../export/printed.js');
    const { blob } = await certificatePdf(ix, s, id, o);
    const name = (lang.value === 'ar' ? 'نسب-' : 'lineage-') + lineOf(id, { depth: 3, style: 'plain' }).replace(/\s+/g, '-') + '.pdf';
    if (print) await printPdf(blob, name); else await deliverFile(blob, name, { title: t('ex_cert') });
  });
  return (
    <div class="screen">
      <TopBar back="export" title={t('ex_cert')} sub />
      <div class="wrap">
        <div class="list">
          {id ? <PersonRow id={id} onClick={() => pickPerson({ title: t('cert_for'), onPick: x => set({ person: x }) })} />
            : <button class="row" onClick={() => pickPerson({ title: t('cert_for'), onPick: x => set({ person: x }) })}><Icon name="search" class="chev" /><span class="grow"><span class="title">{t('cert_for')}</span></span></button>}
        </div>
        {id && <>
          <div style="margin-top:12px"><Preview make={make} deps={[JSON.stringify(o), ix, photoUrls]} /></div>
          <div class="btns" style="margin-top:12px">
            <button class="btn" onClick={() => pdf(false)}><Icon name="download" />PDF</button>
            <button class="btn ghost" onClick={() => pdf(true)}><Icon name="print" />{t('print')}</button>
          </div>
          <div class="section"><h2>{t('look')}</h2><ThemePicker value={o.theme} onChange={th => set({ theme: th })} /></div>
          <div class="section"><div class="list">
            {lang.value === 'ar' && <Toggle checked={o.basmala} onChange={v => set({ basmala: v })} label={t('basmala')} />}
            <Toggle checked={o.mother} onChange={v => set({ mother: v })} label={t('cert_mother')} />
          </div></div>
        </>}
      </div>
    </div>
  );
}
export { posterTheme };
