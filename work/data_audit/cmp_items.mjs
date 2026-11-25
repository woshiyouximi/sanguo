// work/data_audit/cmp_items.mjs
// 表：game/data/items.json（77 条 × 25 字段）
// 权威源：extract/pak/SANGO.INI 的 77 个 [ITEM] 段（传统字原文，25 键与 JSON 一一对应）
// 二级交叉校验：extract/json/xls_物品.json（简体宝典，仅比 19 个数值字段）
import { P, readIni, readJson, mkTable } from './lib.mjs';

export const FIELDS = [
  'Sequence', 'Name', 'Attrib', 'TYPE', 'WeaponType', 'WeaponObject', 'SearchType',
  'Sort', 'Level', 'Sprite', 'Rate', 'STR', 'INT', 'MaxHP', 'MaxMP', 'Force',
  'Battle', 'Skill', 'Speed', 'HP', 'MP', 'Spirit', 'Loyal', 'Tire', 'Description',
];

// xls_物品 列序（header 已核对）→ items 字段
const XLS_NUM = [
  ['WeaponType', 4], ['WeaponObject', 5], ['SearchType', 6], ['Sort', 7],
  ['Level', 8], ['Rate', 10], ['STR', 11], ['INT', 12], ['MaxHP', 13],
  ['MaxMP', 14], ['Force', 15], ['Battle', 16], ['Skill', 17], ['Speed', 18],
  ['HP', 19], ['MP', 20], ['Spirit', 21], ['Loyal', 22], ['Tire', 23],
];

function cmpIni(opts) {
  const ours = readJson(P.data('items.json'));
  const ini = readIni(P.sangoIni).filter((s) => s.head === 'ITEM');
  const t = mkTable('items', { ...opts, source: 'SANGO.INI [ITEM]' });
  t.rows = Math.max(ours.length, ini.length);
  if (ours.length !== ini.length) {
    t.add('<行数>', -1, '<count>', ini.length, ours.length);
  }
  ini.forEach((sec, i) => {
    const o = ours[i] || {};
    const label = `${i + 1}:${sec.get('Name') ?? '?'}`;
    for (const f of FIELDS) {
      t.add(label, i, f, sec.get(f), o[f]);
    }
    // 键集：本作不得多出原作没有的键
    const extra = Object.keys(o).filter((k) => !FIELDS.includes(k));
    if (extra.length) t.add(label, i, '<多余键>', '', extra.join(','));
  });
  return t.done();
}

function cmpXls(opts) {
  const ours = readJson(P.data('items.json'));
  const xls = readJson(P.xls('物品'));
  const t = mkTable('items_xls', { ...opts, source: 'xls_物品.json（简体宝典，数值）' });
  t.rows = xls.rows.length;
  // ★ 宝典的行序被按 Sort 升序重排过（47..51 与 52/54 两段与 INI 顺序相反），
  //   所以不能按行号对齐，必须用 Sort（类别，1..77 唯一）作稳定键。
  const bySort = new Map(xls.rows.map((r) => [Number(r[7]), r]));
  const ourSorts = new Set(ours.map((o) => Number(o.Sort)));
  for (const s of ourSorts) {
    if (!bySort.has(s)) t.add(`<Sort=${s}>`, -1, '<Sort 缺失>', '', '缺失');
  }
  for (const s of bySort.keys()) {
    if (!ourSorts.has(s)) t.add(`<Sort=${s}>`, -1, '<Sort 多余>', s, '');
  }
  for (const o of ours) {
    const sort = Number(o.Sort);
    const row = bySort.get(sort);
    if (!row) continue;
    const label = `${sort}:${o.Name}`;
    for (const [field, col] of XLS_NUM) t.add(label, sort, field, row[col], o[field]);
  }
  t.noteUncomparable('Name/Attrib/TYPE/Sprite/Description',
    '宝典为简体、本作为 SANGO.INI 繁体原文（用字转换）；文本字段已由 SANGO.INI 侧全字段精确比对。另：宝典行序按 Sort 重排过，本表按 Sort 对齐',
    5 * xls.rows.length);
  return t.done();
}

export function run(opts = {}) {
  return [cmpIni(opts), cmpXls(opts)];
}
