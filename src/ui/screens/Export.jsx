// Print, share, keep: the printed tree (PDF/PNG/SVG), the family book, the lineage certificate, the
// interactive file for relatives, GEDCOM for other programs, and the Excel backup with restore.
import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { state, replaceState, mergeStates, update } from '../../core/store.js';
import { markBackup } from '../../core/actions.js';
import { t, count, num, lang } from '../../core/i18n.js';
import { IX } from '../app-state.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, Sheet, Toggle, toast, confirmDialog, Spinner } from '../kit.jsx';
import { deliverFile, pickDataFile, isNative } from '../../core/native.js';
import { safeFileName } from '../../core/util.js';
import { familyTitle } from '../../core/names.js';
import { tidyPhotos } from '../../core/photos.js';

export const busy = signal('');
export const restoreData = signal(null); // { state, photoData, counts, name, kind }

const fileBase = () => {
  const ix = IX.value, s = state.value;
  const root = s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me);
  const fam = root ? ix.familyOf(root) : '';
  return safeFileName((lang.value === 'ar' ? 'شجرة-' : 'family-tree-') + (fam ? familyTitle(fam).replace(/^آل\s/, '') : (root ? ix.P[root].n : 'nasab')));
};
export async function runExport(label, fn) {
  if (busy.value) return;
  busy.value = label;
  try { return await fn(); }
  catch (e) { console.error(e); toast(t('e_export')); }
  finally { busy.value = ''; }
}

/* small drawings for the cards */
const Art = ({ kind }) => {
  const ink = 'var(--ink)', red = 'var(--madder)', gold = 'var(--saffron)';
  const bg = { poster: 'var(--saffron-soft)', book: 'var(--palm-soft)', cert: 'var(--madder-soft)', html: 'var(--paper-2)', ged: 'var(--paper-2)' }[kind];
  return (
    <span class="art" style={{ background: bg }}>
      <svg viewBox="0 0 74 74" aria-hidden="true">
        {kind === 'poster' && <g fill="none" stroke={ink} stroke-width="1.6">
          <rect x="14" y="10" width="46" height="54" rx="3" fill="#fff" />
          <path d="M37 22v6M24 34v-3h26v3M37 28v6M24 34v6M37 34v6M50 34v6" stroke={red} />
          <rect x="33" y="17" width="8" height="6" rx="1.5" fill={red} stroke="none" /><circle cx="24" cy="43" r="3" /><rect x="34" y="40" width="6" height="6" rx="1.5" /><circle cx="50" cy="43" r="3" />
          <path d="M22 54h30" stroke={gold} />
        </g>}
        {kind === 'book' && <g fill="none" stroke={ink} stroke-width="1.6">
          <path d="M14 18c8-4 15-4 23 1 8-5 15-5 23-1v40c-8-4-15-4-23 1-8-5-15-5-23-1z" fill="#fff" />
          <path d="M37 19v40M20 28h11M20 34h11M43 28h11M43 34h11M20 40h8" stroke-width="1.2" />
          <circle cx="48" cy="46" r="4" stroke={red} />
        </g>}
        {kind === 'cert' && <g fill="none" stroke={ink} stroke-width="1.6">
          <rect x="16" y="9" width="42" height="56" rx="2" fill="#fff" />
          <rect x="20" y="13" width="34" height="48" rx="1" stroke={gold} stroke-width="1" />
          <path d="M37 22v30" stroke={red} /><path d="M33 26l4-4 4 4-4 4zM33 37l4-4 4 4-4 4zM33 48l4-4 4 4-4 4z" fill="#fff" stroke={red} stroke-width="1.2" />
        </g>}
        {kind === 'html' && <g fill="none" stroke={ink} stroke-width="1.6">
          <rect x="20" y="10" width="34" height="54" rx="6" fill="#fff" /><path d="M32 15h10" />
          <path d="M37 26v5M29 37v-3h16v3M29 37v4M45 37v4" stroke={red} /><rect x="34" y="21" width="6" height="5" rx="1" /><circle cx="29" cy="44" r="2.5" /><circle cx="45" cy="44" r="2.5" />
          <path d="M28 54h18" stroke={gold} />
        </g>}
        {kind === 'ged' && <g fill="none" stroke={ink} stroke-width="1.6">
          <path d="M22 10h22l10 10v44H22z" fill="#fff" /><path d="M44 10v10h10" />
          <text x="38" y="45" text-anchor="middle" font-size="10" font-weight="700" fill={red} stroke="none" font-family="system-ui">GED</text>
        </g>}
      </svg>
    </span>
  );
};
function Card({ kind, title, text, onClick }) {
  return <button class="excard" onClick={onClick}><Art kind={kind} /><span><b>{title}</b><span>{text}</span></span></button>;
}

export function ExportScreen() {
  const s = state.value, ix = IX.value;
  const [htmlSheet, setHtmlSheet] = useState(false);
  const [photos, setPhotos] = useState(true);
  const empty = !Object.keys(ix.P).length;
  const days = s.lastBackup ? Math.floor((Date.now() - s.lastBackup) / 864e5) : -1;
  const changedSince = s.lastBackup && s.rev > s.lastBackupRev;
  const backup = () => runExport(t('making_backup'), async () => {
    const { exportExcel } = await import('../../export/excel.js');
    const { blob, photoCount } = await exportExcel(state.value, { photos });
    const ok = await deliverFile(blob, fileBase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx', { title: t('backup') });
    if (ok) { markBackup(); toast(photoCount ? t('backup_done_photos', { n: count(photoCount, 'photo') }) : t('backup_done')); }
  });
  const gedcom = () => runExport(t('making_file'), async () => {
    const { exportGedcom } = await import('../../export/gedcom.js');
    const text = exportGedcom(IX.value, state.value, { appVersion: __APP_VERSION__ });
    await deliverFile(new Blob([text], { type: 'text/plain' }), fileBase() + '.ged', { title: 'GEDCOM' });
  });
  return (
    <div class="screen">
      <TopBar title={t('tab_export')} actions={<button class="iconbtn" onClick={() => go('settings')} aria-label={t('settings')}><Icon name="gear" /></button>} />
      <div class="wrap">
        {empty && <div class="card pad muted">{t('export_empty')}</div>}
        <div class="section" style="margin-top:6px">
          <h2>{t('ex_print')}</h2>
          <div class="excards">
            <Card kind="poster" title={t('ex_poster')} text={t('ex_poster_p')} onClick={() => go('poster')} />
            <Card kind="book" title={t('ex_book')} text={t('ex_book_p')} onClick={() => go('book')} />
            <Card kind="cert" title={t('ex_cert')} text={t('ex_cert_p')} onClick={() => go('certificate')} />
          </div>
        </div>
        <div class="section">
          <h2>{t('ex_share')}</h2>
          <div class="excards">
            <Card kind="html" title={t('ex_html')} text={t('ex_html_p')} onClick={() => setHtmlSheet(true)} />
            <Card kind="ged" title={t('ex_ged')} text={t('ex_ged_p')} onClick={gedcom} />
          </div>
        </div>
        <div class="section">
          <h2>{t('ex_keep')}</h2>
          <div class="card pad">
            <p style="margin:0 0 4px;font-weight:600">{t('backup')}</p>
            <p class="small muted" style="margin:0 0 12px">{t('backup_p')}</p>
            <p class={'small ' + (days < 0 || days > 30 || changedSince ? 'err' : 'muted')} style="margin:0 0 10px">
              {days < 0 ? t('backup_never') : t('backup_last', { when: days === 0 ? t('today') : t('ago', { n: count(days, 'day') }) })}{changedSince ? ' — ' + t('backup_changed') : ''}
            </p>
            <div class="list" style="box-shadow:none;background:var(--paper-2);margin-bottom:12px"><Toggle checked={photos} onChange={setPhotos} label={t('backup_photos')} /></div>
            <div class="btns">
              <button class="btn" disabled={empty} onClick={backup}><Icon name="download" />{t('backup_make')}</button>
              <button class="btn ghost" onClick={() => pickAndRestore()}><Icon name="restore" />{t('restore')}</button>
            </div>
            <p class="hint">{t('restore_hint')}</p>
          </div>
        </div>
      </div>
      {htmlSheet && <HtmlSheet onClose={() => setHtmlSheet(false)} />}
    </div>
  );
}

function HtmlSheet({ onClose }) {
  const [o, setO] = useState({ photos: true, hideLiving: true, notes: true });
  const make = () => runExport(t('making_file'), async () => {
    const { exportHtml } = await import('../../export/html.js');
    const { blob } = await exportHtml(state.value, { ...o, dKids: state.value.view.dKids });
    onClose();
    await deliverFile(blob, fileBase() + '.html', { title: t('ex_html') });
  });
  return (
    <Sheet onClose={onClose} title={t('ex_html')}>
      <p class="small muted" style="margin-top:0">{t('html_about')}</p>
      <div class="list" style="box-shadow:none;background:var(--paper-2)">
        <Toggle checked={o.photos} onChange={v => setO({ ...o, photos: v })} label={t('opt_photos')} />
        <Toggle checked={o.hideLiving} onChange={v => setO({ ...o, hideLiving: v })} label={t('hide_living')} sub={t('hide_living_sub')} />
        <Toggle checked={o.notes} onChange={v => setO({ ...o, notes: v })} label={t('include_notes')} />
      </div>
      <p class="hint">{t('html_private')}</p>
      <button class="btn wide" style="margin-top:14px" onClick={make}><Icon name="share" />{t('make_share')}</button>
    </Sheet>
  );
}

/* ---------------- restore ---------------- */
export async function pickAndRestore() {
  let f;
  try { f = await pickDataFile(); } catch (e) { toast(e && e.code === 'TOO_LARGE' ? t('e_too_large') : t('e_read')); return; }
  if (f) await restoreFromFile(f);
}
/** a picked or opened file → the restore sheet (Excel backup, or a GEDCOM file from another program) */
export async function restoreFromFile(f) {
  if (!f || f.error) { toast(t('e_read')); return; }
  await runExport(t('reading_file'), async () => {
    const bytes = new Uint8Array(f.buffer);
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    try {
      if (isZip) {
        const { readExcel } = await import('../../export/excel.js');
        const r = await readExcel(f.buffer);
        restoreData.value = { ...r, name: f.name, kind: 'xlsx' };
      } else {
        const text = new TextDecoder('utf-8').decode(bytes);
        const { importGedcom } = await import('../../export/gedcom.js');
        const { sanitizeState } = await import('../../core/store.js');
        const g = importGedcom(text);
        const st = sanitizeState(g.raw);
        restoreData.value = { state: st, photoData: new Map(), counts: { people: Object.keys(st.people).length, unions: Object.keys(st.unions).length, photos: 0 }, name: f.name, kind: 'ged' };
      }
    } catch (e) {
      toast(e && e.code === 'no_people' ? t('e_no_people') : e && e.code === 'not_gedcom' ? t('e_not_gedcom') : t('e_bad_file'));
    }
  });
}
export function RestoreSheet() {
  const d = restoreData.value;
  if (!d) return null;
  const close = () => { restoreData.value = null; };
  const s = state.value;
  const have = Object.keys(s.people).length;
  const apply = async mode => {
    if (mode === 'replace' && have) {
      const ok = await confirmDialog({ title: t('replace_q'), text: t('replace_p', { n: count(have, 'person') }), ok: t('replace'), danger: true });
      if (!ok) return;
    }
    if (d.photoData && d.photoData.size) { const { storePhotos } = await import('../../export/excel.js'); await storePhotos(d.photoData); }
    if (mode === 'replace') replaceState(d.state);
    else update(x => { const m = mergeStates(x, d.state); Object.assign(x, { people: m.people, unions: m.unions, me: m.me, root: m.root }); x.settings = { ...x.settings, onboarded: true }; }, { undo: 'restore' });
    close();
    toast(t('restored', { n: count(d.counts.people, 'person') }), { ms: 5000 });
    tidyPhotos(state.value).catch(() => {});
    go('tree');
  };
  return (
    <Sheet onClose={close} title={t('restore')}>
      <p class="small muted" style="margin-top:0">{d.name}</p>
      <div class="card pad" style="box-shadow:none;background:var(--paper-2)">
        <p style="margin:0" class="naskh"><b>{t('file_has', { people: count(d.counts.people, 'person'), unions: count(d.counts.unions, 'marriage') })}</b></p>
        {d.counts.photos > 0 && <p class="small muted" style="margin:4px 0 0">{t('file_photos', { n: count(d.counts.photos, 'photo') })}</p>}
        {d.kind === 'ged' && <p class="small muted" style="margin:4px 0 0">{t('ged_note')}</p>}
      </div>
      {have > 0 ? (
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
          <button class="btn" onClick={() => apply('merge')}><Icon name="merge" />{t('merge_in')}</button>
          <button class="btn danger" onClick={() => apply('replace')}>{t('replace_all')}</button>
          <p class="hint" style="margin:0">{t('merge_hint')}</p>
        </div>
      ) : <button class="btn wide" style="margin-top:16px" onClick={() => apply('replace')}><Icon name="check" />{t('restore_now')}</button>}
    </Sheet>
  );
}

/** a full-screen "working on it" while a file is made */
export function BusyOverlay() {
  if (!busy.value) return null;
  return (
    <div class="dialog" style="z-index:85;background:rgba(20,15,12,.35)" role="status" aria-live="polite">
      <div class="box" style="display:flex;align-items:center;gap:14px;max-width:300px"><Spinner /><span>{busy.value}</span></div>
    </div>
  );
}
export { fileBase, isNative, num };
