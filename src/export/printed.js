// The printed tree as a file: PDF (vector, any size), PNG image, or SVG — all drawn from the same page.
import { posterTheme, cssFont } from '../chart/themes.js';
import { sceneToPdf, sceneToCanvas, sceneToSvg } from '../chart/render.js';
import { buildPoster, posterFit, PAPERS } from './poster.js';
import { buildTable, TABLE_FONTS } from './table.js';
import { buildOutline } from './outline.js';
import { buildAtlas, atlasPlan } from './atlas.js';
import { loadPdfLib, getEngine, registerFaces, themeFontKeys, photoBytesMap, photoImageMap, scenePhotos } from './engine.js';
import { lang } from '../core/i18n.js';
import { bufToB64 } from '../core/util.js';

const dirOf = () => (lang.value === 'ar' ? 'rtl' : 'ltr');
const allPhotoIds = s => new Set(Object.values(s.people).map(p => p.photo).filter(Boolean));

/** sets the document's title, author, language */
export function pdfMeta(doc, title, author = '') {
  doc.setTitle(title || 'Family tree');
  if (author) doc.setAuthor(author);
  doc.setCreator('Nasab'); doc.setProducer('Nasab');
  doc.setLanguage(lang.value === 'ar' ? 'ar' : 'en');
  doc.setCreationDate(new Date());
}

/** the poster (layout, size, measures) with the theme's fonts — for the preview and every format.
 * The table of generations ('g'), the outline ('o') and the atlas ('a') may run over several pages
 * (P.pages); the table has its own look. */
export async function preparePoster(ix, s, opts) {
  const th = posterTheme(opts.theme);
  const table = opts.mode === 'g';
  const keys = table ? TABLE_FONTS : themeFontKeys(th);
  const engine = await getEngine(keys, dirOf());
  const env = { measure: engine.measure.bind(engine), photoIds: opts.photos === false || table || opts.mode === 'o' ? new Set() : allPhotoIds(s) };
  const build = { g: buildTable, o: buildOutline, a: buildAtlas }[opts.mode] || buildPoster;
  const P = build(ix, s, opts, env);
  return { P, engine, keys, th };
}
/** an image or an SVG of the table or the outline is one long page, however it is printed; of the
 * atlas, its pages one under the other */
const oneImage = opts => (opts.mode === 'g' || opts.mode === 'o' ? { ...opts, paper: 'auto', single: true } : opts);
const asOne = P => (P.pages && P.pages.length > 1 ? stacked(P.pages) : P);

/** names this big (points) or bigger read easily in print */
export const GOOD_NAMES = 8;
/**
 * when the names would come out small: what reads well instead — the atlas and the outline on pages of
 * this paper (A4 for a poster sized to the tree), and the smallest paper on which a one-page shape does
 * (this shape first). → { atlas: { pages, nameSize, paper }, outline: { … }, paper: { paper, mode, nameSize } }
 */
export async function posterAdvice(ix, s, opts) {
  const out = {};
  const paper = PAPERS[opts.paper] ? opts.paper : 'A4';
  if (opts.mode !== 'f') {
    const plan = atlasPlan(ix, s, { ...opts, paper, orient: 'auto' });
    if (plan) out.atlas = { pages: plan.pages.length, nameSize: plan.nameSize, paper };
    const th = posterTheme(opts.theme);
    const engine = await getEngine(themeFontKeys(th), dirOf());
    const O = buildOutline(ix, s, { ...opts, paper, orient: 'portrait' }, { measure: engine.measure.bind(engine) });
    if (O) out.outline = { pages: O.pages.length, nameSize: O.nameSize, paper };
  }
  const shapes = opts.mode === 'f' ? ['f'] : [opts.mode, ...['v', 'r', 'h'].filter(m => m !== opts.mode)];
  for (const p of Object.keys(PAPERS)) {
    for (const mode of shapes) {
      const f = posterFit(ix, s, { ...opts, mode, paper: p });
      if (f && f.nameSize >= GOOD_NAMES) { out.paper = { paper: p, mode, nameSize: f.nameSize }; break; }
    }
    if (out.paper) break;
  }
  return out;
}
/** several pages one under the other (the preview of a table printed on pages) */
function stacked(pages, gap = 24) {
  const W = Math.max(...pages.map(p => p.W));
  const scene = [];
  let y = 0;
  pages.forEach((p, i) => {
    if (i) { scene.push({ t: 'rect', x: 0, y, w: W, h: gap, fill: '#D9D4CB' }); y += gap; }
    scene.push({ t: 'g', tf: [1, (W - p.W) / 2, y], items: p.scene });
    y += p.H;
  });
  return { W, H: y, scene };
}

export async function posterPdf(ix, s, opts) {
  const lib = await loadPdfLib();
  const { P, engine } = await preparePoster(ix, s, opts);
  if (!P) throw new Error('empty');
  const doc = await lib.PDFDocument.create();
  pdfMeta(doc, opts.title || 'Family tree', opts.by);
  const images = new Map();
  for (const [id, bytes] of await photoBytesMap(scenePhotos(P.scene), 360)) {
    try { images.set(id, await doc.embedJpg(bytes)); } catch (e) { /* skip a broken photo */ }
  }
  for (const pg of P.pages || [P]) sceneToPdf(lib, doc, doc.addPage([pg.W, pg.H]), pg.scene, { engine, images });
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), P };
}

/** pixels for an image of the page: sharp, but within what phones can draw (16 megapixels) */
export function pngScale(W, H, { maxArea = 16e6, maxSide = 8000, want = 3 } = {}) {
  return Math.max(0.2, Math.min(want, Math.sqrt(maxArea / (W * H)), maxSide / Math.max(W, H)));
}
export async function posterPng(ix, s, opts) {
  const { P: P0, keys } = await preparePoster(ix, s, oneImage(opts));
  if (!P0) throw new Error('empty');
  const P = asOne(P0);
  await registerFaces(keys);
  // a long table may be a tall image (phones draw up to 16 megapixels, whatever the shape)
  const k = pngScale(P.W, P.H, ['g', 'o', 'a'].includes(opts.mode) ? { maxSide: 16000 } : {});
  const c = document.createElement('canvas');
  c.width = Math.round(P.W * k); c.height = Math.round(P.H * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  const photos = await photoImageMap(scenePhotos(P.scene), 360);
  sceneToCanvas(ctx, P.scene, { dir: dirOf(), photos, cssFont });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  if (!blob) throw new Error('image');
  return { blob, P: P0, px: [Math.round(P.W * k), Math.round(P.H * k)] };
}
export async function posterSvg(ix, s, opts) {
  const { P: P0, engine } = await preparePoster(ix, s, oneImage(opts));
  if (!P0) throw new Error('empty');
  const P = asOne(P0);
  const hrefs = new Map();
  for (const [id, bytes] of await photoBytesMap(scenePhotos(P.scene), 300)) hrefs.set(id, 'data:image/jpeg;base64,' + bufToB64(bytes));
  const svg = sceneToSvg(P.scene, { width: P.W, height: P.H, text: 'outline', engine, dir: dirOf(), photoHref: id => hrefs.get(id) || '' });
  return { blob: new Blob([svg], { type: 'image/svg+xml' }), P: P0 };
}
/** a light preview of the page (text drawn by the browser with the same fonts) */
export async function posterPreview(ix, s, opts, photoUrls) {
  const { P, keys } = await preparePoster(ix, s, opts);
  if (!P) return null;
  await registerFaces(keys);
  const V = P.pages && P.pages.length > 1 ? stacked(P.pages) : P;
  const svg = sceneToSvg(V.scene, { width: V.W, height: V.H, text: 'fonts', dir: dirOf(), photoHref: id => (photoUrls && photoUrls.get(id)) || '' });
  return { svg, P, W: V.W, H: V.H };
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
