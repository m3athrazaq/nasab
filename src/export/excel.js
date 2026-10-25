// The Excel backup: a formatted workbook (right to left in Arabic) with everyone and every marriage,
// a summary, how-to notes, and (if chosen) the photos. The same file restores everything — and the
// tree can be written or corrected in Excel: a row per person with the number of the father and mother.
import { sanitizeState, STATE_VERSION } from '../core/store.js';
import { buildIndex, generations } from '../core/model.js';
import { familyStats } from '../core/stats.js';
import { lang, fmtDate, fmtAge, ageOf, tIn } from '../core/i18n.js';
import { AR, EN } from '../core/strings.js';
import { lineageText } from '../core/names.js';
import { cleanD, latinDigits, makeD } from '../core/dates.js';
import { bufToB64, b64ToBuf } from '../core/util.js';
import { photoBlob, putPhotoBlob } from '../core/photos.js';
import { loadScript } from './engine.js';

const FORMAT = 'nasab-backup';
const CHUNK = 30000;
let loading = null;
const loadExcel = () => (loading = loading || loadScript('vendor/exceljs.min.js', __EXCELJS_SRI__, 'ExcelJS').catch(e => { loading = null; throw e; }));

/* columns: key, label key, width, 'in' (read back) or 'info' (computed, for reading only) */
const PEOPLE = [
  ['id', 'x_id', 12, 'in'], ['n', 'x_name', 18, 'in'], ['g', 'x_gender', 9, 'in'], ['father', 'x_father_id', 12, 'in'], ['mother', 'x_mother_id', 12, 'in'],
  ['full', 'x_full', 40, 'info'], ['fam', 'x_family', 16, 'in'], ['kun', 'x_kunya', 14, 'in'], ['laq', 'x_laqab', 14, 'in'], ['nick', 'x_nick', 14, 'in'],
  ['b', 'x_birth', 13, 'in'], ['bText', 'x_birth_text', 30, 'info'], ['bp', 'x_birth_place', 16, 'in'],
  ['dead', 'x_dead', 8, 'in'], ['d', 'x_death', 13, 'in'], ['dText', 'x_death_text', 30, 'info'], ['dp', 'x_death_place', 16, 'in'],
  ['age', 'x_age', 10, 'info'], ['gen', 'x_gen', 7, 'info'],
  ['job', 'x_job', 16, 'in'], ['edu', 'x_edu', 16, 'in'], ['res', 'x_res', 16, 'in'], ['tel', 'x_tel', 14, 'in'], ['mail', 'x_mail', 20, 'in'],
  ['ord', 'x_order', 7, 'in'], ['note', 'x_note', 50, 'in']
];
const MARRIAGES = [
  ['id', 'x_id', 12, 'in'], ['h', 'x_husband_id', 12, 'in'], ['hName', 'x_husband', 26, 'info'], ['w', 'x_wife_id', 12, 'in'], ['wName', 'x_wife', 26, 'info'],
  ['st', 'x_status', 10, 'in'], ['md', 'x_married', 13, 'in'], ['ed', 'x_ended', 13, 'in'], ['ord', 'x_order', 7, 'in'], ['kids', 'x_children_n', 9, 'info'], ['note', 'x_note', 30, 'in']
];
const INK = 'FF231C17', RED = 'FFA3271F', SOFT = 'FFF4DEDB', GOLD = 'FFF5E9CC', GREY = 'FFF2F1EC';
const FONT = 'Arial';
const both = key => [AR[key], EN[key]].filter(Boolean).map(x => String(x).trim().toLowerCase());

export async function exportExcel(s, { photos = true, onProgress } = {}) {
  const ExcelJS = await loadExcel();
  const L = lang.value, rtl = L === 'ar';
  const T = k => tIn(L, k);
  const ix = buildIndex(s);
  const root = s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me);
  const gen = generations(ix, root);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nasab'; wb.created = new Date(); wb.modified = new Date();
  const view = { rightToLeft: rtl, state: 'frozen', ySplit: 1, showGridLines: true };
  const yes = T('yes');

  /* summary */
  const st = familyStats(ix, root);
  const sum = wb.addWorksheet(T('xs_summary'), { views: [{ rightToLeft: rtl, showGridLines: false }], properties: { tabColor: { argb: RED } } });
  sum.columns = [{ width: 38 }, { width: 26 }];
  sum.mergeCells('A1:B1');
  const title = sum.getCell('A1');
  const fam = root ? ix.familyOf(root) : '';
  title.value = T('x_title_sheet') + (fam ? ' — ' + fam : '');
  title.font = { name: FONT, size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  title.alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left', indent: 1 };
  sum.getRow(1).height = 36;
  const figures = [
    [T('x_f_people'), st.total], [T('x_f_men'), st.m], [T('x_f_women'), st.f], [T('x_f_living'), st.living], [T('x_f_dead'), st.dead],
    [T('x_f_gens'), st.generations], [T('x_f_marriages'), st.marriages], [T('x_f_root'), root ? lineageText(ix.paternalLine(root, 3).map(x => ix.P[x].n), { gender: ix.P[root].g, lang: L }) : ''],
    [T('x_exported'), new Date().toISOString().slice(0, 16).replace('T', ' ')]
  ];
  let r = 3;
  for (const [k, v] of figures) {
    sum.getCell(r, 1).value = k; sum.getCell(r, 1).font = { name: FONT, color: { argb: 'FF5E554D' } };
    sum.getCell(r, 2).value = v; sum.getCell(r, 2).font = { name: FONT, bold: true }; sum.getCell(r, 2).alignment = { horizontal: rtl ? 'right' : 'left' };
    r++;
  }

  /* data sheets */
  const header = (ws, cols) => {
    ws.columns = cols.map(([key, label, width]) => ({ key, width, header: T(label) }));
    const h = ws.getRow(1);
    h.height = 24;
    cols.forEach(([, , , kind], i) => {
      const c = h.getCell(i + 1);
      c.font = { name: FONT, bold: true, color: { argb: kind === 'info' ? 'FF8C847B' : INK } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kind === 'info' ? GREY : GOLD } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: RED } } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };
  const pws = wb.addWorksheet(T('xs_people'), { views: [view], properties: { tabColor: { argb: INK } } });
  header(pws, PEOPLE);
  const order = Object.keys(ix.P).sort((a, b) => (gen.get(a) || 99) - (gen.get(b) || 99) || (ix.P[a].at || 0) - (ix.P[b].at || 0));
  for (const id of order) {
    const p = ix.P[id];
    const row = {
      id, n: p.n, g: p.g === 'f' ? T('female') : p.g === 'm' ? T('male') : '', father: ix.father(id), mother: ix.mother(id),
      full: lineageText(ix.paternalLine(id, 6).map(x => ix.P[x].n || '؟'), { gender: p.g, family: ix.familyOf(id), lang: L }),
      fam: p.fam, kun: p.kun, laq: p.laq, nick: p.nick, b: p.b, bText: fmtDate(p.b), bp: p.bp,
      dead: !ix.living(id) ? yes : '', d: p.d, dText: fmtDate(p.d), dp: p.dp, age: fmtAge(ageOf(p)), gen: gen.get(id) || '',
      job: p.job, edu: p.edu, res: p.res, tel: p.tel, mail: p.mail, ord: p.ord || '', note: p.note
    };
    const added = pws.addRow(row);
    added.font = { name: FONT };
    added.alignment = { vertical: 'top', wrapText: false };
    added.getCell('note').alignment = { wrapText: true, vertical: 'top' };
    added.getCell('n').font = { name: FONT, bold: true };
  }
  const mws = wb.addWorksheet(T('xs_marriages'), { views: [view] });
  header(mws, MARRIAGES);
  for (const id of Object.keys(ix.U)) {
    const u = ix.U[id];
    const nm = x => (x && ix.P[x] ? lineageText(ix.paternalLine(x, 3).map(y => ix.P[y].n || '؟'), { gender: ix.P[x].g, lang: L }) : '');
    const added = mws.addRow({ id, h: u.h, hName: nm(u.h), w: u.w, wName: nm(u.w), st: u.st === 'd' ? T('divorced') : T('married'), md: u.md, ed: u.ed, ord: u.ord || '', kids: ix.childrenOfUnion(id).length, note: u.note });
    added.font = { name: FONT };
  }
  /* how to write the tree in Excel */
  const help = wb.addWorksheet(T('xs_help'), { views: [{ rightToLeft: rtl, showGridLines: false }] });
  help.columns = [{ width: 110 }];
  T('x_help').split('\n').forEach((line, i) => {
    const c = help.getCell(i + 1, 1);
    c.value = line;
    c.font = { name: FONT, size: i === 0 ? 15 : 11, bold: i === 0 };
    c.alignment = { wrapText: true, horizontal: rtl ? 'right' : 'left', vertical: 'top' };
  });

  /* photos (hidden) */
  let photoCount = 0;
  if (photos) {
    const ids = [...new Set(Object.values(s.people).map(p => p.photo).filter(Boolean))];
    if (ids.length) {
      const ws = wb.addWorksheet('_photos', { state: 'hidden' });
      let i = 0;
      for (const id of ids) {
        i++;
        const blob = await photoBlob(id).catch(() => null);
        if (!blob) continue;
        const b64 = bufToB64(new Uint8Array(await blob.arrayBuffer()));
        const chunks = [];
        for (let k = 0; k < b64.length; k += CHUNK) chunks.push(b64.slice(k, k + CHUNK));
        ws.addRow([id, blob.type || 'image/jpeg', ...chunks]);
        photoCount++;
        onProgress && onProgress(i, ids.length);
      }
    }
  }
  /* settings + check (hidden) */
  const meta = wb.addWorksheet('_nasab', { state: 'hidden' });
  for (const [k, v] of [
    ['format', FORMAT], ['version', STATE_VERSION], ['app', __APP_VERSION__], ['exported', new Date().toISOString()], ['lang', L],
    ['settings', JSON.stringify(s.settings)], ['view', JSON.stringify(s.view)], ['poster', JSON.stringify(s.poster)], ['me', s.me], ['root', s.root],
    ['photo_of', JSON.stringify(Object.fromEntries(Object.entries(s.people).filter(([, p]) => p.photo).map(([id, p]) => [id, p.photo])))],
    ['counts', JSON.stringify({ people: Object.keys(s.people).length, unions: Object.keys(s.unions).length, photos: photoCount })]
  ]) meta.addRow([k, v]);
  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), photoCount };
}

/* ---------------- restore ---------------- */
export class ImportError extends Error { constructor(code) { super(code); this.code = code; } }
const str = v => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(x => x.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
};
/** a date cell: our own text ('1985-03-12', 'h1380'), an Excel date, or "12/3/1985", "1380 هـ" */
function cellDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : makeD({ cal: 'g', y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() });
  if (typeof v === 'number') {
    if (v >= 1 && v <= 2300 && Number.isInteger(v)) return String(v);
    return '';
  }
  let s = latinDigits(str(v)).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const approx = /^(~|نحو|حوالي|تقريباً|تقريبا|c\.?|ca\.?|abt\.?|about)\s*/i.test(s);
  s = s.replace(/^(~|نحو|حوالي|تقريباً|تقريبا|c\.?|ca\.?|abt\.?|about)\s*/i, '');
  const hij = /(هـ|ه\.?$|AH$|hijri)/i.test(s) || /^h/i.test(s);
  s = s.replace(/^h/i, '').replace(/\s*(هـ|ه\.?|AH|hijri|م|CE|AD)\s*$/i, '').trim();
  let m = /^(\d{1,4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/.exec(s);
  if (m && m[1].length >= 3) return cleanD((approx ? '~' : '') + (hij ? 'h' : '') + m[1] + (m[2] ? '-' + m[2].padStart(2, '0') + (m[3] ? '-' + m[3].padStart(2, '0') : '') : ''));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{3,4})$/.exec(s); // day/month/year
  if (m) return cleanD((approx ? '~' : '') + (hij ? 'h' : '') + m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'));
  m = /^(\d{1,2})[-/.](\d{3,4})$/.exec(s); // month/year
  if (m) return cleanD((approx ? '~' : '') + (hij ? 'h' : '') + m[2] + '-' + m[1].padStart(2, '0'));
  return '';
}
const headerMap = (ws, cols) => {
  const map = new Map();
  const want = new Map();
  for (const [key, label] of cols) for (const l of both(label)) want.set(l, key);
  ws.getRow(1).eachCell((c, i) => { const k = want.get(str(c.value).toLowerCase()); if (k && !map.has(k)) map.set(k, i); });
  return map;
};
const isYes = v => ['نعم', 'yes', 'y', 'true', '1', '✓', 'x', 'متوفى', 'متوفية', 'deceased'].includes(str(v).toLowerCase());
const genderOf = v => { const s = str(v).toLowerCase(); return ['ذكر', 'm', 'male', 'man', 'رجل', 'ذ'].includes(s) ? 'm' : ['أنثى', 'انثى', 'f', 'female', 'woman', 'امرأة', 'أ'].includes(s) ? 'f' : ''; };

/** reads an Excel file → { state, photoData, counts } (nothing is changed yet) */
export async function readExcel(buffer) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) { throw new ImportError('bad'); }
  const meta = {};
  const mws = wb.getWorksheet('_nasab');
  if (mws) mws.eachRow(row => { meta[str(row.getCell(1).value)] = str(row.getCell(2).value); });
  if (meta.format && meta.format !== FORMAT) throw new ImportError('bad');
  const find = names => wb.worksheets.find(ws => names.includes(String(ws.name).trim().toLowerCase()));
  const pws = find(both('xs_people')) || wb.worksheets.find(ws => { const m = headerMap(ws, PEOPLE); return m.has('n'); });
  if (!pws) throw new ImportError('no_people');
  const pm = headerMap(pws, PEOPLE);
  if (!pm.has('n')) throw new ImportError('no_people');
  const people = [];
  const parentsOf = new Map(); // given id → [father, mother] as written
  let rowNo = 0;
  pws.eachRow((row, i) => {
    if (i === 1) return;
    const g = k => (pm.has(k) ? row.getCell(pm.get(k)).value : null);
    const n = str(g('n'));
    if (!n) return;
    rowNo++;
    const id = str(g('id')) || 'row' + i;
    const deadCell = g('dead');
    people.push({
      id, n, g: genderOf(g('g')), fam: str(g('fam')), kun: str(g('kun')), laq: str(g('laq')), nick: str(g('nick')),
      b: cellDate(g('b')), bp: str(g('bp')), d: cellDate(g('d')), dp: str(g('dp')), dead: isYes(deadCell) || !!cellDate(g('d')),
      job: str(g('job')), edu: str(g('edu')), res: str(g('res')), tel: str(g('tel')), mail: str(g('mail')), ord: +str(g('ord')) || 0, note: str(g('note'))
    });
    parentsOf.set(id, [str(g('father')), str(g('mother'))]);
  });
  if (!people.length) throw new ImportError('empty');
  // marriages
  const unions = [];
  const mar = find(both('xs_marriages'));
  if (mar) {
    const um = headerMap(mar, MARRIAGES);
    const divorced = new Set([...both('divorced'), 'd', 'منفصل', 'منفصلة', 'مطلقة']);
    mar.eachRow((row, i) => {
      if (i === 1) return;
      const g = k => (um.has(k) ? row.getCell(um.get(k)).value : null);
      const h = str(g('h')), w = str(g('w'));
      if (!h && !w) return;
      unions.push({ id: str(g('id')) || 'u' + i, h, w, st: divorced.has(str(g('st')).toLowerCase()) ? 'd' : 'm', md: cellDate(g('md')), ed: cellDate(g('ed')), ord: +str(g('ord')) || 0, note: str(g('note')) });
    });
  }
  // children → the union of their father and mother (made when the marriages sheet does not have it)
  const key = (h, w) => h + '|' + w;
  const byCouple = new Map(unions.map(u => [key(u.h, u.w), u]));
  const onlyUnion = new Map(); // a father with one marriage: children with no mother written go there
  for (const u of unions) for (const p of [u.h, u.w]) if (p) onlyUnion.set(p, onlyUnion.has(p) ? null : u);
  let made = 0;
  for (const p of people) {
    const [f, m] = parentsOf.get(p.id) || ['', ''];
    if (!f && !m) continue;
    let u = byCouple.get(key(f, m));
    if (!u && f && !m && onlyUnion.get(f)) u = onlyUnion.get(f);
    if (!u && m && !f && onlyUnion.get(m)) u = onlyUnion.get(m);
    if (!u) { u = { id: 'mk' + (++made), h: f, w: m, st: 'm' }; unions.push(u); byCouple.set(key(f, m), u); }
    p.pu = u.id;
  }
  // photos
  const photoData = new Map();
  const photoWs = wb.getWorksheet('_photos');
  if (photoWs) {
    photoWs.eachRow(row => {
      const id = str(row.getCell(1).value);
      const type = str(row.getCell(2).value) || 'image/jpeg';
      let b64 = '';
      for (let c = 3; c <= row.cellCount; c++) b64 += str(row.getCell(c).value);
      if (/^[a-z0-9]{4,32}$/.test(id) && b64 && /^[A-Za-z0-9+/=]+$/.test(b64)) photoData.set(id, { b64, type: /^image\/(jpeg|png|webp)$/.test(type) ? type : 'image/jpeg' });
    });
  }
  let photoOf = {};
  try { photoOf = JSON.parse(meta.photo_of || '{}') || {}; } catch (e) { photoOf = {}; }
  for (const p of people) if (photoOf[p.id] && photoData.has(photoOf[p.id])) p.photo = photoOf[p.id];
  const parse = j => { try { return JSON.parse(j); } catch (e) { return null; } };
  const raw = { people, unions, settings: parse(meta.settings) || {}, view: parse(meta.view) || {}, poster: parse(meta.poster) || {}, me: meta.me || '', root: meta.root || '' };
  const clean = sanitizeState(raw);
  return {
    state: clean, photoData, fromApp: !!meta.format,
    counts: { people: Object.keys(clean.people).length, unions: Object.keys(clean.unions).length, photos: photoData.size }
  };
}
/** puts restored photos into the device's photo store */
export async function storePhotos(photoData) {
  for (const [id, d] of photoData) {
    try { await putPhotoBlob(id, new Blob([b64ToBuf(d.b64)], { type: d.type })); } catch (e) { /* skip a broken photo */ }
  }
}
