// How a sync change is said: in the notice the app shows ("Changes from the computer: 1 person added
// (Ziad)") and in the commit message in the repository ("الكمبيوتر: أُضيف فرد واحد (زياد) — الراشد").
// Shared by the app and by the tool Claude edits with, so the history reads the same whoever wrote it.
import { t, count } from './i18n.js';
import { diffFamily } from './sync-merge.js';

/** a writer's name as people read it: a kind of device, Claude, or as written */
export const byName = by => (['phone', 'iphone', 'computer', 'claude'].includes(by) ? t('by_' + by) : by || t('by_other'));

/** "2 added (Ziad, Salem), 1 edited (Khaled)" — the names when there are three or fewer */
export function changesText(d) {
  const part = (key, ids) => {
    const nm = ids.length <= 3 ? ids.map(d.name).filter(Boolean).join(t('list_sep')) : '';
    return t(key, { n: count(ids.length, 'person') }) + (nm ? ` (${nm})` : '');
  };
  const parts = [];
  if (d.added.length) parts.push(part('sync_added', d.added));
  if (d.edited.length) parts.push(part('sync_edited', d.edited));
  if (d.removed.length) parts.push(part('sync_removed', d.removed));
  if (!parts.length && (d.unions || d.meta)) parts.push(t('sync_links'));
  return parts.join(t('list_sep'));
}
/** what arrived, one line per family */
export function newsText(news) {
  const out = [];
  for (const n of news) {
    const who = byName(n.by);
    if (n.kind === 'added') out.push(t('sync_news_family', { who, name: n.fname || t('family_unnamed'), n: count(n.diff.added.length, 'person') }));
    else if (n.kind === 'removed') out.push(t('sync_news_family_gone', { name: n.fname || t('family_unnamed') }));
    else if (n.diff && n.diff.any) out.push(t('sync_news', { who, what: changesText(n.diff) }));
  }
  return out.join('\n');
}
/** the commit message of one write */
export function commitText(info, by) {
  const who = byName(by);
  if (info.kind === 'photo') return `${who}: ${t('sync_c_photo')}`;
  if (info.kind === 'share') return `${who}: ${t('sync_c_share')}`;
  if (info.kind === 'sharecfg') return `${who}: ${t('sync_c_sharecfg')}`;
  const fam = (info.after && info.after.fname) || (info.before && info.before.fname) || '';
  const tail = fam ? ` — ${fam}` : '';
  if (info.kind === 'removed') return `${who}: ${t('sync_c_family_gone')}${tail}`;
  if (info.kind === 'added') return `${who}: ${t('sync_c_family', { n: count(Object.keys(info.after.people).length, 'person') })}${tail}`;
  return `${who}: ${changesText(diffFamily(info.before, info.after)) || t('sync_links')}${tail}`;
}
