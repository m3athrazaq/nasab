// The family in figures, and the dates coming up: birthdays, anniversaries of passing (in the calendar
// they were recorded in), weddings; what happened on this day; what is still missing.
import { useMemo } from 'preact/hooks';
import { state } from '../../core/store.js';
import { t, num, count, pct, fmtInDays, lang, dig } from '../../core/i18n.js';
import { familyStats, upcomingEvents, onThisDay } from '../../core/stats.js';
import { IX, ROOT } from '../app-state.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, PersonRow, Empty } from '../kit.jsx';
import { nameOf, yearsOf } from '../people.js';

export function StatsScreen() {
  const s = state.value, ix = IX.value, root = ROOT.value;
  const st = useMemo(() => familyStats(ix, root), [ix, root]);
  const ev = useMemo(() => upcomingEvents(ix, { days: 60 }), [ix]);
  const today = useMemo(() => onThisDay(ix), [ix]);
  const ar = lang.value === 'ar';
  if (!st.total) return <div class="screen"><TopBar title={t('tab_stats')} /><div class="wrap"><Empty icon="chart" title={t('people_empty_t')} text={t('people_empty_p')} /></div></div>;
  const maxGen = Math.max(1, ...st.perGen);
  const maxDec = Math.max(1, ...st.decades.map(d => d.n));
  return (
    <div class="screen">
      <TopBar title={t('tab_stats')} actions={<button class="iconbtn" onClick={() => go('settings')} aria-label={t('settings')}><Icon name="gear" /></button>} />
      <div class="wrap">
        <div class="card pad">
          <p class="glance" style="margin:0">
            {ar ? <>
              في العائلة <b>{count(st.total, 'person')}</b>، منهم <b>{count(st.m, 'male')}</b> و<b>{count(st.f, 'female')}</b>.
              {' '}الأحياء <b>{num(st.living)}</b> والمتوفون <b>{num(st.dead)}</b> رحمهم الله.
              {st.generations > 0 && <> تمتد الشجرة <b>{count(st.generations, 'generation')}</b> من الجد الأعلى.</>}
            </> : <>
              The family has <b>{count(st.total, 'person')}</b>: <b>{num(st.m)}</b> men and <b>{num(st.f)}</b> women; <b>{num(st.living)}</b> living and <b>{num(st.dead)}</b> deceased.
              {st.generations > 0 && <> The tree spans <b>{count(st.generations, 'generation')}</b>.</>}
            </>}
          </p>
        </div>

        <div class="section">
          <h2>{t('upcoming')}</h2>
          {!ev.length && <div class="card pad small muted">{t('upcoming_none')}</div>}
          {ev.length > 0 && <div class="list">
            {ev.slice(0, 12).map((e, i) => (
              <PersonRow key={i} id={e.id} onClick={() => go('person/' + e.id)}
                meta={(e.kind === 'birth' ? t('ev_birth', { n: dig(e.years) }) : e.kind === 'death' ? t('ev_death', { n: dig(e.years) }) : t('ev_marriage', { n: dig(e.years), name: nameOf(e.other) })) + (e.cal === 'h' ? ' ' + t('by_hijri') : '')}
                end={<span class={'pill' + (e.days === 0 ? ' red' : '')}>{fmtInDays(e.days)}</span>} chevron={false} />
            ))}
          </div>}
        </div>

        {today.length > 0 && (
          <div class="section">
            <h2>{t('on_this_day')}</h2>
            <div class="list">
              {today.slice(0, 6).map((e, i) => <PersonRow key={i} id={e.id} meta={t(e.kind === 'birth' ? 'otd_birth' : 'otd_death', { y: dig(e.year) })} onClick={() => go('person/' + e.id)} chevron={false} />)}
            </div>
          </div>
        )}

        {st.perGen.length > 1 && (
          <div class="section">
            <h2>{t('per_generation')}</h2>
            <div class="card pad bars">
              {st.perGen.map((n, i) => <div class="b" key={i}><span>{t('gen_n', { n: num(i + 1) })}</span><i style={{ width: (n / maxGen) * 100 + '%' }} /><span class="v">{num(n)}</span></div>)}
            </div>
          </div>
        )}

        {(st.namesM.length > 0 || st.namesF.length > 0) && (
          <div class="section">
            <h2>{t('common_names')}</h2>
            <div class="namechips">
              {[...st.namesM.slice(0, 6), ...st.namesF.slice(0, 4)].map(n => <span key={n.name}>{n.name}<small>{t('times_n', { n: count(n.n, 'time') })}</small></span>)}
            </div>
            <p class="hint">{t('names_hint')}</p>
          </div>
        )}

        <div class="section">
          <h2>{t('records')}</h2>
          <div class="list">
            {st.mostChildren[0] && <PersonRow id={st.mostChildren[0].id} meta={t('most_children', { n: count(st.mostChildren[0].n, 'child') })} onClick={() => go('person/' + st.mostChildren[0].id)} />}
            {st.oldestLiving[0] && <PersonRow id={st.oldestLiving[0].id} meta={t('oldest_living', { n: count(st.oldestLiving[0].age, 'year') })} onClick={() => go('person/' + st.oldestLiving[0].id)} />}
            {st.longestLived[0] && <PersonRow id={st.longestLived[0].id} meta={t('longest_lived', { n: count(st.longestLived[0].age, 'year') })} onClick={() => go('person/' + st.longestLived[0].id)} />}
            {st.youngest[0] && <PersonRow id={st.youngest[0].id} meta={t('youngest')} onClick={() => go('person/' + st.youngest[0].id)} />}
          </div>
          <div class="card pad small" style="margin-top:10px;display:grid;gap:8px">
            {st.avgChildren > 0 && <div>{t('avg_children', { n: num(st.avgChildren, 1) })}</div>}
            {st.lifespanCount > 1 && <div>{t('avg_lifespan', { n: count(Math.round(st.avgLifespan), 'year'), k: num(st.lifespanCount) })}</div>}
            {st.marriages > 0 && <div>{t('marriages_n', { n: count(st.marriages, 'marriage') })}{st.polygamous ? ' ' + t('polygamous_n', { n: num(st.polygamous) }) : ''}</div>}
            {st.cousinMarriages > 0 && <div>{t('cousin_marriages', { n: num(st.cousinMarriages) })}</div>}
          </div>
        </div>

        {st.decades.length > 1 && (
          <div class="section">
            <h2>{t('births_by_decade')}</h2>
            <div class="card pad bars">
              {st.decades.map(d => <div class="b" key={d.d}><span>{dig(d.d)}{ar ? 'ات' : 's'}</span><i style={{ width: (d.n / maxDec) * 100 + '%', background: 'var(--palm)' }} /><span class="v">{num(d.n)}</span></div>)}
            </div>
          </div>
        )}

        {st.places.length > 0 && (
          <div class="section">
            <h2>{t('birth_places')}</h2>
            <div class="namechips">{st.places.map(p => <span key={p.name} style="font-family:var(--font);font-weight:500;font-size:15px">{p.name}<small>{num(p.n)}</small></span>)}</div>
          </div>
        )}

        <div class="section">
          <h2>{t('completeness')}</h2>
          <div class="card pad">
            <div class="small" style="display:flex;justify-content:space-between"><span>{t('with_birth')}</span><span>{pct(st.complete.birth)}</span></div>
            <div class="meter" style="margin:6px 0 12px"><i style={{ width: st.complete.birth * 100 + '%' }} /></div>
            <div class="small" style="display:flex;justify-content:space-between"><span>{t('with_photo')}</span><span>{pct(st.complete.photo)}</span></div>
            <div class="meter" style="margin:6px 0 4px"><i style={{ width: st.complete.photo * 100 + '%' }} /></div>
          </div>
          {st.complete.noMother.length > 0 && <p class="hint">{t('no_mother_n', { n: count(st.complete.noMother.length, 'person') })}</p>}
          {st.complete.noBirth.length > 0 && (
            <details style="margin-top:8px">
              <summary class="small muted" style="cursor:pointer">{t('no_birth_n', { n: count(st.complete.noBirth.length, 'person') })}</summary>
              <div class="list" style="margin-top:8px">{st.complete.noBirth.slice(0, 40).map(id => <PersonRow key={id} id={id} meta={yearsOf(id)} onClick={() => go('edit/' + id)} />)}</div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
