// work/data_audit/cmp_formations.mjs
// 表：game/data/formations.json（9 阵形 × 11 列相克 = 99 格；matrix_names 11）
// 源 A：extract/json/xls_阵形.json（宝典只收 9 阵 × 9 阵 = 81 格）
// 源 B：docs/04b_战斗系统.md §3.3（EXE 0x0048D2A0 反汇编表，完整 11×11 = 121 格）
//       —— 覆盖宝典没有的第 10/11 列（特殊陣型 / 亂陣），因此该两列属「可比的文档反汇编表」而非不可比。
import { P, readJson, readMdTable, mkTable, normScalar } from './lib.mjs';

function cmpXls(opts) {
  const g = readJson(P.data('formations.json'));
  const xls = readJson(P.xls('阵形'));
  const t = mkTable('formations', { ...opts, source: 'xls_阵形.json（宝典 9×9）' });
  t.rows = xls.rows.length;
  for (let j = 0; j < 9; j++) {
    t.add(`列名 ${j}`, -1 - j, '<name>', xls.header[j + 1], g.names[j]);
  }
  xls.rows.forEach((row, i) => {
    const o = g.matrix[i] || { vs: [] };
    t.add(`行名 ${i}`, i, '<name>', row[0], o.name);
    for (let j = 0; j < 9; j++) {
      t.add(`${i}:${row[0]}`, i, `vs[${j}]`, row[j + 1], (o.vs || [])[j]);
    }
  });
  return t.done();
}

function cmpDocs(opts) {
  const g = readJson(P.data('formations.json'));
  const md = readMdTable(P.doc04b, '3.3 阵法相克');
  const t = mkTable('formations_docs', { ...opts, source: 'docs/04b §3.3（EXE 0x0048D2A0 反汇编表 11×11）' });
  t.rows = md.rows.length;
  for (let j = 0; j < 11; j++) {
    const n = /^(\d+)/.exec(String(md.header[j + 1] || '').trim());
    t.add(`列头 ${j}`, -1 - j, '<colHeader>', n ? n[1] : md.header[j + 1], String(j));
  }
  md.rows.forEach((row, i) => {
    const m = /^(\d+)\s*(.*)$/.exec(row[0]);
    const idx = m ? Number(m[1]) : i;
    const o = g.matrix[idx] || { vs: [] };
    t.add(`行序 ${idx}`, idx, '<rowIndex>', idx, i);
    for (let j = 0; j < 11; j++) {
      t.add(`${idx}:${g.matrix_names[idx]}`, idx, `vs[${j}]`, normScalar(row[j + 1]), (o.vs || [])[j]);
    }
  });
  t.noteUncomparable('阵形名用字', '反汇编表是本作繁体（圓形/魚麗/鉤形/衝鋒/亂陣），game/data 用简体（圆形/鱼丽/钩形/冲锋/乱阵）；顺序已按索引逐个核对', 11);
  return t.done();
}

export function run(opts = {}) {
  return [cmpXls(opts), cmpDocs(opts)];
}
