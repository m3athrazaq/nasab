// More than one family in the app: the list (tap to open one), a new family, and renaming or deleting one.
// One family is open at a time; the tree, the lists, the prints and the backups are of the open family.
import { useState } from 'preact/hooks';
import { state, undo } from '../../core/store.js';
import { switchFamily, deleteFamily, renameFamily } from '../../core/actions.js';
import { buildIndex } from '../../core/model.js';
import { familyTitle } from '../../core/names.js';
import { t, count } from '../../core/i18n.js';
import { IX, ROOT, familiesSheet, newFamily, personSheet } from '../app-state.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { Sheet, confirmDialog, toast, Field } from '../kit.jsx';

/** a family's name: the one given to it, else its family name (آل …), else "the tree of <top person>" */
export function familyLabel(f, ix = null, root = '') {
  if (f.fname) return f.fname;
  ix = ix || buildIndex({ people: f.people, unions: f.unions, settings: {} });
  root = root || (f.root && ix.P[f.root] ? f.root : ix.defaultRoot(f.me));
  if (!root) return t('family_unnamed');
  const fam = ix.familyOf(root);
  return fam ? familyTitle(fam) : t('tree_of', { name: ix.P[root].n || '؟' });
}
const peopleIn = f => Object.keys(f.people || {}).length;

export function FamiliesSheet({ onRoot }) {
  const [edit, setEdit] = useState('');
  if (!familiesSheet.value) return null;
  const s = state.value;
  const close = () => { familiesSheet.value = false; };
  const list = [
    { id: s.fid, f: s, label: familyLabel(s, IX.value, ROOT.value), open: true },
    ...Object.entries(s.others).map(([id, f]) => ({ id, f, label: familyLabel(f), open: false })).sort((a, b) => (b.f.updated || 0) - (a.f.updated || 0))
  ];
  const open = id => {
    close();
    personSheet.value = null;
    if (switchFamily(id)) toast(t('family_opened', { name: list.find(x => x.id === id).label }));
    go('tree');
    setTimeout(() => window.__nasabTree && window.__nasabTree.fit(), 120);
  };
  return (
    <Sheet onClose={close} title={t('families')}>
      <p class="hint" style="margin-top:0">{t('families_hint')}</p>
      <div class="list fams" style="box-shadow:none;margin-top:8px">
        {list.map(x => (
          <div class="row fam" key={x.id}>
            <button class="grow famopen" onClick={() => (x.open ? close() : open(x.id))} aria-current={x.open ? 'true' : undefined}>
              <span class={'famdot' + (x.open ? ' on' : '')}><Icon name="tree" /></span>
              <span class="grow">
                <span class="title naskh">{x.label}</span>
                <span class="meta">{count(peopleIn(x.f), 'person')}{x.open ? ' — ' + t('family_open_now') : ''}</span>
              </span>
            </button>
            <button class="iconbtn" onClick={() => setEdit(x.id)} aria-label={t('family_edit', { name: x.label })}><Icon name="edit" /></button>
          </div>
        ))}
      </div>
      <button class="btn wide" style="margin-top:14px" onClick={() => { close(); newFamily.value = true; }}><Icon name="plus" />{t('family_new')}</button>
      {onRoot && peopleIn(s) > 0 && <button class="btn ghost wide" style="margin-top:8px" onClick={() => { close(); onRoot(); }}><Icon name="crown" />{t('choose_root')}</button>}
      {edit && <FamilyEdit id={edit} label={list.find(x => x.id === edit)?.label || ''} onClose={() => setEdit('')} />}
    </Sheet>
  );
}

/** rename or delete one family */
function FamilyEdit({ id, label, onClose }) {
  const s = state.value;
  const f = id === s.fid ? s : s.others[id];
  const [name, setName] = useState(f ? f.fname || '' : '');
  if (!f) return null;
  const alone = !Object.keys(s.others).length;
  const save = () => { renameFamily(id, name); onClose(); };
  const del = async () => {
    const n = peopleIn(f);
    const ok = await confirmDialog({ title: t('family_delete_q', { name: label }), text: n ? t('family_delete_p', { n: count(n, 'person') }) : t('family_delete_empty'), ok: t('delete'), danger: true });
    if (!ok) return;
    onClose();
    familiesSheet.value = false;
    if (deleteFamily(id)) { toast(t('family_deleted'), { action: t('undo'), onAction: undo, ms: 8000 }); go('tree'); }
  };
  return (
    <Sheet onClose={onClose} title={label}>
      <Field label={t('family_title_lab')} hint={t('family_name_hint')}>
        <input class="input nm" value={name} placeholder={label} maxLength={60} onInput={e => setName(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </Field>
      <button class="btn wide" style="margin-top:14px" onClick={save}><Icon name="check" />{t('save')}</button>
      {alone
        ? <p class="hint">{t('family_last')}</p>
        : <button class="btn danger wide" style="margin-top:10px" onClick={del}><Icon name="trash" />{t('family_delete')}</button>}
    </Sheet>
  );
}
