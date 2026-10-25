// The app's logic without a browser: dates in both calendars, Arabic names, kinship, the tree's data
// model and its repairs, editing and undo, GEDCOM and Excel round trips, and every print (poster in all
// looks and shapes, the family book, the certificate) drawn to PDF and SVG.
//   node tests/core.test.mjs        prints PASS/FAIL lines; exits 1 on any failure
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
// what the bundler defines, and what the Excel module expects to find already loaded
Object.assign(globalThis, { __APP_VERSION__: 'test', __ALLOW_FRAME__: false, __EXCELJS_SRI__: '', __PDF_SRI__: '', __VIEWER_SRI__: '' });
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
const { buildBook } = await import('../src/export/book.js');
const { buildCertificate } = await import('../src/export/certificate.js');
const { sceneToPdf, sceneToSvg } = await import('../src/chart/render.js');
const { POSTER_THEMES } = await import('../src/chart/themes.js');

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

console.log(fails ? `FAIL ${fails} of ${passes + fails} checks` : `PASS all ${passes} checks`);
process.exit(fails ? 1 : 0);
