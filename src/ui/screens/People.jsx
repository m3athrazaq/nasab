// Everyone in the family: search by name and father ("محمد أحمد"), filter, grouped by generation.
import { useState, useMemo } from 'preact/hooks';
import { state } from '../../core/store.js';
import { t, num, count, byName } from '../../core/i18n.js';
import { searchPeople, generations } from '../../core/model.js';
import { sortKeyD } from '../../core/dates.js';
import { IX, ROOT, openAdd } from '../app-state.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, PersonRow, Empty } from '../kit.jsx';
import { yearsOf, relToMe } from '../people.js';

const FILTERS = ['all', 'm', 'f', 'living', 'dead'];
const SORTS = ['gen', 'name', 'birth'];

export function PeopleScreen() {
  const s = state.value, ix = IX.value, root = ROOT.value;
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('all');
  const [sort, setSort] = useState('gen');
  const gens = useMemo(() => generations(ix, root), [ix, root]);
  const ids = useMemo(() => {
    let list = q.trim() ? searchPeople(ix, q, 2000) : Object.keys(ix.P);
    if (flt === 'm' || flt === 'f') list = list.filter(id => ix.P[id].g === flt);
    else if (flt === 'living') list = list.filter(id => ix.living(id));
    else if (flt === 'dead') list = list.filter(id => !ix.living(id));
    return list;
  }, [ix, q, flt]);
  const groups = useMemo(() => {
    if (q.trim()) return [{ key: 'q', title: '', ids }];
    const cmpName = (a, b) => byName(ix.P[a].n, ix.P[b].n);
    const cmpBirth = (a, b) => sortKeyD(ix.P[a].b) - sortKeyD(ix.P[b].b) || cmpName(a, b);
    if (sort === 'name') return [{ key: 'n', title: '', ids: ids.slice().sort(cmpName) }];
    if (sort === 'birth') return [{ key: 'b', title: '', ids: ids.slice().sort(cmpBirth) }];
    const by = new Map();
    for (const id of ids) {
      const g = gens.get(id) || 0;
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(id);
    }
    return [...by.keys()].sort((a, b) => (a || 99) - (b || 99)).map(g => ({ key: 'g' + g, title: g ? t('gen_n_long', { n: num(g) }) : t('gen_none'), ids: by.get(g).sort(cmpBirth) }));
  }, [ids, sort, gens, q]);
  const total = Object.keys(ix.P).length;
  return (
    <div class="screen">
      <TopBar title={t('tab_people')} actions={<button class="iconbtn" onClick={() => go('settings')} aria-label={t('settings')}><Icon name="gear" /></button>} />
      <div class="wrap">
        <div class="search"><Icon name="search" /><input value={q} onInput={e => setQ(e.currentTarget.value)} placeholder={t('search_ph')} aria-label={t('search_ph')} type="search" /></div>
        <div class="chips" style="margin-top:12px">
          {FILTERS.map(f => <button key={f} class="chip" aria-pressed={flt === f ? 'true' : 'false'} onClick={() => setFlt(f)}>{t('flt_' + f)}</button>)}
        </div>
        {!q.trim() && (
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px" class="small muted">
            <span style="flex:1">{count(ids.length, 'person')}{ids.length !== total ? ' ' + t('of_total', { n: num(total) }) : ''}</span>
            <span>{t('sort_by')}</span>
            <select class="input sm" value={sort} onChange={e => setSort(e.currentTarget.value)} aria-label={t('sort_by')}>
              {SORTS.map(x => <option key={x} value={x}>{t('sort_' + x)}</option>)}
            </select>
          </div>
        )}
        {!total && <Empty icon="people" title={t('people_empty_t')} text={t('people_empty_p')} />}
        {total > 0 && !ids.length && <Empty icon="search" title={t('no_results')} text={t('search_tip')} />}
        {groups.map(g => g.ids.length > 0 && (
          <div key={g.key}>
            {g.title && <div class="group-h">{g.title}<span class="aside">{num(g.ids.length)}</span></div>}
            <div class="list" style={g.title ? '' : 'margin-top:12px'}>
              {g.ids.slice(0, 600).map(id => <PersonRow key={id} id={id} meta={[yearsOf(id), s.me && id !== s.me ? relToMe(id) : ''].filter(Boolean).join(' — ')} onClick={() => go('person/' + id)} />)}
            </div>
          </div>
        ))}
      </div>
      <button class="fab" onClick={() => openAdd('person')}><Icon name="userPlus" /><span>{t('add_person')}</span></button>
    </div>
  );
}
