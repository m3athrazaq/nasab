// The shared tree as one HTML file: the viewer (vendor/viewer.js) and the family's data in one page that
// opens in any browser. Phone numbers and emails are never included; dates of the living and photos only
// if the user wants.
import { t } from '../core/i18n.js';
import { bufToB64, esc } from '../core/util.js';
import { photoJpegBytes } from '../core/photos.js';
import { viewerData } from './viewer-data.js';
import { TEMPLATE } from './viewer-template.js';

export async function exportHtml(s, { photos = true, hideLiving = true, notes = true, dKids = false, women = true, inside = false } = {}) {
  // the photos first (they are read from the device's storage), then the same data as the view page
  const urls = new Map();
  if (photos) {
    for (const p of Object.values(s.people)) {
      if (!p.photo || urls.has(p.photo)) continue;
      const bytes = await photoJpegBytes(p.photo, 160).catch(() => null);
      if (bytes) urls.set(p.photo, 'data:image/jpeg;base64,' + bufToB64(bytes));
    }
  }
  const data = viewerData(s, { photo: id => urls.get(id) || '', hideLiving, notes, dKids, women, inside });
  const L = data.lang;
  const viewer = await fetch('vendor/viewer.js', { cache: 'force-cache', integrity: __VIEWER_SRI__ }).then(r => { if (!r.ok) throw new Error('viewer'); return r.text(); });
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = TEMPLATE
    .replace('%LANG%', L).replace('%DIR%', L === 'ar' ? 'rtl' : 'ltr').replace('%TITLE%', esc(data.title))
    .replace('/*DATA*/', () => 'window.NASAB_DATA=' + json + ';')
    .replace('/*VIEWER*/', () => viewer.replace(/<\/script/gi, '<\\/script'));
  return { blob: new Blob([html], { type: 'text/html' }), title: data.title, size: html.length, t };
}
