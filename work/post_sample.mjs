// 打印与网页演示同参数（seed=7 / bsoldiers=60 / 420 tick）的真实 post JSON
import { loadData } from '../game/src/data.ts';
import { createWorld, settle, step, TICK_HZ } from '../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const mk = () =>
  createWorld({
    data,
    seed: 7,
    a: { troop: 2, formation: 0, soldiers: 100, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { troop: 10, formation: 3, soldiers: 60, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  });

const w = mk();
let n = 0;
while (!w.over && n < 420) {
  step(w);
  n++;
}
const s = settle(w);
console.log('tick=' + w.tick, 'over=' + w.over, 'winner=' + w.winner, 'endReason=' + w.endReason);
console.log('A alive=' + w.sides.A.aliveCount + '/' + w.sides.A.start, 'B alive=' + w.sides.B.aliveCount + '/' + w.sides.B.start);
console.log('post = ' + JSON.stringify(s.post, null, 2));
console.log('settle = ' + JSON.stringify({ ...s, post: undefined }, null, 2));

const w2 = mk();
let m = 0;
while (!w2.over && m < 420) {
  step(w2);
  m++;
}
const s2 = settle(w2);
console.log('同 seed 再跑一次 post 相同 = ' + (JSON.stringify(s.post) === JSON.stringify(s2.post)));
console.log('TICK_HZ=' + TICK_HZ);
