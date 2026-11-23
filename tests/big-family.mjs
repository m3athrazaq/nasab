// An invented big family for the tests (never anyone's real family): generations of men with three
// sons and a daughter each — 485 people in six generations.
export function bigFamily(gens = 6) {
  const names = ['محمد', 'عبدالله', 'أحمد', 'خالد', 'سالم', 'ناصر', 'فهد', 'يوسف', 'سعد', 'بدر', 'عبدالرحمن', 'فيصل', 'سليمان', 'إبراهيم'];
  const girls = ['نورة', 'مريم', 'فاطمة', 'هيا', 'سارة', 'منيرة', 'لطيفة'];
  const people = {}, unions = {};
  let k = 0, at = 1700000000000;
  const add = (g, pu, depth) => {
    const id = 'big' + k;
    const n = g === 'm' ? names[k % names.length] : girls[k % girls.length];
    const year = 1850 + depth * 28 + (k % 9);
    people[id] = { id, n, g, b: String(year), d: depth < 3 ? String(year + 70) : '', dead: depth < 3, pu, at: at++ };
    k++;
    return id;
  };
  const grow = (id, depth) => {
    if (depth >= gens - 1) return;
    const u = 'bigu' + id;
    unions[u] = { id: u, h: id, w: '', st: 'm', md: '' };
    for (let i = 0; i < 4; i++) {
      const c = add(i === 2 ? 'f' : 'm', u, depth + 1);
      if (i !== 2) grow(c, depth + 1);
    }
  };
  const root = add('m', '', 0);
  people[root].fam = 'الكبير';
  grow(root, 0);
  return { people, unions, me: root, root };
}

