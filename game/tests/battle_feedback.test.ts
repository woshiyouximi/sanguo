/**
 * R84 战斗反馈自检（问题 1 的"看到即发生"）：
 *
 * 反例来自 `project/97_全流程演练2.md` 步骤⑤：放半月斬/落月弓，战场飘 `MISS`、
 * 结算写「擊殺 0 名敵兵」，但敵将 HUD 血条确实在掉。根因是显示层拿 `CastResult.killed`
 * （语义 = **打死的敌兵数**）当"有没有命中"用（`game/web/main.js:1115`），而法术打主将
 * 只改 `g.hp`，永远 killed=0 ⇒ 永远 MISS。
 *
 * 这里钉死四件事：
 *   1. 法术打掉主将体力 ⇒ `world.skillMarks` 有一条 `damage>0` 的标记，且**没有** `miss` 标记；
 *   2. 真没打中（射程外）⇒ 只有 `miss` 标记，没有伤害标记；
 *   3. 多帧技在会话结束前打死的兵也要进 `stats.spellKills*`（旧实现只在会话 done 时汇总，
 *      而半月斬这类脚本在同步模型里永远不 done ⇒ 法术击杀恒 0）；
 *   4. 视图 `buildFrame()` 在有标记/有技能在解算时不画 web 那句抢跑的 `MISS`。
 *
 * 另外钉 `mpCapOf()`（问题 3 的裁决：神鬼亂舞 MP47 是原作门槛，不是算错）。
 * 跑法：cd F:\sanguo\game && node --test tests/battle_feedback.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  BATTLE_TICK_LIMIT,
  cast,
  createWorld,
  mpCapOf,
  settle,
  skillMarksOf,
  step,
} from '../src/core/battle.ts';
import type { Unit, World } from '../src/core/battle.ts';
import { engage } from './_engage.ts';
import { buildFrame, DEFAULT_SKILL_SEQ, learnedSkillSeqs, pushFloater } from '../src/view/battleView.ts';
import type { Floater } from '../src/view/battleView.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

interface Options {
  aSoldiers?: number;
  bSoldiers?: number;
  seed?: number;
  aName?: string;
  aLevel?: number;
  bName?: string;
  bLevel?: number;
}

/** 真将真数据建局；`aiSides` 全关，测试里只让 A 手动放技，避免 AI 放技污染骰序。
 *  m4：默认待機后补 `engage()` —— 这些测试要「打起来」才有的反馈（伤害/飘字/胜负）。 */
function makeWorld(o: Options = {}): World {
  const aName = o.aName ?? '張角';
  const bName = o.bName ?? '張勳';
  const row = (name: string) => data.generals.find((g) => g.NAME === name) ?? null;
  const ga = row(aName);
  const gb = row(bName);
  return engage(createWorld({
    data,
    seed: o.seed ?? 7,
    a: {
      soldiers: o.aSoldiers ?? 1,
      troop: 2,
      formation: 0,
      general: {
        name: aName,
        str: ga?.STR ?? 56,
        int: ga?.INT ?? 95,
        level: o.aLevel ?? 2,
      },
    },
    b: {
      soldiers: o.bSoldiers ?? 1,
      troop: 10,
      formation: 0,
      general: {
        name: bName,
        str: gb?.STR ?? 69,
        int: gb?.INT ?? 63,
        level: o.bLevel ?? 2,
      },
    },
    aiSides: { A: false, B: false },
  }));
}

function genUnit(w: World, side: 'A' | 'B'): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral);
  assert.ok(u, `主将单位缺失: ${side}`);
  return u;
}

/** 把 A 主将挪到 B 主将身边（複刻"贴身放技"），并保证 B 主将不动。 */
function adjacent(w: World, gap = 1.6): { a: Unit; b: Unit } {
  const a = genUnit(w, 'A');
  const b = genUnit(w, 'B');
  a.x = b.x + gap;
  a.y = b.y;
  a.prevX = a.x;
  a.prevY = a.y;
  return { a, b };
}

/** 跑到条件满足或超时；返回未满足时也返回（由调用方断言）。 */
function runUntil(w: World, limit: number, done: () => boolean): void {
  for (let i = 0; i < limit && !w.over && !done(); i++) step(w);
}

test('R84 神鬼亂舞打主将：记 damage 标记、不记 miss（旧 UI 会飘 MISS）', () => {
  const w = makeWorld({ aSoldiers: 20, bSoldiers: 20 });
  const a = genUnit(w, 'A');
  const b = genUnit(w, 'B');
  // 站到 2.2 格外：够得着技能、又够不着普攻（ENGAGE_RANGE=1.15），好把"掉血"干净地归给法术
  const gap = 2.2;
  const hp0 = w.sides.B.general.hp;
  a.x = b.x + gap;
  a.y = b.y;
  // R139 起不传落点：技能格点下去直接放，`defaultAim()` 按 ACTIVE 掩码挑（神鬼亂舞 =
  // 敵方主將 → 敌将所在格），效果与旧写法 `cast(...,b.x,b.y)` 一致 —— 这条正是"自动瞄准
  // 也该打掉主将体力、也该记 damage 标记"的回归钉子。
  const r = cast(w, 'A', 104, undefined, undefined, 57);
  assert.equal(r.ok, true, '神鬼亂舞该放得出来');
  // 第 0 帧没生效：这就是旧 UI 判 MISS 的时刻；真值在第 6~7 帧才到
  assert.equal(r.killed, 0);
  assert.equal(r.hit, false);
  // 粘住（不粘会被 generalMove 拉回本阵，脱离技能范围）
  for (let i = 0; i < 200 && !w.over && w.sides.B.general.hp === hp0; i++) {
    a.x = b.x + gap;
    a.y = b.y;
    a.prevX = a.x;
    a.prevY = a.y;
    step(w);
  }

  const lost = hp0 - w.sides.B.general.hp;
  assert.ok(lost > 0, `主将该掉血（实际 ${lost}）`);
  const marks = skillMarksOf(w);
  const dmg = marks.filter((m) => m.damage > 0);
  assert.equal(dmg.length > 0, true, `该有伤害标记，实际 ${JSON.stringify(marks)}`);
  assert.equal(
    dmg.reduce((s, m) => s + m.damage, 0),
    lost,
    '标记数值合计必须等于实际掉血',
  );
  assert.equal(marks.some((m) => m.miss), false, '真掉血了就不该有 MISS 标记');
  assert.equal(w.stats.spellDamageA, lost, '法术伤害要进 stats.spellDamageA');
  // 掉的是主将体力，不是兵 ⇒ 击杀计数里没有这一发
  const out = settle(w);
  assert.ok(out.spellKills <= out.kills);
});

test('R88 落月弓：落点由引擎解析，瞄空地也打敵將（原 R84 把「打空」当正确，已按原作语义改写）', () => {
  const w = makeWorld({ aSoldiers: 20, bSoldiers: 20 });
  const a = genUnit(w, 'A');
  const b = genUnit(w, 'B');
  // 原 R84 这条断言「射程外 20 格 ⇒ 只有 miss、没有伤害」，前提是"落点决定打谁"。
  // R139/R140 的考古推翻了这个前提（`project/139` §2、`project/140` §3.2）：
  //   · 引擎按 `MagicDef+0x10` 的目标类型**自己解析**目标句柄 `g3`，落点只用于选 g3；
  //   · 落月弓属「读了 g3 就丢」的 11 条之一 —— 伤害走 `0x125` 打在 g3 上，
  //     `targetPoint` 在伤害路径上一次都没被读过。
  // ⇒ 玩家把落点放到空地，原作照样打中解析出来的敵將。这里改成钉这个语义，
  //   同时保留"命中就绝不能只飘 MISS"的那部分（见上一条）。
  const r = cast(w, 'A', 2, b.x - 20, b.y, 24);
  assert.equal(r.ok, true);
  // R187 改：R88 的兜底伤害原本在第 3 帧就结算，现在按原作（`ShootObjectCallback`
  // 撞到 g3 才 `CALL Hurt`，dis:3456）落到弹丸到场那一帧；而同一次兜底对小兵的波及
  // 仍留在原时机（`runtime.ts` 的 `applyCollateral()`）。原谓词"有 mark 就停"会停在
  // 小兵被波及的那一帧，此时 `spellDamageA` 还没记主将伤害，下面第 170 行会假失败。
  // 改成等到真的有主将伤害（或确实补了 miss）为止 —— 断言的语义没变。
  runUntil(w, 400, () => w.stats.spellDamageA > 0 || skillMarksOf(w).some((m) => m.miss));
  const marks = skillMarksOf(w);
  assert.equal(
    marks.some((m) => m.damage > 0 || m.kills > 0),
    true,
    `落月弓应打到引擎解析出的目标，实际 ${JSON.stringify(marks)}`,
  );
  assert.equal(marks.some((m) => m.miss), false, '真打到了就不该再补 miss 标记');
  assert.ok(w.stats.spellDamageA > 0, `重伤害应计入 spellDamageA，实际 ${w.stats.spellDamageA}`);
  void a;
});

test('R84 多帧技在会话结束前打死的兵要计入 spellKills（旧实现恒 0）', () => {
  const w = makeWorld({ aSoldiers: 20, bSoldiers: 20 });
  const a = genUnit(w, 'A');
  // 瞄准 B 方兵堆中心
  const foes = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
  assert.ok(foes.length > 0);
  const cx = foes.reduce((s, u) => s + u.x, 0) / foes.length;
  const cy = foes.reduce((s, u) => s + u.y, 0) / foes.length;
  a.x = cx - 1.4;
  a.y = cy;
  // 半月斬（`HalfMoon`，dis:2692-2693 读 g3 后存 loc2、再无回读）打的是**落点格**。
  // 不传落点时 `defaultAim()` 按 ACTIVE 掩码解析成「敵方主將 → 敌将所在格」，
  // 而本模型下每个单位独占一格（`0x43B467` 界内 + 空格才落地），主将格不再与兵堆重叠
  // ⇒ 自动落点只会伤到主将本人，测不到"多帧技打死的兵"。
  // 所以这条（只验 spellKills 记账口径）显式给兵堆中心落点；自动落点另有 R139/R88 两条钉着。
  // 这条只验「多帧技的击杀有没有记进 spellKills」这一记账口径，不该由掷骰决定成败：
  // 落点兵堆是散的，`applyHits` 对士兵要 `world.rng() < 0.15+atk*0.01` 才判死，默认 seed 7
  // 恰好全落空（20 个 seed 里 16 个有击杀，见 work/159_dbg_halfmoon_seeds.mjs）。
  // 极性和 binop 改对之后骰序整体位移，seed 7 从"恰好有"变"恰好没有"——这不是语义回归，
  // 所以把骰子固定成 0（必中必死），让断言只盯记账。
  w.rng = () => 0;
  const r = cast(w, 'A', 50, cx, cy, 24);
  assert.equal(r.ok, true);
  runUntil(w, 400, () => w.stats.spellKillsA > 0 || w.over);
  assert.equal(w.stats.spellKillsA > 0, true, `法术击杀该 >0（实际 ${w.stats.spellKillsA}，会话数 ${w.sessions.length}）`);
  const kills = skillMarksOf(w).filter((m) => m.kills > 0);
  assert.equal(kills.length > 0, true, '击杀该有对应标记');
  assert.equal(
    skillMarksOf(w).reduce((s, m) => s + m.kills, 0),
    w.stats.spellKillsA,
    '标记里的击杀数合计必须等于 spellKillsA',
  );
  // settle 的 spellKills 与 stats 同源，且是总击杀的子集
  const out = settle(w);
  assert.equal(out.spellKills, w.stats.spellKillsA);
  assert.ok(out.spellKills <= out.kills);
});

test('R84 视图：有标记时画 -N，并压掉 web 抢跑的 MISS', () => {
  const w = makeWorld();
  const a = genUnit(w, 'A');
  const tick = w.tick;
  w.skillMarks.push({ tick, side: 'A', x: a.x, y: a.y, kills: 0, damage: 38, healed: 0, summoned: 0 });
  const floaters: Floater[] = [];
  // 复刻 web doCast(): killed=0 → 飘 MISS
  pushFloater(floaters, a.x, a.y, 'MISS', '#888888');
  const camX = a.x;
  const texts = buildFrame(w, { floaters, camX, mode: 'fighting' })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(texts.includes('-38'), true, '内核标记要画出来');
  assert.equal(texts.includes('MISS'), false, 'web 的 MISS 要被压掉');

  // 没有标记、没有在解的技能时，web 的 MISS 照旧画（不改变原有行为）
  const w2 = makeWorld();
  const a2 = genUnit(w2, 'A');
  const f2: Floater[] = [];
  pushFloater(f2, a2.x, a2.y, 'MISS', '#888888');
  const t2 = buildFrame(w2, { floaters: f2, camX: a2.x, mode: 'fighting' })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(t2.includes('MISS'), true, '无标记时 MISS 照旧');
});

test('R84 有技能在解算时，web 的 MISS 一定是抢跑（压制）', () => {
  const w = makeWorld();
  const { b } = adjacent(w);
  const floaters: Floater[] = [];
  const r = cast(w, 'A', 50, b.x, b.y, 24);
  assert.equal(r.ok, true);
  pushFloater(floaters, b.x, b.y, 'MISS', '#888888');
  // 刚放完技、会话还没结束
  const texts = buildFrame(w, { floaters, camX: b.x, mode: 'fighting' })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(texts.includes('MISS'), false, '会话未结束时 MISS 会被压掉');
});

test('R84 提示栏文案：web 的「擊殺 0 名敵兵」要按真实战果改写', () => {
  const w = makeWorld();
  const a = genUnit(w, 'A');
  const tick = w.tick;
  w.skillMarks.push({ tick, side: 'A', x: a.x, y: a.y, kills: 0, damage: 38, healed: 0, summoned: 0 });
  const texts = buildFrame(w, {
    camX: a.x,
    mode: 'fighting',
    message: '神鬼亂舞：擊殺 0 名敵兵。',
  })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(
    texts.some((t) => t.includes('敵將 −38')),
    true,
    '有伤害标记时提示栏要说打掉多少体力',
  );
  assert.equal(texts.some((t) => t.includes('擊殺 0')), false, '不能再写「擊殺 0 名敵兵」');

  // 真没打中（只有 miss 标记）→ 文案原样（web 那句 0 击杀此时是实话）
  const w2 = makeWorld();
  const a2 = genUnit(w2, 'A');
  w2.skillMarks.push({ tick: w2.tick, side: 'A', x: a2.x, y: a2.y, kills: 0, damage: 0, healed: 0, summoned: 0, miss: true });
  const t2 = buildFrame(w2, { camX: a2.x, mode: 'fighting', message: '落月弓：擊殺 0 名敵兵。' })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(t2.some((t) => t.includes('擊殺 0')), true, '真落空时不改写');
});

test('问题 3 裁决：mpCapOf 与原作公式一致（神鬼亂舞 MP47 是门槛）', () => {
  // docs/04b:231-234（0x40A098）: mp = BaseMP + level*2*t/100，t = STR>INT ? (STR+INT)/2 : INT
  const cases = [
    { baseMp: 44, str: 56, int: 95, level: 1, want: 45 }, // 張角 Lv1
    { baseMp: 44, str: 56, int: 95, level: 2, want: 47 }, // 張角 Lv2
    { baseMp: 39, str: 69, int: 63, level: 2, want: 41 }, // 張勳 Lv2
    { baseMp: 43, str: 99, int: 85, level: 2, want: 46 }, // 關羽 Lv2
    { baseMp: 60, str: 40, int: 40, level: 1, want: 60 }, // 下限：不低于 BaseMP
  ];
  for (const c of cases) {
    const t = c.str > c.int ? Math.trunc((c.str + c.int) / 2) : c.int;
    const want = Math.max(c.baseMp, Math.min(0x7fff, c.baseMp + Math.trunc((c.level * 2 * t) / 100)));
    assert.equal(mpCapOf(c.baseMp, c.str, c.int, c.level), want, JSON.stringify(c));
    assert.equal(mpCapOf(c.baseMp, c.str, c.int, c.level), c.want, JSON.stringify(c));
  }

  // 神鬼亂舞（seq104）MP47：張角 Lv1 差 2 点放不出，Lv2 恰好够
  const w1 = makeWorld({ aLevel: 1, bSoldiers: 1 });
  assert.equal(w1.sides.A.general.mpMax, 45);
  const r1 = cast(w1, 'A', 104, genUnit(w1, 'B').x, genUnit(w1, 'B').y, 24);
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, 'mp', 'Lv1 的拒因是法力不足，不是气力');

  const w2 = makeWorld({ aLevel: 2, bSoldiers: 1 });
  assert.equal(w2.sides.A.general.mpMax, 47);
  const r2 = cast(w2, 'A', 104, genUnit(w2, 'B').x, genUnit(w2, 'B').y, 24);
  assert.equal(r2.ok, true, 'Lv2 的張角刚好够神鬼亂舞，不应再恒不可放');
});

test('R84 settle 的 kills 含法术击杀，spellKills 是同侧法术击杀子集', () => {
  const w = makeWorld({ aSoldiers: 6, bSoldiers: 6, aLevel: 2, bLevel: 2 });
  w.aiSides = { A: false, B: true }; // 让 B 侧 AI 放技，制造法术击杀的可能
  // R159：兵尽不结束，最坏情况要跑到 11880 tick 的硬时限平手；
  // 这里只关心 kills/spellKills 的统计口径，跑满时限保证一定 over。
  for (let i = 0; i < BATTLE_TICK_LIMIT + 2 && !w.over; i++) step(w);
  assert.equal(w.over, true, '到硬时限前必须结束（主将阵亡或到点平手）');
  const out = settle(w);
  assert.equal(out.kills, out.killsInf + out.killsCav, '总击杀 = 步/骑 分类击杀之和');
  assert.equal(out.spellKills, w.stats.spellKillsA);
  assert.ok(out.spellKills <= out.kills, 'spellKills 是总击杀的子集');
});

test('问题 3 附带：技位应当按将取（上限 8 格，按该将实际习得数）', () => {
  // 張角 SKILL = 1,49 / 7,56 / 11,66 / 18,71 / 23,84 / 30,95 / 34,101 / 41,106 —— 没有 104
  assert.deepEqual(learnedSkillSeqs(data, '張角', 1), [49]);
  assert.deepEqual(learnedSkillSeqs(data, '張角', 7), [49, 56]);
  assert.equal(learnedSkillSeqs(data, '張角', 41).includes(104), false, '張角永远学不到神鬼亂舞');
  // 張飛 Lv39 学 104，且到 Lv39 恰好 8 条全学会 —— 8 格上限下不截断
  const zf = learnedSkillSeqs(data, '張飛', 39);
  assert.equal(zf.length, 8, '張飛 Lv39 实学 8 条，不能退回旧的写死 4 格');
  assert.deepEqual(zf, [46, 63, 69, 74, 83, 94, 98, 104]);
  assert.equal(zf.includes(104), true, '張飛 Lv39 才有神鬼亂舞');
  // 未知武将 / 空等级回落到写死的默认 4 格（不改变既有行为）
  assert.deepEqual(learnedSkillSeqs(data, '不存在的人', 3), DEFAULT_SKILL_SEQ.slice());
  assert.deepEqual(learnedSkillSeqs(data, undefined, 3), DEFAULT_SKILL_SEQ.slice());
});
