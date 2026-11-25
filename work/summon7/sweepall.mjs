import { createWorld, QI_MAX } from '../../game/src/core/battle.ts';
import { runSkill } from '../../game/src/core/smartscript/runtime.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const alive = (w, s) => w.units.filter((u) => u.side === s && !u.isGeneral && u.alive).length;

function run(seq) {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  const world = createWorld({ data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } } });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  const b0 = alive(world, 'B'); const a0 = alive(world, 'A');
  const r = runSkill(world, 'A', m.SCRIPT, 20, 6.5);
  return { seq, name: m.NAME, ok: r.ok, hits: r.stats.hits, killed: b0 - alive(world, 'B'), add: alive(world, 'A') - a0 };
}

const rows = data.magics.filter((m) => typeof m.SEQUENCE === 'number').map((m) => run(m.SEQUENCE));
console.log(`技能数=${rows.length} hits>0=${rows.filter(r=>r.hits>0).length} killed>0=${rows.filter(r=>r.killed>0).length} add>0=${rows.filter(r=>r.add>0).length} ok=false=${rows.filter(r=>!r.ok).length}`);
for (const r of rows) console.log(${r.seq},,,,);
