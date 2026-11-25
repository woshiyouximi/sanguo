// 163 探针：神鬼亂舞(104) 两个分支（else / 主段）的物件落点与回调命中对比。
// 注意：`RunSkillResult.objects` 的 x/y **已经是格坐标**（objectSummaries 里除过 96/72）。
import { fileURLToPath } from 'node:url';
import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';

const data = loadData({ dir: fileURLToPath(new URL('../game/data/', import.meta.url)) });
const m = data.magics.find((x) => x.SEQUENCE === 104);

function run(gbTileX, soldiers) {
  const world = createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'B', str: 60, int: 70 } },
  });
  const ga = world.units.find((u) => u.isGeneral && u.side === 'A');
  ga.x = 24; ga.y = 6.5; ga.prevX = 24; ga.prevY = 6.5;
  const gb = world.units.find((u) => u.isGeneral && u.side === 'B');
  gb.x = gbTileX; gb.y = 6.5; gb.prevX = gbTileX; gb.prevY = 6.5;
  const hp0 = world.sides.B.general.hp;
  const r = runSkill(world, 'A', m.SCRIPT, 20, 6.5);
  const live = r.objects.filter((o) => !o.dead);
  const hist = new Map();
  for (const o of live) {
    const k = `${o.resource}@(${o.x},${o.y})`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  return { r, hp0, hp1: world.sides.B.general.hp, live, hist };
}

let i = 0;
for (const [label, gbX, soldiers] of [['else(B@15.5,s20)', 15.5, 20], ['main(B@23,s20)', 23, 20]]) {
  const { r, hp0, hp1, live, hist } = run(gbX, soldiers);
  console.log(
    `--- ${label}: hits=${r.stats.hits} killed=${r.stats.killed} healed=${r.stats.healed} objects=${r.stats.objects} ins=${r.stats.instructions} live=${live}`,
  );
  console.log(`    HPB ${hp0}->${hp1} fx=${JSON.stringify(r.log.filter((l) => l.startsWith('fx'))) }`);
  console.log('    ' + [...hist.entries()].map(([k, v]) => `${k}x${v}`).join(' '));
  console.log('    log: ' + r.log.slice(-6).join(' | '));
  i += 1;
}
console.log(`ran ${i}`);
