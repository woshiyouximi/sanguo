/**
 * block 探针 2：用户实机场景（截图 battle_start_t0.png 的配置）
 *   我方 大刀(2)·方形(0) 100 vs 敌方 黄巾(10)·雁形(3) 100，种子 7
 *   A 方 = 全軍前進（槽 1..7 = 1 + 主將槽 0 = 1）；B 方 AI。
 *
 * 判据「穿阵」= **同车道内一对敌我单位交换了左右次序**（sign(xA-xB) 翻转）。
 * 同排对砍不会翻转；只有"从对方身边绕过去"才会 ⇒ 这就是用户说的「穿过去」。
 *
 * 跑法：
 *   node work/flow_block/probe_layout2.mjs        # blockPass 默认开（新规则）
 *   node work/flow_block/probe_layout2.mjs --off  # 退回 R189 行为（对照组）
 */
import { GRID_W, GRID_H, createWorld, step, unitCell } from '../../game/src/core/battle.ts';
import { armyOrderOf, installArmyOrders } from '../../game/src/core/army_cmd.ts';
import { loadData } from '../../game/src/data.ts';

const BLOCK = !process.argv.includes('--off');
const data = loadData({ dir: 'F:/sanguo/game/data/' });

function draw(w, title) {
  const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill('.'));
  for (const u of w.units) {
    if (!u.alive) continue;
    const c = unitCell(u);
    if (c.gx < 0 || c.gx >= GRID_W || c.gy < 0 || c.gy >= GRID_H) continue;
    const ch = u.side === 'A' ? (u.isGeneral ? '我' : 'A') : (u.isGeneral ? '敵' : 'B');
    grid[c.gy][c.gx] = grid[c.gy][c.gx] === '.' ? ch : '*';
  }
  console.log(`\n--- ${title} tick=${w.tick} 存活 A=${w.units.filter((u) => u.side === 'A' && u.alive).length} B=${w.units.filter((u) => u.side === 'B' && u.alive).length} 攻击 A=${w.stats.attacksA} B=${w.stats.attacksB}`);
  if (!process.argv.includes('--quiet')) for (let y = 0; y < GRID_H; y++) console.log(`${String(y).padStart(2)} |${grid[y].join('')}|`);
}

const w = createWorld({
  data,
  seed: 7,
  a: { soldiers: 100, troop: 2, formation: 0, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
  b: { soldiers: 100, troop: 10, formation: 3, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  aiSides: { B: true },
});
w.blockPass = BLOCK;
installArmyOrders(w);
const st = armyOrderOf(w, 'A');
for (let i = 1; i < 8; i++) st.cmds[i] = 1;
st.cmds[0] = 1;
st.last = 'advance';
st.active = null;

console.log(`# blockPass = ${BLOCK}`);
draw(w, 't0 开局');

const uid = new Map();
for (const [i, u] of w.units.entries()) uid.set(u, i);
const swaps = [];
const sig = new Map(); // pairKey -> sign
const lastMove = new Map();
const TICKS = 3000;
for (let t = 0; t < TICKS && !w.over; t++) {
  step(w);
  const live = w.units.filter((u) => u.alive);
  for (let i = 0; i < live.length; i++) {
    for (let j = 0; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.side !== 'A' || b.side !== 'B') continue;
      const ca = unitCell(a);
      const cb = unitCell(b);
      if (ca.gy !== cb.gy) { sig.delete(`${uid.get(a)}:${uid.get(b)}`); continue; }
      const s = Math.sign(ca.gx - cb.gx);
      const k = `${uid.get(a)}:${uid.get(b)}`;
      const old = sig.get(k);
      if (old !== undefined && old !== 0 && s !== 0 && old !== s) {
        swaps.push({ tick: w.tick, a: `${ca.gx},${ca.gy}`, b: `${cb.gx},${cb.gy}`, gen: !!a.isGeneral || !!b.isGeneral });
      }
      sig.set(k, s);
    }
  }
  for (const u of live) {
    const c = unitCell(u);
    const p = lastMove.get(u);
    if (!p || p.gx !== c.gx || p.gy !== c.gy) lastMove.set(u, { gx: c.gx, gy: c.gy, tick: w.tick });
  }
  if (w.tick % 500 === 0) draw(w, '进度');
}
draw(w, '结束');
const stale = w.units.filter((u) => u.alive && (lastMove.get(u)?.tick ?? 0) < w.tick - 600).length;
console.log(`\n=== [blockPass=${BLOCK}] 穿阵（同车道敌我交换次序）= ${swaps.length} 次，其中涉及主将 ${swaps.filter((s) => s.gen).length} 次`);
for (const s of swaps.slice(0, 12)) console.log(JSON.stringify(s));
console.log(`结果：tick=${w.tick} over=${w.over} 存活 A=${w.units.filter((u) => u.side === 'A' && u.alive).length} B=${w.units.filter((u) => u.side === 'B' && u.alive).length} 攻击 A=${w.stats.attacksA} B=${w.stats.attacksB}`);
console.log(`最近 600 tick 一步没动过的存活单位 = ${stale}`);

