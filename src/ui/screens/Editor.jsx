// Editing a person: name and names he is known by, dates (Gregorian or Hijri, exact or approximate),
// places, work, contact, photo and story.
import { useState, useMemo } from 'preact/hooks';
import { state } from '../../core/store.js';
import { editPerson } from '../../core/actions.js';
import { t, count } from '../../core/i18n.js';
import { cleanName, guessGender } from '../../core/names.js';
import { IX } from '../app-state.js';
import { back } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, Field, Seg, DateInput, Empty, toast, usePhoto, Spinner } from '../kit.jsx';
import { addPhoto } from '../../core/photos.js';
import { pickFiles } from '../../core/native.js';
import { branchInk } from '../app-state.js';
import { initial } from '../../core/names.js';

export function PersonEditor({ id }) {
  const ix = IX.value, p = ix.P[id];
  const [f, setF] = useState(() => (p ? { ...p } : null));
  const [busy, setBusy] = useState(false);
  const url = usePhoto(f && f.photo);
  const kunyaHint = useMemo(() => {
    if (!p) return '';
    // "أبو محمد": after the eldest son
    const sons = ix.children(id).filter(c => ix.P[c].g === 'm');
    return sons.length ? (p.g === 'f' ? 'أم ' : 'أبو ') + ix.P[sons[0]].n : '';
  }, [ix, id]);
  if (!p || !f) return <div class="screen"><TopBar back title="" /><div class="wrap"><Empty icon="user" title={t('gone_t')} /></div></div>;
  const set = patch => setF(x => ({ ...x, ...patch }));
  const save = () => {
    const name = cleanName(f.n);
    if (!name) { toast(t('e_name')); return; }
    const patch = {};
    for (const k of ['n', 'g', 'fam', 'kun', 'laq', 'nick', 'b', 'bp', 'd', 'dp', 'dead', 'job', 'edu', 'res', 'tel', 'mail', 'note', 'photo']) if (f[k] !== p[k]) patch[k] = f[k];
    if (!f.dead) { patch.d = ''; patch.dp = ''; patch.dead = false; }
    if (Object.keys(patch).length) { editPerson(id, patch); toast(t('saved')); }
    back('person/' + id);
  };
  const pick = async () => {
    const files = await pickFiles('image/*', false);
    if (!files.length) return;
    setBusy(true);
    try { const pid = await addPhoto(files[0]); set({ photo: pid }); }
    catch (e) { toast(t('e_photo')); }
    finally { setBusy(false); }
  };
  const inherited = !f.fam ? ix.familyOf(id) : '';
  return (
    <div class="screen">
      <TopBar back title={t('edit_person')} sub actions={<button class="btn sm" onClick={save}>{t('save')}</button>} />
      <div class="wrap">
        <div class="ed-photo">
          <span class={'seal lg' + (f.g === 'f' ? ' f' : '')} style={{ '--c': branchInk(id) }}>
            {busy ? <Spinner /> : url ? <img src={url} alt="" /> : initial(f.n || '؟')}
          </span>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn sm ghost" onClick={pick}><Icon name="camera" />{f.photo ? t('change_photo') : t('add_photo')}</button>
            {f.photo && <button class="btn sm danger" onClick={() => set({ photo: '' })}>{t('remove_photo')}</button>}
          </div>
        </div>
        <Field label={t('name')}>
          <input class="input nm" value={f.n} onInput={e => { const v = e.currentTarget.value; set({ n: v }); }} placeholder={t('name_ph')} />
        </Field>
        <div class="field"><Seg value={f.g || 'm'} onChange={g => set({ g })} options={[['m', t('male')], ['f', t('female')]]} label={t('gender')} /></div>
        {!f.g && f.n && guessGender(f.n) && <p class="hint">{t('gender_guess', { g: guessGender(f.n) === 'f' ? t('female') : t('male') })}</p>}
        <Field label={t('family_name')} hint={inherited ? t('family_inherited', { fam: inherited }) : t('family_hint')}>
          <input class="input" value={f.fam} onInput={e => set({ fam: e.currentTarget.value })} placeholder={inherited || t('family_ph')} />
        </Field>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <Field label={t('kunya')}><input class="input" value={f.kun} onInput={e => set({ kun: e.currentTarget.value })} placeholder={kunyaHint || t('kunya_ph')} /></Field>
          <Field label={t('laqab')}><input class="input" value={f.laq} onInput={e => set({ laq: e.currentTarget.value })} placeholder={t('laqab_ph')} /></Field>
        </div>
        <Field label={t('nick')}><input class="input" value={f.nick} onInput={e => set({ nick: e.currentTarget.value })} /></Field>

        <h2 class="sec" style="margin-top:26px">{t('birth')}</h2>
        <DateInput label={t('birth_date')} value={f.b} onChange={b => set({ b })} />
        <Field label={t('birth_place')}><input class="input" value={f.bp} onInput={e => set({ bp: e.currentTarget.value })} placeholder={t('place_ph')} /></Field>

        <h2 class="sec" style="margin-top:26px">{t('status')}</h2>
        <Seg value={f.dead ? 'd' : 'a'} onChange={v => set({ dead: v === 'd' })} options={[['a', t('alive')], ['d', f.g === 'f' ? t('deceased_f') : t('deceased_m')]]} label={t('status')} />
        {f.dead && <>
          <DateInput label={t('death_date')} value={f.d} onChange={d => set({ d })} />
          <Field label={t('death_place')}><input class="input" value={f.dp} onInput={e => set({ dp: e.currentTarget.value })} placeholder={t('place_ph')} /></Field>
        </>}

        <h2 class="sec" style="margin-top:26px">{t('about_person')}</h2>
        <Field label={t('job')}><input class="input" value={f.job} onInput={e => set({ job: e.currentTarget.value })} /></Field>
        <Field label={t('edu')}><input class="input" value={f.edu} onInput={e => set({ edu: e.currentTarget.value })} /></Field>
        <Field label={t('res')}><input class="input" value={f.res} onInput={e => set({ res: e.currentTarget.value })} placeholder={t('place_ph')} /></Field>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <Field label={t('tel')}><input class="input" type="tel" dir="ltr" value={f.tel} onInput={e => set({ tel: e.currentTarget.value })} /></Field>
          <Field label={t('mail')}><input class="input" type="email" dir="ltr" value={f.mail} onInput={e => set({ mail: e.currentTarget.value })} /></Field>
        </div>
        <Field label={t('bio')} hint={t('bio_hint')}>
          <textarea class="input naskh" value={f.note} onInput={e => set({ note: e.currentTarget.value })} rows="6" />
        </Field>
        <button class="btn wide" style="margin-top:22px" onClick={save}><Icon name="check" />{t('save')}</button>
      </div>
    </div>
  );
}
export { count };
