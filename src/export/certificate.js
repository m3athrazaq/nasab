// «شهادة نسب»: one page with a person's full lineage written out, and the column of his fathers
// (عمود النسب) from the earliest known ancestor down to him — framed in the chosen look.
import { posterTheme, mix } from '../chart/themes.js';
import { frameItems, dividerItems, star8 } from '../chart/ornaments.js';
import { fitText } from '../chart/draw.js';
import { wrapLines } from './typeset.js';
import { PAPERS } from './poster.js';
import { lang, fmtDateParts, lifeYears, dig } from '../core/i18n.js';
import { lineageText, mercy } from '../core/names.js';
import { makeD } from '../core/dates.js';

/** opts: { theme, basmala, mother, signature }; env: { measure, today } */
export function buildCertificate(ix, s, id, opts, env) {
  const p = ix.P[id];
  if (!p) return null;
  const th = posterTheme(opts.theme || 'manuscript');
  const measure = env.measure;
  const ar = lang.value === 'ar';
  const [W, H] = PAPERS.A4;
  const scene = [{ t: 'rect', x: 0, y: 0, w: W, h: H, fill: th.bg }];
  const fr = frameItems(th.frame, W, H, th);
  scene.push(...fr.items);
  const cx = W / 2, inner = W - 2 * fr.inset;
  const T = th.fonts.title;
  const text = (s2, font, size, y, fill, maxW = inner, x = cx) => {
    const f = fitText(measure, s2, font, size, maxW, 0.55);
    scene.push({ t: 'text', x, y, s: f.s, font, size: f.size, fill, w: f.w });
    return f;
  };
  let y = fr.inset + 8;
  if (opts.basmala !== false && ar) { y += 22; text('بسم الله الرحمن الرحيم', T === 'kufi' || T === 'uiB' ? 'amiriB' : T, 19, y, th.ink2); y += 12; }
  y += 50;
  text(ar ? 'شهادة نسب' : 'Certificate of Lineage', T, 46, y, th.accent === th.gold ? th.gold : th.ink);
  y += 18;
  scene.push(...dividerItems(th.frame, cx, y, 200, th, 1));
  y += 28;
  text(ar ? 'هذا بيان بنسب' : 'This sets out the lineage of', th.fonts.text, 12.5, y, th.ink2);
  y += 16;

  // the full lineage, written out
  const line = ix.paternalLine(id);
  const names = line.map(x => ix.P[x].n || '؟');
  const fam = ix.familyOf(id);
  const full = lineageText(names, { gender: p.g, style: 'bin', family: fam, lang: lang.value });
  const fs = names.length > 14 ? 16 : 19;
  const lines = wrapLines(measure, full, th.fonts.name, fs, inner - 30);
  for (const l of lines) { y += fs * 1.75; text(l, th.fonts.name, fs, y, th.ink); }
  const m = ix.mother(id);
  if (opts.mother !== false && m) {
    y += 26;
    const mn = lineageText(ix.paternalLine(m, 3).map(x => ix.P[x].n || '؟'), { gender: 'f', style: 'bin', family: ix.familyOf(m) !== fam ? ix.familyOf(m) : '', lang: lang.value });
    text((ar ? (p.g === 'f' ? 'وأمها: ' : 'وأمه: ') : 'Mother: ') + mn, th.fonts.sub || th.fonts.text, 13, y, th.ink2);
  }
  y += 34;

  /* the column of fathers: the earliest at the top, the person at the bottom */
  const chain = line.slice().reverse();
  const footTop = H - fr.inset - 96;
  const avail = footTop - y;
  const cols = chain.length > 12 ? 2 : 1;
  const perCol = Math.ceil(chain.length / cols);
  const step = Math.min(92, avail / Math.max(1, perCol));
  const R = Math.max(8, Math.min(19, step * 0.3));
  // a short lineage sits in the middle of the free space rather than under the title
  y += Math.max(0, avail - step * perCol) * 0.42;
  const colX = cols === 1 ? [cx] : (ar ? [cx + inner * 0.22, cx - inner * 0.22] : [cx - inner * 0.22, cx + inner * 0.22]);
  const pos = chain.map((x, i) => {
    const c = Math.floor(i / perCol), k = i % perCol;
    return { id: x, x: colX[c], y: y + step * (k + 0.5) };
  });
  // the line joining them
  let d = '';
  pos.forEach((q, i) => {
    if (!i) { d += `M${q.x} ${q.y}`; return; }
    const prev = pos[i - 1];
    if (prev.x === q.x) d += `L${q.x} ${q.y}`;
    else d += `C${prev.x} ${prev.y + step} ${q.x} ${q.y - step} ${q.x} ${q.y}`;
  });
  scene.push({ t: 'path', d, fill: 'none', stroke: th.line, sw: 1.4, cap: 'round' });
  pos.forEach((q, i) => {
    const x = ix.P[q.id];
    const self = q.id === id;
    const col = self ? th.thread : th.gold;
    const fill = self ? mix(th.thread, th.bg, 0.2) : th.bg;
    if (x.g === 'f') scene.push({ t: 'circle', cx: q.x, cy: q.y, r: R, fill, stroke: col, sw: 1.4 });
    else scene.push({ t: 'path', d: star8(q.x, q.y, R * 1.15), fill, stroke: col, sw: 1.2 });
    const gnum = dig(chain.length - i);
    scene.push({ t: 'text', x: q.x, y: q.y + R * 0.36, s: gnum, font: th.fonts.text, size: R * 0.95, fill: th.ink2, w: measure(th.fonts.text, gnum, R * 0.95) });
    // the name beside the medallion (towards the outside of the page), the years under it
    const name = x.n || '؟';
    const ns = Math.min(22, step * 0.36);
    const nw = measure(th.fonts.name, name, ns);
    // one column: names on the reading side (right in Arabic); two columns: on the outer sides
    const side = cols === 2 ? (q.x > cx ? 1 : -1) : (ar ? 1 : -1);
    const nx = q.x + side * (R + 10 + nw / 2);
    const yr = lifeYears(x, !ix.living(q.id) && !x.d && ar && s.settings.mercy ? mercy(x.g) : '');
    scene.push({ t: 'text', x: nx, y: q.y + (yr ? 0 : ns * 0.36), s: name, font: th.fonts.name, size: ns, fill: self ? th.thread : th.ink, w: nw });
    if (yr) {
      const ys = Math.min(10.5, ns * 0.62), yw = measure(th.fonts.text, yr, ys);
      scene.push({ t: 'text', x: q.x + side * (R + 10 + yw / 2), y: q.y + ys + 3, s: yr, font: th.fonts.text, size: ys, fill: th.ink3, w: yw });
    }
  });

  /* date and signature */
  const now = env.today || new Date();
  const dl = fmtDateParts(makeD({ cal: 'g', y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }));
  let fy = H - fr.inset - 58;
  text((ar ? 'حُرّرت في ' : 'Issued on ') + dl.main + (dl.alt ? (ar ? ' الموافق ' : ' — ') + dl.alt : ''), th.fonts.text, 10.5, fy, th.ink2);
  fy += 34;
  const sig = ar ? 'التوقيع' : 'Signature';
  const sw = 150;
  const sx = ar ? cx + inner * 0.25 : cx - inner * 0.25;
  scene.push({ t: 'path', d: `M${sx - sw / 2} ${fy}H${sx + sw / 2}`, fill: 'none', stroke: th.ink3, sw: 0.7, dash: [1, 3], cap: 'round' });
  text(sig, th.fonts.text, 9.5, fy + 14, th.ink3, 200, sx);
  const seal = ar ? 'الختم' : 'Seal';
  const kx = ar ? cx - inner * 0.25 : cx + inner * 0.25;
  scene.push({ t: 'circle', cx: kx, cy: fy - 12, r: 22, fill: 'none', stroke: th.ink3, sw: 0.7, dash: [1, 3] });
  text(seal, th.fonts.text, 9.5, fy + 24, th.ink3, 200, kx);
  return { W, H, scene, title: (ar ? 'شهادة نسب ' : 'Lineage of ') + (p.n || '') };
}
