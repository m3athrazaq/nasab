// Dates as people know them: a full day, a month, or only a year — in the Gregorian or the Hijri
// calendar, exact or approximate. Stored as short text:
//   '' | '~'? + 'h'? + 'YYYY' + ('-MM' + ('-DD')?)?      e.g. '1985-03-12', 'h1380', '~1950', 'h1380-07-15'
// The Hijri calendar is Umm al-Qura (through the browser's Intl), falling back to the tabular one.
// Everything here is pure: language and digits come in as arguments (see i18n.js for the app's own).

export const D_RE = /^(~)?(h)?(\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;
export const HIJRI_MONTHS = {
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
  en: ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah']
};
export const G_MONTHS = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

export function gDaysInMonth(y, m) { return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }

/** '…' → { cal, y, m, d, approx, prec } or null */
export function parseD(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return null;
  const x = D_RE.exec(t);
  if (!x) return null;
  const cal = x[2] ? 'h' : 'g', y = +x[3], m = x[4] ? +x[4] : 0, d = x[5] ? +x[5] : 0;
  if (y < 1 || (cal === 'g' ? y > 2300 : y > 1800)) return null;
  if (x[4] && (m < 1 || m > 12)) return null;
  if (x[5] && (d < 1 || d > (cal === 'g' ? gDaysInMonth(y, m) : 30))) return null;
  return { cal, y, m, d, approx: !!x[1], prec: d ? 'day' : m ? 'month' : 'year' };
}
export const validD = s => !!parseD(s);
/** builds the stored text from parts (month/day 0 = unknown) */
export function makeD({ cal = 'g', y, m = 0, d = 0, approx = false }) {
  if (!y) return '';
  const s = (approx ? '~' : '') + (cal === 'h' ? 'h' : '') + String(y).padStart(4, '0').replace(/^0+(?=\d{3,})/, '') + (m ? '-' + String(m).padStart(2, '0') + (d ? '-' + String(d).padStart(2, '0') : '') : '');
  return parseD(s) ? s : '';
}
/** a clean stored form ('1985-3-2' → '1985-03-02'), or '' */
export function cleanD(s) { const p = parseD(s); return p ? makeD(p) : ''; }

/* ---------------- day numbers (Julian Day Number, proleptic Gregorian) ---------------- */
export function gToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
export function jdnToG(j) {
  const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
  return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
}
/* tabular (civil) Hijri calendar */
const hTab = (y, m, d) => d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439;
function jdnToHTab(j) {
  const y = Math.floor((30 * (j - 1948440) + 10646) / 10631);
  const m = Math.min(12, Math.ceil((j - 29 - hTab(y, 1, 1)) / 29.5) + 1);
  return { y, m, d: j - hTab(y, m, 1) + 1 };
}
/* Umm al-Qura through Intl (checked once; falls back to the tabular calendar) */
let uq;
function uqFormatter() {
  if (uq !== undefined) return uq;
  uq = null;
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
    if (f.resolvedOptions().calendar === 'islamic-umalqura') uq = f;
  } catch (e) { /* not supported */ }
  return uq;
}
const hCache = new Map();
export function jdnToH(j) {
  if (hCache.has(j)) return hCache.get(j);
  const tab = jdnToHTab(j);
  let r = tab;
  const f = uqFormatter();
  if (f) {
    try {
      const g = jdnToG(j);
      const dt = new Date(0); dt.setUTCFullYear(g.y, g.m - 1, g.d); dt.setUTCHours(12, 0, 0, 0);
      const parts = f.formatToParts(dt);
      const get = t => { const p = parts.find(x => x.type === t); return p ? parseInt(p.value.replace(/[^\d]/g, ''), 10) : NaN; };
      const v = { y: get('year'), m: get('month'), d: get('day') };
      // sanity: within a few days of the tabular calendar
      if (v.y && v.m && v.d && Math.abs(hTab(v.y, v.m, v.d) - j) <= 4) r = v;
    } catch (e) { /* keep tabular */ }
  }
  if (hCache.size > 20000) hCache.clear();
  hCache.set(j, r);
  return r;
}
export function hToJdn(y, m, d) {
  const j0 = hTab(y, m, d);
  for (const k of [0, -1, 1, -2, 2, -3, 3]) {
    const h = jdnToH(j0 + k);
    if (h.y === y && h.m === m && h.d === d) return j0 + k;
  }
  // day 30 of a 29-day month: the day after the 29th
  if (d === 30) return hToJdn(y, m, 29) + 1;
  return j0;
}
const hMonthStart = (y, m) => hToJdn(y, m, 1);
const hNextMonthStart = (y, m) => (m === 12 ? hMonthStart(y + 1, 1) : hMonthStart(y, m + 1));

/** the first and last day a (partial) date can mean → [lo, hi] day numbers, or null */
export function rangeD(s) {
  const p = typeof s === 'object' && s ? s : parseD(s);
  if (!p) return null;
  let lo, hi;
  if (p.cal === 'g') {
    if (p.d) lo = hi = gToJdn(p.y, p.m, p.d);
    else if (p.m) { lo = gToJdn(p.y, p.m, 1); hi = gToJdn(p.y, p.m, gDaysInMonth(p.y, p.m)); }
    else { lo = gToJdn(p.y, 1, 1); hi = gToJdn(p.y, 12, 31); }
  } else {
    if (p.d) lo = hi = hToJdn(p.y, p.m, p.d);
    else if (p.m) { lo = hMonthStart(p.y, p.m); hi = hNextMonthStart(p.y, p.m) - 1; }
    else { lo = hMonthStart(p.y, 1); hi = hMonthStart(p.y + 1, 1) - 1; }
  }
  if (p.approx) { lo -= 1826; hi += 1826; } // "about": ± 5 years
  return [lo, hi];
}
/** a day number for sorting (the middle of what the date can mean); Infinity when unknown */
export function sortKeyD(s) { const r = rangeD(s); return r ? (r[0] + r[1]) / 2 : Infinity; }
export function todayJdn(now = new Date()) { return gToJdn(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
/** the Gregorian year(s) a date falls in: [y1, y2] */
export function gYears(s) { const p = parseD(s); if (!p) return null; const r = rangeD({ ...p, approx: false }); return [jdnToG(r[0]).y, jdnToG(r[1]).y]; }

/**
 * age in whole years between two dates (to = '' → today): { lo, hi } (equal when both are exact),
 * or null when unknown or negative.
 */
export function ageBetween(from, to, now) {
  const a = rangeD(from); if (!a) return null;
  const b = to ? rangeD(to) : [todayJdn(now), todayJdn(now)];
  if (!b) return null;
  const years = (j1, j2) => {
    if (j2 < j1) return -1;
    const g1 = jdnToG(j1), g2 = jdnToG(j2);
    let y = g2.y - g1.y;
    if (g2.m < g1.m || (g2.m === g1.m && g2.d < g1.d)) y--;
    return y;
  };
  const lo = years(a[1], b[0]), hi = years(a[0], b[1]);
  if (hi < 0) return null;
  return { lo: Math.max(0, lo), hi };
}

/** the same date in the other calendar (exact days only convert exactly) */
export function convertD(s) {
  const p = parseD(s); if (!p) return null;
  if (p.d) {
    const j = p.cal === 'g' ? gToJdn(p.y, p.m, p.d) : hToJdn(p.y, p.m, p.d);
    const o = p.cal === 'g' ? jdnToH(j) : jdnToG(j);
    return { cal: p.cal === 'g' ? 'h' : 'g', y: o.y, m: o.m, d: o.d, approx: p.approx, prec: 'day', exact: !p.approx };
  }
  const r = rangeD({ ...p, approx: false });
  const conv = j => (p.cal === 'g' ? jdnToH(j) : jdnToG(j));
  const a = conv(r[0]), b = conv(r[1]);
  if (p.m && a.y === b.y && a.m === b.m) return { cal: p.cal === 'g' ? 'h' : 'g', y: a.y, m: a.m, d: 0, approx: p.approx, prec: 'month', exact: false };
  return { cal: p.cal === 'g' ? 'h' : 'g', y: a.y, y2: b.y !== a.y ? b.y : 0, m: 0, d: 0, approx: p.approx, prec: 'year', exact: false };
}

/* ---------------- text ---------------- */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toArabicDigits = s => String(s).replace(/\d/g, d => AR_DIGITS[d]);
/** reads Arabic-Indic and Persian digits as 0-9 */
export const latinDigits = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/**
 * a date as words: "12 مارس 1985" / "15 رجب 1380 هـ" / "1950م" ; opts: { lang, digits, suffix: add م for Gregorian }
 */
export function fmtParts(p, { lang = 'ar', digits = 'latn', suffix = false, short = false } = {}) {
  if (!p) return '';
  const ar = lang === 'ar';
  const dg = v => (ar && digits === 'arab' ? toArabicDigits(v) : String(v));
  const months = p.cal === 'h' ? HIJRI_MONTHS[ar ? 'ar' : 'en'] : G_MONTHS[ar ? 'ar' : 'en'];
  let out = '';
  const year = p.y2 ? dg(p.y) + '–' + dg(p.y2) : dg(p.y);
  if (p.d) out = ar ? `${dg(p.d)} ${months[p.m - 1]} ${year}` : `${p.d} ${short ? months[p.m - 1].slice(0, 3) : months[p.m - 1]} ${year}`;
  else if (p.m) out = `${months[p.m - 1]} ${year}`;
  else out = year;
  if (p.cal === 'h') out += ar ? ' هـ' : ' AH';
  else if (suffix) out += ar ? 'م' : ' CE';
  if (p.approx) out = (ar ? 'نحو ' : 'c. ') + out;
  return out;
}
/**
 * a stored date for display: { main, alt } — main in the calendar it was entered (or the preferred one
 * when the conversion is exact), alt the other calendar (approximate for partial dates).
 * prefer: 'entered' | 'g' | 'h'
 */
export function fmtD(s, { lang = 'ar', digits = 'latn', prefer = 'entered', both = true } = {}) {
  const p = parseD(s);
  if (!p) return { main: '', alt: '' };
  const c = convertD(s);
  let first = p, second = c;
  if (prefer !== 'entered' && prefer !== p.cal && c && c.exact) { first = c; second = p; }
  const main = fmtParts(first, { lang, digits, suffix: both && first.cal === 'g' });
  let alt = '';
  if (both && second) {
    alt = fmtParts({ ...second, approx: false }, { lang, digits, suffix: second.cal === 'g' });
    if (second !== p && !second.exact) alt = (lang === 'ar' ? 'يوافق تقريباً ' : '≈ ') + alt;
  }
  return { main, alt };
}
/** just the year, in the wanted calendar ('g' or 'h'): "1950" / "1380" (approx with ~) — for tree cards */
export function yearIn(s, cal) {
  const p = parseD(s); if (!p) return null;
  if (p.cal === cal) return { y: p.y, approx: p.approx };
  const r = rangeD({ ...p, approx: false });
  const mid = Math.round((r[0] + r[1]) / 2);
  const o = cal === 'g' ? jdnToG(mid) : jdnToH(mid);
  return { y: o.y, approx: true };
}
