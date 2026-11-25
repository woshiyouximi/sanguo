/**
 * R183 法术域五红的**语义钉子**（o1，2026-11-25）。
 *
 * 这里不放"实现当前值"的镜像断言，只钉五条红背后那条**原作语义**，让它们以后红了就能一眼
 * 看出是语义坏了还是数值漂了。每条都写清依据地址 / `project/` 行号。
 *
 *   1. R88 落月弓：`Hurt @0x12B8` 开头把"受害者不是双方主将"的分支拦成只放音效
 *      （`export/script/magic_so.dis.txt:0012D8-0012E8`，`project/154 §1.4`），
 *      `ShootObjectCallback @0x5CA4` 的"撞到小兵"分支写 `Hurt(...,0)`（dis:3427-3470）
 *      ⇒ 这条技的伤害**只能**落在主将身上，落点瞄哪里都一样。
 *   2. 落点只用来选 g3：`G[3]` 由引擎按 `MagicDef+0x10` 的 ACTIVE 解析（`0x43BA59`@`0x43BA9D`
 *      `mov [0x4a6884]`，`project/154 §1.2`），110 条脚本每条都自己 `SYSCALL 0x100` 覆盖锚点
 *      （`project/139 §0`）⇒ ACTIVE=敵方主將 的技，四个角落的落点战果必须完全相同。
 *   3. 606 同步指令数与布局无关（它是"脚本 + 实现"的性质）；逐帧帧数**是**布局相关的
 *      （合成 = 螺旋 280 圈 × WAIT + 碰撞回调提前结束物件）—— 这就是 562 会随 m4 的阵型
 *      重写漂到 556/559 的原因（`work\_m4_baseline.txt:1099` vs `work\_m4_after_fixtures.txt:24`）。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/spell_reds.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import {
  QI_MAX,
  cast,
  createWorld,
  skillMarksOf,
  step,
  type Side,
  type Unit,
  type World,
} from '../src/core/battle.ts';
import { runSkill, startSkill } from '../src/core/smartscript/runtime.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

interface Opt {
  seed?: number;
  aSoldiers?: number;
  bSoldiers?: number;
}

/** 真将真数据建局；两侧 AI 全关，避免 AI 放技污染骰序。 */
function makeWorld(o: Opt = {}): World {
  const row = (n: string) => data.generals.find((g) => g.NAME === n) ?? null;
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
  const g = w.sides.A.general;
  g.mp = 999;
  g.mpMax = 999;
  g.qi = QI_MAX;
  return w;
}

function genUnit(w: World, side: 'A' | 'B'): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral);
  assert.ok(u, `主将单位缺失: ${side}`);
  return u;
}

function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks && !w.over; i++) step(w);
}

/** 只读"法术造成"的增量，隔离普攻肉搏。 */
function spellOf(w: World) {
  const s = w.stats;
  return { kills: s.spellKillsA, dmg: s.spellDamageA, healed: s.spellHealedA };
}

function delta(before: ReturnType<typeof spellOf>, w: World) {
  const now = spellOf(w);
  return { kills: now.kills - before.kills, dmg: now.dmg - before.dmg, healed: now.healed - before.healed };
}

// ── 1. R88 落月弓：瞄空地也打敵將 ─────────────────────────────────────

test('R88 落月弓：落点打在空地上也扣敵將血（Hurt 只对主将生效）', (t) => {
  const w = makeWorld();
  const a = genUnit(w, 'A');
  const b = genUnit(w, 'B');
  // A/B 主将分开站，落点选在"离谁都远"的空地，模拟玩家随手点一下。
  a.x = 40;
  a.y = 10;
  a.prevX = a.x;
  a.prevY = a.y;
  const hp0 = w.sides.B.general.hp;
  const before = spellOf(w);
  const r = cast(w, 'A' as Side, 2, 0, 0, 24);
  t.diagnostic(`cast=${JSON.stringify(r)} B将 hp ${hp0}→${w.sides.B.general.hp} dmg=${r.damage}`);
  assert.equal(r.ok, true, `落月弓应能放出来：${JSON.stringify(r)}`);
  run(w, 240);

  const d = delta(before, w);
  t.diagnostic(`spellDamageA=${d.dmg} spellKillsA=${d.kills} B将 hp ${hp0}→${w.sides.B.general.hp}`);
  // 依据：`Hurt` 的非主将分支只放音效、`ShootObjectCallback` 撞小兵写 `Hurt(...,0)`
  // ⇒ 这条技打不出"只掉兵血"的战果，伤害必然体现在敵將体力上。
  assert.ok(
    w.sides.B.general.hp < hp0,
    `落月弓应扣敵將血（hp ${hp0}→${w.sides.B.general.hp}，spellDamageA=${d.dmg}）`,
  );
  assert.ok(d.dmg > 0, `重伤害应计入 spellDamageA（实际 ${d.dmg}）`);
  // 有伤害就不该同时报 MISS
  assert.equal(skillMarksOf(w).some((m) => m.miss), false, '打出伤害时不该有 MISS 标记');
});

// ── 2. 落点只用来选 g3：ACTIVE=敵方主將 的技四点等价 ────────────────────

test('落点只用来选 g3：神鬼亂舞在战场四个角落的战果完全相同', (t) => {
  const corner = [
    { x: 0, y: 0 },
    { x: -30, y: 0 },
    { x: 0, y: 13 },
    { x: 40, y: 13 },
  ];
  const results = corner.map((aim, i) => {
    const w = makeWorld();
    const a = genUnit(w, 'A');
    const b = genUnit(w, 'B');
    a.x = b.x + 2.2;
    a.y = b.y;
    a.prevX = a.x;
    a.prevY = a.y;
    const hp0 = w.sides.B.general.hp;
    const before = spellOf(w);
    const r = cast(w, 'A' as Side, 104, aim.x, aim.y, 57);
    assert.equal(r.ok, true, `第 ${i} 个落点应能放出来：${JSON.stringify(r)}`);
    run(w, 300);
    const d = delta(before, w);
    const res = { kills: d.kills, dmg: d.dmg, hpLoss: hp0 - w.sides.B.general.hp };
    t.diagnostic(`落点 ${JSON.stringify(aim)} → ${JSON.stringify(res)}`);
    return res;
  });
  // 依据：`G[3]` 由引擎按 ACTIVE 解析（`0x43BA59`@`0x43BA9D` 写 `[0x4a6884]`），
  // 脚本里 `0x100` 又自己覆盖锚点 ⇒ 落点不参与伤害判定。
  for (let i = 1; i < results.length; i++)
    assert.deepEqual(results[i], results[0], `第 ${i} 个角落的战果应与第 0 个相同`);
  assert.ok(results[0]!.dmg > 0, '神鬼亂舞应对敵將造成伤害');
});

// ── 3. 半月斬：落点选兵堆 vs 点空地，战果相同（都按 g3 结算）─────────────

test('半月斬：落点选兵堆与点空地的战果相同（伤害按 g3 结算，不按落点）', (t) => {
  const shoot = (aim?: { x: number; y: number }) => {
    const w = makeWorld({ bSoldiers: 40 });
    const a = genUnit(w, 'A');
    const bs = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
    const cx = bs.reduce((s, u) => s + u.x, 0) / bs.length;
    const cy = bs.reduce((s, u) => s + u.y, 0) / bs.length;
    a.x = cx - 1.4;
    a.y = cy;
    a.prevX = a.x;
    a.prevY = a.y;
    const hp0 = w.sides.B.general.hp;
    const before = spellOf(w);
    const r = aim
      ? cast(w, 'A' as Side, 50, aim.x, aim.y, 24)
      : cast(w, 'A' as Side, 50, undefined, undefined, 24);
    assert.equal(r.ok, true, `半月斬应能放出来：${JSON.stringify(r)}`);
    run(w, 120);
    const d = delta(before, w);
    return { kills: d.kills, dmg: d.dmg, hpLoss: hp0 - w.sides.B.general.hp };
  };
  const auto = shoot();
  const mid = shoot({ x: 20, y: 6.5 });
  const corner = shoot({ x: 0, y: 0 });
  t.diagnostic(`auto=${JSON.stringify(auto)} mid=${JSON.stringify(mid)} corner=${JSON.stringify(corner)}`);
  assert.ok(auto.kills > 0, '半月斬应真的打到兵');
  assert.deepEqual(auto, mid, '默认落点与点中场应等价');
  assert.deepEqual(auto, corner, '默认落点与点角落应等价（落点不参与伤害判定）');
});

// ── 4. 606：同步指令数是"脚本 + 实现"的性质，与布局无关 ────────────────

function staged(seed: number): World {
  const w = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = w.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(g, 'A 方应有主将单位');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  w.sides.A.general.hp = Math.round(w.sides.A.general.maxHp * 0.4);
  return w;
}

function scriptOf(seq: number): number {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  assert.ok(m, `找不到第 ${seq} 号技能`);
  return m.SCRIPT;
}

test('606 同步指令数与布局无关（三个 seed 完全相同），逐帧帧数则随布局浮动', (t) => {
  const sync = [1, 7, 13].map((seed) => {
    const r = runSkill(staged(seed), 'A' as Side, scriptOf(95), 20, 6.5);
    assert.equal(r.ok, true, `seed=${seed} 的 606 应跑完：${r.log.join(' | ')}`);
    t.diagnostic(`seed=${seed} 同步 指令=${r.stats.instructions} syscall=${r.stats.syscalls} 物件=${r.stats.objects}`);
    return { i: r.stats.instructions, s: r.stats.syscalls };
  });
  // 同步模型下每次同步回合的回调记账次数是固定的 ⇒ 指令数/系统调用数不随布局变。
  assert.deepEqual(sync[1], sync[0], '606 同步指令数不该随 seed 变');
  assert.deepEqual(sync[2], sync[0], '606 同步指令数不该随 seed 变');

  // 逐帧模型：帧数 = 螺旋 280 圈 × WAIT 与"碰撞回调提前结束物件"的合成 ⇒ 布局一变就变。
  const frames = [1, 7, 13].map((seed) => {
    const s = startSkill(staged(seed), 'A' as Side, scriptOf(95), 20, 6.5);
    let n = 0;
    while (!s.done && n++ < 2000) s.advance();
    assert.equal(s.done, true, `seed=${seed} 的 606 会话应在预算内结束`);
    t.diagnostic(`seed=${seed} 逐帧 ${s.frames.length} 帧`);
    return s.frames.length;
  });
  assert.ok(
    new Set(frames).size > 1,
    `606 帧数应随布局变化（实测 ${frames.join('/')}）——这正是 562 随阵型重写漂移的原因`,
  );
  for (const f of frames) assert.ok(f > 500 && f < 600, `606 帧数应落在 500~600（实际 ${f}）`);
});
