// نَسَب — start: the saved family, then the app.
import { render } from 'preact';
import { loadState, state } from './core/store.js';
import { tidyPhotos } from './core/photos.js';
import { isNative, cleanOldExports } from './core/native.js';
import { ready } from './ui/app-state.js';
import { App } from './ui/App.jsx';
import { startSync } from './core/sync.js';
import { readLinkCode } from './core/github.js';
import { go } from './ui/router.js';
import { joinCode } from './ui/screens/Sync.jsx';

// a relative's app link (…/nasab/#nasab1:…): the key leaves the address bar (and this page's history)
// at once, then the app asks before linking this device to that tree
function takeAppLink() {
  if (!/^#nasab1:/.test(location.hash)) return;
  const c = readLinkCode(location.hash);
  go('tree', true);
  joinCode.value = c || { bad: true };
}

// the app never runs inside another site's frame (except the private preview, built with ALLOW_FRAME)
if (window.top !== window.self && !__ALLOW_FRAME__) {
  document.documentElement.innerHTML = '';
  throw new Error('framed');
}
takeAppLink();
addEventListener('hashchange', takeAppLink);

(async function boot() {
  const root = document.getElementById('app');
  try {
    await loadState();
    tidyPhotos(state.value).catch(() => {});
  } catch (e) {
    console.error(e);
    root.innerHTML = '<div style="padding:32px;font-family:system-ui;text-align:center"><p>تعذّر تشغيل التطبيق. أعد المحاولة.</p><p>The app could not start. Please try again.</p></div>';
    return;
  }
  ready.value = true;
  root.textContent = '';
  render(<App />, root);
  // linked to the user's private repository? then the family syncs (nothing happens otherwise)
  if (!__ALLOW_FRAME__) startSync().catch(e => console.error(e));
  if (!isNative && 'serviceWorker' in navigator && window.isSecureContext && !__ALLOW_FRAME__) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (isNative) cleanOldExports();
})();
