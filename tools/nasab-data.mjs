#!/usr/bin/env node
// The tool Claude uses to read and edit the family kept in the user's private repository (sync between
// devices). Claude is one more device: this runs the app's own code — the same checks, the same merge,
// the same commit messages — so every change reaches the phone and the computer on their next sync,
// where the user sees what arrived and can undo it.
//
//   node tools/nasab-data.mjs <clone folder | owner/repo> families
//   node tools/nasab-data.mjs <…> find <name words…> [--family <name or id>]
//   node tools/nasab-data.mjs <…> show <person id> [--family …]
//   node tools/nasab-data.mjs <…> edit <script.mjs> [--family …] [--dry]
//
// A clone folder (git clone of the private repository): read and written with git — how a Claude
// session writes (its GitHub access lets git push, not the write calls of the API). The clone is the
// tool's own copy: it is reset to GitHub's latest before reading. If a device wrote meanwhile, the push
// is refused; the tool then merges with that version (the app's merge) and pushes again.
// owner/repo: through GitHub's API with a key, like the app (NASAB_API: another address — the tests).
// NASAB_COMMIT_TRAILER: lines added at the end of each commit message.
//
// An edit script exports a function that gets { A, find, show, lineage, state, ix } — A is the app's
// actions (src/core/actions.js) acting on the chosen family:
//   export default async ({ A, find }) => { A.addChild(find('سالم بن محمد'), { n: 'زياد', g: 'm', b: '2021-05-01' }); };
// find() returns one person's id, or stops with the candidates when the name is not enough to tell.
// --dry shows what would change and sends nothing.
//
// Key (owner/repo only): NASAB_TOKEN, else GH_TOKEN.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Node's fetch uses the HTTPS proxy only when asked to (a Claude session reaches GitHub through one)
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status == null ? 1 : r.status);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
Object.assign(globalThis, { __APP_VERSION__: 'tool', __ALLOW_FRAME__: false, __EXCELJS_SRI__: '', __PDF_SRI__: '', __VIEWER_SRI__: '', __QR_SRI__: '' });
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { defaultState, state, clearUndo } = await imp('src/core/store.js');
const A = await imp('src/core/actions.js');
const { buildIndex, searchPeople } = await imp('src/core/model.js');
const { lineageText } = await imp('src/core/names.js');
const { nameKey } = await imp('src/core/util.js');
const { memoryDevice } = await imp('src/core/sync-device.js');
const M = await imp('src/core/sync-merge.js');
const { commitText, changesText } = await imp('src/core/sync-words.js');

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const dry = args.includes('--dry'); if (dry) args.splice(args.indexOf('--dry'), 1);
const famArg = flag('--family');
const [repo, cmd, ...rest] = args;
const die = msg => { console.error(msg); process.exit(1); };
if (!repo || !cmd) die('usage: node tools/nasab-data.mjs <clone folder | owner/repo> families | find <name…> | show <id> | edit <script.mjs> [--family …] [--dry]');
const fresh = () => ({ ...defaultState(), settings: { ...defaultState().settings, onboarded: true } });
const trailer = process.env.NASAB_COMMIT_TRAILER ? '\n\n' + process.env.NASAB_COMMIT_TRAILER.trim() : '';

// every family in the repository, as a phone that has just been linked would get them
const gitMode = fs.existsSync(repo) && fs.statSync(repo).isDirectory();
let dev = null, clone = null;
if (gitMode) {
  clone = gitClone(path.resolve(repo));
  const loaded = new Map();
  for (const [fid, fam] of clone.read()) loaded.set(fid, fam);
  dev = { state: M.applyToState(fresh(), loaded, { synced: new Set() }), base: loaded };
} else {
  const token = process.env.NASAB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) die('no key: set NASAB_TOKEN (or GH_TOKEN)');
  dev = memoryDevice({ state: fresh(), repo, token, api: process.env.NASAB_API || undefined, by: 'claude', message: info => commitText(info, 'claude') + trailer });
  await dev.sync().catch(e => die(`GitHub: ${e.code || ''} ${e.message}`));
}
const fams = M.familiesOf(dev.state);
const label = f => f.fname || (() => { const ix = buildIndex({ ...f, settings: dev.state.settings }); const r = f.root && ix.P[f.root] ? f.root : ix.defaultRoot(f.me); return r ? ix.familyOf(r) || ix.P[r].n : ''; })() || f.fid;
const withPeople = [...fams.values()].filter(f => Object.keys(f.people).length);

if (cmd === 'families') {
  for (const f of withPeople) console.log(`${f.fid}\t${label(f)}\t${Object.keys(f.people).length} people\t${Object.keys(f.unions).length} marriages`);
  process.exit(0);
}
// the family to work on
let fam = withPeople.length === 1 ? withPeople[0] : null;
if (famArg) fam = withPeople.find(f => f.fid === famArg || label(f) === famArg || f.fname === famArg) || null;
if (!fam) die(withPeople.length ? `which family? --family <id or name>:\n` + withPeople.map(f => `  ${f.fid}  ${label(f)}`).join('\n') : 'the repository has no family yet');
state.value = dev.state;
if (state.value.fid !== fam.fid) A.switchFamily(fam.fid);
const ix = () => buildIndex(state.value);
const lineage = id => {
  const I = ix(), p = I.P[id];
  if (!p) return '';
  return lineageText(I.paternalLine(id, 50).map(x => I.P[x].n || '؟'), { gender: p.g, style: 'bin', family: I.familyOf(id) });
};
const brief = id => { const p = ix().P[id]; return `${id}  ${lineage(id)}${p.b ? '  b.' + p.b : ''}${p.d ? '  d.' + p.d : ''}`; };
/** one person by name words ("سالم بن محمد بن راشد", "سالم محمد راشد الراشد"): his name, then his
 *  father's, grandfather's… in order (spelling forms of the letters are alike); a family name may end it,
 *  and then a lineage written in full is that person even when longer lines begin the same way */
function find(q) {
  const words = String(q).replace(/(^|\s)(بن|بنت|ابن|bin|bint)(?=\s)/g, ' ').trim().split(/\s+/).map(nameKey).filter(Boolean);
  if (!words.length) throw new Error('find() needs a name');
  const I = ix();
  const whole = new Set(); // the name and every father up to the family name: nothing left out
  const hits = Object.keys(I.P).filter(id => {
    const line = I.paternalLine(id, 60).map(x => nameKey(I.P[x].n));
    const fam = nameKey(I.familyOf(id) || '');
    const withFam = words.length > 1 && fam && words[words.length - 1] === fam;
    const w = withFam ? words.slice(0, -1) : words;
    if (!w.every((x, i) => line[i] === x)) return false;
    if (withFam && w.length === line.length) whole.add(id);
    return true;
  });
  if (hits.length === 1) return hits[0];
  if (whole.size === 1) return [...whole][0];
  throw new Error(hits.length ? `"${q}" fits ${hits.length} people — add a father's or grandfather's name:\n` + hits.map(h => '  ' + brief(h)).join('\n') : `nobody called "${q}"`);
}
function show(id) {
  const I = ix(), p = I.P[id];
  if (!p) return `no person ${id}`;
  const lines = [brief(id)];
  for (const [k, v] of Object.entries(p)) if (v && !['id', 'n', 'pu', 'at', 'upd'].includes(k)) lines.push(`  ${k}: ${v}`);
  const par = [I.father(id), I.mother(id)].filter(Boolean);
  if (par.length) lines.push('  parents: ' + par.map(x => `${I.P[x].n} (${x})`).join(', '));
  for (const u of I.unions(id)) {
    const uu = I.U[u], o = uu.h === id ? uu.w : uu.h;
    lines.push(`  marriage ${u}${o ? ' with ' + (I.P[o] ? I.P[o].n + ` (${o})` : o) : ''}: ` + I.children(id).filter(c => I.P[c].pu === u).map(c => `${I.P[c].n} (${c})`).join(', '));
  }
  return lines.join('\n');
}

if (cmd === 'find') {
  const I = ix();
  const words = rest.join(' ');
  let ids = [];
  try { ids = [find(words)]; } catch (e) { ids = searchPeople(I, words, 50); }
  for (const id of ids) console.log(brief(id));
  if (!ids.length) console.log('(nobody)');
  process.exit(0);
}
if (cmd === 'show') { console.log(show(rest[0])); process.exit(0); }
if (cmd !== 'edit') die('unknown command ' + cmd);

const script = rest[0];
if (!script) die('edit needs a script file');
const before = M.familiesOf(state.value).get(fam.fid);
const mod = await import(pathToFileURL(path.resolve(script)).href);
try { await (mod.default || mod.edit)({ A, find, show, lineage, state, ix }); } catch (e) { die('the edit stopped: ' + (e && e.message)); }
await new Promise(r => setTimeout(r, 300)); // the store's own save timer (nothing to save here)
const after = M.familiesOf(state.value).get(state.value.fid);
const d = M.diffFamily(before, after);
if (!d.any) { console.log('nothing changed'); process.exit(0); }
console.log((changesText(d) || '') + `\n` + [...d.added.map(id => '+ ' + brief(id)), ...d.edited.map(id => '~ ' + brief(id)), ...d.removed.map(id => '- ' + id + ' ' + (before.people[id] && before.people[id].n))].join('\n'));
if (dry) { console.log('(dry run: nothing sent)'); process.exit(0); }
if (gitMode) {
  const out = clone.save(fam.fid, dev.base.get(fam.fid), after);
  console.log(`sent: ${M.familyPath(fam.fid)} (${out})`);
} else {
  dev.state = state.value;
  const r = await dev.sync().catch(e => die(`GitHub: ${e.code || ''} ${e.message}`));
  console.log(r && dev.meta.fams[fam.fid] ? `sent: ${M.familyPath(fam.fid)} (${dev.meta.fams[fam.fid].sha.slice(0, 7)})` : 'not sent');
}

/** the clone folder: read the families GitHub has now; write one back, merging with whatever a device
 *  wrote meantime (refused push → fetch → the app's merge → push again) */
function gitClone(dir) {
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') === 'HEAD' ? 'main' : git('rev-parse', '--abbrev-ref', 'HEAD');
  const sync = () => {
    git('fetch', '-q', '--depth=1', 'origin', branch);
    git('reset', '-q', '--hard', 'FETCH_HEAD'); // the tool's own copy: always GitHub's latest
  };
  const fileAt = (rev, p) => { try { return execFileSync('git', ['-C', dir, 'show', `${rev}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
  sync();
  return {
    read() {
      const out = new Map(), d = path.join(dir, 'families');
      if (!fs.existsSync(d)) return out;
      for (const f of fs.readdirSync(d).sort()) {
        const m = ('families/' + f).match(M.FAMILY_RE);
        if (!m) continue;
        const fam = M.fromText(fs.readFileSync(path.join(d, f), 'utf8'));
        if (fam && fam.fid === m[1]) out.set(m[1], fam); else console.error(`skipped ${f}: not a family file`);
      }
      return out;
    },
    save(fid, base, edited) {
      // this copy with its deletions written down (the app's merge of "this side changed, the other not")
      let mine = M.mergeFamily(base, edited, base || edited);
      for (let i = 0; i < 4; i++) {
        const p = M.familyPath(fid);
        fs.mkdirSync(path.join(dir, 'families'), { recursive: true });
        fs.writeFileSync(path.join(dir, p), M.toText(mine, { by: 'claude', updated: Date.now() }));
        git('add', p);
        const who = (() => { try { return git('config', 'user.email') ? [] : null; } catch (e) { return null; } })() || ['-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com'];
        git(...who, 'commit', '-q', '-m', commitText({ kind: base ? 'changed' : 'added', fid, before: base, after: mine }, 'claude') + trailer);
        try { git('-c', 'push.negotiate=true', 'push', '-q', 'origin', 'HEAD:' + branch); return git('rev-parse', '--short', 'HEAD'); } catch (e) {
          if (!/rejected|non-fast-forward|fetch first/i.test(String(e.stderr || e.message))) throw e;
        }
        // a device wrote meanwhile: merge with its version, as the app would
        sync();
        const theirs = fileAt('HEAD', p);
        const remote = theirs ? M.fromText(theirs) : null;
        if (remote) mine = M.mergeFamily(base, mine, remote);
        console.error('GitHub changed meanwhile: merged with it, sending again');
      }
      throw new Error('could not send after several tries');
    }
  };
}
