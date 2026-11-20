// Sync against the real GitHub, on a throwaway branch of a private repository (not run by CI; it needs a
// key that may write through GitHub's API — the app's own kind of key; a Claude session writes with git):
//   NODE_USE_ENV_PROXY=1 REPO=<owner/repo> BRANCH=<test branch> NASAB_TOKEN=<key> node tests/sync-live.mjs
// The branch must already exist and must not be the repository's main branch; the sample family is
// written there and removed at the end. Checks what the in-memory repository cannot: GitHub's own
// answers ("not modified", conflicts, file ids, commits' parents), Arabic text, photos.
globalThis.window = globalThis;
Object.assign(globalThis, { __APP_VERSION__: 'live', __ALLOW_FRAME__: false });
const REPO = process.env.REPO, BRANCH = process.env.BRANCH, TOKEN = process.env.NASAB_TOKEN || process.env.GH_TOKEN;
if (!REPO || !BRANCH || !TOKEN || /^(main|master)$/.test(BRANCH)) { console.error('REPO, BRANCH (not main) and NASAB_TOKEN are needed'); process.exit(2); }
const { sanitizeState, defaultState, state } = await import('../src/core/store.js');
const A = await import('../src/core/actions.js');
const { demoState } = await import('../src/core/demo.js');
const { memoryDevice } = await import('../src/core/sync-device.js');
const { github } = await import('../src/core/github.js');
const M = await import('../src/core/sync-merge.js');
const { commitText } = await import('../src/core/sync-words.js');

let fails = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' — ' + detail)); if (!ok) fails++; };
const dev = (st, by, photos) => memoryDevice({ state: st, repo: REPO, token: TOKEN, branch: BRANCH, by, photos, message: info => commitText(info, by) });
const on = (d, fn) => { state.value = d.state; const r = fn(); d.state = state.value; return r; };
const store = m => ({ has: async id => m.has(id), get: async id => m.get(id) || null, put: async (id, b) => { m.set(id, b); } });
const gh = github({ repo: REPO, token: TOKEN, branch: BRANCH });

const info = await gh.info();
check('the repository is private', info.private === true);
const t0 = Date.now();
const photosA = new Map([['livephoto01', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])]]);
const photosB = new Map();
const st = sanitizeState({ ...demoState(), settings: { onboarded: true } });
st.fname = 'عائلة تجربة'; st.people.demom2 = { ...st.people.demom2, photo: 'livephoto01' };
const phone = dev(st, 'phone', store(photosA));
const pc = dev(defaultState(), 'computer', store(photosB));
try {
  await phone.sync();
  check('the phone sends the family and its photo', Object.keys(phone.meta.fams).length === 1 && !!phone.meta.files[M.photoPath('livephoto01')], JSON.stringify(Object.keys(phone.meta.files || {})));
  await pc.sync();
  check('the computer receives it, with the photo', Object.keys(pc.state.people).length === 52 && pc.state.fname === 'عائلة تجربة' && photosB.has('livephoto01'));
  const h = await gh.head(pc.meta.etag);
  check('nothing new: GitHub answers "not modified"', h.same === true, JSON.stringify(h));
  // edits on both sides, one detail each, then the same detail
  on(phone, () => A.editPerson('demoa2', { job: 'مهندس' }));
  on(pc, () => A.editPerson('demoa2', { b: '1960-02-03' }));
  await phone.sync(); await pc.sync(); await phone.sync();
  check('different details on two devices: both kept', pc.state.people.demoa2.job === 'مهندس' && phone.state.people.demoa2.b === '1960-02-03');
  // GitHub refuses a write over a file that changed since it was read (so no device's edit is lost)
  const path = M.familyPath(phone.state.fid);
  const cur = (await gh.tree((await gh.head('')).sha)).files.get(path);
  const fam = M.familiesOf(phone.state).get(phone.state.fid);
  const enc = x => new TextEncoder().encode(M.toText({ ...fam, gone: {} }, { by: 'test', updated: x }));
  const w1 = await gh.put(path, enc(1), 'live test: a write', cur);
  check('a write names the commit it went on top of', !!w1.commit && !!w1.parent && w1.sha !== cur);
  let code = '';
  try { await gh.put(path, enc(2), 'live test: stale', cur); } catch (e) { code = e.code + ' ' + e.status; }
  check('a write with the old file id is refused as a conflict', /^conflict/.test(code), code);
  code = '';
  try { await gh.put(path, enc(3), 'live test: no id', ''); } catch (e) { code = e.code + ' ' + e.status; }
  check('writing over an existing file without its id is refused as a conflict', /^conflict/.test(code), code);
  // two devices writing at the same moment
  on(pc, () => A.editPerson('demor1', { nick: 'أبو محمد' }));
  on(phone, () => A.editPerson('demom2', { job: 'تاجر' }));
  const both = [pc.sync(), phone.sync()];
  await Promise.all(both);
  await pc.sync(); await phone.sync();
  check('two devices writing at the same moment: both edits everywhere', phone.state.people.demor1.nick === 'أبو محمد' && pc.state.people.demom2.job === 'تاجر' && pc.state.people.demor1.nick === 'أبو محمد' && phone.state.people.demom2.job === 'تاجر');
  // a deletion
  const kid = on(pc, () => A.addChild('demom2', { n: 'زياد', g: 'm' }));
  await pc.sync(); await phone.sync();
  on(phone, () => A.deletePerson(kid));
  await phone.sync(); await pc.sync();
  check('added on one, deleted on the other: gone everywhere', !pc.state.people[kid] && !phone.state.people[kid]);
  check('both hold the same family', M.contentKey(M.familiesOf(pc.state).get(pc.state.fid)) === M.contentKey(M.familiesOf(phone.state).get(phone.state.fid)));
  const head = await gh.head('');
  const files = (await gh.tree(head.sha)).files;
  const text = new TextDecoder().decode(await gh.blob(files.get(M.familyPath(phone.state.fid))));
  check('the file on GitHub reads back as the same family (Arabic intact)', M.fromText(text).fname === 'عائلة تجربة' && /"n":"راشد"/.test(text));
  console.log(`rounds took ${Math.round((Date.now() - t0) / 1000)} s in all`);
} finally {
  // leave the branch as it was: the family and the photo removed
  try {
    const head = await gh.head('');
    if (head.sha) {
      const files = (await gh.tree(head.sha)).files;
      for (const [p, sha] of files) if (/^(families|photos)\//.test(p)) await gh.remove(p, 'live test: clean up', sha);
    }
  } catch (e) { console.log('clean-up: ' + e.message); }
}
console.log(fails ? `FAIL ${fails}` : 'PASS all live checks');
process.exit(fails ? 1 : 0);
