// What a chart shows about each person: the name, the initial in the seal, years, photo, spouses.
import { lifeYears, lang } from '../core/i18n.js';
import { initial, mercy } from '../core/names.js';

/**
 * opts: { hideLiving: hide the dates of living people (privacy in shared files), photos: Map|Set of
 * photo ids available (others are drawn as initials) }
 */
export function makeInfo(ix, s, { hideLiving = false, photoIds = null } = {}) {
  const cache = new Map();
  const L = lang.value;
  return id => {
    if (cache.has(id)) return cache.get(id);
    const p = ix.P[id];
    if (!p) return null;
    const dead = !ix.living(id);
    const showDates = !(hideLiving && !dead);
    const mw = s.settings.mercy && L === 'ar' ? mercy(p.g, 'ar') : '';
    const years = showDates ? lifeYears(p, dead && !p.d ? mw : '') : (dead ? mw : '');
    const sp = ix.spouses(id).map(x => ix.P[x].n).filter(Boolean);
    let spouses = '';
    if (sp.length) {
      if (L === 'ar') spouses = (p.g === 'f' ? 'زوجها ' : sp.length > 1 ? 'زوجاته: ' : 'زوجته ') + sp.join('، ');
      else spouses = '∞ ' + sp.join(', ');
    }
    const info = {
      name: p.n || '؟', initial: initial(p.n || '؟'), years, dead, g: p.g,
      photo: p.photo && (!photoIds || photoIds.has(p.photo)) ? p.photo : '', spouses
    };
    cache.set(id, info);
    return info;
  };
}
