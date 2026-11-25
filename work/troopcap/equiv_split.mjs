// 證明 R22 兩欄重構是「數值恆等」的：新 splitTroops() 與重構前 createWorld.mk() 的內聯式
// 在整個參數網格上逐位相同 ⇒ 本輪改動不可能改變任何戰鬥數值（測試/保真網的紅與它無關）。
// 用法: node work/troopcap/equiv_split.mjs
import { splitTroops, cavalryCapOf } from '../../game/dist/core/battle.js';

// 重構前的原式（game/src/core/battle.ts 15:12 之前）
function old(level, soldiers, cavalry) {
  const s = Math.max(0, Math.round(soldiers));
  const c = Math.max(0, Math.min(s, Math.round(cavalry ?? cavalryCapOf(level))));
  return { total: s, inf: s - c, cav: c };
}

const levels = [];
for (let l = -2; l <= 120; l += 1) levels.push(l);
for (const l of [0.5, 19.9, 20.1, 21.6, 25.5, 26.4, NaN]) levels.push(l);
const soldiers = [0, 1, 2, 5, 9, 10, 11, 49, 50, 60, 99, 100, 101, 130, 150, 199, 200, 201, 250, -5];
const cavalries = [undefined, 0, 1, 5, 10, 25, 30, 50, 99, 100, 130, 200, 300, -1, NaN];

let n = 0;
const bad = [];
for (const l of levels) {
  for (const s of soldiers) {
    for (const c of cavalries) {
      n += 1;
      const a = splitTroops(l, s, c);
      const b = old(l, s, c);
      if (!Object.is(a.total, b.total) || !Object.is(a.inf, b.inf) || !Object.is(a.cav, b.cav)) {
        if (bad.length < 5) bad.push({ l, s, c, a, b });
      }
    }
  }
}
console.log(`checked ${n} 組 (level × soldiers × cavalry)`);
console.log(bad.length ? `DIFF ${bad.length}+: ${JSON.stringify(bad[0])}` : 'IDENTICAL：全部逐位相同（含 NaN / 負數 / 超上限）');
process.exit(bad.length ? 1 : 0);
