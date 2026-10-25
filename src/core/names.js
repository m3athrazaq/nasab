// Arabic names: reading a full name ("خالد راشد محمد عبدالله الراشد") into a chain of
// fathers, guessing whether a first name is a man's or a woman's, and writing lineages.
import { normAr } from './util.js';

const TATWEEL = /ـ/g;
/** tidy a typed name: single spaces, no tatweel, no stray punctuation at the ends */
export function cleanName(s) {
  return String(s == null ? '' : s).replace(TATWEEL, '').replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ').replace(/^[\s.,،؛;:\-–—_/\\|]+|[\s.,،؛;:\-–—_/\\|]+$/g, '').trim();
}

const CONNECTORS = new Set(['بن', 'ابن', 'إبن', 'بنت', 'ابنة', 'إبنة', 'ابنه', 'bin', 'ibn', 'bint', 'ben', 'b.']);
const JOIN_NEXT = new Set(['عبد', 'ابو', 'أبو', 'أبي', 'ابي', 'أبا', 'ابا', 'ام', 'أم', 'abu', 'abd', 'umm']);
const JOIN_PREV = new Set(['الله', 'الدين', 'الدولة', 'الإسلام', 'الاسلام']);
/** first names that start with "ال" (so a final "الحسن" is not taken for a family name) */
const AL_NAMES = new Set(['الحسن', 'الحسين', 'العباس', 'الوليد', 'المهدي', 'الهادي', 'المنذر', 'الزبير', 'الفضل', 'القاسم', 'المعتصم', 'المأمون', 'الحارث', 'المقداد', 'المثنى', 'الخضر', 'اليسع', 'المغيرة', 'النعمان', 'السائب', 'الأمين', 'الطيب', 'البراء', 'العنود', 'الجوهرة', 'البندري', 'الشيماء', 'الزهراء']);

/**
 * a full name → { names: [self, father, grandfather, …], family }
 * familyLast: true = the last word is the family/tribe name, false = it is a name, null = guess
 */
export function parseChain(text, familyLast = null) {
  let raw = cleanName(text).replace(/[،,؛;\-–—_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { names: [], family: '', guessedFamily: false };
  const toks = raw.split(' ');
  // "آل …" to the end is the family
  let family = '';
  const alIdx = toks.findIndex((t, i) => i > 0 && (t === 'آل' || t === 'ال'));
  let body = toks;
  if (alIdx > 0) { family = 'آل ' + toks.slice(alIdx + 1).join(' '); body = toks.slice(0, alIdx); if (!toks[alIdx + 1]) family = ''; }
  const names = [];
  for (let i = 0; i < body.length; i++) {
    let t = body[i];
    const low = t.toLowerCase();
    if (CONNECTORS.has(low) && names.length) continue;
    if (JOIN_NEXT.has(low) && i + 1 < body.length && !CONNECTORS.has(body[i + 1].toLowerCase())) { t = t + ' ' + body[++i]; }
    if (i + 1 < body.length && JOIN_PREV.has(body[i + 1]) && !/^عبد/.test(t)) { t = t + ' ' + body[++i]; }
    names.push(t);
  }
  let guessed = false;
  if (!family && names.length >= 2) {
    const last = names[names.length - 1];
    const looksFamily = /^ال/.test(last) && !AL_NAMES.has(last) && names.length >= 3;
    if (familyLast === true || (familyLast == null && looksFamily)) { family = names.pop(); guessed = familyLast == null; }
  }
  return { names, family, guessedFamily: guessed };
}

/* ---------------- gender ---------------- */
const FEMALE = new Set(('مريم زينب هند نور سارة ساره فاطمة عائشة خديجة نورة منيرة لولوة شيخة موضي حصة دانة دانه ريم شهد روان جود لين هيا مها أمل امل عبير دلال بدرية سعاد نوال ابتسام إيمان ايمان أفنان بثينة تهاني جواهر حنان حياة خلود دعاء رحاب رقية سميرة سهام شروق صالحة عفاف غدير فجر لطيفة مشاعل منال ميثاء نجلاء نهى هالة هبة وداد يسرا ياسمين غلا جنى رهف ريما سلمى شيماء عنود العنود الجوهرة البندري أمينة آمنة حليمة جميلة زهرة زهراء فوزية نادية عزيزة سبيكة بيبي نوف ديما لمى تالا ميار لانا جنان وسمية مزنة هيلة نوير غنيمة شريفة فضة دلما حمدة عوشة ميرة مي ليلى منى هدى نجوى بشرى سلوى ندى رنا سناء صفاء وفاء أسماء اسماء هيفاء لمياء علياء رجاء نجاة سعدية حصه طيبة رزان رغد ريناد لجين ملاك وعد بسمة رشا دينا جيهان سوزان نسرين نرمين شيرين أريج اريج بتول تسنيم حلا دانا رتاج سديم شذى غادة لبنى مرام ميساء نسيبة نوار وجدان يارا آلاء الاء إسراء اسراء ضحى أروى اروى عليا عالية جوري تولين لارا لميس ماريا مارية ميسون ناديه نجود نوره منيره لطيفه شيخه موزة موزه حصيصة عذاري فاطمه عائشه خديجه آمنه امنه زينه زينة').split(' '));
const MALE_ENDING_TAA = new Set(('حمزة أسامة اسامة عبيدة أبو عبيدة خليفة عطية طلحة عروة حذيفة معاوية سلامة جمعة عكرمة قتيبة عتبة شيبة مسلمة ربيعة ثعلبة قتادة عنترة زرعة مرة ضمرة حارثة جبلة عبادة رفاعة سعدة ذؤابة صعصعة مسيلمة طرفة عاصمة نوفلة').split(' '));
const MALE_ENDING_ALIF = new Set(('موسى عيسى يحيى مصطفى مرتضى مجتبى علاء بهاء ضياء زكريا زكرياء مصطفي يحيي عيسي موسي').split(' '));

const FEMALE_N = new Set([...FEMALE].map(normAr));
/** 'm', 'f' or '' (unsure) */
export function guessGender(name) {
  const w = cleanName(name);
  if (!w) return '';
  const first = w.split(' ')[0];
  if (first === 'أم' || first === 'ام') return 'f';
  if (/^(عبد|أبو|ابو)/.test(w)) return 'm';
  if (FEMALE.has(w) || FEMALE_N.has(normAr(w))) return 'f';
  if (MALE_ENDING_TAA.has(w) || MALE_ENDING_ALIF.has(w)) return 'm';
  if (/ة$/.test(w) || /(اء|ى)$/.test(w)) return 'f';
  if (/^[\u0600-\u06FF ]+$/.test(w)) return 'm';
  return '';
}

/* ---------------- lineage text ---------------- */
/**
 * names of a person then his fathers → "خالد بن راشد بن محمد" / "خالد راشد محمد"
 * opts: { gender, style: 'bin'|'plain', family, lang }
 */
export function lineageText(names, { gender = 'm', style = 'bin', family = '', lang = 'ar' } = {}) {
  const list = names.filter(Boolean);
  if (!list.length) return family || '';
  // Arabic names keep Arabic connectors even in the English interface ("bin" between Arabic words reads badly)
  const en = lang === 'en' && !list.some(x => /[\u0600-\u06FF]/.test(x));
  const first = en ? (gender === 'f' ? ' bint ' : ' bin ') : (gender === 'f' ? ' بنت ' : ' بن ');
  const rest = en ? ' bin ' : ' بن ';
  const out = style === 'bin' ? list[0] + (list.length > 1 ? first + list.slice(1).join(rest) : '') : list.join(' ');
  return family ? out + ' ' + family : out;
}
/** "رحمه الله" / "رحمها الله" */
export const mercy = (g, lang = 'ar') => (lang === 'ar' ? (g === 'f' ? 'رحمها الله' : 'رحمه الله') : '');
/** "آل X" from a family word ("الراشد" → "الراشد", "صباح" → "آل صباح") for titles */
export function familyTitle(fam) {
  const f = cleanName(fam);
  if (!f) return '';
  if (/^آل\s/.test(f) || /^ال/.test(f)) return f;
  return 'آل ' + f;
}
/** initials for an avatar: first letter of the first name */
export function initial(name) {
  const w = cleanName(name).replace(/^(عبد|أبو|ابو|أم|ام)\s?/, '');
  const ch = [...w][0] || '؟';
  return ch.toUpperCase();
}
