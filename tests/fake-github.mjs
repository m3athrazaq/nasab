// A private GitHub repository in memory, answering the calls the sync makes the way GitHub does
// (same paths, statuses, messages and ids: blob ids are git's SHA-1, so the app's own check matches).
// Used by the logic test (as fetch) and by the browser test (behind page.route).
import crypto from 'node:crypto';

const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');
export const blobSha = bytes => sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), Buffer.from(bytes)]));

export function fakeGitHub({ owner = 'me', name = 'nasab-data', token = 'github_pat_TEST_' + 'x'.repeat(70), isPrivate = true, keys = [] } = {}) {
  const repo = { private: isPrivate, branch: 'main', commits: [], files: new Map(), blobs: new Map() };
  // the keys that reach this repository (a second one for relatives, say); revoke() is deleting one on GitHub
  const accepted = new Set([token, ...keys]);
  // repo.commits: { sha, parent, files: Map(path → blob sha), message }
  let n = 0;
  const log = [];
  const head = () => repo.commits[repo.commits.length - 1] || null;
  function commit(files, message) {
    const parent = head();
    const sha = sha1(`commit ${++n} ${message} ${parent ? parent.sha : ''}`);
    repo.commits.push({ sha, parent: parent ? parent.sha : '', files: new Map(files), message });
    return { sha, parents: parent ? [{ sha: parent.sha }] : [] };
  }
  const res = (status, body, headers = {}) => ({ status, body: body == null ? '' : JSON.stringify(body), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After', ...headers } });
  const B64 = bytes => Buffer.from(bytes).toString('base64').replace(/(.{60})/g, '$1\n');

  function handle(method, url, headers = {}, bodyText = '') {
    const u = new URL(url);
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    log.push(method + ' ' + u.pathname);
    if (method === 'OPTIONS') return { status: 204, body: '', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, Accept' } };
    if (!h.authorization && repo.private) return res(404, { message: 'Not Found' }); // as GitHub answers strangers
    const anonymousRead = !h.authorization && method === 'GET';
    if (!anonymousRead && !accepted.has(String(h.authorization || '').replace(/^Bearer /, ''))) return res(401, { message: 'Bad credentials' });
    const pre = `/repos/${owner}/${name}`;
    if (!u.pathname.startsWith(pre)) return res(404, { message: 'Not Found' });
    const p = u.pathname.slice(pre.length);
    const body = bodyText ? JSON.parse(bodyText) : {};
    if (method === 'GET' && p === '') return res(200, { full_name: `${owner}/${name}`, private: repo.private, default_branch: repo.branch, permissions: { admin: true, push: true, pull: true } });
    if (method === 'GET' && p === `/git/ref/heads/${repo.branch}`) {
      const c = head();
      if (!c) return res(409, { message: 'Git Repository is empty.' });
      const etag = `W/"${c.sha}"`;
      if (h['if-none-match'] === etag) return { status: 304, body: '', headers: { ETag: etag, 'Access-Control-Allow-Origin': '*' } };
      return res(200, { ref: `refs/heads/${repo.branch}`, object: { sha: c.sha, type: 'commit' } }, { ETag: etag });
    }
    let m;
    if (method === 'GET' && (m = p.match(/^\/git\/trees\/([0-9a-f]{40})$/))) {
      const c = repo.commits.find(x => x.sha === m[1]);
      if (!c) return res(404, { message: 'Not Found' });
      return res(200, { sha: c.sha, truncated: false, tree: [...c.files].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha })) });
    }
    if (method === 'GET' && (m = p.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
      const b = repo.blobs.get(m[1]);
      return b ? res(200, { sha: m[1], encoding: 'base64', content: B64(b), size: b.length }) : res(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = p.match(/^\/contents\/(.+)$/))) {
      // one file: its raw bytes (Accept: application/vnd.github.raw) or as JSON with base64 content
      const c = head(), path = decodeURIComponent(m[1]);
      const sha = c && c.files.get(path);
      if (!sha) return res(404, { message: 'Not Found' });
      const b = repo.blobs.get(sha);
      if (/raw/.test(h.accept || '')) return { status: 200, body: Buffer.from(b), headers: { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } };
      return res(200, { path, sha, size: b.length, encoding: 'base64', content: B64(b) });
    }
    if ((method === 'PUT' || method === 'DELETE') && (m = p.match(/^\/contents\/(.+)$/))) {
      const path = decodeURIComponent(m[1]);
      const c = head();
      const files = new Map(c ? c.files : []);
      const cur = files.get(path);
      if (method === 'PUT') {
        if (cur && !body.sha) return res(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        if (cur && body.sha !== cur) return res(409, { message: `${path} does not match ${body.sha}` });
        if (!cur && body.sha) return res(409, { message: `${path} does not match ${body.sha}` });
        const bytes = Buffer.from(String(body.content || ''), 'base64');
        const sha = blobSha(bytes);
        repo.blobs.set(sha, bytes);
        files.set(path, sha);
        const cm = commit(files, body.message || '');
        return res(cur ? 200 : 201, { content: { path, sha }, commit: cm });
      }
      if (!cur) return res(404, { message: 'Not Found' });
      if (body.sha !== cur) return res(409, { message: `${path} does not match ${body.sha}` });
      files.delete(path);
      return res(200, { content: null, commit: commit(files, body.message || '') });
    }
    return res(404, { message: 'Not Found' });
  }
  /** fetch() for the logic test */
  async function fetchFn(url, init = {}) {
    const r = handle(init.method || 'GET', String(url), init.headers || {}, init.body || '');
    return new Response(r.status === 304 || r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
  }
  /** the files at the head: path → text (for checks) */
  const read = path => { const c = head(); const sha = c && c.files.get(path); return sha ? repo.blobs.get(sha).toString('utf8') : null; };
  const readBytes = path => { const c = head(); const sha = c && c.files.get(path); return sha ? new Uint8Array(repo.blobs.get(sha)) : null; };
  const revoke = key => accepted.delete(key);
  const addKey = key => accepted.add(key);
  return { repo, token, full: `${owner}/${name}`, handle, fetch: fetchFn, head, read, readBytes, log, commits: () => repo.commits, revoke, addKey };
}
