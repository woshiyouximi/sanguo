// 临时探针：从 sim_report JSON 里挑出指定组的明细
import { readFileSync } from 'node:fs';
const file = process.argv[2] ?? 'work/sim_smoke.json';
const j = JSON.parse(readFileSync(file, 'utf8'));
const g = j.groups;
if (g.troop) {
  console.log('== troop 对角镜像 ==');
  for (const c of g.troop.cells.filter((c) => c.i === c.j)) {
    console.log(`${g.troop.names[c.i].padEnd(3, '　')} n=${c.n} A胜=${c.aWins} B胜=${c.bWins} 率=${c.aWinRate} 中位=${c.medianSec}s 命中A=${c.hitRateA} 命中B=${c.hitRateB} 将死=${c.genDeadA}/${c.genDeadB} 结束=${JSON.stringify(c.endReasons)}`);
  }
  console.log('== troop 极端对 ==');
  for (const c of g.troop.pairs.filter((p) => p.rate >= 0.99 || p.rate <= 0.01).slice(0, 20)) {
    console.log(`${c.a} vs ${c.b} 表值=${String(c.value).padStart(4)} 实测=${c.rate} n=${c.n}`);
  }
  console.log('== troop 少数派样本 ==');
  for (const c of g.troop.pairs.slice(0, 6)) console.log(`${c.a} vs ${c.b} 表值=${c.value} 实测=${c.rate}`);
}
if (g.morale) {
  console.log('== morale ==');
  for (const s of g.morale.series) console.log(`${s.morale}: asym=${s.asymRate} (${s.asymN}) mirror=${s.mirrorRate} (${s.mirrorN}) sec=${s.asymSec}/${s.mirrorSec}`);
}
if (g.general) {
  console.log('== general ==');
  for (const s of g.general.series) console.log(`str=${s.str} win=${s.aWinRate} sec=${s.medianSec} hp=${s.hp} genDead=${s.genDeadA}/${s.genDeadB} generalEnds=${s.generalEnds}`);
}
