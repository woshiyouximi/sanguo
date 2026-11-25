// work/data_audit/cmp_troops.mjs
// 表：game/data/troops.json（13 兵种 × 13 相克 = 169 格 + 13 名称）
// 源 A：extract/json/xls_兵种.json（宝典 13×13）
// 源 B：docs/04b_战斗系统.md §3.1（EXE 0x0048CD88 反汇编表；无游戏 EXE，只能引文档）
import { P, readJson, readMdTable, mkTable, normScalar } from './lib.mjs';

function cmpXls(opts) {
  const g = readJson(P.data('troops.json'));
  const xls = readJson(P.xls('兵种'));
  const t = mkTable('troops', { ...opts, source: 'xls_兵种.json（宝典 13×13）' });
  t.rows = xls.rows.length;
  // 名称：宝典是简体、本作也是简体 → 直接比
  for (let j = 0; j < xls.header.length - 1; j++) {
    t.add(`列名 ${j}`, -1 - j, '<name>', xls.header[j + 1], g.names[j]);
  }
  xls.rows.forEach((row, i) => {
    const o = g.matrix[i] || { vs: [] };
    t.add(`行名 ${i}`, i, '<name>', row[0], o.name);
    for (let j = 0; j < 13; j++) {
      t.add(`${i}:${row[0]}`, i, `vs[${j}]`, row[j + 1], (o.vs || [])[j]);
    }
  });
  return t.done();
}

function cmpDocs(opts) {
  const g = readJson(P.data('troops.json'));
  const md = readMdTable(P.doc04b, '3.1 兵种相克');
  const t = mkTable('troops_docs', { ...opts, source: 'docs/04b §3.1（EXE 0x0048CD88 反汇编表）' });
  t.rows = md.rows.length;
  // 表头/行名的用字是繁体（長槍/鏈錘/武鬥/鐵縋），本作是简体，只校验 13 行/列顺序能对上
  for (let j = 0; j < 13; j++) {
    t.add(`列头 ${j}`, -1 - j, '<colHeader>', md.header[j + 1], String(j));
  }
  md.rows.forEach((row, i) => {
    const m = /^(\d+)\s*(.*)$/.exec(row[0]);
    const idx = m ? Number(m[1]) : i;
    const o = g.matrix[idx] || { vs: [] };
    t.add(`行序 ${idx}`, idx, '<rowIndex>', idx, i);
    for (let j = 0; j < 13; j++) {
      t.add(`${idx}:${o.name ?? m?.[2]}`, idx, `vs[${j}]`, normScalar(row[j + 1]), (o.vs || [])[j]);
    }
  });
  t.noteUncomparable('行/列名用字', '反汇编表用的是繁体（長槍/鏈錘/武鬥/鐵縋），本作 troops.names 用简体（长枪/链锤/武斗/铁缒）；名称只需 1:1 对应，不作逐字比对', 26);
  return t.done();
}

export function run(opts = {}) {
  return [cmpXls(opts), cmpDocs(opts)];
}
