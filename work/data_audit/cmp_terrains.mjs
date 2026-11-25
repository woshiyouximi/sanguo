// work/data_audit/cmp_terrains.mjs
// 表：game/data/terrains.json（12 地形）
// 源 A：extract/pak/SANGO.INI 的 12 个 [TERRAIN] 段 —— Name/Sequence/SoundTrack/Floor/Fore/Mid/Back
//       （注意：[TERRAIN] 段里没有 vs 字段）
// 源 B：docs/04b_战斗系统.md §3.2（EXE 0x0048D030 反汇编表，12 地形 × 13 兵种 = 156 格）
import { P, readIni, readJson, readMdTable, mkTable, normScalar } from './lib.mjs';

const SCALAR = ['Name', 'Sequence', 'SoundTrack', 'Floor'];
const PAIRS = ['Foreground', 'Midground', 'Background'];

function cmpIni(opts) {
  const ours = readJson(P.data('terrains.json'));
  const ini = readIni(P.sangoIni).filter((s) => s.head === 'TERRAIN');
  const t = mkTable('terrains', { ...opts, source: 'SANGO.INI [TERRAIN]' });
  t.rows = Math.max(ours.length, ini.length);
  if (ours.length !== ini.length) t.add('<行数>', -1, '<count>', ini.length, ours.length);
  ini.forEach((sec, i) => {
    const o = ours[i] || {};
    const label = `${i}:${sec.get('Name') ?? '?'}`;
    for (const f of SCALAR) t.add(label, i, f, sec.get(f), o[f]);
    for (const f of PAIRS) {
      const vals = sec.all(f);
      t.add(label, i, `${f}[0]`, vals[0], (o[f] || [])[0]);
      t.add(label, i, `${f}[1]`, vals[1], (o[f] || [])[1]);
    }
    // 段内不该出现别的键（Foreground 等重复键不算）
    const extraKeys = sec.keys().filter((k) => !SCALAR.includes(k) && !PAIRS.includes(k));
    if (extraKeys.length) t.add(label, i, '<多余键>', '', extraKeys.join(','));
    t.add(label, i, '_index', i, o._index);
  });
  return t.done();
}

function cmpDocs(opts) {
  const ours = readJson(P.data('terrains.json'));
  const md = readMdTable(P.doc04b, '3.2 地形 × 兵种');
  const t = mkTable('terrains_docs', { ...opts, source: 'docs/04b §3.2（EXE 0x0048D030 反汇编表）' });
  t.rows = md.rows.length;
  for (let j = 0; j < 13; j++) {
    t.add(`列头 ${j}`, -1 - j, '<colHeader>', md.header[j + 1], String(j));
  }
  md.rows.forEach((row, i) => {
    const m = /^(\d+)/.exec(row[0].trim());
    const idx = m ? Number(m[1]) : i;
    const o = ours[idx] || { vs: [] };
    t.add(`行序 ${idx}`, idx, '<rowIndex>', idx, i);
    for (let j = 0; j < 13; j++) {
      t.add(`${idx}:${o.Name ?? '?'}`, idx, `vs[${j}]`, normScalar(row[j + 1]), (o.vs || [])[j]);
    }
  });
  return t.done();
}

export function run(opts = {}) {
  return [cmpIni(opts), cmpDocs(opts)];
}
