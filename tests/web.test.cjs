// Browser test of the web app (run by .github/workflows/web.yml, or locally):
//   python3 -m http.server 8765 --bind 127.0.0.1 &
//   NODE_PATH=<folder with playwright> node tests/web.test.cjs
// Prints one PASS/FAIL line per check, and "PASS no JS errors" when no page had a script error.
// Covers: first start from a typed full name, saving across reloads, every screen in Arabic and English
// and all four tree shapes, adding children and Undo, deleting from the tree, the women filter, the order
// of children (the app's, and one father's from his card), names inside the shapes, the table of generations, a second family (new, switch, delete, Undo), a poster from a chosen generation, every export (poster PDF/PNG/SVG, family book,
// certificate, interactive HTML, GEDCOM, Excel backup), restore and GEDCOM import on a "new phone" and as a
// new family,
// broken and crafted files, the PIN lock, offline use, refusing to run inside a frame, and sync between a
// computer and a phone through a private repository (in memory, behind page.route): linking with the key
// and with the link code, an edit arriving with Undo, the undo going back, unlinking.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium, devices } = require('playwright');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765/').replace(/\/?$/, '/');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nasab-test-'));
const KEY = 'nasab.state.v1';
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; };
const jsErrors = [];
let browser;

(async () => {
  const { AR, EN } = await import('../src/core/strings.js');
  const { demoState } = await import('../src/core/demo.js');
  const { sanitizeState } = await import('../src/core/store.js');
  const sample = sanitizeState({ ...demoState(), settings: { onboarded: true } });
  browser = await chromium.launch();
  const open = async ({ state, sw = false, lang } = {}) => {
    const ctx = await browser.newContext({
      ...devices['Pixel 7'], locale: 'ar-KW', timezoneId: 'Asia/Kuwait', acceptDownloads: true, serviceWorkers: sw ? 'allow' : 'block'
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!/framed/.test(e.message)) jsErrors.push(e.message); });
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) jsErrors.push('CSP: ' + m.text()); });
    if (state) {
      const st = JSON.parse(JSON.stringify(state));
      if (lang) st.settings.lang = lang;
      await page.addInitScript(([k, s]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, s); }, [KEY, JSON.stringify(st)]);
    }
    return { ctx, page };
  };
  const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
  const settle = page => page.waitForTimeout(700); // the app saves 250 ms after a change
  const tabs = page => page.locator('nav.tabs').waitFor({ timeout: 20000 });
  const go = (page, route) => page.evaluate(h => { location.hash = h; }, '#/' + route);
  /** click and catch the file the page hands over */
  const download = async (page, click, name, timeout = 120000) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
    const file = path.join(TMP, name);
    await dl.saveAs(file);
    return { file, buf: fs.readFileSync(file), suggested: dl.suggestedFilename() };
  };
  // the family, whatever the ids and order: name, gender, dates and both parents' names for each person
  const family = s => {
    const P = s.people, U = s.unions;
    const parent = (p, r) => (p.pu && U[p.pu] && U[p.pu][r] && P[U[p.pu][r]] ? P[U[p.pu][r]].n : '');
    return Object.values(P).map(p => [p.n, p.g, p.b, p.d, p.dead, parent(p, 'h'), parent(p, 'w')].join('|')).sort().join('\n');
  };
  const { PDFDocument } = require('pdf-lib');
  const pdfPages = buf => PDFDocument.load(buf).then(d => d.getPageCount()).catch(() => 0);

  /* ---------- 1. first start: a full name becomes the trunk of the tree ---------- */
  {
    const { ctx, page } = await open();
    await page.goto(BASE);
    await page.getByText(AR.ob_start, { exact: true }).waitFor({ timeout: 20000 });
    check(true, 'first start shows the welcome screen');
    await page.getByText(AR.ob_start, { exact: true }).click();
    await page.locator('input.nm').first().fill('خالد راشد محمد عبدالله الراشد');
    await page.locator('.chainprev').waitFor({ timeout: 5000 });
    await page.locator('.onb .foot .btn').first().click();
    await tabs(page);
    await settle(page);
    let s = await stored(page);
    const P = s ? s.people : {};
    const me = s && P[s.me];
    const names = [];
    for (let id = s && s.me, i = 0; id && P[id] && i < 10; i++) { names.push(P[id].n); const u = s.unions[P[id].pu]; id = u && u.h; }
    check(me && me.n === 'خالد' && names.join(' ') === 'خالد راشد محمد عبدالله', `the typed name becomes you and your fathers, linked (${names.join(' ')})`);
    check(Object.values(P).some(p => p.n === 'عبدالله' && p.fam === 'الراشد'), 'the family name is kept on the eldest father');
    const shown = await page.evaluate(() => document.querySelector('.tree-title b') && document.querySelector('.tree-title b').textContent);
    check(shown === 'الراشد', `the tree is titled with the family (${shown})`);
    await page.reload();
    await tabs(page);
    s = await stored(page);
    check(s && Object.keys(s.people).length === 4 && s.settings.onboarded, 'everything is still there after closing and reopening');
    await ctx.close();
  }

  /* ---------- 2. every screen, Arabic and English ---------- */
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ state: sample, lang });
    await page.goto(BASE + '#/tree');
    await tabs(page);
    await page.waitForTimeout(800);
    const before = jsErrors.length;
    const routes = ['people', 'person/demok4', 'person/demor1', 'edit/demok4', 'relation', 'relation?a=demoa4&b=demok4', 'stats', 'export',
      'poster', 'book', 'certificate', 'certificate?p=demofy5', 'settings', 'about'];
    const empty = [];
    for (const r of routes) {
      await go(page, r);
      await page.waitForTimeout(['poster', 'book', 'certificate'].some(x => r.startsWith(x)) ? 2500 : 400);
      const text = await page.evaluate(() => (document.querySelector('.screen:not([aria-hidden])') || document.body).innerText.trim().length);
      if (text < 20) empty.push(r);
    }
    check(!empty.length && jsErrors.length === before, `${lang}: all ${routes.length} screens open without errors` + (empty.length ? ' (empty: ' + empty.join(', ') + ')' : ''));
    // the tree in its four shapes
    await go(page, 'tree');
    await page.waitForTimeout(600);
    const shapes = [];
    for (let i = 0; i < 4; i++) {
      await page.locator('.modebar button').nth(i).click();
      await page.waitForTimeout(900);
      shapes.push(await page.evaluate(() => document.querySelectorAll('svg g[data-id], svg [data-id]').length || document.querySelectorAll('.tree svg text').length));
    }
    check(shapes.every(n => n > 5) && jsErrors.length === before, `${lang}: the tree draws as a tree, a list, a canopy and a fan (${shapes.join(', ')})`);
    const rel = await page.evaluate(async () => { location.hash = '#/relation?a=demoa4&b=demok4'; await new Promise(r => setTimeout(r, 500)); return document.body.innerText; });
    check(lang === 'ar' ? rel.includes('ابن عم') : /cousin/i.test(rel), `${lang}: kinship is worked out (cousin)`);
    const dir = await page.evaluate(() => document.documentElement.dir);
    check(dir === (lang === 'ar' ? 'rtl' : 'ltr'), `${lang}: page direction ${dir}`);
    await go(page, 'people');
    await page.waitForTimeout(500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(wide <= 1, `${lang}: nothing wider than the phone screen (${wide}px)`);
    await ctx.close();
  }

  /* ---------- 3. everyday use: children added in one go, Undo, search ---------- */
  {
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/person/demok4');
    await tabs(page);
    await page.getByText(AR.add_children_here, { exact: true }).first().click();
    const rows = page.locator('.addrows input');
    await rows.nth(0).fill('سلمان');
    await rows.nth(1).fill('حصة');
    await page.locator('.sheet .btns .btn:not(.ghost)').click();
    await settle(page);
    let s = await stored(page);
    const kids = Object.values(s.people).filter(p => !sample.people[p.id] && ['سلمان', 'حصة'].includes(p.n));
    const ok = kids.length === 2 && kids.every(p => s.unions[p.pu] && s.unions[p.pu].h === 'demok4' && s.unions[p.pu].w === 'demok4w');
    check(ok, 'two children added at once, under the father and his wife');
    check(kids.find(p => p.n === 'حصة') && kids.find(p => p.n === 'حصة').g === 'f', 'a daughter is recognised from her name');
    await page.getByText(AR.undo, { exact: true }).click();
    await settle(page);
    s = await stored(page);
    check(!Object.values(s.people).some(p => p.n === 'سلمان'), 'Undo takes them back out');
    await go(page, 'people');
    await page.locator('input[type=search], .search input').first().fill('فهد محمد');
    await page.waitForTimeout(500);
    const first = await page.evaluate(() => { const r = document.querySelector('.list .row .title'); return r ? r.textContent : ''; });
    check(/^فهد/.test(first.trim()), `searching "name father" finds him first (${first.trim().slice(0, 30)})`);
    await ctx.close();
  }

  /* ---------- 3b. delete from the tree, women shown or hidden, children order, families ---------- */
  {
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/tree');
    await tabs(page);
    await page.waitForTimeout(900);
    const tap = id => page.evaluate(i => { const g = document.querySelector(`svg g[data-id="${i}"]`); if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!g; }, id);
    // someone added by mistake: delete from the card the tree opens, then Undo
    await tap('demofy5');
    await page.locator('.acts button.danger').click();
    await page.locator('.dialog .btn.red, .dialog .btn.danger').first().click();
    await settle(page);
    let s = await stored(page);
    check(!s.people.demofy5, 'a person is deleted from the card the tree opens');
    await page.getByText(AR.undo, { exact: true }).click();
    await settle(page);
    s = await stored(page);
    check(!!s.people.demofy5, '…and Undo brings him back');
    // women hidden
    await page.locator('.tree-top .iconbtn').nth(1).click();
    await page.locator('.sheet .toggle', { hasText: AR.opt_women }).click();
    await page.waitForTimeout(700);
    const women = await page.evaluate(ids => ids.filter(i => document.querySelector(`svg g[data-id="${i}"]`)).length, Object.values(sample.people).filter(p => p.g === 'f' && p.id !== sample.root).map(p => p.id));
    s = await stored(page);
    check(s.view.women === false && women === 0, `the women filter hides every woman from the tree (${women} left)`);
    // children order: youngest first puts فهد (1940) before راشد (1935), i.e. to his right
    const xOf = id => page.evaluate(i => { const g = document.querySelector(`svg g[data-id="${i}"]`); return g ? g.getBoundingClientRect().x : NaN; }, id);
    const before = (await xOf('demor3')) > (await xOf('demof3'));
    await page.locator('.sheet .seg button', { hasText: AR.kids_young }).click();
    await page.waitForTimeout(700);
    const after = (await xOf('demof3')) > (await xOf('demor3'));
    s = await stored(page);
    check(before && after && s.settings.kidsOrder === 'young', 'children follow the order chosen: eldest first, then youngest first');
    await page.keyboard.press('Escape');
    await page.locator('.sheet .x, .sheet [aria-label="' + AR.close + '"]').first().click().catch(() => {});
    // one father's own order, from his card in the tree, while the app's stays youngest first
    await tap('demom2');
    await page.locator('.acts button', { hasText: AR.act_kids_order }).click();
    await page.locator('.sheet .seg button', { hasText: AR.kids_old }).click();
    await page.waitForTimeout(700);
    s = await stored(page);
    const his = st => Object.values(st.unions).filter(u => u.h === 'demom2');
    const eldest = (await xOf('demor3')) > (await xOf('demof3'));
    check(his(s).length > 0 && his(s).every(u => u.ko === 'old') && s.settings.kidsOrder === 'young' && eldest, 'one father\'s children eldest first, chosen from his card, while the app stays youngest first');
    const firstName = await page.locator('.list.ko .row .title').first().textContent();
    await page.locator('.list.ko').first().locator('.row').nth(1).locator('.iconbtn').first().click();
    await settle(page);
    s = await stored(page);
    const nowFirst = await page.locator('.list.ko .row .title').first().textContent();
    check(his(s).every(u => u.ko === 'manual') && nowFirst !== firstName, `a child moved up by hand (${firstName} → ${nowFirst})`);
    await page.getByRole('button', { name: AR.done, exact: true }).click();
    // a second family from a full name, then back
    await go(page, 'tree');
    await page.locator('.tree-title').click();
    await page.locator('.sheet .btn', { hasText: AR.family_new }).click();
    await page.locator('.onb .row', { hasText: AR.nf_name }).click();
    await page.locator('input.nm').first().fill('هيا سالم ناصر العتيبي');
    await page.locator('.onb .foot .btn').first().click();
    await tabs(page);
    await settle(page);
    s = await stored(page);
    const firstId = Object.keys(s.others)[0];
    check(Object.keys(s.people).length === 3 && s.others[firstId] && Object.keys(s.others[firstId].people).length === 52, 'a new family starts from a full name; the first one waits among the families');
    const title = await page.locator('.tree-title b').textContent();
    check(title === 'العتيبي', `the tree shows the new family (${title})`);
    await page.locator('.tree-title').click();
    await page.locator('.row.fam .famopen', { hasText: 'الراشد' }).click();
    await settle(page);
    s = await stored(page);
    check(Object.keys(s.people).length === 52 && Object.keys(s.others).length === 1, 'switching back to the first family');
    await page.reload();
    await tabs(page);
    s = await stored(page);
    check(Object.keys(s.others).length === 1 && Object.keys(s.people).length === 52, 'both families are still there after reopening the app');
    // delete the second family, then Undo
    await page.locator('.tree-title').click();
    await page.locator('.row.fam', { hasText: 'العتيبي' }).locator('.iconbtn').click();
    await page.locator('.sheet .btn.danger', { hasText: AR.family_delete }).click();
    await page.locator('.dialog .btn.red, .dialog .btn.danger').first().click();
    await settle(page);
    s = await stored(page);
    check(!Object.keys(s.others).length && Object.keys(s.people).length === 52, 'a family is deleted and the open one stays');
    await page.getByText(AR.undo, { exact: true }).click();
    await settle(page);
    s = await stored(page);
    check(Object.keys(s.others).length === 1, '…and Undo brings it back');
    await ctx.close();
  }
  {
    // a poster from the third generation, without women
    const st = JSON.parse(JSON.stringify(sample));
    st.poster = { women: false };
    const { ctx, page } = await open({ state: st });
    await page.goto(BASE + '#/poster');
    await tabs(page);
    await page.waitForTimeout(2500);
    await page.locator('.chips .chip', { hasText: 'الثالث' }).click();
    await page.waitForTimeout(1500);
    const hint = await page.locator('.hint', { hasText: 'الجيل الثالث' }).count();
    const d = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'poster-gen3.pdf');
    check(hint > 0 && d.buf.subarray(0, 5).toString('latin1') === '%PDF-' && (await pdfPages(d.buf)) === 1, `a poster from the third generation, without women (${d.buf.length} bytes)`);
    const s = await stored(page);
    check(s.poster.fromGen === 3 && s.poster.women === false, 'the poster remembers where it starts');
    await ctx.close();
  }
  {
    // each person's name inside his shape, instead of the first letter with the name under it
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/tree');
    await tabs(page);
    await page.waitForTimeout(900);
    const letters = () => page.evaluate(() => [...document.querySelectorAll('svg g[data-id] text')].filter(x => [...x.textContent.trim()].length === 1).length);
    const before = await letters();
    await page.locator('.tree-top .iconbtn').nth(1).click();
    await page.locator('.lookopt', { hasText: AR.look_inside }).click();
    await page.waitForTimeout(800);
    const after = await letters();
    await settle(page);
    let s = await stored(page);
    check(before > 10 && after === 0 && s.view.inside === true, `the names go inside the shapes (${before} first letters → ${after})`);
    await page.keyboard.press('Escape');
    await go(page, 'poster');
    await page.waitForTimeout(2500);
    const chosen = await page.locator('.screen .lookopt[aria-checked="true"]').textContent();
    const d = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'poster-inside.pdf');
    check(chosen.includes(AR.look_inside) && d.buf.subarray(0, 5).toString('latin1') === '%PDF-', 'the poster follows: names inside the shapes');
    await ctx.close();
  }
  {
    // the table of generations (like a family table kept in a spreadsheet): one long page, then A4 pages
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/poster');
    await tabs(page);
    await page.waitForTimeout(2000);
    await page.locator('.seg button', { hasText: AR.mode_g }).click();
    await page.locator(`input[placeholder="${AR.title_by_ph}"]`).fill('سالم');
    await page.waitForTimeout(1800);
    const one = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'table.pdf');
    check(one.buf.subarray(0, 5).toString('latin1') === '%PDF-' && (await pdfPages(one.buf)) === 1, `the table of generations as one long page (${one.buf.length} bytes)`);
    await page.locator('.chips .chip', { hasText: 'A4' }).click();
    await page.locator('.seg button', { hasText: AR.landscape }).click();
    await page.waitForTimeout(1800);
    const told = await page.locator('.hint', { hasText: AR.table_pages.split('{')[0].trim() }).count();
    const a4 = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'table-a4.pdf');
    const n = await pdfPages(a4.buf);
    check(n >= 2 && told > 0, `on A4 the table runs over pages, and says so (${n})`);
    const img = await download(page, () => page.locator('.btns .btn', { hasText: AR.image }).first().click(), 'table.png');
    const [w, h] = [img.buf.readUInt32BE(16), img.buf.readUInt32BE(20)];
    check(img.buf.subarray(1, 4).toString('latin1') === 'PNG' && h > w, `the table as one long image (${w}×${h})`);
    await settle(page);
    const s = await stored(page);
    check(s.poster.layout === 'g' && s.poster.gpaper === 'A4' && s.poster.by === 'سالم', 'the table remembers its paper and who prepared it');
    await ctx.close();
  }

  /* ---------- 4. every export ---------- */
  const xlsx = path.join(TMP, 'backup.xlsx');
  let gedFile = '';
  {
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/poster');
    await tabs(page);
    await page.waitForTimeout(2500);
    let d = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'poster.pdf');
    check(d.buf.subarray(0, 5).toString('latin1') === '%PDF-' && (await pdfPages(d.buf)) === 1 && d.buf.length > 30000, `poster PDF (${d.buf.length} bytes, ${d.suggested})`);
    d = await download(page, () => page.locator('.btns .btn', { hasText: AR.image }).first().click(), 'poster.png');
    check(d.buf.subarray(1, 4).toString('latin1') === 'PNG' && d.buf.length > 50000, `poster image PNG (${d.buf.length} bytes)`);
    d = await download(page, () => page.locator('.btns .btn', { hasText: 'SVG' }).first().click(), 'poster.svg');
    const svg = d.buf.toString('utf8');
    check(svg.startsWith('<svg') && !svg.includes('NaN') && svg.length > 20000, `poster SVG (${d.buf.length} bytes)`);
    for (const theme of [1, 2, 3, 4]) {
      await page.locator('.swatches .swatch').nth(theme).click();
      await page.waitForTimeout(400);
    }
    await go(page, 'book');
    await page.waitForTimeout(2500);
    d = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'book.pdf', 180000);
    const bookPages = await pdfPages(d.buf);
    check(bookPages >= 8, `family book PDF (${bookPages} pages, ${d.buf.length} bytes)`);
    await go(page, 'certificate?p=demofy5');
    await page.waitForTimeout(2500);
    d = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'certificate.pdf');
    check((await pdfPages(d.buf)) === 1, `lineage certificate PDF (${d.buf.length} bytes)`);
    await go(page, 'export');
    await page.waitForTimeout(500);
    d = await download(page, () => page.locator('.excard', { hasText: AR.ex_ged }).click(), 'family.ged', 30000);
    gedFile = d.file;
    const ged = d.buf.toString('utf8');
    check(ged.startsWith('0 HEAD') && ged.includes('1 NAME') && ged.trim().endsWith('0 TRLR'), `GEDCOM file (${ged.split('\n').length} lines)`);
    await page.locator('.excard', { hasText: AR.ex_html }).click();
    d = await download(page, () => page.locator('.sheet .btn.wide').click(), 'tree.html', 30000);
    const html = d.buf.toString('utf8');
    check(html.includes('<!doctype html') && html.includes('NASAB_DATA') && !/"tel"\s*:\s*"[^"]/.test(html), `interactive HTML file (${d.buf.length} bytes, no phone numbers)`);
    check(!html.includes('صُنعت بتطبيق') && !html.includes('Made with Nasab'), 'the interactive file carries no app credit');
    d = await download(page, () => page.getByText(AR.backup_make, { exact: true }).click(), 'backup.xlsx', 60000);
    fs.copyFileSync(d.file, xlsx);
    check(d.buf.subarray(0, 2).toString('latin1') === 'PK' && d.buf.length > 8000, `Excel backup (${d.buf.length} bytes)`);
    await settle(page);
    const s = await stored(page);
    check(s.lastBackup > 0, 'the backup date is remembered');
    await ctx.close();

    // the interactive file works on its own, offline, in any browser
    const v = await open();
    const errs = jsErrors.length;
    await v.page.goto('file://' + path.join(TMP, 'tree.html'));
    await v.page.waitForTimeout(1500);
    const seen = await v.page.evaluate(() => ({ svg: document.querySelectorAll('svg').length, text: document.body.innerText }));
    check(seen.svg > 0 && seen.text.includes('الراشد') && jsErrors.length === errs, 'the interactive file opens by itself and shows the tree');
    const hidden = await v.page.evaluate(() => document.body.innerText.includes('1965'));
    check(!hidden, 'living people\'s dates are hidden in the shared file');
    await v.ctx.close();
  }

  /* ---------- 5. restore on a "new phone" ---------- */
  {
    const { ctx, page } = await open();
    await page.goto(BASE);
    await page.getByText(AR.ob_import, { exact: true }).waitFor({ timeout: 20000 });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(AR.ob_import, { exact: true }).click()]);
    await fc.setFiles(xlsx);
    await page.locator('.sheet').getByText(AR.restore_now, { exact: true }).click({ timeout: 60000 });
    await tabs(page);
    await settle(page);
    const s = await stored(page);
    check(s && family(s) === family(sample), `restore: every person, date and parent comes back (${s && Object.keys(s.people).length} people)`);
    check(s && s.me === sample.me, 'and you are still you');
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    await page.goto(BASE);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(AR.ob_import, { exact: true }).click()]);
    await fc.setFiles(gedFile);
    await page.locator('.sheet').getByText(AR.restore_now, { exact: true }).click({ timeout: 60000 });
    await tabs(page);
    await settle(page);
    const s = await stored(page);
    check(s && family(s) === family(sample), `GEDCOM import: the same family comes back (${s && Object.keys(s.people).length} people)`);
    await ctx.close();
  }

  {
    // a backup added beside the family already open, as a family of its own
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/export');
    await tabs(page);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(AR.restore, { exact: true }).last().click()]);
    await fc.setFiles(xlsx);
    await page.locator('.sheet .btn', { hasText: AR.restore_new_family }).click({ timeout: 60000 });
    await tabs(page);
    await settle(page);
    const s = await stored(page);
    const other = Object.values(s.others)[0];
    check(s && Object.keys(s.others).length === 1 && family(s) === family(sample) && other && family(other) === family(sample), 'restore as a new family: the backup opens beside the family already there');
    await ctx.close();
  }

  /* ---------- 6. broken and crafted files ---------- */
  {
    const { ctx, page } = await open({ state: sample });
    await page.goto(BASE + '#/export');
    await tabs(page);
    await settle(page);
    const before = family(await stored(page));
    const junk = path.join(TMP, 'not-a-backup.xlsx');
    fs.writeFileSync(junk, Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(4000, 7)]));
    let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(AR.restore, { exact: true }).last().click()]);
    await fc.setFiles(junk);
    await page.getByText(AR.e_bad_file).waitFor({ timeout: 30000 });
    const text = path.join(TMP, 'notes.txt');
    fs.writeFileSync(text, 'just some notes, not a family file');
    await page.waitForTimeout(500);
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(AR.restore, { exact: true }).last().click()]);
    await fc.setFiles(text);
    await page.waitForTimeout(1500);
    const sheet = await page.locator('.sheet').count();
    await settle(page);
    check(family(await stored(page)) === before && sheet === 0, 'broken files are refused with a clear message, and nothing changes');
    await ctx.close();
  }
  {
    // a backup edited to carry markup and a formula: imported as plain text, never run
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsx);
    const ws = wb.worksheets.find(w => w.state !== 'hidden' && w.rowCount > 40);
    let col = 0;
    ws.getRow(1).eachCell((c, i) => { if (!col && [AR.x_name, 'الاسم'].includes(String(c.value).trim())) col = i; });
    const payload = '<img src=x onerror="window.__pwned=1">';
    ws.getRow(2).getCell(col || 2).value = payload;
    ws.getRow(3).getCell(col || 2).value = { formula: 'HYPERLINK("https://example.com","x")' };
    const crafted = path.join(TMP, 'crafted.xlsx');
    await wb.xlsx.writeFile(crafted);
    const { ctx, page } = await open();
    await page.goto(BASE);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(AR.ob_import, { exact: true }).click()]);
    await fc.setFiles(crafted);
    await page.locator('.sheet').getByText(AR.restore_now, { exact: true }).click({ timeout: 60000 });
    await tabs(page);
    await go(page, 'people');
    await page.waitForTimeout(1200);
    const pwned = await page.evaluate(() => window.__pwned === 1 || !!document.querySelector('img[src="x"]'));
    const shown = await page.evaluate(p => document.body.innerText.includes(p.slice(0, 12)), payload);
    check(!pwned && shown, 'a backup edited to carry markup shows it as plain text and runs nothing');
    await ctx.close();
  }

  /* ---------- 7. the PIN lock ---------- */
  {
    const salt = 'abcdef0123456789';
    const lock = crypto.createHash('sha256').update(salt + ':' + '2468').digest('hex');
    const st = JSON.parse(JSON.stringify(sample));
    st.settings = { ...st.settings, lock, lockSalt: salt, lockLen: 4 };
    const { ctx, page } = await open({ state: st });
    await page.goto(BASE);
    await page.getByText(AR.pin_enter).waitFor({ timeout: 20000 });
    const hiddenTree = await page.locator('nav.tabs').count();
    for (const d of '1357') await page.locator('.pad3 button', { hasText: d }).click();
    await page.getByText(AR.pin_wrong).waitFor({ timeout: 5000 });
    const still = await page.locator('nav.tabs').count();
    for (const d of '2468') await page.locator('.pad3 button', { hasText: d }).click();
    await tabs(page);
    check(hiddenTree === 0 && still === 0, 'the PIN lock hides the family, a wrong PIN does not open it, the right one does');
    await ctx.close();
  }

  /* ---------- 8. offline (the iPhone web version) ---------- */
  {
    const { ctx, page } = await open({ state: sample, sw: true });
    await page.goto(BASE + '#/tree');
    await tabs(page);
    const cached = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      for (let i = 0; i < 120; i++) {
        const keys = await caches.keys();
        const k = keys.find(x => x.startsWith('nasab-v'));
        if (k) { const n = (await (await caches.open(k)).keys()).length; if (n >= 30) return n; }
        await new Promise(r => setTimeout(r, 500));
      }
      return 0;
    });
    check(cached >= 30, `the web version keeps all its files for offline use (${cached} files)`);
    await ctx.setOffline(true);
    await page.reload();
    await tabs(page);
    await go(page, 'poster');
    await page.waitForTimeout(800);
    const ok = await page.evaluate(async () => {
      const files = ['vendor/pdf.js', 'vendor/exceljs.min.js', 'vendor/viewer.js', 'fonts/pdf/NotoNaskhArabic-Bold.ttf', 'fonts/pdf/ArefRuqaa-Bold.ttf'];
      const rs = await Promise.all(files.map(f => fetch(f).then(r => r.ok).catch(() => false)));
      return rs.every(Boolean) && !!document.querySelector('.screen');
    });
    check(ok, 'it opens and works with no connection (PDF and Excel engines, fonts)');
    const d = await download(page, () => page.locator('.btns .btn', { hasText: 'PDF' }).first().click(), 'offline.pdf');
    check(d.buf.subarray(0, 5).toString('latin1') === '%PDF-', 'a poster PDF can be made offline');
    await ctx.close();
  }

  /* ---------- 10. sync between devices: a computer and a phone, through a private repository ---------- */
  // (the repository is in memory — tests/fake-github.mjs — answering the app's calls to api.github.com)
  {
    const { fakeGitHub } = await import('./fake-github.mjs');
    const gh = fakeGitHub({ owner: 'muaath', name: 'nasab-data' });
    const toGitHub = ctx => ctx.route('https://api.github.com/**', async r => {
      const q = r.request();
      const out = gh.handle(q.method(), q.url(), q.headers(), q.postData() || '');
      await r.fulfill({ status: out.status, headers: out.headers, body: out.body });
    });
    const watch = p => {
      p.on('pageerror', e => jsErrors.push(e.message));
      p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) jsErrors.push('CSP: ' + m.text()); });
    };
    // the computer: first start → "my tree is on another device" → the repository and the key
    const pcCtx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar-KW', timezoneId: 'Asia/Kuwait', serviceWorkers: 'block' });
    await pcCtx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
    await toGitHub(pcCtx);
    const pc = await pcCtx.newPage(); watch(pc);
    await pc.goto(BASE);
    await pc.getByText(AR.ob_link, { exact: true }).click();
    await pc.getByText(AR.sync_enter, { exact: true }).click();
    await pc.locator('input[name="repo"]').fill('https://github.com/' + gh.full);
    await pc.locator('input[name="key"]').fill(gh.token);
    await pc.getByRole('button', { name: AR.sync_link }).click();
    await pc.locator('.linkcode .qr svg').waitFor({ timeout: 15000 });
    check(await pc.locator('.syncstate').innerText().then(x => x.includes(gh.full)), 'the computer links to an empty private repository, and shows the code for the phone');
    await pc.getByRole('button', { name: AR.sync_copy }).click();
    const code = await pc.evaluate(() => navigator.clipboard.readText());
    check(/^nasab1:/.test(code), 'the link code can be copied');
    const ls = await pc.evaluate(() => ({ state: localStorage.getItem('nasab.state.v1') || '', link: localStorage.getItem('nasab.sync.v1') || '' }));
    check(ls.link.includes(gh.token) && !ls.state.includes(gh.token), 'the key is kept apart from the family (never in backups)');

    // the phone: the sample family → Settings → sync → paste the code
    const { ctx: phCtx, page: ph } = await open({ state: sample });
    await toGitHub(phCtx);
    await ph.goto(BASE); await tabs(ph);
    await go(ph, 'settings');
    await ph.locator('.row', { hasText: AR.sync_row_off_sub }).click();
    await ph.getByText(AR.sync_paste, { exact: true }).click();
    await ph.locator('.syncform textarea').fill(code);
    await ph.getByRole('button', { name: AR.sync_link }).click();
    await ph.locator('.syncstate.ok').waitFor({ timeout: 15000 });
    const sent = gh.read(`families/${sample.fid}.json`);
    check(!!sent && JSON.parse(sent).people.demom2 && /^.{0,40}: \{/m.test(sent), 'the phone links with the code and sends its family');

    // the computer receives it (now, instead of within 15 seconds)
    await pc.getByRole('button', { name: AR.sync_now }).click();
    await pc.waitForFunction(k => { const s = JSON.parse(localStorage.getItem(k) || 'null'); return s && Object.keys(s.people).length >= 50 && s.settings.onboarded; }, KEY, { timeout: 15000 });
    await pc.keyboard.press('Escape');
    await tabs(pc);
    check(true, 'the computer receives the family and opens it');

    // an edit on the computer reaches the phone, which can undo it
    await go(pc, 'edit/demom2');
    await pc.getByLabel(AR.job).fill('صاحب سفن');
    await pc.getByRole('button', { name: AR.save }).first().click();
    const t0 = Date.now();
    while (!/صاحب سفن/.test(gh.read(`families/${sample.fid}.json`)) && Date.now() - t0 < 30000) await pc.waitForTimeout(300);
    check(/صاحب سفن/.test(gh.read(`families/${sample.fid}.json`)), 'an edit on the computer is sent within seconds (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    await ph.getByRole('button', { name: AR.sync_now }).click();
    const toastEl = ph.locator('.toast', { hasText: AR.by_computer });
    await toastEl.waitFor({ timeout: 15000 });
    const said = (await toastEl.innerText()).replace(/\s+/g, ' ');
    check(said.includes('عُدّل') && said.includes('محمد'), 'the phone tells what arrived: ' + said.slice(0, 90));
    await settle(ph);
    check((await stored(ph)).people.demom2.job === 'صاحب سفن', 'the phone has the edit');
    await toastEl.getByRole('button', { name: AR.undo }).click();
    await settle(ph);
    check((await stored(ph)).people.demom2.job !== 'صاحب سفن', 'Undo on the phone puts it back');
    await ph.getByRole('button', { name: AR.sync_now }).click();
    const t1 = Date.now();
    while (/صاحب سفن/.test(gh.read(`families/${sample.fid}.json`)) && Date.now() - t1 < 30000) await ph.waitForTimeout(300);
    check(!/صاحب سفن/.test(gh.read(`families/${sample.fid}.json`)), '…and the undo goes back to the repository');
    check(gh.commits().some(c => c.message.startsWith(AR.by_computer + ':')) && gh.commits().some(c => c.message.startsWith(AR.by_phone + ':')), 'each change is a commit that says which device made it');

    // unlink: the family stays, syncing stops
    await ph.getByRole('button', { name: AR.sync_unlink }).click();
    await ph.locator('.dialog .btn.red, .dialog .btn.danger').first().click();
    await settle(ph);
    const after = await ph.evaluate(k => ({ link: localStorage.getItem('nasab.sync.v1'), n: Object.keys(JSON.parse(localStorage.getItem(k)).people).length }), KEY);
    check(!after.link && after.n >= 50, 'unlinking forgets the key and keeps the family');
    await pcCtx.close(); await phCtx.close();
  }

  /* ---------- 9. not inside another site's frame ---------- */
  {
    const { ctx, page } = await open();
    await page.setContent(`<iframe src="${BASE}index.html" style="width:400px;height:600px"></iframe>`);
    await page.waitForTimeout(2500);
    const frame = page.frames().find(f => f !== page.mainFrame());
    const blank = frame ? await frame.evaluate(() => !document.querySelector('nav.tabs') && document.body.innerText.trim() === '').catch(() => true) : false;
    check(blank, 'the app refuses to show inside another site (clickjacking)');
    await ctx.close();
  }

  check(jsErrors.length === 0, jsErrors.length ? 'JS errors: ' + jsErrors.slice(0, 3).join(' | ') : 'no JS errors');
  void EN;
})()
  .catch(e => { console.log('ERROR ' + ((e && e.stack) || e)); failures++; })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exitCode = failures ? 1 : 0;
  });
