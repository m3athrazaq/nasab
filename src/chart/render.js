// Draws a scene (see draw.js) as an SVG file, onto a canvas (PNG), or into a PDF page (vector).
import { esc } from '../core/util.js';
import { FONTS } from './themes.js';

/* ---------------- colours ---------------- */
/** '#rrggbb' | 'rgba(r,g,b,a)' | 'none' → { r, g, b (0..1), a } or null */
export function parseColor(c) {
  if (!c || c === 'none' || c === 'transparent') return null;
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255, a: 1 }; }
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) { const h = m[1]; return parseColor('#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]); }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) { const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 }; }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/* ---------------- SVG path → absolute commands (M L C Z), arcs and quadratics as cubics ---------------- */
export function parsePath(d) {
  const toks = String(d).match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    let nx, ny;
    switch (C) {
      case 'M': nx = num() + (rel ? x : 0); ny = num() + (rel ? y : 0); out.push(['M', nx, ny]); x = sx = nx; y = sy = ny; cmd = rel ? 'l' : 'L'; lq = null; lcx = x; lcy = y; break;
      case 'L': nx = num() + (rel ? x : 0); ny = num() + (rel ? y : 0); out.push(['L', nx, ny]); x = nx; y = ny; lq = null; lcx = x; lcy = y; break;
      case 'H': nx = num() + (rel ? x : 0); out.push(['L', nx, y]); x = nx; lq = null; lcx = x; lcy = y; break;
      case 'V': ny = num() + (rel ? y : 0); out.push(['L', x, ny]); y = ny; lq = null; lcx = x; lcy = y; break;
      case 'C': {
        const a = [num(), num(), num(), num(), num(), num()];
        if (rel) for (let k = 0; k < 6; k += 2) { a[k] += x; a[k + 1] += y; }
        out.push(['C', ...a]); lcx = a[2]; lcy = a[3]; x = a[4]; y = a[5]; lq = null; break;
      }
      case 'S': {
        const a = [num(), num(), num(), num()];
        if (rel) for (let k = 0; k < 4; k += 2) { a[k] += x; a[k + 1] += y; }
        const c1x = 2 * x - lcx, c1y = 2 * y - lcy;
        out.push(['C', c1x, c1y, ...a]); lcx = a[0]; lcy = a[1]; x = a[2]; y = a[3]; lq = null; break;
      }
      case 'Q': {
        const a = [num(), num(), num(), num()];
        if (rel) for (let k = 0; k < 4; k += 2) { a[k] += x; a[k + 1] += y; }
        out.push(['C', x + 2 / 3 * (a[0] - x), y + 2 / 3 * (a[1] - y), a[2] + 2 / 3 * (a[0] - a[2]), a[3] + 2 / 3 * (a[1] - a[3]), a[2], a[3]]);
        lq = [a[0], a[1]]; x = a[2]; y = a[3]; lcx = x; lcy = y; break;
      }
      case 'T': {
        const a = [num(), num()];
        if (rel) { a[0] += x; a[1] += y; }
        const q = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
        out.push(['C', x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), a[0] + 2 / 3 * (q[0] - a[0]), a[1] + 2 / 3 * (q[1] - a[1]), a[0], a[1]]);
        lq = q; x = a[0]; y = a[1]; break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), la = num(), sw = num();
        nx = num() + (rel ? x : 0); ny = num() + (rel ? y : 0);
        for (const c of arcToCubics(x, y, rx, ry, rot, la, sw, nx, ny)) out.push(['C', ...c]);
        x = nx; y = ny; lq = null; lcx = x; lcy = y; break;
      }
      case 'Z': out.push(['Z']); x = sx; y = sy; lq = null; lcx = x; lcy = y; break;
      default: i++; // unknown: skip a token
    }
  }
  return out;
}
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = phiDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = co * (rx * y1p / ry), cyp = co * -(ry * x1p / rx);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const out = [];
  const d = dt / segs, k = 4 / 3 * Math.tan(d / 4);
  for (let s = 0; s < segs; s++) {
    const a1 = t1 + s * d, a2 = a1 + d;
    const e = (a) => [Math.cos(a), Math.sin(a)];
    const [c1, s1] = e(a1), [c2, s2] = e(a2);
    const p = (px, py) => [cx + rx * px * cos - ry * py * sin, cy + rx * px * sin + ry * py * cos];
    const q1 = p(c1 - k * s1, s1 + k * c1), q2 = p(c2 + k * s2, s2 - k * c2), q3 = p(c2, s2);
    out.push([...q1, ...q2, ...q3]);
  }
  return out;
}
/** a rounded rectangle as path commands */
export function rrectCmds(x, y, w, h, r) {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  if (!r) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  const k = 0.5523 * r;
  return [['M', x + r, y], ['L', x + w - r, y], ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r], ['L', x + w, y + h - r],
    ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h], ['L', x + r, y + h], ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    ['L', x, y + r], ['C', x, y + r - k, x + r - k, y, x + r, y], ['Z']];
}
export function circleCmds(cx, cy, r) {
  const k = 0.5523 * r;
  return [['M', cx + r, cy], ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r], ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r], ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy], ['Z']];
}
const n2 = v => (Math.round(v * 100) / 100).toString();
export const cmdsToD = cmds => cmds.map(c => c[0] + c.slice(1).map(n2).join(' ')).join('');

/* ---------------- SVG file ---------------- */
/**
 * opts: { width, height, bg, text: 'fonts'|'outline', engine (for outlines), dir, fontCss (for 'fonts'),
 *         photoHref(photoId) → data: URL }
 */
export function sceneToSvg(scene, { width, height, viewBox, bg = '', text = 'fonts', engine, dir = 'rtl', fontCss = '', photoHref = () => '' } = {}) {
  let defs = '', clipN = 0;
  const attrPaint = (fill, stroke, sw, op, dash, cap, join) => {
    let a = '';
    const fc = parseColor(fill), sc = parseColor(stroke);
    a += fc ? ` fill="${fill.startsWith('rgba') ? rgbHex(fc) : fill}"${fc.a < 1 ? ` fill-opacity="${n2(fc.a)}"` : ''}` : ' fill="none"';
    if (sc) a += ` stroke="${stroke.startsWith('rgba') ? rgbHex(sc) : stroke}" stroke-width="${n2(sw || 1)}"${sc.a < 1 ? ` stroke-opacity="${n2(sc.a)}"` : ''}`;
    if (op != null && op < 1) a += ` opacity="${n2(op)}"`;
    if (dash) a += ` stroke-dasharray="${dash.join(' ')}"`;
    if (cap) a += ` stroke-linecap="${cap}"`;
    if (join) a += ` stroke-linejoin="${join}"`;
    return a;
  };
  const walk = items => items.map(it => {
    switch (it.t) {
      case 'path': return `<path d="${it.d}"${attrPaint(it.fill, it.stroke, it.sw, it.op, it.dash, it.cap, it.join)}/>`;
      case 'rect': return `<rect x="${n2(it.x)}" y="${n2(it.y)}" width="${n2(it.w)}" height="${n2(it.h)}"${it.r ? ` rx="${n2(it.r)}"` : ''}${attrPaint(it.fill, it.stroke, it.sw, it.op, it.dash)}/>`;
      case 'circle': return `<circle cx="${n2(it.cx)}" cy="${n2(it.cy)}" r="${n2(it.r)}"${attrPaint(it.fill, it.stroke, it.sw, it.op, it.dash)}/>`;
      case 'text': {
        if (!it.s) return '';
        const tf = it.rot ? ` transform="rotate(${n2(it.rot)} ${n2(it.rx ?? it.x)} ${n2(it.ry ?? it.y)})"` : '';
        if (text === 'outline' && engine) {
          const w = engine.measure(it.font, it.s, it.size);
          const d = engine.path(it.font, it.s, it.size, it.x - w / 2, it.y);
          if (!d) return '';
          const hp = it.halo && parseColor(it.halo) ? `<path d="${d}" fill="none" stroke="${rgbHex(parseColor(it.halo))}" stroke-width="${n2(it.hw || 3)}" stroke-linejoin="round"${tf}/>` : '';
          return hp + `<path d="${d}"${attrPaint(it.fill, null, 0, it.op)}${tf}/>`;
        }
        const f = FONTS[it.font] || FONTS.ui;
        const fc = parseColor(it.fill);
        const halo = it.halo && parseColor(it.halo) ? ` stroke="${rgbHex(parseColor(it.halo))}" stroke-width="${n2(it.hw || 3)}" stroke-linejoin="round" paint-order="stroke"` : '';
        return `<text${halo} x="${n2(it.x)}" y="${n2(it.y)}" text-anchor="middle" direction="${dir}" font-family="'${f.family}'" font-weight="${f.weight}" font-size="${n2(it.size)}" fill="${fc ? rgbHex(fc) : '#000'}"${fc && fc.a < 1 ? ` fill-opacity="${n2(fc.a)}"` : ''}${it.op != null && it.op < 1 ? ` opacity="${n2(it.op)}"` : ''}${tf}>${esc(it.s)}</text>`;
      }
      case 'image': {
        const href = photoHref(it.photo);
        if (!href) return '';
        const id = 'c' + (clipN++);
        const shape = it.clip && it.clip.shape === 'circle' ? `<circle cx="${n2(it.x + it.w / 2)}" cy="${n2(it.y + it.h / 2)}" r="${n2(Math.min(it.w, it.h) / 2)}"/>` : `<rect x="${n2(it.x)}" y="${n2(it.y)}" width="${n2(it.w)}" height="${n2(it.h)}" rx="${n2((it.clip && it.clip.r) || 0)}"/>`;
        defs += `<clipPath id="${id}">${shape}</clipPath>`;
        return `<image href="${href}" x="${n2(it.x)}" y="${n2(it.y)}" width="${n2(it.w)}" height="${n2(it.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
      }
      case 'g': {
        const tf = it.tf ? ` transform="translate(${n2(it.tf[1])} ${n2(it.tf[2])}) scale(${it.tf[0]})"` : '';
        const hit = it.hit ? `<rect x="${n2(it.hit.x)}" y="${n2(it.hit.y)}" width="${n2(it.hit.w)}" height="${n2(it.hit.h)}" fill="transparent"/>` : '';
        return `<g${tf}>${hit}${walk(it.items || [])}</g>`;
      }
      default: return '';
    }
  }).join('');
  const body = walk(scene);
  const vb = viewBox || `0 0 ${n2(width)} ${n2(height)}`;
  const style = text === 'fonts' && fontCss ? `<style>${fontCss}</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n2(width)}" height="${n2(height)}" viewBox="${vb}">${style}${defs ? `<defs>${defs}</defs>` : ''}${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${body}</svg>`;
}
const rgbHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

/* ---------------- canvas (PNG) ---------------- */
/** draws the scene on a 2D context; photos: Map photoId → drawable image */
export function sceneToCanvas(ctx, scene, { dir = 'rtl', photos = new Map(), cssFont } = {}) {
  const apply = (it, fillFn, strokeFn) => {
    ctx.save();
    if (it.op != null) ctx.globalAlpha *= it.op;
    const fc = parseColor(it.fill), sc = parseColor(it.stroke);
    if (fc) { ctx.fillStyle = it.fill; fillFn(); }
    if (sc) {
      ctx.strokeStyle = it.stroke; ctx.lineWidth = it.sw || 1;
      ctx.lineCap = it.cap || 'butt'; ctx.lineJoin = it.join || 'miter';
      ctx.setLineDash(it.dash || []);
      strokeFn();
    }
    ctx.restore();
  };
  const walk = items => {
    for (const it of items) {
      switch (it.t) {
        case 'path': { const p = new Path2D(it.d); apply(it, () => ctx.fill(p), () => ctx.stroke(p)); break; }
        case 'rect': { const p = new Path2D(cmdsToD(rrectCmds(it.x, it.y, it.w, it.h, it.r))); apply(it, () => ctx.fill(p), () => ctx.stroke(p)); break; }
        case 'circle': { const p = new Path2D(cmdsToD(circleCmds(it.cx, it.cy, it.r))); apply(it, () => ctx.fill(p), () => ctx.stroke(p)); break; }
        case 'text': {
          if (!it.s) break;
          ctx.save();
          if (it.op != null) ctx.globalAlpha *= it.op;
          ctx.font = cssFont(it.font, it.size);
          ctx.fillStyle = it.fill;
          ctx.textAlign = 'center';
          ctx.direction = dir;
          let tx = it.x, ty = it.y;
          if (it.rot) { const rx = it.rx ?? it.x, ry = it.ry ?? it.y; ctx.translate(rx, ry); ctx.rotate(it.rot * Math.PI / 180); tx = it.x - rx; ty = it.y - ry; }
          if (it.halo && parseColor(it.halo)) { ctx.strokeStyle = it.halo; ctx.lineWidth = it.hw || 3; ctx.lineJoin = 'round'; ctx.strokeText(it.s, tx, ty); }
          ctx.fillText(it.s, tx, ty);
          ctx.restore();
          break;
        }
        case 'image': {
          const img = photos.get(it.photo);
          if (!img) break;
          ctx.save();
          const clip = it.clip && it.clip.shape === 'circle' ? circleCmds(it.x + it.w / 2, it.y + it.h / 2, Math.min(it.w, it.h) / 2) : rrectCmds(it.x, it.y, it.w, it.h, (it.clip && it.clip.r) || 0);
          ctx.clip(new Path2D(cmdsToD(clip)));
          // cover the box, centred
          const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
          const s = Math.max(it.w / iw, it.h / ih);
          ctx.drawImage(img, it.x + (it.w - iw * s) / 2, it.y + (it.h - ih * s) / 2, iw * s, ih * s);
          ctx.restore();
          break;
        }
        case 'g': {
          ctx.save();
          if (it.tf) { ctx.translate(it.tf[1], it.tf[2]); ctx.scale(it.tf[0], it.tf[0]); }
          walk(it.items || []);
          ctx.restore();
          break;
        }
        default: break;
      }
    }
  };
  walk(scene);
}

/* ---------------- PDF page (pdf-lib, vector) ---------------- */
/**
 * draws the scene on a pdf-lib page; scene coordinates are points with y down from the top left.
 * lib: the pdf-lib exports; engine: text outlines (text.js); images: Map photoId → PDFImage (embedded JPEG)
 */
export function sceneToPdf(lib, doc, page, scene, { engine, images = new Map() } = {}) {
  const L = lib;
  const ops = [];
  const H = page.getHeight();
  const gsCache = new Map();
  const alphaGs = a => {
    const k = Math.round(a * 1000) / 1000;
    if (!gsCache.has(k)) {
      const dict = doc.context.obj({ Type: 'ExtGState', ca: k, CA: k });
      gsCache.set(k, page.node.newExtGState('GS', doc.context.register(dict)));
    }
    return gsCache.get(k);
  };
  const emit = cmds => {
    for (const c of cmds) {
      if (c[0] === 'M') ops.push(L.moveTo(c[1], c[2]));
      else if (c[0] === 'L') ops.push(L.lineTo(c[1], c[2]));
      else if (c[0] === 'C') ops.push(L.appendBezierCurve(c[1], c[2], c[3], c[4], c[5], c[6]));
      else if (c[0] === 'Z') ops.push(L.closePath());
    }
  };
  const paint = (it, cmds) => {
    const fc = parseColor(it.fill), sc = parseColor(it.stroke);
    if (!fc && !sc) return;
    ops.push(L.pushGraphicsState());
    const a = (it.op != null ? it.op : 1);
    if (fc && (fc.a * a) < 1) ops.push(L.setGraphicsState(alphaGs(fc.a * a)));
    else if (sc && (sc.a * a) < 1) ops.push(L.setGraphicsState(alphaGs(sc.a * a)));
    if (fc) ops.push(L.setFillingRgbColor(fc.r, fc.g, fc.b));
    if (sc) {
      ops.push(L.setStrokingRgbColor(sc.r, sc.g, sc.b), L.setLineWidth(it.sw || 1));
      if (it.cap) ops.push(L.setLineCap({ butt: 0, round: 1, square: 2 }[it.cap] ?? 0));
      if (it.join) ops.push(L.setLineJoin({ miter: 0, round: 1, bevel: 2 }[it.join] ?? 0));
      if (it.dash) ops.push(L.setDashPattern(it.dash, 0));
    }
    emit(cmds);
    ops.push(fc && sc ? L.fillAndStroke() : fc ? L.fill() : L.stroke());
    ops.push(L.popGraphicsState());
  };
  let lastPoint = [0, 0], subStart = [0, 0];
  const glyphOps = (it, w) => {
    for (const g of engine.glyphs(it.font, it.s, it.size, it.x - w / 2, it.y)) {
      for (const [c, a] of g.cmds) {
        const P = []; for (let i = 0; i < a.length; i += 2) P.push(g.ox + a[i] * g.s, g.oy - a[i + 1] * g.s);
        if (c === 'moveTo') { ops.push(L.moveTo(P[0], P[1])); lastPoint = subStart = [P[0], P[1]]; }
        else if (c === 'lineTo') { ops.push(L.lineTo(P[0], P[1])); lastPoint = [P[0], P[1]]; }
        else if (c === 'bezierCurveTo') { ops.push(L.appendBezierCurve(P[0], P[1], P[2], P[3], P[4], P[5])); lastPoint = [P[4], P[5]]; }
        else if (c === 'quadraticCurveTo') {
          const q = lastPoint;
          ops.push(L.appendBezierCurve(q[0] + 2 / 3 * (P[0] - q[0]), q[1] + 2 / 3 * (P[1] - q[1]), P[2] + 2 / 3 * (P[0] - P[2]), P[3] + 2 / 3 * (P[1] - P[3]), P[2], P[3]));
          lastPoint = [P[2], P[3]];
        } else if (c === 'closePath') { ops.push(L.closePath()); lastPoint = subStart; }
      }
    }
  };
  // Each letter shape is stored once in the file (a form XObject in font units) and placed wherever it
  // appears, instead of repeating its outline: a family book is several times smaller this way.
  const glyphForms = doc.__nasabGlyphs || (doc.__nasabGlyphs = new Map()); // glyph id → ref (whole document)
  const pageGlyphs = new Map();                                             // glyph id → name on this page
  const glyphName = g => {
    if (pageGlyphs.has(g.id)) return pageGlyphs.get(g.id);
    let ref = glyphForms.get(g.id);
    if (ref === undefined) {
      ref = null;
      const gops = [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, last = [0, 0], start = [0, 0];
      for (const [c, a] of g.cmds) {
        for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
        if (c === 'moveTo') { gops.push(L.moveTo(a[0], a[1])); last = start = [a[0], a[1]]; }
        else if (c === 'lineTo') { gops.push(L.lineTo(a[0], a[1])); last = [a[0], a[1]]; }
        else if (c === 'bezierCurveTo') { gops.push(L.appendBezierCurve(a[0], a[1], a[2], a[3], a[4], a[5])); last = [a[4], a[5]]; }
        else if (c === 'quadraticCurveTo') {
          const q = last;
          gops.push(L.appendBezierCurve(q[0] + 2 / 3 * (a[0] - q[0]), q[1] + 2 / 3 * (a[1] - q[1]), a[2] + 2 / 3 * (a[0] - a[2]), a[3] + 2 / 3 * (a[1] - a[3]), a[2], a[3]));
          last = [a[2], a[3]];
        } else if (c === 'closePath') { gops.push(L.closePath()); last = start; }
      }
      if (gops.length && isFinite(x0)) {
        gops.push(L.fill());
        ref = doc.context.register(doc.context.formXObject(gops, { BBox: [x0 - 2, y0 - 2, x1 + 2, y1 + 2] }));
      }
      glyphForms.set(g.id, ref);
    }
    const name = ref ? page.node.newXObject('G', ref) : null;
    pageGlyphs.set(g.id, name);
    return name;
  };
  const text = it => {
    if (!it.s || !engine) return;
    const fc = parseColor(it.fill); if (!fc) return;
    const w = engine.measure(it.font, it.s, it.size);
    ops.push(L.pushGraphicsState());
    if (it.rot) {
      const rx = it.rx ?? it.x, ry = it.ry ?? it.y, a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      ops.push(L.concatTransformationMatrix(c, s, -s, c, rx - c * rx + s * ry, ry - s * rx - c * ry));
    }
    const alpha = fc.a * (it.op != null ? it.op : 1);
    if (alpha < 1) ops.push(L.setGraphicsState(alphaGs(alpha)));
    const hc = it.halo && parseColor(it.halo);
    if (hc) {
      // a halo in the paper's colour keeps the name readable over branches
      ops.push(L.setStrokingRgbColor(hc.r, hc.g, hc.b), L.setLineWidth(it.hw || 3), L.setLineJoin(1));
      glyphOps(it, w);
      ops.push(L.stroke());
    }
    ops.push(L.setFillingRgbColor(fc.r, fc.g, fc.b));
    if (alpha < 1 || !doc.context.formXObject) {
      // see-through text is filled as one shape, so the joins between letters are not painted twice
      glyphOps(it, w);
      ops.push(L.fill());
    } else {
      for (const g of engine.glyphs(it.font, it.s, it.size, it.x - w / 2, it.y)) {
        const name = g.id && glyphName(g);
        if (name) ops.push(L.pushGraphicsState(), L.concatTransformationMatrix(g.s, 0, 0, -g.s, g.ox, g.oy), L.drawObject(name), L.popGraphicsState());
      }
    }
    ops.push(L.popGraphicsState());
  };
  const walk = items => {
    for (const it of items) {
      switch (it.t) {
        case 'path': paint(it, parsePath(it.d)); break;
        case 'rect': paint(it, rrectCmds(it.x, it.y, it.w, it.h, it.r)); break;
        case 'circle': paint(it, circleCmds(it.cx, it.cy, it.r)); break;
        case 'text': text(it); break;
        case 'image': {
          const img = images.get(it.photo);
          if (!img) break;
          const name = page.node.newXObject('Im', img.ref);
          ops.push(L.pushGraphicsState());
          emit(it.clip && it.clip.shape === 'circle' ? circleCmds(it.x + it.w / 2, it.y + it.h / 2, Math.min(it.w, it.h) / 2) : rrectCmds(it.x, it.y, it.w, it.h, (it.clip && it.clip.r) || 0));
          ops.push(L.clip(), L.endPath());
          // cover the box (the photos are square, so this is exact for them)
          const s = Math.max(it.w / img.width, it.h / img.height);
          const dw = img.width * s, dh = img.height * s;
          const x = it.x + (it.w - dw) / 2, y = it.y + (it.h - dh) / 2;
          ops.push(L.concatTransformationMatrix(dw, 0, 0, -dh, x, y + dh), L.drawObject(name));
          ops.push(L.popGraphicsState());
          break;
        }
        case 'g':
          ops.push(L.pushGraphicsState());
          if (it.tf) ops.push(L.concatTransformationMatrix(it.tf[0], 0, 0, it.tf[0], it.tf[1], it.tf[2]));
          walk(it.items || []);
          ops.push(L.popGraphicsState());
          break;
        default: break;
      }
    }
  };
  // y down from the top-left corner, like the scene
  ops.push(L.pushGraphicsState(), L.concatTransformationMatrix(1, 0, 0, -1, 0, H));
  walk(scene);
  ops.push(L.popGraphicsState());
  for (let i = 0; i < ops.length; i += 5000) page.pushOperators(...ops.slice(i, i + 5000));
}
