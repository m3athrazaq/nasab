// Arabic / English text, numbers and dates, following the user's settings.
import { signal, computed } from '@preact/signals';
import { AR, EN } from './strings.js';
import { fmtD, toArabicDigits, ageBetween, yearIn, parseD } from './dates.js';

export const lang = signal('ar');
export const digits = signal('latn');     // 'latn' 123 or 'arab' ١٢٣
export const calPref = signal('entered'); // which calendar dates are shown in first
export const calBoth = signal(true);      // also show the other calendar
export const isAr = computed(() => lang.value === 'ar');

export function t(key, vars) {
  const d = lang.value === 'ar' ? AR : EN;
  let s = d[key];
  if (s == null) s = EN[key];
  if (s == null) s = AR[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
  return s;
}
/** text in a given language regardless of the setting (exports made in the other language) */
export function tIn(L, key, vars) {
  let s = (L === 'ar' ? AR : EN)[key];
  if (s == null) s = EN[key] ?? AR[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
  return s;
}

const locale = () => (lang.value === 'ar' ? (digits.value === 'arab' ? 'ar-KW-u-nu-arab' : 'ar-KW-u-nu-latn') : 'en-GB');
const nfCache = new Map();
function nfmt(opts) {
  const k = locale() + JSON.stringify(opts || {});
  if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat(locale(), opts));
  return nfCache.get(k);
}
export const num = (n, dec = 0) => nfmt({ minimumFractionDigits: dec, maximumFractionDigits: dec }).format(+n || 0);
export function pct(x, dec = 0) {
  const v = (+x || 0) * 100;
  return nfmt({ minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v) + (lang.value === 'ar' ? '٪' : '%');
}
/** digits only (keeps the user's digit preference) — years and codes inside text */
export const dig = s => (digits.value === 'arab' && lang.value === 'ar' ? toArabicDigits(s) : String(s));

/* plural nouns. Arabic: [feminine?, zero, one, two, few, many, other] */
const PL = {
  ar: {
    person: [0, 'فرد', 'فرد', 'فردان', 'أفراد', 'فرداً', 'فرد'],
    generation: [0, 'جيل', 'جيل', 'جيلان', 'أجيال', 'جيلاً', 'جيل'],
    child: [0, 'ابن', 'ابن', 'ابنان', 'أبناء', 'ابناً', 'ابن'],
    year: [1, 'سنة', 'سنة', 'سنتان', 'سنوات', 'سنة', 'سنة'],
    day: [0, 'يوم', 'يوم', 'يومان', 'أيام', 'يوماً', 'يوم'],
    male: [0, 'ذكر', 'ذكر', 'ذكران', 'ذكور', 'ذكراً', 'ذكر'],
    female: [1, 'أنثى', 'أنثى', 'أنثيان', 'إناث', 'أنثى', 'أنثى'],
    marriage: [1, 'زيجة', 'زيجة', 'زيجتان', 'زيجات', 'زيجة', 'زيجة'],
    photo: [1, 'صورة', 'صورة', 'صورتان', 'صور', 'صورة', 'صورة'],
    page: [1, 'صفحة', 'صفحة', 'صفحتان', 'صفحات', 'صفحة', 'صفحة'],
    time: [1, 'مرة', 'مرة', 'مرتان', 'مرات', 'مرة', 'مرة'],
    wife: [1, 'زوجة', 'زوجة', 'زوجتان', 'زوجات', 'زوجة', 'زوجة'],
    name: [0, 'اسم', 'اسم', 'اسمان', 'أسماء', 'اسماً', 'اسم']
  },
  en: {
    person: ['person', 'people'], generation: ['generation', 'generations'], child: ['child', 'children'], year: ['year', 'years'],
    day: ['day', 'days'], male: ['male', 'males'], female: ['female', 'females'], marriage: ['marriage', 'marriages'], photo: ['photo', 'photos'],
    page: ['page', 'pages'], time: ['time', 'times'], wife: ['wife', 'wives'], name: ['name', 'names']
  }
};
const arRules = new Intl.PluralRules('ar');
const AR_IDX = { zero: 1, one: 2, two: 3, few: 4, many: 5, other: 6 };
/** the noun that goes after the number n */
export function unit(n, key, L = lang.value) {
  if (L === 'ar') return PL.ar[key][AR_IDX[arRules.select(Math.abs(Math.round(n)))]];
  return PL.en[key][Math.abs(n) === 1 ? 0 : 1];
}
/** a number with its noun as one phrase: "52 فرداً", "جيلان", "فرد واحد" */
export function count(n, key, L = lang.value) {
  if (L === 'ar') {
    const r = arRules.select(Math.abs(Math.round(n)));
    const e = PL.ar[key];
    if (r === 'two') return e[3];
    if (r === 'one') return e[2] + (e[0] ? ' واحدة' : ' واحد');
  }
  return (L === lang.value ? num(n) : String(n)) + ' ' + unit(n, key, L);
}

/* ---------------- dates ---------------- */
const dopts = () => ({ lang: lang.value, digits: digits.value, prefer: calPref.value, both: calBoth.value });
/** "12 مارس 1985م (20 جمادى الآخرة 1405 هـ)" */
export function fmtDate(s, { alt = true } = {}) {
  const r = fmtD(s, dopts());
  if (!r.main) return '';
  return alt && r.alt ? `${r.main} (${r.alt})` : r.main;
}
export const fmtDateParts = s => fmtD(s, dopts());
/** the calendar years are shown in on tree cards: Hijri if the date was entered in Hijri, else Gregorian */
export function yearText(s, cal) {
  const p = parseD(s);
  if (!p) return '';
  const c = cal || (calPref.value === 'h' ? 'h' : calPref.value === 'g' ? 'g' : p.cal);
  const y = yearIn(s, c);
  if (!y) return '';
  return (y.approx && (p.approx || p.cal !== c) ? '~' : '') + dig(y.y);
}
/** "1950 – 2010" / "1300 – 1380 هـ" / "1985" for a card; '' when nothing is known */
export function lifeYears(p, mercyWord = '') {
  if (!p) return '';
  const pb = parseD(p.b), pd = parseD(p.d);
  // one calendar for both ends: the one of the birth (or death) as entered, unless a preference is set
  const cal = calPref.value === 'h' ? 'h' : calPref.value === 'g' ? 'g' : (pb || pd || { cal: 'g' }).cal;
  const b = yearText(p.b, cal), d = yearText(p.d, cal);
  const suf = cal === 'h' ? (lang.value === 'ar' ? ' هـ' : ' AH') : '';
  if (b && d) return `${b} – ${d}${suf}`;
  if (d) return (lang.value === 'ar' ? 'ت ' : 'd. ') + d + suf;
  if (b) return b + suf + (p.dead && mercyWord ? ' – ' + mercyWord : '');
  return p.dead && mercyWord ? mercyWord : '';
}
/** "41 سنة" / "نحو 75 سنة" */
export function fmtAge(a) {
  if (!a) return '';
  if (a.lo === a.hi) return count(a.lo, 'year');
  const mid = Math.round((a.lo + a.hi) / 2);
  return (lang.value === 'ar' ? 'نحو ' : 'about ') + count(mid, 'year');
}
export const ageOf = (p, now) => (p && p.b ? ageBetween(p.b, p.d || '', now) : null);
/** "بعد 3 أيام" / "اليوم" */
export function fmtInDays(n) {
  if (n === 0) return t('today');
  if (n === 1) return t('tomorrow');
  return lang.value === 'ar' ? 'بعد ' + count(n, 'day') : 'in ' + count(n, 'day');
}

/* ---------------- names ---------------- */
const arKey = s => String(s || '').replace(/^ال/, '').replace(/^[أإآ]/, 'ا');
/** compares names the way an Arabic index does (ignoring a leading "ال") */
export const byName = (a, b) => (lang.value === 'ar' ? arKey(a).localeCompare(arKey(b), 'ar') : String(a).localeCompare(String(b), 'en'));
