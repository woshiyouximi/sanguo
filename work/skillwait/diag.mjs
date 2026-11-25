// 单技诊断：cast() → 看 world.sessions[0] 的逐帧 hits/killed/帧数，并做"纯技能"前后对账。
// 用法：node work/skillwait/diag.mjs <seq> [seq...]
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

for (const arg of process.argv.slice(2)) {
  const seq = Number(arg);
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  const hpA = () => world.sides.A.general.hp, hpB = () => world.sides.B.general.hp;
  const aliveB = () => world.units.filter((u) => u.side === 'B' && u.alive).length;
  const b0 = { hpB: hpB(), hpA: hpA(), n: aliveB(), units: world.units.length };
  const r = cast(world, 'A', seq, 20, 6.5);
  const s = world.sessions[0];
  const d0 = { hpB: b0.hpB - hpB(), hpA: b0.hpA - hpA(), n: b0.n - aliveB() };
  for (let i = 0; i < 400; i++) step(world);
  const d1 = { hpB: b0.hpB - hpB(), hpA: b0.hpA - hpA(), n: b0.n - aliveB() };
  const frames = s ? s.frames.map((f) => `${f.hits}/${f.killed}`).join(' ') : '';
  console.log(`\n===== seq ${seq} ${m.NAME} script=${m.SCRIPT} atk=${m.ATTACK} active=${m.ACTIVE}`);
  console.log(`  cast ok=${r.ok} hits=${r.hits} hit=${r.hit} killed=${r.killed} healed=${r.healed} damage=${r.damage}`);
  console.log(`  session: frames=${s?.frames.length} done=${s?.done} ok=${s?.ok} reason=${s?.reason || '-'} totalKilled=${s?.killed} healed=${s?.healed}`);
  const sum = s?.summary();
  console.log(`  frames(hits/killed): ${frames || '(none)'}`);
  if (sum) {
    console.log(`  stats=${JSON.stringify(sum.stats)}`);
    console.log(`  objects(${sum.objects.length})=${sum.objects.slice(0, 10).map((o) => `(${o.x.toFixed(1)},${o.y.toFixed(1)},res${o.resource},a${o.angle})`).join(' ')}`);
    console.log(`  log=${JSON.stringify(sum.log.slice(0, 6))}`);
  }
  console.log(`  即时(cast 返回时): B兵亡${d0.n} B将掉${d0.hpB} A将掉${d0.hpA}`);
  console.log(`  400tick 后     : B兵亡${d1.n} B将掉${d1.hpB} A将掉${d1.hpA}  (控制组是 B兵亡11 A将掉3)`);
}
