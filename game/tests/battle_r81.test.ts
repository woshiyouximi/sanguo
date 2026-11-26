/**
 * R81 战斗内核补齐 —— 逐条对着反汇编/文档锚点写的回归测试。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/battle_r81.test.ts`
 *
 * 每条用例的标题都带**原作地址**，方便日后拿 `work/dis_*.txt` 复核：
 *  - R23 `0x40A020` / `0x40A098` / `0x40F23C`（体力/技力上限 + 升级溢出）
 *  - R46 `0x43EC54`（普攻伤害）
 *  - R44 `0x43B6C9`（`+0x2C & 4` = 骑兵 → 命中 `STR/3`）
 *  - R47 `0x43BAE3` / `0x43E72E` / `0x442F52` / `0x43E964`（气力上限、初值、消耗、回复）
 *  - R59 `0x41048D`（战功「带兵差」）
 *  - R63 `0x4084C9`（战绩累加）
 *  - R64 `0x410989`（额外经验）
 *  - R38 `0x4447B7`（全军撤退）/ R39 天气
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  AI_RETREAT_TROOP_RATIO,
  EMPTY_RECORD,
  MORALE_DAMP,
  QI_MAX,
  QI_START,
  basicDamage,
  cast,
  createWorld,
  extraExpOf,
  hitChance,
  hpCapOf,
  isCavalryBit,
  moraleTerm,
  mpCapOf,
  powerOf,
  qiCostOf,
  qiPowerPercentOf,
  qiRegenOf,
  requestRetreat,
  settle,
  step,
  updateRecord,
  warMeritOf,
} from '../src/core/battle.ts';
import type { Side, Unit, World } from '../src/core/battle.ts';
import { normalizeWeather, weatherHitMod, weatherOf } from '../src/core/weather.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 跑到结束或到达 tick 上限（返回跑了多少 tick） */
function runWorld(w: World, maxTicks = 6000): number {
  let n = 0;
  while (!w.over && n < maxTicks) {
    step(w);
    n++;
  }
  return n;
}

/** 主将单位（`u.isGeneral`） */
function generalUnit(w: World, side: Side): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral);
  assert.ok(u, `${side} 侧没有主将单位`);
  return u;
}

/** 站定（清掉"本 tick 有位移 → p×2/3"的修正） */
function standStill(u: Unit): Unit {
  u.prevX = u.x;
  u.prevY = u.y;
  return u;
}

// ---------------------------------------------------------------------------
// R23 体力 / 技力上限（0x40A020 / 0x40A098）+ 升级（0x40F23C）
// ---------------------------------------------------------------------------

test('R23 hpCapOf = BaseHP + 等级×2×武力/100，下限 BaseHP、上限 32767（0x40A020）', () => {
  // docs/04c:292 的逐字公式
  assert.equal(hpCapOf(78, 100, 1), 80); // 78 + (1*2*100)/100 = 80
  assert.equal(hpCapOf(78, 50, 20), 98); // 78 + (20*2*50)/100 = 98
  assert.equal(hpCapOf(100, 0, 99), 100, '武力 0 时不能低于 BaseHP');
  assert.equal(hpCapOf(30000, 200, 1), 30004);
  assert.equal(hpCapOf(32760, 200, 99), 0x7fff, '必须夹到 0x7FFF');
});

test('R23 mpCapOf 的 t 只在武力>智力时取平均（0x40A098）', () => {
  // 智力 ≥ 武力 → t = INT：44 + (1*2*91)/100 = 45
  assert.equal(mpCapOf(44, 52, 91, 1), 45);
  // 武力 > 智力 → t = (52+91)/2 不适用本例；改用 100/60：t = 80 → 60 + (10*2*80)/100 = 76
  assert.equal(mpCapOf(60, 100, 60, 10), 76);
  // 相等时走 else 分支（t = INT）
  assert.equal(mpCapOf(60, 60, 60, 10), 72);
  assert.equal(mpCapOf(60, 60, 60, 0), 60, '等级 0 也不能低于 BaseMP');
});

test('R23 createWorld 用 generals.json 的 BaseHP/BaseMP，无档案时兜底 100/60', () => {
  // 无名字的默认主将：兜底 BaseHP=100 / BaseMP=60，武力 80 / 智力 60 / 等级 1
  const plain = createWorld({ data, seed: 1 });
  assert.equal(plain.sides.A.general.baseHp, 100);
  assert.equal(plain.sides.A.general.baseMp, 60);
  assert.equal(plain.sides.A.general.maxHp, hpCapOf(100, 80, 1));
  assert.equal(plain.sides.A.general.mpMax, mpCapOf(60, 80, 60, 1));
  assert.equal(plain.sides.A.general.hp, plain.sides.A.general.maxHp);

  // 有档案的主将：走 TIMES 的底值
  const row = data.generals.find((g) => g.NAME && g.BaseHP > 0 && g.BaseMP > 0);
  assert.ok(row, 'generals.json 里应有带 BaseHP/BaseMP 的行');
  const w = createWorld({ data, seed: 1, a: { general: { name: row.NAME, str: row.STR, int: row.INT, level: 3 } } });
  assert.equal(w.sides.A.general.baseHp, Math.round(row.BaseHP));
  assert.equal(w.sides.A.general.maxHp, hpCapOf(Math.round(row.BaseHP), row.STR, 3));
  assert.equal(w.sides.A.general.mpMax, mpCapOf(Math.round(row.BaseMP), row.STR, row.INT, 3));
});

test('R23 升级按 0x40F23C 重算上限，不再手调 +6/+3', () => {
  // 让敌方主将 30 级 → 额外经验足够把我方顶上去几级
  const w = createWorld({ data, seed: 3, b: { general: { str: 80, int: 60, level: 30 } } });
  w.units = w.units.filter((u) => u.side !== 'B' || u.isGeneral); // 敌方兵"消失"
  w.sides.B.general.alive = false; // R159 起兵尽不结束，要主将阵亡才收尾
  step(w);
  assert.equal(w.over, true);
  const s = settle(w);
  assert.ok(s.levelUp > 0, `应当升级，实际 levelUp=${s.levelUp}`);
  const g = w.sides.A.general;
  assert.equal(g.level, s.level);
  assert.equal(g.maxHp, hpCapOf(g.baseHp ?? 100, g.str, g.level), '升级后上限必须等于公式值');
  assert.equal(g.mpMax, mpCapOf(g.baseMp ?? 60, g.str, g.int, g.level), '技力上限同理');
});

// ---------------------------------------------------------------------------
// R46 普攻伤害（0x43EC54）
// ---------------------------------------------------------------------------

test('R46 武将伤害 = (rand%(str-str/2)+str/2)/10，下限 1（0x43EC54 武将分支）', () => {
  const w100 = createWorld({ data, seed: 11, a: { general: { str: 100, int: 60, level: 1 } } });
  const g100 = generalUnit(w100, 'A');
  for (let i = 0; i < 400; i++) {
    const d = basicDamage(w100, g100);
    assert.ok(d >= 5 && d <= 9, `武力 100 的伤害应落在 5..9，实际 ${d}`);
  }
  const w60 = createWorld({ data, seed: 12, a: { general: { str: 60, int: 60, level: 1 } } });
  const g60 = generalUnit(w60, 'A');
  for (let i = 0; i < 400; i++) {
    const d = basicDamage(w60, g60);
    assert.ok(d >= 3 && d <= 5, `武力 60 的伤害应落在 3..5，实际 ${d}`);
  }
});

test('R46 士兵伤害 = 战力×4/0xC0，骑兵 ×1.2（0x43EC54 士兵分支）', () => {
  const w = createWorld({ data, seed: 13, b: { cavalry: 10 } });
  w.sides.B.troopBonus = 48; // 兵种加成不开放给 createWorld，直接写运行时
  // 战力 = 150 + troopBonus(48) + 地形 + 阵形 + 士气项(士气 60 → +2)
  const inf = w.units.find((u) => u.side === 'B' && !u.isGeneral && u.kind !== 'cavalry');
  const cav = w.units.find((u) => u.side === 'B' && u.kind === 'cavalry');
  assert.ok(inf && cav, '需要一名步兵和一名骑兵');
  assert.equal(isCavalryBit(inf), false);
  assert.equal(isCavalryBit(cav), true);
  const power = 150 + 48 + w.sides.B.terrainBonus + w.sides.B.formationBonus + 2;
  assert.equal(basicDamage(w, inf), Math.max(1, Math.trunc((power * 4) / 0xc0)));
  assert.equal(basicDamage(w, cav), Math.max(1, Math.trunc(((Math.trunc((power * 0x78) / 0x64) * 4) / 0xc0) | 0)));
});

// ---------------------------------------------------------------------------
// R44 +0x2C & 4 → 打骑兵用 STR/3
// ---------------------------------------------------------------------------

test('R44 将→兵命中：打骑兵是 150+STR/3，打步兵是 150+STR/2（0x43B6C9）', () => {
  const w = createWorld({ data, seed: 21, a: { general: { str: 90, int: 60, level: 1 } }, b: { cavalry: 10 } });
  const gen = standStill(generalUnit(w, 'A'));
  const inf = standStill(w.units.find((u) => u.side === 'B' && !u.isGeneral && u.kind !== 'cavalry')!);
  const cav = standStill(w.units.find((u) => u.side === 'B' && u.kind === 'cavalry')!);
  assert.equal(hitChance(w, gen, inf), 150 + Math.trunc(90 / 2));
  assert.equal(hitChance(w, gen, cav), 150 + Math.trunc(90 / 3));
  assert.ok(hitChance(w, gen, cav) < hitChance(w, gen, inf), '打骑兵要更难命中');
});

// ---------------------------------------------------------------------------
// R47 气力（0x442F52 初值 / 0x43E964 上限 / 0x43BAE3 消耗 / 0x43E72E 回复）
// ---------------------------------------------------------------------------

test('R47 气力上限 120000、初值 60000（0x43E964 + 0x442F52）', () => {
  assert.equal(QI_MAX, 120000);
  assert.equal(QI_START, 60000);
  const w = createWorld({ data, seed: 31 });
  assert.equal(w.sides.A.general.qi, 60000);
  assert.equal(w.sides.B.general.qi, 60000);
});

test('R47 气力消耗 = POWER(%)×QI_MAX/100（0x43BAE3）；恒 100 的数据用 MP 当百分比', () => {
  const magic = data.magics[0];
  assert.ok(magic, 'magics.json 不应为空');
  assert.equal(magic.POWER, 100, '原作 POWER 恒 100（数据伪影）');
  // POWER 恒 100 ⇒ 走 `qiPowerPercentOf` 的 proxy（MP 当百分比，夹 20..80），
  // 否则「每一招都要整条气」，开局半条气（60000）一招也放不出来（见 project/89 步骤 4a）。
  assert.equal(qiPowerPercentOf(magic), Math.max(20, Math.min(80, magic.MP)), 'proxy 百分比 = MP 夹 20..80');
  assert.equal(qiCostOf(data, magic.SEQUENCE), qiPowerPercentOf(magic) * (QI_MAX / 100));
  assert.ok(qiCostOf(data, magic.SEQUENCE) < QI_START, '开局半条气就应放得出一招');
  const w = createWorld({ data, seed: 32 });
  const r = cast(w, 'A', magic.SEQUENCE, 30, 7);
  assert.equal(r.ok, true, `开战应放得出：${r.reason}`);
});

test('R47 每 tick 回 max(武力,智力)（0x43E72E）', () => {
  assert.equal(qiRegenOf({ str: 52, int: 91 }), 91);
  assert.equal(qiRegenOf({ str: 100, int: 60 }), 100);
  assert.equal(qiRegenOf({ str: 60, int: 60 }), 60);
  const w = createWorld({ data, seed: 33, a: { general: { str: 100, int: 60, level: 1 } } });
  w.sides.A.general.qi = 0;
  step(w);
  assert.equal(w.sides.A.general.qi, 100, '武力 100 → 每 tick 回 100');
  assert.ok(w.sides.A.general.qi <= QI_MAX);
});

// ---------------------------------------------------------------------------
// R41 士气项 ±10
// ---------------------------------------------------------------------------

test('R41 士气项 ±10，MORALE_DAMP 不再是 2（0x43B5C9 / docs/04b:249）', () => {
  // `(士气 - 0x32) / 5`，C 整除向零截断：0→−10、50→0、100→+10
  assert.equal(MORALE_DAMP, 1, 'R41 的减半系数必须已经拆掉');
  assert.equal(moraleTerm(0), -10);
  assert.equal(moraleTerm(45), -1);
  assert.equal(moraleTerm(50), 0);
  assert.equal(moraleTerm(55), 1);
  assert.equal(moraleTerm(100), 10);

  // 士气只通过这一项进战力：满士气 vs 零士气，同一 seed 下差 20
  const hi = createWorld({ data, seed: 81, a: { morale: 100 }, b: { morale: 100 } });
  const lo = createWorld({ data, seed: 81, a: { morale: 0 }, b: { morale: 0 } });
  assert.equal(powerOf(hi, 'A') - powerOf(lo, 'A'), 20, '(100−50)/5 − (0−50)/5 = 10 − (−10)');
});

// ---------------------------------------------------------------------------
// R59 战功「带兵差」（0x41048D）
// ---------------------------------------------------------------------------

test('R59 warMeritOf = max(0, 步兵差×6 + 骑兵差×12)（0x41048D）', () => {
  assert.equal(warMeritOf(100, 0, 70, 0), 180); // 30 步兵 ×6
  assert.equal(warMeritOf(100, 20, 90, 10), 60 + 120); // 10×6 + 10×12
  assert.equal(warMeritOf(100, 10, 100, 10), 0);
  assert.equal(warMeritOf(10, 0, 100, 0), 0, '战后反而变多时必须夹到 0');
  assert.equal(warMeritOf(0, 5, 0, 5), 0);
});

test('R59 settle 的战功分用的就是开战快照 − 战后值', () => {
  const w = createWorld({ data, seed: 41 });
  // 直接杀掉 10 名敌方步兵（等价于战斗中被打掉），再让结算读快照
  const victims = w.units.filter((u) => u.side === 'B' && !u.isGeneral).slice(0, 10);
  for (const u of victims) u.alive = false;
  w.units = w.units.filter((u) => u.side !== 'B' || u.isGeneral);
  // 原作兵尽不结束（`army+0x5c<=0` 只清命令位），要主将阵亡才收尾
  w.sides.B.general.alive = false;
  step(w);
  const s = settle(w);
  // 敌方 100 兵全灭（快照 100 → 0），大胜档还会 ×2，所以这里只核对"带兵差"这一项的下限
  assert.ok(s.score >= warMeritOf(w.sides.B.startInf, w.sides.B.startCav, w.sides.B.aliveInf, w.sides.B.aliveCav));
  assert.equal(w.sides.B.aliveInf, 0);
  assert.equal(w.sides.B.aliveCav, 0);
});

// ---------------------------------------------------------------------------
// R63 战绩累加（0x4084C9）
// ---------------------------------------------------------------------------

test('R63 updateRecord：胜/败/连胜/最高连胜（0x4084C9）', () => {
  let rec = { ...EMPTY_RECORD };
  assert.deepEqual(rec, { wins: 0, losses: 0, streak: 0, bestStreak: 0 });
  rec = updateRecord(rec, true);
  rec = updateRecord(rec, true);
  assert.deepEqual(rec, { wins: 2, losses: 0, streak: 2, bestStreak: 2 });
  rec = updateRecord(rec, false);
  assert.deepEqual(rec, { wins: 2, losses: 1, streak: 0, bestStreak: 2 }, '败：连胜清零，最高连胜保留');
  rec = updateRecord(rec, true);
  assert.deepEqual(rec, { wins: 3, losses: 1, streak: 1, bestStreak: 2 });
  rec = updateRecord(rec, 'draw');
  assert.deepEqual(rec, { wins: 3, losses: 1, streak: 0, bestStreak: 2 }, '平：胜败场都不动，只清连胜');
  // 脏输入也被归一
  assert.deepEqual(updateRecord({ wins: -5, losses: NaN, streak: -1, bestStreak: 7 } as never, true), {
    wins: 1,
    losses: 0,
    streak: 1,
    bestStreak: 7,
  });
});

test('R63 settle 把战前战绩带进来累加（不是只写 1/0）', () => {
  const w = createWorld({ data, seed: 42, record: { wins: 3, losses: 2, streak: 2, bestStreak: 4 } });
  w.units = w.units.filter((u) => u.side !== 'B' || u.isGeneral);
  w.sides.B.general.alive = false; // 兵尽不结束（R159），主将阵亡才判负
  step(w);
  const s = settle(w);
  assert.equal(s.winner, 'A');
  assert.deepEqual(s.record, { wins: 4, losses: 2, streak: 3, bestStreak: 4 });
  assert.equal(w.record.wins, 3, 'settle 不该就地改 world.record');

  const l = createWorld({ data, seed: 43, record: { wins: 4, losses: 2, streak: 3, bestStreak: 4 } });
  l.units = l.units.filter((u) => u.side !== 'A' || u.isGeneral);
  l.sides.A.general.alive = false; // 主将阵亡 → 我方败
  step(l);
  const sl = settle(l);
  assert.equal(sl.winner, 'B');
  assert.deepEqual(sl.record, { wins: 4, losses: 3, streak: 0, bestStreak: 4 });
});

// ---------------------------------------------------------------------------
// R64 额外经验（0x410989）
// ---------------------------------------------------------------------------

test('R64 extraExpOf = Σ敌等级×32 ÷ 我方人数（0x410989）', () => {
  assert.equal(extraExpOf(0, 1), 0);
  assert.equal(extraExpOf(10, 1), 320);
  assert.equal(extraExpOf(10, 4), 80);
  assert.equal(extraExpOf(9, 3), 96);
  assert.equal(extraExpOf(100, 0), 3200, '人数 0 也不能除零');
});

test('R64 settle 的额外经验 = Σ(敌方主将+副将等级)×32 ÷ (1+我方副将数)', () => {
  const w = createWorld({
    data,
    seed: 51,
    b: {
      general: { str: 80, int: 60, level: 7 },
      officers: [{ name: '副將甲', str: 60, int: 60, level: 5 }],
    },
    a: {
      officers: [
        { name: '副將乙', str: 60, int: 60, level: 3 },
        { name: '副將丙', str: 60, int: 60, level: 3 },
        { name: '副將丁', str: 60, int: 60, level: 3 },
      ],
    },
  });
  w.units = w.units.filter((u) => u.side !== 'B' || u.isGeneral);
  step(w);
  const s = settle(w);
  // 敌方 7+5=12 级，我方 1+3=4 人 → 12*32/4 = 96
  assert.equal(extraExpOf(12, 4), 96);
  assert.equal(s.expGain, s.score + 96, '无军师技时 expGain = 战功 + 额外经验');
});

// ---------------------------------------------------------------------------
// R38 全军撤退（0x4447B7）
// ---------------------------------------------------------------------------

test('R38 requestRetreat：全军转退却，离场后判负且不算阵亡（0x4447B7）', () => {
  const w = createWorld({ data, seed: 61, a: { soldiers: 3 }, b: { soldiers: 3 } });
  assert.equal(w.fled.B, false);
  assert.equal(w.status.B, 0);
  assert.equal(requestRetreat(w, 'B'), true);
  assert.equal(requestRetreat(w, 'B'), false, '同一侧不能重复下令');
  assert.equal(w.fled.B, true);
  assert.equal(w.status.B, 2, '撤退中状态码 = 2（docs/04b:530）');
  for (const u of w.units) if (u.side === 'B') assert.equal(u.flee, true);

  const ticks = runWorld(w, 4000);
  assert.ok(w.over, `应在 ${ticks} tick 内结束`);
  assert.equal(w.endReason, 'retreat');
  assert.equal(w.winner, 'A');
  assert.equal(w.status.B, 2, '撤出去且没被截住 → 2');
  assert.equal(w.stats.killsInf + w.stats.killsCav, 0, '撤退离场不算击杀');
  const s = settle(w);
  assert.equal(s.status.B, 2);
});

test('R38 AI 撤退只在 aiRetreat 打开且兵力劣势时触发', () => {
  const off = createWorld({ data, seed: 62, a: { soldiers: 40 }, b: { soldiers: 4 } });
  off.sides.B.start = 100; // 让"存活 ≤ 开局 30%"立刻成立
  step(off);
  assert.equal(off.fled.B, false, '缺省不开 AI 撤退');

  const on = createWorld({ data, seed: 62, a: { soldiers: 40 }, b: { soldiers: 4 }, aiSides: { B: true }, aiRetreat: true });
  on.sides.B.start = 100;
  assert.ok(AI_RETREAT_TROOP_RATIO > 0);
  step(on);
  assert.equal(on.fled.B, true, '兵力 4 ≤ 100×0.3 且敌方 40 ≥ 4×2 → 撤退');
});

// ---------------------------------------------------------------------------
// R39 天气
// ---------------------------------------------------------------------------

test('R39 天气按「月 × 地形」推（起雾/下雨/下雪/晴）', () => {
  assert.equal(weatherOf(1, 0), 2, '冬季非沙漠 → 雪');
  assert.equal(weatherOf(1, 9), 0, '冬季沙漠不下雪');
  assert.equal(weatherOf(7, 7), 1, '夏季森林 → 雨');
  assert.equal(weatherOf(7, 0), 0, '夏季城池 → 晴');
  assert.equal(weatherOf(4, 6), 3, '春秋山地 → 雾');
  assert.equal(weatherOf(8, 8), 2, '雪原恒雪');
  assert.equal(weatherOf(13, 0), 2, '月份越界按 12 月环绕');
  assert.equal(weatherOf(NaN, 0), 2, '非法月份按 1 月');
  assert.equal(normalizeWeather(9), 0);
  assert.equal(normalizeWeather(-1), 0);
  assert.equal(normalizeWeather(3), 3);
  assert.equal(weatherHitMod(0), 0);
  assert.ok(weatherHitMod(1) < weatherHitMod(0) && weatherHitMod(3) < weatherHitMod(1));
});

test('R39 天气接进命中：不给 month 时恒晴，给了才扣（[推测] 值）', () => {
  const clear = createWorld({ data, seed: 71 });
  assert.equal(clear.weather, 0, '缺省晴，既有曲线不动');
  const gen = standStill(generalUnit(clear, 'A'));
  const enemy = standStill(generalUnit(clear, 'B'));
  const base = hitChance(clear, gen, enemy);
  assert.equal(base, 150, '武力相同 → 150');

  const rain = createWorld({ data, seed: 71, weather: 1 });
  assert.equal(rain.weather, 1);
  const gen2 = standStill(generalUnit(rain, 'A'));
  const enemy2 = standStill(generalUnit(rain, 'B'));
  assert.equal(hitChance(rain, gen2, enemy2), base + weatherHitMod(1));

  const winter = createWorld({ data, seed: 71, month: 1, terrain: 0 });
  assert.equal(winter.weather, 2, '1 月城池 → 雪');
});
