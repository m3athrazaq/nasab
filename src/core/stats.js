// Figures about the family, and the dates coming up (birthdays, anniversaries of passing, marriages).
import { parseD, rangeD, ageBetween, todayJdn, gToJdn, hToJdn, jdnToH, jdnToG, gDaysInMonth, yearIn } from './dates.js';
import { generations, tooOld } from './model.js';
import { nameKey } from './util.js';

const exact = s => { const p = parseD(s); return p && p.d && !p.approx ? p : null; };
const midAge = a => (a ? Math.round((a.lo + a.hi) / 2) : null);

export function familyStats(ix, root, { now = new Date() } = {}) {
  const ids = Object.keys(ix.P);
  const P = ix.P;
  const st = { total: ids.length, m: 0, f: 0, u: 0, living: 0, dead: 0 };
  for (const id of ids) {
    const p = P[id];
    st[p.g === 'm' ? 'm' : p.g === 'f' ? 'f' : 'u']++;
    if (ix.living(id)) st.living++; else st.dead++;
  }
  // generations below the top of the tree
  const gen = generations(ix, root);
  const perGen = [];
  for (const g of gen.values()) perGen[g - 1] = (perGen[g - 1] || 0) + 1;
  st.generations = perGen.length;
  st.perGen = perGen.map(v => v || 0);
  st.inTree = gen.size;
  // names
  const counter = g => {
    const m = new Map();
    for (const id of ids) {
      const p = P[id];
      if (p.g !== g || !p.n) continue;
      const k = nameKey(p.n);
      if (!m.has(k)) m.set(k, { name: p.n, n: 0, ids: [] });
      const e = m.get(k); e.n++; e.ids.push(id);
    }
    return [...m.values()].filter(e => e.n > 1).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ar')).slice(0, 8);
  };
  st.namesM = counter('m'); st.namesF = counter('f');
  // children
  const kidsCount = ids.map(id => ({ id, n: ix.children(id).length })).filter(x => x.n > 0);
  st.parents = kidsCount.length;
  st.mostChildren = kidsCount.slice().sort((a, b) => b.n - a.n).slice(0, 5);
  const unionsWithKids = Object.keys(ix.U).map(u => ix.childrenOfUnion(u).length).filter(n => n > 0);
  st.avgChildren = unionsWithKids.length ? unionsWithKids.reduce((a, b) => a + b, 0) / unionsWithKids.length : 0;
  st.marriages = Object.values(ix.U).filter(u => u.h && u.w).length;
  st.polygamous = ids.filter(id => P[id].g === 'm' && ix.unions(id).filter(u => ix.partnerIn(u, id)).length > 1).length;
  // cousin marriages: husband and wife share a grandparent or great-grandparent
  st.cousinMarriages = Object.values(ix.U).filter(u => {
    if (!u.h || !u.w) return false;
    const a = ix.ancestors(u.h, 3), b = ix.ancestors(u.w, 3);
    for (const k of a.keys()) if (b.has(k)) return true;
    return false;
  }).length;
  // ages
  const living = [], lifespans = [];
  for (const id of ids) {
    const p = P[id];
    if (!p.b) continue;
    if (ix.living(id)) { const a = ageBetween(p.b, '', now); if (a) living.push({ id, age: midAge(a), a }); }
    else if (p.d) { const a = ageBetween(p.b, p.d); if (a) lifespans.push({ id, age: midAge(a), a }); }
  }
  living.sort((a, b) => b.age - a.age);
  lifespans.sort((a, b) => b.age - a.age);
  st.oldestLiving = living.slice(0, 3);
  st.youngest = living.slice().reverse().slice(0, 3);
  st.longestLived = lifespans.slice(0, 5);
  st.avgLifespan = lifespans.length ? lifespans.reduce((a, b) => a + b.age, 0) / lifespans.length : 0;
  st.lifespanCount = lifespans.length;
  // births by decade (Gregorian)
  const decades = new Map();
  for (const id of ids) {
    const y = yearIn(P[id].b, 'g');
    if (!y) continue;
    const d = Math.floor(y.y / 10) * 10;
    decades.set(d, (decades.get(d) || 0) + 1);
  }
  st.decades = [...decades.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ d, n }));
  // places
  const places = new Map();
  for (const id of ids) {
    const pl = (P[id].bp || '').split(/[،,]/)[0].trim();
    if (!pl) continue;
    places.set(pl, (places.get(pl) || 0) + 1);
  }
  st.places = [...places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n }));
  // how complete the records are
  const withBirth = ids.filter(id => P[id].b).length;
  const withPhoto = ids.filter(id => P[id].photo).length;
  const deadNoDate = ids.filter(id => !ix.living(id) && !P[id].d && !tooOld(P[id])).length;
  st.complete = {
    birth: ids.length ? withBirth / ids.length : 0,
    photo: ids.length ? withPhoto / ids.length : 0,
    noBirth: ids.filter(id => !P[id].b),
    noMother: ids.filter(id => ix.father(id) && !ix.mother(id)),
    deadNoDate
  };
  return st;
}

/* ---------------- dates coming up ---------------- */
/** the next day (day number ≥ today) a yearly date falls on, in its own calendar */
function nextAnniversary(p, today) {
  if (p.cal === 'g') {
    const g = jdnToG(today);
    for (const y of [g.y, g.y + 1]) {
      const d = Math.min(p.d, gDaysInMonth(y, p.m));
      const j = gToJdn(y, p.m, d);
      if (j >= today) return { j, years: y - p.y };
    }
  } else {
    const h = jdnToH(today);
    for (const y of [h.y, h.y + 1]) {
      const j = hToJdn(y, p.m, Math.min(p.d, 30));
      if (j >= today) return { j, years: y - p.y };
    }
  }
  return null;
}
/**
 * birthdays of the living, anniversaries of passing (in the calendar they were recorded in), and
 * marriages, within `days` days: [{ kind: 'birth'|'death'|'marriage', id, other?, days, years, cal }]
 */
export function upcomingEvents(ix, { days = 45, now = new Date() } = {}) {
  const today = todayJdn(now);
  const out = [];
  for (const id in ix.P) {
    const p = ix.P[id];
    const b = exact(p.b);
    if (b && ix.living(id)) {
      const n = nextAnniversary(b, today);
      if (n && n.j - today <= days) out.push({ kind: 'birth', id, days: n.j - today, years: n.years, cal: b.cal, j: n.j });
    }
    const d = exact(p.d);
    if (d) {
      const n = nextAnniversary(d, today);
      if (n && n.j - today <= days && n.years > 0) out.push({ kind: 'death', id, days: n.j - today, years: n.years, cal: d.cal, j: n.j });
    }
  }
  for (const uid in ix.U) {
    const u = ix.U[uid];
    const m = exact(u.md);
    if (!m || !u.h || !u.w || u.st === 'd' || !ix.living(u.h) || !ix.living(u.w)) continue;
    const n = nextAnniversary(m, today);
    if (n && n.j - today <= days && n.years > 0) out.push({ kind: 'marriage', id: u.h, other: u.w, union: uid, days: n.j - today, years: n.years, cal: m.cal, j: n.j });
  }
  return out.sort((a, b) => a.days - b.days || a.kind.localeCompare(b.kind));
}
/** things that happened on this day (same Gregorian day and month) in years past */
export function onThisDay(ix, now = new Date()) {
  const m = now.getMonth() + 1, d = now.getDate();
  const out = [];
  for (const id in ix.P) {
    const p = ix.P[id];
    for (const [kind, s] of [['birth', p.b], ['death', p.d]]) {
      const x = exact(s);
      if (!x) continue;
      const r = rangeD(s); const g = jdnToG(r[0]);
      if (g.m === m && g.d === d && g.y < now.getFullYear()) out.push({ kind, id, year: g.y });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}
