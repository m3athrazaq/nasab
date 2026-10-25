// Small helpers shared by the whole app: ids, text search, files, hashing.

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
export const finite = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
export const sum = arr => arr.reduce((a, b) => a + b, 0);
export const uniq = arr => [...new Set(arr)];
export const by = (f, dir = 1) => (a, b) => { const x = f(a), y = f(b); return x < y ? -dir : x > y ? dir : 0; };

/* ---------------- text search ---------------- */
const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
/** Arabic letters folded the way people search: hamza forms, taa marbuta, alif maqsura, no diacritics */
export function normAr(s) {
  return String(s || '').replace(AR_MARKS, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/گ/g, 'ك').replace(/پ/g, 'ب').replace(/چ/g, 'ج').replace(/ڤ/g, 'ف').replace(/ی/g, 'ي').replace(/ک/g, 'ك');
}
const LAT_MAP = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };
export function normText(s) {
  return normAr(String(s || '').toLowerCase())
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ßæœøłđðþı]/g, c => LAT_MAP[c])
    .replace(/['’`ʻʼ‘"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
/** a name without spaces (so "عبد الله" finds "عبدالله") and without a leading "ال" */
export const nameKey = s => normText(s).replace(/^ال(?=..)/, '').replace(/\s+/g, '');

/* ---------------- misc ---------------- */
export function debounce(fn, ms) {
  let t = 0;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.flush = (...a) => { clearTimeout(t); fn(...a); };
  return f;
}
export function bufToB64(buf) {
  let s = ''; const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBuf(b64) {
  const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
export const safeFileName = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-').replace(/\s+/g, '-').replace(/^\.+/, '').replace(/-+/g, '-').slice(0, 60) || 'nasab';
/** stable small hash of a string (for seeded visuals) */
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
/** HTML/XML text escaping */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
