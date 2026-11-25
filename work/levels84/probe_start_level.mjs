// 临时探针：从 data/generals.json 取 STR/INT，算 [新设计] 起始等级与带兵上限。
// 用法：node work/levels84/probe_start_level.mjs [名...]
import fs from 'node:fs';

const GEN = JSON.parse(fs.readFileSync(new URL('../../game/data/generals.json', import.meta.url), 'utf8'));
const START_LEVEL_MIN = 6;
const START_LEVEL_MAX = 20;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const startLevelOf = (g) => {
  const str = Math.trunc(num(g?.STR ?? g?.str));
  const int = Math.trunc(num(g?.INT ?? g?.int));
  return clamp(1 + Math.floor((str + int) / 40), START_LEVEL_MIN, START_LEVEL_MAX);
};
const troopCapOf = (lv) => Math.max(0, Math.min(100, 5 * Math.max(1, Math.trunc(num(lv, 1)))));

const names = process.argv.slice(2);
const want = names.length ? names : ['關羽', '張飛', '呂布', '諸葛亮', '曹仁', '嚴白虎', '張角', '華佗', '兀突骨', '張英'];
console.log('generals.json 元素数 =', Array.isArray(GEN) ? GEN.length : '(非数组)');
const baseExp = new Map();
for (const g of GEN) if (g && g.NAME) baseExp.set(g.BaseEXP, (baseExp.get(g.BaseEXP) || 0) + 1);
console.log('BaseEXP 分布 =', JSON.stringify([...baseExp.entries()].slice(0, 8)));
for (const n of want) {
  const g = GEN.find((x) => x && x.NAME === n);
  if (!g) { console.log(`${n}\t(找不到)`); continue; }
  const lv = startLevelOf(g);
  console.log(`${n}\tSTR=${g.STR}\tINT=${g.INT}\tSUM=${g.STR + g.INT}\t1+floor/40=${1 + Math.floor((g.STR + g.INT) / 40)}\tstartLevel=${lv}\ttroops=${troopCapOf(lv)}\tBaseEXP=${g.BaseEXP}`);
}
// 全 400 将的分布
const dist = new Map();
for (const g of GEN) {
  if (!g || !g.NAME || g.NAME === '盜賊') continue;
  const lv = startLevelOf(g);
  dist.set(lv, (dist.get(lv) || 0) + 1);
}
console.log('400 将起始等级分布 =', JSON.stringify([...dist.entries()].sort((a, b) => a[0] - b[0])));
