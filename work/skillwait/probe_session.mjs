// 旋龍逐帧细探针：会话每帧统计、物件轨迹、总命中。
// 用法：cd F:\sanguo\game && node ..\work\skillwait\probe_session.mjs [tx] [ty]
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };

const tx = Number(process.argv[2] ?? 20);
const ty = Number(process.argv[3] ?? 6.5);

const world = createWorld({
  data, seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const g = world.units.find((u) => u.isGeneral && u.side === 'A');
g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
world.sides.A.general.qi = QI_MAX;
const bg = world.units.find((u) => u.isGeneral && u.side === 'B');
const hp0 = bg.hp;

const r = cast(world, 'A', 51, tx, ty);
const sess = world.sessions[0];
console.log('cast', JSON.stringify({ ok: r.ok, hit: r.hit, hits: r.hits, damage: r.damage, killed: r.killed, reason: r.reason }));
console.log('objects@frame0', sess ? sess.run.dumpObjects() : '(no session)');

let ticks = 0;
while (world.sessions.length && ticks < 400) { step(world); ticks++; }
console.log('session 结束于 tick', ticks);
if (sess) {
  const fr = sess.frames;
  console.log('帧数', fr.length, '总 hits', sess.hits, 'done', sess.done, 'ok', sess.ok, 'reason', JSON.stringify(sess.reason));
  const hitFrames = fr.filter((f) => f.hits > 0);
  console.log('有命中的帧', hitFrames.length, JSON.stringify(hitFrames.slice(0, 10).map((f) => [f.frame, f.hits, f.killed])));
  console.log('dump', sess.run.dumpObjects());
}
const afterSessHp = bg.hp;
for (let i = 0; i < 100; i++) step(world);
console.log('主将 hp 损失：会话结束', hp0 - afterSessHp, '／再 100 tick 后', hp0 - bg.hp, '／spellKillsA', world.stats.spellKillsA, 'spellDamageA', world.stats.spellDamageA);
console.log('warns', JSON.stringify(warns.slice(0, 3)));
