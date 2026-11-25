/**
 * R139「武将技不需要选目标」的自检。
 *
 * 原作里点技能格就直接放：玩家不点战场，引擎自己给一个落点。考古结论（见
 * `project/139_武将技自动目标.md`）是「脚本自治 + 落点只用来选 g3」：
 *   - `MAGIC.SO` 里 110 条技能的脚本**每条都写 `SYSCALL 0x100`**（自己算特效锚点），
 *     如 `Heal` dis:13741-13745 用 `LDG 2`（施法者）坐标 −120px 当锚点；
 *   - 读这个锚点的 `SYSCALL 0x111/0x112` 只出现在相机函数里（dis:786..1372），伤害判定不读；
 *   - 落点真正的作用是 `runtime.ts:318-329` 选「离它最近的敌人」当 g3，再
 *     `runtime.ts:343-346` 把 targetPoint 改成该敌人的像素位置；
 *   - 少数脚本会拿 `0x113`（格→单位）扫到的单位与 g3 比较来分支，如 `DemonDancing`
 *     dis:12050/12110 —— 这就是玩家给的落点会改变战果（seq 104）的那一类。
 *
 * 这里钉死三件事：
 *   1. `defaultAim()` 按 `ACTIVE` 掩码给出「敌将 / 敌兵最密 / 自己」三种落点，有限且在网格内；
 *   2. `cast()` 不传 `tx/ty` 时战果与「显式点 ACTIVE 指定的那类目标」一致，与「显式点别处」
 *      只在脚本自己读 g3 的技能（104）上不同；
 *   3. 老路径还在：显式传 `tx/ty` 仍按 `activeAim()` 走（纯己方技点敌半场仍改到自己主将）。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/cast_autoaim.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  aimMaskOf,
  cast,
  createWorld,
  defaultAim,
  defaultAimForMask,
  GRID_H,
  GRID_W,
  QI_MAX,
  skillMarksOf,
  step,
} from '../src/core/battle.ts';
import type { Unit, World } from '../src/core/battle.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

interface Options {
  seed?: number;
  aSoldiers?: number;
  bSoldiers?: number;
}

/** 真将真数据建局；两侧 AI 全关，测试里只让 A 手动放技，避免 AI 放技污染骰序。 */
function makeWorld(o: Options = {}): World {
  const row = (name: string) => data.generals.find((g) => g.NAME === name) ?? null;
  const ga = row('張角');
  const gb = row('張勳');
  const w = createWorld({
    data,
    seed: o.seed ?? 7,
    a: {
      soldiers: o.aSoldiers ?? 20,
      troop: 2,
      formation: 0,
      general: { name: '張角', str: ga?.STR ?? 56, int: ga?.INT ?? 95, level: 2 },
    },
    b: {
      soldiers: o.bSoldiers ?? 20,
      troop: 10,
      formation: 0,
      general: { name: '張勳', str: gb?.STR ?? 69, int: gb?.INT ?? 63, level: 2 },
    },
    aiSides: { A: false, B: false },
  });
  arm(w, 'A');
  return w;
}

/** 灌满技力/气力：一次武將技常要整条气（`QI_MAX`），不灌就只回 `reason:'qi'`。 */
function arm(w: World, side: 'A' | 'B'): void {
  const g = w.sides[side].general;
  g.mp = 999;
  g.mpMax = 999;
  g.qi = QI_MAX;
}

function genUnit(w: World, side: 'A' | 'B'): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral);
  assert.ok(u, `主将单位缺失: ${side}`);
  return u;
}

function inGrid(p: { x: number; y: number }): boolean {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= GRID_W - 1 &&
    p.y >= 0 &&
    p.y <= GRID_H - 1
  );
}

function near(p: { x: number; y: number }, q: { x: number; y: number }, eps = 1e-6): boolean {
  return Math.abs(p.x - q.x) <= eps && Math.abs(p.y - q.y) <= eps;
}

/** 跑到 `ticks` 或战斗结束。 */
function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks && !w.over; i++) step(w);
}

/** 只读"法术造成"的增量，隔离普攻肉搏。 */
function spellOf(w: World): { kills: number; dmg: number; healed: number } {
  const s = w.stats;
  return { kills: s.spellKillsA, dmg: s.spellDamageA, healed: s.spellHealedA };
}

function spellDelta(before: { kills: number; dmg: number; healed: number }, w: World) {
  const now = spellOf(w);
  return { kills: now.kills - before.kills, dmg: now.dmg - before.dmg, healed: now.healed - before.healed };
}

/** 把 A 主将放到 B 主将旁边 `gap` 格：够放技、够不着普攻（ENGAGE_RANGE=1.15）。 */
function adjacent(w: World, gap = 2.2): { a: Unit; b: Unit } {
  const a = genUnit(w, 'A');
  const b = genUnit(w, 'B');
  a.x = b.x + gap;
  a.y = b.y;
  a.prevX = a.x;
  a.prevY = a.y;
  return { a, b };
}

// ── 1. 选点语义 ────────────────────────────────────────────────────────────

test('defaultAim：敵方主將/敵方全軍技落在敌将格，純己方技落在自己格', () => {
  const w = makeWorld();
  const me = genUnit(w, 'A');
  const foe = genUnit(w, 'B');
  // magics.json：2 落月弓=敵方主將(0x8)、4 火箭/50 半月斬/61 地茅刺=敵方全軍(0xC)、104 神鬼亂舞=敵方主將
  for (const seq of [2, 4, 50, 61, 104]) {
    const aim = defaultAim(w, 'A', seq);
    assert.ok(inGrid(aim), `seq ${seq} 的落点越界: ${aim.x},${aim.y}`);
    assert.ok(near(aim, { x: foe.x, y: foe.y }), `seq ${seq} 该瞄敌将 ${foe.x},${foe.y}，实际 ${aim.x},${aim.y}`);
  }
  // 1 命療術=我方主將(0x2)：Heal 脚本用 g2（施法者）取坐标，落点只是锚点
  const heal = defaultAim(w, 'A', 1);
  assert.ok(inGrid(heal));
  assert.ok(near(heal, { x: me.x, y: me.y }), `命療術该落在自己身上，实际 ${heal.x},${heal.y}`);
});

test('defaultAim：敵方士兵技（seq 3）落在敌兵最密处，不是敌将格', () => {
  const w = makeWorld();
  const aim = defaultAim(w, 'A', 3); // 地泉衝 = 敵方士兵(0x4)
  assert.ok(inGrid(aim));
  const soldiers = w.units.filter((u) => u.side === 'B' && u.alive && !u.isGeneral);
  assert.ok(soldiers.length > 0, '该有敌兵');
  const nearest = Math.min(...soldiers.map((u) => Math.hypot(u.x - aim.x, u.y - aim.y)));
  assert.ok(nearest <= 3.6 + 1e-9, `落点离最近的敌兵 ${nearest.toFixed(2)} 格，超过窗口 3.6`);
  const foe = genUnit(w, 'B');
  assert.ok(!near(aim, { x: foe.x, y: foe.y }), '敵方士兵技不该落在敌将格上');
});

test('defaultAimForMask：掩码路径 0x2→自己、0x4→兵、0x8/0xC→将、0→将', () => {
  const w = makeWorld();
  const me = genUnit(w, 'A');
  const foe = genUnit(w, 'B');
  assert.ok(near(defaultAimForMask(w, 'A', 0x2), { x: me.x, y: me.y }), '0x2 我方主將该落自己');
  assert.ok(near(defaultAimForMask(w, 'A', 0x1), { x: me.x, y: me.y }), '0x1 我方士兵也是纯己方技，落自己');
  assert.ok(near(defaultAimForMask(w, 'A', 0x8), { x: foe.x, y: foe.y }), '0x8 敵方主將该落敌将');
  assert.ok(near(defaultAimForMask(w, 'A', 0xc), { x: foe.x, y: foe.y }), '0xC 敵方全軍该落敌将');
  assert.ok(near(defaultAimForMask(w, 'A', 0), { x: foe.x, y: foe.y }), '掩码 0 按敵方全軍处理');
  const troop = defaultAimForMask(w, 'A', 0x4);
  assert.ok(inGrid(troop) && !near(troop, { x: foe.x, y: foe.y }), '0x4 敵方士兵该落兵堆');
});

test('defaultAim 单调性：敌兵整体后移 4 格，瞄点跟着移 4 格', () => {
  const w = makeWorld();
  const before = defaultAim(w, 'A', 3);
  for (const u of w.units) {
    if (u.side !== 'B' || u.isGeneral) continue;
    u.x += 4;
    u.prevX = u.x;
  }
  const after = defaultAim(w, 'A', 3);
  assert.ok(inGrid(after));
  assert.ok(Math.abs(after.x - (before.x + 4)) < 1e-9, `x 该跟移 4 格: ${before.x} → ${after.x}`);
  assert.ok(Math.abs(after.y - before.y) < 1e-9, `y 不该动: ${before.y} → ${after.y}`);
});

test('aimMaskOf：seq 解析成 ACTIVE 掩码，越界数字回落 0', () => {
  const w = makeWorld();
  assert.equal(aimMaskOf(w, 1), 0x2, '命療術 = 我方主將');
  assert.equal(aimMaskOf(w, 2), 0x8, '落月弓 = 敵方主將');
  assert.equal(aimMaskOf(w, 3), 0x4, '地泉衝 = 敵方士兵');
  assert.equal(aimMaskOf(w, 4), 0xc, '火箭 = 敵方全軍');
  assert.equal(aimMaskOf(w, 104), 0x8, '神鬼亂舞 = 敵方主將');
  assert.equal(aimMaskOf(w, 0), 0, '0 = 未标注');
  assert.equal(aimMaskOf(w, 111), 0, '111 不是技能（seq 只到 110）也不是掩码');
  assert.equal(aimMaskOf(w, 9999), 0, '乱给的大数字不该被位与成掩码 15');
  assert.equal(aimMaskOf(w, Number.NaN), 0, 'NaN 不该抛');
});

// ── 2. 不传落点 == 显式瞄 ACTIVE 指定的那类目标 ────────────────────────────

test('不传落点：命療術治疗量与四个显式落点完全一致，且默认标记落在自己身上', () => {
  /** 同一局放一次命療術，返回 (healed, 标记数, 标记位置)。 */
  const once = (aim?: { x: number; y: number }) => {
    const w = makeWorld();
    const g = w.sides.A.general;
    const me = genUnit(w, 'A');
    g.hp = Math.floor(g.maxHp * 0.5);
    const before = spellOf(w);
    const r = aim ? cast(w, 'A', 1, aim.x, aim.y) : cast(w, 'A', 1);
    assert.equal(r.ok, true, `命療術该放得出来: ${r.reason}`);
    const marks = skillMarksOf(w).filter((m) => m.side === 'A');
    const d = spellDelta(before, w);
    return { healed: d.healed, r, marks, me };
  };
  const auto = once();
  assert.ok(auto.healed > 0, `命療術该有治疗量，实际 ${auto.healed}`);
  assert.ok(near({ x: auto.marks[0].x, y: auto.marks[0].y }, { x: auto.me.x, y: auto.me.y }, 0.6), '默认标记该落在自己身上');

  // 四个点：后排自己 / 中场 / 敌后 / 角落 —— 治疗量都不该变（Heal 脚本只认 g2）
  for (const aim of [
    { x: 4, y: 6 },
    { x: GRID_W / 2, y: 6 },
    { x: 62, y: 6 },
    { x: 66, y: 2 },
  ]) {
    const one = once(aim);
    assert.equal(one.healed, auto.healed, `落点 ${aim.x},${aim.y} 的治疗量 ${one.healed} 与自动 ${auto.healed} 不一致`);
  }
});

test('不传落点：神鬼亂舞 auto 与显式瞄敌将逐项相同（将伤/法术击杀/法术伤害）', () => {
  const runOnce = (aim?: { x: number; y: number }) => {
    const w = makeWorld();
    const b = genUnit(w, 'B');
    adjacent(w, 2.2);
    const before = spellOf(w);
    const hp0 = w.sides.B.general.hp;
    const r = aim ? cast(w, 'A', 104, aim.x, aim.y, 57) : cast(w, 'A', 104, undefined, undefined, 57);
    assert.equal(r.ok, true, `神鬼亂舞该放得出来: ${r.reason}`);
    run(w, 300);
    return { d: spellDelta(before, w), hpLoss: hp0 - w.sides.B.general.hp, b };
  };
  const auto = runOnce();
  // 显式瞄敌将：同一 seed 下敌将坐标固定，直接取一局的坐标
  const foe = genUnit(makeWorld(), 'B');
  const aimed = runOnce({ x: foe.x, y: foe.y });
  assert.ok(auto.d.dmg > 0, `auto 该打掉主将体力，实际 ${auto.d.dmg}`);
  assert.deepEqual(auto.d, aimed.d, 'auto 的 (法术击杀/法术伤害/治疗) 该与显式瞄敌将完全一致');
  assert.equal(auto.hpLoss, aimed.hpLoss, 'auto 打掉的主将体力该与显式瞄敌将一致');
});

test('不传落点：神鬼亂舞不再吃落点（G3 = 对面主将，脚本自读 g3 而非落点）', () => {
  const runOnce = (aim?: { x: number; y: number }) => {
    const w = makeWorld();
    adjacent(w, 2.2);
    const before = spellOf(w);
    const hp0 = w.sides.B.general.hp;
    const r = aim ? cast(w, 'A', 104, aim.x, aim.y, 57) : cast(w, 'A', 104, undefined, undefined, 57);
    assert.equal(r.ok, true);
    run(w, 300);
    return { d: spellDelta(before, w), hpLoss: hp0 - w.sides.B.general.hp };
  };
  const auto = runOnce();
  const mid = runOnce({ x: GRID_W / 2, y: 6 });
  // R163：原先断言"auto 不等于瞄中场"，因为端口把 G3 写成"离落点最近的敌单位"，落点一变
  // G3 就变。原作 `0x43BA59`@`0x43BA9D` 写的是 `G3 = 对面主将对象`（与落点无关），本单
  // 照此修正后，神鬼亂舞的伤害路径只认 G3 ⇒ 两种瞄法结果必须**一致**。
  const same = auto.d.kills === mid.d.kills && auto.d.dmg === mid.d.dmg && auto.hpLoss === mid.hpLoss;
  assert.equal(same, true, `auto(${JSON.stringify(auto)}) 该等于中场(${JSON.stringify(mid)})：G3 = 对面主将`);
});

test('不传落点：半月斬（多帧技）贴住敌兵堆，auto 与显式瞄兵堆结果一致且真有击杀', () => {
  const runOnce = (aim?: { x: number; y: number }) => {
    const w = makeWorld({ aSoldiers: 20, bSoldiers: 40 });
    // 找 B 方兵堆质心，把 A 主将贴上去（射程内、又不在敌将格上）
    const troops = w.units.filter((u) => u.side === 'B' && u.alive && !u.isGeneral);
    const cx = troops.reduce((s, u) => s + u.x, 0) / troops.length;
    const cy = troops.reduce((s, u) => s + u.y, 0) / troops.length;
    const a = genUnit(w, 'A');
    a.x = cx - 1.4;
    a.y = cy;
    a.prevX = a.x;
    a.prevY = a.y;
    const before = spellOf(w);
    const r = aim ? cast(w, 'A', 50, aim.x, aim.y, 24) : cast(w, 'A', 50, undefined, undefined, 24);
    assert.equal(r.ok, true, `半月斬该放得出来: ${r.reason}`);
    run(w, 120);
    return { d: spellDelta(before, w), cx, cy };
  };
  const auto = runOnce();
  const explicit = runOnce({ x: 0, y: 0 });
  assert.ok(auto.d.kills > 0, `半月斬贴住兵堆该有击杀，实际 ${auto.d.kills}`);
  assert.deepEqual(auto.d, explicit.d, 'g3 是死读（HalfMoon dis:2692-2693 存 loc2 后再无 LDSL loc2），战果该与落点无关');
});

// ── 3. 边界 ───────────────────────────────────────────────────────────────

test('敌将已死：defaultAim 仍有限且在网格内；神鬼亂舞 no-target', () => {
  const w = makeWorld();
  const foe = genUnit(w, 'B');
  w.sides.B.general.hp = 0;
  w.sides.B.general.alive = false;
  foe.alive = false;
  for (const seq of [1, 3, 50, 104]) {
    const aim = defaultAim(w, 'A', seq);
    assert.ok(inGrid(aim), `seq ${seq} 在敌将死后越界: ${aim.x},${aim.y}`);
  }
  // 掩码 0x8 只有敌将可选，敌将死了就该报 no-target（保持旧语义，不乱打）
  const r = cast(w, 'A', 104);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-target');
});

test('场上无敌人：defaultAim 有限且在网格内（落回己方），不 NaN', () => {
  const w = makeWorld();
  for (const u of w.units) {
    if (u.side !== 'B') continue;
    u.alive = false;
  }
  w.sides.B.general.alive = false;
  for (const seq of [2, 3, 50, 61, 104]) {
    const aim = defaultAim(w, 'A', seq);
    assert.ok(inGrid(aim), `seq ${seq} 无敌人时越界: ${aim.x},${aim.y}`);
  }
  // 一个敌人都没有时，己方锚点兜底
  const own = genUnit(w, 'A');
  assert.ok(near(defaultAim(w, 'A', 104), { x: own.x, y: own.y }), '无敌人时该落回自己主将');
});

test('defaultAim 对 NaN / 负数 / 超大数都不抛、不越界', () => {
  const w = makeWorld();
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1e9]) {
    const aim = defaultAim(w, 'A', bad);
    assert.ok(inGrid(aim), `maskOrSeq=${String(bad)} 返回越界点 ${aim.x},${aim.y}`);
  }
});

// ── 4. 老路径保留 ─────────────────────────────────────────────────────────

test('显式落点仍在：纯己方技点敌方半场仍改到自己主将（activeAim 未改）', () => {
  const w = makeWorld();
  const me = genUnit(w, 'A');
  const foe = genUnit(w, 'B');
  w.sides.A.general.hp = Math.floor(w.sides.A.general.maxHp * 0.5);
  const r = cast(w, 'A', 1, foe.x, foe.y);
  assert.equal(r.ok, true);
  const mark = skillMarksOf(w).filter((m) => m.side === 'A')[0];
  assert.ok(near({ x: mark.x, y: mark.y }, { x: me.x, y: me.y }, 0.6), '敌半场的点该被 activeAim 改到自己主将');
});
