// 自动目标考古探针：同 seed 同对手，把同一技能 cast 到不同落点，只统计「法术战果」（隔离普攻肉搏）
import { loadData } from '../../game/src/data.ts';
import { createWorld, cast, step, GRID_W, QI_MAX } from '../../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const SEED = 777;
const PRE = Number(process.env.PRE ?? 120);
const SOLDIERS = Number(process.env.SOL ?? 200);

function mk() {
  const w = createWorld({ data, seed: SEED, a: { troop: 2, soldiers: SOLDIERS }, b: { troop: 10, soldiers: SOLDIERS } });
  for (const s of ['A', 'B']) {
    const g = w.sides[s].general;
    g.mp = 999; g.mpMax = 999; g.qi = QI_MAX;
  }
  // 我方主将掉一半血，命療術才有可回的量
  w.sides.A.general.hp = Math.round(w.sides.A.general.maxHp * 0.5);
  return w;
}

function aims(w) {
  const foe = w.units.filter(u => u.side === 'B' && u.alive);
  const gen = foe.find(u => u.isGeneral) ?? foe[0];
  const soldiers = foe.filter(u => !u.isGeneral);
  const frontX = Math.max(...soldiers.map(u => u.x));
  const front = soldiers.filter(u => u.x >= frontX - 1);
  const fx = Math.round(front.reduce((a, u) => a + u.x, 0) / front.length);
  const fy = Math.round(front.reduce((a, u) => a + u.y, 0) / front.length);
  const me = w.units.find(u => u.side === 'A' && u.isGeneral);
  return {
    敌将: { x: gen.x, y: gen.y, tag: `[${gen.x},${gen.y}]` },
    敌前排: { x: fx, y: fy, tag: `[${fx},${fy}]` },
    我主将: { x: me.x, y: me.y, tag: `[${me.x},${me.y}]` },
    敌方后排: { x: Math.min(...soldiers.map(u => u.x)), y: 6, tag: `[${Math.min(...soldiers.map(u => u.x))},6]` },
    中场: { x: Math.round(GRID_W / 2), y: 6, tag: `[${Math.round(GRID_W / 2)},6]` },
  };
}

function runAim(seq, aim) {
  const w = mk();
  for (let i = 0; i < PRE && !w.over; i++) step(w);
  const before = { kills: w.stats.spellKillsA, dmg: w.stats.spellDamageA, heal: w.stats.spellHealedA, foe: w.units.filter(u => u.side === 'B' && u.alive).length };
  const r = cast(w, 'A', seq, aim.x, aim.y, 40);
  let n = 0;
  while (w.sessions.length > 0 && !w.over && n < 400) { step(w); n++; }
  const after = { kills: w.stats.spellKillsA, dmg: w.stats.spellDamageA, heal: w.stats.spellHealedA, foe: w.units.filter(u => u.side === 'B' && u.alive).length };
  return {
    cast: { ok: r.ok, reason: r.reason, killed: r.killed, damage: r.damage, healed: r.healed, hits: r.hits },
    spell: { kills: after.kills - before.kills, dmg: after.dmg - before.dmg, heal: after.heal - before.heal },
    sessionTicks: n, over: w.over, foeBefore: before.foe,
  };
}

const seqs = process.argv.slice(2).map(Number);
const lines = [`PRE=${PRE} SOL=${SOLDIERS} seed=${SEED}`];
for (const seq of seqs) {
  const w0 = mk();
  for (let i = 0; i < PRE && !w0.over; i++) step(w0);
  const as = aims(w0);
  lines.push(`=== seq ${seq}  落点样本：${Object.entries(as).map(([k, v]) => `${k}=${v.tag}`).join(' ')}`);
  const seen = new Map();
  for (const [name, aim] of Object.entries(as)) {
    const r = runAim(seq, aim);
    const key = JSON.stringify(r.spell);
    const dup = seen.get(key);
    if (!dup) seen.set(key, name);
    lines.push(`  ${name.padEnd(4)} ${aim.tag.padEnd(8)} cast=${JSON.stringify(r.cast)} 法术{击杀${r.spell.kills} 将伤${r.spell.dmg} 治疗${r.spell.heal}} ${r.sessionTicks}t${r.over ? ' [over]' : ''}${dup ? '  == ' + dup : ''}`);
  }
}
console.log(lines.join('\n'));
