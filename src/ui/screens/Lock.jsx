// An optional PIN that hides the family behind a lock screen when the app opens (and after two minutes
// in the background). It keeps the screen private; it does not encrypt the data on the phone.
import { useState, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { state } from '../../core/store.js';
import { setSettings } from '../../core/actions.js';
import { t } from '../../core/i18n.js';
import { Icon } from '../icons.jsx';

export const unlocked = signal(false);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function hashPin(pin, salt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return hex(h);
}
export async function setPin(pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  setSettings({ lock: await hashPin(pin, salt), lockSalt: salt, lockLen: pin.length });
  unlocked.value = true;
}
let hiddenAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 120000 && state.value.settings.lock) unlocked.value = false;
  });
}

export function LockScreen() {
  const st = state.value.settings;
  const [pin, setPinText] = useState('');
  const [bad, setBad] = useState(false);
  // the PIN's length is known, so a wrong one is said at once (older locks: tried at every length 4–8)
  const len = st.lockLen || 0;
  useEffect(() => {
    if (pin.length < (len || 4)) return;
    let alive = true;
    hashPin(pin, st.lockSalt).then(h => {
      if (!alive) return;
      if (h === st.lock) { unlocked.value = true; setPinText(''); }
      else if (len || pin.length >= 8) { setBad(true); setPinText(''); }
    });
    return () => { alive = false; };
  }, [pin]);
  const press = d => { setBad(false); setPinText(p => (p + d).slice(0, len || 8)); };
  return (
    <div class="lock" role="dialog" aria-modal="true" aria-label={t('locked')}>
      <Icon name="lock" size="34" />
      <p style="margin:0;font-family:var(--ruqaa);font-size:30px">{t('app_name')}</p>
      <p class="muted" style="margin:0">{bad ? <span class="err">{t('pin_wrong')}</span> : t('pin_enter')}</p>
      <div class={bad ? 'dots bad' : 'dots'} aria-hidden="true">{Array.from({ length: len || Math.max(4, pin.length) }, (_, i) => <i key={i} class={i < pin.length ? 'on' : ''} />)}</div>
      <div class="pad3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <button onClick={() => { setPinText(''); setBad(false); }} aria-label={t('clear')}><Icon name="x" /></button>
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPinText(p => p.slice(0, -1))} aria-label={t('delete_digit')}><Icon name="back" /></button>
      </div>
      <p class="hint" style="max-width:300px;text-align:center">{t('pin_forgot')}</p>
    </div>
  );
}
