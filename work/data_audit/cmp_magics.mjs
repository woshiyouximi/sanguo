// work/data_audit/cmp_magics.mjs
// 表：game/data/magics.json（110 条 × 10 字段）
// 权威源：extract/pak/MAGIC.INI 的 110 个 [MAGIC] 段（传统字原文）
// 二级交叉校验：extract/json/xls_武将技.json（简体宝典，5 个数值字段）
import { P, readIni, readJson, mkTable } from './lib.mjs';

export const FIELDS = ['SEQUENCE', 'NAME', 'MP', 'POWER', 'ATTACK', 'SCRIPT', 'ATTRIB', 'TITLE', 'NOTE', 'ACTIVE'];

const XLS_NUM = [
  ['SEQUENCE', 0], ['MP', 2], ['POWER', 3], ['ATTACK', 4], ['SCRIPT', 5],
];

// 本作 magics.json 额外带的演出字段（原作 INI 没有，不参与比对，记录在案）
const FX_KEYS = ['fx_dir', 'fx_dir_primary', 'fx_frames', 'fx_bytes', 'fx_basis', 'fx_func'];

function cmpIni(opts) {
  const ours = readJson(P.data('magics.json'));
  const ini = readIni(P.magicIni).filter((s) => s.head === 'MAGIC');
  const t = mkTable('magics', { ...opts, source: 'MAGIC.INI [MAGIC]' });
  t.rows = Math.max(ours.length, ini.length);
  if (ours.length !== ini.length) t.add('<行数>', -1, '<count>', ini.length, ours.length);
  ini.forEach((sec, i) => {
    const o = ours[i] || {};
    const label = `${i + 1}:${sec.get('NAME') ?? '?'}`;
    for (const f of FIELDS) t.add(label, i, f, sec.get(f), o[f]);
    const extra = Object.keys(o).filter((k) => !FIELDS.includes(k) && !FX_KEYS.includes(k));
    if (extra.length) t.add(label, i, '<多余键>', '', extra.join(','));
  });
  t.noteUncomparable(FX_KEYS.join(','), '本作新增的精灵/演出元数据，MAGIC.INI 与宝典均无对应列', 0);
  return t.done();
}

function cmpXls(opts) {
  const ours = readJson(P.data('magics.json'));
  const xls = readJson(P.xls('武将技'));
  const t = mkTable('magics_xls', { ...opts, source: 'xls_武将技.json（简体宝典，数值）' });
  t.rows = xls.rows.length;
  if (xls.rows.length !== ours.length) t.add('<行数>', -1, '<count>', xls.rows.length, ours.length);
  xls.rows.forEach((row, i) => {
    const o = ours[i] || {};
    for (const [field, col] of XLS_NUM) {
      t.add(`${i + 1}:${row[1]}`, i, field, row[col], o[field]);
    }
  });
  t.noteUncomparable('NAME/ATTRIB/TITLE/NOTE/ACTIVE',
    '宝典为简体（属性列写成「补血/全体」等短语），本作为 MAGIC.INI 繁体原文；文本字段已由 MAGIC.INI 侧全字段精确比对',
    5 * xls.rows.length);
  return t.done();
}

export function run(opts = {}) {
  return [cmpIni(opts), cmpXls(opts)];
}
