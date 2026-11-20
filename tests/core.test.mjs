// The app's logic without a browser: dates in both calendars, Arabic names, kinship, the tree's data
// model and its repairs, editing and undo, GEDCOM and Excel round trips, and every print (poster in all
// looks and shapes, the family book, the certificate) drawn to PDF and SVG; sync between devices through a
// private repository in memory (merging, deletions, conflicts, photos, broken files, the link code and its
// QR code), and the tool Claude edits the family with (through the API and through a git clone).
//   node tests/core.test.mjs        prints PASS/FAIL lines; exits 1 on any failure
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
// what the bundler defines, and what the Excel module expects to find already loaded
Object.assign(globalThis, { __APP_VERSION__: 'test', __ALLOW_FRAME__: false, __EXCELJS_SRI__: '', __PDF_SRI__: '', __VIEWER_SRI__: '', __QR_SRI__: '' });
globalThis.window = globalThis;
globalThis.ExcelJS = require('exceljs');

const { sanitizeState, state, replaceState, undo, mergeStates, defaultState, LIMITS } = await import('../src/core/store.js');
const { buildIndex, searchPeople, generations } = await import('../src/core/model.js');
const { relation, phraseAr, phraseYou, degreeAr } = await import('../src/core/kinship.js');
const { demoState } = await import('../src/core/demo.js');
const D = await import('../src/core/dates.js');
const N = await import('../src/core/names.js');
const A = await import('../src/core/actions.js');
const { familyStats, upcomingEvents } = await import('../src/core/stats.js');
const { exportGedcom, importGedcom, readGedDate, gedDate } = await import('../src/export/gedcom.js');
const { exportExcel, readExcel } = await import('../src/export/excel.js');
const { createTextEngine } = await import('../src/chart/text.js');
const { buildPoster } = await import('../src/export/poster.js');
const { buildTable, tableLayout } = await import('../src/export/table.js');
const { buildBook } = await import('../src/export/book.js');
const { buildCertificate } = await import('../src/export/certificate.js');
const { sceneToPdf, sceneToSvg } = await import('../src/chart/render.js');
const { POSTER_THEMES } = await import('../src/chart/themes.js');
const { layoutDescendants } = await import('../src/chart/layout.js');
const { photosInUse } = await import('../src/core/photos.js');

let fails = 0, passes = 0;
function check(name, ok, detail = '') {
  if (ok) { passes++; console.log('PASS ' + name); }
  else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
async function section(name, fn) {
  try { await fn(); } catch (e) { fails++; console.log('ERROR ' + name + ': ' + (e && e.stack || e)); }
}

/* ---------------- dates ---------------- */
await section('dates', () => {
  // Gregorian day numbers round trip, 1700–2200
  let bad = 0;
  for (let j = D.gToJdn(1700, 1, 1); j < D.gToJdn(2200, 1, 1); j += 13) { const g = D.jdnToG(j); if (D.gToJdn(g.y, g.m, g.d) !== j) bad++; }
  eq('gregorian day numbers round trip', bad, 0);
  // Hijri (Umm al-Qura where known) round trip, 1300–1500 AH
  bad = 0;
  for (let j = D.hToJdn(1300, 1, 1); j < D.hToJdn(1500, 1, 1); j += 7) { const h = D.jdnToH(j); if (D.hToJdn(h.y, h.m, h.d) !== j) bad++; }
  eq('hijri day numbers round trip', bad, 0);
  const c = D.convertD('1985-03-12');
  eq('12 March 1985 is 20 Jumada al-Akhirah 1405', [c.cal, c.y, c.m, c.d], ['h', 1405, 6, 20]);
  const c2 = D.convertD('h1380-07-15');
  eq('15 Rajab 1380 is 3 January 1961', [c2.cal, c2.y, c2.m, c2.d], ['g', 1961, 1, 3]);
  eq('1 Ramadan 1445 is 11 March 2024', (() => { const r = D.convertD('h1445-09-01'); return [r.y, r.m, r.d]; })(), [2024, 3, 11]);
  eq('an approximate year', D.fmtD('~1950', { lang: 'ar' }).main, 'نحو 1950م');
  eq('a Hijri year with its Gregorian years', D.fmtD('h1380', { lang: 'ar' }), { main: '1380 هـ', alt: 'يوافق تقريباً 1960–1961م' });
  eq('English dates', D.fmtD('h1380-07-15', { lang: 'en' }), { main: '15 Rajab 1380 AH', alt: '3 January 1961 CE' });
  eq('Arabic-Indic digits', D.fmtD('1985-03-12', { lang: 'ar', digits: 'arab' }).main, '١٢ مارس ١٩٨٥م');
  eq('age at death, exact', D.ageBetween('1935-02-11', '2005-08-20'), { lo: 70, hi: 70 });
  eq('age between Hijri years', D.ageBetween('h1280', 'h1355'), { lo: 71, hi: 73 });
  eq('a typed date is cleaned', D.cleanD('h1380-7-5'), 'h1380-07-05');
  eq('impossible dates are refused', [D.validD('1985-02-30'), D.validD('h1380-13'), D.validD('abc'), D.validD('1985-02-28')], [false, false, false, true]);
  eq('years shown on cards follow the calendar', [D.yearIn('h1380-07-15', 'g').y, D.yearIn('1985-03-12', 'h').y], [1961, 1405]);
});

/* ---------------- names ---------------- */
await section('names', () => {
  eq('a full name becomes a chain and a family', N.parseChain('خالد راشد محمد عبدالله الراشد'), { names: ['خالد', 'راشد', 'محمد', 'عبدالله'], family: 'الراشد', guessedFamily: true });
  eq('"بن", "عبد" and "آل" are understood', N.parseChain('عبد الله بن عبد الرحمن آل سعود').names.length, 2);
  eq('family after آل', N.parseChain('عبد الله بن عبد الرحمن آل سعود').family, 'آل سعود');
  eq('a name that is not a family', N.parseChain('خالد راشد محمد عبدالله الراشد', false).names.length, 5);
  eq('genders from names', ['فاطمة', 'حمزة', 'مريم', 'أسامة', 'نورة', 'خالد', 'هيا', 'عيسى', 'ليلى', 'طلحة'].map(N.guessGender).join(''), 'fmfmfmfmfm');
  eq('lineage with بنت', N.lineageText(['فاطمة', 'راشد', 'محمد'], { gender: 'f' }), 'فاطمة بنت راشد بن محمد');
  eq('lineage without بن', N.lineageText(['فاطمة', 'راشد', 'محمد'], { gender: 'f', style: 'plain', family: 'الراشد' }), 'فاطمة راشد محمد الراشد');
  eq('Arabic names keep بن in English', N.lineageText(['مشعل', 'بدر'], { lang: 'en' }), 'مشعل بن بدر');
  eq('Latin names use bin', N.lineageText(['Mishal', 'Badr'], { lang: 'en' }), 'Mishal bin Badr');
  eq('family titles', [N.familyTitle('صباح'), N.familyTitle('الراشد')], ['آل صباح', 'الراشد']);
});

/* ---------------- the sample family, kinship ---------------- */
const demo = sanitizeState(demoState());
const ix = buildIndex(demo);
await section('kinship', () => {
  eq('sample family size', [Object.keys(demo.people).length, Object.keys(demo.unions).length], [52, 16]);
  const you = a => phraseYou(relation(ix, a, 'demok4'));
  eq('grandfather', you('demom2'), 'جدك لأبيك');
  eq('father', you('demor3'), 'والدك');
  eq('uncle', you('demof3'), 'عمك');
  eq('cousin', you('demoa4'), 'ابن عمك');
  eq('father\'s cousin', you('demosa3'), 'ابن عم والدك');
  eq('great-grandfather', you('demor1'), 'والد جدك لأبيك');
  eq('step-grandmother', you('demom2w2'), 'زوجة جدك لأبيك');
  eq('brother', you('demom4'), 'شقيقك');
  eq('nephew', you('demor5'), 'ابن أخيك');
  eq('son', you('demofy5'), 'ابنك');
  eq('wife', you('demok4w'), 'زوجتك');
  eq('mother', you('demor3w'), 'والدتك');
  eq('brother\'s wife', you('demom4w'), 'زوجة شقيقك');
  eq('half-brother', phraseYou(relation(ix, 'demoy3', 'demor3')), 'أخوك لأبيك');
  const r = relation(ix, 'demoa4', 'demok4');
  eq('cousin in English', r.en, 'paternal first cousin');
  eq('degree of a first cousin', degreeAr(r.degree), 'قرابة من الدرجة الرابعة');
  check('a cousin marriage gives a second relation', relation(ix, 'demoh3', 'demof3').alt.length > 0);
  eq('sentence', phraseAr(relation(ix, 'demof3', 'demok4'), 'خالد'), 'عم خالد');
  eq('no relation to oneself', relation(ix, 'demok4', 'demok4') && relation(ix, 'demok4', 'demok4').kind, 'self');
});
await section('model', () => {
  eq('search by name and father', searchPeople(ix, 'فهد محمد')[0], 'demof3');
  check('search ignores spelling of ة/ه and hamza', searchPeople(ix, 'نوره').length >= 3 && searchPeople(ix, 'احمد').length >= 1);
  const g = generations(ix, demo.root);
  eq('generations of the sample', Math.max(...g.values()), 6);
  eq('paternal line', ix.paternalLine('demok4').map(x => ix.P[x].n), ['خالد', 'راشد', 'محمد', 'راشد']);
  eq('family name inherited', ix.familyOf('demok4'), 'الراشد');
  const st = familyStats(ix, demo.root, { now: new Date(2026, 9, 26) });
  eq('stats: people, living, generations', [st.total, st.living, st.generations], [52, 37, 6]);
  check('upcoming anniversaries are found', upcomingEvents(ix, { days: 365, now: new Date(2026, 9, 26) }).length > 5);
});

/* ---------------- repairs of broken or crafted data ---------------- */
await section('sanitize', () => {
  const raw = {
    people: [
      { id: 'aaaa', n: 'أ'.repeat(500), g: 'm', b: '1985-02-30', pu: 'uuuu' },
      { id: 'bbbb', n: 'ب', g: 'x', pu: 'vvvv' },
      { id: '__proto__', n: 'evil' },
      { id: 'cccc', n: '<img src=x onerror=alert(1)>', g: 'f', photo: 'javascript:alert(1)', zzz: 1 }
    ],
    unions: [
      { id: 'uuuu', h: 'bbbb', w: 'cccc' }, // a's parents
      { id: 'vvvv', h: 'aaaa' },            // b's father is a: a loop
      { id: 'wwww', h: 'nobody', w: 'nope' }
    ],
    me: 'zzzz', root: 'aaaa', settings: { lang: 'xx', depth: 999 }, view: { mode: 'q' }
  };
  const s = sanitizeState(raw);
  const ids = Object.keys(s.people);
  check('bad ids are dropped', !ids.includes('__proto__') && Object.getPrototypeOf(s.people) === null || !Object.prototype.hasOwnProperty.call(s.people, '__proto__'));
  check('names are cut to the limit', s.people.aaaa.n.length <= LIMITS.name);
  eq('an impossible date is dropped', s.people.aaaa.b, '');
  eq('an unknown gender is dropped', s.people.bbbb.g, '');
  eq('unknown fields are dropped', s.people.cccc.zzz, undefined);
  check('a photo must be an id', !s.people.cccc.photo || /^[a-z0-9]+$/.test(s.people.cccc.photo));
  const ix2 = buildIndex(s);
  check('a loop of fathers is broken', !(ix2.father('bbbb') === 'aaaa' && ix2.father('aaaa') === 'bbbb') && ix2.ancestors('aaaa').size < 5 && !ix2.ancestors('aaaa').has('aaaa'));
  check('a marriage of unknown people is removed', !s.unions.wwww);
  eq('unknown "me" is cleared', s.me, '');
  eq('bad settings are reset', [s.settings.lang, s.view.mode], ['ar', 'v']);
  check('text stays text', s.people.cccc.n.includes('<img'));
  const merged = mergeStates(demo, sanitizeState({ people: [{ id: 'newp1', n: 'جديد', g: 'm' }], unions: [] }));
  eq('merge keeps everyone and adds the new', Object.keys(merged.people).length, 53);
});

/* ---------------- editing and undo ---------------- */
await section('actions', () => {
  state.value = defaultState();
  replaceState(demoState());
  const before = Object.keys(state.value.people).length;
  const kid = A.addChild('demok4', { n: 'سلمان', g: 'm', b: '2001-05-04' }, { unionId: Object.keys(state.value.unions).find(u => state.value.unions[u].h === 'demok4') });
  let ixa = buildIndex(state.value);
  eq('a child is added under his father', ixa.father(kid), 'demok4');
  eq('and his mother', ixa.mother(kid), 'demok4w');
  undo();
  eq('undo removes him', Object.keys(state.value.people).length, before);
  const zayed = A.buildChain(['زايد', 'مطلق', 'هزاع', 'دخيل'], { family: 'العتيبي', gender: 'm' });
  ixa = buildIndex(state.value);
  eq('a typed full name becomes linked fathers', ixa.paternalLine(zayed).map(x => ixa.P[x].n), ['زايد', 'مطلق', 'هزاع', 'دخيل']);
  eq('the family goes on the eldest', ixa.familyOf(zayed), 'العتيبي');
  eq('and the typed name is you', state.value.me, zayed);
  const f = ixa.father(zayed);
  const sib = A.addSibling(zayed, { n: 'نورة', g: 'f' });
  ixa = buildIndex(state.value);
  eq('a sibling shares the father', ixa.father(sib), f);
  const n0 = Object.keys(state.value.people).length;
  A.deletePerson(ixa.paternalLine(zayed)[3], 'branch');
  eq('deleting a branch removes all its people', Object.keys(state.value.people).length, n0 - 5);
  undo();
  eq('and undo brings them back', Object.keys(state.value.people).length, n0);
  // two records of the same person are merged into one
  const dup = A.addPerson({ n: 'خالد', g: 'm', job: 'طيار' });
  A.mergePeople('demok4', dup);
  ixa = buildIndex(state.value);
  check('merging keeps the links and the details', !ixa.P[dup] && ixa.P.demok4 && ixa.children('demok4').length >= 2);
});

/* ---------------- GEDCOM ---------------- */
await section('gedcom', () => {
  const raw0 = demoState();
  const r1 = raw0.people.find ? raw0.people.find(p => p.id === 'demor1') : raw0.people.demor1;
  Object.assign(r1, { note: 'سطر أول\nسطر ثانٍ ' + 'طويل '.repeat(80), kun: 'أبو محمد' });
  const s = sanitizeState(raw0);
  const ixg = buildIndex(s);
  const ged = exportGedcom(ixg, s, { now: new Date(2026, 9, 26) });
  check('GEDCOM header and trailer', ged.startsWith('0 HEAD') && ged.trim().endsWith('0 TRLR'));
  check('lines stay under 255 characters', ged.split('\r\n').every(l => l.length <= 255));
  const back = sanitizeState(importGedcom(ged).raw);
  const ix2 = buildIndex(back);
  let diffs = 0;
  for (const id of Object.keys(s.people)) {
    const a = s.people[id], b = back.people[id];
    if (!b) { diffs++; continue; }
    for (const k of ['n', 'g', 'b', 'd', 'bp', 'job', 'kun', 'note', 'dead', 'ord']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs++;
    if (ixg.father(id) !== ix2.father(id) || ixg.mother(id) !== ix2.mother(id)) diffs++;
  }
  eq('round trip keeps everyone, every date (Hijri too) and every link', diffs, 0);
  eq('dates to GEDCOM', [gedDate('1985-03-12').date, gedDate('~1950').date, gedDate('h1380-07-15').date], ['12 MAR 1985', 'ABT 1950', '3 JAN 1961']);
  check('a Hijri date keeps its Hijri form', !!gedDate('h1380-07-15').hijri);
  eq('dates from GEDCOM', [readGedDate('12 MAR 1985'), readGedDate('ABT 1950'), readGedDate('BET 1975 AND 1980')], ['1985-03-12', '~1950', '~1975']);
  const foreign = '0 HEAD\n1 SOUR OTHER\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME سالم ناصر /العلي/\n1 SEX M\n1 BIRT\n2 DATE 12 MAR 1985\n2 PLAC الكويت\n1 FAMC @F1@\n0 @I2@ INDI\n1 NAME ناصر حمد /العلي/\n1 SEX M\n1 FAMS @F1@\n0 @I3@ INDI\n1 NAME Sara /Smith/\n1 SEX F\n1 DEAT Y\n1 FAMS @F1@\n0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I3@\n1 CHIL @I1@\n0 TRLR\n';
  const fs2 = sanitizeState(importGedcom(foreign).raw);
  const ix3 = buildIndex(fs2);
  const salem = Object.keys(fs2.people).find(id => fs2.people[id].n === 'سالم');
  check('a file from another program: the father\'s name is not repeated, parents linked', salem && ix3.P[ix3.father(salem)].n === 'ناصر حمد' && ix3.P[ix3.mother(salem)].n === 'Sara');
  let threw = false; try { importGedcom('hello'); } catch (e) { threw = true; }
  check('a file that is not GEDCOM is refused', threw);
});

/* ---------------- Excel backup ---------------- */
await section('excel', async () => {
  const { blob } = await exportExcel(demo, { photos: false });
  const buf = await blob.arrayBuffer();
  check('backup is an .xlsx (zip)', new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b);
  const r = await readExcel(buf);
  const back = sanitizeState(r.raw || r.state || r);
  const ix2 = buildIndex(back);
  let diffs = 0;
  for (const id of Object.keys(demo.people)) {
    if (!back.people[id]) { diffs++; continue; }
    for (const k of ['n', 'g', 'b', 'd', 'job', 'dead']) if (JSON.stringify(demo.people[id][k]) !== JSON.stringify(back.people[id][k])) diffs++;
    if (ix.father(id) !== ix2.father(id) || ix.mother(id) !== ix2.mother(id)) diffs++;
  }
  eq('restore gives back the same family', diffs, 0);
  let code = '';
  try { await readExcel(new TextEncoder().encode('not a spreadsheet').buffer); } catch (e) { code = e.code || e.message; }
  check('a broken file is refused with a reason', !!code);
});

/* ---------------- prints ---------------- */
await section('prints', async () => {
  const pdfLib = require('pdf-lib');
  const fontkit = require('@pdf-lib/fontkit');
  const bidi = require('bidi-js')();
  const F = { naskhB: 'NotoNaskhArabic-Bold', naskh: 'NotoNaskhArabic-Regular', ui: 'ReadexPro-Regular', uiB: 'ReadexPro-SemiBold', ruqaa: 'ArefRuqaa-Bold', amiri: 'Amiri-Regular', amiriB: 'Amiri-Bold', kufi: 'ReemKufi-Bold' };
  const fonts = {};
  for (const [k, f] of Object.entries(F)) fonts[k] = fs.readFileSync(path.join(ROOT, 'fonts/pdf', f + '.ttf'));
  const engine = createTextEngine({ fontkit, bidi, fonts, dir: 'rtl' });
  const env = { measure: engine.measure.bind(engine), photoIds: new Set() };
  const finite = scene => JSON.stringify(scene).indexOf('NaN') < 0 && JSON.stringify(scene).indexOf('Infinity') < 0;
  for (const th of POSTER_THEMES) {
    for (const mode of ['v', 'h', 'r', 'f']) {
      const P = buildPoster(ix, demo, { mode, theme: th.id, paper: mode === 'v' ? 'auto' : 'A3', orient: 'auto', photos: true, dates: true, colors: true, spouses: true }, env);
      const ok = P.W > 0 && P.H > 0 && P.scene.length > 10 && finite(P.scene);
      check(`poster ${th.id}/${mode} is drawn`, ok, `${P.W}x${P.H}, ${P.scene.length} items`);
    }
  }
  const P = buildPoster(ix, demo, { mode: 'v', theme: 'sadu', paper: 'A2', orient: 'auto', photos: true, dates: true, colors: true, spouses: true }, env);
  const doc = await pdfLib.PDFDocument.create();
  sceneToPdf(pdfLib, doc, doc.addPage([P.W, P.H]), P.scene, { engine });
  const bytes = await doc.save();
  check('poster PDF is written', String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-' && bytes.length > 20000, bytes.length + ' bytes');
  const svg = sceneToSvg(P.scene, { width: P.W, height: P.H, text: 'outline', engine });
  check('poster SVG is written, text as outlines', svg.startsWith('<svg') && !svg.includes('NaN') && !svg.includes('<text'));
  const B = buildBook(ix, demo, { theme: 'palm', photos: true }, env);
  check('family book has its pages', B.pages.length >= 8 && B.pages.every(p => finite(p.scene)), B.pages.length + ' pages');
  const bdoc = await pdfLib.PDFDocument.create();
  for (const pg of B.pages) sceneToPdf(pdfLib, bdoc, bdoc.addPage([pg.W, pg.H]), pg.scene, { engine });
  const bb = await bdoc.save();
  const parsed = await pdfLib.PDFDocument.load(bb);
  eq('book PDF opens with every page', parsed.getPageCount(), B.pages.length);
  for (const id of ['demok4', 'demofy5', 'demor1']) {
    const C = buildCertificate(ix, demo, id, { theme: 'manuscript' }, env);
    check(`certificate for ${ix.P[id].n}`, C.scene.length > 10 && finite(C.scene));
  }
});

/* ---------------- order of brothers and sisters ---------------- */
await section('children order', () => {
  const by = ko => buildIndex({ ...demo, settings: { ...demo.settings, kidsOrder: ko } });
  const names = (x, list) => list.map(id => x.P[id].n);
  eq('eldest first (per mother)', names(by('old'), by('old').children('demom2')), ['راشد', 'منيرة', 'فهد', 'يوسف', 'عائشة']);
  eq('youngest first (per mother)', names(by('young'), by('young').children('demom2')), ['فهد', 'منيرة', 'راشد', 'عائشة', 'يوسف']);
  const y = by('young');
  eq('youngest first across wives', names(y, y.order(y.children('demom2'))), ['عائشة', 'يوسف', 'فهد', 'منيرة', 'راشد']);
  // children without a birth date keep their place; those with one are sorted among themselves
  const raw = {
    people: [
      { id: 'pf01', n: 'أب', g: 'm' },
      { id: 'pa01', n: 'أ', g: 'm', b: '1990', pu: 'u001', at: 1, ord: 2 },
      { id: 'pb01', n: 'ب', g: 'm', pu: 'u001', at: 2, ord: 1 },
      { id: 'pc01', n: 'ج', g: 'm', b: '1980', pu: 'u001', at: 3, ord: 3 },
      { id: 'pd01', n: 'د', g: 'm', pu: 'u001', at: 4, ord: 4 }
    ],
    unions: [{ id: 'u001', h: 'pf01' }]
  };
  const st = sanitizeState(raw);
  const k = ko => { const x = buildIndex({ ...st, settings: { kidsOrder: ko } }); return x.childrenOfUnion('u001').map(id => x.P[id].n).join(''); };
  eq('as entered', k('manual'), 'بأجد');
  eq('by age, undated keep their places', k('old'), 'بجأد');
  eq('youngest first is the reverse', k('young'), 'دأجب');
  eq('the setting is kept', sanitizeState({ settings: { kidsOrder: 'young' } }).settings.kidsOrder, 'young');
  eq('an unknown setting falls back', sanitizeState({ settings: { kidsOrder: 'x' } }).settings.kidsOrder, 'old');
});

/* ---------------- one person's own order for his children ---------------- */
await section('one person\'s children order', async () => {
  state.value = defaultState();
  replaceState(demoState());
  const ids = () => buildIndex(state.value);
  const names = (x, list) => list.map(id => x.P[id].n);
  let x = ids();
  const us = x.unions('demom2').filter(u => x.childrenOfUnion(u).length);
  const before = us.map(u => names(x, x.childrenOfUnion(u)));
  const other = names(x, x.children('demor1'));
  A.setKidsOrder('demom2', 'young');
  x = ids();
  eq('youngest first for him only', us.map(u => names(x, x.childrenOfUnion(u))), before.map(l => [...l].reverse()));
  eq('his order is his', [x.kidsOrderOf('demom2'), x.ownKidsOrder('demom2'), x.kidsOrderOf('demor1')], ['young', true, 'old']);
  eq('others keep the app\'s order', names(x, x.children('demor1')), other);
  eq('the app setting is untouched', state.value.settings.kidsOrder, 'old');
  // by hand: the arrows start from what is shown, then move one
  const groups = us.map(u => x.childrenOfUnion(u));
  A.setKidsOrder('demom2', 'manual', groups);
  x = ids();
  eq('switching to "my order" keeps what was shown', us.map(u => names(x, x.childrenOfUnion(u))), before.map(l => [...l].reverse()));
  const g2 = groups.map(l => [...l]);
  [g2[0][0], g2[0][1]] = [g2[0][1], g2[0][0]];
  A.arrangeKids('demom2', g2);
  x = ids();
  eq('a child moved by hand stays there', x.childrenOfUnion(us[0]), g2[0]);
  eq('all his children in one list follow the same order', x.orderedChildren('demom2'), g2.flat());
  const men = layoutDescendants(x, 'demor1', { mode: 'v', women: false });
  const sons = men.nodes.filter(n => n.parent === 'demom2').sort((a, b) => b.x - a.x).map(n => n.id);
  eq('without women the tree shows his sons in his order', sons, g2.flat().filter(id => x.P[id].g !== 'f'));
  // kept, backed up and restored
  const kept = sanitizeState(JSON.parse(JSON.stringify(state.value)));
  eq('the choice is saved with the marriage', us.map(u => kept.unions[u].ko), us.map(() => 'manual'));
  const { blob } = await exportExcel(state.value, { photos: false });
  const rr = await readExcel(await blob.arrayBuffer());
  const rx = sanitizeState(rr.raw || rr.state || rr);
  const bx = buildIndex(rx);
  eq('Excel backup keeps his order', us.map(u => bx.childrenOfUnion(u)), g2);
  const rg = sanitizeState(importGedcom(exportGedcom(x, state.value)).raw);
  eq('GEDCOM keeps his order', us.map(u => buildIndex(rg).childrenOfUnion(u)), g2);
  undo();
  eq('undo puts the child back', ids().childrenOfUnion(us[0]), groups[0]);
  A.setKidsOrder('demom2', '');
  x = ids();
  eq('back to the app\'s order', [x.kidsOrderOf('demom2'), x.ownKidsOrder('demom2')], ['old', false]);
  eq('an unknown order is dropped', sanitizeState({ unions: [{ id: 'u001', h: '', w: '', ko: 'x' }] }).unions.u001 ? sanitizeState({ unions: [{ id: 'u001', ko: 'x' }] }).unions.u001.ko : '', '');
});

/* ---------------- what the tree shows: women, and a lower first generation ---------------- */
await section('tree filters', () => {
  const full = layoutDescendants(ix, 'demor1', { mode: 'v', dKids: true });
  const men = layoutDescendants(ix, 'demor1', { mode: 'v', dKids: true, women: false });
  check('without women no woman is drawn', men.nodes.every(n => ix.P[n.id].g !== 'f' || n.depth === 0) && full.nodes.some(n => ix.P[n.id].g === 'f'));
  eq('without women the counts follow', men.nodes.length, [...generations(ix, 'demor1', { women: false }).keys()].length);
  const sons = men.nodes.filter(n => n.parent === 'demom2').sort((a, b) => b.x - a.x).map(n => ix.P[n.id].n);
  eq('sons of two wives in one row, eldest first (right to left)', sons, ['راشد', 'فهد', 'يوسف']);
  const g = generations(ix, 'demor1');
  const third = [...g].filter(([, v]) => v === 3).map(([id]) => id);
  for (const mode of ['v', 'h', 'r']) {
    const L3 = layoutDescendants(ix, 'demor1', { mode, dKids: true, fromGen: 3 });
    const tops = L3.nodes.filter(n => !n.parent);
    check(`${mode}: from generation 3, its people are the top row`, L3.virtual && tops.length === third.length && tops.every(n => third.includes(n.id)), `${tops.length} vs ${third.length}`);
    check(`${mode}: nobody above generation 3`, L3.nodes.every(n => g.get(n.id) >= 3));
    eq(`${mode}: generation numbers count from 3`, L3.genBase + 1, 3);
    if (mode !== 'r') check(`${mode}: no lines from the invisible top`, L3.links.every(l => l.from));
    else check('r: the boughs leave the trunk', L3.links.some(l => !l.from));
    eq(`${mode}: each family of generation 3 has its own colour`, [...new Set(tops.map(n => n.branch))].length, tops.length);
  }
  const deep = layoutDescendants(ix, 'demor1', { mode: 'v', dKids: true, fromGen: 3, maxGen: 2 });
  check('from generation 3, two generations', Math.max(...deep.nodes.map(n => g.get(n.id))) === 4);
  check('a generation below the last gives nothing', layoutDescendants(ix, 'demor1', { mode: 'v', fromGen: 9 }).nodes.length === 0);
});

/* ---------------- more than one family ---------------- */
await section('families', () => {
  state.value = defaultState();
  replaceState(demoState());
  const first = state.value.fid;
  const fid = A.addFamily();
  check('a new family opens empty', fid && state.value.fid === fid && !Object.keys(state.value.people).length);
  eq('the first family waits among the others', Object.keys(state.value.others[first].people).length, 52);
  A.buildChain(['سعد', 'ناصر', 'حمد'], { family: 'العلي', me: false });
  eq('the new family has its own people', Object.keys(state.value.people).length, 3);
  eq('…and nobody is "me" there', state.value.me, '');
  A.renameFamily(fid, 'عائلة أمي');
  check('switching back', A.switchFamily(first) && Object.keys(state.value.people).length === 52 && state.value.me === 'demok4');
  eq('the other family kept its name and people', [state.value.others[fid].fname, Object.keys(state.value.others[fid].people).length], ['عائلة أمي', 3]);
  // stored and read again (a crafted entry is dropped)
  const stored = JSON.parse(JSON.stringify(state.value));
  stored.others.bad = { people: [{ id: 'xx01', n: 'x' }] };
  stored.others['__proto__'] = { people: [] };
  stored.others[fid].others = { nested1: { people: [{ id: 'yy01', n: 'y' }] } };
  const back = sanitizeState(stored);
  eq('families survive saving', Object.keys(back.others), [fid]);
  check('no family inside a family', !back.others[fid].others);
  // a restore replaces the open family only
  replaceState({ people: [{ id: 'zz01', n: 'زيد', g: 'm' }] });
  check('restoring keeps the other families', state.value.fid === first && state.value.others[fid] && Object.keys(state.value.people).length === 1);
  undo();
  eq('…and undo brings the family back', Object.keys(state.value.people).length, 52);
  // photos in use in any family are kept when tidying
  const withPhoto = sanitizeState({ ...JSON.parse(JSON.stringify(state.value)) });
  withPhoto.others[fid].people = { ...withPhoto.others[fid].people, ph01: { ...Object.values(withPhoto.others[fid].people)[0], id: 'ph01', photo: 'abcd1234' } };
  check('photos of the other families are kept', photosInUse(withPhoto).has('abcd1234'));
  // deleting: the open family hands over to another; the last one cannot go
  check('delete the open family', A.deleteFamily(first) && state.value.fid === fid && !Object.keys(state.value.others).length);
  check('the last family cannot be deleted', !A.deleteFamily(fid));
  undo();
  check('undo brings a deleted family back', state.value.fid === first && !!state.value.others[fid]);
});

/* ---------------- a poster from a lower generation, without women ---------------- */
await section('poster options', async () => {
  const fontkit = require('@pdf-lib/fontkit');
  const bidi = require('bidi-js')();
  const fonts = {};
  for (const [k, f] of Object.entries({ naskhB: 'NotoNaskhArabic-Bold', naskh: 'NotoNaskhArabic-Regular', ui: 'ReadexPro-Regular', uiB: 'ReadexPro-SemiBold', ruqaa: 'ArefRuqaa-Bold', amiri: 'Amiri-Regular', amiriB: 'Amiri-Bold', kufi: 'ReemKufi-Bold' })) fonts[k] = fs.readFileSync(path.join(ROOT, 'fonts/pdf', f + '.ttf'));
  const engine = createTextEngine({ fontkit, bidi, fonts, dir: 'rtl' });
  const env = { measure: engine.measure.bind(engine), photoIds: new Set() };
  const texts = P => JSON.stringify(P.scene);
  for (const mode of ['v', 'h', 'r']) {
    const P = buildPoster(ix, demo, { mode, theme: 'sadu', paper: 'A3', root: 'demor1', fromGen: 3, women: false }, env);
    check(`${mode}: poster from generation 3 without women`, P && P.scene.length > 10 && texts(P).includes('من الجيل الثالث') && !texts(P).includes('أنثى'));
  }
  const R = buildPoster(ix, demo, { mode: 'r', theme: 'palm', paper: 'A3', root: 'demor1', fromGen: 2 }, env);
  check('canopy from generation 2: the family on the trunk', texts(R).includes('الراشد'));
  check('no poster when the generation is empty', buildPoster(ix, demo, { mode: 'v', theme: 'sadu', paper: 'A3', root: 'demor1', fromGen: 9 }, env) === null);
  // no app credit on any poster; who prepared it, when given
  for (const mode of ['v', 'h', 'r', 'f']) {
    const P = buildPoster(ix, demo, { mode, theme: 'sadu', paper: 'A3', by: 'سالم' }, env);
    check(`${mode}: no "made with" mark, "prepared by" printed`, !/صُنعت بتطبيق|Made with Nasab/.test(texts(P)) && texts(P).includes('إعداد: سالم'));
  }
});

/* ---------------- each name inside its shape ---------------- */
await section('names inside the shapes', async () => {
  const fontkit = require('@pdf-lib/fontkit');
  const bidi = require('bidi-js')();
  const fonts = {};
  for (const [k, f] of Object.entries({ naskhB: 'NotoNaskhArabic-Bold', naskh: 'NotoNaskhArabic-Regular', ui: 'ReadexPro-Regular', uiB: 'ReadexPro-SemiBold', ruqaa: 'ArefRuqaa-Bold', amiri: 'Amiri-Regular', amiriB: 'Amiri-Bold', kufi: 'ReemKufi-Bold' })) fonts[k] = fs.readFileSync(path.join(ROOT, 'fonts/pdf', f + '.ttf'));
  const engine = createTextEngine({ fontkit, bidi, fonts, dir: 'rtl' });
  const env = { measure: engine.measure.bind(engine), photoIds: new Set() };
  const texts = items => { const out = []; const walk = l => l.forEach(i => { if (i.t === 'text') out.push(i.s); if (i.items) walk(i.items); }); walk(items); return out; };
  const people = [...generations(ix, demo.root).keys()].map(id => ix.P[id].n);
  for (const mode of ['v', 'h', 'r']) {
    const seal = buildPoster(ix, demo, { mode, theme: 'manuscript', paper: 'A3' }, env);
    const card = buildPoster(ix, demo, { mode, theme: 'manuscript', paper: 'A3', inside: true }, env);
    const letters = P => texts(P.scene).filter(x => [...x].length === 1).length;
    const all = texts(card.scene);
    check(`${mode}: names inside the shapes, no first letters`, letters(seal) > 20 && letters(card) === 0 && people.every(n => all.includes(n)), `${letters(seal)} → ${letters(card)}`);
  }
  const L = layoutDescendants(ix, demo.root, { mode: 'v', dates: true, inside: true });
  check('cards stand closer than seals', L.inside && L.M.level < layoutDescendants(ix, demo.root, { mode: 'v', dates: true }).M.level && L.box.cardH > 30);
  eq('the choice is kept, for the tree and for prints', [sanitizeState({ view: { inside: true } }).view.inside, sanitizeState({ poster: { inside: true } }).poster.inside, sanitizeState({}).view.inside], [true, true, false]);
});

/* ---------------- the table of generations ---------------- */
const GEN_COLORS_USED = scene => /#FFC072|#9CE159|#FFE061|#64B2DF/i.test(JSON.stringify(scene));
await section('table of generations', async () => {
  const fontkit = require('@pdf-lib/fontkit');
  const bidi = require('bidi-js')();
  const pdfLib = require('pdf-lib');
  const fonts = {};
  for (const [k, f] of Object.entries({ naskhB: 'NotoNaskhArabic-Bold', naskh: 'NotoNaskhArabic-Regular', ui: 'ReadexPro-Regular', uiB: 'ReadexPro-SemiBold', amiri: 'Amiri-Regular' })) fonts[k] = fs.readFileSync(path.join(ROOT, 'fonts/pdf', f + '.ttf'));
  const engine = createTextEngine({ fontkit, bidi, fonts, dir: 'rtl' });
  const env = { measure: engine.measure.bind(engine), today: new Date(2026, 10, 19) };
  const node = (id, ...children) => ({ id, children });
  // a brother whose family starts lower down: his sisters tuck in right under him
  const t1 = node('A', node('B', node('C', node('D'), node('E')), node('F')), node('G'), node('H'));
  const L1 = tableLayout([t1]);
  const at = (L, id) => { const n = L.cells.find(c => c.id === id); return n ? [n.col, n.row] : null; };
  eq('first child on his father\'s row', [at(L1, 'A'), at(L1, 'B'), at(L1, 'C'), at(L1, 'D')], [[0, 0], [1, 0], [2, 0], [3, 0]]);
  eq('sisters under a brother whose family starts lower down', [at(L1, 'G'), at(L1, 'H')], [[1, 1], [1, 2]]);
  eq('a family of more than one row is followed by a blank row', [at(L1, 'E'), at(L1, 'F')], [[3, 1], [2, 3]]);
  // when the cell beside them is taken, they wait for the end of his family and a blank row
  const t2 = node('A', node('B', node('C'), node('D'), node('E')), node('F'));
  const L2 = tableLayout([t2]);
  eq('…else after his family and a blank row', at(L2, 'F'), [1, 4]);
  // a line of one child after another stays on one row, next to the others
  const t3 = node('A', node('B'), node('C', node('D')), node('E'));
  eq('one-row lines sit together', ['B', 'C', 'D', 'E'].map(id => at(tableLayout([t3]), id)), [[1, 0], [1, 1], [2, 1], [1, 2]]);
  const free = L => { const seen = new Set(); for (const n of L.cells) { const k = n.col + ':' + n.row; if (seen.has(k)) return false; seen.add(k); } return true; };
  check('no two people share a cell', free(L1) && free(L2));
  // the sample family, as one long page and on pages
  const one = buildTable(ix, demo, { paper: 'auto', by: 'سالم' }, env);
  const all = JSON.stringify(one.scene);
  check('one long page with every person', one.pages.length === 1 && one.people === [...generations(ix, demo.root).keys()].length && all.includes('إعداد: سالم') && all.includes('الجيل الأول'), `${one.people} people`);
  const a4 = buildTable(ix, demo, { paper: 'A4', orient: 'landscape' }, env);
  const named = a4.pages.map(p => JSON.stringify(p.scene));
  check('A4 landscape: several pages, the generations on each, page numbers', a4.pages.length >= 2 && named.every(x => x.includes('الجيل الأول')) && named[1].includes(`صفحة 2 من ${a4.pages.length}`), a4.pages.length + ' pages');
  check('a later page starts with its first row\'s forefathers, faintly', /"fill":"#5A5A5A"/.test(named[1]));
  const men = buildTable(ix, demo, { paper: 'auto', women: false, fromGen: 3 }, env);
  check('from generation 3 without women', men && JSON.stringify(men.scene).includes('الجيل الثالث') && !JSON.stringify(men.scene).includes('الجيل الأول') && men.people === [...generations(ix, demo.root, { women: false }).entries()].filter(([, g]) => g >= 3).length);
  const rtl = buildTable(ix, demo, { paper: 'auto', gdir: 'rtl' }, env);
  const firstCol = sc => sc.find(i => i.t === 'text' && i.s === 'الجيل الأول');
  check('the first generation on the left, or on the right', firstCol(one.scene).x < one.W / 2 && firstCol(rtl.scene).x > rtl.W / 2);
  const doc = await pdfLib.PDFDocument.create();
  for (const pg of a4.pages) sceneToPdf(pdfLib, doc, doc.addPage([pg.W, pg.H]), pg.scene, { engine });
  const parsed = await pdfLib.PDFDocument.load(await doc.save());
  eq('the table\'s PDF opens with every page', parsed.getPageCount(), a4.pages.length);
  const bw = buildTable(ix, demo, { paper: 'A4', colors: false }, env);
  check('in black and white: no colour but grey', !GEN_COLORS_USED(bw.scene));
  check('nothing to draw from an empty generation', buildTable(ix, demo, { paper: 'auto', fromGen: 9 }, env) === null);
});

/* ---------------- sync between devices (a private GitHub repository, in memory) ---------------- */
await section('sync between devices', async () => {
  const { fakeGitHub, blobSha } = await import('./fake-github.mjs');
  const { memoryDevice } = await import('../src/core/sync-device.js');
  const M = await import('../src/core/sync-merge.js');
  const { linkCode, readLinkCode, looksLikeToken } = await import('../src/core/github.js');
  const gh = fakeGitHub();
  const dev = (st, by, extra = {}) => memoryDevice({ state: st, repo: gh.full, token: gh.token, fetchFn: gh.fetch, by, ...extra });
  const on = (d, fn) => { state.value = d.state; const r = fn(); d.state = state.value; return r; };
  const famOf = d => M.familiesOf(d.state).get(d.state.fid);
  const key = d => M.contentKey(famOf(d));
  const tick = () => new Promise(r => setTimeout(r, 3)); // edits a few ms apart (the later one wins a clash)

  const phone = dev(sanitizeState({ ...demoState(), settings: { onboarded: true } }), 'phone');
  const pc = dev(defaultState(), 'computer');
  await phone.sync();
  const file = gh.read(M.familyPath(phone.state.fid));
  check('the phone sends its family: one file, one line per person', !!file && file.split('\n').filter(l => /^"demo/.test(l)).length >= 52 && M.fromText(file).fid === phone.state.fid);
  eq('git\'s id of the file is computed the same way', await M.gitBlobSha(new TextEncoder().encode(file)), blobSha(Buffer.from(file)));
  await pc.sync();
  check('a new computer takes the family in place of its empty one, and starts', pc.state.fid === phone.state.fid && Object.keys(pc.state.people).length === 52 && pc.state.settings.onboarded && !Object.keys(pc.state.others).length);
  check('both hold the same family', key(pc) === key(phone));
  const reads = gh.log.length;
  await pc.sync();
  check('nothing new: one request, answered "not modified"', gh.log.length === reads + 1 && /git\/ref/.test(gh.log[gh.log.length - 1]));

  // the computer adds a son; the phone receives him
  const kid = on(pc, () => A.addChild('demom2', { n: 'زياد', g: 'm', b: '2021-05-01' }));
  await pc.sync(); await phone.sync();
  const got = phone.news.find(n => n.kind === 'changed');
  check('a son added on the computer reaches the phone, with what changed', !!phone.state.people[kid] && got && got.diff.added.length === 1 && got.by === 'computer', JSON.stringify(got && got.diff.added));
  check('…as his father\'s son', (() => { const k = phone.state.people[kid]; const u = phone.state.unions[k.pu]; return u && u.h === 'demom2'; })());

  // different details of one person on each side, before either syncs: both kept
  on(phone, () => A.editPerson('demoa2', { job: 'مهندس' }));
  await tick();
  on(pc, () => A.editPerson('demoa2', { b: '1960-02-03' }));
  await phone.sync(); await pc.sync(); await phone.sync();
  const a2 = d => d.state.people.demoa2;
  check('two details changed on two devices: both kept, everywhere', a2(pc).job === 'مهندس' && a2(pc).b === '1960-02-03' && a2(phone).job === 'مهندس' && a2(phone).b === '1960-02-03' && key(pc) === key(phone));

  // the same detail on both: the later edit wins
  on(phone, () => A.editPerson('demoa2', { res: 'الكويت' }));
  await tick();
  on(pc, () => A.editPerson('demoa2', { res: 'الرياض' }));
  await pc.sync(); await phone.sync(); await pc.sync();
  check('the same detail changed on both: the later edit wins on both', a2(phone).res === 'الرياض' && a2(pc).res === 'الرياض');

  // deleting reaches the other device
  on(phone, () => A.deletePerson(kid));
  await phone.sync(); await pc.sync();
  check('a person deleted on the phone is deleted on the computer', !pc.state.people[kid] && !phone.state.people[kid] && key(pc) === key(phone));
  check('…and recorded as deleted in the file', !!M.fromText(gh.read(M.familyPath(phone.state.fid))).gone[kid]);

  // deleted on one side, changed on the other before syncing: the change wins (nothing is lost)
  const victim = Object.keys(phone.state.people).find(id => !['demor1', 'demom2', 'demoa2'].includes(id) && !Object.values(phone.state.unions).some(u => u.h === id || u.w === id));
  on(phone, () => A.deletePerson(victim));
  await phone.sync();
  on(pc, () => A.editPerson(victim, { note: 'ملاحظة' }));
  await pc.sync(); await phone.sync();
  check('deleted on the phone while edited on the computer: he stays, with the edit', pc.state.people[victim] && phone.state.people[victim] && phone.state.people[victim].note === 'ملاحظة');

  // a change on GitHub between reading and writing: GitHub refuses the write, the next round merges
  on(pc, () => A.editPerson('demor1', { nick: 'أبو محمد' }));
  const pcRound = pc.sync();
  on(phone, () => A.editPerson('demom2', { job: 'تاجر' }));
  await phone.sync();
  await pcRound; await phone.sync(); await pc.sync();
  check('two devices writing at the same moment: both changes kept', pc.state.people.demor1.nick === 'أبو محمد' && pc.state.people.demom2.job === 'تاجر' && phone.state.people.demor1.nick === 'أبو محمد' && key(pc) === key(phone));

  // a second family on the computer appears on the phone; deleting it there removes it here
  let fid2 = '';
  on(pc, () => { fid2 = A.addFamily({ name: 'الثانية' }); A.buildChain(['فهد', 'سعد'], { family: 'السعد', me: false }); });
  await pc.sync(); await phone.sync();
  check('a second family made on the computer appears on the phone', !!phone.state.others[fid2] && Object.keys(phone.state.others[fid2].people).length === 2 && phone.state.others[fid2].fname === 'الثانية');
  on(phone, () => A.deleteFamily(fid2));
  await phone.sync(); await pc.sync();
  check('a family deleted on the phone is deleted on the computer', !pc.state.others[fid2] && pc.state.fid !== fid2 && gh.read(M.familyPath(fid2)) === null);
  check('…and the open family is the first one again', pc.state.fid === phone.state.fid && Object.keys(pc.state.people).length > 40);

  // Undo of what arrived: the phone undoes the computer's change; the computer gets it undone too
  on(pc, () => A.editPerson('demom2', { kun: 'أبو زياد' }));
  await pc.sync();
  const before = phone.state;
  await phone.sync();
  check('the change arrives on the phone', phone.state.people.demom2.kun === 'أبو زياد');
  phone.state = before; // what Undo puts back
  await phone.sync(); await pc.sync();
  check('undoing it on the phone undoes it on the computer', pc.state.people.demom2.kun === 'أبو راشد' && phone.state.people.demom2.kun === 'أبو راشد');

  // a device that lost its data never empties the repository
  const lost = dev(defaultState(), 'phone');
  lost.meta.fams = JSON.parse(JSON.stringify(phone.meta.fams)); lost.meta.head = ''; lost.meta.files = null;
  await lost.sync();
  check('a device with no data (lost or erased) takes the family back instead of deleting it', Object.keys(lost.state.people).length === Object.keys(phone.state.people).length && !!gh.read(M.familyPath(phone.state.fid)));

  // a broken or crafted file on GitHub: that family is left alone, nothing is deleted or overwritten
  const path = M.familyPath(phone.state.fid);
  const sha0 = gh.head().files.get(path);
  gh.handle('PUT', `https://api.github.com/repos/${gh.full}/contents/${path}`, { Authorization: 'Bearer ' + gh.token }, JSON.stringify({ message: 'broken', content: Buffer.from('{"app":"nasab","fid":"<script>"').toString('base64'), sha: sha0 }));
  const keep = key(phone);
  on(phone, () => A.editPerson('demor1', { job: 'شيخ' }));
  await phone.sync();
  check('a broken file on GitHub: the family here is kept and not sent over it', Object.keys(phone.state.people).length > 40 && phone.state.people.demor1.job === 'شيخ' && !/شيخ/.test(gh.read(path)));
  void keep;
  // a crafted file: everything checked like any file read from outside
  const crafted = M.fromFile({ app: 'nasab', fid: 'abcd1234', people: { 'bad id': { n: 'x' }, ok12: { n: '<b>علي</b>'.repeat(30), pu: 'zzzz9999', tel: 'javascript:alert(1)' }, ok13: 'nope' }, unions: { u1x2: { h: 'ok12', w: 'ok12' } }, gone: { ok14: 'x', ok15: 1e20, ok16: 5 } });
  check('a crafted file: bad ids dropped, text cut and cleaned, links checked', crafted && Object.keys(crafted.people).join() === 'ok12' && crafted.people.ok12.n.length <= 80 && !crafted.people.ok12.pu && !/[a-z:]/.test(crafted.people.ok12.tel) && Object.keys(crafted.gone).join() === 'ok16');
  check('a file that is not a family is refused', M.fromText('{"fid":"abcd1234"}') === null && M.fromText('not json') === null && M.fromText('{"app":"nasab","fid":"../x"}') === null);

  // photos: sent once, received where missing
  const blobs = { a: new Map(), b: new Map() };
  const store = m => ({ has: async id => m.has(id), get: async id => m.get(id) || null, put: async (id, b) => { m.set(id, b); } });
  const gh2 = fakeGitHub();
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const st = sanitizeState({ ...demoState(), settings: { onboarded: true } });
  st.people.demom2 = { ...st.people.demom2, photo: 'photo1234' };
  blobs.a.set('photo1234', jpeg);
  const p1 = memoryDevice({ state: st, repo: gh2.full, token: gh2.token, fetchFn: gh2.fetch, by: 'phone', photos: store(blobs.a) });
  const p2 = memoryDevice({ state: defaultState(), repo: gh2.full, token: gh2.token, fetchFn: gh2.fetch, by: 'computer', photos: store(blobs.b) });
  await p1.sync(); await p2.sync();
  check('a photo goes with its person', blobs.b.has('photo1234') && Buffer.from(blobs.b.get('photo1234')).equals(Buffer.from(jpeg)) && !!gh2.read(M.photoPath('photo1234')));

  // the wrong key, a public repository, a repository that lost its history
  const bad = memoryDevice({ state: defaultState(), repo: gh.full, token: 'github_pat_WRONG_' + 'y'.repeat(70), fetchFn: gh.fetch, by: 'x' });
  let code = ''; try { await bad.sync(); } catch (e) { code = e.code; }
  eq('a wrong or revoked key is reported as such', code, 'auth');
  const pub = fakeGitHub({ isPrivate: false });
  const { github } = await import('../src/core/github.js');
  check('a public repository is seen as public (the app refuses it)', (await github({ repo: pub.full, token: pub.token, fetchFn: pub.fetch }).info()).private === false);
  const gone = memoryDevice({ state: phone.state, repo: gh2.full, token: gh2.token, fetchFn: gh2.fetch, by: 'x' });
  await gone.sync();
  gh2.repo.commits.length = 0; // as if the repository were emptied or replaced
  code = ''; try { await gone.sync(); } catch (e) { code = e.code; }
  check('a repository that lost its history: an error, and this device keeps everything', code === 'notfound' && Object.keys(gone.state.people).length > 40);

  // the link code shown as a QR code
  const lc = linkCode({ repo: 'm3ath/nasab-data', token: 'github_pat_' + 'A1_'.repeat(28), branch: 'main' });
  const back = readLinkCode(lc);
  check('the link code carries the repository, the branch and the key', back && back.repo === 'm3ath/nasab-data' && back.branch === 'main' && back.token.startsWith('github_pat_'));
  check('anything else is not a link code', readLinkCode('nasab1:@@@') === null && readLinkCode('https://evil.example') === null && readLinkCode(linkCode({ repo: '../x', token: 'github_pat_' + 'a'.repeat(40) })) === null);
  check('a key looks like GitHub\'s', looksLikeToken('github_pat_11ABCDEFG0' + 'x'.repeat(70)) && looksLikeToken('ghp_' + 'a'.repeat(36)) && !looksLikeToken('password123'));
  // the QR code drawn on one screen is read back by the other device's camera code (vendor/qr.js)
  const vm = await import('node:vm');
  const box = {};
  vm.runInNewContext(fs.readFileSync(new URL('../vendor/qr.js', import.meta.url), 'utf8') + ';this.Q = NasabQR;', box);
  const real = linkCode({ repo: 'm3athrazaq/nasab-data', token: 'github_pat_11ABCDE' + 'Zz9_'.repeat(20), branch: 'main' });
  const rows = box.Q.matrix(real), k = 6, q = 4, side = (rows.length + 2 * q) * k;
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = (((y + q) * k + dy) * side + (x + q) * k + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; } }));
  eq('the link\'s QR code reads back as the same link', box.Q.read(px, side, side), real);
});

/* ---------------- Claude edits the family with the tool (one more device) ---------------- */
await section('the tool Claude edits with', async () => {
  const http = await import('node:http');
  const { execFile } = await import('node:child_process');
  const os = await import('node:os');
  const { fakeGitHub } = await import('./fake-github.mjs');
  const { memoryDevice } = await import('../src/core/sync-device.js');
  const M = await import('../src/core/sync-merge.js');
  const gh = fakeGitHub({ owner: 'muaath', name: 'nasab-data' });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { const r = gh.handle(req.method, 'https://api.github.com' + req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const api = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, NASAB_API: api, NASAB_TOKEN: gh.token };
  delete env.HTTPS_PROXY; delete env.https_proxy; delete env.NODE_USE_ENV_PROXY;
  const tool = (...a) => new Promise(ok => execFile(process.execPath, [path.join(ROOT, 'tools/nasab-data.mjs'), gh.full, ...a], { env, timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: String(out), err: String(err) })));
  try {
    // the phone has the family in the repository
    const phone = memoryDevice({ state: sanitizeState({ ...demoState(), settings: { onboarded: true } }), repo: gh.full, token: gh.token, fetchFn: gh.fetch, by: 'phone' });
    await phone.sync();
    const fams = await tool('families');
    check('the tool lists the families in the repository', fams.code === 0 && fams.out.includes(phone.state.fid) && /52 people/.test(fams.out), fams.err || fams.out);
    const found = await tool('find', 'عبدالله بن فهد');
    check('it finds a person by his name and his father\'s', found.code === 0 && found.out.startsWith('demoa4'), found.out + found.err);
    const many = await tool('find', 'محمد');
    check('a name alone that fits several people lists them all', many.out.trim().split('\n').length > 1);
    // an edit script: a son for عبدالله بن محمد, a job for his father
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nasab-tool-'));
    const script = path.join(dir, 'edit.mjs');
    fs.writeFileSync(script, "export default ({ A, find }) => { const a = find('عبدالله بن فهد'); A.addChild(a, { n: 'منصور', g: 'm', b: '2024-02-10' }); A.editPerson(find('محمد بن راشد الراشد'), { job: 'تاجر لؤلؤ' }); };\n");
    const dryRun = await tool('edit', script, '--dry');
    check('a dry run shows the change and sends nothing', dryRun.code === 0 && /منصور/.test(dryRun.out) && /dry run/.test(dryRun.out) && !/منصور/.test(gh.read(`families/${phone.state.fid}.json`)), dryRun.out + dryRun.err);
    const res = await tool('edit', script);
    check('the edit is sent', res.code === 0 && /^sent:/m.test(res.out), res.out + res.err);
    const last = gh.commits()[gh.commits().length - 1];
    check('its commit says Claude did it, and what: ' + last.message, last.message.startsWith('Claude: ') && last.message.includes('منصور'));
    await phone.sync();
    const kid = Object.values(phone.state.people).find(p => p.n === 'منصور');
    const news = phone.news.find(n => n.by === 'claude');
    check('the phone gets Claude\'s edit on its next sync, marked as Claude\'s', kid && phone.state.unions[kid.pu] && phone.state.unions[kid.pu].h === 'demoa4' && phone.state.people.demom2.job === 'تاجر لؤلؤ' && news);
    const amb = path.join(dir, 'amb.mjs');
    fs.writeFileSync(amb, "export default ({ A, find }) => { A.editPerson(find('محمد'), { job: 'x' }); };\n");
    const stopped = await tool('edit', amb);
    check('when a name fits several people the edit stops and nothing is sent', stopped.code !== 0 && /fits \d+ people/.test(stopped.err) && !/"x"/.test(gh.read(`families/${phone.state.fid}.json`)));
    fs.rmSync(dir, { recursive: true, force: true });

    // a clone folder (how a Claude session writes: with git), while a device writes at the same moment
    const { execFileSync } = await import('node:child_process');
    const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nasab-git-'));
    const id = ['-c', 'user.name=T', '-c', 'user.email=t@t'];
    g(root, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
    g(root, 'clone', '-q', 'origin.git', 'device');
    const devDir = path.join(root, 'device'), fid = phone.state.fid, fp = M.familyPath(fid);
    fs.mkdirSync(path.join(devDir, 'families'));
    fs.writeFileSync(path.join(devDir, fp), M.toText({ ...M.familiesOf(phone.state).get(fid), gone: {} }, { by: 'phone' }));
    g(devDir, 'add', '.'); g(devDir, ...id, 'commit', '-q', '-m', 'phone'); g(devDir, 'push', '-q', 'origin', 'HEAD:main');
    g(root, 'clone', '-q', '--depth', '1', 'file://' + path.join(root, 'origin.git'), 'claude');
    const gscript = path.join(root, 'edit.mjs');
    fs.writeFileSync(gscript, `import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
export default ({ A, find }) => {
  A.addChild(find('عبدالله بن فهد'), { n: 'ناصر', g: 'm' });
  // meanwhile the phone writes another change
  const f = ${JSON.stringify(path.join(devDir, fp))};
  const o = JSON.parse(fs.readFileSync(f, 'utf8'));
  o.people.demor1.job = 'نوخذة'; o.people.demor1.upd = Date.now();
  fs.writeFileSync(f, JSON.stringify(o));
  const g = (...a) => execFileSync('git', a, { cwd: ${JSON.stringify(devDir)} });
  g('add', '.'); g('-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'phone again'); g('push', '-q', 'origin', 'HEAD:main');
};
`);
    const gres = await new Promise(ok => execFile(process.execPath, [path.join(ROOT, 'tools/nasab-data.mjs'), path.join(root, 'claude'), 'edit', gscript], { env, timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: String(out), err: String(err) })));
    g(devDir, 'pull', '-q', 'origin', 'main');
    const final = M.fromText(fs.readFileSync(path.join(devDir, fp), 'utf8'));
    const msg = g(devDir, 'log', '-1', '--format=%s');
    check('with a clone folder: a device\'s write meanwhile is merged, then Claude\'s edit is pushed', gres.code === 0 && /merged/.test(gres.err) && final.people.demor1.job === 'نوخذة' && Object.values(final.people).some(p => p.n === 'ناصر') && msg.startsWith('Claude: '), gres.out + gres.err + msg);
    fs.rmSync(root, { recursive: true, force: true });
  } finally { server.close(); }
});

console.log(fails ? `FAIL ${fails} of ${passes + fails} checks` : `PASS all ${passes} checks`);
process.exit(fails ? 1 : 0);
