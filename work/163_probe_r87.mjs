// R163：旋龍(554) 帧数探针 —— 复刻 game/tests/r87_waitfor.test.ts 的 makeWorld/castXuanlong/runToEnd，
// 额外打印 world.over / 双方主将 HP / 每帧统计，用来判断「会话 23 帧就收尾」是脚本自己结束还是战斗结束。
import { loadData } from '../game/src/data.ts';
import { cast, createWorld, QI_MAX, step } from '../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

function makeWorld() {
  const world = createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
    aiSides: { A: false, B: false },
  });
  const a = world.units.find((u) => u.isGeneral && u.side === 'A');
  a.x = 24;
  a.y = 6.5;
  a.prevX = a.x;
  a.prevY = a.y;
  world.sides.A.general.qi = QI_MAX;
  return world;
}

const world = makeWorld();
const warns = [];
const oldWarn = console.warn;
console.warn = (...a) => warns.push(a.map(String).join(' '));
const result = cast(world, 'A', 51, 20, 6.5);
console.warn = oldWarn;
const sess = world.sessions[0];
console.log('cast', JSON.stringify({ ok: result.ok, hit: result.hit, hits: result.hits, damage: result.damage }));

let ticks = 0;
while (world.sessions.length > 0 && ticks++ < 400) {
  step(world);
  if (sess && (sess.done || ticks % 20 === 0)) {
    console.log(`tick=${ticks} done=${sess.done} frame=${sess.frame} frames=${sess.frames.length} over=${world.over}`);
  }
}
console.log('end', JSON.stringify({
  ticks,
  frames: sess?.frames.length,
  frame: sess?.frame,
  done: sess?.done,
  reason: sess?.reason,
  over: world.over,
  hpA: world.sides.A.general.hp,
  hpB: world.sides.B.general.hp,
  aliveA: world.units.filter((u) => u.side === 'A' && u.alive).length,
  aliveB: world.units.filter((u) => u.side === 'B' && u.alive).length,
}));
console.log('warns', JSON.stringify(warns));
if (sess) {
  console.log('frames', JSON.stringify(sess.frames.map((f) => ({
    f: f.frame, ins: f.instructions, sys: f.syscalls, hits: f.hits, k: f.killed, h: f.healed,
  }))));
}
