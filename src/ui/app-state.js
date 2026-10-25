// Shared UI state: the family index, the top of the tree, branch colours, and the sheets any screen opens.
import { signal, computed, effect } from '@preact/signals';
import { state } from '../core/store.js';
import { buildIndex } from '../core/model.js';
import { lang, digits, calPref, calBoth } from '../core/i18n.js';
import { plug } from '../core/native.js';
import { SCREEN } from '../chart/themes.js';

export const ready = signal(false);

/* the index is rebuilt only when people or marriages change (not for view or setting changes) */
let ixMemo = { p: null, u: null, ix: null };
export const IX = computed(() => {
  const s = state.value;
  if (ixMemo.p !== s.people || ixMemo.u !== s.unions) ixMemo = { p: s.people, u: s.unions, ix: buildIndex(s) };
  return ixMemo.ix;
});
/** the top of the tree: the one chosen, else the founder of "me", else the head of the biggest family */
export const ROOT = computed(() => {
  const s = state.value, ix = IX.value;
  return s.root && ix.P[s.root] ? s.root : ix.defaultRoot(s.me);
});
/** each person's branch under the top of the tree (the child of the top they descend from); wives take their husband's */
export const BRANCH = computed(() => {
  const ix = IX.value, root = ROOT.value;
  const m = new Map();
  if (!root) return m;
  m.set(root, -1);
  ix.children(root).forEach((c, i) => {
    const stack = [c];
    while (stack.length) {
      const x = stack.pop();
      if (m.has(x)) continue;
      m.set(x, i);
      stack.push(...ix.children(x));
    }
  });
  for (const u of Object.values(ix.U)) {
    if (u.h && u.w) {
      if (m.has(u.h) && !m.has(u.w)) m.set(u.w, m.get(u.h));
      else if (m.has(u.w) && !m.has(u.h)) m.set(u.h, m.get(u.w));
    }
  }
  return m;
});

export const isDark = signal(false);
export const screenTheme = computed(() => (isDark.value ? SCREEN.dark : SCREEN.light));
/** the colour of a person's branch on the screen */
export function branchInk(id) {
  const b = BRANCH.value.get(id);
  const th = screenTheme.value;
  if (b == null) return th.ink2;
  return b < 0 ? th.accent : th.branch[b % th.branch.length];
}

/* sheets */
export const personSheet = signal(null);  // person id (quick view from the tree)
export const addSheet = signal(null);     // { kind: 'child'|'children'|'father'|'mother'|'spouse'|'sibling'|'person', of }
export const pickerSheet = signal(null);  // { title, onPick, exclude, filter }
export const viewSheet = signal(false);   // tree display options
export const focusRequest = signal(null); // { id, ts } — ask the tree to centre on someone

export const openPerson = id => { personSheet.value = id; };
export const openAdd = (kind, of, extra = {}) => { addSheet.value = { kind, of, ...extra }; };
export const pickPerson = opts => { pickerSheet.value = opts; };
export const focusOn = id => { focusRequest.value = { id, ts: Date.now() }; };

// in the private preview the host page may have set the viewer's light/dark choice on the root
const hostTheme = __ALLOW_FRAME__ && typeof document !== 'undefined' ? document.documentElement.dataset.theme || '' : '';
/** settings → language, direction, digits, calendar, theme */
effect(() => {
  const s = state.value.settings;
  lang.value = s.lang; digits.value = s.digits; calPref.value = s.cal; calBoth.value = s.both;
  const el = document.documentElement;
  el.lang = s.lang; el.dir = s.lang === 'ar' ? 'rtl' : 'ltr';
  if (s.theme !== 'auto') el.dataset.theme = s.theme;
  else if (hostTheme) el.dataset.theme = hostTheme;
  else delete el.dataset.theme;
  document.title = s.lang === 'ar' ? 'نَسَب' : 'Nasab';
});
const mq = matchMedia('(prefers-color-scheme: dark)');
const syncDark = () => { const th = state.value.settings.theme; isDark.value = th === 'dark' || (th === 'auto' && (hostTheme ? hostTheme === 'dark' : mq.matches)); };
mq.addEventListener ? mq.addEventListener('change', syncDark) : mq.addListener(syncDark);
effect(syncDark);
/** the phone's status bar follows the app's theme */
effect(() => {
  const dark = isDark.value;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = dark ? '#16110E' : '#EEF0EC';
  const bars = plug('SystemBars');
  if (bars && bars.setStyle) bars.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
});
