// Everything that changes the family: adding people and relations, editing, deleting, merging.
// Each action is one step the user can undo.
import { state, update, pruneUnions, breakLoops, sPerson, sUnion, sPoster, PERSON_FIELDS, ID_RE } from './store.js';
import { uid } from './util.js';
import { sortKeyD } from './dates.js';
import { cleanName, guessGender } from './names.js';

/* ---------------- helpers on a draft state ---------------- */
function draft(s) { s.people = { ...s.people }; s.unions = { ...s.unions }; return s; }
const roleOf = p => (p && p.g === 'f' ? 'w' : 'h');
export function unionsOfIn(s, id) { return Object.keys(s.unions).filter(k => s.unions[k].h === id || s.unions[k].w === id); }
export function findUnionIn(s, a, b, except = '') {
  for (const k in s.unions) {
    if (k === except) continue;
    const u = s.unions[k];
    if ((u.h === a && u.w === b) || (u.h === b && u.w === a)) return k;
  }
  return '';
}
const parentsIn = (s, id) => { const p = s.people[id]; const u = p && p.pu ? s.unions[p.pu] : null; return u ? [u.h, u.w].filter(x => x && s.people[x]) : []; };
/** is a an ancestor of b (or b itself)? */
export function isAncestorIn(s, a, b) {
  const seen = new Set(); const stack = [b];
  while (stack.length) {
    const x = stack.pop();
    if (x === a) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...parentsIn(s, x));
  }
  return false;
}
function newPerson(s, fields) {
  const id = uid();
  const p = sPerson({ ...fields, id, at: Date.now(), upd: Date.now() });
  p.id = id;
  if (!p.g && p.n) p.g = guessGender(p.n) || '';
  if (p.pu && !s.unions[p.pu]) p.pu = '';
  if (p.photo && !ID_RE.test(p.photo)) p.photo = '';
  s.people[id] = p;
  return id;
}
function newUnion(s, { h = '', w = '', ...rest } = {}) {
  const id = uid();
  const u = sUnion({ ...rest, h, w, id, at: Date.now() });
  u.id = id; u.h = h; u.w = w;
  s.unions[id] = u;
  return id;
}
/** a union of a and b, with roles by their genders (an existing one is reused) */
function coupleUnion(s, a, b) {
  const found = findUnionIn(s, a, b);
  if (found) return found;
  const pa = s.people[a], pb = s.people[b];
  const aRole = pa.g === 'f' || (pb && pb.g === 'm' && pa.g !== 'm') ? 'w' : 'h';
  return newUnion(s, aRole === 'h' ? { h: a, w: b } : { h: b, w: a });
}
const setP = (s, id, patch) => { s.people[id] = { ...s.people[id], ...patch, upd: Date.now() }; };
const setU = (s, id, patch) => { s.unions[id] = { ...s.unions[id], ...patch }; };

/* ---------------- people ---------------- */
export function addPerson(fields) {
  let id = '';
  update(s => { draft(s); id = newPerson(s, fields); }, { undo: 'add' });
  return id;
}
export function editPerson(id, patch) {
  update(s => {
    if (!s.people[id]) return false;
    draft(s);
    const clean = sPerson({ ...s.people[id], ...patch });
    const p = { ...s.people[id] };
    for (const k of PERSON_FIELDS) if (k in patch) p[k] = clean[k];
    if ('d' in patch && clean.d) p.dead = true;
    p.upd = Date.now();
    s.people[id] = p;
  }, { undo: 'edit' });
}

/**
 * a child of parentId. opts.unionId: into this union; opts.otherId: with this other parent
 * (their union is found or made); otherwise the parent's only union (or a new one).
 * fields.existing: link a person already in the family instead of a new one.
 */
function childInto(s, parentId, fields, { unionId = '', otherId = '', fresh = false } = {}) {
  const P = s.people;
  let u = unionId && s.unions[unionId] && (s.unions[unionId].h === parentId || s.unions[unionId].w === parentId) ? unionId : '';
  if (!u && otherId && P[otherId] && otherId !== parentId) u = coupleUnion(s, parentId, otherId);
  if (!u && fresh) {
    // with another (unknown) mother/father: the union with an empty place, or a new one
    u = unionsOfIn(s, parentId).find(k => !s.unions[k].h || !s.unions[k].w) || newUnion(s, roleOf(P[parentId]) === 'h' ? { h: parentId } : { w: parentId });
  }
  if (!u) {
    const list = unionsOfIn(s, parentId);
    // the union whose other parent is unknown, else the only one, else (several wives) the first
    u = list.find(k => !s.unions[k].h || !s.unions[k].w) || (list.length ? list.sort((a, b) => (s.unions[a].ord || 99) - (s.unions[b].ord || 99))[0] : '');
    if (!u) u = newUnion(s, roleOf(P[parentId]) === 'h' ? { h: parentId } : { w: parentId });
  }
  if (fields && fields.existing) {
    const cid = fields.existing;
    if (!P[cid] || isAncestorIn(s, cid, parentId)) return '';
    const uu = s.unions[u];
    if (uu.h === cid || uu.w === cid) return '';
    setP(s, cid, { pu: u });
    return cid;
  }
  return newPerson(s, { ...fields, pu: u });
}
export function addChild(parentId, fields, opts = {}) {
  let id = '';
  update(s => {
    if (!s.people[parentId]) return false;
    draft(s);
    id = childInto(s, parentId, fields, opts);
    if (!id) return false;
    pruneUnions(s);
  }, { undo: 'add' });
  return id;
}
/** several children at once: list of { n, g, b } */
export function addChildren(parentId, list, opts = {}) {
  const ids = [];
  update(s => {
    if (!s.people[parentId]) return false;
    draft(s);
    for (const f of list) {
      if (!f.existing && !cleanName(f.n)) continue;
      const id = childInto(s, parentId, f, opts);
      if (id) ids.push(id);
      // later children go into the same union as the first
      if (id && !opts.unionId) opts = { ...opts, unionId: s.people[id].pu };
    }
    if (!ids.length) return false;
    pruneUnions(s);
  }, { undo: 'add' });
  return ids;
}

/** father (role 'h') or mother (role 'w') of a child; fields.existing links someone already here */
export function addParent(childId, role, fields) {
  let pid = '';
  update(s => {
    const c = s.people[childId];
    if (!c || (role !== 'h' && role !== 'w')) return false;
    draft(s);
    if (fields && fields.existing) {
      pid = fields.existing;
      if (!s.people[pid] || pid === childId || isAncestorIn(s, childId, pid)) return false;
    } else pid = newPerson(s, { ...fields, g: (fields && fields.g) || (role === 'h' ? 'm' : 'f') });
    if (c.pu && s.unions[c.pu]) {
      const u = s.unions[c.pu];
      if (u[role] && s.people[u[role]]) return false; // already has one: change it from the parent's own page
      const other = role === 'h' ? u.w : u.h;
      const same = other ? findUnionIn(s, pid, other, c.pu) : '';
      if (same) {
        // that couple is already recorded: the children join it
        for (const k in s.people) if (s.people[k].pu === c.pu) setP(s, k, { pu: same });
        delete s.unions[c.pu];
      } else setU(s, c.pu, { [role]: pid });
    } else {
      const reuse = unionsOfIn(s, pid).find(k => !s.unions[k][role === 'h' ? 'w' : 'h']);
      const u = reuse || newUnion(s, role === 'h' ? { h: pid } : { w: pid });
      setP(s, childId, { pu: u });
    }
    pruneUnions(s);
  }, { undo: 'add' });
  return pid;
}

/** a husband or wife; opts.fillUnion: the spouse becomes the other parent of that union's children */
export function addSpouse(personId, fields, { fillUnion = '' } = {}) {
  let sid = '', uidOut = '';
  update(s => {
    const p = s.people[personId];
    if (!p) return false;
    draft(s);
    if (fields && fields.existing) {
      sid = fields.existing;
      if (!s.people[sid] || sid === personId) return false;
    } else sid = newPerson(s, { ...fields, g: (fields && fields.g) || (p.g === 'f' ? 'm' : p.g === 'm' ? 'f' : '') });
    const fu = fillUnion && s.unions[fillUnion];
    if (fu && (fu.h === personId || fu.w === personId)) {
      const role = fu.h === personId ? 'w' : 'h';
      if (fu[role]) return false;
      const same = findUnionIn(s, personId, sid, fillUnion);
      if (same) {
        for (const k in s.people) if (s.people[k].pu === fillUnion) setP(s, k, { pu: same });
        delete s.unions[fillUnion];
        uidOut = same;
      } else { setU(s, fillUnion, { [role]: sid }); uidOut = fillUnion; }
    } else uidOut = coupleUnion(s, personId, sid);
    // a parent cannot marry into his own line in a way that makes a loop; links never create loops here
    pruneUnions(s);
  }, { undo: 'add' });
  return { id: sid, unionId: uidOut };
}

/** a brother or sister (same parents); with no parents recorded, a shared "unknown parents" union */
export function addSibling(personId, fields) {
  let id = '';
  update(s => {
    const p = s.people[personId];
    if (!p) return false;
    draft(s);
    let u = p.pu && s.unions[p.pu] ? p.pu : '';
    if (!u) { u = newUnion(s, {}); setP(s, personId, { pu: u }); }
    if (fields && fields.existing) {
      const x = fields.existing;
      if (!s.people[x] || x === personId) return false;
      const uu = s.unions[u];
      if (uu.h === x || uu.w === x || [uu.h, uu.w].some(par => par && isAncestorIn(s, x, par))) return false;
      setP(s, x, { pu: u }); id = x;
    } else id = newPerson(s, { ...fields, pu: u });
    pruneUnions(s);
  }, { undo: 'add' });
  return id;
}

/** move a child to another union (e.g. choose the right mother among the father's wives) */
export function setChildUnion(childId, unionId) {
  update(s => {
    const c = s.people[childId], u = s.unions[unionId];
    if (!c || !u || u.h === childId || u.w === childId) return false;
    if ([u.h, u.w].some(par => par && isAncestorIn(s, childId, par))) return false;
    draft(s);
    setP(s, childId, { pu: unionId });
    pruneUnions(s);
  }, { undo: 'edit' });
}
/** the child is no longer linked to his parents (they stay in the family) */
export function detachChild(childId) {
  update(s => {
    if (!s.people[childId] || !s.people[childId].pu) return false;
    draft(s);
    setP(s, childId, { pu: '' });
    pruneUnions(s);
  }, { undo: 'edit' });
}
/** replace a parent of a child (father or mother) with another person or a new one */
export function replaceParent(childId, role, fields) {
  update(s => {
    const c = s.people[childId];
    if (!c || !c.pu || !s.unions[c.pu]) return false;
    draft(s);
    const u = s.unions[c.pu];
    const other = role === 'h' ? u.w : u.h;
    let pid = fields && fields.existing;
    if (pid) { if (!s.people[pid] || isAncestorIn(s, childId, pid)) return false; }
    else pid = newPerson(s, { ...fields, g: role === 'h' ? 'm' : 'f' });
    // only this child moves (his full siblings stay with the old parents)
    const target = other ? coupleUnion(s, pid, other) : (unionsOfIn(s, pid).find(k => !s.unions[k][role === 'h' ? 'w' : 'h']) || newUnion(s, role === 'h' ? { h: pid } : { w: pid }));
    setP(s, childId, { pu: target });
    pruneUnions(s);
  }, { undo: 'edit' });
}

/* ---------------- marriages ---------------- */
export function editUnion(unionId, patch) {
  update(s => {
    if (!s.unions[unionId]) return false;
    draft(s);
    const clean = sUnion({ ...s.unions[unionId], ...patch });
    const u = { ...s.unions[unionId] };
    for (const k of ['st', 'md', 'ed', 'note', 'ord']) if (k in patch) u[k] = clean[k];
    s.unions[unionId] = u;
  }, { undo: 'edit' });
}
/** remove a marriage; its children (if any) stay with the other parent */
export function removeUnion(unionId, personId) {
  update(s => {
    const u = s.unions[unionId];
    if (!u) return false;
    draft(s);
    const kids = Object.keys(s.people).filter(k => s.people[k].pu === unionId);
    if (!kids.length) delete s.unions[unionId];
    else if (personId && (u.h === personId || u.w === personId)) setU(s, unionId, { [u.h === personId ? 'h' : 'w']: '' });
    else return false;
    pruneUnions(s);
  }, { undo: 'edit' });
}
/** order of a person's marriages (first wife, second wife…) */
export function moveUnion(personId, unionId, dir, orderedIds) {
  update(s => {
    const list = orderedIds.filter(k => s.unions[k]);
    const i = list.indexOf(unionId), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    draft(s);
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((k, n) => setU(s, k, { ord: n + 1 }));
  }, { undo: 'edit' });
}
/** order among brothers and sisters; orderedIds = the current order of the children of that union */
export function moveChild(childId, dir, orderedIds) {
  update(s => {
    const list = orderedIds.filter(k => s.people[k]);
    const i = list.indexOf(childId), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    draft(s);
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((k, n) => setP(s, k, { ord: n + 1 }));
  }, { undo: 'edit' });
}

/* ---------------- deleting and merging ---------------- */
/** everyone that goes with a branch: the person, the descendants, and spouses linked only through them */
export function branchOf(s, id) {
  const out = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const x = stack.pop();
    for (const u of unionsOfIn(s, x)) {
      for (const k in s.people) if (s.people[k].pu === u && !out.has(k)) { out.add(k); stack.push(k); }
    }
  }
  // spouses with no parents and no marriage outside the branch
  for (const x of [...out]) {
    for (const u of unionsOfIn(s, x)) {
      const uu = s.unions[u]; const o = uu.h === x ? uu.w : uu.h;
      if (!o || out.has(o)) continue;
      const p = s.people[o];
      if (p.pu && s.unions[p.pu]) continue;
      if (unionsOfIn(s, o).every(k => { const v = s.unions[k]; return out.has(v.h === o ? v.w : v.h); })) out.add(o);
    }
  }
  return out;
}
export function deletePeople(ids, label = 'delete') {
  const set = new Set(ids);
  const photos = [];
  update(s => {
    draft(s);
    for (const id of set) { if (s.people[id]) { if (s.people[id].photo) photos.push(s.people[id].photo); delete s.people[id]; } }
    for (const k of Object.keys(s.unions)) {
      const u = s.unions[k];
      if (set.has(u.h) || set.has(u.w)) setU(s, k, { h: set.has(u.h) ? '' : u.h, w: set.has(u.w) ? '' : u.w });
    }
    pruneUnions(s);
    if (set.has(s.me)) s.me = '';
    if (set.has(s.root)) s.root = '';
    s.view = { ...s.view, collapsed: s.view.collapsed.filter(x => !set.has(x)) };
  }, { undo: label });
  return photos;
}
export function deletePerson(id, mode = 'one') {
  const s = state.value;
  if (!s.people[id]) return [];
  return deletePeople(mode === 'branch' ? [...branchOf(s, id)] : [id]);
}
/**
 * the same person entered twice: keep `keepId`, fill its empty details from `dropId`, move all of
 * dropId's relations to it. Refused if one is an ancestor of the other.
 */
export function mergePeople(keepId, dropId) {
  let ok = false;
  update(s => {
    const a = s.people[keepId], b = s.people[dropId];
    if (!a || !b || keepId === dropId) return false;
    if (isAncestorIn(s, keepId, dropId) || isAncestorIn(s, dropId, keepId)) return false;
    draft(s);
    const p = { ...a };
    for (const k of PERSON_FIELDS) if (k !== 'pu' && k !== 'ord' && !p[k] && b[k]) p[k] = b[k];
    if (b.dead) p.dead = true;
    if (!p.pu && b.pu && s.unions[b.pu]) p.pu = b.pu;
    s.people[keepId] = p;
    for (const k of Object.keys(s.unions)) {
      const u = s.unions[k];
      if (u.h === dropId || u.w === dropId) setU(s, k, { h: u.h === dropId ? keepId : u.h, w: u.w === dropId ? keepId : u.w });
      const v = s.unions[k];
      if (v.h && v.h === v.w) setU(s, k, { w: '' });
    }
    delete s.people[dropId];
    // two records of the same couple now: one union
    const seen = new Map();
    for (const k of Object.keys(s.unions)) {
      const u = s.unions[k];
      if (!u.h || !u.w) continue;
      const key = u.h + '|' + u.w;
      if (!seen.has(key)) { seen.set(key, k); continue; }
      const keep = seen.get(key);
      for (const c in s.people) if (s.people[c].pu === k) setP(s, c, { pu: keep });
      delete s.unions[k];
    }
    // the kept person cannot be a child of his own union
    const pu = s.people[keepId].pu;
    if (pu && s.unions[pu] && (s.unions[pu].h === keepId || s.unions[pu].w === keepId)) setP(s, keepId, { pu: '' });
    breakLoops(s);
    pruneUnions(s);
    if (s.me === dropId) s.me = keepId;
    if (s.root === dropId) s.root = keepId;
    s.view = { ...s.view, collapsed: s.view.collapsed.map(x => (x === dropId ? keepId : x)) };
    ok = true;
  }, { undo: 'merge' });
  return ok;
}

/* ---------------- me, top of the tree, view, settings ---------------- */
export const setMe = id => update(s => { s.me = id && s.people[id] ? id : ''; });
export const setRoot = id => update(s => { s.root = id && s.people[id] ? id : ''; s.view = { ...s.view, collapsed: [] }; });
export const setView = patch => update(s => { s.view = { ...s.view, ...patch }; });
export const setSettings = patch => update(s => { s.settings = { ...s.settings, ...patch }; });
export const setPoster = patch => update(s => { s.poster = sPoster({ ...s.poster, ...patch }); });
export function toggleCollapsed(id) {
  update(s => {
    const c = new Set(s.view.collapsed);
    if (c.has(id)) c.delete(id); else c.add(id);
    s.view = { ...s.view, collapsed: [...c] };
  });
}
export const markBackup = () => update(s => { s.lastBackup = Date.now(); s.lastBackupRev = s.rev + 1; });

/**
 * a full name typed at the start → the person and his fathers, linked. Returns the person's id.
 * names: [self, father, grandfather, …]; the family name goes on the top one (everyone inherits it).
 */
export function buildChain(names, { family = '', gender = '', birth = '' } = {}) {
  let self = '';
  update(s => {
    draft(s);
    let child = '';
    names.forEach((n, i) => {
      const id = newPerson(s, { n, g: i === 0 ? gender || guessGender(n) || 'm' : 'm', b: i === 0 ? birth : '' });
      if (i === 0) self = id;
      if (child) { const u = newUnion(s, { h: id }); setP(s, child, { pu: u }); }
      child = id;
    });
    if (family && child) setP(s, child, { fam: cleanName(family) });
    s.me = self;
    s.root = child || self;
    s.settings = { ...s.settings, onboarded: true };
  }, { undo: 'add' });
  return self;
}

/** the people of the family sorted for lists: by birth, then name */
export const byBirth = s => (a, b) => sortKeyD(s.people[a].b) - sortKeyD(s.people[b].b) || String(s.people[a].n).localeCompare(String(s.people[b].n), 'ar');
