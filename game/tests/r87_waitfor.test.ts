/**
 * R87 技能等待语义（WAITFOR / 旋龍 554 恒未命中）。
 *
 * 缺陷：`game/src/core/smartscript/runtime.ts` 的 `waitFor()` 原来只往 `calls` 里记一笔就返回，
 * 也就是 **WAITFOR 等于空语句**。旋龍（`data/magics.json` SEQUENCE=51 / SCRIPT=554）的主循环是
 *
 *   L12DEC: 0x12(loc9) JNZ 收尾            ; dummy 还活着就继续
 *           0x19(loc9, loc12, speed)       ; 让 dummy 朝目标飞
 *           CALLS WaitTarget(loc9, x, y)   ; 目标远时 WaitTarget 里的条件立刻返回
 *           WAITFOR "WaitTarget"           ; ← 原作在这里挂起，等下一帧再轮询
 *           JMP L12DEC
 *
 * WaitTarget 返回得快、WAITFOR 又不挂起 ⇒ 父循环一帧都不让出，虚拟时钟不前进，
 * dummy 永不过期 ⇒ 20 万条指令预算在 pc=0x130d8 被打光，`CastResult` 变成 `{hit:false,hits:0,damage:0}`，
 * web 侧（`game/web/main.js:1131-1137`）据此飘「未命中」。
 *
 * 这里钉死：
 *   1. 真 MAGIC.SO 字节码跑旋龍，三个目标点都不再中断、会话正常收尾；
 *   2. 旋龍打敌将/空地都真的产生战果（伤害或击杀标记），而不是只有 MISS；
 *   3. 0x11/0x129 的「阵营参数」修好后 dummy 落在主将身边，不再堆在 (0,0)；
 *   4. WAITFOR 真的**挂起**：cast 返回时会话未结束，必须逐帧推进才收尾（把 WAITFOR 改回
 *      "直接跳过"，第 1/4/5/6 条都会红 —— 见 `project/117_技能等待语义.md` 的变异验证）；
 *   5. 同步模型（`runSkill`）也不截断。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/r87_waitfor.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  advanceSessions,
  cast,
  createWorld,
  QI_MAX,
  skillMarksOf,
  step,
} from '../src/core/battle.ts';
import type { CastResult, SkillMark, World } from '../src/core/battle.ts';
import type { SkillSession } from '../src/core/smartscript/runtime.ts';
import { runSkill } from '../src/core/smartscript/runtime.ts';
import { buildFrame, pushFloater } from '../src/view/battleView.ts';
import type { Floater } from '../src/view/battleView.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 旋龍：攻击型多帧技，主循环靠 `WAITFOR "WaitTarget"` 慢下来。 */
const XUANLONG = 51;
const XUANLONG_SCRIPT = 554;
/** 脚本自己的指令预算（`vm.ts` 的 `budget`，超了就是「疑似死循环」）。 */
const SCRIPT_BUDGET = 200000;

/** 建一个能放技的局：A 主将摆在 (24, 6.5)，双方各 20 兵（有目标可选），AI 全关。 */
function makeWorld(): World {
  const world = createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
    aiSides: { A: false, B: false },
  });
  const a = world.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(a, 'A 主将缺失');
  a.x = 24;
  a.y = 6.5;
  a.prevX = a.x;
  a.prevY = a.y;
  world.sides.A.general.qi = QI_MAX; // 只关心脚本语义，别被技力卡住
  return world;
}

interface CastProbe {
  world: World;
  result: CastResult;
  session: SkillSession | undefined;
  warns: string[];
}

/** 放一次旋龍；报错/截断都会走 `console.warn`，这里收起来断言。 */
function castXuanlong(tx: number, ty: number): CastProbe {
  const world = makeWorld();
  const warns: string[] = [];
  const oldWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    warns.push(a.map(String).join(' '));
  };
  try {
    const result = cast(world, 'A', XUANLONG, tx, ty);
    return { world, result, session: world.sessions[0], warns };
  } finally {
    console.warn = oldWarn;
  }
}

function interruptWarns(warns: readonly string[]): string[] {
  return warns.filter((w) => w.includes('中断') || w.includes('死循环') || w.includes('截断'));
}

/**
 * 推到会话结束（上限 800 tick），返回剩余会话数。
 *
 * R192：上限从 400 提到 800（×2）。会话收尾由 core 的**死等保护**兜底，窗口是
 * `max(fx.life + SKILL_MARK_TTL, EFFECT_WINDOW_MIN)` = `max(264+90, 480)` = 480 tick
 * （30 Hz 时代是 `max(132+45,240)` = 240）。墙钟仍是 8 秒，只是 tick 数翻倍。
 */
function runToEnd(p: CastProbe, limit = 800): number {
  let ticks = 0;
  while (p.world.sessions.length > 0 && ticks++ < limit) step(p.world);
  return p.world.sessions.length;
}

function marksOf(world: World): readonly SkillMark[] {
  return skillMarksOf(world);
}

const TARGETS: readonly { label: string; x: number; y: number }[] = [
  { label: '施法者身边 (20,6.5)', x: 20, y: 6.5 },
  { label: '敌将 (0,0) 之外的空地 (0,0)', x: 0, y: 0 },
  { label: '自身 (24,6.5)', x: 24, y: 6.5 },
];

test('R87 旋龍 554 在三个目标点都不再「中断」（真 MAGIC.SO 字节码）', () => {
  for (const t of TARGETS) {
    const p = castXuanlong(t.x, t.y);
    assert.equal(p.result.ok, true, `${t.label} 该放得出来：${JSON.stringify(p.result)}`);
    const bad = interruptWarns(p.warns);
    assert.deepEqual(bad, [], `${t.label} 不该有中断/死循环/截断：${bad.join(' | ')}`);
    const left = runToEnd(p);
    assert.equal(left, 0, `${t.label} 会话该在 800 tick 内收尾`);
    assert.equal(p.session?.done, true, `${t.label} 会话该 done`);
    assert.equal(p.session?.ok, true, `${t.label} 会话该 ok，原因：${p.session?.reason}`);
    assert.equal(p.session?.reason, '', `${t.label} 不该有失败原因`);
    // 真跑过：不是空会话
    assert.ok((p.session?.frames.length ?? 0) > 1, `${t.label} 该真的跑过多帧`);
  }
});

test('R87 旋龍打敌将：产生伤害/击杀标记，不再只有 MISS', () => {
  const w = makeWorld();
  const foe = w.units.find((u) => u.isGeneral && u.side === 'B');
  assert.ok(foe, 'B 主将缺失');
  const hp0 = w.sides.B.general.hp;
  const warns: string[] = [];
  const oldWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    warns.push(a.map(String).join(' '));
  };
  let p: CastProbe;
  try {
    const result = cast(w, 'A', XUANLONG, foe.x, foe.y);
    p = { world: w, result, session: w.sessions[0], warns };
  } finally {
    console.warn = oldWarn;
  }
  assert.deepEqual(interruptWarns(warns), []);
  runToEnd(p);
  const marks = marksOf(w);
  const damage = marks.reduce((s, m) => s + m.damage, 0);
  const kills = marks.reduce((s, m) => s + m.kills, 0);
  assert.ok(damage > 0 || kills > 0, `该有真实战果，实际 marks=${JSON.stringify(marks)}`);
  assert.equal(marks.some((m) => m.miss), false, '真打中了就不该补 MISS 标记');
  assert.ok(w.sides.B.general.hp < hp0 || kills > 0, '敌将该掉血或掉兵');
  assert.equal(w.stats.spellDamageA, damage, '标记合计必须等于 stats.spellDamageA');
});

test('R87 旋龍打空地也有效果（不是一等 96 帧然后 MISS）', () => {
  const p = castXuanlong(0, 0);
  assert.deepEqual(interruptWarns(p.warns), []);
  runToEnd(p);
  const marks = marksOf(p.world);
  const total = marks.reduce((s, m) => s + m.damage + m.kills, 0);
  assert.ok(total > 0, `空地也该扫到人，实际 marks=${JSON.stringify(marks)}`);
  assert.equal(marks.some((m) => m.miss), false, '不该补 MISS 标记');
});

test('R87 dummy 生成在主将位置，不是 (0,0)（0x129/0x10D 阵营参数修好）', () => {
  const p = castXuanlong(20, 6.5);
  const sess = p.session;
  assert.ok(sess, '该有会话');
  runToEnd(p);
  const res = sess.summary();
  assert.ok(res.objects.length > 0, `脚本该生成物件，实际 ${res.objects.length}`);
  // 物件坐标是格（px/96）；(0,0) 就是"解析不到单位句柄"的症状
  const offOrigin = res.objects.filter((o) => Math.abs(o.x) > 0.001 || Math.abs(o.y) > 0.001);
  assert.equal(offOrigin.length, res.objects.length, `物件不该堆在原点：${JSON.stringify(res.objects.slice(0, 6))}`);
  const a = p.world.units.find((u) => u.isGeneral && u.side === 'A');
  const b = p.world.units.find((u) => u.isGeneral && u.side === 'B');
  assert.ok(a && b);
  const near = res.objects.filter(
    (o) => Math.hypot(o.x - a.x, o.y - a.y) < 8 || Math.hypot(o.x - b.x, o.y - b.y) < 8,
  );
  assert.ok(near.length > 0, `物件该落在主将附近，实际 ${JSON.stringify(res.objects.slice(0, 6))}`);
});

test('R87 WAITFOR 真的挂起：cast 返回时会话未结束，必须逐帧推进才收尾', () => {
  const p = castXuanlong(20, 6.5);
  const sess = p.session;
  assert.ok(sess, '该有会话');
  // cast() 只跑第 0 帧
  assert.equal(sess.done, false, 'cast 返回时会话不该结束（WAITFOR 把它挂住了）');
  assert.equal(sess.frame, 1, `cast 只该跑完第 0 帧，实际 ${sess.frame}`);
  assert.ok(sess.pendingFrames > 0, `第 0 帧末尾该停在 WAIT/WAITFOR 上，实际 pendingFrames=${sess.pendingFrames}`);
  assert.equal(p.world.sessions.length, 1, '会话该挂进 world.sessions 由 tickSkills 推进');
  // 再推 2 tick：仍然没结束（不是"跳过等待直接跑完"），帧数也不该突然暴涨
  advanceSessions(p.world);
  advanceSessions(p.world);
  assert.equal(sess.done, false, `推 2 tick 后仍未结束，实际 done=${sess.done} frame=${sess.frame}`);
  assert.ok(sess.frame <= 2, `挂起期间不该跑脚本，实际 frame=${sess.frame}`);
  // 一直推到结束：帧数该是多帧级的（主循环至少让出 ~96 帧等 dummy 过期）
  runToEnd(p);
  assert.equal(sess.done, true);
  assert.ok(sess.frames.length > 40, `多帧技该跑几十帧，实际 ${sess.frames.length}`);
  assert.equal(sess.reason, '', '收尾原因该为空（正常返回，不是截断）');
});

test('R87 WAITFOR 不是"整个脚本一次跑完"：每帧指令数有界，总量远低于 20 万预算', () => {
  const p = castXuanlong(0, 0);
  const sess = p.session;
  assert.ok(sess);
  // 跳过 WAITFOR 的旧实现会在第 0 帧把 20 万条预算打光（pc=0x130d8 抛「疑似死循环」）
  const frame0 = sess.frames[0];
  assert.ok(frame0, '该有第 0 帧统计');
  assert.ok(
    frame0.instructions < SCRIPT_BUDGET / 4,
    `第 0 帧指令数该远低于预算，实际 ${frame0.instructions}`,
  );
  runToEnd(p);
  const total = sess.frames[sess.frames.length - 1]?.instructions ?? 0;
  assert.ok(total < SCRIPT_BUDGET, `整发指令数该低于预算，实际 ${total}`);
  assert.equal(sess.ok, true, `脚本该正常结束，原因：${sess.reason}`);
});

test('R87 同步模型（runSkill）跑旋龍也不截断', () => {
  const w = makeWorld();
  const res = runSkill(w, 'A', XUANLONG_SCRIPT, 20, 6.5);
  assert.equal(res.ok, true, `同步模型该正常结束，实际 log=${res.log.slice(-3).join(' | ')}`);
  assert.ok(res.stats.instructions > 0, '该真的执行了字节码');
  assert.ok(res.stats.instructions < SCRIPT_BUDGET, `指令数该低于预算，实际 ${res.stats.instructions}`);
  assert.ok(res.objects.length > 0, `该生成物件，实际 ${res.objects.length}`);
  const offOrigin = res.objects.filter((o) => Math.abs(o.x) > 0.001 || Math.abs(o.y) > 0.001);
  assert.equal(offOrigin.length, res.objects.length, `物件不该在原点：${JSON.stringify(res.objects.slice(0, 6))}`);
});

test('R87 web 那句「未命中」不再飘出来：cast 当帧会话在解算，MISS 被压掉', () => {
  // web 的 `doCast()` 用 `killed > 0 ? ... : 'MISS'` 判命中（`game/web/main.js:1131-1137`，冻结文件），
  // 多帧技第 0 帧必然 killed=0。修复后内核逐帧对账记 `skillMarks`，视图层据此压掉抢跑的 MISS
  // （`battleView.ts:1142-1149`）。这里用旋龍真字节码钉住这条链路。
  const w = makeWorld();
  const foe = w.units.find((u) => u.isGeneral && u.side === 'B');
  assert.ok(foe);
  const r = cast(w, 'A', XUANLONG, foe.x, foe.y);
  assert.equal(r.ok, true);
  const floaters: Floater[] = [];
  pushFloater(floaters, foe.x, foe.y, 'MISS', '#888888'); // 复刻 web 的飘字
  const texts = buildFrame(w, { floaters, camX: foe.x, mode: 'fighting' })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(texts.includes('MISS'), false, '会话未结束时 web 的 MISS 要被压掉');
  // 推到战果落地（内核在 tick 47 左右记第一条 damage 标记）：该画的是真实战果，而不是 MISS
  for (let i = 0; i < 160 && marksOf(w).length === 0 && !w.over; i++) step(w);
  assert.ok(marksOf(w).length > 0, '该记下真实战果标记');
  const later = buildFrame(w, { floaters: [], camX: foe.x, mode: 'fighting' })
    .filter((c) => c.kind === 'text')
    .map((c) => String(c.text));
  assert.equal(later.includes('MISS'), false, '真打中了就不该有 MISS 飘字');
  assert.equal(
    later.some((t) => /^-\d/.test(t)),
    true,
    `该飘真实战果，实际文本：${later.filter((t) => t.startsWith('-')).join(' ')}`,
  );
});

test('R87 回归：旋龍 打施法者身边仍然有战果（原本能用的路径行为不变）', () => {
  const p = castXuanlong(20, 6.5);
  assert.deepEqual(interruptWarns(p.warns), []);
  runToEnd(p);
  const marks = marksOf(p.world);
  const total = marks.reduce((s, m) => s + m.damage + m.kills, 0);
  assert.ok(total > 0, `该有战果，实际 ${JSON.stringify(marks)}`);
  assert.ok(p.world.stats.spellDamageA > 0 || p.world.stats.spellKillsA > 0, 'stats 该记上法术战果');
});
