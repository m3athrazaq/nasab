// The app's side of syncing with the user's private GitHub repository: the link (repository + key,
// kept on this device only, never in backups or exports), when to sync, and what the user is told.
// The rounds themselves are sync-engine.js; merging is sync-merge.js.
//   linked: on start · 15 s after the last check while the app is in view · 4 s after a change here ·
//   when the app comes back into view or online. Nothing is ever sent anywhere but api.github.com.
import { signal, effect } from '@preact/signals';
import { state, update } from './store.js';
import { idbGet, idbPut, idbDel } from './idb.js';
import { photoBlob, putPhotoBlob } from './photos.js';
import { github, GitHubError, REPO_RE, looksLikeToken } from './github.js';
import { syncRound, emptyMeta } from './sync-engine.js';
import { applyToState } from './sync-merge.js';
import { sharePayload, publishShare, readShareConfig, shareConfigText, shareCfgFrom, newShareKey, viewLink, SHARE_CONFIG, SHARE_PATH } from './share.js';
import { lang, digits, calPref, calBoth } from './i18n.js';
import { byName, newsText, commitText } from './sync-words.js';
import { isNative, isIOS } from './native.js';

const CFG_KEY = 'nasab.sync.v1', META_KEY = 'sync.meta';
const POLL = 15000, AFTER_EDIT = 4000, MIN_GAP = 8000;

/** what the screens show: linked?, busy, the last error's code, when it last synced */
export const syncStatus = signal({ linked: false, busy: false, error: '', last: 0, repo: '', device: '', photos: false });
/** what arrived from another device (the app shows it with Undo): { text, at } */
export const syncNews = signal(null);
/** the view link for relatives: { on, link, busy, error, at } */
export const shareStatus = signal({ on: false, link: '', busy: false, error: '', at: 0 });

let cfg = null;          // { repo, token, branch, device }
let meta = null;         // sync-engine's memory (the copies both sides had, the files seen)
let running = null, again = false, timer = 0, stopped = false, retryAt = 0, backoff = 0, lastRun = 0;
let syncedRev = -1, appliedRev = -1;

/** this device in the history and in the notices: the Android app or a phone's browser, an iPhone, a computer */
export function deviceKind() {
  if (isNative) return 'phone';
  if (isIOS) return 'iphone';
  return /Android|Mobile/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '') ? 'phone' : 'computer';
}
export { byName };

function setStatus(patch) { syncStatus.value = { ...syncStatus.value, ...patch }; }
function readCfg(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && REPO_RE.test(o.repo || '') && looksLikeToken(o.token) && typeof o.branch === 'string') return { repo: o.repo, token: o.token, branch: o.branch, device: String(o.device || deviceKind()).slice(0, 20) };
  } catch (e) { /* none */ }
  return null;
}
async function saveCfg() {
  const json = cfg ? JSON.stringify(cfg) : '';
  try { if (json) localStorage.setItem(CFG_KEY, json); else localStorage.removeItem(CFG_KEY); } catch (e) { /* IndexedDB keeps it */ }
  try { if (json) await idbPut('kv', 'sync.cfg', json); else await idbDel('kv', 'sync.cfg'); } catch (e) { /* localStorage keeps it */ }
}
const saveMeta = () => (meta ? idbPut('kv', META_KEY, JSON.stringify(meta)) : idbDel('kv', META_KEY)).catch(() => {});

/** started once, after the family is loaded */
export async function startSync() {
  let raw = null;
  try { raw = localStorage.getItem(CFG_KEY); } catch (e) { /* none */ }
  if (!raw) raw = await idbGet('kv', 'sync.cfg').catch(() => null);
  cfg = readCfg(raw);
  if (cfg) {
    try { meta = JSON.parse(await idbGet('kv', META_KEY)) || emptyMeta(); } catch (e) { meta = emptyMeta(); }
    if (!meta || typeof meta !== 'object' || !meta.fams) meta = emptyMeta();
    setStatus({ linked: true, repo: cfg.repo, device: cfg.device });
    if (meta.share) setShare({ on: true, link: viewLink(meta.share) });
  }
  // a change here → send it a few seconds later (several quick edits go together)
  effect(() => {
    const rev = state.value.rev;
    if (!cfg || rev === appliedRev || rev === syncedRev) return;
    schedule(AFTER_EDIT);
  });
  setInterval(() => { if (cfg && document.visibilityState === 'visible') syncNow(); }, POLL);
  document.addEventListener('visibilitychange', () => { if (cfg) syncNow(); });
  addEventListener('online', () => { if (cfg) { retryAt = 0; syncNow(); } });
  if (cfg) syncNow();
}
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), Math.max(0, ms));
}

/** one sync now (if one is running, another follows it). force: also after an error that stopped it */
export function syncNow({ force = false } = {}) {
  if (!cfg) return Promise.resolve(false);
  if (force) { stopped = false; retryAt = 0; }
  if (stopped || Date.now() < retryAt) return Promise.resolve(false);
  if (running) { again = true; return running; }
  // GitHub limits how fast files are written: rounds at least a few seconds apart
  const wait = lastRun + MIN_GAP - Date.now();
  if (wait > 0 && !force) { schedule(wait); return Promise.resolve(false); }
  running = run().finally(() => {
    running = null; lastRun = Date.now();
    if (again) { again = false; schedule(MIN_GAP); }
  });
  return running;
}

async function run() {
  setStatus({ busy: true });
  const gh = github({ repo: cfg.repo, token: cfg.token, branch: cfg.branch });
  const rev0 = state.value.rev, by = cfg.device, mine = meta;
  const env = {
    gh, meta: mine, by,
    dirty: rev0 !== syncedRev,
    getState: () => state.value,
    applyFamilies(apply, news) {
      const synced = new Set(Object.keys(mine.fams));
      update(s => { Object.assign(s, applyToState(s, apply, { synced })); }, { undo: 'sync' });
      appliedRev = state.value.rev;
      const text = newsText(news);
      if (text) syncNews.value = { text, at: Date.now() };
    },
    message: info => commitText(info, by),
    photos: {
      has: id => photoBlob(id).then(b => !!b, () => false),
      get: id => photoBlob(id).then(b => (b ? b.arrayBuffer().then(x => new Uint8Array(x)) : null), () => null),
      put: (id, bytes) => putPhotoBlob(id, new Blob([bytes], { type: 'image/jpeg' }))
    }
  };
  try {
    let r, i = 0;
    do {
      r = await syncRound(env, { trustRemote: i > 0 });
      if (r.stale) await new Promise(ok => setTimeout(ok, 2500));
      env.dirty = true;
    } while ((r.again || r.stale) && ++i < 4);
    // everything up to rev0 is in the repository now (later edits go in the next round)
    if (!r.again && !r.stale) syncedRev = Math.max(syncedRev, state.value.rev === appliedRev ? appliedRev : rev0);
    await saveMeta();
    backoff = 0;
    setStatus({ busy: false, error: '', last: Date.now(), photos: !!r.photosPending });
    await keepShareCurrent();
    if (r.photosPending) schedule(60000);
    else if (r.again || r.stale || (state.value.rev !== syncedRev && state.value.rev !== appliedRev)) schedule(AFTER_EDIT);
    return true;
  } catch (e) {
    const code = e instanceof GitHubError ? e.code : 'http';
    await saveMeta();
    setStatus({ busy: false, error: code });
    if (code === 'offline' || code === 'server' || code === 'http' || code === 'conflict') {
      backoff = Math.min(backoff ? backoff * 2 : 20000, 300000);
      retryAt = Date.now() + backoff; schedule(backoff);
    } else if (code === 'rate') { retryAt = e.retryAt || Date.now() + 600000; schedule(retryAt - Date.now()); }
    else stopped = true; // auth, notfound, denied: the link needs the user (a new key, the right repository)
    return false;
  }
}

/** link this device: checks the repository (it must be private) and the key, then the first sync */
export async function link({ repo, token, branch = '' }) {
  repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  token = String(token || '').trim();
  if (!REPO_RE.test(repo)) throw new GitHubError('notfound', 0, 'repository name');
  if (!looksLikeToken(token)) throw new GitHubError('auth', 0, 'key');
  const gh = github({ repo, token, branch });
  const info = await gh.info();
  if (!info.private) throw new GitHubError('public', 0, 'public repository');
  cfg = { repo: info.fullName || repo, token, branch: branch || info.branch, device: deviceKind() };
  meta = emptyMeta();
  syncedRev = -1; stopped = false; retryAt = 0; backoff = 0; lastRun = 0;
  await saveCfg(); await saveMeta();
  setStatus({ linked: true, repo: cfg.repo, device: cfg.device, error: '', last: 0 });
  await syncNow({ force: true });
  if (syncStatus.value.error) throw new GitHubError(syncStatus.value.error);
  return true;
}
/** stop syncing on this device (the family stays here; the repository is not touched) */
export async function unlink() {
  cfg = null; meta = null; stopped = false; retryAt = 0;
  clearTimeout(timer);
  await saveCfg(); await saveMeta();
  setStatus({ linked: false, busy: false, error: '', last: 0, repo: '', device: '', photos: false });
  shareStatus.value = { on: false, link: '', busy: false, error: '', at: 0 };
}
/** the link to hand to another device (QR code) — only from this screen, never stored anywhere else */
export const currentLink = () => (cfg ? { repo: cfg.repo, token: cfg.token, branch: cfg.branch } : null);

/* ---------- the view link for relatives (share.js) ---------- */
const setShare = patch => { shareStatus.value = { ...shareStatus.value, ...patch }; };
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
const photoBytes = id => photoBlob(id).then(b => (b ? b.arrayBuffer().then(x => new Uint8Array(x)) : null), () => null);

// every copy stays in the public repository's history: at most one new copy every two minutes (a burst
// of edits makes one copy, sent by a later round); and at each start, then every half hour, the copy there
// is compared with this one (another device a moment behind may have replaced it with an older one)
const SHARE_GAP = 120000, SHARE_RECHECK = 1800000;
let shareSentAt = 0, shareCheckedAt = 0;

/** after each sync: the encrypted copy in the public repository follows the family (only when it changed) */
async function keepShareCurrent(force = false) {
  const c = meta && meta.share;
  if (!c) { if (shareStatus.value.on) setShare({ on: false, link: '', error: '', busy: false }); return; }
  setShare({ on: true, link: viewLink(c) });
  try {
    const { text, missing } = await sharePayload(state.value, c.cfg, photoBytes);
    if (missing.length) return; // photos still arriving: another device's copy would have them
    const hash = await sha256(c.repo + '/' + c.key + '/' + text);
    const now = Date.now();
    if (!force && hash === meta.sharePub && now - shareCheckedAt < SHARE_RECHECK) return;
    if (!force && hash !== meta.sharePub && now - shareSentAt < SHARE_GAP) return; // a later round sends it
    setShare({ busy: true });
    const sh = github({ repo: c.repo, token: cfg.token });
    await sh.info();
    const r = await publishShare({ gh: sh, config: c, text, message: commitText({ kind: 'share' }, cfg.device) });
    if (r.sent) shareSentAt = Date.now();
    shareCheckedAt = Date.now();
    meta.sharePub = hash;
    await saveMeta();
    setShare({ busy: false, error: '', at: Date.now() });
  } catch (e) {
    setShare({ busy: false, error: (e && e.code) || 'http' });
  }
}
/** share.json written to the private repository (a new one, or a new key) */
async function writeShareConfig(c) {
  const gh = github({ repo: cfg.repo, token: cfg.token, branch: cfg.branch });
  const h = await gh.head('');
  const cur = h.empty ? '' : (await gh.tree(h.sha)).files.get(SHARE_CONFIG) || '';
  const r = await gh.put(SHARE_CONFIG, new TextEncoder().encode(shareConfigText(c)), commitText({ kind: 'sharecfg' }, cfg.device), cur);
  meta.share = readShareConfig(shareConfigText(c));
  meta.shareSha = r.sha;
  meta.head = ''; meta.files = null; // our own write: the next round reads the list again
  meta.sharePub = '';
  await saveMeta();
}
/** make the view link: repo = a public repository the access key can write to */
export async function createShare(repo) {
  if (!cfg) throw new GitHubError('auth');
  repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!REPO_RE.test(repo)) throw new GitHubError('notfound', 0, 'repository name');
  const sh = github({ repo, token: cfg.token });
  const info = await sh.info();
  if (info.private) throw new GitHubError('private', 0, 'the view page reads it without a key');
  const s = state.value.settings;
  await writeShareConfig({ repo: info.fullName || repo, key: newShareKey(), path: SHARE_PATH, cfg: shareCfgFrom({ ...s, lang: lang.value, digits: digits.value, cal: calPref.value, both: calBoth.value }) });
  await keepShareCurrent(true);
  if (shareStatus.value.error) throw new GitHubError(shareStatus.value.error);
  return shareStatus.value.link;
}
/** a new key: the old link stops opening the tree */
export async function renewShare() {
  if (!cfg || !meta || !meta.share) return '';
  await writeShareConfig({ ...meta.share, key: newShareKey() });
  await keepShareCurrent(true);
  if (shareStatus.value.error) throw new GitHubError(shareStatus.value.error);
  return shareStatus.value.link;
}
/** the public repository suggested for a new link: the same owner as the private one */
export const suggestedShareRepo = () => (cfg ? cfg.repo.split('/')[0] + '/nasab-share' : '');
