// 自动选点探针：defaultAim 的实际返回值 + 不传落点的 cast 战果（对照显式落点）
import { loadData } from '../../game/src/data.ts';
import {
  createWorld, cast, step, defaultAim, activeMaskOf, magicBySeq, QI_MAX, GRID_W, GRID_H,
} from '../../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const out = [];

function mk(seed = 5, aSoldiers = 20, bSoldiers = 20) {
  const w = createWorld({ data, seed, a: { troop: 2, soldiers: aSoldiers }, b: { troop: 10, soldiers: bSoldiers } });
  for (const s of ['A', 'B']) { const g = w.sides[s].general; g.mp = 999; g.mpMax = 999; g.qi = QI_MAX; }
  return w;
}
const gen = (w, side) => w.units.find((u) => u.side === side && u.isGeneral);

out.push('--- 掩码/选点 ---');
for (const seq of [1, 2, 3, 4, 50, 61, 104]) {
  const w = mk();
  const m = magicBySeq(data, seq);
  out.push(`seq ${seq} ${m.NAME} SCRIPT=${m.SCRIPT} ACTIVE=${m.ACTIVE} mask=0x${activeMaskOf(m).toString(16)} ` +
    `defaultAim=${JSON.stringify(defaultAim(w, 'A', seq))} enemyGen=${JSON.stringify({ x: gen(w, 'B').x, y: gen(w, 'B').y })} self=${JSON.stringify({ x: gen(w, 'A').x, y: gen(w, 'A').y })}`);
}

out.push('\n--- 命療術：不传落点 vs 传四个落点 ---');
{
  const results = [];
  for (const aim of [undefined, { x: 0, y: 0 }, { x: 36, y: 6 }, { x: 62, y: 6 }]) {
    const w = mk();
    w.sides.A.general.hp = Math.round(w.sides.A.general.maxHp * 0.5);
    const hp0 = w.sides.A.general.hp;
    const r = aim ? cast(w, 'A', 1, aim.x, aim.y, 40) : cast(w, 'A', 1, undefined, undefined, 40);
    results.push(`aim=${aim ? `[${aim.x},${aim.y}]` : 'auto'} ok=${r.ok} healed=${r.healed} hp ${hp0}->${w.sides.A.general.hp} mark=${JSON.stringify(w.skillMarks.map((m) => [m.x, m.y, m.healed]))}`);
  }
  out.push(...results.map((s) => '  ' + s));
}

out.push('\n--- 神鬼亂舞 104：不传落点 vs 传四个落点（贴着敌将 2.2 格） ---');
for (const aim of [undefined, { tag: '敌将', f: (w) => gen(w, 'B') }, { tag: '中场', f: () => ({ x: 36, y: 6 }) }, { tag: '我主将', f: (w) => gen(w, 'A') }]) {
  const w = mk(7);
  const a = gen(w, 'A');
  const b = gen(w, 'B');
  a.x = b.x + 2.2; a.y = b.y; a.prevX = a.x; a.prevY = a.y;
  const hp0 = w.sides.B.general.hp;
  const aimPt = aim && typeof aim.f === 'function' ? aim.f(w) : null;
  const r = aimPt ? cast(w, 'A', 104, aimPt.x, aimPt.y, 57) : cast(w, 'A', 104, undefined, undefined, 57);
  for (let i = 0; i < 220 && !w.over; i++) {
    a.x = b.x + 2.2; a.y = b.y; a.prevX = a.x; a.prevY = a.y;
    step(w);
  }
  out.push(`  aim=${aimPt ? aim.tag + `[${aimPt.x},${aimPt.y}]` : 'auto'} cast{hits=${r.hits} dmg=${r.damage}} 将伤=${hp0 - w.sides.B.general.hp} 法术击杀=${w.stats.spellKillsA} 法术伤害=${w.stats.spellDamageA}`);
}

out.push('\n--- 边界：敌将已死时 defaultAim ---');
{
  const w = mk(9);
  const b = gen(w, 'B');
  b.alive = false;
  w.sides.B.general.alive = false;
  for (const seq of [1, 104, 50, 3]) {
    const p = defaultAim(w, 'A', seq);
    const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= GRID_W - 1 && p.y >= 0 && p.y <= GRID_H - 1;
    out.push(`  seq ${seq} → ${JSON.stringify(p)} inGrid=${ok}`);
  }
  const r = cast(w, 'A', 104, undefined, undefined, 30);
  out.push(`  cast 104 auto = ${JSON.stringify({ ok: r.ok, reason: r.reason })}`);
}

console.log(out.join('\n'));
