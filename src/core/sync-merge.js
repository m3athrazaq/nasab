// The family as a file in the user's private GitHub repository, and merging two copies of it.
// Pure functions (no network, no storage): used by the app's sync, by its tests, and by the tool Claude
// edits the family with — so every copy is read, merged and written the same way.
//
// One file per family: families/<fid>.json — one line per person and per marriage (small diffs, a
// readable history), the deleted ids with their time ("gone"), and who wrote it last ("by").
// Photos: photos/<photo id>.jpg.
import { sanitizeState, familyPart, defaultView, PERSON_FIELDS, ID_RE, MAX_FAMILIES, str } from './store.js';
import { finite, uid } from './util.js';

export const FILE_V = 1;
export const P_FIELDS = PERSON_FIELDS;
export const U_FIELDS = ['h', 'w', 'st', 'md', 'ed', 'note', 'ord', 'ko'];
const META = ['fname', 'me', 'root', 'poster'];
const GONE_MAX = 5000, GONE_TTL = 400 * 864e5;
export const familyPath = fid => `families/${fid}.json`;
export const photoPath = id => `photos/${id}.jpg`;
export const FAMILY_RE = /^families\/([a-z0-9]{4,32})\.json$/;
export const PHOTO_RE = /^photos\/([a-z0-9]{4,32})\.jpg$/;

/* ---------------- comparing ---------------- */
/** JSON with the keys of objects in order (the same object always gives the same text) */
export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
const blank = v => v == null || v === '' || v === false || v === 0;
/** two values of a field: the same (an empty value and a missing one are the same) */
export const same = (a, b) => a === b || (blank(a) && blank(b)) || (typeof a === 'object' && typeof b === 'object' && stable(a) === stable(b));
const differs = (x, y, fields) => fields.some(f => !same(x[f], y[f]));

/* ---------------- the family in the app ↔ the family as a file ---------------- */
/** every family kept in the app (the open one and the others), as fid → family */
export function familiesOf(s) {
  const out = new Map();
  const pick = (fid, f) => ({
    fid, fname: f.fname || '', me: f.me || '', root: f.root || '', poster: f.poster || {},
    people: f.people || {}, unions: f.unions || {}, created: finite(+f.created, 0)
  });
  if (s && s.fid) out.set(s.fid, pick(s.fid, s));
  for (const [fid, f] of Object.entries((s && s.others) || {})) if (f) out.set(fid, pick(fid, f));
  return out;
}
const packRec = (r, fields, times) => {
  const o = {};
  for (const f of fields) { const v = r[f]; if (blank(v) || (f === 'st' && v === 'm')) continue; o[f] = v; }
  if (times) { o.at = r.at; o.upd = r.upd; }
  return o;
};
function lines(fam, { by = '', updated = 0, times = true, gone = true } = {}) {
  const out = ['{'];
  const head = { app: 'nasab', v: FILE_V, fid: fam.fid, fname: fam.fname || '', me: fam.me || '', root: fam.root || '' };
  if (times) Object.assign(head, { by, updated, created: fam.created || 0 });
  for (const [k, v] of Object.entries(head)) out.push(JSON.stringify(k) + ': ' + JSON.stringify(v) + ',');
  out.push('"poster": ' + stable(fam.poster || {}) + ',');
  const block = (name, map, fields, last) => {
    const ids = Object.keys(map || {}).sort();
    out.push(JSON.stringify(name) + ': {');
    ids.forEach((id, i) => out.push(JSON.stringify(id) + ': ' + JSON.stringify(packRec(map[id], fields, times)) + (i < ids.length - 1 ? ',' : '')));
    out.push('}' + (last ? '' : ','));
  };
  block('people', fam.people, P_FIELDS);
  block('unions', fam.unions, U_FIELDS, !gone);
  if (gone) {
    const g = fam.gone || {};
    const ids = Object.keys(g).sort();
    out.push('"gone": {');
    ids.forEach((id, i) => out.push(JSON.stringify(id) + ': ' + g[id] + (i < ids.length - 1 ? ',' : '')));
    out.push('}');
  }
  out.push('}');
  return out.join('\n') + '\n';
}
/** the file written to the repository */
export const toText = (fam, { by = '', updated = Date.now() } = {}) => lines(fam, { by, updated });
/** what a family holds, without who wrote it, when, and the record times: equal keys = nothing to send */
export const contentKey = fam => lines(fam, { times: false, gone: false });

/** a family file read from the repository → a family (checked like everything read from outside); null if it is not one */
export function fromText(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return null; }
  return fromFile(raw);
}
export function fromFile(raw) {
  if (!raw || typeof raw !== 'object' || raw.app !== 'nasab' || !ID_RE.test(String(raw.fid || ''))) return null;
  // the record's key is its id: an id that is not in the app's format is dropped, never renamed
  const recs = m => {
    const out = {};
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      for (const [k, v] of Object.entries(m)) if (ID_RE.test(k) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...v, id: k };
    }
    return out;
  };
  const s = sanitizeState({ people: recs(raw.people), unions: recs(raw.unions), me: raw.me, root: raw.root, poster: raw.poster, fname: raw.fname, created: raw.created }, true);
  return {
    fid: raw.fid, fname: s.fname, me: s.me, root: s.root, poster: s.poster, people: s.people, unions: s.unions,
    created: finite(+raw.created, 0), gone: cleanGone(raw.gone), by: str(raw.by, 40), updated: finite(+raw.updated, 0)
  };
}
function cleanGone(g, now = Date.now()) {
  const out = {};
  if (!g || typeof g !== 'object' || Array.isArray(g)) return out;
  const list = Object.entries(g).filter(([k, v]) => ID_RE.test(k) && typeof v === 'number' && isFinite(v) && v > 0 && v < now + 864e5);
  list.sort((a, b) => b[1] - a[1]);
  for (const [k, v] of list.slice(0, GONE_MAX)) out[k] = v;
  return out;
}

/* ---------------- merging ---------------- */
/** one person or marriage changed on both sides since the common copy: field by field */
function merge3Rec(b, l, r, fields) {
  const later = (r.upd || 0) > (l.upd || 0) ? r : l;
  const o = { ...l };
  for (const f of fields) {
    if (same(l[f], r[f])) continue;
    if (same(l[f], b[f])) o[f] = r[f];          // only the other side changed it
    else if (same(r[f], b[f])) o[f] = l[f];     // only this side changed it
    else o[f] = later[f];                       // both changed it: the later edit
  }
  o.at = Math.min(l.at || r.at || 0, r.at || l.at || 0);
  o.upd = Math.max(l.upd || 0, r.upd || 0);
  return o;
}
/** people (or marriages) of three copies: B the last copy both sides had (or null), L this side's, R the other's */
function mergeMap(B, L, R, fields, rGone, now, newGone) {
  const out = {};
  const ids = new Set([...Object.keys(L || {}), ...Object.keys(R || {}), ...Object.keys(B || {})]);
  for (const id of ids) {
    const b = B && B[id], l = L && L[id], r = R && R[id];
    if (l && r) out[id] = b ? merge3Rec(b, l, r, fields) : ((r.upd || 0) > (l.upd || 0) ? r : l);
    else if (l) {
      if (b) { if (differs(l, b, fields)) out[id] = l; }               // deleted there: gone, unless changed here since
      else if (!(rGone[id] && rGone[id] >= (l.upd || 0))) out[id] = l; // new here (or deleted there after its last change)
    } else if (r) {
      if (!b || differs(r, b, fields)) out[id] = r;                   // new there, or changed there after it was deleted here
      else newGone[id] = now;                                         // deleted here: the deletion goes out
    }
  }
  return out;
}
/**
 * base: the last copy both sides had (null if none), local: this device's, remote: the repository's.
 * Returns the merged family, put right (a link that closes a loop is cut, an empty marriage removed…).
 */
export function mergeFamily(base, local, remote, { now = Date.now() } = {}) {
  const rGone = remote.gone || {}, newGone = {};
  const people = mergeMap(base && base.people, local.people, remote.people, P_FIELDS, rGone, now, newGone);
  const unions = mergeMap(base && base.unions, local.unions, remote.unions, U_FIELDS, rGone, now, newGone);
  const meta = {};
  for (const k of META) {
    const l = local[k], r = remote[k];
    // changed on one side → that side's; changed on both → this device's (the one in the user's hands)
    meta[k] = same(l, r) ? l : base && same(l, base[k]) ? r : l;
  }
  const s = sanitizeState({ people, unions, me: meta.me, root: meta.root, poster: meta.poster, fname: meta.fname }, true);
  const gone = { ...rGone, ...newGone };
  // ids that are still (or again) in the family are not gone; old deletions are forgotten
  for (const id of Object.keys(gone)) if (s.people[id] || s.unions[id] || gone[id] < now - GONE_TTL) delete gone[id];
  // removed while putting the family right (an empty marriage): gone too
  for (const id of Object.keys(people)) if (!s.people[id]) gone[id] = now;
  for (const id of Object.keys(unions)) if (!s.unions[id]) gone[id] = now;
  return {
    fid: local.fid || remote.fid, fname: s.fname, me: s.me, root: s.root, poster: s.poster, people: s.people, unions: s.unions,
    created: Math.min(local.created || remote.created || 0, remote.created || local.created || 0), gone: cleanGone(gone, now + 1)
  };
}

/** what changed from one copy of a family to another: people added, removed, edited; marriages; the rest */
export function diffFamily(a, b) {
  const A = (a && a.people) || {}, Bp = (b && b.people) || {};
  const added = [], removed = [], edited = [];
  for (const id in Bp) { if (!A[id]) added.push(id); else if (differs(A[id], Bp[id], P_FIELDS)) edited.push(id); }
  for (const id in A) if (!Bp[id]) removed.push(id);
  const AU = (a && a.unions) || {}, BU = (b && b.unions) || {};
  let unions = 0;
  for (const id in BU) if (!AU[id] || differs(AU[id], BU[id], U_FIELDS)) unions++;
  for (const id in AU) if (!BU[id]) unions++;
  const meta = !!(a && b) && META.some(k => !same(a[k], b[k]));
  const name = id => (Bp[id] && Bp[id].n) || (A[id] && A[id].n) || '';
  return { added, removed, edited, unions, meta, name, any: !!(added.length || removed.length || edited.length || unions || meta) };
}

/**
 * one round of sync for every family.
 *   local:  fid → family (this device, from the app state)
 *   remote: fid → { sha, fam } (the repository now)
 *   base:   fid → { sha, fam } (the copies both had after the last sync)
 * Returns what to change here (apply: fid → family, or null to remove it here), what to send (push: fid →
 * { fam, sha } or { del: true, sha }), the copies to keep as the new base when nothing is sent, and what
 * arrived (news: one entry per family that changed here).
 */
export function planSync({ local, remote, base, now = Date.now() }) {
  const apply = new Map(), push = new Map(), keep = new Map(), news = [];
  const ids = new Set([...local.keys(), ...remote.keys(), ...Object.keys(base || {})]);
  const peopleIn = f => !!(f && Object.keys(f.people || {}).length);
  // a device whose families are all empty lost its data (or was erased): it takes the repository's
  // families, it never sends their deletion
  const emptyHere = ![...local.values()].some(peopleIn);
  for (const fid of ids) {
    const L = local.get(fid), R = remote.get(fid);
    let B = base && base[fid];
    if (emptyHere || (L && !peopleIn(L) && B && peopleIn(B.fam))) B = undefined;
    if (L && R && !peopleIn(L) && peopleIn(R.fam)) {
      // everybody gone from this copy: the repository's copy is taken, never emptied from here
      apply.set(fid, R.fam); news.push({ fid, kind: 'changed', diff: diffFamily(L, R.fam), by: R.fam.by || '', fname: R.fam.fname });
      keep.set(fid, R);
      continue;
    }
    if (L && R) {
      const merged = mergeFamily(B ? B.fam : null, L, R.fam, { now });
      const mk = contentKey(merged);
      if (mk !== contentKey(L)) { apply.set(fid, merged); news.push({ fid, kind: 'changed', diff: diffFamily(L, merged), by: R.fam.by || '', fname: merged.fname }); }
      if (mk !== contentKey(R.fam)) push.set(fid, { fam: merged, sha: R.sha });
      else keep.set(fid, R);
    } else if (L) {
      if (B) {
        // removed from the repository (on another device): removed here too, unless changed here since
        if (contentKey(L) === contentKey(B.fam)) { apply.set(fid, null); news.push({ fid, kind: 'removed', fname: L.fname, diff: diffFamily(L, null) }); }
        else push.set(fid, { fam: { ...L, gone: B.fam.gone || {} }, sha: null });
      } else if (Object.keys(L.people).length) push.set(fid, { fam: { ...L, gone: {} }, sha: null }); // new here
    } else if (R) {
      if (B && contentKey(R.fam) === contentKey(B.fam)) push.set(fid, { del: true, sha: R.sha }); // removed here
      else { apply.set(fid, R.fam); news.push({ fid, kind: 'added', diff: diffFamily(null, R.fam), by: R.fam.by || '', fname: R.fam.fname }); }
      if (!push.has(fid)) keep.set(fid, R);
    }
  }
  return { apply, push, keep, news };
}

/**
 * the app's state with the families that arrived (fid → family, or null: removed on another device).
 * synced: the families this device already had in the repository. Returns a new state (shallow).
 */
export function applyToState(s, apply, { synced = new Set() } = {}) {
  const out = { ...s, others: { ...s.others } };
  const fields = (f, view) => ({
    people: f.people, unions: f.unions, me: f.me, root: f.root, poster: f.poster, fname: f.fname,
    view: { ...(view || defaultView()), collapsed: ((view && view.collapsed) || []).filter(id => f.people[id]) }
  });
  const open = (fid, keepCurrent) => {
    const next = out.others[fid];
    delete out.others[fid];
    if (keepCurrent) out.others[out.fid] = familyPart(out);
    Object.assign(out, next, { fid });
  };
  const wasEmpty = !Object.keys(out.people || {}).length && !out.fname && !synced.has(out.fid);
  let removeOpen = false;
  const added = [];
  for (const [fid, fam] of apply) {
    if (fid === out.fid) {
      if (fam) Object.assign(out, fields(fam, out.view)); else removeOpen = true;
    } else if (out.others[fid]) {
      if (fam) out.others[fid] = { ...out.others[fid], ...fields(fam, out.others[fid].view) }; else delete out.others[fid];
    } else if (fam && Object.keys(out.others).length + 1 < MAX_FAMILIES) {
      out.others[fid] = { ...fields(fam, null), lastBackup: 0, lastBackupRev: 0, created: fam.created || Date.now(), updated: Date.now() };
      added.push(fid);
    }
  }
  if (removeOpen) {
    // the open family was removed on another device: another one opens (or an empty one)
    const next = added[0] || Object.keys(out.others)[0];
    if (next) open(next, false);
    else Object.assign(out, { fid: uid(), fname: '', people: {}, unions: {}, me: '', root: '', poster: {}, view: defaultView(), lastBackup: 0, lastBackupRev: 0 });
  } else if (added.length && wasEmpty) open(added[0], false); // a new device's empty family gives its place
  if (added.length) out.settings = { ...out.settings, onboarded: true };
  return out;
}

/** git's id of a file's content (SHA-1 of "blob <size>\0<bytes>"): the same as the repository's, so an
 *  unchanged file is never downloaded or sent again */
export async function gitBlobSha(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('');
}
