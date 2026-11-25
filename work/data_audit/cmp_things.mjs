// work/data_audit/cmp_things.mjs
// 表：game/data/things.json（621 个物件）+ game/data/things_define.json（[SYSTEM]/[DEFINE]）
// 权威源：extract/pak/THINGS.INI（[SYSTEM] + [DEFINE] + [OBJECT]×620 + [OBJECT2]×1）
//
// 说明：THINGS.INI 的 [DEFINE] 里有 3 行 `#Flags   = OF_BOMB`（原作注释行），
//       extract 把它当键存成了 `#Flags`，此处照原样比对，并在报告里注明它不是数据字段。
import { P, readIni, readJson, mkTable } from './lib.mjs';

function cmpObjects(opts) {
  const ours = readJson(P.data('things.json'));
  const ini = readIni(P.thingsIni);
  const objs = ini.filter((s) => s.head === 'OBJECT' || s.head === 'OBJECT2');
  const t = mkTable('things', { ...opts, source: 'THINGS.INI [OBJECT]/[OBJECT2]' });
  t.rows = Math.max(ours.length, objs.length);
  if (ours.length !== objs.length) t.add('<行数>', -1, '<count>', objs.length, ours.length);
  objs.forEach((sec, i) => {
    const o = ours[i] || {};
    const label = `${i}:${sec.get('Name') ?? '?'}`;
    const keys = new Set([...sec.keys(), ...Object.keys(o)]);
    for (const k of keys) {
      const ov = sec.get(k);
      const gv = o[k];
      if (ov === undefined) t.add(label, i, `<多余键 ${k}>`, '', gv);
      else if (gv === undefined) t.add(label, i, k, ov, '<缺失>');
      else t.add(label, i, k, ov, gv);
    }
  });
  const hash = objs.filter((s) => s.keys().some((k) => k.startsWith('#'))).length;
  t.noteUncomparable('#Flags', `原作 THINGS.INI 里有 ${hash} 行以 # 开头的注释行（#Flags = OF_BOMB），extract 当成键写进了 things.json；本作原样保留，不算数据差异`, hash);
  return t.done();
}

function cmpDefine(opts) {
  const g = readJson(P.data('things_define.json'));
  const ini = readIni(P.thingsIni);
  const sys = ini.find((s) => s.head === 'SYSTEM');
  const def = ini.find((s) => s.head === 'DEFINE');
  const t = mkTable('things_define', { ...opts, source: 'THINGS.INI [SYSTEM]/[DEFINE]' });
  t.rows = 1;
  t.add('<SYSTEM>', -1, 'TotalObjectDefine', sys.get('TotalObjectDefine'), (g.SYSTEM || {}).TotalObjectDefine);
  const gDef = g.DEFINE || {};
  const keys = new Set([...def.keys(), ...Object.keys(gDef)]);
  let n = 0;
  for (const k of keys) {
    const ov = def.get(k);
    const gv = gDef[k];
    if (ov === undefined) t.add('[DEFINE]', -1, `<多余键 ${k}>`, '', gv);
    else if (gv === undefined) t.add('[DEFINE]', -1, k, ov, '<缺失>');
    else t.add('[DEFINE]', -1, k, ov, gv);
    n++;
  }
  t.rows = n;
  t.noteUncomparable('[DEFINE] 自由文本行',
    '原文有 3 行说明文字（`001-099 師團物件` 等），不是键值对，解析时跳过，两边都不存在',
    3);
  return t.done();
}

export function run(opts = {}) {
  return [cmpObjects(opts), cmpDefine(opts)];
}
