// The person's card (tap in the tree) and the quick forms that add relatives in a few taps.
import { useState, useRef, useEffect } from 'preact/hooks';
import { state, undo } from '../../core/store.js';
import { addChildren, addParent, addSpouse, addSibling, addPerson, setRoot, toggleCollapsed, setView, editUnion } from '../../core/actions.js';
import { t, count, lang } from '../../core/i18n.js';
import { guessGender, parseChain, cleanName } from '../../core/names.js';
import { IX, personSheet, addSheet, openAdd, pickPerson, focusOn } from '../app-state.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { Sheet, Seal, toast, DateInput, Seg } from '../kit.jsx';
import { nameOf, lineTail, yearsOf, relToMe } from '../people.js';
import { fanPerson } from './Tree.jsx';

const undoToast = text => toast(text, { action: t('undo'), onAction: () => undo(), ms: 5500 });

export function PersonSheet() {
  const id = personSheet.value;
  if (!id) return null;
  const s = state.value, ix = IX.value, p = ix.P[id];
  const close = () => { personSheet.value = null; };
  if (!p) { setTimeout(close, 0); return null; }
  const rel = relToMe(id);
  const meta = [yearsOf(id), rel].filter(Boolean);
  const hasKids = ix.children(id).length > 0;
  const collapsed = s.view.collapsed.includes(id);
  const act = (fn) => () => { close(); fn(); };
  return (
    <Sheet onClose={close} label={nameOf(id)}>
      <div class="who" style="margin-top:4px">
        <Seal id={id} me={s.me === id} />
        <div style="min-width:0;flex:1">
          <div class="nm">{nameOf(id)}</div>
          <div class="lin">{lineTail(id, { depth: 4 })}</div>
          {meta.length > 0 && <div class="small muted">{meta.map((m, i) => <span key={i} style="display:block">{m}</span>)}</div>}
        </div>
      </div>
      <div class="acts">
        <button class="main" onClick={act(() => go('person/' + id))}><Icon name="user" />{t('act_profile')}</button>
        <button onClick={act(() => go('edit/' + id))}><Icon name="edit" />{t('edit')}</button>
        <button onClick={act(() => openAdd('children', id))}><Icon name="plus" />{t('act_children')}</button>
        <button onClick={act(() => openAdd('spouse', id))}><Icon name="rings" />{p.g === 'f' ? t('act_husband') : t('act_wife')}</button>
        {!ix.father(id) && <button onClick={act(() => openAdd('father', id))}><Icon name="up" />{t('act_father')}</button>}
        {!ix.mother(id) && <button onClick={act(() => openAdd('mother', id))}><Icon name="up" />{t('act_mother')}</button>}
        <button onClick={act(() => openAdd('sibling', id))}><Icon name="people" />{t('act_siblings')}</button>
        <button onClick={act(() => { setRoot(id); setView({ mode: s.view.mode === 'f' ? 'v' : s.view.mode }); })}><Icon name="crown" />{t('act_root')}</button>
        <button onClick={act(() => { fanPerson.value = id; setView({ mode: 'f' }); go('tree'); })}><Icon name="fan" />{t('act_fan')}</button>
        {hasKids && s.view.mode !== 'f' && <button onClick={act(() => toggleCollapsed(id))}><Icon name={collapsed ? 'eye' : 'minus'} />{collapsed ? t('act_expand') : t('act_collapse')}</button>}
        <button onClick={act(() => go('relation?a=' + id))}><Icon name="link" />{t('act_relation')}</button>
      </div>
    </Sheet>
  );
}

/* ---------- adding relatives ---------- */
export function AddSheet() {
  const o = addSheet.value;
  if (!o) return null;
  const close = () => { addSheet.value = null; };
  const ix = IX.value;
  if (o.of && !ix.P[o.of]) { setTimeout(close, 0); return null; }
  switch (o.kind) {
    case 'children': case 'child': return <RowsForm key={'c' + o.of} o={o} close={close} mode="children" />;
    case 'sibling': return <RowsForm key={'s' + o.of} o={o} close={close} mode="siblings" />;
    case 'father': case 'mother': return <ParentForm key={o.kind + o.of} o={o} close={close} />;
    case 'spouse': return <SpouseForm key={'w' + o.of} o={o} close={close} />;
    default: return <PersonForm o={o} close={close} />;
  }
}

function GenderButton({ g, onChange }) {
  return (
    <button type="button" class={'gbtn ' + (g === 'f' ? 'f' : 'm')} onClick={() => onChange(g === 'f' ? 'm' : 'f')} aria-label={g === 'f' ? t('female') : t('male')} title={g === 'f' ? t('female') : t('male')}>
      {g === 'f' ? t('g_f_short') : t('g_m_short')}
    </button>
  );
}

/** several sons and daughters (or brothers and sisters) at once, one per line */
function RowsForm({ o, close, mode }) {
  const ix = IX.value, id = o.of, p = ix.P[id];
  const [rows, setRows] = useState([{ n: '', g: 'm', set: false }]);
  const unions = ix.unions(id);
  // whose children: one of the person's marriages, or "another / unknown"
  const [uid, setUid] = useState(unions.length ? unions[0] : '');
  const [fatherName, setFatherName] = useState('');
  const first = useRef();
  useEffect(() => { setTimeout(() => first.current && first.current.focus(), 250); }, []);
  const setRow = (i, patch) => {
    setRows(rs => {
      const next = rs.map((r, k) => (k === i ? { ...r, ...patch } : r));
      if (patch.n != null && !next[i].set) next[i].g = guessGender(patch.n) || next[i].g;
      // a new empty line appears as soon as the last one is used
      if (i === next.length - 1 && cleanName(next[i].n)) next.push({ n: '', g: 'm', set: false });
      return next;
    });
  };
  const names = rows.filter(r => cleanName(r.n));
  const save = () => {
    if (!names.length) return;
    const list = names.map(r => ({ n: r.n, g: r.g }));
    let ids = [];
    if (mode === 'children') ids = addChildren(id, list, uid === '__new' ? { fresh: true } : { unionId: uid });
    else {
      // brothers and sisters share the parents; with none recorded, the father can be named here
      if (!ix.father(id) && !ix.mother(id) && cleanName(fatherName)) {
        const fid = addParent(id, 'h', { n: fatherName });
        if (fid) ids = addChildren(fid, list, { unionId: IX.value.P[id].pu });
      } else {
        ids = list.map(f => addSibling(id, f)).filter(Boolean);
      }
    }
    close();
    if (ids.length) undoToast(mode === 'children' ? t('added_children', { n: count(ids.length, 'child') }) : t('added_n', { n: count(ids.length, 'person') }));
  };
  const title = mode === 'children' ? t('add_children_of', { name: p.n || '؟' }) : t('add_siblings_of', { name: p.n || '؟' });
  const linkExisting = () => {
    close();
    pickPerson({
      title: mode === 'children' ? t('pick_child') : t('pick_sibling'), exclude: [id], onPick: x => {
        const r = mode === 'children' ? addChildren(id, [{ existing: x }], uid === '__new' ? { fresh: true } : { unionId: uid }) : [addSibling(id, { existing: x })];
        if (r && r.filter(Boolean).length) undoToast(t('linked')); else toast(t('e_link'));
      }
    });
  };
  return (
    <Sheet onClose={close} title={title}>
      {mode === 'children' && unions.length > 0 && (
        <div class="field" style="margin-top:0">
          <span class="lab">{p.g === 'f' ? t('from_father_q') : t('from_mother_q')}</span>
          <div class="chips">
            {unions.map(u => {
              const other = ix.partnerIn(u, id);
              return <button key={u} class="chip" aria-pressed={uid === u ? 'true' : 'false'} onClick={() => setUid(u)}>{other ? ix.P[other].n : t('unknown_parent')}</button>;
            })}
            {unions.every(u => ix.partnerIn(u, id)) && <button class="chip" aria-pressed={uid === '__new' ? 'true' : 'false'} onClick={() => setUid('__new')}>{t('other_unknown')}</button>}
          </div>
        </div>
      )}
      {mode === 'siblings' && !ix.father(id) && !ix.mother(id) && (
        <label class="field" style="margin-top:0">
          <span class="lab">{t('father_name_opt')}</span>
          <input class="input nm" value={fatherName} onInput={e => setFatherName(e.currentTarget.value)} placeholder={t('father_name_ph')} />
        </label>
      )}
      <div class="addrows" style="margin-top:10px">
        <span class="lab" style="font-size:13.5px;color:var(--ink-2)">{t('names_one_per_line')}</span>
        {rows.map((r, i) => (
          <div class="r" key={i}>
            <GenderButton g={r.g} onChange={g => setRow(i, { g, set: true })} />
            <input class="input nm" ref={i === 0 ? first : undefined} value={r.n} placeholder={i === 0 ? t('name_ph') : ''} enterKeyHint="next"
              onInput={e => setRow(i, { n: e.currentTarget.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const nx = e.currentTarget.parentNode.nextSibling; const inp = nx && nx.querySelector('input'); if (inp) inp.focus(); else save(); } }} />
          </div>
        ))}
      </div>
      <p class="hint">{t('gender_hint')}</p>
      <div class="btns" style="margin-top:16px">
        <button class="btn ghost" onClick={linkExisting}><Icon name="search" />{t('from_family')}</button>
        <button class="btn" disabled={!names.length} onClick={save}><Icon name="check" />{names.length > 1 ? t('add_n', { n: count(names.length, mode === 'children' ? 'child' : 'person') }) : t('add')}</button>
      </div>
    </Sheet>
  );
}

/** a father (with his fathers, if the full name is typed) or a mother */
function ParentForm({ o, close }) {
  const ix = IX.value, id = o.of, p = ix.P[id];
  const father = o.kind === 'father';
  const [n, setN] = useState('');
  const [fam, setFam] = useState('');
  const inp = useRef();
  useEffect(() => { setTimeout(() => inp.current && inp.current.focus(), 250); }, []);
  const chain = father ? parseChain(n) : { names: cleanName(n) ? [cleanName(n)] : [], family: '' };
  const save = () => {
    if (!chain.names.length) return;
    let child = id, made = 0, firstId = '';
    for (let i = 0; i < chain.names.length; i++) {
      const pid = addParent(child, father || i > 0 ? 'h' : 'w', { n: chain.names[i], fam: i === chain.names.length - 1 ? (chain.family || (father ? '' : fam)) : (!father && i === 0 ? fam : '') });
      if (!pid) break;
      if (!firstId) firstId = pid;
      made++; child = pid;
      if (!father) break;
    }
    close();
    if (made) { undoToast(made > 1 ? t('added_n', { n: count(made, 'person') }) : t('added_one', { name: chain.names[0] })); focusOn(firstId); }
  };
  const link = () => {
    close();
    pickPerson({
      title: father ? t('pick_father') : t('pick_mother'), exclude: [id], filter: x => ix.P[x].g !== (father ? 'f' : 'm'),
      onPick: x => { const r = addParent(id, father ? 'h' : 'w', { existing: x }); if (r) undoToast(t('linked')); else toast(t('e_link')); }
    });
  };
  return (
    <Sheet onClose={close} title={father ? t('add_father_of', { name: p.n || '؟' }) : t('add_mother_of', { name: p.n || '؟' })}>
      <label class="field" style="margin-top:0">
        <span class="lab">{father ? t('father_name') : t('mother_name')}</span>
        <input class="input nm" ref={inp} value={n} onInput={e => setN(e.currentTarget.value)} placeholder={father ? t('father_chain_ph') : t('name_ph')} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </label>
      {father && chain.names.length > 1 && (
        <div class="chainprev" aria-live="polite">
          {chain.names.map((x, i) => <span key={i}>{i > 0 && <span class="lnk">{t('son_of_short')} </span>}{x}</span>)}
          {chain.family && <span class="fam">{chain.family}</span>}
        </div>
      )}
      {father ? <p class="hint">{t('father_chain_hint')}</p> : (
        <label class="field">
          <span class="lab">{t('her_family')}</span>
          <input class="input" value={fam} onInput={e => setFam(e.currentTarget.value)} placeholder={t('her_family_ph')} />
        </label>
      )}
      <div class="btns" style="margin-top:16px">
        <button class="btn ghost" onClick={link}><Icon name="search" />{t('from_family')}</button>
        <button class="btn" disabled={!chain.names.length} onClick={save}><Icon name="check" />{t('add')}</button>
      </div>
    </Sheet>
  );
}

/** a wife or husband, new or already in the family (cousins) */
function SpouseForm({ o, close }) {
  const ix = IX.value, id = o.of, p = ix.P[id];
  const wife = p.g !== 'f';
  const [n, setN] = useState('');
  const [fam, setFam] = useState('');
  const [md, setMd] = useState('');
  // a union whose other parent is unknown, with children: the new spouse is probably that parent
  const open = ix.unions(id).find(u => !ix.partnerIn(u, id) && ix.childrenOfUnion(u).length);
  const [fill, setFill] = useState(!!open);
  const inp = useRef();
  useEffect(() => { setTimeout(() => inp.current && inp.current.focus(), 250); }, []);
  const save = () => {
    const name = cleanName(n);
    if (!name) return;
    const r = addSpouse(id, { n: name, fam, g: wife ? 'f' : 'm' }, { fillUnion: fill && open ? open : '' });
    if (r.unionId && md) editUnion(r.unionId, { md });
    close();
    if (r.id) undoToast(t('added_one', { name }));
  };
  const link = () => {
    close();
    pickPerson({
      title: wife ? t('pick_wife') : t('pick_husband'), exclude: [id], filter: x => ix.P[x].g !== (wife ? 'm' : 'f'),
      onPick: x => { const r = addSpouse(id, { existing: x }, { fillUnion: fill && open ? open : '' }); if (r.unionId) undoToast(t('linked')); else toast(t('e_link')); }
    });
  };
  return (
    <Sheet onClose={close} title={wife ? t('add_wife_of', { name: p.n || '؟' }) : t('add_husband_of', { name: p.n || '؟' })}>
      <label class="field" style="margin-top:0">
        <span class="lab">{wife ? t('wife_name') : t('husband_name')}</span>
        <input class="input nm" ref={inp} value={n} onInput={e => setN(e.currentTarget.value)} placeholder={t('name_ph')} />
      </label>
      <label class="field">
        <span class="lab">{wife ? t('her_family') : t('his_family')}</span>
        <input class="input" value={fam} onInput={e => setFam(e.currentTarget.value)} placeholder={t('her_family_ph')} />
      </label>
      <DateInput label={t('marriage_date')} value={md} onChange={setMd} />
      {open && (
        <label style="display:flex;gap:10px;align-items:flex-start;margin-top:14px;font-size:14.5px">
          <input type="checkbox" checked={fill} onChange={e => setFill(e.currentTarget.checked)} style="margin-top:5px" />
          <span>{wife ? t('is_mother_of', { n: count(ix.childrenOfUnion(open).length, 'child') }) : t('is_father_of', { n: count(ix.childrenOfUnion(open).length, 'child') })}</span>
        </label>
      )}
      <div class="btns" style="margin-top:16px">
        <button class="btn ghost" onClick={link}><Icon name="search" />{t('from_family')}</button>
        <button class="btn" disabled={!cleanName(n)} onClick={save}><Icon name="check" />{t('add')}</button>
      </div>
    </Sheet>
  );
}

/** someone not linked yet (the first person, or a relative to link later) */
function PersonForm({ o, close }) {
  const [n, setN] = useState('');
  const [g, setG] = useState('m');
  const [set, setSet] = useState(false);
  const inp = useRef();
  useEffect(() => { setTimeout(() => inp.current && inp.current.focus(), 250); }, []);
  const save = () => {
    const name = cleanName(n);
    if (!name) return;
    const id = addPerson({ n: name, g });
    close();
    if (id) go('person/' + id);
  };
  return (
    <Sheet onClose={close} title={t('add_person')}>
      <label class="field" style="margin-top:0">
        <span class="lab">{t('name')}</span>
        <input class="input nm" ref={inp} value={n} onInput={e => { const v = e.currentTarget.value; setN(v); if (!set) setG(guessGender(v) || g); }} placeholder={t('name_ph')} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </label>
      <div class="field"><Seg value={g} onChange={x => { setG(x); setSet(true); }} options={[['m', t('male')], ['f', t('female')]]} label={t('gender')} /></div>
      <button class="btn wide" style="margin-top:16px" disabled={!cleanName(n)} onClick={save}><Icon name="check" />{t('add')}</button>
    </Sheet>
  );
}
