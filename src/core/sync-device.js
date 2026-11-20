// A device that syncs a family kept in memory (not in the app): the tests' second phone, and the tool
// Claude edits the family with. Same rounds, same merge as the app (sync-engine.js).
import { github } from './github.js';
import { syncRound, emptyMeta } from './sync-engine.js';
import { applyToState, diffFamily } from './sync-merge.js';

export function memoryDevice({ state, repo, token, branch = '', fetchFn, api, by = 'claude', photos = null, message = null }) {
  const gh = github({ repo, token, branch, fetchFn, api });
  const meta = emptyMeta();
  let s = state, ready = !!branch;
  const dev = {
    meta, gh, news: [],
    get state() { return s; },
    set state(v) { s = v; },
    /** rounds until nothing is left to send (a change on GitHub meanwhile → merged, sent again) */
    async sync() {
      if (!ready) { await gh.info(); ready = true; }
      let r, i = 0;
      do { r = await syncRound(env, { trustRemote: i > 0 }); } while ((r.again || r.stale) && ++i < 5);
      return r;
    }
  };
  const env = {
    gh, meta, by, photos,
    getState: () => s,
    applyFamilies(apply, news) {
      s = applyToState(s, apply, { synced: new Set(Object.keys(meta.fams)) });
      dev.news.push(...news);
    },
    message: message || (info => {
      if (info.kind === 'photo') return `${by}: photo`;
      const d = diffFamily(info.before || null, info.after || null);
      return `${by}: ${info.kind} — +${d.added.length} ~${d.edited.length} -${d.removed.length}`;
    })
  };
  return dev;
}
