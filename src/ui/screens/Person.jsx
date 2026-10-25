// A person's page: lineage, dates in both calendars, what he is to the user, parents, marriages with
// their children, brothers and sisters, and his story.
import { useState } from 'preact/hooks';
import { state } from '../../core/store.js';
import { setMe, setRoot, mergePeople, deletePerson, detachChild, moveChild, moveUnion, removeUnion, editUnion, branchOf, setView } from '../../core/actions.js';
import { t, count, fmtDateParts, fmtAge, ageOf, lang } from '../../core/i18n.js';
import { mercy } from '../../core/names.js';
import { ageBetween } from '../../core/dates.js';
import { IX, openAdd, pickPerson, focusOn } from '../app-state.js';
import { go, back } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, Seal, PersonRow, Empty, Sheet, confirmDialog, toast, DateInput, Seg } from '../kit.jsx';
import { nameOf, lineTail, yearsOf, relToMe } from '../people.js';
import { deletePhoto } from '../../core/photos.js';
import { fanPerson } from './Tree.jsx';
import { undo } from '../../core/store.js';

export function PersonPage({ id }) {
  const s = state.value, ix = IX.value, p = ix.P[id];
  const [more, setMore] = useState(false);
  const [order, setOrder] = useState('');
  const [editU, setEditU] = useState('');
  if (!p) return <div class="screen"><TopBar back title="" /><div class="wrap"><Empty icon="user" title={t('gone_t')} text={t('gone_p')} /></div></div>;
  const dead = !ix.living(id);
  const ar = lang.value === 'ar';
  const rel = s.me && s.me !== id ? relToMe(id) : '';
  const b = fmtDateParts(p.b), d = fmtDateParts(p.d);
  const age = ageOf(p);
  const f = ix.father(id), m = ix.mother(id);
  const sib = ix.siblings(id);
  const tags = [p.kun, p.laq, p.nick].filter(Boolean);
  const unions = ix.unions(id);
  return (
    <div class="screen">
      <TopBar back title="" actions={<>
        <button class="iconbtn" onClick={() => go('edit/' + id)} aria-label={t('edit')}><Icon name="edit" /></button>
        <button class="iconbtn" onClick={() => setMore(true)} aria-label={t('more')}><Icon name="more" /></button>
      </>} />
      <div class="wrap">
        <div class="phead">
          <Seal id={id} size="lg" me={s.me === id} />
          <h2>{p.n || '؟'}</h2>
          <p class="lin">{lineTail(id, { depth: 0 })}</p>
          <div class="tags">
            {s.me === id && <span class="pill gold">{t('this_is_you')}</span>}
            {tags.map((x, i) => <span key={i} class="pill">{x}</span>)}
            {dead && s.settings.mercy && ar && <span class="pill">{mercy(p.g)}</span>}
          </div>
        </div>

        {rel && (
          <button class="relcard" style="margin-top:16px" onClick={() => go('relation?a=' + id + '&b=' + s.me)}>
            <Icon name="link" />
            <span style="flex:1"><span class="small" style="display:block;opacity:.85">{t('to_you')}</span><b>{rel}</b></span>
            <Icon name="chevron" />
          </button>
        )}

        <div class="card pad" style="margin-top:16px">
          <dl class="facts" style="margin:0">
            <dt>{t('birth')}</dt>
            <dd>{b.main || <span class="faint">{t('unknown')}</span>}{b.alt && <span class="alt">{b.alt}</span>}{p.bp && <span class="alt">{p.bp}</span>}</dd>
            {dead && <><dt>{t('death')}</dt><dd>{d.main || <span class="faint">{t('deceased_no_date')}</span>}{d.alt && <span class="alt">{d.alt}</span>}{p.dp && <span class="alt">{p.dp}</span>}</dd></>}
            {age && <><dt>{dead ? t('age_at_death') : t('age')}</dt><dd>{fmtAge(age)}</dd></>}
            {p.job && <><dt>{t('job')}</dt><dd>{p.job}</dd></>}
            {p.edu && <><dt>{t('edu')}</dt><dd>{p.edu}</dd></>}
            {p.res && <><dt>{t('res')}</dt><dd>{p.res}</dd></>}
            {p.tel && <><dt>{t('tel')}</dt><dd dir="ltr" style="text-align:start"><button class="linkbtn" onClick={() => copy(p.tel)}>{p.tel}</button></dd></>}
            {p.mail && <><dt>{t('mail')}</dt><dd dir="ltr" style="text-align:start"><button class="linkbtn" onClick={() => copy(p.mail)}>{p.mail}</button></dd></>}
          </dl>
        </div>

        <div class="section">
          <h2>{t('parents')}</h2>
          <div class="list">
            {f ? <PersonRow id={f} meta={t('father')} onClick={() => go('person/' + f)} /> : <button class="row" onClick={() => openAdd('father', id)}><span class="seal" style="--c:var(--ink-3)"><Icon name="plus" /></span><span class="grow"><span class="title">{t('add_father')}</span></span></button>}
            {m ? <PersonRow id={m} meta={t('mother')} onClick={() => go('person/' + m)} /> : <button class="row" onClick={() => openAdd('mother', id)}><span class="seal f" style="--c:var(--ink-3)"><Icon name="plus" /></span><span class="grow"><span class="title">{t('add_mother')}</span></span></button>}
          </div>
        </div>

        <div class="section">
          <h2>{p.g === 'f' ? t('husbands_children') : t('wives_children')}<button class="aside" onClick={() => openAdd('spouse', id)}>{p.g === 'f' ? t('add_husband') : t('add_wife')}</button></h2>
          {!unions.length && <div class="card pad muted small">{t('no_marriages')}</div>}
          {unions.map((u, ui) => {
            const other = ix.partnerIn(u, id);
            const kids = ix.childrenOfUnion(u);
            const U = ix.U[u];
            const md = fmtDateParts(U.md);
            return (
              <div class="list" key={u} style="margin-top:10px">
                {other ? <PersonRow id={other} meta={[p.g === 'f' ? t('husband') : t('wife') + (unions.length > 1 ? ' ' + ordinal(ui + 1, 'f') : ''), md.main ? t('married_on', { d: md.main }) : '', U.st === 'd' ? t('divorced') : ''].filter(Boolean).join(' — ')} onClick={() => go('person/' + other)} />
                  : <div class="union-h">{p.g === 'f' ? t('father_unknown') : t('mother_unknown')}</div>}
                {kids.length > 0 && <div class="union-h"><span style="flex:1">{t('their_children', { n: count(kids.length, 'child') })}</span>
                  {kids.length > 1 && <button class="linkbtn small" onClick={() => setOrder(order === u ? '' : u)}>{order === u ? t('done') : t('reorder')}</button>}
                  {other && <button class="linkbtn small" onClick={() => setEditU(u)}>{t('marriage_details')}</button>}
                </div>}
                {kids.map(k => order === u ? (
                  <div class="row" key={k}>
                    <Seal id={k} size="sm" />
                    <span class="grow"><span class="title nm">{nameOf(k)}</span></span>
                    <button class="iconbtn" onClick={() => moveChild(k, -1, kids)} aria-label={t('move_up')}><Icon name="up" /></button>
                    <button class="iconbtn" onClick={() => moveChild(k, 1, kids)} aria-label={t('move_down')}><Icon name="down" /></button>
                  </div>
                ) : <PersonRow key={k} id={k} onClick={() => go('person/' + k)} />)}
                <button class="row" onClick={() => openAdd('children', id)} style="min-height:48px"><Icon name="plus" class="chev" /><span class="grow small muted">{t('add_children_here')}</span></button>
                {!kids.length && other && <button class="row" onClick={() => setEditU(u)} style="min-height:48px"><Icon name="rings" class="chev" /><span class="grow small muted">{t('marriage_details')}</span></button>}
              </div>
            );
          })}
          {unions.length > 1 && p.g !== 'f' && <p class="hint">{t('wives_order_hint')}</p>}
        </div>

        {(sib.full.length + sib.paternal.length + sib.maternal.length > 0) && (
          <div class="section">
            <h2>{t('siblings')}<button class="aside" onClick={() => openAdd('sibling', id)}>{t('add')}</button></h2>
            {sib.full.length > 0 && <div class="list">{sib.full.map(x => <PersonRow key={x} id={x} meta={yearsOf(x)} onClick={() => go('person/' + x)} />)}</div>}
            {sib.paternal.length > 0 && <><div class="group-h">{t('half_paternal')}</div><div class="list">{sib.paternal.map(x => <PersonRow key={x} id={x} onClick={() => go('person/' + x)} />)}</div></>}
            {sib.maternal.length > 0 && <><div class="group-h">{t('half_maternal')}</div><div class="list">{sib.maternal.map(x => <PersonRow key={x} id={x} onClick={() => go('person/' + x)} />)}</div></>}
          </div>
        )}

        {p.note && <div class="section"><h2>{t('bio')}</h2><div class="card pad bio naskh">{p.note}</div></div>}

        <div class="section" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="btn ghost" onClick={() => { go('tree'); setTimeout(() => focusOn(id), 60); }}><Icon name="tree" />{t('show_in_tree')}</button>
          <button class="btn ghost" onClick={() => { fanPerson.value = id; setView({ mode: 'f' }); go('tree'); }}><Icon name="fan" />{t('act_fan')}</button>
          <button class="btn ghost" style="grid-column:1/-1" onClick={() => go('certificate?p=' + id)}><Icon name="scroll" />{t('certificate')}</button>
        </div>
      </div>
      {more && <MoreSheet id={id} onClose={() => setMore(false)} />}
      {editU && <UnionSheet uid={editU} personId={id} onClose={() => setEditU('')} />}
    </div>
  );
}
const ORD_F = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة'];
function ordinal(n, g) { return lang.value === 'ar' ? (ORD_F[n] || String(n)) : '#' + n; }
function copy(text) {
  try { navigator.clipboard.writeText(text).then(() => toast(t('copied'))); } catch (e) { /* no clipboard */ }
}

/** the details of a marriage */
function UnionSheet({ uid, personId, onClose }) {
  const ix = IX.value, U = ix.U[uid];
  const [md, setMd] = useState(U ? U.md : '');
  const [ed, setEd] = useState(U ? U.ed : '');
  const [st, setSt] = useState(U ? U.st : 'm');
  if (!U) return null;
  const save = () => { editUnion(uid, { md, ed, st }); onClose(); };
  const kids = ix.childrenOfUnion(uid).length;
  const other = ix.partnerIn(uid, personId);
  return (
    <Sheet onClose={onClose} title={t('marriage_details')}>
      <p class="naskh" style="margin:0 0 6px;font-weight:700;font-size:18px">{nameOf(personId)} {other ? '— ' + nameOf(other) : ''}</p>
      <DateInput label={t('marriage_date')} value={md} onChange={setMd} />
      <div class="field"><Seg value={st} onChange={setSt} options={[['m', t('married')], ['d', t('divorced')]]} label={t('marriage_status')} /></div>
      {st === 'd' && <DateInput label={t('divorce_date')} value={ed} onChange={setEd} />}
      <button class="btn wide" style="margin-top:16px" onClick={save}><Icon name="check" />{t('save')}</button>
      {!kids && <button class="btn danger wide" style="margin-top:10px" onClick={async () => {
        if (await confirmDialog({ title: t('remove_marriage_q'), text: t('remove_marriage_p'), ok: t('remove'), danger: true })) { removeUnion(uid, personId); onClose(); toast(t('removed'), { action: t('undo'), onAction: undo }); }
      }}>{t('remove_marriage')}</button>}
    </Sheet>
  );
}

/** "this is me", top of the tree, merge a duplicate, unlink from parents, delete */
function MoreSheet({ id, onClose }) {
  const s = state.value, ix = IX.value, p = ix.P[id];
  const act = fn => async () => { onClose(); await fn(); };
  return (
    <Sheet onClose={onClose} title={p.n || '؟'}>
      <div class="list" style="box-shadow:none;background:var(--paper-2)">
        {s.me !== id && <button class="row" onClick={act(() => { setMe(id); toast(t('me_set')); })}><Icon name="target" class="chev" /><span class="grow"><span class="title">{t('this_is_me')}</span><span class="meta">{t('this_is_me_sub')}</span></span></button>}
        <button class="row" onClick={act(() => { setRoot(id); go('tree'); })}><Icon name="crown" class="chev" /><span class="grow"><span class="title">{t('act_root')}</span><span class="meta">{t('act_root_sub')}</span></span></button>
        <button class="row" onClick={act(() => pickPerson({
          title: t('merge_pick'), exclude: [id], onPick: async other => {
            const ok = await confirmDialog({ title: t('merge_q', { a: nameOf(id), b: nameOf(other) }), text: t('merge_p'), ok: t('merge') });
            if (!ok) return;
            if (mergePeople(id, other)) toast(t('merged'), { action: t('undo'), onAction: undo, ms: 6000 }); else toast(t('e_merge'));
          }
        }))}><Icon name="merge" class="chev" /><span class="grow"><span class="title">{t('merge')}</span><span class="meta">{t('merge_sub')}</span></span></button>
        {p.pu && <button class="row" onClick={act(async () => {
          if (await confirmDialog({ title: t('detach_q'), text: t('detach_p'), ok: t('detach') })) { detachChild(id); toast(t('done'), { action: t('undo'), onAction: undo }); }
        })}><Icon name="x" class="chev" /><span class="grow"><span class="title">{t('detach')}</span></span></button>}
        <button class="row" onClick={act(async () => {
          const branch = branchOf(s, id).size - 1;
          const v = branch > 0
            ? await confirmDialog({ title: t('delete_q', { name: p.n || '؟' }), text: t('delete_branch_p', { n: count(branch, 'person') }), choices: [{ v: 'one', label: t('delete_one') }, { v: 'branch', label: t('delete_branch', { n: count(branch + 1, 'person') }), danger: true }] })
            : (await confirmDialog({ title: t('delete_q', { name: p.n || '؟' }), text: t('delete_p'), ok: t('delete'), danger: true })) && 'one';
          if (!v) return;
          const photos = deletePerson(id, v);
          back('people');
          toast(t('deleted'), { action: t('undo'), onAction: undo, ms: 7000 });
          void photos;
        })}><Icon name="trash" class="chev" /><span class="grow"><span class="title err">{t('delete')}</span></span></button>
      </div>
    </Sheet>
  );
}
export { ageBetween };
