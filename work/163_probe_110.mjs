/**
 * 163 探针：110 条武将技「有任何效果」的逐条统计（验收门槛 5）。
 *
 * 「效果」按 159 单的口径拆成 5 个可观察桶，任一非零就算有效果：
 *   hits      —— `applyHits` 结算过的命中点（含碰撞回调 `collideCallbacks`）
 *   killed    —— 打死的兵
 *   healed    —— 治到的血量
 *   objects   —— 脚本造出的物件数（特效/飞行体）
 *   syscalls  —— 执行过的 syscall 条数（脚本真的跑起来了）
 *
 * 世界与 smartscript.test.ts 的 `staged()` 完全一致（同 seed、A 主将 (24,6.5)、双方 20 兵）。
 */
import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';

const data = loadData();

function staged(seed = 7) {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

const rows = [];
for (const m of data.magics) {
  const world = staged();
  const script = m.SCRIPT;
  const r = runSkill(world, 'A', script, 20, 6.5);
  const s = r.stats;
  const fx = world.fx.length;
  const effect = s.hits > 0 || s.killed > 0 || s.healed > 0 || s.objects > 0 || s.syscalls > 0;
  rows.push({
    seq: m.SEQUENCE,
    script,
    name: m.NAME,
    ok: r.ok,
    hits: s.hits,
    killed: s.killed,
    healed: s.healed,
    objects: s.objects,
    syscalls: s.syscalls,
    ins: s.instructions,
    fx,
    effect,
    unimplemented: s.unimplemented.length,
  });
}

const bucket = (pred) => rows.filter(pred).length;
const n = rows.length;
const withEffect = bucket((r) => r.effect);
const hitsRows = bucket((r) => r.hits > 0);
const killRows = bucket((r) => r.killed > 0);
const healRows = bucket((r) => r.healed > 0);
const objRows = bucket((r) => r.objects > 0);
const fxRows = bucket((r) => r.fx > 0);

console.log(`总技能数 = ${n}`);
console.log(`有任何效果 = ${withEffect}/${n}`);
console.log(`  hits>0    ${hitsRows}/${n}`);
console.log(`  killed>0  ${killRows}/${n}`);
console.log(`  healed>0  ${healRows}/${n}`);
console.log(`  objects>0 ${objRows}/${n}`);
console.log(`  world.fx>0 ${fxRows}/${n}`);
console.log(`ok=true     = ${bucket((r) => r.ok)}/${n}`);

const dead = rows.filter((r) => !r.effect);
if (dead.length > 0) {
  console.log('\n[无效果] ' + dead.map((r) => `seq${r.seq}(script ${r.script})`).join(' '));
}

if (process.env['DETAIL'] === '1') {
  console.log('\nseq\t脚本\t命中\t击杀\t治疗\t物件\tsyscall\t指令\tfx');
  for (const r of rows) {
    console.log([r.seq, r.script, r.hits, r.killed, r.healed, r.objects, r.syscalls, r.ins, r.fx].join('\t'));
  }
}

// 顺带把三条「金标准」单独打出来，便于报告 §2 引用。
const gold = [104, 50, 1, 3];
console.log('\n[金标准单条]');
for (const seq of gold) {
  const r = rows.find((x) => x.seq === seq);
  if (r) {
    console.log(
      `seq ${seq} (${r.name} / 脚本 ${r.script}) hits=${r.hits} killed=${r.killed} healed=${r.healed} ` +
        `objects=${r.objects} syscalls=${r.syscalls} ins=${r.ins} fx=${r.fx}`,
    );
  }
}
