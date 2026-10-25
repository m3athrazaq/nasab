// How two people are related, in Arabic kinship words (عم، خال، ابن عم، جد لأم…) and in English.
// relation(ix, a, b) answers "what is A to B": "سالم هو ابن عم خالد".

const W = {
  child: ['ابن', 'بنت'], grand: ['حفيد', 'حفيدة'], parent: ['والد', 'والدة'], gp: ['جد', 'جدة'],
  sib: ['أخ', 'أخت'], full: ['شقيق', 'شقيقة'], uncleP: ['عم', 'عمة'], uncleM: ['خال', 'خالة'], spouse: ['زوج', 'زوجة']
};
const w = (key, g) => W[key][g === 'f' ? 1 : 0];
const ORD_AR = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];

/**
 * every way up from a person to each ancestor (a few per ancestor): Map ancestor → [[id, …, ancestor]].
 * Several paths matter when cousins married: the same ancestor is reached through the father and the mother.
 */
function upPaths(ix, id, maxDepth = 16, cap = 4) {
  const m = new Map([[id, [[id]]]]);
  let frontier = [[id]];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    for (const path of frontier) {
      const x = path[path.length - 1];
      for (const p of [ix.father(x), ix.mother(x)]) {
        if (!p || path.includes(p)) continue;
        const np = [...path, p];
        if (!m.has(p)) m.set(p, []);
        const list = m.get(p);
        if (list.length >= cap) continue;
        list.push(np);
        next.push(np);
      }
    }
    frontier = next.length > 20000 ? next.slice(0, 20000) : next;
  }
  return m;
}
const gOf = (ix, id) => (ix.P[id] && ix.P[id].g === 'f' ? 'f' : 'm');

/**
 * words for "A is ___ of B" when B's line goes up `pathB` (B … LCA) and A's line `pathA` (A … LCA).
 * returns { words: [...], tail: ['لأبيه'] optional qualifier after B's name }
 */
function bloodWords(ix, pathA, pathB) {
  const up = pathB.length - 1, down = pathA.length - 1;
  const A = pathA[0], B = pathB[0];
  if (up === 0) {
    // A is a descendant of B
    if (down === 1) return { words: [w('child', gOf(ix, A))] };
    const words = [];
    for (let i = 0; i < down - 2; i++) words.push(w('child', gOf(ix, pathA[i])));
    words.push(w('grand', gOf(ix, pathA[down - 2])));
    return { words };
  }
  if (down === 0) {
    // A is an ancestor of B: B's line pathB = [B, parent, …, A]
    if (up === 1) return { words: [w('parent', gOf(ix, A))] };
    if (up === 2) return { words: [w('gp', gOf(ix, A))], side: gOf(ix, pathB[1]) };
    const words = [];
    // from A down: A is "والد" of the next … the last two before B as جد
    for (let i = up; i > 2; i--) words.push(w('parent', gOf(ix, pathB[i])));
    words.push(w('gp', gOf(ix, pathB[2])));
    return { words, side: gOf(ix, pathB[1]) };
  }
  // collateral: JA (A's line, child of the LCA) and JB (B's line, child of the LCA) are siblings
  const JA = pathA[down - 1], JB = pathB[up - 1];
  const words = [];
  // A up to JA: "ابن"/"بنت" steps; three or more end in حفيد ("ابن حفيد أخ…")
  const k0 = down - 1;
  if (k0 >= 3) { for (let i = 0; i < k0 - 2; i++) words.push(w('child', gOf(ix, pathA[i]))); words.push(w('grand', gOf(ix, pathA[k0 - 2]))); }
  else for (let i = 0; i < k0; i++) words.push(w('child', gOf(ix, pathA[i])));
  let tail = null;
  if (up === 1) {
    // JA is B's brother/sister
    const kind = siblingKind(ix, JA, JB);
    if (down === 1 && kind === 'full') words.push(w('full', gOf(ix, JA)));
    else { words.push(w('sib', gOf(ix, JA))); if (down === 1 && kind !== 'full') tail = kind; }
  } else {
    // JA is an uncle/aunt of P (B's ancestor at up-2; B itself when up = 2)
    words.push(gOf(ix, JB) === 'f' ? w('uncleM', gOf(ix, JA)) : w('uncleP', gOf(ix, JA)));
    // P relative to B
    const k = up - 2;
    if (k === 1) words.push(w('parent', gOf(ix, pathB[1])));
    else if (k >= 2) {
      for (let i = k; i > 2; i--) words.push(w('parent', gOf(ix, pathB[i])));
      words.push(w('gp', gOf(ix, pathB[2])));
    }
  }
  return { words, half: tail };
}
function siblingKind(ix, a, b) {
  const pa = ix.P[a].pu, pb = ix.P[b].pu;
  if (pa && pa === pb) return 'full';
  if (ix.father(a) && ix.father(a) === ix.father(b)) return 'paternal';
  if (ix.mother(a) && ix.mother(a) === ix.mother(b)) return 'maternal';
  return 'full';
}

/* ---------------- English ---------------- */
const greats = n => (n <= 0 ? '' : n === 1 ? 'great-' : n === 2 ? 'great-great-' : `${n}× great-`);
const ordEn = n => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] || n + 'th';
const removedEn = n => (n === 0 ? '' : n === 1 ? ' once removed' : n === 2 ? ' twice removed' : ` ${n} times removed`);
function bloodEn(ix, pathA, pathB) {
  const up = pathB.length - 1, down = pathA.length - 1;
  const f = gOf(ix, pathA[0]) === 'f';
  if (up === 0) {
    if (down === 1) return f ? 'daughter' : 'son';
    return greats(down - 2) + (f ? 'granddaughter' : 'grandson');
  }
  if (down === 0) {
    const side = up >= 2 ? (gOf(ix, pathB[1]) === 'f' ? 'maternal ' : 'paternal ') : '';
    if (up === 1) return f ? 'mother' : 'father';
    return side + greats(up - 2) + (f ? 'grandmother' : 'grandfather');
  }
  if (up === 1 && down === 1) {
    const k = siblingKind(ix, pathA[0], pathB[0]);
    return (k === 'full' ? '' : k === 'paternal' ? 'paternal half-' : 'maternal half-') + (f ? 'sister' : 'brother');
  }
  const side = up >= 2 ? (gOf(ix, pathB[up - 1]) === 'f' ? 'maternal ' : 'paternal ') : '';
  if (down === 1) return side + greats(up - 2) + (f ? 'aunt' : 'uncle');
  if (up === 1) return greats(down - 2) + (down > 2 ? 'grand' : '') + (f ? 'niece' : 'nephew');
  const deg = Math.min(up, down) - 1, rem = Math.abs(up - down);
  return side + ordEn(deg) + ' cousin' + removedEn(rem);
}

/**
 * what A is to B. Returns null when unrelated, else
 * { kind: 'self'|'blood'|'spouse'|'inlaw', words, half, side, en, degree, path, lca, alt: [relations…] }
 * words are Arabic nouns in construct order: words.join(' ') + ' ' + nameOfB.
 */
export function relation(ix, a, b) {
  if (!a || !b || !ix.P[a] || !ix.P[b]) return null;
  if (a === b) return { kind: 'self', words: [], en: 'self', degree: 0, path: [a] };
  const blood = bloodRelations(ix, a, b);
  let spouse = null;
  for (const uid of ix.unions(a)) {
    if (ix.partnerIn(uid, a) === b) {
      const st = ix.U[uid].st;
      spouse = { kind: 'spouse', words: [w('spouse', gOf(ix, a))], former: st === 'd', en: (gOf(ix, a) === 'f' ? 'wife' : 'husband') + (st === 'd' ? ' (former)' : ''), degree: 0, path: [a, b] };
      break;
    }
  }
  // "زوج جدة…" for one's own grandfather, "ابن زوجة…" for one's own son: true but empty, left out
  const isAnc = blood.some(r => r.down === 0), isDesc = blood.some(r => r.up === 0);
  const inlaws = inlawRelations(ix, a, b).filter(r => !(isAnc && r.how === 'spouseOf') && !(isDesc && r.how === 'ofSpouse'));
  const main = spouse || blood[0] || inlaws[0];
  if (!main) return null;
  const alt = [...(spouse ? [spouse] : []), ...blood, ...inlaws].filter(x => x !== main);
  return { ...main, alt: alt.slice(0, 3) };
}
/** husband/wife of a blood relative of B ("زوجة أخ خالد"), or a blood relative of B's husband/wife ("والد زوجة خالد") */
function inlawRelations(ix, a, b) {
  const out = [];
  for (const s of ix.spouses(a)) {
    if (s === b) continue;
    const r = bloodRelations(ix, s, b)[0];
    if (r) out.push({ kind: 'inlaw', words: [w('spouse', gOf(ix, a)), ...r.words], half: r.half, side: r.side, en: inlawEn(ix, a, 'spouseOf', r), degree: r.degree, path: [a, ...r.path], via: s, how: 'spouseOf' });
  }
  for (const s of ix.spouses(b)) {
    if (s === a) continue;
    const r = bloodRelations(ix, a, s)[0];
    if (r) out.push({ kind: 'inlaw', words: [...r.words, w('spouse', gOf(ix, s))], half: r.half, en: inlawEn(ix, a, 'ofSpouse', r), degree: r.degree, path: [...r.path, b], via: s, how: 'ofSpouse' });
  }
  return out.sort((x, y) => x.degree - y.degree);
}
function inlawEn(ix, a, how, r) {
  const f = gOf(ix, a) === 'f';
  if (how === 'spouseOf') {
    if (r.en === 'father') return 'stepmother';
    if (r.en === 'mother') return 'stepfather';
    if (/^(brother|sister|paternal half-|maternal half-)/.test(r.en)) return f ? 'sister-in-law' : 'brother-in-law';
    if (r.en === 'son') return 'daughter-in-law';
    if (r.en === 'daughter') return 'son-in-law';
    return (f ? 'wife' : 'husband') + ' of ' + r.en;
  }
  if (r.en === 'father' || r.en === 'mother') return f ? 'mother-in-law' : 'father-in-law';
  if (/^(brother|sister|paternal half-|maternal half-)/.test(r.en)) return f ? 'sister-in-law' : 'brother-in-law';
  if (r.en === 'son' || r.en === 'daughter') return 'step' + r.en;
  return r.en + ' of the spouse';
}

function bloodRelations(ix, a, b) {
  const ua = upPaths(ix, a), ub = upPaths(ix, b);
  const cands = [];
  for (const [c, pathsA] of ua) {
    const pathsB = ub.get(c);
    if (!pathsB) continue;
    for (const pa of pathsA) for (const pb of pathsB) {
      // the lines meet only at c (c is their lowest common ancestor on these paths)
      const setA = new Set(pa.slice(0, -1));
      if (pb.slice(0, -1).some(x => setA.has(x))) continue;
      cands.push({ c, pathA: pa, pathB: pb, up: pb.length - 1, down: pa.length - 1 });
    }
  }
  // nearest first; on a tie the father's side first
  const side = k => (k.pathB.length > 1 && gOf(ix, k.pathB[1]) === 'f' ? 1 : 0) + (k.pathA.length > 1 && gOf(ix, k.pathA[1]) === 'f' ? 1 : 0);
  cands.sort((x, y) => (x.up + x.down) - (y.up + y.down) || x.up - y.up || side(x) - side(y));
  const out = [];
  const seen = new Set();
  for (const k of cands) {
    const r = bloodWords(ix, k.pathA, k.pathB);
    const key = r.words.join(' ') + '|' + (r.half || '') + '|' + (r.side || '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'blood', words: r.words, half: r.half || null, side: r.side || null, en: bloodEn(ix, k.pathA, k.pathB), up: k.up, down: k.down, degree: k.up + k.down, lca: k.c, path: [...k.pathA, ...k.pathB.slice(0, -1).reverse()] });
    if (out.length >= 3) break;
  }
  return out;
}

/* ---------------- sentences ---------------- */
/** "ابن عم خالد" / "جد خالد لأبيه" / "أخ خالد لأمه" */
export function phraseAr(r, nameB, gB = 'm') {
  if (!r) return '';
  if (r.kind === 'self') return 'هو نفسه';
  const pro = gB === 'f' ? 'ها' : 'ه';
  let s = r.words.join(' ') + ' ' + nameB;
  if (r.side) s += r.side === 'f' ? ' لأم' + pro : ' لأبي' + pro;
  if (r.half === 'paternal') s += ' لأبي' + pro;
  else if (r.half === 'maternal') s += ' لأم' + pro;
  if (r.former) s += ' سابقاً';
  return s;
}
/** the same, said to the user ("ابن عمك", "جدك لأبيك", "أخوك لأمك") */
export function phraseYou(r) {
  if (!r) return '';
  if (r.kind === 'self') return 'أنت';
  const ws = r.words.slice();
  if (!ws.length) return '';
  let last = ws.pop();
  if (last === 'أخ') last = ws.length ? 'أخي' : 'أخو';
  last = last.endsWith('ة') ? last.slice(0, -1) + 'تك' : last + 'ك';
  let s = [...ws, last].join(' ');
  if (r.side) s += r.side === 'f' ? ' لأمك' : ' لأبيك';
  if (r.half === 'paternal') s += ' لأبيك';
  else if (r.half === 'maternal') s += ' لأمك';
  if (r.former) s += ' سابقاً';
  return s;
}
/** "قرابة من الدرجة الرابعة" */
export function degreeAr(n) { return n > 0 ? 'قرابة من الدرجة ' + (ORD_AR[n] || n) : ''; }
export function degreeEn(n) { return n > 0 ? `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}-degree relative` : ''; }
