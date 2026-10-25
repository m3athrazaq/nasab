// Setting text on printed pages: lines that wrap, aligned to the reading direction.

/** words into lines that fit maxW (measure(font, text, size) gives widths) */
export function wrapLines(measure, text, font, size, maxW) {
  const out = [];
  for (const para of String(text || '').split(/\n+/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const cand = line ? line + ' ' + w : w;
      if (!line || measure(font, cand, size) <= maxW) line = cand;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * a page writer: keeps a cursor (y), aligns to the start edge (right in Arabic), and starts a new page
 * when the next block does not fit.
 */
export function pageWriter({ W, H, top, bottom, left, right, rtl, measure, newPage }) {
  const w = {
    y: top, items: null,
    x0: left, x1: W - right, width: W - left - right,
    /** centre x for a line of width lw placed at the start edge (+ indent) */
    startX(lw, indent = 0) { return rtl ? w.x1 - indent - lw / 2 : w.x0 + indent + lw / 2; },
    endX(lw, indent = 0) { return rtl ? w.x0 + indent + lw / 2 : w.x1 - indent - lw / 2; },
    /** a position measured from the start edge */
    at(d) { return rtl ? w.x1 - d : w.x0 + d; },
    room(h) { return H - bottom - w.y >= h; },
    need(h) { if (!w.room(h)) { w.items = newPage(); w.y = top; return true; } return false; },
    text(s, font, size, fill, { indent = 0, align = 'start', gap = 0.55, op } = {}) {
      const lw = measure(font, s, size);
      const x = align === 'center' ? (w.x0 + w.x1) / 2 : align === 'end' ? w.endX(lw, indent) : w.startX(lw, indent);
      w.y += size;
      w.items.push({ t: 'text', x, y: w.y, s, font, size, fill, w: lw, op });
      w.y += size * gap;
      return lw;
    },
    para(s, font, size, fill, { indent = 0, align = 'start', lead = 1.75, maxW } = {}) {
      const lines = wrapLines(measure, s, font, size, (maxW || w.width) - indent);
      for (const line of lines) {
        w.need(size * lead);
        const lw = measure(font, line, size);
        const x = align === 'center' ? (w.x0 + w.x1) / 2 : w.startX(lw, indent);
        w.items.push({ t: 'text', x, y: w.y + size, s: line, font, size, fill, w: lw });
        w.y += size * lead;
      }
      return lines.length;
    },
    rule(color, sw = 0.6, inset = 0) {
      w.items.push({ t: 'path', d: `M${w.x0 + inset} ${w.y}H${w.x1 - inset}`, fill: 'none', stroke: color, sw });
    },
    space(h) { w.y += h; }
  };
  w.items = newPage();
  return w;
}
