// The family as a graph: people, and unions (a couple and the children born to them).
// buildIndex() makes the lookups every screen needs; it is rebuilt whenever the data changes.
import { sortKeyD, parseD, rangeD, todayJdn } from './dates.js';
import { nameKey } from './util.js';

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

export function buildIndex(s) {
  const P = s.people, U = s.unions;
  const kids = new Map();      // union id → [child ids], in birth order
  const unionsOf = new Map();  // person id → [union ids], in marriage order
  for (const id in U) {
    const u = U[id];
    kids.set(id, []);
    for (const p of [u.h, u.w]) if (p && P[p]) { if (!unionsOf.has(p)) unionsOf.set(p, []); unionsOf.get(p).push(id); }
  }
  for (const id in P) { const pu = P[id].pu; if (pu && kids.has(pu)) kids.get(pu).push(id); }
  const birth = id => sortKeyD(P[id].b);
  const ordv = v => (v ? v : Infinity);
  const childOrder = (a, b) => cmp(ordv(P[a].ord), ordv(P[b].ord)) || cmp(birth(a), birth(b)) || cmp(P[a].at || 0, P[b].at || 0) || cmp(a, b);
  for (const list of kids.values()) list.sort(childOrder);
  const firstBirth = uid => { const k = kids.get(uid); return k && k.length ? Math.min(...k.map(birth)) : Infinity; };
  const unionOrder = (a, b) => cmp(ordv(U[a].ord), ordv(U[b].ord)) || cmp(sortKeyD(U[a].md), sortKeyD(U[b].md)) || cmp(firstBirth(a), firstBirth(b)) || cmp(U[a].at || 0, U[b].at || 0) || cmp(a, b);
  for (const list of unionsOf.values()) list.sort(unionOrder);

  const person = id => (id && P[id]) || null;
  const unionOfChild = id => { const p = person(id); return p && p.pu && U[p.pu] ? U[p.pu] : null; };
  const father = id => { const u = unionOfChild(id); return u && u.h && P[u.h] ? u.h : ''; };
  const mother = id => { const u = unionOfChild(id); return u && u.w && P[u.w] ? u.w : ''; };
  const unions = id => unionsOf.get(id) || [];
  const partnerIn = (uid, id) => { const u = U[uid]; if (!u) return ''; const o = u.h === id ? u.w : u.h; return o && P[o] ? o : ''; };
  const spouses = id => unions(id).map(uid => partnerIn(uid, id)).filter(Boolean);
  const children = id => unions(id).flatMap(uid => kids.get(uid) || []);
  const childrenOfUnion = uid => kids.get(uid) || [];
  /** brothers and sisters: full (same union), and half through the father or the mother */
  function siblings(id) {
    const p = person(id); if (!p) return { full: [], paternal: [], maternal: [] };
    const full = p.pu ? (kids.get(p.pu) || []).filter(x => x !== id) : [];
    const f = father(id), m = mother(id);
    const seen = new Set([id, ...full]);
    const paternal = f ? children(f).filter(x => !seen.has(x)) : [];
    paternal.forEach(x => seen.add(x));
    const maternal = m ? children(m).filter(x => !seen.has(x)) : [];
    return { full, paternal, maternal };
  }
  /** the line of fathers: [self, father, grandfather, …] (stops at a loop) */
  function paternalLine(id, max = 1000) {
    const out = []; const seen = new Set();
    let cur = id;
    while (cur && P[cur] && !seen.has(cur) && out.length < max) { out.push(cur); seen.add(cur); cur = father(cur); }
    return out;
  }
  /** family name: the person's own, else inherited through the fathers */
  const famCache = new Map();
  function familyOf(id) {
    if (famCache.has(id)) return famCache.get(id);
    let f = '';
    for (const x of paternalLine(id)) if (P[x].fam) { f = P[x].fam; break; }
    famCache.set(id, f);
    return f;
  }
  /** all ancestors with their distance: Map id → generations up (both parents) */
  function ancestors(id, max = 60) {
    const out = new Map(); let frontier = [id]; let g = 0;
    while (frontier.length && g < max) {
      g++;
      const next = [];
      for (const x of frontier) for (const pa of [father(x), mother(x)]) if (pa && !out.has(pa) && pa !== id) { out.set(pa, g); next.push(pa); }
      frontier = next;
    }
    return out;
  }
  /** all descendants (through every union): Map id → generations down */
  function descendants(id, max = 60) {
    const out = new Map(); let frontier = [id]; let g = 0;
    while (frontier.length && g < max) {
      g++;
      const next = [];
      for (const x of frontier) for (const c of children(x)) if (!out.has(c) && c !== id) { out.set(c, g); next.push(c); }
      frontier = next;
    }
    return out;
  }
  const isAncestorOf = (a, b) => a === b || ancestors(b).has(a);
  /** the top of the father line (founder) of a person */
  const founderOf = id => { const l = paternalLine(id); return l[l.length - 1] || id; };
  /** people with no recorded parents, biggest families first — candidates for the top of the tree */
  function tops() {
    const ids = Object.keys(P).filter(id => !father(id) && !mother(id));
    const size = new Map(ids.map(id => [id, descendants(id).size]));
    return ids.sort((a, b) => size.get(b) - size.get(a) || (P[a].at || 0) - (P[b].at || 0));
  }
  /** the tree's default top: the founder of "me", else of the biggest family */
  function defaultRoot(me) {
    if (me && P[me]) return founderOf(me);
    const t = tops();
    // prefer a man at the top (the family name comes through him)
    const man = t.find(id => P[id].g === 'm' && children(id).length);
    return man || t[0] || '';
  }
  const living = id => { const p = person(id); return !!p && !p.dead && !p.d && !tooOld(p); };
  return {
    P, U, kids, unionsOf, person, father, mother, unions, partnerIn, spouses, children, childrenOfUnion, siblings,
    paternalLine, familyOf, ancestors, descendants, isAncestorOf, founderOf, tops, defaultRoot, living, unionOfChild,
    count: Object.keys(P).length
  };
}

/** a person born more than 120 years ago without a death date is taken as deceased */
export function tooOld(p) {
  const r = rangeD(p.b);
  return !!r && todayJdn() - r[1] > 120 * 365.25;
}

/** a person's first name for display ("؟" when unknown) */
export const displayName = p => (p && p.n ? p.n : '؟');

/** search: "محمد احمد" finds محمد whose father is أحمد; also nicknames, kunya, laqab, family */
export function searchPeople(ix, q, limit = 200) {
  const words = String(q || '').trim().split(/\s+/).map(nameKey).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const id in ix.P) {
    const p = ix.P[id];
    const line = ix.paternalLine(id, 6).map(x => nameKey(ix.P[x].n));
    let score = 0;
    // the words in order along the father line
    let i = 0, k = 0;
    while (i < words.length && k < line.length) { if (line[k].startsWith(words[i])) i++; k++; }
    if (i === words.length) score = 100 - k + (line[0] === words[0] ? 20 : 0);
    else {
      const extra = [p.nick, p.kun, p.laq, ix.familyOf(id), p.fam].map(nameKey).filter(Boolean);
      const hay = [...line.slice(0, 1), ...extra];
      if (words.every(w => hay.some(h => h.includes(w)))) score = 40;
    }
    if (score) out.push({ id, score });
  }
  out.sort((a, b) => b.score - a.score || (sortKeyD(ix.P[a.id].b) - sortKeyD(ix.P[b.id].b)) || 0);
  return out.slice(0, limit).map(x => x.id);
}

/** generation of everyone below a root (root = 1), following children through all unions */
export function generations(ix, root, { daughtersKids = true } = {}) {
  const gen = new Map();
  if (!root || !ix.P[root]) return gen;
  gen.set(root, 1);
  let frontier = [root];
  while (frontier.length) {
    const next = [];
    for (const x of frontier) {
      if (!daughtersKids && ix.P[x].g === 'f' && x !== root) continue;
      for (const c of ix.children(x)) if (!gen.has(c)) { gen.set(c, gen.get(x) + 1); next.push(c); }
    }
    frontier = next;
  }
  return gen;
}

export const exactDay = s => { const p = parseD(s); return !!(p && p.d && !p.approx); };
