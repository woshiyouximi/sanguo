// R190 回归诊断：复刻 game/tests/weather.test.ts 的 R39 聚合端到端（8 种子 × 24v24 × 1200 tick），
// 打印各天气的 hits/attacks/命中率，用来确认「不许穿阵」规则把哪一档天气的单调性挤翻了。
// 用法：node work/flow_block/probe_weather.mjs [--off] [--rules=7]
import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const argv = process.argv.slice(2);
const OFF = argv.includes('--off');
const RULES = Number((argv.find((a) => a.startsWith('--rules=')) ?? '--rules=7').slice(8));
const NSEED = Number((argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=8').slice(8));

const SEEDS = Array.from({ length: NSEED }, (_, i) => i + 1);
const NAME = ['晴', '雨', '雪', '雾'];

function measure(weather) {
  let hits = 0;
  let attacks = 0;
  let overTick = 0;
  for (const seed of SEEDS) {
    const w = engage(createWorld({ data, seed, weather, a: { soldiers: 24 }, b: { soldiers: 24 } }));
    w.blockPass = !OFF;
    w.blockRules = RULES;
    for (let i = 0; i < 1200 && !w.over; i++) step(w);
    hits += w.stats.hitsA + w.stats.hitsB;
    attacks += w.stats.attacksA + w.stats.attacksB;
    if (w.over) overTick += w.tick;
  }
  return { hits, attacks, rate: hits / attacks, overTick };
}

const rows = [0, 1, 2, 3].map((k) => ({ k, ...measure(k) }));
console.log(`mode=${OFF ? 'OFF(原作只判目标格)' : `ON rules=${RULES}`}`);
for (const r of rows) {
  console.log(`  ${NAME[r.k]}  hits=${r.hits}  attacks=${r.attacks}  rate=${r.rate.toFixed(4)}  Σ结束tick=${r.overTick}`);
}
const mono =
  rows[0].rate > rows[1].rate && rows[1].rate > rows[2].rate && rows[2].rate > rows[3].rate;
console.log(`  单调 晴>雨>雪>雾 : ${mono ? 'PASS' : 'FAIL'}  (雨-雪 ${(rows[1].rate - rows[2].rate).toFixed(4)}, 雪-雾 ${(rows[2].rate - rows[3].rate).toFixed(4)})`);
