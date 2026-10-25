// The printed tree as a file: PDF (vector, any size), PNG image, or SVG — all drawn from the same page.
import { posterTheme, cssFont } from '../chart/themes.js';
import { sceneToPdf, sceneToCanvas, sceneToSvg } from '../chart/render.js';
import { buildPoster } from './poster.js';
import { loadPdfLib, getEngine, registerFaces, themeFontKeys, photoBytesMap, photoImageMap, scenePhotos } from './engine.js';
import { lang } from '../core/i18n.js';
import { bufToB64 } from '../core/util.js';

const dirOf = () => (lang.value === 'ar' ? 'rtl' : 'ltr');
const allPhotoIds = s => new Set(Object.values(s.people).map(p => p.photo).filter(Boolean));

/** sets the document's title, author, language */
export function pdfMeta(doc, title) {
  doc.setTitle(title || 'Nasab');
  doc.setAuthor('Nasab'); doc.setCreator('Nasab — نَسَب'); doc.setProducer('Nasab');
  doc.setLanguage(lang.value === 'ar' ? 'ar' : 'en');
  doc.setCreationDate(new Date());
}

/** the poster (layout, size, measures) with the theme's fonts — for the preview and every format */
export async function preparePoster(ix, s, opts) {
  const th = posterTheme(opts.theme);
  const keys = themeFontKeys(th);
  const engine = await getEngine(keys, dirOf());
  const P = buildPoster(ix, s, opts, { measure: engine.measure.bind(engine), photoIds: opts.photos === false ? new Set() : allPhotoIds(s) });
  return { P, engine, keys, th };
}

export async function posterPdf(ix, s, opts) {
  const lib = await loadPdfLib();
  const { P, engine } = await preparePoster(ix, s, opts);
  if (!P) throw new Error('empty');
  const doc = await lib.PDFDocument.create();
  pdfMeta(doc, opts.title || 'Family tree');
  const page = doc.addPage([P.W, P.H]);
  const images = new Map();
  for (const [id, bytes] of await photoBytesMap(scenePhotos(P.scene), 360)) {
    try { images.set(id, await doc.embedJpg(bytes)); } catch (e) { /* skip a broken photo */ }
  }
  sceneToPdf(lib, doc, page, P.scene, { engine, images });
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), P };
}

/** pixels for an image of the page: sharp, but within what phones can draw (16 megapixels) */
export function pngScale(W, H, { maxArea = 16e6, maxSide = 8000, want = 3 } = {}) {
  return Math.max(0.2, Math.min(want, Math.sqrt(maxArea / (W * H)), maxSide / Math.max(W, H)));
}
export async function posterPng(ix, s, opts) {
  const { P, keys } = await preparePoster(ix, s, opts);
  if (!P) throw new Error('empty');
  await registerFaces(keys);
  const k = pngScale(P.W, P.H);
  const c = document.createElement('canvas');
  c.width = Math.round(P.W * k); c.height = Math.round(P.H * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  const photos = await photoImageMap(scenePhotos(P.scene), 360);
  sceneToCanvas(ctx, P.scene, { dir: dirOf(), photos, cssFont });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  if (!blob) throw new Error('image');
  return { blob, P, px: [Math.round(P.W * k), Math.round(P.H * k)] };
}
export async function posterSvg(ix, s, opts) {
  const { P, engine } = await preparePoster(ix, s, opts);
  if (!P) throw new Error('empty');
  const hrefs = new Map();
  for (const [id, bytes] of await photoBytesMap(scenePhotos(P.scene), 300)) hrefs.set(id, 'data:image/jpeg;base64,' + bufToB64(bytes));
  const svg = sceneToSvg(P.scene, { width: P.W, height: P.H, text: 'outline', engine, dir: dirOf(), photoHref: id => hrefs.get(id) || '' });
  return { blob: new Blob([svg], { type: 'image/svg+xml' }), P };
}
/** a light preview of the page (text drawn by the browser with the same fonts) */
export async function posterPreview(ix, s, opts, photoUrls) {
  const { P, keys } = await preparePoster(ix, s, opts);
  if (!P) return null;
  await registerFaces(keys);
  const svg = sceneToSvg(P.scene, { width: P.W, height: P.H, text: 'fonts', dir: dirOf(), photoHref: id => (photoUrls && photoUrls.get(id)) || '' });
  return { svg, P };
}

/* ---------------- the family book and the lineage certificate ---------------- */
import { buildBook } from './book.js';
import { buildCertificate } from './certificate.js';

async function scenesToPdf(lib, engine, pages, title) {
  const doc = await lib.PDFDocument.create();
  pdfMeta(doc, title);
  const used = new Set();
  for (const pg of pages) scenePhotos(pg.scene, used);
  const images = new Map();
  for (const [id, bytes] of await photoBytesMap(used, 360)) {
    try { images.set(id, await doc.embedJpg(bytes)); } catch (e) { /* skip */ }
  }
  for (const pg of pages) sceneToPdf(lib, doc, doc.addPage([pg.W, pg.H]), pg.scene, { engine, images });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
export async function prepareBook(ix, s, opts) {
  const th = posterTheme(opts.theme);
  const keys = [...new Set([...themeFontKeys(th), 'naskh', 'naskhB'])];
  const engine = await getEngine(keys, dirOf());
  const B = buildBook(ix, s, opts, { measure: engine.measure.bind(engine), photoIds: opts.photos === false ? new Set() : allPhotoIds(s) });
  return { B, engine, keys };
}
export async function bookPdf(ix, s, opts) {
  const lib = await loadPdfLib();
  const { B, engine } = await prepareBook(ix, s, opts);
  if (!B) throw new Error('empty');
  return { blob: await scenesToPdf(lib, engine, B.pages, B.title), pages: B.pages.length };
}
export async function prepareCertificate(ix, s, id, opts) {
  const th = posterTheme(opts.theme || 'manuscript');
  const keys = [...new Set([...themeFontKeys(th), 'amiriB'])];
  const engine = await getEngine(keys, dirOf());
  const C = buildCertificate(ix, s, id, opts, { measure: engine.measure.bind(engine) });
  return { C, engine, keys };
}
export async function certificatePdf(ix, s, id, opts) {
  const lib = await loadPdfLib();
  const { C, engine } = await prepareCertificate(ix, s, id, opts);
  if (!C) throw new Error('empty');
  return { blob: await scenesToPdf(lib, engine, [C], C.title), title: C.title };
}
/** an SVG preview of one page (fonts drawn by the browser) */
export async function pagePreview(page, keys, photoUrls) {
  await registerFaces(keys);
  return sceneToSvg(page.scene, { width: page.W, height: page.H, text: 'fonts', dir: dirOf(), photoHref: id => (photoUrls && photoUrls.get(id)) || '' });
}
