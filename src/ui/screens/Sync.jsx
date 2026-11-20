// "Sync between devices": link this device to the user's private GitHub repository — the first device
// with the repository's name and a key, the others by scanning the QR code the first one shows — then
// see when it last synced, sync now, show the code again, or unlink. Also the two links for relatives:
// the app link (the app itself on their device, linked to this tree: they edit, export, print) and the
// view-only link; and, on a relative's device, what opening the app link does (JoinSheet).
import { useState, useEffect, useRef } from 'preact/hooks';
import { signal, effect } from '@preact/signals';
import { syncStatus, syncReady, syncNews, syncNow, link, unlink, currentLink, byName, shareStatus, createShare, renewShare, suggestedShareRepo, familyStatus, makeFamilyLink, forgetFamilyLink } from '../../core/sync.js';
import { linkCode, readLinkCode } from '../../core/github.js';
import { state, update, undo, undoInfo, defaultState, clearUndo } from '../../core/store.js';
import { familiesOf } from '../../core/sync-merge.js';
import { go } from '../router.js';
import { isNative, plug } from '../../core/native.js';
import { t, lang, digits } from '../../core/i18n.js';
import { Sheet, toast, confirmDialog, Spinner } from '../kit.jsx';
import { Icon } from '../icons.jsx';
import { loadScript } from '../../export/engine.js';

export const syncSheet = signal(false);
/** a relative's app link opened on this device: { repo, token, branch } (or { bad: true }) */
export const joinCode = signal(null);
const loadQr = () => loadScript('vendor/qr.js', __QR_SRI__, 'NasabQR');
const KEY_PAGE = 'https://github.com/settings/personal-access-tokens/new';
const KEY_LIST = 'https://github.com/settings/personal-access-tokens';
const NEW_REPO = 'https://github.com/new';

/** "just now", "today 14:05", or the date */
export function whenText(ts) {
  if (!ts) return t('sync_never');
  const d = new Date(ts), now = Date.now();
  if (now - ts < 60000) return t('sync_just_now');
  const loc = lang.value === 'ar' ? (digits.value === 'arab' ? 'ar-KW-u-nu-arab' : 'ar-KW-u-nu-latn') : 'en-GB';
  const time = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  if (new Date(now).toDateString() === d.toDateString()) return t('sync_today', { time });
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ' ' + time;
}
/** the line under "Sync between devices" in the settings */
export function syncLine() {
  const s = syncStatus.value;
  if (!s.linked) return t('sync_row_off_sub');
  if (s.busy) return t('sync_busy');
  if (s.error) return errText(s.error);
  return t('sync_last', { when: whenText(s.last) });
}

/** what arrived from another device, with Undo; a link that stopped working */
export function useSyncNotices() {
  useEffect(() => {
    let lastNews = 0, lastErr = '';
    const stop = effect(() => {
      const n = syncNews.value;
      if (n && n.at !== lastNews) {
        lastNews = n.at;
        toast(n.text, { action: t('undo'), onAction: () => { if (undoInfo.value && undoInfo.value.label === 'sync') undo(); }, ms: 9000 });
      }
      const e = syncStatus.value.error;
      if (e !== lastErr) {
        lastErr = e;
        if (['auth', 'notfound', 'denied'].includes(e)) toast(t('sync_stopped', { why: errText(e) }), { action: t('sync_open'), onAction: () => { syncSheet.value = true; }, ms: 9000 });
      }
    });
    return stop;
  }, []);
}

export function SyncSheet() {
  if (!syncSheet.value) return null;
  return <SyncPanel onClose={() => { syncSheet.value = false; }} />;
}

function SyncPanel({ onClose }) {
  const s = syncStatus.value;
  const [mode, setMode] = useState('');      // '', 'key', 'paste', 'scan'
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const doLink = async args => {
    setBusy(true); setErr('');
    try {
      await link(args);
      toast(t('sync_linked'));
      setMode('');
      // the first device linked on a computer: the code for the phone, right away
      if (!isNative) setShowCode(true);
    } catch (e) { setErr((e && e.code) || 'http'); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} title={t('sync_title')}>
      {s.linked ? <Linked s={s} showCode={showCode} setShowCode={setShowCode} onClose={onClose} />
        : mode === 'scan' ? <Scanner onCode={c => doLink(c)} onPaste={() => setMode('paste')} onCancel={() => setMode('')} busy={busy} err={err} />
        : <>
          <p class="small muted" style="margin-top:0;line-height:1.75">{t('sync_about')}</p>
          {mode === '' && <div class="list" style="margin-top:12px">
            {isNative && <Opt icon="qr" title={t('sync_scan')} sub={t('sync_scan_sub')} onClick={() => setMode('scan')} />}
            <Opt icon="laptop" title={t('sync_enter')} sub={t('sync_enter_sub')} onClick={() => setMode('key')} />
            {!isNative && <Opt icon="qr" title={t('sync_scan')} sub={t('sync_scan_sub')} onClick={() => setMode('scan')} />}
            <Opt icon="copy" title={t('sync_paste')} sub={t('sync_paste_sub')} onClick={() => setMode('paste')} />
          </div>}
          {mode === 'key' && <KeyForm busy={busy} err={err} onLink={doLink} onBack={() => { setMode(''); setErr(''); }} />}
          {mode === 'paste' && <PasteForm busy={busy} err={err} onLink={doLink} onJoin={c => { onClose(); joinCode.value = c; }} onBack={() => { setMode(''); setErr(''); }} />}
        </>}
    </Sheet>
  );
}

const Opt = ({ icon, title, sub, onClick }) => (
  <button class="row" onClick={onClick}><span class="famdot"><Icon name={icon} /></span><span class="grow"><span class="title">{title}</span><span class="meta wrap2">{sub}</span></span><Icon name="chevron" class="chev" /></button>
);
const errText = code => (syncStatus.value.joined && ['auth', 'notfound', 'denied'].includes(code) ? t('join_e_stopped') : t('sync_e_' + code));
const ErrLine = ({ code }) => (code ? <p class="hint err" role="alert" style="line-height:1.7">{errText(code)}</p> : null);
const ext = (href, text) => (isNative ? <span dir="ltr" class="code">{href.replace(/^https:\/\//, '')}</span> : <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr">{text || href.replace(/^https:\/\//, '')}</a>);

function KeyForm({ busy, err, onLink, onBack }) {
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const ok = /^\S+\/\S+$/.test(repo.trim()) && token.trim().length >= 20;
  return (
    <form class="syncform" onSubmit={e => { e.preventDefault(); if (ok && !busy) onLink({ repo, token }); }}>
      <label class="field"><span class="lab">{t('sync_repo')}</span>
        <input class="input" dir="ltr" name="repo" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder={t('sync_repo_ph')} value={repo} onInput={e => setRepo(e.currentTarget.value)} />
      </label>
      <p class="hint">{t('sync_repo_hint')} {ext(NEW_REPO, t('sync_repo_new'))}</p>
      <label class="field"><span class="lab">{t('sync_key')}</span>
        <input class="input" dir="ltr" name="key" type="password" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder="github_pat_…" value={token} onInput={e => setToken(e.currentTarget.value)} />
      </label>
      <details class="howto">
        <summary>{t('sync_how')}</summary>
        <ol>
          <li>{t('sync_how_1')} {ext(KEY_PAGE)}</li>
          <li>{t('sync_how_2')}</li>
          <li>{t('sync_how_3')}</li>
          <li>{t('sync_how_4')}</li>
          <li>{t('sync_how_5')}</li>
        </ol>
      </details>
      <ErrLine code={err} />
      <button class="btn wide" style="margin-top:14px" type="submit" disabled={!ok || busy}>{busy ? <Spinner size={20} /> : <Icon name="link" />}{t('sync_link')}</button>
      <button class="linkbtn" type="button" style="margin-top:6px" onClick={onBack}>{t('back')}</button>
    </form>
  );
}

function PasteForm({ busy, err, onLink, onJoin, onBack }) {
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const submit = () => {
    const c = readLinkCode(text);
    if (!c) { setBad(true); return; }
    setBad(false);
    if (/^\s*https?:/i.test(text)) onJoin(c); else onLink(c); // the app link from a relative: asks for a name
  };
  return (
    <form class="syncform" onSubmit={e => { e.preventDefault(); if (!busy) submit(); }}>
      <label class="field"><span class="lab">{t('sync_code')}</span>
        <textarea class="input" dir="ltr" name="code" rows="3" style="min-height:84px;font-size:13px;word-break:break-all" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder="nasab1:… / https://…" value={text} onInput={e => { setText(e.currentTarget.value); setBad(false); }} />
      </label>
      {bad ? <ErrLine code="code" /> : <ErrLine code={err} />}
      <button class="btn wide" style="margin-top:14px" type="submit" disabled={!text.trim() || busy}>{busy ? <Spinner size={20} /> : <Icon name="link" />}{t('sync_link')}</button>
      <button class="linkbtn" type="button" style="margin-top:6px" onClick={onBack}>{t('back')}</button>
    </form>
  );
}

function Linked({ s, showCode, setShowCode, onClose }) {
  const state = s.busy ? 'busy' : s.error ? 'err' : 'ok';
  return (
    <>
      <div class={'syncstate ' + state}>
        <span class="famdot">{s.busy ? <Spinner size={20} /> : <Icon name={s.error ? 'info' : 'check'} />}</span>
        <span class="grow">
          <span class="title">{s.repo}</span>
          <span class="meta">{t('sync_this', { who: byName(s.device) })}</span>
          <span class="meta">{s.busy ? t('sync_busy') : t('sync_last', { when: whenText(s.last) })}</span>
        </span>
      </div>
      {s.error && <ErrLine code={s.error} />}
      {s.photos && !s.error && <p class="hint">{t('sync_photos')}</p>}
      <div class="btnrow" style="margin-top:14px">
        <button class="btn" disabled={s.busy} onClick={() => syncNow({ force: true })}><Icon name="sync" />{t('sync_now')}</button>
        <button class="btn ghost" aria-expanded={showCode ? 'true' : 'false'} onClick={() => setShowCode(!showCode)}><Icon name="qr" />{t('sync_other')}</button>
      </div>
      {showCode && <LinkCode />}
      {!s.joined && <FamilyBlock />}
      {!s.joined && <ShareBlock />}
      <p class="hint" style="margin-top:16px;line-height:1.7">{s.joined ? t('join_note') : t('sync_key_note')}</p>
      <button class="linkbtn err" style="margin-top:6px" onClick={async () => {
        const ok = await confirmDialog({ title: t('sync_unlink_q'), text: t('sync_unlink_p'), ok: t('sync_unlink'), danger: true });
        if (!ok) return;
        await unlink();
        toast(t('sync_unlinked'));
        onClose();
      }}>{t('sync_unlink')}</button>
    </>
  );
}

/** the QR code another device scans (it holds the key: shown only here, on request) */
function LinkCode() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const l = currentLink();
  const code = l ? linkCode(l) : '';
  useEffect(() => {
    let live = true;
    loadQr().then(Q => { if (live) setRows(Q.matrix(code)); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [code]);
  if (!code) return null;
  const n = rows ? rows.length : 0, q = 4;
  let d = '';
  if (rows) rows.forEach((row, y) => { for (let x = 0; x < n; x++) if (row[x] === '1') d += `M${x + q} ${y + q}h1v1h-1z`; });
  return (
    <div class="linkcode">
      <p class="small" style="margin:0 0 10px;line-height:1.7">{t('sync_qr_p')}</p>
      <div class="qr">
        {rows ? <svg viewBox={`0 0 ${n + 2 * q} ${n + 2 * q}`} role="img" aria-label={t('sync_code')} shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff" /><path d={d} fill="#000" /></svg>
          : failed ? <p class="hint err">{t('sync_e_qr')}</p> : <Spinner />}
      </div>
      <p class="hint err" style="text-align:center">{t('sync_qr_warn')}</p>
      <button class="btn ghost sm" style="margin:6px auto 0;display:flex" onClick={async () => {
        try { await navigator.clipboard.writeText(code); toast(t('sync_copied')); } catch (e) { toast(t('sync_e_copy')); }
      }}><Icon name="copy" />{t('sync_copy')}</button>
    </div>
  );
}

/** the camera, looking for a link code */
function Scanner({ onCode, onPaste, onCancel, busy, err }) {
  const video = useRef();
  const [camErr, setCamErr] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let stream = null, stop = false, timer = 0;
    (async () => {
      try {
        const Q = await loadQr();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stop) return;
        const v = video.current;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (stop) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
            c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const text = Q.read(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            if (text) {
              const code = readLinkCode(text);
              if (code) { stop = true; stream.getTracks().forEach(tr => tr.stop()); onCode(code); return; }
              setBad(true);
            }
          }
          timer = setTimeout(tick, 160);
        };
        tick();
      } catch (e) { setCamErr(true); }
    })();
    return () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(tr => tr.stop()); };
  }, []);
  return (
    <div class="scanner">
      {busy ? <div class="scanbusy"><Spinner /><p class="small muted">{t('sync_linking')}</p></div>
        : camErr ? <ErrLine code="camera" />
        : <div class="scanview"><video ref={video} playsInline muted /><span class="scanframe" aria-hidden="true" /></div>}
      {!busy && !camErr && <p class="small muted" style="text-align:center;margin:10px 0 0">{t('sync_scan_hint')}</p>}
      {bad && !busy && <ErrLine code="code" />}
      <ErrLine code={err} />
      <div class="btnrow" style="margin-top:12px">
        <button class="btn ghost" onClick={onPaste}><Icon name="copy" />{t('sync_paste')}</button>
        <button class="btn ghost" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}

/** a link copied, or handed to the system's share sheet (WhatsApp, Messages, Mail…): Android's in the
 *  app, the browser's elsewhere; copied when there is none */
async function copyLink(url, done) {
  try { await navigator.clipboard.writeText(url); toast(done); } catch (e) { toast(t('sync_e_copy')); }
}
async function sendLink(url, title, done) {
  const native = isNative && plug('Share');
  if (native) { try { await native.share({ title, url, dialogTitle: t('share_send') }); return; } catch (e) { if (/cancel/i.test(String((e && e.message) || ''))) return; } }
  else if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  copyLink(url, done);
}

/** the app link for relatives: the app itself on their device, linked to this tree (they edit, add,
 *  export, print; their changes arrive with their names). Made with a key kept for them (deleting it on
 *  GitHub stops the link everywhere, and this device stays linked) or with this device's key. */
function FamilyBlock() {
  const fs = familyStatus.value;
  const [form, setForm] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [how, setHow] = useState(false);
  const make = async token => {
    setBusy(true); setErr('');
    try { await makeFamilyLink(token); toast(t('fam_made')); setForm(false); setKey(''); }
    catch (e) { setErr((e && e.code) || 'http'); }
    setBusy(false);
  };
  return (
    <div class="sharebox">
      <h3>{t('fam_title')}</h3>
      <p class="hint" style="line-height:1.7;margin-top:2px">{t('fam_about')}</p>
      <p class="hint err" style="line-height:1.7;margin-top:4px">{t('fam_warn')}</p>
      {fs.link && !form ? <>
        <div class="btnrow" style="margin-top:10px">
          <button class="btn" onClick={() => sendLink(fs.link, t('fam_title'), t('share_copied'))}><Icon name="share" />{t('share_send')}</button>
          <button class="btn ghost" onClick={() => copyLink(fs.link, t('share_copied'))}><Icon name="copy" />{t('share_copy')}</button>
        </div>
        <div class="linkrow">
          <button class="linkbtn" aria-expanded={how ? 'true' : 'false'} onClick={() => setHow(!how)}>{t('fam_stop')}</button>
          <button class="linkbtn" onClick={() => { setForm(true); setErr(''); }}>{t('fam_replace')}</button>
        </div>
        {how && <p class="hint" style="line-height:1.7">{fs.own ? t('fam_stop_own') : t('fam_stop_p')} {ext(KEY_LIST)}</p>}
      </> : !form ? <button class="btn ghost wide" style="margin-top:10px" onClick={() => setForm(true)}><Icon name="link" />{t('fam_make')}</button>
      : <form class="syncform" onSubmit={e => { e.preventDefault(); if (!busy && key.trim()) make(key); }}>
        <label class="field"><span class="lab">{t('fam_key')}</span>
          <input class="input" dir="ltr" name="family-key" type="password" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder="github_pat_…" value={key} onInput={e => setKey(e.currentTarget.value)} />
        </label>
        <p class="hint" style="line-height:1.7">{t('fam_key_hint')} {ext(KEY_PAGE)}</p>
        {err && <ErrLine code={err} />}
        <button class="btn wide" style="margin-top:12px" type="submit" disabled={busy || key.trim().length < 20}>{busy ? <Spinner size={20} /> : <Icon name="link" />}{t('fam_create')}</button>
        <div class="linkrow">
          <button class="linkbtn" type="button" disabled={busy} onClick={async () => {
            const ok = await confirmDialog({ title: t('fam_own_q'), text: t('fam_own_p'), ok: t('fam_own_ok') });
            if (ok) make('');
          }}>{t('fam_own')}</button>
          <button class="linkbtn" type="button" onClick={() => { setForm(false); setErr(''); setKey(''); }}>{t('cancel')}</button>
          {fs.link && <button class="linkbtn err" type="button" onClick={async () => { await forgetFamilyLink(); setForm(false); }}>{t('fam_forget')}</button>}
        </div>
      </form>}
    </div>
  );
}

/** a relative opened the app link (or pasted it): whose tree, a name for their changes, then linked */
export function JoinSheet() {
  const c = joinCode.value;
  if (!c) return null;
  return <JoinPanel c={c} onClose={() => { joinCode.value = null; }} />;
}
// families on this device that are someone's own (not the example family, not empty)
const ownFamilies = s => [...familiesOf(s).values()].filter(f => Object.keys(f.people).some(id => !/^demo/.test(id))).length;
function JoinPanel({ c, onClose }) {
  const s = syncStatus.value;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const own = ownFamilies(state.value);
  const open = async () => {
    setBusy(true); setErr('');
    try {
      // only the example family here (or nothing): it goes, so that only the shared tree is sent
      if ([...familiesOf(state.value).values()].some(f => Object.keys(f.people).length)) {
        update(x => { Object.assign(x, defaultState(), { settings: x.settings }); });
        clearUndo();
      }
      await link({ repo: c.repo, token: c.token, branch: c.branch, device: name, joined: true });
      onClose();
      go('tree', true);
      toast(t('join_done'));
    } catch (e) { setErr((e && e.code) || 'http'); }
    setBusy(false);
  };
  const body = c.bad ? <p class="hint err" role="alert" style="line-height:1.7">{t('join_bad')}</p>
    : !syncReady.value ? <div style="display:flex;justify-content:center;padding:18px"><Spinner /></div>
    : s.linked && s.repo.toLowerCase() === c.repo.toLowerCase() ? <p class="small" style="line-height:1.7">{t('join_same')}</p>
    : s.linked ? <p class="hint err" role="alert" style="line-height:1.7">{t('join_other', { repo: s.repo })}</p>
    : own ? <p class="hint err" role="alert" style="line-height:1.7">{t('join_own')}</p>
    : null;
  return (
    <Sheet onClose={busy ? () => {} : onClose} title={t('join_title')}>
      {body ? <>
        {body}
        <button class="btn ghost wide" style="margin-top:14px" onClick={onClose}>{t('ok')}</button>
      </> : <form class="syncform" onSubmit={e => { e.preventDefault(); if (!busy) open(); }}>
        <p class="small" style="margin-top:0;line-height:1.75">{t('join_p')}</p>
        <p class="small" style="margin:4px 0 0"><span dir="ltr" class="code">{c.repo}</span></p>
        <label class="field" style="margin-top:14px"><span class="lab">{t('join_name')}</span>
          <input class="input" name="join-name" autoComplete="name" maxLength={20} placeholder={t('join_name_ph')} value={name} onInput={e => setName(e.currentTarget.value)} />
        </label>
        <p class="hint">{t('join_name_hint')}</p>
        {err && <ErrLine code={err} />}
        <button class="btn wide" style="margin-top:14px" type="submit" disabled={busy}>{busy ? <Spinner size={20} /> : <Icon name="tree" />}{busy ? t('sync_linking') : t('join_go')}</button>
        <button class="linkbtn" type="button" style="margin-top:6px" disabled={busy} onClick={onClose}>{t('join_later')}</button>
      </form>}
    </Sheet>
  );
}

const ShareErr = ({ code }) => <p class="hint err" role="alert" style="line-height:1.7">{t('share_e_' + code)}</p>;
/** the view link for relatives: made once (a public repository for the encrypted copy), then copied or
 *  sent; a new link makes the old one stop opening the tree */
function ShareBlock() {
  const sh = shareStatus.value;
  const [form, setForm] = useState(false);
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async fn => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr((e && e.code) || 'http'); } setBusy(false); };
  const copy = () => copyLink(sh.link, t('share_copied'));
  const send = () => sendLink(sh.link, t('share_title'), t('share_copied'));
  return (
    <div class="sharebox">
      <h3>{t('share_title')}</h3>
      {sh.on ? <>
        <p class="hint" style="line-height:1.7;margin-top:2px">{t('share_about')}</p>
        <p class={'small ' + (sh.error ? 'err' : 'muted')} style="margin:6px 0 0">{sh.busy ? t('share_busy') : sh.error ? t('share_e_' + sh.error) : sh.at ? t('share_ok', { when: whenText(sh.at) }) : t('share_ready')}</p>
        <div class="btnrow" style="margin-top:10px">
          <button class="btn" onClick={send}><Icon name="share" />{t('share_send')}</button>
          <button class="btn ghost" onClick={copy}><Icon name="copy" />{t('share_copy')}</button>
        </div>
        <button class="linkbtn" style="margin-top:6px" disabled={busy} onClick={async () => {
          const ok = await confirmDialog({ title: t('share_new_q'), text: t('share_new_p'), ok: t('share_new'), danger: true });
          if (ok) run(async () => { await renewShare(); toast(t('share_renewed')); });
        }}>{busy ? t('share_busy') : t('share_new')}</button>
      </> : !form ? <>
        <p class="hint" style="line-height:1.7;margin-top:2px">{t('share_about')}</p>
        <button class="btn ghost wide" style="margin-top:10px" onClick={() => { setRepo(suggestedShareRepo()); setForm(true); }}><Icon name="link" />{t('share_make')}</button>
      </> : <form class="syncform" onSubmit={e => { e.preventDefault(); if (!busy) run(async () => { await createShare(repo); toast(t('share_made')); setForm(false); }); }}>
        <p class="hint" style="line-height:1.7;margin-top:2px">{t('share_make_p')}</p>
        <label class="field"><span class="lab">{t('share_repo')}</span>
          <input class="input" dir="ltr" name="share-repo" autoComplete="off" autoCapitalize="off" spellcheck={false} value={repo} onInput={e => setRepo(e.currentTarget.value)} />
        </label>
        {err && <ShareErr code={err} />}
        <button class="btn wide" style="margin-top:12px" type="submit" disabled={busy || !/\S+\/\S+/.test(repo)}>{busy ? <Spinner size={20} /> : <Icon name="link" />}{t('share_make')}</button>
        <button class="linkbtn" type="button" style="margin-top:6px" onClick={() => { setForm(false); setErr(''); }}>{t('cancel')}</button>
      </form>}
      {sh.on && err && <ShareErr code={err} />}
    </div>
  );
}
