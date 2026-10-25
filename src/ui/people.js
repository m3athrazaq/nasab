// How people are named on screen: first name, lineage ("خالد بن راشد بن محمد"), years, and
// what someone is to the user ("ابن عمك").
import { state } from '../core/store.js';
import { IX } from './app-state.js';
import { lineageText, mercy } from '../core/names.js';
import { lifeYears, lang, t } from '../core/i18n.js';
import { relation, phraseYou, phraseAr } from '../core/kinship.js';

export const nameOf = id => { const p = IX.value.P[id]; return p && p.n ? p.n : '؟'; };
/** the person and his fathers: depth names in all (settings), with the family name when asked */
export function lineOf(id, { depth, family = false, style } = {}) {
  const ix = IX.value, s = state.value.settings;
  const p = ix.P[id];
  if (!p) return '';
  const d = depth != null ? depth : s.depth || 50;
  const names = ix.paternalLine(id, d || 50).map(x => ix.P[x].n || '؟');
  return lineageText(names, { gender: p.g, style: style || s.style, family: family ? ix.familyOf(id) : '', lang: lang.value });
}
/** lineage without the person's own name: "بن راشد بن محمد الراشد" */
export function lineTail(id, { depth } = {}) {
  const ix = IX.value, s = state.value.settings;
  const p = ix.P[id];
  if (!p) return '';
  const d = (depth != null ? depth : s.depth || 50);
  const names = ix.paternalLine(id, d || 50).map(x => ix.P[x].n || '؟');
  if (names.length < 2) return ix.familyOf(id) || '';
  const full = lineageText(names, { gender: p.g, style: s.style, family: ix.familyOf(id), lang: lang.value });
  return full.slice(names[0].length).trim();
}
export function yearsOf(id) {
  const ix = IX.value, p = ix.P[id];
  if (!p) return '';
  const dead = !ix.living(id);
  return lifeYears(p, dead && !p.d && state.value.settings.mercy && lang.value === 'ar' ? mercy(p.g) : '');
}
/** "ابن عمك" — what this person is to the user (empty when unknown) */
export function relToMe(id) {
  const ix = IX.value, me = state.value.me;
  if (!me || !ix.P[me] || id === me) return id === me ? t('you') : '';
  const r = relation(ix, id, me);
  if (!r) return '';
  if (lang.value === 'ar') return phraseYou(r);
  return 'your ' + r.en;
}
/** "ابن عم خالد" — what a is to b */
export function relPhrase(a, b) {
  const ix = IX.value;
  const r = relation(ix, a, b);
  if (!r) return { r: null, text: '' };
  if (lang.value === 'ar') return { r, text: phraseAr(r, ix.P[b].n || '؟', ix.P[b].g) };
  return { r, text: `${ix.P[b].n}'s ${r.en}` };
}
