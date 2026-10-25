// GEDCOM 5.5.1 — the common language of family-tree programs (Ancestry, MyHeritage, FamilySearch,
// Gramps, MacFamilyTree…). Export everything; import a file from any of them.
// Hijri dates are written as their Gregorian equivalent (exact for full dates, "ABT" otherwise) and kept
// in a private _HDATE line, so a file from this app comes back exactly.
import { parseD, convertD, makeD, rangeD, jdnToG } from '../core/dates.js';
import { parseChain, cleanName } from '../core/names.js';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** a stored date → GEDCOM DATE text (Gregorian), plus the original when it was Hijri */
export function gedDate(s) {
  const p = parseD(s);
  if (!p) return { date: '', hijri: '' };
  let g = p;
  if (p.cal === 'h') {
    const c = convertD(s);
    if (c && c.exact) g = { cal: 'g', y: c.y, m: c.m, d: c.d, approx: p.approx };
    else {
      const r = rangeD({ ...p, approx: false });
      const mid = jdnToG(Math.round((r[0] + r[1]) / 2));
      g = { cal: 'g', y: mid.y, m: p.m ? mid.m : 0, d: 0, approx: true };
    }
  }
  const body = (g.d ? g.d + ' ' : '') + (g.m ? MON[g.m - 1] + ' ' : '') + g.y;
  return { date: (g.approx ? 'ABT ' : '') + body, hijri: p.cal === 'h' ? s : '' };
}
/** GEDCOM DATE text → stored date ('' when it cannot be read) */
export function readGedDate(v) {
  let s = String(v || '').toUpperCase().trim();
  if (!s) return '';
  let approx = false;
  s = s.replace(/@#D[A-Z ]+@\s*/g, ' ').trim();
  let m = /^(?:BET|FROM)\s+(.+?)\s+(?:AND|TO)\s+(.+)$/.exec(s);
  if (m) { s = m[1]; approx = true; }
  m = /^(ABT|EST|CAL|BEF|AFT|INT|ABOUT|CIRCA|C\.)\s+(.+)$/.exec(s);
  if (m) { approx = true; s = m[2]; }
  s = s.replace(/\(.*\)/g, '').trim();
  m = /^(?:(\d{1,2})\s+)?(?:([A-Z]{3,4})\s+)?(\d{3,4})(?:\/\d+)?$/.exec(s);
  if (!m) {
    const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
    if (iso) return makeD({ cal: 'g', y: +iso[1], m: +iso[2], d: iso[3] ? +iso[3] : 0, approx });
    return '';
  }
  const mon = m[2] ? MON.indexOf(m[2].slice(0, 3)) + 1 : 0;
  if (m[2] && !mon) return makeD({ cal: 'g', y: +m[3], approx: true });
  return makeD({ cal: 'g', y: +m[3], m: mon, d: mon && m[1] ? +m[1] : 0, approx });
}

/* ---------------- export ---------------- */
function lines(level, tag, value) {
  // long text: CONT for new lines, CONC to keep each line under 200 characters
  const out = [];
  const parts = String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n');
  parts.forEach((part, i) => {
    const chunks = [];
    let rest = part;
    while (rest.length > 200) { chunks.push(rest.slice(0, 200)); rest = rest.slice(200); }
    chunks.push(rest);
    chunks.forEach((c, k) => {
      if (i === 0 && k === 0) out.push(`${level} ${tag}${c !== '' ? ' ' + c : ''}`);
      else out.push(`${level + 1} ${k === 0 ? 'CONT' : 'CONC'}${c !== '' ? ' ' + c : ''}`);
    });
  });
  return out;
}
export function exportGedcom(ix, s, { appVersion = '1.0.0', now = new Date() } = {}) {
  const P = ix.P, U = ix.U;
  const iid = new Map(Object.keys(P).map((id, i) => [id, '@I' + (i + 1) + '@']));
  const fid = new Map(Object.keys(U).map((id, i) => [id, '@F' + (i + 1) + '@']));
  const out = [];
  const d = now;
  out.push('0 HEAD', '1 SOUR NASAB', '2 NAME Nasab', `2 VERS ${appVersion}`, `1 DATE ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`,
    '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', `1 LANG ${s.settings.lang === 'ar' ? 'Arabic' : 'English'}`, '1 SUBM @SUB1@', '0 @SUB1@ SUBM', '1 NAME Nasab');
  const event = (tag, date, place, flagY) => {
    const g = gedDate(date);
    if (!g.date && !place && !flagY) return;
    out.push(`1 ${tag}${!g.date && !place && flagY ? ' Y' : ''}`);
    if (g.date) out.push(`2 DATE ${g.date}`);
    if (g.hijri) out.push(`2 _HDATE ${g.hijri}`);
    if (place) out.push(...lines(2, 'PLAC', place));
  };
  for (const id of Object.keys(P)) {
    const p = P[id];
    const fam = ix.familyOf(id);
    out.push(`0 ${iid.get(id)} INDI`);
    out.push(`1 NAME ${p.n || ''}${fam ? ' /' + fam + '/' : ''}`);
    if (p.n) out.push(`2 GIVN ${p.n}`);
    if (fam) out.push(`2 SURN ${fam}`);
    if (p.nick) out.push(`2 NICK ${p.nick}`);
    if (p.g) out.push(`1 SEX ${p.g === 'f' ? 'F' : 'M'}`);
    event('BIRT', p.b, p.bp);
    if (!ix.living(id)) event('DEAT', p.d, p.dp, true);
    if (p.job) out.push(...lines(1, 'OCCU', p.job));
    if (p.edu) out.push(...lines(1, 'EDUC', p.edu));
    if (p.res) { out.push('1 RESI'); out.push(...lines(2, 'PLAC', p.res)); }
    if (p.tel) out.push(`1 PHON ${p.tel}`);
    if (p.mail) out.push(`1 EMAIL ${p.mail}`);
    if (p.note) out.push(...lines(1, 'NOTE', p.note));
    if (p.fam) out.push(`1 _FAMNAME ${p.fam}`);
    if (p.kun) out.push(`1 _KUNYA ${p.kun}`);
    if (p.laq) out.push(`1 _LAQAB ${p.laq}`);
    if (p.ord) out.push(`1 _ORDER ${p.ord}`);
    out.push(`1 _NASAB_ID ${id}`);
    if (p.pu && fid.has(p.pu)) out.push(`1 FAMC ${fid.get(p.pu)}`);
    for (const u of ix.unions(id)) out.push(`1 FAMS ${fid.get(u)}`);
  }
  for (const id of Object.keys(U)) {
    const u = U[id];
    out.push(`0 ${fid.get(id)} FAM`);
    if (u.h && iid.has(u.h)) out.push(`1 HUSB ${iid.get(u.h)}`);
    if (u.w && iid.has(u.w)) out.push(`1 WIFE ${iid.get(u.w)}`);
    for (const c of ix.childrenOfUnion(id)) out.push(`1 CHIL ${iid.get(c)}`);
    const g = gedDate(u.md);
    if (g.date || (u.h && u.w)) { out.push('1 MARR' + (g.date ? '' : ' Y')); if (g.date) out.push(`2 DATE ${g.date}`); if (g.hijri) out.push(`2 _HDATE ${g.hijri}`); }
    if (u.st === 'd') { const e = gedDate(u.ed); out.push('1 DIV' + (e.date ? '' : ' Y')); if (e.date) out.push(`2 DATE ${e.date}`); if (e.hijri) out.push(`2 _HDATE ${e.hijri}`); }
    if (u.ord) out.push(`1 _ORDER ${u.ord}`);
    if (u.note) out.push(...lines(1, 'NOTE', u.note));
    out.push(`1 _NASAB_ID ${id}`);
  }
  out.push('0 TRLR');
  return out.join('\r\n') + '\r\n';
}

/* ---------------- import ---------------- */
export class GedcomError extends Error { constructor(code) { super(code); this.code = code; } }
/** reads GEDCOM text → { raw (for sanitizeState), counts } */
export function importGedcom(text) {
  const src = String(text || '').replace(/^﻿/, '');
  if (!/^\s*0\s+HEAD/m.test(src.slice(0, 2000))) throw new GedcomError('not_gedcom');
  const recs = [];
  const stack = [];
  for (const raw of src.split(/\r\n|\r|\n/)) {
    const m = /^\s*(\d+)\s+(@[^@]+@\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/.exec(raw);
    if (!m) continue;
    const level = +m[1];
    const node = { level, xref: m[2] ? m[2].trim() : '', tag: m[3].toUpperCase(), value: m[4] != null ? m[4] : '', kids: [] };
    if (node.tag === 'CONT' || node.tag === 'CONC') {
      const parent = stack[level - 1];
      if (parent) parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value;
      continue;
    }
    stack.length = level;
    if (level === 0) recs.push(node);
    else if (stack[level - 1]) stack[level - 1].kids.push(node);
    stack[level] = node;
    if (recs.length > 200000) break;
  }
  const kid = (n, tag) => n.kids.find(k => k.tag === tag);
  const val = (n, tag) => { const k = kid(n, tag); return k ? String(k.value || '').trim() : ''; };
  const people = [], unions = [];
  const famOfIndi = new Map(); // xref → raw person
  for (const r of recs) {
    if (r.tag !== 'INDI') continue;
    const nameNode = kid(r, 'NAME');
    let given = '', surname = '';
    if (nameNode) {
      given = val(nameNode, 'GIVN');
      surname = val(nameNode, 'SURN');
      const nm = /^([^/]*)(?:\/([^/]*)\/)?(.*)$/.exec(nameNode.value || '');
      if (!given && nm) given = (nm[1] || '').trim();
      if (!surname && nm) surname = (nm[2] || '').trim();
    }
    const ev = tag => {
      const e = kid(r, tag);
      if (!e) return null;
      const hd = val(e, '_HDATE');
      return { date: hd && parseD(hd) ? hd : readGedDate(val(e, 'DATE')), place: val(e, 'PLAC'), y: /^Y/i.test(String(e.value || '')) };
    };
    const b = ev('BIRT') || ev('CHR') || ev('BAPM'), d = ev('DEAT') || ev('BURI');
    const resi = kid(r, 'RESI');
    const person = {
      id: val(r, '_NASAB_ID') || r.xref, gxref: r.xref,
      n: cleanName(given), fullGiven: cleanName(given), surname: cleanName(surname), g: /^F/i.test(val(r, 'SEX')) ? 'f' : /^M/i.test(val(r, 'SEX')) ? 'm' : '',
      fam: val(r, '_FAMNAME'), kun: val(r, '_KUNYA'), laq: val(r, '_LAQAB'), nick: nameNode ? val(nameNode, 'NICK') : '', ord: +val(r, '_ORDER') || 0,
      b: b ? b.date : '', bp: b ? b.place : '', d: d ? d.date : '', dp: d ? d.place : '', dead: !!d,
      job: val(r, 'OCCU'), edu: val(r, 'EDUC'), res: resi ? (val(resi, 'PLAC') || String(resi.value || '').trim()) : '',
      tel: val(r, 'PHON'), mail: val(r, 'EMAIL') || val(r, '_EMAIL'),
      note: r.kids.filter(k => k.tag === 'NOTE' && !/^@.*@$/.test(String(k.value || '').trim())).map(k => k.value).join('\n\n'),
      famc: r.kids.filter(k => k.tag === 'FAMC').map(k => String(k.value || '').trim())
    };
    famOfIndi.set(r.xref, person);
    people.push(person);
  }
  for (const r of recs) {
    if (r.tag !== 'FAM') continue;
    const h = val(r, 'HUSB'), w = val(r, 'WIFE');
    const marr = kid(r, 'MARR'), div = kid(r, 'DIV');
    const hd = marr ? val(marr, '_HDATE') : '', ed = div ? val(div, '_HDATE') : '';
    const u = {
      id: val(r, '_NASAB_ID') || r.xref, gxref: r.xref,
      h: famOfIndi.has(h) ? famOfIndi.get(h).id : '', w: famOfIndi.has(w) ? famOfIndi.get(w).id : '',
      md: marr ? (hd && parseD(hd) ? hd : readGedDate(val(marr, 'DATE'))) : '', st: div ? 'd' : 'm', ed: div ? (ed && parseD(ed) ? ed : readGedDate(val(div, 'DATE'))) : '',
      ord: +val(r, '_ORDER') || 0, note: r.kids.filter(k => k.tag === 'NOTE').map(k => k.value).join('\n')
    };
    unions.push(u);
    for (const c of r.kids.filter(k => k.tag === 'CHIL')) {
      const p = famOfIndi.get(String(c.value || '').trim());
      if (p && !p.pu) p.pu = u.id;
    }
  }
  // a child listed under FAMC but not under the family's CHIL
  const byX = new Map(unions.map(u => [u.gxref, u]));
  for (const p of people) if (!p.pu && p.famc.length && byX.has(p.famc[0])) p.pu = byX.get(p.famc[0]).id;
  // names: the family name on the founders only (it is inherited); Arabic given names that repeat the
  // father's name ("خالد راشد") keep the first name only
  const byId = new Map(people.map(p => [p.id, p]));
  const uById = new Map(unions.map(u => [u.id, u]));
  const fatherOf = p => { const u = p.pu && uById.get(p.pu); return u && u.h ? byId.get(u.h) : null; };
  for (const p of people) {
    const f = fatherOf(p);
    if (!p.fam && p.surname && (!f || f.surname !== p.surname)) p.fam = p.surname;
    if (p.fam && f && (f.fam === p.fam || f.surname === p.fam)) p.fam = '';
    const ch = parseChain(p.fullGiven, false).names;
    if (ch.length > 1 && f) {
      const fn = parseChain(f.fullGiven, false).names[0];
      if (fn && cleanName(ch[1]) === cleanName(fn)) p.n = ch[0];
    }
  }
  for (const p of people) { delete p.fullGiven; delete p.surname; delete p.famc; delete p.gxref; }
  for (const u of unions) delete u.gxref;
  return { raw: { people, unions }, counts: { people: people.length, unions: unions.length } };
}
