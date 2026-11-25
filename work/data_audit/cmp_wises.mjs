// work/data_audit/cmp_wises.mjs
// 表：game/data/wises.json（67 条 × 7 字段）
// 权威源：extract/pak/MAGIC.INI 的 67 个 [WISE] 段（传统字原文）
// 二级交叉校验：extract/json/xls_军师技.json（简体宝典，6 个数值字段）
import { P, readIni, readJson, mkTable } from './lib.mjs';

export const FIELDS = ['SEQUENCE', 'Execute', 'WiseLevel', 'NAME', 'ATTRIB', 'Level', 'ACTIVE'];

const XLS_NUM = [
  ['SEQUENCE', 0], ['Execute', 1], ['WiseLevel', 2],
  ['ATTRIB', 4], ['Level', 5], ['ACTIVE', 6],
];

function cmpIni(opts) {
  const ours = readJson(P.data('wises.json'));
  const ini = readIni(P.magicIni).filter((s) => s.head === 'WISE');
  const t = mkTable('wises', { ...opts, source: 'MAGIC.INI [WISE]' });
  t.rows = Math.max(ours.length, ini.length);
  if (ours.length !== ini.length) t.add('<行数>', -1, '<count>', ini.length, ours.length);
  ini.forEach((sec, i) => {
    const o = ours[i] || {};
    const label = `${i + 1}:${sec.get('NAME') ?? '?'}`;
    for (const f of FIELDS) t.add(label, i, f, sec.get(f), o[f]);
    const extra = Object.keys(o).filter((k) => !FIELDS.includes(k));
    if (extra.length) t.add(label, i, '<多余键>', '', extra.join(','));
  });
  return t.done();
}

function cmpXls(opts) {
  const ours = readJson(P.data('wises.json'));
  const xls = readJson(P.xls('军师技'));
  const t = mkTable('wises_xls', { ...opts, source: 'xls_军师技.json（简体宝典，数值）' });
  t.rows = xls.rows.length;
  if (xls.rows.length !== ours.length) t.add('<行数>', -1, '<count>', xls.rows.length, ours.length);
  xls.rows.forEach((row, i) => {
    const o = ours[i] || {};
    for (const [field, col] of XLS_NUM) {
      t.add(`${i + 1}:${row[3]}`, i, field, row[col], o[field]);
    }
  });
  t.noteUncomparable('NAME', '宝典为简体、本作为 MAGIC.INI 繁体原文（NAME 已由 INI 侧精确比对）', xls.rows.length);
  return t.done();
}

export function run(opts = {}) {
  return [cmpIni(opts), cmpXls(opts)];
}
