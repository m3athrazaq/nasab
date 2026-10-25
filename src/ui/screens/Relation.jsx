// "What is he to me?" — the relation between two people in Arabic kinship words, with the path
// through the family that makes it.
import { useMemo } from 'preact/hooks';
import { state } from '../../core/store.js';
import { t, lang } from '../../core/i18n.js';
import { relation, phraseAr, phraseYou, degreeAr, degreeEn } from '../../core/kinship.js';
import { IX, pickPerson } from '../app-state.js';
import { go, route } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, Seal, Empty } from '../kit.jsx';
import { nameOf, yearsOf } from '../people.js';

export function RelationScreen() {
  const s = state.value, ix = IX.value;
  const q = route.value.query;
  const a = q.get('a') && ix.P[q.get('a')] ? q.get('a') : '';
  const b = q.get('b') && ix.P[q.get('b')] ? q.get('b') : (s.me && ix.P[s.me] && s.me !== a ? s.me : '');
  const set = (na, nb) => go('relation?' + new URLSearchParams({ ...(na ? { a: na } : {}), ...(nb ? { b: nb } : {}) }).toString(), true);
  const r = useMemo(() => (a && b ? relation(ix, a, b) : null), [ix, a, b]);
  const ar = lang.value === 'ar';
  const Slot = ({ id, label, onPick }) => (
    <button class="slot" onClick={() => pickPerson({ title: label, onPick })}>
      {id ? <Seal id={id} /> : <span class="seal" style="--c:var(--ink-3)"><Icon name="plus" /></span>}
      <span class="nm">{id ? nameOf(id) : t('choose')}</span>
      <span class="lb">{label}</span>
    </button>
  );
  const sentence = (rel, x, y) => {
    if (!rel) return '';
    if (ar) return phraseAr(rel, nameOf(y), ix.P[y].g);
    return `${nameOf(y)}'s ${rel.en}`;
  };
  return (
    <div class="screen">
      <TopBar title={t('tab_relation')} />
      <div class="wrap">
        <p class="lead" style="margin-top:0">{t('relation_lead')}</p>
        <div class="relpick" style="margin-top:14px">
          <Slot id={a} label={t('rel_a')} onPick={x => set(x, b)} />
          <button class="iconbtn" onClick={() => set(b, a)} aria-label={t('swap')}><Icon name="swap" /></button>
          <Slot id={b} label={t('rel_b')} onPick={x => set(a, x)} />
        </div>
        {a && b && !r && <div class="card relout"><p class="big" style="font-size:20px">{t('not_related')}</p><p class="muted small">{t('not_related_p')}</p></div>}
        {r && (
          <div class="card relout">
            <div class="big">{nameOf(a)} {ar ? (ix.P[a].g === 'f' ? 'هي' : 'هو') : 'is'} <em>{sentence(r, a, b)}</em></div>
            {b === s.me && ar && r.kind !== 'self' && <p class="muted" style="margin:6px 0 0">{t('in_short')}: <b class="naskh">{phraseYou(r)}</b></p>}
            {!ar && r.kind === 'blood' && <p class="muted small" style="margin:6px 0 0">{r.en}</p>}
            {r.kind === 'blood' && r.degree > 0 && <p class="small faint" style="margin:6px 0 0">{ar ? degreeAr(r.degree) : degreeEn(r.degree)}</p>}
            {(r.kind === 'inlaw' || r.kind === 'spouse') && <p class="small faint" style="margin:6px 0 0">{t('by_marriage')}</p>}
            {r.alt && r.alt.length > 0 && (
              <div style="margin-top:14px;border-top:1px solid var(--rule);padding-top:12px">
                <p class="small muted" style="margin:0 0 4px">{t('also')}</p>
                {r.alt.map((x, i) => <p key={i} class="naskh" style="margin:2px 0;font-weight:700;font-size:17px">{sentence(x, a, b)}</p>)}
              </div>
            )}
            <Path r={r} />
          </div>
        )}
        {!a && <Empty icon="link" title={t('relation_empty_t')} text={t('relation_empty_p')} />}
      </div>
    </div>
  );
}

/** the chain of people from A up to the common ancestor and down to B */
function Path({ r }) {
  if (!r.path || r.path.length < 2) return null;
  const path = r.path;
  const topIdx = r.kind === 'blood' ? r.down : -1;
  return (
    <div class="path">
      {path.map((id, i) => (
        <div key={id + i} style="display:flex;flex-direction:column;align-items:center">
          {i > 0 && <div class={'bar' + (i <= topIdx ? ' up' : '')} />}
          <button class="step" style="border:0;background:none;padding:2px" onClick={() => go('person/' + id)}>
            <Seal id={id} size="sm" />
            <span class="nm">{nameOf(id)}</span>
            {i === topIdx && <span class="pill gold">{t('common_ancestor')}</span>}
            <span class="small faint">{yearsOf(id)}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
