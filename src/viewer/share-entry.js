// view.html: the family opened by a view link (…/view.html#owner/repo/key). Downloads the encrypted copy
// from the public repository, opens it with the key from the link (the part after "#", which the browser
// never sends anywhere), then starts the same tree viewer as the interactive file. Nothing is stored.
import { parseViewHash, openShare, readPayload, SHARE_PATH } from '../core/share.js';
import { viewerData } from '../export/viewer-data.js';
import { lang, digits, calPref, calBoth } from '../core/i18n.js';

const $ = s => document.querySelector(s);
function say(ar, en, busy = false) {
  const m = $('#msg');
  m.hidden = false;
  m.className = busy ? 'busy' : '';
  m.innerHTML = '';
  for (const [t, l] of [[ar, 'ar'], [en, 'en']]) { const p = document.createElement('p'); p.lang = l; p.dir = l === 'ar' ? 'rtl' : 'ltr'; p.textContent = t; m.appendChild(p); }
}
async function download(repo) {
  // GitHub's API answers with the latest copy; its raw-file address is the fallback (it may lag a few minutes)
  const tries = [
    [`https://api.github.com/repos/${repo}/contents/${SHARE_PATH}`, { Accept: 'application/vnd.github.raw' }],
    [`https://raw.githubusercontent.com/${repo}/HEAD/${SHARE_PATH}`, {}]
  ];
  let notFound = false;
  for (const [url, headers] of tries) {
    try {
      const r = await fetch(url, { headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      if (r.status === 404) notFound = true;
    } catch (e) { /* the next address */ }
  }
  if (notFound) return null;
  throw new Error('offline');
}

(async () => {
  const h = parseViewHash(location.hash);
  if (!h) return say('هذا الرابط غير مكتمل. افتح الرابط كما وصلك، كاملاً.', 'This link is incomplete. Open it exactly as you received it.');
  say('تُفتح الشجرة…', 'Opening the tree…', true);
  let bytes;
  try { bytes = await download(h.repo); } catch (e) { return say('تعذّر تنزيل الشجرة. تحقق من الاتصال بالإنترنت، ثم افتح الرابط من جديد.', 'The tree could not be downloaded. Check the connection and open the link again.'); }
  if (!bytes) return say('لا توجد شجرة على هذا الرابط.', 'There is no tree at this link.');
  let p;
  try { p = readPayload(await openShare(h.key, bytes)); } catch (e) { return say('هذا الرابط لم يعد يفتح الشجرة، فربما غيّره صاحبها. اطلب منه الرابط الجديد.', 'This link no longer opens the tree; its owner may have changed it. Ask for the new link.'); }
  if (!p.fams.length) return say('الشجرة فارغة.', 'The tree is empty.');
  lang.value = p.cfg.lang; digits.value = p.cfg.digits; calPref.value = p.cfg.cal; calBoth.value = p.cfg.both;
  // the family in the link, else the largest
  const size = f => Object.keys(f.people).length;
  const order = p.fams.map((f, i) => i).sort((a, b) => size(p.fams[b]) - size(p.fams[a]));
  const fi = h.fam >= 0 && p.fams[h.fam] ? h.fam : order[0];
  const f = p.fams[fi];
  const s = { people: f.people, unions: f.unions, root: f.root, me: f.me, settings: { style: p.cfg.style, mercy: p.cfg.mercy, kidsOrder: p.cfg.kidsOrder } };
  const photo = id => (p.photos[id] ? 'data:image/jpeg;base64,' + p.photos[id] : '');
  let data;
  try { data = viewerData(s, { photo, hideLiving: !p.cfg.living, notes: p.cfg.notes }); } catch (e) { return say('الشجرة فارغة.', 'The tree is empty.'); }
  window.NASAB_DATA = data;
  document.documentElement.lang = data.lang;
  document.documentElement.dir = data.lang === 'ar' ? 'rtl' : 'ltr';
  document.title = data.title;
  $('#msg').hidden = true;
  // more than one family: a choice of family above the tree
  if (p.fams.length > 1) {
    const sel = document.createElement('select');
    sel.id = 'fams';
    sel.setAttribute('aria-label', data.lang === 'ar' ? 'العائلة' : 'Family');
    for (const i of order) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.fams[i].fname || (i === fi ? data.title : (data.lang === 'ar' ? 'عائلة ' : 'Family ') + (order.indexOf(i) + 1));
      if (i === fi) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => { location.hash = `${h.repo}/${h.key}/${sel.value}`; location.reload(); });
    $('.bar').appendChild(sel);
  }
  // the viewer reads window.NASAB_DATA when it starts
  const v = document.createElement('script');
  v.src = 'vendor/viewer.js?v=' + __VIEWER_V__;
  v.integrity = __VIEWER_SRI__;
  document.body.appendChild(v);
})();
