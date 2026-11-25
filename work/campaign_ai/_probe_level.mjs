import { readFileSync } from 'node:fs';
import { levelFromExp, expForLevel, defenderBattleParams } from 'file:///F:/sanguo/game/dist/core/garrison.js';
const gen = JSON.parse(readFileSync('F:/sanguo/game/data/generals.json','utf8'));
const rows = Array.isArray(gen) ? gen : (gen.generals || gen.GENERAL || []);
console.log('rows', rows.length);
const exp = new Map();
for (const r of rows) { const k = String(r.BaseEXP ?? ''); exp.set(k, (exp.get(k)||0)+1); }
console.log('BaseEXP histogram', [...exp.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log('expForLevel 1..5', [1,2,3,4,5].map(l=>expForLevel(l)));
console.log('levelFromExp 0/200/9999', levelFromExp(0), levelFromExp(200), levelFromExp(9999));
for (const n of ['關羽','張飛','呂布','盜賊','曹操']) {
  const r = rows.find(x=>x.NAME===n);
  if (r) console.log(n, 'BaseEXP', r.BaseEXP, '-> Lv', levelFromExp(Number(r.BaseEXP)||0), 'soldiers', defenderBattleParams({name:n,str:r.STR,int:r.INT}, r).soldiers);
}
