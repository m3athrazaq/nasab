// The title a family tree gets unless the user wrote his own — shared by the posters, the interactive
// file and the view page for relatives (kept apart from the drawing code, so the view page stays small).
import { lang, num, lifeYears } from '../core/i18n.js';
import { familyTitle, lineageText } from '../core/names.js';

const ORDINAL_AR = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
/** "الجيل الثالث" / "generation 3" */
export function genName(n) {
  if (lang.value === 'ar') return 'الجيل ' + (ORDINAL_AR[n] || num(n));
  return 'generation ' + n;
}
/** the title and subtitle a tree gets unless the user wrote his own (fromGen: drawn from that generation down) */
export function defaultTitles(ix, root, fromGen = 1) {
  const p = ix.P[root];
  if (!p) return { head: '', title: '', sub: '' };
  const fam = ix.familyOf(root);
  const ar = lang.value === 'ar';
  const line = ix.paternalLine(root, 3).map(x => ix.P[x].n);
  const lin = lineageText(line, { gender: p.g, style: 'bin', lang: lang.value });
  const yrs = lifeYears(p);
  const from = fromGen > 1 ? (ar ? ' — من ' + genName(fromGen) : ', from ' + genName(fromGen)) : '';
  if (ar) return { head: fam ? 'شجرة عائلة' : 'شجرة', title: fam ? familyTitle(fam) : 'ذرية ' + p.n, sub: 'ذرية الجد ' + lin + (yrs ? ' (' + yrs + ')' : '') + from };
  return { head: 'The family tree of', title: fam ? (fam.replace(/^(آل|ال)\s?/, '') || fam) : p.n, sub: 'Descendants of ' + lin + (yrs ? ' (' + yrs + ')' : '') + from };
}
