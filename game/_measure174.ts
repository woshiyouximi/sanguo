/**
 * R174 战斗逻辑量化探针（只读，不改 core）。
 *
 * 目的：把「我们现在的战斗逻辑」量成数字，和录像/反汇编得到的原作数字并列，
 * 形成 `project/178_战斗逻辑差异量化.md` 的表。运行：
 *   node --experimental-strip-types game/_measure174.ts
 */
import { createWorld, step, cast, actionIntervalOf, allRush } from './src/core/battle.ts';
import { applyArmyCmdKind } from './src/core/army_cmd.ts';
import { loadData } from './src/data.ts';

const data = loadData();

type Row = Record<string, unknown>;
const rows: Row[] = [];

function newWorld(seed = 7, soldiers = 100, formationA = 0, formationB = 1) {
  return createWorld({
    data,
    seed,
    a: { formation: formationA, soldiers, troop: 2, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { formation: formationB, soldiers, troop: 10, general: { name: '張角', str: 70, int: 88, level: 5 } },
  } as never);
}

/** 最近敌我距离（格） */
function nearestGap(w: ReturnType<typeof newWorld>): number {
  let best = Infinity;
  for (const u of w.units) {
    if (!u.alive || u.side !== 'A') continue;
    for (const v of w.units) {
      if (!v.alive || v.side !== 'B') continue;
      const d = Math.hypot(v.x - u.x, v.y - u.y);
      if (d < best) best = d;
    }
  }
  return best;
}

function countAlive(w: ReturnType<typeof newWorld>, side: 'A' | 'B'): number {
  return w.units.filter((u) => u.alive && u.side === side && !u.isGeneral).length;
}

// ① 初始布阵
{
  const w = newWorld();
  const a = w.units.filter((u) => u.side === 'A');
  const b = w.units.filter((u) => u.side === 'B');
  const ga = a.find((u) => u.isGeneral)!;
  const gb = b.find((u) => u.isGeneral)!;
  rows.push({
    item: '初始最近距离（格）',
    ours: +nearestGap(w).toFixed(2),
    note: `A主将(${ga.x},${ga.y}) B主将(${gb.x},${gb.y})；A兵 x ${Math.min(...a.filter((u) => !u.isGeneral).map((u) => u.x))}..${Math.max(...a.filter((u) => !u.isGeneral).map((u) => u.x))}，B兵 x ${Math.min(...b.filter((u) => !u.isGeneral).map((u) => u.x))}..${Math.max(...b.filter((u) => !u.isGeneral).map((u) => u.x))}`,
  });
}

// ② 无命令 600 tick 的位移（原作应为 0）
{
  const w = newWorld();
  const before = w.units.map((u) => ({ u, x: u.x, y: u.y }));
  for (let t = 0; t < 600; t++) step(w);
  let moved = 0;
  let maxD = 0;
  for (const { u, x, y } of before) {
    if (!u.alive) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d > 0) moved++;
    maxD = Math.max(maxD, d);
  }
  rows.push({ item: '无命令 600 tick 的移动单位数', ours: moved, note: `最大位移 ${maxD.toFixed(2)} 格（原作应为 0）` });
  rows.push({ item: '无命令 600 tick 最近距离', ours: +nearestGap(w).toFixed(2) });
}

// ③ 下令全軍前進后的接敌 tick
{
  const w = newWorld();
  applyArmyCmdKind(w, 'A', 'advanceAll');
  applyArmyCmdKind(w, 'B', 'advanceAll');
  let contact = -1;
  for (let t = 0; t < 2000; t++) {
    step(w);
    if (nearestGap(w) <= 1.5) { contact = t + 1; break; }
  }
  rows.push({ item: '双方全軍前進的接敌 tick', ours: contact });
}

// ④ 对称 100v100 整场时长与击杀速率（双方都自动前压 = 我们现在的默认行为）
{
  const w = newWorld(7, 100, 0, 1);
  const startA = countAlive(w, 'A');
  let t = 0;
  const marks: Record<string, number> = {};
  for (; t < 20000 && !w.over; t++) {
    step(w);
    if (marks['contact'] === undefined && nearestGap(w) <= 1.5) marks['contact'] = t + 1;
    if (marks['halfB'] === undefined && countAlive(w, 'B') <= startA / 2) marks['halfB'] = t + 1;
  }
  rows.push({
    item: '整场 tick / 秒（当前默认行为）',
    ours: `${t} / ${(t / 30).toFixed(1)}s`,
    note: `over=${w.over} winner=${w.winner} endReason=${w.endReason ?? '-'}；contact=${marks['contact'] ?? '-'}，B 半灭=${marks['halfB'] ?? '-'}`,
  });
  const killsB = startA - countAlive(w, 'B');
  rows.push({ item: 'B 侧阵亡数 / 每 100 tick', ours: `${killsB} / ${((killsB / Math.max(1, t)) * 100).toFixed(2)}` });
}

// ⑤ 行动间隔与出手占比（interval 40；原作 anim4 = 30 tick / 75%）
{
  const w = newWorld();
  const g = w.units.find((u) => u.isGeneral)!;
  rows.push({ item: '行动间隔 actionIntervalOf（主将/士兵）', ours: `${actionIntervalOf(g)} / ${actionIntervalOf(w.units.find((u) => !u.isGeneral)!)}` });
}

// ⑥ 全軍突擊后的推进速度（格/百 tick）
{
  const w = newWorld();
  const gs = () => w.units.find((u) => u.side === 'A' && u.isGeneral)!;
  const x0 = gs().x;
  allRush(w, 'A');
  for (let t = 0; t < 300; t++) step(w);
  rows.push({ item: '突擊后 300 tick 主将位移（格）', ours: +(x0 - gs().x).toFixed(2) });
}

// ⑦ 士兵单步：40 tick 一次、一格
{
  const w = newWorld();
  applyArmyCmdKind(w, 'A', 'advanceAll');
  const u = w.units.find((x) => x.side === 'A' && !x.isGeneral)!;
  let steps = 0;
  let last = { x: u.x, y: u.y };
  for (let t = 0; t < 400; t++) {
    step(w);
    if (u.x !== last.x || u.y !== last.y) {
      const d = Math.hypot(u.x - last.x, u.y - last.y);
      if (d > 0) steps++;
      last = { x: u.x, y: u.y };
    }
  }
  rows.push({ item: '单个士兵 400 tick 内移动次数（每步 1 格）', ours: steps });
}

console.log(JSON.stringify(rows, null, 1));
