// Looks for the tree: two for the screen (light, dark) and five for prints and images.
// Each names its colours, the fonts of names/years/titles, and the ornament of its frame.

/** fonts by key: the screen uses the web fonts (woff2), exports the same faces as TTF outlines */
export const FONTS = {
  naskhB: { family: 'Nasab Naskh', weight: 700, file: 'NotoNaskhArabic-Bold.ttf' },
  naskh: { family: 'Nasab Naskh', weight: 400, file: 'NotoNaskhArabic-Regular.ttf' },
  ui: { family: 'Nasab Readex', weight: 400, file: 'ReadexPro-Regular.ttf' },
  uiB: { family: 'Nasab Readex', weight: 600, file: 'ReadexPro-SemiBold.ttf' },
  ruqaa: { family: 'Nasab Ruqaa', weight: 700, file: 'ArefRuqaa-Bold.ttf' },
  amiri: { family: 'Nasab Amiri', weight: 400, file: 'Amiri-Regular.ttf' },
  amiriB: { family: 'Nasab Amiri', weight: 700, file: 'Amiri-Bold.ttf' },
  kufi: { family: 'Nasab Kufi', weight: 700, file: 'ReemKufi-Bold.ttf' }
};
export const cssFont = (key, size) => `${FONTS[key].weight} ${size}px "${FONTS[key].family}", "Nasab Naskh", serif`;

/* ---------- screen ---------- */
// branch inks drawn from Sadu weaving and the Gulf: madder, indigo, saffron, palm, plum, sea, rust, slate
const BR_LIGHT = ['#A3271F', '#2F4B7C', '#B07A12', '#2E6B4F', '#7A3B69', '#1F6F78', '#9A4E1C', '#56607A'];
const BR_DARK = ['#F07065', '#8FA9E0', '#E7B44A', '#6CC79A', '#D18AC0', '#5FC3CC', '#E69A5E', '#A9B3CC'];

export const SCREEN = {
  light: {
    id: 'screen-light', bg: 'transparent', halo: '#EEF0EC', ink: '#231C17', ink2: '#5E554D', ink3: '#8C847B', line: '#B9B0A4', lineW: 1.6,
    accent: '#A3271F', thread: '#A3271F', gold: '#B07A12', band: 'rgba(35,28,23,0.035)', bandText: '#8C847B',
    paper: '#FBFAF7', sealFillAlpha: 0.16, neutral: '#4E5A52', deadFill: '#FBFAF7', pill: '#FFFFFF', pillInk: '#5E554D',
    branch: BR_LIGHT, fonts: { name: 'naskhB', years: 'ui', initial: 'naskhB', title: 'ruqaa', text: 'ui' },
    fanP: ['#E9D9C7', '#EFE3D5'], fanM: ['#D9E2DA', '#E4EBE4'], fanEmpty: 'rgba(35,28,23,0.04)', fanLine: '#FBFAF7'
  },
  dark: {
    id: 'screen-dark', bg: 'transparent', halo: '#16110E', ink: '#EFE7DC', ink2: '#BDB2A5', ink3: '#8E8478', line: '#5D554C', lineW: 1.6,
    accent: '#F07065', thread: '#F07065', gold: '#E7B44A', band: 'rgba(255,240,220,0.04)', bandText: '#8E8478',
    paper: '#211A16', sealFillAlpha: 0.22, neutral: '#A9B8AE', deadFill: '#1A1411', pill: '#2B231E', pillInk: '#BDB2A5',
    branch: BR_DARK, fonts: { name: 'naskhB', years: 'ui', initial: 'naskhB', title: 'ruqaa', text: 'ui' },
    fanP: ['#3A2C22', '#433328'], fanM: ['#26332B', '#2D3B32'], fanEmpty: 'rgba(255,240,220,0.04)', fanLine: '#16110E'
  }
};

/* ---------- prints ---------- */
export const POSTER_THEMES = [
  {
    id: 'sadu', name: { ar: 'سدو', en: 'Sadu' },
    bg: '#F1EADC', ink: '#1D1714', ink2: '#5B4A3C', ink3: '#8A7765', line: '#7D6B5A', lineW: 1.5,
    accent: '#A3271F', thread: '#A3271F', gold: '#C8962E', band: 'rgba(29,23,20,0.045)', bandText: '#8A7765', paper: '#F1EADC',
    sealFillAlpha: 0.2, neutral: '#3D3029', deadFill: '#F1EADC', pill: '#FBF7EE', pillInk: '#5B4A3C',
    branch: ['#A3271F', '#1D1714', '#B9821A', '#6E2C1B', '#2F4B7C', '#7A3B69', '#2E6B4F', '#9A4E1C'],
    fonts: { name: 'naskhB', years: 'ui', initial: 'naskhB', title: 'kufi', text: 'ui', sub: 'naskh' },
    frame: 'sadu', fanP: ['#E8D6BF', '#EEE0CD'], fanM: ['#DCD3C6', '#E6DFD4'], fanEmpty: 'rgba(29,23,20,0.05)', fanLine: '#F1EADC'
  },
  {
    id: 'palm', name: { ar: 'نخيل', en: 'Palm' },
    bg: '#0F3A2E', ink: '#F4ECD8', ink2: '#D9CBA6', ink3: '#A89A74', line: '#C9A54C', lineW: 1.4,
    accent: '#E8C468', thread: '#F2D27A', gold: '#D9B45A', band: 'rgba(244,236,216,0.04)', bandText: '#A89A74', paper: '#0F3A2E',
    sealFillAlpha: 0.22, neutral: '#E8C468', deadFill: '#0F3A2E', pill: '#164A3B', pillInk: '#D9CBA6',
    branch: ['#E8C468', '#F4ECD8', '#D99A5B', '#9CCB9A', '#E0B3A0', '#B9D4C9', '#F0D9A0', '#C7B07A'],
    fonts: { name: 'amiriB', years: 'ui', initial: 'amiriB', title: 'ruqaa', text: 'ui', sub: 'amiri' },
    frame: 'arabesque', fanP: ['#1B4D3E', '#205646'], fanM: ['#24503F', '#2A5A48'], fanEmpty: 'rgba(244,236,216,0.05)', fanLine: '#0F3A2E'
  },
  {
    id: 'manuscript', name: { ar: 'مخطوطة', en: 'Manuscript' },
    bg: '#F2E6CB', ink: '#3A2A1A', ink2: '#6B5236', ink3: '#94795A', line: '#6B5236', lineW: 1.3,
    accent: '#8B1E1E', thread: '#8B1E1E', gold: '#A87A2A', band: 'rgba(58,42,26,0.05)', bandText: '#94795A', paper: '#F2E6CB',
    sealFillAlpha: 0.14, neutral: '#3A2A1A', deadFill: '#F2E6CB', pill: '#F8EFDA', pillInk: '#6B5236',
    branch: ['#8B1E1E', '#3A2A1A', '#2C4A6B', '#6B4A1E', '#4A5E2A', '#6B2C55', '#1E5B5B', '#7A5A2A'],
    fonts: { name: 'amiriB', years: 'amiri', initial: 'amiriB', title: 'ruqaa', text: 'amiri', sub: 'amiri' },
    frame: 'stars', fanP: ['#E7D3AC', '#EDDDBC'], fanM: ['#DCD5BC', '#E5DFC9'], fanEmpty: 'rgba(58,42,26,0.05)', fanLine: '#F2E6CB'
  },
  {
    id: 'modern', name: { ar: 'عصري', en: 'Modern' },
    bg: '#FFFFFF', ink: '#1C2230', ink2: '#525B6E', ink3: '#8A93A6', line: '#C3C9D4', lineW: 1.6,
    accent: '#D64535', thread: '#D64535', gold: '#E0A21B', band: 'rgba(28,34,48,0.035)', bandText: '#8A93A6', paper: '#FFFFFF',
    sealFillAlpha: 0.16, neutral: '#525B6E', deadFill: '#FFFFFF', pill: '#F3F5F8', pillInk: '#525B6E',
    branch: ['#D64535', '#2D6CDF', '#E0A21B', '#1E9E6A', '#8E44AD', '#0F9AAE', '#E26A1B', '#5B6478'],
    fonts: { name: 'uiB', years: 'ui', initial: 'uiB', title: 'uiB', text: 'ui', sub: 'ui' },
    frame: 'line', fanP: ['#FCE3DF', '#FDECE9'], fanM: ['#DDE8FB', '#E8EFFC'], fanEmpty: 'rgba(28,34,48,0.04)', fanLine: '#FFFFFF'
  },
  {
    id: 'night', name: { ar: 'ليلي', en: 'Night' },
    bg: '#12152A', ink: '#F1ECE1', ink2: '#C9C1AE', ink3: '#8D8A9E', line: '#5E5A7A', lineW: 1.4,
    accent: '#E8C468', thread: '#E8C468', gold: '#E8C468', band: 'rgba(241,236,225,0.035)', bandText: '#8D8A9E', paper: '#12152A',
    sealFillAlpha: 0.2, neutral: '#C9C1AE', deadFill: '#12152A', pill: '#1C2040', pillInk: '#C9C1AE',
    branch: ['#E8C468', '#9DB4FF', '#F29E7A', '#7FD1B9', '#D7A6F2', '#F2D49B', '#8FD3F2', '#C9C1AE'],
    fonts: { name: 'naskhB', years: 'ui', initial: 'naskhB', title: 'ruqaa', text: 'ui', sub: 'naskh' },
    frame: 'night', fanP: ['#232849', '#2A2F55'], fanM: ['#1F2D45', '#253552'], fanEmpty: 'rgba(241,236,225,0.05)', fanLine: '#12152A'
  }
];
export const posterTheme = id => POSTER_THEMES.find(t => t.id === id) || POSTER_THEMES[0];

/* colour helpers */
export function hexToRgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** a colour mixed into another (t = share of the first) → hex */
export function mix(a, b, t) {
  if (!/^#/.test(a) || !/^#/.test(b)) return a;
  const x = hexToRgb(a), y = hexToRgb(b);
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}
export const branchColor = (th, branch, colors = true) => (!colors ? th.neutral : branch >= 0 ? th.branch[branch % th.branch.length] : th.accent);
