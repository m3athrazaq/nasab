// One round of sync between this device and the user's private repository — the same code in the app,
// in its tests and in the tool Claude edits the family with. The caller gives:
//   gh            the GitHub calls (github.js)
//   meta          what the last round left (emptyMeta() the first time); updated in place, the caller saves it
//   getState()    the app's state now; applyFamilies(apply, news) changes it (one undoable step)
//   by            who writes ("computer", "phone", "iphone", "claude"); message(info) → a commit message
//   photos        { has(id), get(id) → bytes, put(id, bytes) } (optional)
//   dirty         false when nothing changed here since the last round (skips the work when nothing moved)
// A round: is there anything new (one cheap request) → read the families that changed → merge them with
// this device's (sync-merge.js) → change this device → send what is new from here, each file refused by
// GitHub if it changed meanwhile (then the round runs again) → photos, a few at a time.
import { familiesOf, planSync, toText, fromText, familyPath, photoPath, FAMILY_RE } from './sync-merge.js';
import { GitHubError } from './github.js';

export const emptyMeta = () => ({ head: '', etag: '', heads: [], fams: {}, files: null });
const PHOTO_UP = 8, PHOTO_DOWN = 24, PHOTO_MAX = 6 * 1024 * 1024;
const isJpeg = b => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

export async function syncRound(env, { trustRemote = false } = {}) {
  const { gh, meta } = env;
  const enc = new TextEncoder(), dec = new TextDecoder();
  meta.heads = meta.heads || [];
  // 1. has the repository moved since the last round?
  const h = await gh.head(meta.files ? meta.etag : '');
  let files, headSha;
  if (h.empty) {
    // a repository that had our files cannot become empty: refuse rather than take it as "everything deleted"
    if (meta.head || Object.keys(meta.fams).length) throw new GitHubError('notfound', 404, 'the repository has no history now');
    files = new Map(); headSha = '';
  } else if (h.same || h.sha === meta.head) {
    files = new Map(Object.entries(meta.files || {})); headSha = meta.head;
    if (h.etag) meta.etag = h.etag;
  } else {
    // a commit seen before, older than the latest one seen (a server a moment behind): try again shortly
    const i = meta.heads.indexOf(h.sha);
    if (!trustRemote && i >= 0 && i < meta.heads.length - 1) return { stale: true };
    const t = await gh.tree(h.sha);
    if (t.truncated) throw new GitHubError('server', 0, 'too many files to list');
    files = t.files; headSha = h.sha; meta.etag = h.etag;
  }
  const moved = headSha !== meta.head || !meta.files;
  if (!moved && env.dirty === false && !meta.photosPending) return { idle: true };
  if (moved) adoptHead(meta, headSha, files);

  // 2. the families in the repository (an unchanged file is never read again)
  const remote = new Map(), unreadable = new Set();
  for (const [path, sha] of files) {
    const m = path.match(FAMILY_RE);
    if (!m) continue;
    const fid = m[1], b = meta.fams[fid];
    if (b && b.sha === sha) { remote.set(fid, { sha, fam: b.fam }); continue; }
    const fam = fromText(dec.decode(await gh.blob(sha)));
    if (!fam || fam.fid !== fid) { unreadable.add(fid); continue; }
    remote.set(fid, { sha, fam });
  }

  // 3. merge with this device's families as they are now (from here to the change: no waiting)
  const local = familiesOf(env.getState());
  const base = { ...meta.fams };
  for (const fid of unreadable) { local.delete(fid); delete base[fid]; } // a file we cannot read is left alone
  const plan = planSync({ local, remote, base, now: Date.now() });
  if (plan.apply.size) env.applyFamilies(plan.apply, plan.news);
  for (const [fid, R] of plan.keep) meta.fams[fid] = { sha: R.sha, fam: R.fam };
  for (const [fid, fam] of plan.apply) if (fam === null) delete meta.fams[fid];

  // 4. send what is new from here
  let again = false, sent = 0;
  for (const [fid, p] of plan.push) {
    const path = familyPath(fid);
    const before = remote.get(fid);
    try {
      if (p.del) {
        const r = await gh.remove(path, env.message({ kind: 'removed', fid, before: before && before.fam }), p.sha);
        delete meta.fams[fid]; files.delete(path);
        moveHead(meta, r.commit, r.parent, files);
      } else {
        const text = toText(p.fam, { by: env.by, updated: Date.now() });
        const r = await gh.put(path, enc.encode(text), env.message({ kind: before ? 'changed' : 'added', fid, before: before && before.fam, after: p.fam }), p.sha || '');
        meta.fams[fid] = { sha: r.sha, fam: fromText(text) };
        files.set(path, r.sha);
        moveHead(meta, r.commit, r.parent, files);
      }
      sent++;
    } catch (e) {
      if (e.code !== 'conflict') throw e;
      again = true; // it changed on GitHub meanwhile: the next round merges that change first
      meta.head = ''; meta.files = null;
    }
  }

  // 5. photos of the people, a few each round (GitHub limits how fast files may be written)
  let photosPending = false;
  if (env.photos && !again) {
    const used = new Set();
    for (const f of familiesOf(env.getState()).values()) for (const p of Object.values(f.people)) if (p.photo) used.add(p.photo);
    let up = 0, down = 0;
    for (const id of [...used].sort()) {
      const path = photoPath(id);
      if (files.has(path)) {
        if (await env.photos.has(id)) continue;
        if (down >= PHOTO_DOWN) { photosPending = true; continue; }
        down++;
        const bytes = await gh.blob(files.get(path)).catch(() => null);
        if (isJpeg(bytes) && bytes.length <= PHOTO_MAX) await env.photos.put(id, bytes);
      } else {
        const bytes = await env.photos.get(id);
        if (!isJpeg(bytes)) continue;
        if (up >= PHOTO_UP) { photosPending = true; continue; }
        up++;
        try {
          const r = await gh.put(path, bytes, env.message({ kind: 'photo', id }), '');
          files.set(path, r.sha);
          moveHead(meta, r.commit, r.parent, files);
          sent++;
        } catch (e) {
          if (e.code !== 'conflict' && !(e.code === 'http' && e.status === 422)) throw e;
          meta.head = ''; meta.files = null; // already there (sent by another device): read again next round
        }
      }
    }
  }
  meta.photosPending = photosPending;
  if (meta.head) meta.files = Object.fromEntries(files);
  return { again, sent, news: plan.news, applied: plan.apply.size, photosPending };
}

/** the repository's state we now know: this commit and these files */
function adoptHead(meta, sha, files) {
  meta.head = sha;
  meta.files = Object.fromEntries(files);
  if (sha && !meta.heads.includes(sha)) meta.heads = [...meta.heads, sha].slice(-40);
}
/** after our own write: if it went right on top of what we knew, we still know every file; otherwise
 *  someone else wrote in between, and the next round reads the list again */
function moveHead(meta, commit, parent, files) {
  if (!commit) { meta.head = ''; meta.files = null; return; }
  if ((parent || '') === (meta.head || '') && meta.files !== null) { adoptHead(meta, commit, files); meta.etag = ''; }
  else { meta.head = ''; meta.files = null; meta.heads = [...meta.heads, commit].slice(-40); }
}
