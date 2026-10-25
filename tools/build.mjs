// Builds the web app from src/ into the files GitHub Pages and the Android app serve:
//   app.js              the app (src/, bundled and minified)
//   vendor/pdf.js       PDF engine, loaded only when a PDF, image or SVG is made (pdf-lib, fontkit, bidi-js)
//   vendor/exceljs.min.js  Excel engine, loaded only for backups (ExcelJS)
//   vendor/viewer.js    the viewer put inside a shared HTML file
//   index.html          page shell with the app's integrity hash (SRI) and styles
//   sw.js               offline cache with the list of every file and a version derived from their hashes
//   fonts/              the typefaces (woff2 for the screen, ttf for vector text in PDFs and SVGs)
//
//   node tools/build.mjs           build
//   node tools/build.mjs --check   build in memory and fail if the committed files differ (used by CI)
//   PREVIEW=1 OUT=<dir> node tools/build.mjs   a private preview that may run inside a frame
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : ROOT;
const CHECK = process.argv.includes('--check');
// the private preview runs as a page inside the Claude app: no service worker, no file hand-over, its own
// page skeleton (the host adds the document around it), and no integrity hashes on its scripts
const PREVIEW = !!process.env.PREVIEW;
const sriOf = rel => JSON.stringify(PREVIEW ? '' : sri(outputs.get(rel)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;

const outputs = new Map(); // relative path -> Buffer
const put = (rel, data) => outputs.set(rel, Buffer.isBuffer(data) ? data : Buffer.from(data));
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const short = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const nm = p => require.resolve(p);

/* ---- fonts: the screen (woff2 subsets) ---- */
const FS = path.join(ROOT, 'node_modules/@fontsource');
const fontFiles = [];
for (const [family, dir, weights, subsets] of [
  ['Nasab Readex', 'readex-pro', [400, 500, 600], ['arabic', 'latin']],
  ['Nasab Naskh', 'noto-naskh-arabic', [400, 700], ['arabic', 'latin']],
  ['Nasab Ruqaa', 'aref-ruqaa', [700], ['arabic', 'latin']]
]) {
  for (const w of weights) for (const s of subsets) {
    const name = `${dir}-${s}-${w}-normal.woff2`;
    put('fonts/' + name, fs.readFileSync(path.join(FS, dir, 'files', name)));
    fontFiles.push({ family, w, s, name });
  }
}
const RANGES = {
  arabic: 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
};
const fontFaceCSS = fontFiles.map(f =>
  `@font-face{font-family:"${f.family}";font-weight:${f.w};font-display:swap;src:url(fonts/${f.name}) format("woff2");unicode-range:${RANGES[f.s]}}`
).join('\n');
/* ---- fonts: vector text in PDFs, SVGs and images (TTF, whole) ---- */
const EXPO = path.join(ROOT, 'node_modules/@expo-google-fonts');
for (const [file, src] of [
  ['NotoNaskhArabic-Bold.ttf', 'noto-naskh-arabic/700Bold/NotoNaskhArabic_700Bold.ttf'],
  ['NotoNaskhArabic-Regular.ttf', 'noto-naskh-arabic/400Regular/NotoNaskhArabic_400Regular.ttf'],
  ['ReadexPro-Regular.ttf', 'readex-pro/400Regular/ReadexPro_400Regular.ttf'],
  ['ReadexPro-SemiBold.ttf', 'readex-pro/600SemiBold/ReadexPro_600SemiBold.ttf'],
  ['ArefRuqaa-Bold.ttf', 'aref-ruqaa/700Bold/ArefRuqaa_700Bold.ttf'],
  ['Amiri-Regular.ttf', 'amiri/400Regular/Amiri_400Regular.ttf'],
  ['Amiri-Bold.ttf', 'amiri/700Bold/Amiri_700Bold.ttf'],
  ['ReemKufi-Bold.ttf', 'reem-kufi/700Bold/ReemKufi_700Bold.ttf']
]) put('fonts/pdf/' + file, fs.readFileSync(path.join(EXPO, src)));
put('fonts/OFL.txt', ['noto-naskh-arabic', 'readex-pro', 'aref-ruqaa', 'amiri', 'reem-kufi'].map(f => `==== ${f} ====\n` + fs.readFileSync(path.join(EXPO, f, 'LICENSE_FONT'), 'utf8')).join('\n\n'));

/* ---- vendor bundles ---- */
put('vendor/exceljs.min.js', fs.readFileSync(nm('exceljs/dist/exceljs.min.js')));
put('vendor/exceljs-LICENSE', fs.readFileSync(path.join(ROOT, 'node_modules/exceljs/LICENSE')));
const pdfBuild = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/vendor/pdf-entry.js')],
  bundle: true, minify: true, format: 'iife', globalName: 'NasabPDF', platform: 'browser',
  target: ['es2019'], write: false, legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' }
});
put('vendor/pdf.js', pdfBuild.outputFiles[0].contents);
put('vendor/pdf-LICENSES.txt', ['pdf-lib', '@pdf-lib/fontkit', 'bidi-js', 'd3-hierarchy', 'd3-zoom', 'preact'].map(p => {
  const dir = path.join(ROOT, 'node_modules', p);
  const lic = fs.readdirSync(dir).find(f => /^licen[cs]e/i.test(f));
  return `==== ${p} ====\n` + (lic ? fs.readFileSync(path.join(dir, lic), 'utf8') : 'MIT');
}).join('\n\n'));
const viewerBuild = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/viewer/main.js')],
  bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['es2020', 'safari15', 'chrome90'], write: false, legalComments: 'none', charset: 'utf8',
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(APP_VERSION) }
});
put('vendor/viewer.js', viewerBuild.outputFiles[0].contents);

/* ---- app ---- */
const appBuild = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.jsx')],
  bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: ['es2020', 'safari15', 'chrome90'], write: false, legalComments: 'none',
  jsx: 'automatic', jsxImportSource: 'preact', charset: 'utf8',
  define: {
    'process.env.NODE_ENV': '"production"',
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __ALLOW_FRAME__: process.env.PREVIEW ? 'true' : 'false',
    __EXCELJS_SRI__: sriOf('vendor/exceljs.min.js'),
    __PDF_SRI__: sriOf('vendor/pdf.js'),
    __VIEWER_SRI__: sriOf('vendor/viewer.js')
  }
});
const appJs = appBuild.outputFiles[0].contents;
put('app.js', appJs);
const appTag = short(appJs);

/* ---- page ---- */
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
html = html
  .replace('/*FONTS*/', fontFaceCSS)
  .replace('/*STYLES*/', css.trim())
  .replace('<!--APP-->', PREVIEW ? '<script src="app.js"></script>' : `<script src="app.js?v=${appTag}" integrity="${sri(appJs)}"></script>`)
  .replaceAll('%VERSION%', APP_VERSION);
if (PREVIEW) {
  // the host wraps the page in its own document: keep the title, the styles and the body only
  const pick = re => (html.match(re) || [''])[0];
  html = [pick(/<title>[\s\S]*?<\/title>/), pick(/<style>[\s\S]*?<\/style>/), (html.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1].trim()].join('\n') + '\n';
}
put('index.html', html);

/* ---- service worker: every file of the app, so it works fully offline ---- */
const staticFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png'].filter(f => fs.existsSync(path.join(ROOT, f)));
const generated = [...outputs.keys()].filter(f => !/LICENSE|OFL|\.txt$/i.test(f) && f !== 'index.html' && f !== 'app.js');
const assets = ['./', './index.html', `./app.js?v=${appTag}`, ...[...generated, ...staticFiles].sort().map(f => './' + f)];
const versionHash = crypto.createHash('sha256');
for (const f of [...outputs.keys()].sort()) versionHash.update(f).update(outputs.get(f));
for (const f of staticFiles) versionHash.update(f).update(fs.readFileSync(path.join(ROOT, f)));
const SWV = versionHash.digest('hex').slice(0, 12);
let sw = fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8');
sw = sw.replace("const APPV = '';", `const APPV = '${SWV}';`).replace('const ASSETS = [];', 'const ASSETS = ' + JSON.stringify(assets) + ';');
put('sw.js', sw);
if (OUT !== ROOT) for (const f of staticFiles) put(f, fs.readFileSync(path.join(ROOT, f)));

/* ---- write or compare ---- */
const stale = [];
for (const [rel, buf] of outputs) {
  const file = path.join(OUT, rel);
  const same = fs.existsSync(file) && fs.readFileSync(file).equals(buf);
  if (same) continue;
  stale.push(rel);
  if (!CHECK) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }
}
if (CHECK && stale.length) {
  console.error('Out of date — run `npm run build`: ' + stale.join(', '));
  process.exit(1);
}
console.log(`${CHECK ? 'up to date' : 'built'} — app.js ${(appJs.length / 1024).toFixed(0)} KB (${appTag}), pdf.js ${(outputs.get('vendor/pdf.js').length / 1024).toFixed(0)} KB, viewer.js ${(outputs.get('vendor/viewer.js').length / 1024).toFixed(0)} KB, cache ${SWV}, ${assets.length} files offline` + (stale.length && !CHECK ? `; updated: ${stale.length} files` : ''));
