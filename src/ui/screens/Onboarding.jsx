// First start: what the app is, then "who are you?" — a full name typed once becomes you and your
// fathers, linked, so the tree has its trunk in a few seconds. Or import a file, or try a sample family.
import { useState, useRef, useEffect } from 'preact/hooks';
import { state, replaceState } from '../../core/store.js';
import { buildChain, setSettings, addPerson, setRoot, setMe } from '../../core/actions.js';
import { t, lang } from '../../core/i18n.js';
import { parseChain, guessGender, cleanName } from '../../core/names.js';
import { demoState } from '../../core/demo.js';
import { go } from '../router.js';
import { Icon } from '../icons.jsx';
import { Seg } from '../kit.jsx';
import { pickAndRestore } from './Export.jsx';

function Mark() {
  // a tree being drawn: trunk, branches, then the seals of the generations
  const L = (d, len, delay, w = 2.4, c = 'var(--ink)') => <path d={d} style={{ '--len': len, animationDelay: delay + 's' }} stroke={c} stroke-width={w} fill="none" stroke-linecap="round" />;
  const S = (x, y, f, c, delay) => f
    ? <circle class="seed" cx={x} cy={y} r="9" fill="var(--sheet)" stroke={c} stroke-width="2.2" style={{ animationDelay: delay + 's' }} />
    : <rect class="seed" x={x - 9} y={y - 9} width="18" height="18" rx="4" fill="var(--sheet)" stroke={c} stroke-width="2.2" style={{ animationDelay: delay + 's' }} />;
  return (
    <svg class="mark draw" viewBox="0 0 220 220" aria-hidden="true">
      {L('M110 200V120', 80, 0, 5, 'var(--ink)')}
      {L('M110 150C90 140 70 130 58 108', 70, 0.35)}
      {L('M110 150C130 140 150 130 162 108', 70, 0.35)}
      {L('M110 135V80', 55, 0.45)}
      {L('M58 108C50 92 44 80 40 64', 50, 0.8, 1.8)}
      {L('M58 108C64 92 72 78 80 62', 50, 0.8, 1.8)}
      {L('M162 108C156 92 150 80 142 62', 50, 0.85, 1.8)}
      {L('M162 108C170 92 176 80 182 64', 50, 0.85, 1.8)}
      {L('M110 80C104 64 100 50 96 36', 48, 0.9, 1.8)}
      {L('M110 80C116 64 120 50 126 36', 48, 0.9, 1.8)}
      {L('M110 200H86M110 200h24', 30, 0.2, 2, 'var(--ink-3)')}
      <rect class="seed" x="96" y="66" width="28" height="28" rx="7" fill="var(--madder)" style={{ animationDelay: '1.1s' }} />
      {S(58, 108, false, 'var(--madder)', 1.2)}{S(162, 108, false, 'var(--saffron)', 1.25)}
      {S(40, 64, false, 'var(--madder)', 1.45)}{S(80, 62, true, 'var(--madder)', 1.5)}{S(142, 62, true, 'var(--saffron)', 1.55)}{S(182, 64, false, 'var(--saffron)', 1.6)}
      {S(96, 36, false, 'var(--palm)', 1.65)}{S(126, 36, true, 'var(--palm)', 1.7)}
    </svg>
  );
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const ar = lang.value === 'ar';
  if (step === 1) return <WhoAreYou onBack={() => setStep(0)} onFounder={() => setStep(2)} />;
  if (step === 2) return <Founder onBack={() => setStep(0)} />;
  return (
    <div class="onb"><div class="wrap" style="display:flex;flex-direction:column;flex:1;width:100%">
      <div style="display:flex;justify-content:flex-end"><button class="linkbtn" onClick={() => setSettings({ lang: ar ? 'en' : 'ar' })}>{ar ? 'English' : 'العربية'}</button></div>
      <div class="body">
        <div class="hero">
          <Mark />
          <h1 class="word">{t('app_name')}</h1>
          <p class="tag">{t('tagline')}</p>
        </div>
      </div>
      <div class="foot">
        <button class="btn wide" onClick={() => setStep(1)}><Icon name="tree" />{t('ob_start')}</button>
        <button class="btn ghost wide" onClick={() => pickAndRestore()}><Icon name="upload" />{t('ob_import')}</button>
        <button class="linkbtn" onClick={() => { replaceState({ ...demoState(), settings: state.value.settings }); go('tree', true); }}>{t('ob_demo')}</button>
      </div>
    </div></div>
  );
}

function WhoAreYou({ onBack, onFounder }) {
  const [name, setName] = useState('');
  const [g, setG] = useState('m');
  const [gSet, setGSet] = useState(false);
  const [famLast, setFamLast] = useState(null);
  const inp = useRef();
  useEffect(() => { setTimeout(() => inp.current && inp.current.focus(), 200); }, []);
  const chain = parseChain(name, famLast);
  const [fam, setFam] = useState('');
  const famShown = fam || chain.family;
  const ok = chain.names.length >= 1;
  const start = () => {
    if (!ok) return;
    buildChain(chain.names, { family: famShown, gender: g });
    go('tree', true);
  };
  return (
    <div class="onb"><div class="wrap" style="display:flex;flex-direction:column;flex:1;width:100%">
      <button class="iconbtn" onClick={onBack} aria-label={t('back')}><Icon name="back" class="flip" /></button>
      <div class="body" style="justify-content:flex-start;margin-top:12px">
        <h2>{t('ob_who')}</h2>
        <p class="muted" style="margin:6px 0 0">{t('ob_who_p')}</p>
        <label class="field">
          <span class="lab">{t('ob_fullname')}</span>
          <input class="input nm" ref={inp} value={name} placeholder={t('ob_fullname_ph')} onInput={e => { const v = e.currentTarget.value; setName(v); if (!gSet) setG(guessGender(parseChain(v).names[0] || '') || 'm'); }} onKeyDown={e => { if (e.key === 'Enter') start(); }} />
        </label>
        {chain.names.length > 0 && (
          <div class="card pad" style="margin-top:12px" aria-live="polite">
            <p class="small muted" style="margin:0 0 8px">{chain.names.length > 1 ? t('ob_chain', { n: chain.names.length }) : t('ob_one')}</p>
            <div class="chainprev" style="margin-top:0">
              {chain.names.map((x, i) => <span key={i}>{i > 0 && <span class="lnk">{(i === 1 && g === 'f' ? t('daughter_of_short') : t('son_of_short'))} </span>}{x}</span>)}
              {famShown && <span class="fam">{famShown}</span>}
            </div>
            {chain.family && chain.guessedFamily && <button class="linkbtn small" onClick={() => setFamLast(false)}>{t('ob_not_family', { w: chain.family })}</button>}
            {!chain.family && famLast === false && <button class="linkbtn small" onClick={() => setFamLast(null)}>{t('ob_is_family')}</button>}
          </div>
        )}
        <div class="field"><Seg value={g} onChange={v => { setG(v); setGSet(true); }} options={[['m', t('male')], ['f', t('female')]]} label={t('gender')} /></div>
        <label class="field">
          <span class="lab">{t('ob_family')}</span>
          <input class="input" value={fam} placeholder={chain.family || t('family_ph')} onInput={e => setFam(e.currentTarget.value)} />
          <p class="hint">{t('ob_family_hint')}</p>
        </label>
      </div>
      <div class="foot">
        <button class="btn wide" disabled={!ok} onClick={start}><Icon name="check" />{t('ob_go')}</button>
        <button class="linkbtn" onClick={onFounder}>{t('ob_founder')}</button>
      </div>
    </div></div>
  );
}

/** starting from the earliest known grandfather instead of oneself */
function Founder({ onBack }) {
  const [n, setN] = useState('');
  const [fam, setFam] = useState('');
  const go2 = () => {
    const name = cleanName(n);
    if (!name) return;
    const id = addPerson({ n: name, g: 'm', fam });
    setRoot(id);
    setSettings({ onboarded: true });
    go('tree', true);
  };
  return (
    <div class="onb"><div class="wrap" style="display:flex;flex-direction:column;flex:1;width:100%">
      <button class="iconbtn" onClick={onBack} aria-label={t('back')}><Icon name="back" class="flip" /></button>
      <div class="body" style="justify-content:flex-start;margin-top:12px">
        <h2>{t('ob_founder_t')}</h2>
        <p class="muted" style="margin:6px 0 0">{t('ob_founder_p')}</p>
        <label class="field"><span class="lab">{t('name')}</span><input class="input nm" value={n} onInput={e => setN(e.currentTarget.value)} /></label>
        <label class="field"><span class="lab">{t('ob_family')}</span><input class="input" value={fam} onInput={e => setFam(e.currentTarget.value)} placeholder={t('family_ph')} /></label>
      </div>
      <div class="foot"><button class="btn wide" disabled={!cleanName(n)} onClick={go2}><Icon name="check" />{t('ob_go')}</button></div>
    </div></div>
  );
}
export { setMe };
