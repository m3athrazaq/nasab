// Settings: language, look, digits, calendars, how full names are written, "me", the lock, the sample
// family, and about the app.
import { useState } from 'preact/hooks';
import { state, replaceState, update, clearUndo, defaultState } from '../../core/store.js';
import { setSettings, setMe } from '../../core/actions.js';
import { t, lang, dig, digits, calPref } from '../../core/i18n.js';
import { fmtD } from '../../core/dates.js';
import { IX, pickPerson } from '../app-state.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { TopBar, Seg, Toggle, PersonRow, confirmDialog, toast, Sheet } from '../kit.jsx';
import { demoState } from '../../core/demo.js';
import { lineageText } from '../../core/names.js';
import { setPin } from './Lock.jsx';

/** a date written the way the settings now write it, with the other calendar in brackets */
function bothExample() {
  const r = fmtD('1985-03-12', { lang: lang.value, digits: digits.value, prefer: calPref.value, both: true });
  return r.alt ? `${r.main} (${r.alt})` : r.main;
}

export function SettingsScreen() {
  const s = state.value, st = s.settings, ix = IX.value;
  const [pinSheet, setPinSheet] = useState(false);
  const sample = lineageText(['خالد', 'راشد', 'محمد', 'عبدالله', 'سالم'].slice(0, st.depth || 5), { gender: 'm', style: st.style, lang: 'ar' });
  return (
    <div class="screen">
      <TopBar back title={t('settings')} />
      <div class="wrap">
        <div class="section" style="margin-top:6px">
          <h2>{t('s_language')}</h2>
          <Seg value={st.lang} onChange={v => setSettings({ lang: v })} options={[['ar', 'العربية'], ['en', 'English']]} label={t('s_language')} />
        </div>
        <div class="section">
          <h2>{t('s_theme')}</h2>
          <Seg value={st.theme} onChange={v => setSettings({ theme: v })} options={[['auto', t('s_auto')], ['light', t('s_light')], ['dark', t('s_dark')]]} label={t('s_theme')} />
        </div>
        {st.lang === 'ar' && <div class="section">
          <h2>{t('s_digits')}</h2>
          <Seg value={st.digits} onChange={v => setSettings({ digits: v })} options={[['latn', '123'], ['arab', '١٢٣']]} label={t('s_digits')} />
        </div>}
        <div class="section">
          <h2>{t('s_dates')}</h2>
          <Seg value={st.cal} onChange={v => setSettings({ cal: v })} options={[['entered', t('s_cal_entered')], ['g', t('cal_g')], ['h', t('cal_h')]]} label={t('s_dates')} />
          <p class="hint">{t('s_cal_hint')}</p>
          <div class="list" style="margin-top:10px"><Toggle checked={st.both} onChange={v => setSettings({ both: v })} label={t('s_both')} sub={bothExample()} /></div>
        </div>
        <div class="section">
          <h2>{t('s_names')}</h2>
          <Seg value={st.style} onChange={v => setSettings({ style: v })} options={[['bin', t('s_style_bin')], ['plain', t('s_style_plain')]]} label={t('s_names')} />
          <div style="margin-top:8px"><Seg mini value={String(st.depth)} onChange={v => setSettings({ depth: +v })} options={[['3', t('s_depth', { n: dig(3) })], ['4', t('s_depth', { n: dig(4) })], ['5', t('s_depth', { n: dig(5) })], ['0', t('s_depth_all')]]} label={t('s_names')} /></div>
          <p class="hint naskh" style="font-size:16px">{sample}</p>
          {st.lang === 'ar' && <div class="list" style="margin-top:10px"><Toggle checked={st.mercy} onChange={v => setSettings({ mercy: v })} label={t('s_mercy')} sub={t('s_mercy_sub')} /></div>}
        </div>
        <div class="section">
          <h2>{t('s_me')}</h2>
          <div class="list">
            {s.me && ix.P[s.me]
              ? <PersonRow id={s.me} meta={t('s_me_sub')} onClick={() => pickPerson({ title: t('s_me'), onPick: setMe })} />
              : <button class="row" onClick={() => pickPerson({ title: t('s_me'), onPick: setMe })}><Icon name="target" class="chev" /><span class="grow"><span class="title">{t('s_me_pick')}</span><span class="meta">{t('s_me_sub')}</span></span></button>}
          </div>
        </div>
        <div class="section">
          <h2>{t('s_privacy')}</h2>
          <div class="list">
            <Toggle checked={!!st.lock} onChange={on => { if (on) setPinSheet(true); else { setSettings({ lock: '', lockSalt: '', lockLen: 0 }); toast(t('lock_off')); } }} label={t('s_lock')} sub={t('s_lock_sub')} />
          </div>
        </div>
        <div class="section">
          <div class="list">
            <button class="row" onClick={() => go('about')}><Icon name="info" class="chev" /><span class="grow"><span class="title">{t('about')}</span></span><Icon name="chevron" class="chev" /></button>
            <button class="row" onClick={async () => {
              const has = Object.keys(s.people).length > 0;
              const ok = await confirmDialog({ title: t('demo_q'), text: has ? t('demo_p_has') : t('demo_p'), ok: t('demo_load'), danger: has });
              if (!ok) return;
              replaceState({ ...demoState(), settings: s.settings, view: s.view });
              go('tree');
            }}><Icon name="tree" class="chev" /><span class="grow"><span class="title">{t('demo_try')}</span><span class="meta">{t('demo_sub')}</span></span></button>
            <button class="row" onClick={async () => {
              const ok = await confirmDialog({ title: t('erase_q'), text: t('erase_p'), ok: t('erase'), danger: true });
              if (!ok) return;
              const d = defaultState();
              update(x => { Object.assign(x, d, { settings: { ...s.settings, onboarded: false, lock: '', lockSalt: '', lockLen: 0 } }); });
              clearUndo();
              go('tree', true);
            }}><Icon name="trash" class="chev" /><span class="grow"><span class="title err">{t('erase')}</span><span class="meta">{t('erase_sub')}</span></span></button>
          </div>
        </div>
        <p class="hint" style="text-align:center;margin-top:24px">{t('app_name')} {dig(__APP_VERSION__)}</p>
      </div>
      {pinSheet && <PinSheet onClose={() => setPinSheet(false)} />}
    </div>
  );
}

function PinSheet({ onClose }) {
  const [a, setA] = useState(''), [b, setB] = useState('');
  const ok = /^\d{4,8}$/.test(a) && a === b;
  return (
    <Sheet onClose={onClose} title={t('s_lock')}>
      <p class="small muted" style="margin-top:0">{t('lock_about')}</p>
      <label class="field"><span class="lab">{t('pin_new')}</span><input class="input num" type="password" inputMode="numeric" autoComplete="new-password" value={a} onInput={e => setA(e.currentTarget.value.replace(/\D/g, '').slice(0, 8))} /></label>
      <label class="field"><span class="lab">{t('pin_again')}</span><input class="input num" type="password" inputMode="numeric" autoComplete="new-password" value={b} onInput={e => setB(e.currentTarget.value.replace(/\D/g, '').slice(0, 8))} /></label>
      {b && a !== b && <p class="hint err">{t('pin_mismatch')}</p>}
      <button class="btn wide" style="margin-top:16px" disabled={!ok} onClick={async () => { await setPin(a); onClose(); toast(t('lock_on')); }}><Icon name="lock" />{t('lock_set')}</button>
    </Sheet>
  );
}

export function AboutScreen() {
  const ar = lang.value === 'ar';
  return (
    <div class="screen">
      <TopBar back="settings" title={t('about')} />
      <div class="wrap prose">
        <p style="font-family:var(--ruqaa);font-size:44px;margin:4px 0 0;text-align:center">{t('app_name')}</p>
        <p class="lead" style="text-align:center">{t('tagline')}</p>
        {ar ? <>
          <p>نَسَب يحفظ شجرة عائلتك على جهازك وحده: لا حساب ولا خادم ولا إعلانات ولا تتبّع. تطبيق أندرويد لا يملك صلاحية الإنترنت أصلاً، فلا تغادر بياناتك هاتفك إلا بملف تصدّره أنت.</p>
          <p>احفظ نسخة إكسل احتياطية بين حين وآخر في درايف أو أي مكان، فهي تحفظ كل شيء ومعها الصور، وتسترجعها على هاتف جديد. ويمكنك كتابة الشجرة أو تصحيحها في إكسل نفسه ثم استرجاعها.</p>
          <p>التاريخ الهجري بتقويم أم القرى. وصلة القرابة تُحسب من أقرب جدٍّ مشترك، وتظهر كل صلات القرابة إن تزوّج الأقارب.</p>
          <h3>الخطوط والمكتبات</h3>
          <p class="small">الخطوط Noto Naskh Arabic وReadex Pro وAref Ruqaa وAmiri وReem Kufi (برخصة SIL Open Font License). والمكتبات Preact وpdf-lib وfontkit وbidi-js وExcelJS (MIT) وd3 (ISC). نصوص الرخص في مجلدي fonts وvendor.</p>
        </> : <>
          <p>Nasab keeps your family tree on your device only: no account, no server, no ads, no tracking. The Android app has no internet permission at all; your data leaves the phone only in files you export.</p>
          <p>Save an Excel backup now and then (to Drive or anywhere): it keeps everything, photos included, and restores on a new phone. You can also write or correct the tree in Excel and restore it.</p>
          <p>Hijri dates use the Umm al-Qura calendar. Relations are found through the nearest common ancestor; when relatives married, every relation is shown.</p>
          <h3>Fonts and libraries</h3>
          <p class="small">Noto Naskh Arabic, Readex Pro, Aref Ruqaa, Amiri and Reem Kufi fonts (SIL Open Font License); Preact, pdf-lib, fontkit, bidi-js, ExcelJS (MIT) and d3 (ISC). License texts are in the fonts and vendor folders.</p>
        </>}
      </div>
    </div>
  );
}
