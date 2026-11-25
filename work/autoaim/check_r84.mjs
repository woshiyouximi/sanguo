// 只回答一个问题：R84 那两条测试现在失败，是我改的「不传落点」造成的，
// 还是并发 agent 正在重写 runtime.ts/syscalls.ts 造成的？—— 两条路径都跑一遍对比。
import { loadData } from '../../game/src/data.ts';
import { cast, createWorld, QI_MAX, step } from '../../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

function mk() {
  const w = createWorld({ data, seed: 7, a: { troop: 2 }, b: { troop: 10 } });
  w.aiSides = { A: false, B: false };
  for (const side of ['A', 'B']) {
    const g = w.sides[side].general;
    g.mp = g.mpMax = 999;
    g.qi = QI_MAX;
  }
  return w;
}

function run(label, seq, setup, aimOf) {
  const out = {};
  for (const mode of ['auto', 'explicit']) {
    const w = mk();
    const a = w.units.find((u) => u.side === 'A' && u.isGeneral === true);
    const b = w.units.find((u) => u.side === 'B' && u.isGeneral === true);
    setup(a, b);
    const hp0 = w.sides.B.general.hp;
    const p = aimOf(b);
    const r =
      mode === 'auto'
        ? cast(w, 'A', seq, undefined, undefined, 57)
        : cast(w, 'A', seq, p.x, p.y, 57);
    const n0 = w.skillMarks.length;
    for (let i = 0; i < 400 && w.skillMarks.length === n0; i++) step(w);
    out[mode] = {
      ok: r.ok,
      hit: r.hit,
      hits: r.hits,
      killed: r.killed,
      damage: r.damage,
      hpLost: hp0 - w.sides.B.general.hp,
      marks: w.skillMarks.map((m) => ({ tick: m.tick, x: +m.x.toFixed(2), dmg: m.damage, kills: m.kills, miss: !!m.miss })),
    };
  }
  const same = JSON.stringify(out.auto) === JSON.stringify(out.explicit);
  console.log(`${label} same=${same}`);
  console.log('   auto    ', JSON.stringify(out.auto));
  console.log('   explicit', JSON.stringify(out.explicit));
}

run('seq104 贴敌将 2.2 格', 104, (a, b) => { a.x = b.x + 2.2; a.y = b.y; }, (b) => ({ x: b.x, y: b.y }));
run('seq2 射程外（b.x-20）', 2, (a, b) => { a.x = b.x + 2.2; a.y = b.y; }, (b) => ({ x: b.x - 20, y: b.y }));
