// Text as vector outlines, shaped exactly as a browser would (Arabic letter forms, ligatures,
// mark positions, right-to-left order): fontkit shapes each run, bidi-js orders the runs.
// Used for PDFs and SVG files, which then need no fonts to print anywhere.

/**
 * engine = createTextEngine({ fontkit, bidi, fonts: { key: Uint8Array }, dir: 'rtl'|'ltr', fallback: 'ui' })
 *   .measure(key, text, size) → width
 *   .glyphs(key, text, size, x, y) → [{ id, cmds, ox, oy, s }]   (x = left end of the line, y = baseline, y down)
 */
export function createTextEngine({ fontkit, bidi, fonts, dir = 'rtl', fallback = 'ui' }) {
  const F = {};
  for (const [k, bytes] of Object.entries(fonts)) if (bytes) F[k] = fontkit.create(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const glyphCache = new Map(); // key|gid → commands (font units, y up)
  const runCache = new Map();   // key|dir|text → { adv, glyphs: [{ font, gid, x, y }] } in font units

  /** the theme's font, or the fallback when it lacks a letter of this text */
  const fontFor = (key, text) => {
    const f = F[key] || F[fallback], fb = F[fallback];
    if (!f) throw new Error('font ' + key);
    if (fb && f !== fb) {
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp > 32 && !f.hasGlyphForCodePoint(cp) && fb.hasGlyphForCodePoint(cp)) return { key: fallback, f: fb };
      }
    }
    return { key: F[key] ? key : fallback, f };
  };
  /** visual runs of a line: [{ s, rtl }] left to right, each in logical order */
  function runs(text) {
    const lv = bidi.getEmbeddingLevels(text, dir);
    const order = Array.from({ length: text.length }, (_, i) => i);
    for (const [a, b] of bidi.getReorderSegments(text, lv)) { const part = order.slice(a, b + 1).reverse(); order.splice(a, b - a + 1, ...part); }
    const mir = bidi.getMirroredCharactersMap(text, lv.levels);
    const out = []; let cur = null;
    for (const i of order) {
      const l = lv.levels[i];
      if (!cur || cur.l !== l) { cur = { l, s: '' }; out.push(cur); }
      cur.s += mir.get(i) || text[i];
    }
    for (const o of out) if (o.l % 2) o.s = [...o.s].reverse().join('');
    return out.map(o => ({ s: o.s, rtl: o.l % 2 === 1 }));
  }
  function shapeLine(key, text) {
    const ck = key + '|' + text;
    if (runCache.has(ck)) return runCache.get(ck);
    const { f, key: k2 } = fontFor(key, text);
    let x = 0;
    const glyphs = [];
    const clean = String(text).replace(/\r?\n/g, ' ');
    for (const r of runs(clean)) {
      const lay = f.layout(r.s, undefined, r.rtl ? 'arab' : 'latn', undefined, r.rtl ? 'rtl' : 'ltr');
      for (let i = 0; i < lay.glyphs.length; i++) {
        const g = lay.glyphs[i], p = lay.positions[i];
        glyphs.push({ key: k2, gid: g.id, x: x + p.xOffset, y: p.yOffset });
        x += p.xAdvance;
      }
    }
    const res = { adv: x, upm: f.unitsPerEm, glyphs, font: f };
    if (runCache.size > 8000) runCache.clear();
    runCache.set(ck, res);
    return res;
  }
  function glyphCmds(key, f, gid) {
    const ck = key + '|' + gid;
    if (glyphCache.has(ck)) return glyphCache.get(ck);
    let cmds = [];
    try { cmds = f.getGlyph(gid).path.commands.map(c => [c.command, c.args]); } catch (e) { cmds = []; }
    glyphCache.set(ck, cmds);
    return cmds;
  }
  return {
    has: key => !!F[key],
    measure(key, text, size) {
      if (!text) return 0;
      const r = shapeLine(key, String(text));
      return r.adv * size / r.upm;
    },
    /** outlines of a line placed at (x = left end, y = baseline), y axis down */
    glyphs(key, text, size, x, y) {
      if (!text) return [];
      const r = shapeLine(key, String(text));
      const s = size / r.upm;
      return r.glyphs.map(g => ({ id: (F[g.key] ? g.key : fallback) + '|' + g.gid, cmds: glyphCmds(g.key, F[g.key] || r.font, g.gid), ox: x + g.x * s, oy: y - g.y * s, s }));
    },
    /** the same as one SVG path string */
    path(key, text, size, x, y) {
      let d = '';
      const n = v => (Math.round(v * 100) / 100).toString();
      for (const g of this.glyphs(key, text, size, x, y)) {
        for (const [c, a] of g.cmds) {
          const P = [];
          for (let i = 0; i < a.length; i += 2) P.push(n(g.ox + a[i] * g.s), n(g.oy - a[i + 1] * g.s));
          d += ({ moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' })[c] + P.join(' ');
        }
      }
      return d;
    }
  };
}
