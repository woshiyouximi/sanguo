// R83 探针：110 条武将技逐条 runSkill，统计 ok / fx / 命中。
// 只读产品代码；输出写到 work/audit83/probe_magics_r83.txt。
import { loadData } from '../../game/src/data.ts';
import { createWorld } from '../../game/src/core/battle.ts';
import { runSkill } from '../../game/src/core/smartscript/runtime.ts';

const data = loadData();

function staged(seed = 7) {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = 24; g.prevY = 6.5;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

const magics = data.magics;
let ok = 0, fx = 0, hit = 0, syscalls = 0;
const fails = [];
const fxFails = [];
const hitFails = [];
for (const m of magics) {
  const world = staged();
  let r;
  try {
    r = runSkill(world, 'A', m.SCRIPT, 20, 6.5);
  } catch (e) {
    fails.push(`${m.SEQUENCE}/${m.NAME}: throw ${e.message}`);
    continue;
  }
  if (r.ok) ok++; else fails.push(`${m.SEQUENCE}/${m.NAME} script=${m.SCRIPT}: ${r.log.join(' | ').slice(0, 160)}`);
  if (world.fx.length > 0) fx++; else fxFails.push(`${m.SEQUENCE}/${m.NAME}`);
  const total = (r.stats && (r.stats.hits ?? r.stats.totalHits)) ?? 0;
  if (total > 0) hit++; else hitFails.push(`${m.SEQUENCE}/${m.NAME}`);
  syscalls += (r.stats && r.stats.syscalls) || 0;
}

const lines = [];
lines.push(`magics.json entries      : ${magics.length}`);
lines.push(`runSkill ok              : ${ok}`);
lines.push(`world.fx 非空            : ${fx}`);
lines.push(`stats.hits/totalHits > 0 : ${hit}`);
lines.push(`syscalls 总计             : ${syscalls}`);
lines.push(`--- 失败清单 (${fails.length}) ---`);
lines.push(...fails);
lines.push(`--- 无 fx (${fxFails.length}) ---`);
lines.push(...fxFails);
lines.push(`--- 无命中 (${hitFails.length}) ---`);
lines.push(...hitFails);
const out = lines.join('\n');
console.log(out);
import fs from 'node:fs';
fs.writeFileSync('F:/sanguo/work/audit83/probe_magics_r83.txt', out + '\n', 'utf8');
