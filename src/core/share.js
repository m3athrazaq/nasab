// The view link for relatives: every family, without phone numbers and emails, encrypted with a key that
// exists only in the link (after "#" — a browser never sends that part to any server). The encrypted copy is
// kept in a public repository (anyone may download it; nobody can read it without the link); view.html, on
// the app's site, opens it. The key and the repository are in share.json in the user's private repository,
// so every linked device (and Claude's tool) keeps the copy up to date.
//
// The same family always gives the very same file (the IV comes from the content), so any device can tell
// whether the copy is current from the file's id alone, and two devices never overwrite each other.
import { stable, familiesOf, gitBlobSha } from './sync-merge.js';
import { REPO_RE, linkCode } from './github.js';
import { ID_RE, PERSON_FIELDS } from './store.js';

export const SHARE_PATH = 'tree.bin';
export const SHARE_CONFIG = 'share.json';
export const APP_URL = 'https://m3athrazaq.github.io/nasab/';
export const VIEW_URL = APP_URL + 'view.html';
/** the app link for relatives: the app itself, linked to the private repository with the key after "#"
 *  (the part of a link the browser never sends anywhere); the app takes it out of the address bar at once */
export const appLink = c => APP_URL + '#' + linkCode(c);
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
// only what the view page shows: never phone numbers or emails, and nothing it does not show either
// (residence, education, nicknames) — whoever has the link can read everything in the file
const P_KEEP = ['n', 'g', 'fam', 'b', 'bp', 'd', 'dp', 'dead', 'job', 'note', 'photo', 'pu', 'ord', 'at'];
const U_KEEP = ['h', 'w', 'st', 'md', 'ed', 'ord', 'ko'];
const PHOTO_BUDGET = 4 * 1024 * 1024;
const MAGIC = [0x4e, 0x53, 0x42, 0x31]; // "NSB1"
const enc = new TextEncoder(), dec = new TextDecoder();

export function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(s) {
  const b = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** a new key for the link (256 random bits) */
export const newShareKey = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

/* ---------- share.json ---------- */
const CFG_KEYS = { lang: ['ar', 'en'], digits: ['latn', 'arab'], cal: ['entered', 'g', 'h'], style: ['bin', 'plain'], kidsOrder: ['old', 'young', 'manual'] };
function cleanCfg(c) {
  const o = {};
  for (const [k, ok] of Object.entries(CFG_KEYS)) o[k] = c && ok.includes(c[k]) ? c[k] : ok[0];
  o.mercy = !!(c && c.mercy);
  o.both = !c || c.both !== false;
  o.living = !c || c.living !== false; // dates of the living shown (the user's choice when the link was made)
  o.notes = !c || c.notes !== false;
  return o;
}
/** share.json read from the private repository → { repo, key, path, cfg } or null */
export function readShareConfig(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || o.v !== 1 || !REPO_RE.test(o.repo || '') || !KEY_RE.test(o.key || '')) return null;
  return { repo: o.repo, key: o.key, path: SHARE_PATH, cfg: cleanCfg(o.cfg) };
}
export const shareConfigText = c => JSON.stringify({ v: 1, repo: c.repo, key: c.key, cfg: cleanCfg(c.cfg) }, null, 2) + '\n';

/* ---------- the link ---------- */
export const viewLink = c => `${VIEW_URL}#${c.repo}/${c.key}`;
/** "#owner/repo/key" (optionally "/2": the family to open) → { repo, key, fam } or null */
export function parseViewHash(hash) {
  const m = String(hash || '').replace(/^#/, '').match(/^([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\/([A-Za-z0-9_-]{43})(?:\/(\d{1,2}))?$/);
  return m && REPO_RE.test(m[1]) ? { repo: m[1], key: m[2], fam: m[3] ? +m[3] : -1 } : null;
}

/* ---------- what the relatives see ---------- */
/**
 * every family with people in it, without phone numbers and emails, and the photos as they are stored
 * (the same bytes on every device). photoBytes(id) → Uint8Array or null (async).
 * → { text, missing }: missing = photos this device does not have yet (then wait: another device's copy
 * would have them, and the two would replace each other)
 */
export async function sharePayload(state, cfg, photoBytes = null) {
  const fams = [...familiesOf(state).values()].filter(f => Object.keys(f.people).length).sort((a, b) => (a.fid < b.fid ? -1 : 1));
  const out = { v: 1, cfg: cleanCfg(cfg), fams: [], photos: {} };
  const photoIds = new Set();
  for (const f of fams) {
    const people = {}, unions = {};
    for (const [id, p] of Object.entries(f.people)) {
      const o = {};
      for (const k of P_KEEP) { const v = p[k]; if (v !== '' && v !== false && v != null && v !== 0) o[k] = v; }
      if (!out.cfg.notes) delete o.note;
      people[id] = o;
      if (p.photo) photoIds.add(p.photo);
    }
    for (const [id, u] of Object.entries(f.unions)) {
      const o = {};
      for (const k of U_KEEP) { const v = u[k]; if (v !== '' && v != null && v !== 0) o[k] = v; }
      unions[id] = o;
    }
    out.fams.push({ fid: f.fid, fname: f.fname || '', root: f.root || '', me: f.me || '', people, unions });
  }
  const missing = [];
  let size = 0;
  if (photoBytes) {
    for (const id of [...photoIds].sort()) {
      const b = await photoBytes(id);
      if (!b) { missing.push(id); continue; }
      if (size + b.length > PHOTO_BUDGET) continue;
      size += b.length;
      out.photos[id] = b64(b);
    }
  }
  return { text: stable(out), missing };
}

/** the payload back as states the app's code reads (records with every field), and the photos */
export function readPayload(text) {
  const o = JSON.parse(text);
  if (!o || o.v !== 1 || !Array.isArray(o.fams)) throw new Error('payload');
  const fams = o.fams.map(f => {
    const people = {}, unions = {};
    for (const [id, p] of Object.entries(f.people || {})) {
      if (!ID_RE.test(id)) continue;
      const r = { id };
      for (const k of PERSON_FIELDS.concat(['at'])) {
        const v = P_KEEP.includes(k) ? p[k] : null;
        r[k] = v == null ? (k === 'dead' ? false : k === 'ord' || k === 'at' ? 0 : '') : v;
      }
      r.dead = !!r.dead || !!r.d;
      people[id] = r;
    }
    for (const [id, u] of Object.entries(f.unions || {})) {
      if (!ID_RE.test(id)) continue;
      unions[id] = { id, h: u.h || '', w: u.w || '', st: u.st || 'm', md: u.md || '', ed: u.ed || '', ord: u.ord || 0, ko: u.ko || '', note: '' };
    }
    return { fid: f.fid, fname: f.fname || '', root: f.root || '', me: f.me || '', people, unions };
  });
  return { cfg: cleanCfg(o.cfg), fams, photos: o.photos || {} };
}

/* ---------- encryption ---------- */
async function keysOf(keyB64) {
  const raw = await crypto.subtle.importKey('raw', unb64url(keyB64), 'HKDF', false, ['deriveKey']);
  const derive = (info, alg, usage) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, raw, alg, false, usage);
  return {
    aes: await derive('nasab-share/aes', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
    mac: await derive('nasab-share/iv', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign'])
  };
}
/** the file kept in the public repository: "NSB1" + IV + AES-GCM(the payload) */
export async function sealShare(keyB64, text) {
  const k = await keysOf(keyB64);
  const data = enc.encode(text);
  const iv = new Uint8Array(await crypto.subtle.sign('HMAC', k.mac, data)).slice(0, 12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.aes, data));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(MAGIC); out.set(iv, 4); out.set(ct, 16);
  return out;
}
/** the payload back (throws when the key is not this file's) */
export async function openShare(keyB64, bytes) {
  if (!bytes || bytes.length < 32 || MAGIC.some((m, i) => bytes[i] !== m)) throw new Error('not a view file');
  const k = await keysOf(keyB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(4, 16) }, k.aes, bytes.slice(16));
  return dec.decode(pt);
}

/** the settings the view page shows the family with (fixed when the link is made, so every device
 *  writes the very same copy) */
export function shareCfgFrom(settings, extra = {}) {
  const st = settings || {};
  return cleanCfg({ lang: st.lang, digits: st.digits, cal: st.cal, both: st.both, style: st.style, mercy: st.mercy, kidsOrder: st.kidsOrder, living: true, notes: true, ...extra });
}

/**
 * keep the public copy current. gh: the public repository's calls (github.js, after info()).
 * Nothing is written when the copy there is already this one. → { sent, sha }
 */
export async function publishShare({ gh, config, text, message = 'نَسَب: نسخة المشاهدة' }) {
  const bytes = await sealShare(config.key, text);
  const sha = await gitBlobSha(bytes);
  const h = await gh.head('');
  const cur = h.empty ? '' : (await gh.tree(h.sha)).files.get(config.path || SHARE_PATH) || '';
  if (cur === sha) return { sent: false, sha };
  const r = await gh.put(config.path || SHARE_PATH, bytes, message, cur);
  return { sent: true, sha: r.sha };
}
