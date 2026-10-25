// What exports need, loaded on first use: pdf-lib + fontkit + bidi-js (vendor/pdf.js), the fonts as TTF
// (for vector text in PDFs and SVGs) and as FontFaces (for PNG images and previews), and photos.
import { FONTS } from '../chart/themes.js';
import { createTextEngine } from '../chart/text.js';
import { photoJpegBytes, photoImage } from '../core/photos.js';

export function loadScript(src, integrity, global) {
  if (window[global]) return Promise.resolve(window[global]);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    s.onload = () => (window[global] ? resolve(window[global]) : reject(new Error(global + ' missing')));
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}
let libP = null;
export const loadPdfLib = () => (libP = libP || loadScript('vendor/pdf.js', __PDF_SRI__, 'NasabPDF').catch(e => { libP = null; throw e; }));

const ttf = {};
async function fontBytes(key) {
  const f = FONTS[key];
  if (!f) throw new Error('font ' + key);
  if (!ttf[f.file]) {
    ttf[f.file] = fetch('fonts/pdf/' + f.file, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error('font ' + f.file); return r.arrayBuffer(); }).then(b => new Uint8Array(b))
      .catch(e => { delete ttf[f.file]; throw e; });
  }
  return ttf[f.file];
}
/** the fonts a theme uses (plus the fallback) */
export const themeFontKeys = th => [...new Set([...Object.values(th.fonts), 'ui', 'uiB', 'naskhB'])];

const engines = new Map();
/** a text engine (vector outlines) for these fonts, in this direction */
export async function getEngine(keys, dir) {
  const k = keys.slice().sort().join(',') + '|' + dir;
  if (engines.has(k)) return engines.get(k);
  const lib = await loadPdfLib();
  const bytes = await Promise.all(keys.map(fontBytes));
  const fonts = {};
  keys.forEach((key, i) => { fonts[key] = bytes[i]; });
  const engine = createTextEngine({ fontkit: lib.fontkit, bidi: lib.bidiFactory(), fonts, dir, fallback: 'ui' });
  engines.set(k, engine);
  return engine;
}
/** the same fonts for the browser's own drawing (canvas images, SVG previews) */
const faces = new Set();
export async function registerFaces(keys) {
  await Promise.all(keys.map(async key => {
    const f = FONTS[key];
    const id = f.family + '|' + f.weight;
    if (faces.has(id)) return;
    const bytes = await fontBytes(key);
    const face = new FontFace(f.family, bytes, { weight: String(f.weight) });
    await face.load();
    document.fonts.add(face);
    faces.add(id);
  }));
}

/** photos as small JPEG bytes (PDF) or images (canvas), for the people who have one */
export async function photoBytesMap(ids, size = 320) {
  const m = new Map();
  for (const id of ids) { const b = await photoJpegBytes(id, size).catch(() => null); if (b) m.set(id, b); }
  return m;
}
export async function photoImageMap(ids, size = 320) {
  const m = new Map();
  for (const id of ids) { const im = await photoImage(id, size).catch(() => null); if (im) m.set(id, im); }
  return m;
}
/** photo ids drawn in a scene */
export function scenePhotos(items, out = new Set()) {
  for (const it of items) {
    if (it.t === 'image' && it.photo) out.add(it.photo);
    if (it.t === 'g' && it.items) scenePhotos(it.items, out);
  }
  return out;
}
