// 判定性统计：哪些 syscall 只在"有效"组 / 只在"无效果"组出现。
import { readFileSync } from 'node:fs';
const A = JSON.parse(readFileSync('F:/sanguo/work/skillwait/analysis.json', 'utf8'));
const rows = A.rows;
const has = (r, id) => r.nSys.includes(id);
const ids = new Set();
for (const r of rows) for (const s of r.nSys) ids.add(s);
const table = [];
for (const id of [...ids].sort((a, b) => a - b)) {
  const e = rows.filter((r) => r.effect && has(r, id)).length;
  const n = rows.filter((r) => !r.effect && has(r, id)).length;
  table.push({ id, e, n });
}
console.log('id      eff  no   note');
for (const t of table) {
  const mark = (t.n > 0 && t.e === 0) ? '  << ONLY-NO-EFFECT' : (t.n === 0 && t.e > 0 ? '  (only-effect)' : '');
  console.log(`0x${t.id.toString(16).toUpperCase().padStart(4, '0')}  ${String(t.e).padStart(3)} ${String(t.n).padStart(3)}${mark}`);
}
const noEff = rows.filter((r) => !r.effect);
console.log('\n无效果 42 条的 0x125(Hurt) 覆盖:', noEff.filter((r) => has(r, 0x125)).map((r) => r.seq).join(',') || '(无)');
console.log('有效 68 条的 0x125 覆盖:', rows.filter((r) => r.effect && has(r, 0x125)).length, '/', rows.filter((r) => r.effect).length);
console.log('\n无效果 42 条的 0x11(在单位位置生成物件) 覆盖:', noEff.filter((r) => has(r, 0x11)).map((r) => r.seq).join(',') || '(无)');
console.log('无效果 42 条的 0x10/0x23/0x24(直接生成物件) 覆盖:', noEff.filter((r) => has(r, 0x10) || has(r, 0x23) || has(r, 0x24)).map((r) => r.seq).join(',') || '(无)');
console.log('无效果 42 条的 0x113(unitAtPx) 覆盖:', noEff.filter((r) => has(r, 0x113)).map((r) => r.seq).join(',') || '(无)');
console.log('无效果 42 条的 0x119(召唤) 覆盖:', noEff.filter((r) => has(r, 0x119)).map((r) => r.seq).join(',') || '(无)');
console.log('无效果 42 条的 0x118 覆盖:', noEff.filter((r) => has(r, 0x118)).map((r) => r.seq).join(',') || '(无)');
