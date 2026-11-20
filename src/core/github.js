// The few GitHub calls the sync needs, on the user's own private repository, with the user's own key
// (a fine-grained token that can reach that one repository). Nothing else is ever contacted.
//   head()        the latest change on the branch (a cheap check: "not modified" costs nothing)
//   tree(sha)     every file of that change with its id
//   blob(sha)     one file's bytes
//   put/remove    one file written or deleted, refused if it changed since we read it (no change is lost)
import { bufToB64 } from './util.js';

export const API = 'https://api.github.com';
export const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

/** codes: offline, auth (key wrong, expired or revoked), notfound (no such repository, or the key cannot
 *  see it), denied (the key cannot write), rate (too many requests for now), conflict (it changed
 *  meanwhile), empty (a repository with nothing in it yet), server, http */
export class GitHubError extends Error {
  constructor(code, status = 0, detail = '', retryAt = 0) { super(code + (detail ? ': ' + detail : '')); this.code = code; this.status = status; this.retryAt = retryAt; }
}
const b64ToBytes = b64 => {
  const s = atob(String(b64 || '').replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const pathUrl = p => p.split('/').map(encodeURIComponent).join('/');
const parentOf = c => (c && Array.isArray(c.parents) && c.parents[0] && c.parents[0].sha) || '';

export function github({ repo, token, branch = '', fetchFn = (...a) => fetch(...a), api = API }) {
  if (!REPO_RE.test(repo || '')) throw new GitHubError('notfound', 0, 'repository name');
  const base = `${api}/repos/${repo.split('/').map(encodeURIComponent).join('/')}`;
  let br = branch, empty = false;

  async function req(method, path, { body, etag } = {}) {
    const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token };
    if (body) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-None-Match'] = etag;
    let res;
    try {
      res = await fetchFn(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' });
    } catch (e) { throw new GitHubError('offline', 0, String((e && e.message) || e)); }
    if (res.status === 304) return { status: 304, data: null, etag };
    let data = null;
    const text = await res.text().catch(() => '');
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (res.ok) return { status: res.status, data, etag: res.headers.get('ETag') || '' };
    const msg = (data && data.message) || '';
    const h = n => res.headers.get(n);
    if (res.status === 401) throw new GitHubError('auth', 401, msg);
    if ((res.status === 403 || res.status === 429) && (h('X-RateLimit-Remaining') === '0' || h('Retry-After') || /rate limit/i.test(msg))) {
      const at = h('Retry-After') ? Date.now() + 1000 * +h('Retry-After') : h('X-RateLimit-Reset') ? 1000 * +h('X-RateLimit-Reset') : Date.now() + 600e3;
      throw new GitHubError('rate', res.status, msg, at);
    }
    if (res.status === 403) throw new GitHubError('denied', 403, msg);
    if (res.status === 404) throw new GitHubError('notfound', 404, msg);
    if (res.status === 409 && /empty/i.test(msg)) throw new GitHubError('empty', 409, msg);
    if (res.status === 409 || (res.status === 422 && /sha|fast.forward|does not match/i.test(msg))) throw new GitHubError('conflict', res.status, msg);
    if (res.status >= 500) throw new GitHubError('server', res.status, msg);
    throw new GitHubError('http', res.status, msg);
  }

  return {
    get branch() { return br; },
    /** the repository: private? its main branch */
    async info() {
      const { data } = await req('GET', '');
      if (!br) br = data.default_branch || 'main';
      return { private: !!data.private, branch: data.default_branch || 'main', fullName: data.full_name || repo, canPush: !data.permissions || !!data.permissions.push };
    },
    /** the branch's latest commit: { sha, etag } · { same: true } when it has not moved · { empty: true } */
    async head(etag = '') {
      try {
        const r = await req('GET', `/git/ref/heads/${pathUrl(br)}`, { etag });
        empty = false;
        if (r.status === 304) return { same: true, etag };
        return { sha: r.data.object.sha, etag: r.etag };
      } catch (e) {
        // an empty repository has no branch yet (the caller knows whether it ever had one)
        if (e.code === 'empty' || e.code === 'notfound' || (e.code === 'conflict' && e.status === 409)) { empty = true; return { empty: true }; }
        throw e;
      }
    },
    /** every file of a commit: path → blob id */
    async tree(commitSha) {
      const { data } = await req('GET', `/git/trees/${commitSha}?recursive=1`);
      const files = new Map();
      for (const it of (data && data.tree) || []) if (it.type === 'blob') files.set(it.path, it.sha);
      return { files, truncated: !!(data && data.truncated) };
    },
    async blob(sha) {
      const { data } = await req('GET', `/git/blobs/${sha}`);
      return b64ToBytes(data && data.content);
    },
    /** write a file; sha: the id of the version it replaces (none for a new file). → { sha, commit } */
    async put(path, bytes, message, sha = '') {
      // (the first file of an empty repository makes its main branch: no branch is named then)
      const body = { message, content: bufToB64(bytes) };
      if (!empty) body.branch = br;
      if (sha) body.sha = sha;
      const { data } = await req('PUT', `/contents/${pathUrl(path)}`, { body });
      empty = false;
      return { sha: data.content.sha, commit: data.commit.sha, parent: parentOf(data.commit) };
    },
    async remove(path, message, sha) {
      const { data } = await req('DELETE', `/contents/${pathUrl(path)}`, { body: { message, sha, branch: br } });
      return { commit: data && data.commit ? data.commit.sha : '', parent: parentOf(data && data.commit) };
    }
  };
}

/** what to give the other device: the repository, its branch and the key, in one line (shown as a QR code) */
export function linkCode({ repo, token, branch }) {
  const json = JSON.stringify({ r: repo, k: token, b: branch || '' });
  return 'nasab1:' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** the code alone (nasab1:…), or the app's link that carries it after "#" (https://…/nasab/#nasab1:…) */
export function readLinkCode(text) {
  const m = String(text || '').trim().match(/(?:^|#)nasab1:([A-Za-z0-9_-]{8,2000})$/);
  if (!m) return null;
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
    if (!o || !REPO_RE.test(o.r || '') || typeof o.k !== 'string' || !/^[A-Za-z0-9_]{20,255}$/.test(o.k)) return null;
    return { repo: o.r, token: o.k, branch: typeof o.b === 'string' && /^[\w./-]{1,100}$/.test(o.b) ? o.b : '' };
  } catch (e) { return null; }
}
/** a key as GitHub makes them: github_pat_… (fine-grained) or ghp_… (classic) */
export const looksLikeToken = s => /^(github_pat_[A-Za-z0-9_]{20,250}|gh[pousr]_[A-Za-z0-9]{30,250})$/.test(String(s || '').trim());
