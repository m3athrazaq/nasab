// What the tree viewer needs to show one family (the interactive file for relatives, and the view page
// opened by the link): names, the years and dates to show, lineage lines, positions among brothers and
// sisters. Phone numbers and emails are never part of it. photo(id) → a data: URL or '' (optional).
import { buildIndex } from '../core/model.js';
import { lang, fmtDate, lifeYears } from '../core/i18n.js';
import { lineageText, initial, mercy } from '../core/names.js';
import { defaultTitles } from './titles.js';

export function viewerData(s, { photo = null, hideLiving = true, notes = true, dKids = false, women = true, inside = false } = {}) {
  const ix = buildIndex(s);
  const root = s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me);
  if (!root) throw new Error('empty');
  const L = lang.value;
  // brothers and sisters in the app's order, as positions (birth dates of the living may be hidden):
  // o = place among the children of the same parents, r = place among all the father's children
  const pos = {}, rank = {};
  for (const u of Object.keys(ix.U)) ix.childrenOfUnion(u).forEach((c, i) => { pos[c] = i + 1; });
  for (const id of Object.keys(ix.P)) {
    if (ix.children(id).length && ix.P[id].g !== 'f') ix.orderedChildren(id).forEach((c, i) => { rank[c] = i + 1; });
  }
  const people = {};
  for (const [id, p] of Object.entries(ix.P)) {
    const dead = !ix.living(id);
    const show = !(hideLiving && !dead);
    const mw = dead && L === 'ar' && s.settings.mercy ? mercy(p.g) : '';
    people[id] = {
      n: p.n, g: p.g, i: initial(p.n || '؟'), pu: p.pu, o: pos[id] || 0, r: rank[id] || 0, at: p.at, fam: p.fam,
      dead, y: show ? lifeYears(p, dead && !p.d ? mw : '') : (dead ? mw : ''), mercy: mw,
      bk: show ? p.b : '', dk: p.d,
      b: show ? fmtDate(p.b) : '', d: fmtDate(p.d), bp: show ? p.bp : '', dp: p.dp, job: p.job,
      lin: lineageText(ix.paternalLine(id, 5).map(x => ix.P[x].n || '؟'), { gender: p.g, style: s.settings.style, family: ix.familyOf(id), lang: L }),
      note: notes ? p.note : ''
    };
    const ph = photo && p.photo ? photo(p.photo) : '';
    if (ph) people[id].ph = ph;
  }
  const unions = {};
  for (const [id, u] of Object.entries(ix.U)) unions[id] = { id, h: u.h, w: u.w, st: u.st, md: u.md, ord: u.ord };
  const titles = defaultTitles(ix, root);
  return { v: 1, lang: L, title: (titles.head ? titles.head + ' ' : '') + titles.title, sub: titles.sub, root, me: '', dKids, women, inside: !!inside, people, unions };
}
