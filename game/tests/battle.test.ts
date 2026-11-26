/**
 * 核心逻辑自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/*.test.ts
 *
 * 这些断言不是"覆盖率"，而是**移植正确性**：数据有没有搬错、阵形有没有落在网格里、
 * 同 seed 是否可复现、相克有没有真的生效、技能有没有按 MP/气力 扣。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, EXPECT } from '../src/data.ts';
import {
  ACTION_INTERVAL_TICKS,
  ATTACK_COOLDOWN,
  FX_TTL_DEFAULT,
  GRID_H,
  GRID_W,
  LANE_PX,
  QI_MAX,
  qiCostOf,
  ROW_PX,
  SCALE,
  camera,
  cast,
  createWorld,
  expToReach,
  formationCells,
  fxTtlOf,
  hitChance,
  levelFromExp,
  moraleTerm,
  powerOf,
  project,
  settle,
  step,
  terrainBonus,
  TICK_HZ,
} from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function runWorld(w: World, maxSec = 180): World {
  // m4：默认待機后，测试跑「一场真的会打起来的仗」必须先下令（旧内核缺省自动前压）。
  engage(w);
  const limit = maxSec * TICK_HZ;
  let n = 0;
  while (!w.over && n < limit) {
    step(w);
    n++;
  }
  return w;
}

test('数据条数与矩阵反对称（validate 内部已断言，这里再钉一次口径）', () => {
  assert.equal(data.generals.length, EXPECT.generals);
  assert.equal(data.magics.length, EXPECT.magics);
  assert.equal(data.wises.length, EXPECT.wises);
  assert.equal(data.items.length, EXPECT.items);
  assert.equal(data.terrains.length, EXPECT.terrains);
  assert.equal(data.troops.names.length, EXPECT.troops);
  assert.equal(data.formations.names.length, EXPECT.formations);
});

test('9 种阵形 × 两侧 × 100 兵：全部落在网格内且互不重叠', () => {
  for (let f = 0; f < EXPECT.formations; f++) {
    for (const side of ['A', 'B'] as const) {
      const cells = formationCells(data.formations, f, 100, side);
      assert.equal(cells.length, 100, `阵形 ${f} ${side} 落位数`);
      const seen = new Set<string>();
      for (const c of cells) {
        assert.ok(c.gx >= 0 && c.gx < GRID_W, `阵形 ${f} ${side} gx 越界: ${c.gx}`);
        assert.ok(c.gy >= 0 && c.gy < GRID_H, `阵形 ${f} ${side} gy 越界: ${c.gy}`);
        const k = `${c.gx},${c.gy}`;
        assert.ok(!seen.has(k), `阵形 ${f} ${side} 叠格: ${k}`);
        seen.add(k);
      }
    }
  }
});

test('同 seed 同结果（确定性）', () => {
  const mk = () => createWorld({ data, seed: 42, a: { troop: 2, formation: 0 }, b: { troop: 10, formation: 1 } });
  const w1 = runWorld(mk());
  const w2 = runWorld(mk());
  assert.equal(w1.tick, w2.tick);
  assert.equal(w1.winner, w2.winner);
  assert.equal(w1.sides.A.aliveCount, w2.sides.A.aliveCount);
  assert.equal(w1.sides.B.aliveCount, w2.sides.B.aliveCount);
});

test('强克制：大刀 vs 黄巾 胜率 100%（20 局）', () => {
  let wins = 0;
  for (let i = 0; i < 20; i++) {
    const w = runWorld(createWorld({ data, seed: 100 + i, a: { troop: 2, formation: 0 }, b: { troop: 10, formation: 0 } }));
    if (w.winner === 'A') wins++;
  }
  assert.equal(wins, 20, `大刀 vs 黄巾 胜 ${wins}/20`);
});

test('完全镜像不会一边倒（A/B 胜率各 ≤75%；平手是合法结局）', () => {
  // R159 起胜负只认主将生死：100v100 镜像常常双方兵尽、两将都活到时限 → 平手（reason 0x10），
  // 这是原作口径，不是回归。这里只防"系统性偏袒某一侧"，所以分母仍是 N，平手不计给任何人。
  let aWins = 0;
  let bWins = 0;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const w = runWorld(createWorld({ data, seed: 500 + i, a: { troop: 0, formation: 0 }, b: { troop: 0, formation: 0 } }));
    if (w.winner === 'A') aWins++;
    if (w.winner === 'B') bWins++;
  }
  assert.ok(aWins / N <= 0.75, `A 胜率 ${((aWins / N) * 100).toFixed(0)}% 偏高`);
  assert.ok(bWins / N <= 0.75, `B 胜率 ${((bWins / N) * 100).toFixed(0)}% 偏高`);
});

test('投影：纵向 71.43 px/格、横向 53.57 px/车道、我方在下', () => {
  assert.ok(Math.abs(ROW_PX - 71.43) < 0.01);
  assert.ok(Math.abs(LANE_PX - 53.57) < 0.01);
  assert.ok(Math.abs(SCALE - 0.744) < 0.001);
  const near = project(10, 10, 0);
  const far = project(10, 20, 0);
  assert.ok(far.sy > near.sy, 'worldX 越大越靠画面下（我方在下）');
  assert.equal(near.sx, LANE_PX / 2);
});

test('单局时长落在 8~60 秒（节奏基线）', () => {
  const w = runWorld(createWorld({ data, seed: 7, a: { troop: 2 }, b: { troop: 10 } }));
  assert.ok(w.over, '180 秒内必须结束');
  const sec = w.tick / TICK_HZ;
  // R84：R37 策略派发（伏兵/火计等）上线后单局从 15~30s 缩到 ~11.6s（策略造成额外伤亡），
  // 下限从 15 放宽到 8；上限不动。这是玩法参数变化，不是回归，见 project/31 §一之补4。
  assert.ok(sec > 8 && sec < 60, `单局 ${sec.toFixed(1)}s 超出预期区间`);
});

test('技能：扣技力/气力正确，MP 不足时不扣气力', () => {
  const w = createWorld({ data, seed: 3, a: { general: { str: 90, int: 100 } }, b: {} });
  const g = w.sides.A.general;
  // 原作开局只有半条气（0x442F52 初值 60000）；`POWER` 在数据里恒 100（伪影），
  // 故 `qiCostOf` 用 MP 当百分比（见 battle.ts 的 qiPowerPercentOf，[推测]），
  // 这里仍把气灌满，确认扣费按 `cost = 百分比 × QI_MAX / 100` 走。
  g.qi = QI_MAX;
  const mp0 = g.mp;
  const qi0 = g.qi;
  const cost50 = qiCostOf(data, 50);
  assert.ok(cost50 > 0 && cost50 < QI_MAX, `半月斬 的氣力應小於整條（實際 ${cost50}）`);
  // R139 起不传落点：点技能格就直接放，`defaultAim()` 自己挑（半月斬 = 敵方全軍 → 敌将格）。
  // 这条测的是扣费，与落点无关，所以走新语义（默认路径）更有价值。
  const r1 = cast(w, 'A', 50);
  assert.equal(r1.ok, true, `半月斬 施放失败: ${r1.reason}`);
  assert.equal(g.mp, mp0 - 22);
  assert.equal(g.qi, qi0 - cost50, '气力按 POWER(%)×QI_MAX/100 扣（0x43BAE3）');

  g.mp = 0;
  const qi1 = g.qi;
  // 这条故意仍传显式落点：老路径（玩家点格子，供调试/瞄准）也得照样走 mp 校验
  const r2 = cast(w, 'A', 50, 60, 6);
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'mp');
  assert.equal(g.qi, qi1, 'MP 不足时不应扣气力');
});

test('技能：治疗不会超过上限', () => {
  const w = createWorld({ data, seed: 4, a: { general: { str: 80, int: 100 } }, b: {} });
  const g = w.sides.A.general;
  g.hp = 20;
  g.qi = QI_MAX; // 一次技要整条气（POWER 100 × 1200 = 120000），开局只有半条（0x442F52）
  const r = cast(w, 'A', 1);
  // 命療術 = 我方主將（ACTIVE 0x2），純己方技由 `defaultAim()` 直接落自己身上；
  // 旧写法 `cast(w,'A',1,0,0)` 是在"必须点一个格子"的老语义下绕开落点，新语义不再需要。
  assert.equal(r.ok, true);
  assert.ok(g.hp <= g.maxHp);
  assert.ok(g.hp > 20);
});

test('技能：AoE 只杀敌不误伤自己人', () => {
  const w = createWorld({ data, seed: 5, a: { troop: 2 }, b: { troop: 10 } });
  const mine0 = w.sides.A.aliveCount;
  // 直接砸在自己阵中央
  const self = w.units.find((u) => u.side === 'A' && u.alive)!;
  cast(w, 'A', 104, self.x, self.y);
  assert.equal(w.sides.A.aliveCount, mine0, 'AoE 不应减少我方兵力');
});

test('特效时长：传 ttl=132 时 Fx.ttl/life 都是 132，且 132 tick 后从 world.fx 移除', () => {
  const w = createWorld({ data, seed: 12, a: { general: { str: 90, int: 100 } }, b: {} });
  w.sides.A.general.qi = QI_MAX; // 同上：整条气才放得出来
  const r = cast(w, 'A', 104, 34, 7, 132);
  assert.equal(r.ok, true, `神鬼亂舞 施放失败: ${r.reason}`);
  const fx = w.fx[w.fx.length - 1]!;
  assert.equal(fx.ttl, 132, 'Fx.ttl 应等于传入的 ttl');
  assert.equal(fx.life, 132, 'Fx.life 记总时长，视图按 elapsed/life 均分帧');

  // 用引用比对：AI 侧也会往 world.fx 里 push，只看长度会误判
  for (let i = 0; i < 131; i++) step(w);
  assert.equal(w.fx.includes(fx), true, '131 tick 时特效还该在');
  assert.equal(fx.ttl, 1);
  step(w);
  assert.equal(fx.ttl, 0);
  assert.equal(w.fx.includes(fx), false, '132 tick 后必须移除');
});

test('特效时长：不传 ttl 仍是 1 秒 = 60 tick（@60Hz），逐技时长按帧数推', () => {
  const w = createWorld({ data, seed: 13, a: { general: { str: 90, int: 100 } }, b: {} });
  w.sides.A.general.qi = QI_MAX; // 同上：整条气才放得出来
  const r = cast(w, 'A', 104, 34, 7);
  assert.equal(r.ok, true, `神鬼亂舞 施放失败: ${r.reason}`);
  const fx = w.fx[w.fx.length - 1]!;
  assert.equal(fx.ttl, FX_TTL_DEFAULT, '不传 ttl 必须还是缺省 1 秒（60 tick @60Hz）');
  assert.equal(fx.ttl, 60, 'R192：TICK_HZ 30→60 后缺省 30→60');
  assert.equal(fx.life, 60);

  // R192：ttl = clamp(round(fx_frames * FX_TICK_PER_FRAME), FX_TTL_MIN, FX_TTL_MAX)
  //       = clamp(round(帧数 * 60/13.6), 48, 264)（30 Hz 时代是 clamp(round(帧数*2.2),24,132)）
  assert.equal(fxTtlOf(data, 95), 264, '劍輪舞 152 帧 → 封顶 264（旧 132）');
  assert.equal(fxTtlOf(data, 104), 115, '神鬼亂舞 26 帧 → 114.7 → 115（旧 57）');
  assert.equal(fxTtlOf(data, 44), 203, '天地無用 46 帧 → 202.9 → 203（旧 101）');
  assert.equal(fxTtlOf(data, 46), 48, '連弩 8 帧 → 35.3 → 保底 48（旧 24）');
  assert.equal(fxTtlOf(data, 9999), 60, '查不到的技退回默认 1 秒 = 60 tick（旧 30）');
});

test('气力每 tick 回复', () => {
  const w = createWorld({ data, seed: 6, a: { general: { str: 90, int: 100 } }, b: {} });
  const g = w.sides.A.general;
  g.qi = 1000;
  step(w);
  // 0x43E72E：每 tick 回 max(武力, 智力)；本局 武力 90 / 智力 100 → 100
  assert.equal(g.qi, 1000 + 100);
  assert.ok(g.qi <= QI_MAX);
});

test('升级曲线与 docs/04b 一致', () => {
  assert.equal(expToReach(1), 0);
  assert.ok(Math.abs(expToReach(2) - 120) < 1e-9);
  assert.ok(Math.abs(expToReach(3) - 377) < 1e-9);
  assert.ok(Math.abs(expToReach(10) - 6012) < 1e-9);
  assert.equal(levelFromExp(0), 1);
  assert.equal(levelFromExp(120), 2);
  assert.equal(levelFromExp(376), 2);
  assert.equal(levelFromExp(377), 3);
});

test('结算：幂等、字段齐全、经验与等级推进', () => {
  const w = runWorld(createWorld({ data, seed: 11, a: { troop: 2 }, b: { troop: 10 } }));
  const s1 = settle(w);
  const s2 = settle(w);
  assert.equal(s1, s2, 'settle 必须幂等');
  assert.ok(s1.score > 0);
  assert.ok(s1.expGain > 0);
  assert.ok(s1.mode >= 1 && s1.mode <= 4, `mode=${s1.mode}`); // 四档：歼灭/击退/平手/大胜
  assert.ok(['歼灭', '击退', '平手', '大胜'].includes(s1.modeName));
  assert.ok(s1.report.length > 0, '战报文案不能为空');
  assert.ok(s1.tireGain >= 15, `疲劳增量 ${s1.tireGain}`);
  assert.equal(typeof s1.morale.A.before, 'number');
  assert.ok(Array.isArray(s1.learned));
  assert.ok(s1.durationSec > 0);
  assert.equal(w.sides.A.general.exp, s1.exp);
  assert.equal(w.sides.A.general.level, s1.level);
  assert.ok(s1.nextLevelAt > 0);
});

test('摄像机永远把视口夹在网格内', () => {
  const w = createWorld({ data, seed: 8, a: {}, b: {} });
  for (let i = 0; i < 60; i++) {
    const cam = camera(w);
    assert.ok(cam >= 6 && cam <= GRID_W - 7, `cam=${cam} 越界`);
    step(w);
    if (w.over) break;
  }
});

test('攻击冷却常量与原型一致（原作 40 帧 = 4/3 秒）', () => {
  // R113：原作士兵与主将共用同一个行动节奏计时器 0x43B574：
  //   0x43B574 到期复位处 `mov dword ptr [ecx+0x34], 0x28`（0x43B5DE，见 work/dis_battle_units.txt:1624）
  //   小队更新器 0x43D125 在 0x43D24B 调用它（:4136），主将更新器 0x43E964 在 0x43EB50 调用它（:6205）
  // 旧值 120（4 秒）是原型手感值（project/09_战斗原型说明.md:104），非原作依据，已废弃。
  assert.equal(ATTACK_COOLDOWN, 40);
  assert.equal(ATTACK_COOLDOWN, ACTION_INTERVAL_TICKS);
});

// ---------------------------------------------------------------------------
// 地形项（docs/04b §3.2 的 12×13 表；原作 `0x4307AE TerrainMod`）

const troopIdx = (name: string): number => {
  const i = data.troops.names.indexOf(name);
  assert.ok(i >= 0, `兵种表里找不到「${name}」`);
  return i;
};

test('地形表：行 0/1/2 完全一致，地形 3 + 弓箭 = +25（并进 world.sides / stats）', () => {
  // 行 0/1/2 是三种"城"地形，原表三行逐格相同 —— 抄错列/错行最容易在这里露馅
  assert.deepEqual(data.terrains[0].vs, data.terrains[1].vs);
  assert.deepEqual(data.terrains[1].vs, data.terrains[2].vs);
  assert.deepEqual(data.terrains[0].vs, [0, 0, 0, 10, 0, 0, 0, -8, 0, -5, 0, 0, 0]);

  const bow = troopIdx('弓箭');
  assert.equal(terrainBonus(data, 3, bow), 25, '地形 3(船上行) × 弓箭(列 3) 应为 +25');
  assert.equal(data.terrains[3]!.vs![bow], 25, 'JSON 里的原值也要是 25');

  const w = createWorld({ data, seed: 21, terrain: 3, a: { troop: bow, soldiers: 40 }, b: { troop: troopIdx('朴刀'), soldiers: 40 } });
  step(w);
  assert.equal(w.terrain, 3);
  assert.equal(w.sides.A.terrainBonus, 25);
  assert.equal(w.stats.terrainBonusA, 25, 'HUD 用的 stats.terrainBonusA 应同步');
  assert.equal(w.sides.B.terrainBonus, 0, '朴刀在行 3 是 0');
  assert.equal(w.stats.terrainBonusB, 0);

  // 战力五段加算：150 + 兵种相克 + 地形 + 阵形相克 + 士气项
  const rt = w.sides.A;
  assert.equal(powerOf(w, 'A'), 150 + rt.troopBonus + 25 + rt.formationBonus + moraleTerm(rt.morale));

  // 不传 terrain 时默认 0（= 城/平地）
  const w0 = createWorld({ data, seed: 21, a: { troop: bow } });
  assert.equal(w0.terrain, 0);
  step(w0);
  assert.equal(w0.sides.A.terrainBonus, 10, '地形 0 × 弓箭 = +10');
});

test('地形表：地形 9 + 蠻族 = −15；−25 在 r7c3(弓箭) 与 r9c9(藤甲)', () => {
  const barb = troopIdx('蛮族');
  const bow = troopIdx('弓箭');
  const rattan = troopIdx('藤甲');
  // 任务书 B.3 写"地形 9 + 蠻族 = −25"，但 docs/04b §3.2 原表 r9c7 是 −15（行 9 第 7 列）。
  // 文档为权威；−25 的两格是 r7c3（弓箭）和 r9c9（藤甲）—— 这里一起钉住，抄错列会立刻红。
  assert.deepEqual(data.terrains[9]!.vs, [-8, -6, -7, -5, -10, -5, 12, -15, -10, -25, -14, -5, -12]);
  assert.equal(terrainBonus(data, 9, barb), -15);
  assert.equal(terrainBonus(data, 9, rattan), -25);
  assert.equal(terrainBonus(data, 7, bow), -25);
  // 行 3 整行（船上）：弓箭 +25 / 蠻族 −24 是同一条验收线
  assert.deepEqual(data.terrains[3]!.vs, [0, -2, -5, 25, -5, 15, 5, -24, -5, 0, 0, 10, 6]);
  assert.equal(terrainBonus(data, 3, barb), -24);
});

test('terrainBonus：地形/兵种越界一律 0，不抛异常', () => {
  assert.equal(terrainBonus(data, 3, troopIdx('弓箭')), 25);
  for (const [t, u] of [
    [-1, 0],
    [12, 0],
    [99, 3],
    [0, -1],
    [0, 13],
    [0, 99],
    [Number.NaN, 0],
    [3, Number.NaN],
    [1.5, 0],
    [3, 3.5],
  ] as const) {
    assert.equal(terrainBonus(data, t, u), 0, `terrain=${t} troop=${u} 应返回 0`);
  }
});

test('地形接入生效：地形 3 让弩兵的胜率上升（200 局，只断方向）', () => {
  // 选对必须让两侧净差 ≠ 0 的对局：弩兵(列 11) 在行 3 得 +10、行 0 得 0；朴刀(列 0) 两行都是 0。
  // 反例："弓箭 vs 飞刀" 两侧在行 3 各得 +25/+15，净差为 0，只会测到随机噪声。
  const aTroop = troopIdx('弩兵');
  const bTroop = troopIdx('朴刀');
  assert.equal(terrainBonus(data, 3, aTroop) - terrainBonus(data, 0, aTroop), 10);
  assert.equal(terrainBonus(data, 3, bTroop) - terrainBonus(data, 0, bTroop), 0);

  // R159：不再拿 200 局胜率当探针 —— 胜负改成主将生死后，40v40 大量对局是「双方兵尽、两将都活」
  // 的平手，胜率信噪比太低；而且 +10 战力不跨 `power/48` 取整台阶时单次伤害仍是 3（不变），
  // 真正吃到地形的是命中判定值（兵→兵 p = powerOf，命中率 +10/300）。
  const mk = (terrain: number): World => {
    const w = createWorld({
      data,
      seed: 4000,
      terrain,
      a: { troop: aTroop, soldiers: 40 },
      b: { troop: bTroop, soldiers: 40 },
    });
    step(w);
    for (const u of w.units) {
      // 排除 `0x43BE08` 的「本 tick 有位移 → p × 2/3」修正，只比较地形项
      u.prevX = u.x;
      u.prevY = u.y;
    }
    return w;
  };
  const w0 = mk(0);
  const w3 = mk(3);
  const a0 = w0.units.find((u) => u.side === 'A' && !u.isGeneral)!;
  const b0 = w0.units.find((u) => u.side === 'B' && !u.isGeneral)!;
  const a3 = w3.units.find((u) => u.side === 'A' && !u.isGeneral)!;
  const b3 = w3.units.find((u) => u.side === 'B' && !u.isGeneral)!;
  assert.equal(hitChance(w0, a0, b0), powerOf(w0, 'A'), '兵→兵的命中值就是 powerOf');
  assert.equal(
    hitChance(w3, a3, b3) - hitChance(w0, a0, b0),
    10,
    '地形 3 的 +10 必须真的进到命中判定（不是只写在表里）',
  );
});
