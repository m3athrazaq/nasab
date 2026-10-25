// The app's data: its shape, validation (everything read from storage or from a file is untrusted),
// saving on the device, undo, and change notifications.
import { signal } from '@preact/signals';
import { uid, finite, has } from './util.js';
import { cleanD } from './dates.js';
import { cleanName } from './names.js';
import { idbGet, idbPut } from './idb.js';
import { isNative, readNativeState, writeNativeState } from './native.js';

export const STATE_VERSION = 1;
export const LIMITS = { people: 20000, unions: 20000, text: 120, name: 80, note: 6000, collapsed: 5000 };
export const LS_KEY = 'nasab.state.v1';
export const ID_RE = /^[a-z0-9]{4,32}$/;
export const VIEW_MODES = ['v', 'h', 'r', 'f'];

export function defaultSettings() {
  return {
    lang: 'ar', theme: 'auto', digits: 'latn',
    cal: 'entered', both: true,           // dates: the calendar they were entered in first, the other in brackets
    style: 'bin', depth: 4,               // full names: "خالد بن راشد بن …", four names
    mercy: true,                          // "رحمه الله" after the names of the deceased
    onboarded: false, lock: '', lockSalt: '', lockLen: 0   // the PIN lock: salted hash and the PIN's length
  };
}
export function defaultView() {
  return { mode: 'v', spouses: false, dKids: false, photos: true, dates: true, colors: true, bands: true, collapsed: [] };
}
export function defaultState() {
  return {
    v: STATE_VERSION, rev: 0, created: Date.now(), updated: Date.now(),
    settings: defaultSettings(), me: '', root: '', view: defaultView(),
    people: {}, unions: {}, poster: {}, lastBackup: 0, lastBackupRev: 0
  };
}

/* ---------------- validation ---------------- */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const str = (v, max = LIMITS.text) => (v == null ? '' : String(v)).replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const note = v => (v == null ? '' : String(v)).replace(CTRL, '').replace(/\r\n?/g, '\n').trim().slice(0, LIMITS.note);
const bool = v => v === true || v === 1 || v === 'true';
const oneOf = (v, list, d = '') => (list.includes(v) ? v : d);
const int = (v, min, max, d = 0) => { const n = Math.round(+v); return isFinite(n) && n >= min && n <= max ? n : d; };
const tel = v => str(v, 40).replace(/[^\d+\-() ]/g, '');
const mail = v => { const s = str(v, 120); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };

export const PERSON_FIELDS = ['n', 'g', 'fam', 'kun', 'laq', 'nick', 'b', 'bp', 'd', 'dp', 'dead', 'job', 'edu', 'res', 'tel', 'mail', 'note', 'photo', 'pu', 'ord'];
export function sPerson(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    id: p.id,
    n: cleanName(str(p.n, LIMITS.name)), g: oneOf(p.g, ['m', 'f'], ''),
    fam: cleanName(str(p.fam, LIMITS.name)), kun: cleanName(str(p.kun, LIMITS.name)), laq: str(p.laq, LIMITS.name), nick: str(p.nick, LIMITS.name),
    b: cleanD(p.b), bp: str(p.bp), d: cleanD(p.d), dp: str(p.dp), dead: bool(p.dead) || !!cleanD(p.d),
    job: str(p.job), edu: str(p.edu), res: str(p.res), tel: tel(p.tel), mail: mail(p.mail), note: note(p.note),
    photo: typeof p.photo === 'string' && ID_RE.test(p.photo) ? p.photo : '',
    pu: p.pu == null ? '' : String(p.pu).trim().slice(0, 40), ord: int(p.ord, 0, 999, 0),
    at: finite(+p.at, Date.now()), upd: finite(+p.upd, Date.now())
  };
}
export function sUnion(u) {
  if (!u || typeof u !== 'object') return null;
  return {
    id: u.id,
    h: u.h == null ? '' : String(u.h).trim().slice(0, 40), w: u.w == null ? '' : String(u.w).trim().slice(0, 40),
    st: oneOf(u.st, ['m', 'd'], 'm'), md: cleanD(u.md), ed: cleanD(u.ed), note: note(u.note).slice(0, 1000),
    ord: int(u.ord, 0, 99, 0), at: finite(+u.at, Date.now())
  };
}
const uniqueId = (v, used) => { const s = v == null ? '' : String(v).trim(); const id = ID_RE.test(s) && !used.has(s) ? s : uid(); used.add(id); return id; };

/**
 * turns anything (stored data, an import) into a valid state; never throws.
 * Ids that are not in the app's own format (e.g. "1", "2" typed in Excel) get new ids, and every
 * reference written with the old one follows.
 */
export function sanitizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw.settings || {};
  const ds = defaultSettings();
  d.settings = {
    lang: oneOf(s.lang, ['ar', 'en'], 'ar'), theme: oneOf(s.theme, ['auto', 'light', 'dark'], 'auto'), digits: oneOf(s.digits, ['latn', 'arab'], 'latn'),
    cal: oneOf(s.cal, ['entered', 'g', 'h'], 'entered'), both: s.both == null ? ds.both : bool(s.both),
    style: oneOf(s.style, ['bin', 'plain'], 'bin'), depth: s.depth == null ? ds.depth : int(s.depth, 0, 12, ds.depth),
    mercy: s.mercy == null ? ds.mercy : bool(s.mercy), onboarded: bool(s.onboarded),
    lock: typeof s.lock === 'string' && /^[a-f0-9]{64}$/.test(s.lock) ? s.lock : '',
    lockSalt: typeof s.lockSalt === 'string' && /^[a-f0-9]{16,64}$/.test(s.lockSalt) ? s.lockSalt : '',
    lockLen: int(s.lockLen, 4, 8, 0)
  };
  if (!d.settings.lockSalt || !d.settings.lock) { d.settings.lock = ''; d.settings.lockSalt = ''; d.settings.lockLen = 0; }

  // people
  const pAlias = new Map(), pUsed = new Set();
  const rawPeople = raw.people && typeof raw.people === 'object' ? (Array.isArray(raw.people) ? raw.people : Object.entries(raw.people).map(([k, v]) => ({ ...(v || {}), id: v && v.id != null ? v.id : k }))) : [];
  for (const rp of rawPeople.slice(0, LIMITS.people)) {
    const p = sPerson(rp);
    if (!p) continue;
    const given = rp.id == null ? '' : String(rp.id).trim();
    p.id = uniqueId(given, pUsed);
    if (given && !pAlias.has(given)) pAlias.set(given, p.id);
    d.people[p.id] = p;
  }
  const P = d.people;
  const pid = v => { if (v == null || v === '') return ''; const k = String(v).trim(); const id = pAlias.get(k) || k; return P[id] ? id : ''; };

  // unions
  const uAlias = new Map(), uUsed = new Set();
  const rawUnions = raw.unions && typeof raw.unions === 'object' ? (Array.isArray(raw.unions) ? raw.unions : Object.entries(raw.unions).map(([k, v]) => ({ ...(v || {}), id: v && v.id != null ? v.id : k }))) : [];
  for (const ru of rawUnions.slice(0, LIMITS.unions)) {
    const u = sUnion(ru);
    if (!u) continue;
    const given = ru.id == null ? '' : String(ru.id).trim();
    u.id = uniqueId(given, uUsed);
    if (given && !uAlias.has(given)) uAlias.set(given, u.id);
    u.h = pid(u.h); u.w = pid(u.w);
    if (u.h && u.h === u.w) u.w = '';
    d.unions[u.id] = u;
  }
  const U = d.unions;
  for (const id in P) {
    const p = P[id];
    const k = p.pu ? uAlias.get(p.pu) || p.pu : '';
    p.pu = k && U[k] && U[k].h !== id && U[k].w !== id ? k : '';
  }
  // one union per couple: a second record of the same couple joins the first
  const byCouple = new Map();
  for (const id of Object.keys(U)) {
    const u = U[id];
    if (!u.h || !u.w) continue;
    const key = u.h + '|' + u.w;
    if (!byCouple.has(key)) { byCouple.set(key, id); continue; }
    const keep = byCouple.get(key);
    for (const pid2 in P) if (P[pid2].pu === id) P[pid2].pu = keep;
    delete U[id];
  }
  breakLoops(d);
  pruneUnions(d);
  // settings that point at people
  d.me = pid(raw.me); d.root = pid(raw.root);
  const v = raw.view || {};
  d.view = {
    mode: oneOf(v.mode, VIEW_MODES, 'v'), spouses: bool(v.spouses), dKids: bool(v.dKids),
    photos: v.photos == null ? true : bool(v.photos), dates: v.dates == null ? true : bool(v.dates), colors: v.colors == null ? true : bool(v.colors), bands: v.bands == null ? true : bool(v.bands),
    collapsed: (Array.isArray(v.collapsed) ? v.collapsed : []).map(pid).filter(Boolean).slice(0, LIMITS.collapsed)
  };
  d.poster = sPoster(raw.poster);
  d.rev = finite(+raw.rev, 0); d.created = finite(+raw.created, Date.now()); d.updated = finite(+raw.updated, Date.now());
  d.lastBackup = finite(+raw.lastBackup, 0); d.lastBackupRev = finite(+raw.lastBackupRev, 0);
  return d;
}

/** the last choices on the export screen */
export function sPoster(o) {
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const k of ['theme', 'layout', 'paper', 'orient', 'title', 'sub', 'root', 'kind']) if (typeof o[k] === 'string') out[k] = str(o[k], 120);
  for (const k of ['photos', 'dates', 'spouses', 'dKids', 'colors', 'hideLiving', 'basmala', 'frame', 'legend', 'stats']) if (o[k] != null) out[k] = bool(o[k]);
  for (const k of ['gens']) if (o[k] != null) out[k] = int(o[k], 0, 30, 0);
  return out;
}

/** a person who is his own ancestor (a loop of parent links) loses the link that closes the loop */
export function breakLoops(s) {
  const P = s.people, U = s.unions;
  const state = new Map(); // 1 visiting, 2 done
  const parentsOf = id => { const u = P[id] && P[id].pu ? U[P[id].pu] : null; return u ? [u.h, u.w].filter(x => x && P[x]) : []; };
  for (const start of Object.keys(P)) {
    if (state.get(start) === 2) continue;
    // iterative DFS
    const stack = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [id, i] = top;
      const ps = parentsOf(id);
      if (i >= ps.length) { state.set(id, 2); stack.pop(); continue; }
      top[1]++;
      const nx = ps[i];
      const st = state.get(nx);
      if (st === 1) { P[id].pu = ''; top[1] = Infinity; continue; } // loop: cut this person's parents
      if (!st) { state.set(nx, 1); stack.push([nx, 0]); }
    }
  }
}
/** a union with nobody in it is removed (its children, if any, keep each other as siblings) */
export function pruneUnions(s) {
  const P = s.people, U = s.unions;
  const count = new Map();
  for (const id in P) if (P[id].pu) count.set(P[id].pu, (count.get(P[id].pu) || 0) + 1);
  for (const id of Object.keys(U)) {
    const u = U[id];
    if (u.h && !P[u.h]) u.h = '';
    if (u.w && !P[u.w]) u.w = '';
    const n = count.get(id) || 0;
    const partners = (u.h ? 1 : 0) + (u.w ? 1 : 0);
    // keep: a couple; one known parent with children; unknown parents of 2+ siblings
    if (partners === 2 || (partners === 1 && n > 0) || (partners === 0 && n > 1)) continue;
    for (const pid in P) if (P[pid].pu === id) P[pid].pu = '';
    delete U[id];
  }
}

/* ---------------- state + saving ---------------- */
export const state = signal(defaultState());
export const saveError = signal(false);
let writeTimer = 0, pending = null;

async function writeAll(s) {
  const json = JSON.stringify(s);
  let saved = 0;
  try { await idbPut('kv', 'state', json); saved++; } catch (e) { /* storage blocked */ }
  try { localStorage.setItem(LS_KEY, json); saved++; } catch (e) { /* full: IndexedDB still has it */ }
  if (isNative) { try { await writeNativeState(json); saved++; } catch (e) { /* IndexedDB still has it */ } }
  saveError.value = saved === 0;
}
function schedule(s) {
  pending = s;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => { const x = pending; pending = null; writeAll(x); }, 250);
}
export function flushSave() {
  if (!pending) return Promise.resolve();
  clearTimeout(writeTimer); const x = pending; pending = null;
  return writeAll(x);
}
if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => { flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
}

/* undo: the last few states before a change the user may regret */
const undoStack = [];
export const undoInfo = signal(null); // { label } of the change that can be undone
/** apply a change: fn gets a shallow copy of the state (copy any nested map you change) */
export function update(fn, { undo = '' } = {}) {
  const prev = state.value;
  const s = { ...prev };
  const r = fn(s);
  if (r === false) return prev; // the action refused
  s.rev = (prev.rev || 0) + 1;
  s.updated = Date.now();
  if (undo) {
    undoStack.push({ state: prev, label: undo });
    if (undoStack.length > 30) undoStack.shift();
    undoInfo.value = { label: undo, n: undoStack.length };
  }
  state.value = s;
  schedule(s);
  return s;
}
export function undo() {
  const last = undoStack.pop();
  if (!last) return false;
  const s = { ...last.state, rev: (state.value.rev || 0) + 1, updated: Date.now() };
  state.value = s;
  schedule(s);
  undoInfo.value = undoStack.length ? { label: undoStack[undoStack.length - 1].label, n: undoStack.length } : null;
  return true;
}
export const clearUndo = () => { undoStack.length = 0; undoInfo.value = null; };

export async function loadState() {
  const copies = [];
  try { const j = await idbGet('kv', 'state'); if (j) copies.push(JSON.parse(j)); } catch (e) { /* none */ }
  try { const j = localStorage.getItem(LS_KEY); if (j) copies.push(JSON.parse(j)); } catch (e) { /* none */ }
  if (isNative) { try { const j = await readNativeState(); if (j) copies.push(j); } catch (e) { /* none */ } }
  // the copy with the most changes wins (one store may have missed the last save)
  copies.sort((a, b) => finite(+b.rev, 0) - finite(+a.rev, 0));
  state.value = copies.length ? sanitizeState(copies[0]) : defaultState();
  return state.value;
}
/**
 * a backup merged into the current data: people and marriages are matched by their ids (a backup made by
 * this app keeps them); for someone in both, the copy changed last wins; the rest is added.
 */
export function mergeStates(cur, inc) {
  const people = { ...cur.people }, unions = { ...cur.unions };
  for (const [id, p] of Object.entries(inc.people)) if (!people[id] || (p.upd || 0) > (people[id].upd || 0)) people[id] = p;
  for (const [id, u] of Object.entries(inc.unions)) if (!unions[id]) unions[id] = u;
  return sanitizeState({ ...cur, people, unions, me: cur.me || inc.me, root: cur.root || inc.root });
}

/** replace everything (restore of a backup); returns the new state */
export function replaceState(raw, { keepSettings = true } = {}) {
  const prev = state.value;
  const next = sanitizeState(raw);
  if (keepSettings) next.settings = { ...prev.settings, onboarded: true };
  next.settings.onboarded = true;
  return update(s => { Object.assign(s, next); }, { undo: 'restore' });
}
export const hasPerson = id => !!(id && has(state.value.people, id));
