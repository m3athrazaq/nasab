// The shared tree as one HTML file: the viewer (vendor/viewer.js) and the family's data in one page that
// opens in any browser. Phone numbers and emails are never included; dates of the living and photos only
// if the user wants.
import { buildIndex } from '../core/model.js';
import { lang, fmtDate, lifeYears, t } from '../core/i18n.js';
import { lineageText, initial, mercy } from '../core/names.js';
import { bufToB64, esc } from '../core/util.js';
import { photoJpegBytes } from '../core/photos.js';
import { defaultTitles } from './poster.js';

export async function exportHtml(s, { photos = true, hideLiving = true, notes = true, dKids = false } = {}) {
  const ix = buildIndex(s);
  const root = s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me);
  if (!root) throw new Error('empty');
  const L = lang.value;
  const people = {};
  for (const [id, p] of Object.entries(ix.P)) {
    const dead = !ix.living(id);
    const show = !(hideLiving && !dead);
    const mw = dead && L === 'ar' && s.settings.mercy ? mercy(p.g) : '';
    people[id] = {
      n: p.n, g: p.g, i: initial(p.n || '؟'), pu: p.pu, o: p.ord || 0, at: p.at, fam: p.fam,
      dead, y: show ? lifeYears(p, dead && !p.d ? mw : '') : (dead ? mw : ''), mercy: mw,
      bk: show ? p.b : '', dk: p.d,
      b: show ? fmtDate(p.b) : '', d: fmtDate(p.d), bp: show ? p.bp : '', dp: p.dp, job: p.job,
      lin: lineageText(ix.paternalLine(id, 5).map(x => ix.P[x].n || '؟'), { gender: p.g, style: s.settings.style, family: ix.familyOf(id), lang: L }),
      note: notes ? p.note : ''
    };
    if (photos && p.photo) {
      const bytes = await photoJpegBytes(p.photo, 160).catch(() => null);
      if (bytes) people[id].ph = 'data:image/jpeg;base64,' + bufToB64(bytes);
    }
  }
  const unions = {};
  for (const [id, u] of Object.entries(ix.U)) unions[id] = { id, h: u.h, w: u.w, st: u.st, md: u.md, ord: u.ord };
  const titles = defaultTitles(ix, root);
  const data = { v: 1, lang: L, title: (titles.head ? titles.head + ' ' : '') + titles.title, sub: titles.sub, root, me: '', dKids, people, unions };
  const viewer = await fetch('vendor/viewer.js', { cache: 'force-cache', integrity: __VIEWER_SRI__ }).then(r => { if (!r.ok) throw new Error('viewer'); return r.text(); });
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = TEMPLATE
    .replace('%LANG%', L).replace('%DIR%', L === 'ar' ? 'rtl' : 'ltr').replace('%TITLE%', esc(data.title))
    .replace('/*DATA*/', () => 'window.NASAB_DATA=' + json + ';')
    .replace('/*VIEWER*/', () => viewer.replace(/<\/script/gi, '<\\/script'));
  return { blob: new Blob([html], { type: 'text/html' }), title: data.title, size: html.length, t };
}

const TEMPLATE = `<!doctype html>
<html lang="%LANG%" dir="%DIR%"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>%TITLE%</title>
<style>
:root{--paper:#EEF0EC;--sheet:#fff;--ink:#231C17;--ink2:#5E554D;--ink3:#8C847B;--rule:#DADCD5;--red:#A3271F;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#16110E;--sheet:#211A16;--ink:#EFE7DC;--ink2:#BDB2A5;--ink3:#8E8478;--rule:#352C26;--red:#F07065}}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
header{position:fixed;top:0;inset-inline:0;z-index:5;padding:calc(env(safe-area-inset-top) + 10px) 14px 10px;background:linear-gradient(var(--paper) 70%,transparent)}
h1{margin:0;font-family:"Noto Naskh Arabic","Geeza Pro","Traditional Arabic",Georgia,serif;font-size:24px;line-height:1.3}
#sub{margin:2px 0 8px;color:var(--ink2);font-size:13px}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#q{flex:1;min-width:160px;height:42px;border-radius:12px;border:1.5px solid var(--rule);background:var(--sheet);color:var(--ink);padding:0 12px;font-size:16px}
.bar button{height:42px;border-radius:12px;border:1.5px solid var(--rule);background:var(--sheet);color:var(--ink2);padding:0 12px;font-size:14px}
.bar button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
#res{position:fixed;z-index:6;top:130px;inset-inline:14px;max-height:50vh;overflow:auto;background:var(--sheet);border-radius:14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.4);padding:6px}
#res button{display:block;width:100%;text-align:start;border:0;background:none;padding:10px;font-size:16px;color:var(--ink);border-radius:8px;font-family:"Noto Naskh Arabic","Geeza Pro",serif}
#res p{padding:10px;margin:0;color:var(--ink3)}
#tree{position:fixed;inset:0;touch-action:none;user-select:none;-webkit-user-select:none}
#panel{position:fixed;z-index:7;bottom:0;inset-inline:0;max-height:62vh;overflow:auto;background:var(--sheet);border-radius:20px 20px 0 0;box-shadow:0 -10px 40px -16px rgba(0,0,0,.5);padding:16px 16px calc(env(safe-area-inset-bottom) + 16px);max-width:680px;margin:0 auto}
.ph{display:flex;gap:12px;align-items:center}.ph img,.seal{width:56px;height:56px;border-radius:14px;object-fit:cover;flex:none}
.seal{display:grid;place-items:center;border:2px solid var(--red);color:var(--red);font:700 26px "Noto Naskh Arabic","Geeza Pro",serif}.seal.f,.ph img.f{border-radius:50%}
.ph h2{margin:0;font-family:"Noto Naskh Arabic","Geeza Pro",serif;font-size:22px}.lin{margin:2px 0 0;color:var(--ink2);font-family:"Noto Naskh Arabic","Geeza Pro",serif}
.ph .x{margin-inline-start:auto;width:40px;height:40px;border-radius:50%;border:0;background:var(--paper);color:var(--ink);font-size:16px}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:14px 0 0}dt{color:var(--ink3);font-size:14px}dd{margin:0;font-size:15px}
.lk{border:0;background:var(--paper);color:var(--ink);border-radius:10px;padding:3px 10px;margin:2px;font:700 15px "Noto Naskh Arabic","Geeza Pro",serif}
.note{white-space:pre-wrap;line-height:1.9;font-family:"Noto Naskh Arabic","Geeza Pro",serif;border-top:1px solid var(--rule);padding-top:10px}
#made{position:fixed;bottom:calc(env(safe-area-inset-bottom) + 8px);inset-inline-start:12px;font-size:11px;color:var(--ink3);z-index:4}
</style></head><body>
<div id="tree"></div>
<header><h1 id="title"></h1><p id="sub"></p><div class="bar"><input id="q" type="search" autocomplete="off"><button data-mode="v" aria-pressed="true"></button><button data-mode="h" aria-pressed="false"></button><button id="fit"></button></div></header>
<div id="res" hidden></div><div id="panel" hidden></div><div id="made"></div>
<script>/*DATA*/</script>
<script>/*VIEWER*/</script>
</body></html>`;
