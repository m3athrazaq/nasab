// Renders the app icons from tools/icon.svg (run once, with Playwright available): node tools/make-icons.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const art = svg.match(/<g id="art">[\s\S]*<\/g>\s*<\/svg>/)[0].replace(/<\/svg>$/, '');
const BG = '#231C17';
/** the artwork scaled into the middle (k = share of the side it may use), on the background or transparent */
const variant = (k, bg = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg ? `<rect width="512" height="512" fill="${BG}"/>` : ''}<g transform="translate(256 256) scale(${k}) translate(-256 -256)">${art}</svg>`;
async function shot(page, markup, size, file, round = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;overflow:hidden;${round ? 'border-radius:50%;' : ''}">${markup.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body></html>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const full = variant(1);
  await shot(p, full, 512, path.join(ROOT, 'icon-512.png'));
  await shot(p, full, 192, path.join(ROOT, 'icon-192.png'));
  await shot(p, full, 180, path.join(ROOT, 'apple-touch-icon.png'));
  await shot(p, full, 48, path.join(ROOT, 'favicon.png'));
  await shot(p, variant(0.78), 512, path.join(ROOT, 'icon-maskable-512.png'));
  const res = path.join(ROOT, 'native/android/app/src/main/res');
  if (fs.existsSync(res)) {
    const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, k] of Object.entries(dens)) {
      await shot(p, full, Math.round(48 * k), path.join(res, `mipmap-${d}/ic_launcher.png`));
      await shot(p, variant(1.05), Math.round(48 * k), path.join(res, `mipmap-${d}/ic_launcher_round.png`), true);
      // adaptive foreground: 108dp canvas, artwork inside the middle 66dp
      await shot(p, variant(0.62, false), Math.round(108 * k), path.join(res, `mipmap-${d}/ic_launcher_foreground.png`));
      // splash: Android 12 shows the icon inside a circle of 2/3 of 288dp
      await shot(p, variant(0.62, false), Math.round(144 * k), path.join(res, `drawable-${d}/splash_icon.png`));
    }
  }
  await b.close();
  console.log('icons done');
})();
