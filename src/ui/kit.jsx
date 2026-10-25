// Shared building blocks: top bar, sheets, dialogs, toasts, fields, seals, person rows and pickers.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { t, num, isAr, lang, digits, byName } from '../core/i18n.js';
import { back as goBack, pushOverlay } from './router.js';
import { IX, branchInk, pickerSheet } from './app-state.js';
import { state } from '../core/store.js';
import { photoURL } from '../core/photos.js';
import { initial } from '../core/names.js';
import { searchPeople } from '../core/model.js';
import { parseD, makeD, fmtD, rangeD, HIJRI_MONTHS, G_MONTHS, toArabicDigits, latinDigits, todayJdn, jdnToH, jdnToG } from '../core/dates.js';
import { nameOf, lineTail, yearsOf } from './people.js';

export function TopBar({ title, back, actions, sub, onBack }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    const f = () => el && el.classList.toggle('scrolled', window.scrollY > 4);
    addEventListener('scroll', f, { passive: true }); f();
    return () => removeEventListener('scroll', f);
  }, []);
  return (
    <header class="topbar" ref={ref}>
      <div class="wrap">
        {back && <button class="iconbtn" onClick={() => (onBack ? onBack() : goBack(typeof back === 'string' ? back : 'tree'))} aria-label={t('back')}><Icon name="back" class="flip" /></button>}
        <h1 class={sub ? 'sub' : ''}>{title}</h1>
        {actions}
      </div>
    </header>
  );
}

/* ---------- toasts & dialogs ---------- */
export const toasts = signal([]);
let toastId = 0;
export function toast(text, { action, onAction, ms = 3800 } = {}) {
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-2), { id, text, action, onAction }];
  setTimeout(() => { toasts.value = toasts.value.filter(x => x.id !== id); }, ms);
}
export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map(x => (
        <div class="toast" key={x.id}>
          <span>{x.text}</span>
          {x.action && <button onClick={() => { toasts.value = toasts.value.filter(y => y.id !== x.id); x.onAction && x.onAction(); }}>{x.action}</button>}
        </div>
      ))}
    </div>
  );
}
export const dialog = signal(null);
/** a question → Promise<boolean | string> (choices: [{ v, label, danger }] for more than yes/no) */
export function confirmDialog({ title, text, ok, danger = false, cancel, choices }) {
  return new Promise(resolve => { dialog.value = { title, text, ok: ok || t('ok'), cancel: cancel || t('cancel'), danger, choices, resolve }; });
}
export function DialogHost() {
  const d = dialog.value;
  const okRef = useRef();
  useEffect(() => {
    if (!d) return;
    const close = () => { dialog.value = null; d.resolve(false); };
    const pop = pushOverlay(close);
    setTimeout(() => okRef.current && okRef.current.focus(), 30);
    return pop;
  }, [d]);
  if (!d) return null;
  const done = v => { dialog.value = null; d.resolve(v); };
  return (
    <>
      <div class="scrim" onClick={() => done(false)} />
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" onClick={e => { if (e.target === e.currentTarget) done(false); }}>
        <div class="box">
          <h3 id="dlg-t">{d.title}</h3>
          {d.text && <p>{d.text}</p>}
          {d.choices ? (
            <div style="display:flex;flex-direction:column;gap:8px">
              {d.choices.map((c, i) => <button key={c.v} ref={i === 0 ? okRef : undefined} class={'btn wide' + (c.danger ? ' danger' : i ? ' ghost' : '')} onClick={() => done(c.v)}>{c.label}</button>)}
              <button class="btn wide ghost" onClick={() => done(false)}>{d.cancel}</button>
            </div>
          ) : (
            <div class="btns">
              <button class="btn ghost" onClick={() => done(false)}>{d.cancel}</button>
              <button class={'btn' + (d.danger ? ' red' : '')} ref={okRef} onClick={() => done(true)}>{d.ok}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- bottom sheet ---------- */
export function Sheet({ onClose, title, head, children, label }) {
  const ref = useRef();
  useEffect(() => {
    const pop = pushOverlay(onClose);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key);
    return () => { pop(); document.body.style.overflow = prev; removeEventListener('keydown', key); };
  }, []);
  const drag = useRef(null);
  const onDown = e => { drag.current = { y: e.clientY, t: performance.now() }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = e => {
    if (!drag.current || !ref.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${dy}px)`;
  };
  const onUp = e => {
    if (!drag.current || !ref.current) return;
    const dy = e.clientY - drag.current.y, v = dy / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (dy > 110 || v > 0.6) onClose(); else ref.current.style.transform = '';
  };
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <section class="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={label || title}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style="touch-action:none;padding-bottom:2px">
          <div class="grab" />
          {(title || head) && (
            <div class="sheet-h">
              {head || <h3>{title}</h3>}
              <button class="iconbtn" onClick={onClose} aria-label={t('close')}><Icon name="x" /></button>
            </div>
          )}
        </div>
        <div class="sheet-b">{children}</div>
      </section>
    </>
  );
}

/* ---------- inputs ---------- */
export function Seg({ value, options, onChange, label, mini }) {
  return (
    <div class={'seg' + (mini ? ' mini' : '')} role="group" aria-label={label}>
      {options.map(([v, l]) => <button type="button" key={v} aria-pressed={value === v ? 'true' : 'false'} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
export function Toggle({ checked, onChange, label, sub }) {
  return (
    <button type="button" class="toggle" role="switch" aria-checked={checked ? 'true' : 'false'} onClick={() => onChange(!checked)}>
      <span class="grow"><span style="display:block;font-weight:500">{label}</span>{sub && <span class="small muted" style="display:block">{sub}</span>}</span>
      <span class="switch" />
    </button>
  );
}
export function Field({ label, children, hint }) {
  return <label class="field"><span class="lab">{label}</span>{children}{hint && <p class="hint">{hint}</p>}</label>;
}
export function Empty({ icon = 'tree', title, text, children }) {
  return (
    <div class="empty">
      <Icon name={icon} class="big" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
export const Spinner = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style="animation:spin 0.9s linear infinite">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="40 20" stroke-linecap="round" />
  </svg>
);

/* ---------- people ---------- */
export function usePhoto(id) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    if (!id) { setUrl(''); return; }
    photoURL(id).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}
/** a person's seal: square for men, round for women, hollow once deceased, in the colour of his branch */
export function Seal({ id, size = '', me = false }) {
  const ix = IX.value;
  const p = ix.P[id];
  const url = usePhoto(p && p.photo);
  if (!p) return <span class={'seal ' + size} />;
  const dead = !ix.living(id);
  return (
    <span class={['seal', size, p.g === 'f' ? 'f' : '', dead ? 'dead' : '', me ? 'me' : ''].filter(Boolean).join(' ')} style={{ '--c': branchInk(id) }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initial(p.n || '؟')}
    </span>
  );
}
export function PersonRow({ id, onClick, meta, end, chevron = true }) {
  const me = state.value.me === id;
  const m = meta != null ? meta : [yearsOf(id)].filter(Boolean).join('');
  return (
    <button class="row" onClick={onClick}>
      <Seal id={id} me={me} />
      <span class="grow">
        <span class="title nm">{nameOf(id)} <span class="faint" style="font-weight:400;font-size:14.5px">{lineTail(id, { depth: 3 })}</span></span>
        {m && <span class="meta">{m}</span>}
      </span>
      {end && <span class="end">{end}</span>}
      {chevron && <Icon name="chevron" class="chev" />}
    </button>
  );
}

/** pick someone in the family (sheet with search); driven by the pickerSheet signal */
export function PickerSheet() {
  const o = pickerSheet.value;
  const [q, setQ] = useState('');
  const inp = useRef();
  useEffect(() => { setQ(''); if (o) setTimeout(() => inp.current && inp.current.focus(), 200); }, [o]);
  const ix = IX.value;
  const list = useMemo(() => {
    if (!o) return [];
    const ex = new Set(o.exclude || []);
    const base = q.trim() ? searchPeople(ix, q, 300) : Object.keys(ix.P).sort((a, b) => byName(ix.P[a].n, ix.P[b].n));
    return base.filter(id => !ex.has(id) && (!o.filter || o.filter(id))).slice(0, 300);
  }, [o, q, ix]);
  if (!o) return null;
  const close = () => { pickerSheet.value = null; };
  return (
    <Sheet onClose={close} title={o.title || t('pick_person')}>
      <div class="search" style="box-shadow:none;background:var(--paper-2)"><Icon name="search" /><input ref={inp} value={q} onInput={e => setQ(e.currentTarget.value)} placeholder={t('search_ph')} aria-label={t('search_ph')} /></div>
      <div class="list" style="margin-top:10px;box-shadow:none">
        {list.map(id => <PersonRow key={id} id={id} chevron={false} onClick={() => { close(); o.onPick(id); }} />)}
        {!list.length && <p class="hint" style="padding:16px">{t('no_results')}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- dates: Gregorian or Hijri, to the day, month or year, exact or approximate ---------- */
export function DateInput({ label, value, onChange, hint }) {
  const p = parseD(value);
  const [cal, setCal] = useState(p ? p.cal : 'g');
  const [y, setY] = useState(p ? String(p.y) : '');
  const [m, setM] = useState(p ? p.m : 0);
  const [d, setD] = useState(p ? p.d : 0);
  const [approx, setApprox] = useState(p ? p.approx : false);
  const L = lang.value;
  const emit = (nc, ny, nm, nd, na) => {
    const yy = parseInt(latinDigits(ny), 10);
    if (!yy) { onChange(''); return; }
    onChange(makeD({ cal: nc, y: yy, m: nm || 0, d: nm ? nd || 0 : 0, approx: na }));
  };
  // switching calendars converts what was typed
  const switchCal = nc => {
    if (nc === cal) return;
    const cur = parseD(value);
    if (cur) {
      const conv = convertForInput(cur, nc);
      setY(String(conv.y)); setM(conv.m); setD(conv.d);
      emit(nc, String(conv.y), conv.m, conv.d, approx);
    }
    setCal(nc);
  };
  const months = (cal === 'h' ? HIJRI_MONTHS : G_MONTHS)[L === 'ar' ? 'ar' : 'en'];
  const thisYear = cal === 'h' ? jdnToH(todayJdn()).y : jdnToG(todayJdn()).y;
  const dg = v => (L === 'ar' && digits.value === 'arab' ? toArabicDigits(v) : String(v));
  const shown = fmtD(value, { lang: L, digits: digits.value, prefer: 'entered', both: true });
  const yNum = parseInt(latinDigits(y), 10);
  const bad = y && (!yNum || yNum > thisYear + 1 || yNum < 1);
  return (
    <div class="field">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span class="lab" style="margin:0;flex:1">{label}</span>
        <Seg mini value={cal} label={label} onChange={switchCal} options={[['g', t('cal_g')], ['h', t('cal_h')]]} />
      </div>
      <div class="dategrid">
        <select class="input" value={String(d || '')} disabled={!m} onChange={e => { const v = +e.currentTarget.value || 0; setD(v); emit(cal, y, m, v, approx); }} aria-label={t('day')}>
          <option value="">{t('day')}</option>
          {Array.from({ length: cal === 'h' ? 30 : 31 }, (_, i) => <option key={i} value={i + 1}>{dg(i + 1)}</option>)}
        </select>
        <select class="input" value={String(m || '')} onChange={e => { const v = +e.currentTarget.value || 0; setM(v); if (!v) setD(0); emit(cal, y, v, v ? d : 0, approx); }} aria-label={t('month')}>
          <option value="">{t('month')}</option>
          {months.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
        </select>
        <input class="input num" inputMode="numeric" placeholder={t('year')} value={y} aria-label={t('year')} aria-invalid={bad ? 'true' : undefined}
          onInput={e => { const v = latinDigits(e.currentTarget.value).replace(/[^\d]/g, '').slice(0, 4); setY(v); emit(cal, v, m, d, approx); }} />
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
        <label style="display:flex;align-items:center;gap:6px;font-size:14px;color:var(--ink-2)">
          <input type="checkbox" checked={approx} onChange={e => { const v = e.currentTarget.checked; setApprox(v); emit(cal, y, m, d, v); }} />
          {t('approx')}
        </label>
        <span class="conv" style="margin:0;flex:1;text-align:end">{bad ? <span class="err">{t('e_year')}</span> : shown.alt}</span>
      </div>
      {hint && <p class="hint">{hint}</p>}
    </div>
  );
}
function convertForInput(p, toCal) {
  if (p.cal === toCal) return p;
  // through the day number of the date's middle; keeps the precision
  const r = rangeD({ ...p, approx: false });
  const mid = Math.round((r[0] + r[1]) / 2);
  const o = toCal === 'h' ? jdnToH(mid) : jdnToG(mid);
  return { y: o.y, m: p.m ? o.m : 0, d: p.d ? o.d : 0 };
}

export { num, isAr };
