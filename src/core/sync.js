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
import { byName, newsText, commitText } from './sync-words.js';
import { isNative, isIOS } from './native.js';

const CFG_KEY = 'nasab.sync.v1', META_KEY = 'sync.meta';
const POLL = 15000, AFTER_EDIT = 4000, MIN_GAP = 8000;

/** what the screens show: linked?, busy, the last error's code, when it last synced */
export const syncStatus = signal({ linked: false, busy: false, error: '', last: 0, repo: '', device: '', photos: false });
/** what arrived from another device (the app shows it with Undo): { text, at } */
export const syncNews = signal(null);

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
}
/** the link to hand to another device (QR code) — only from this screen, never stored anywhere else */
export const currentLink = () => (cfg ? { repo: cfg.repo, token: cfg.token, branch: cfg.branch } : null);
