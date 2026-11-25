/**
 * R194 动效验收：出手才挥砍 + 受击反馈 + 两侧阵亡表现。跑法：`node --test tests/anim_view.test.ts`
 *
 * 为什么要这组测试（用户实机反馈「攻击只是站着掉血」「兵挤成一团」）：
 * 改之前「攻击帧」由 `u.cd` 驱动，而 `cd` 在**移动/待機分支也会被重置**（`battle.ts:2534`），
 * 于是每个兵每个行动周期都有 24/40 tick 在挥空刀 —— 行军、站桩、待機都在砍空气，
 * 真正那一刀反而没有任何额外表现。改成读 `u.lastAttackTick`（真出手那一 tick 才写）之后，
 * 「画出来的攻击帧数」必须**逐 tick 等于**「出手年龄在窗内的单位数」，
 * 这条不变量就是本文件第 3 组断言的核心，也是这次改动唯一能自动盯住的回归面。
 *
 * 判据不靠「就近归属」（单位挤在一起时会串位），而是拿 world 的字段算期望值再和
 * `buildFrame()` 真正吐出的 sprite 指令对账。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadData } from '../src/data.ts';
import { createWorld, step, camera, type Unit, type World } from '../src/core/battle.ts';
import { FIELD_BOTTOM, FIELD_TOP } from '../src/core/field.ts';
import { ATTACK_TICKS, DEATH_TICKS, HIT_FLASH_TICKS, actionAtlas, attackAgeOf, deathAgeOf, hitAgeOf, usesDeathFrames } from '../src/view/animSelect.ts';
import { buildFrame, type DrawCmd } from '../src/view/battleView.ts';
import { projectUnit } from '../src/view/projection.ts';
import type { UnitFrameRect, UnitsAtlas } from '../src/view/unitFrames.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const IMG = { tag: 'units' } as unknown as CanvasImageSource;
const IMG_ENEMY = { tag: 'units-enemy' } as unknown as CanvasImageSource;
const ACTION_IMG = { tag: 'actions' } as unknown as CanvasImageSource;

interface RawUnits {
  pages: { sprites: { name: string; x: number; y: number; w: number; h: number }[] }[];
  groups: Record<string, { attack?: string[]; attackEnemy?: string[] }>;
}

function readUnitsJson(): RawUnits {
  return JSON.parse(readFileSync(new URL('../web/anim/units.json', import.meta.url), 'utf8')) as RawUnits;
}

function realAtlas(): UnitsAtlas {
  const j = readUnitsJson();
  const frames: Record<string, UnitFrameRect> = {};
  for (const sp of j.pages[0]!.sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
  return { img: IMG, imgEnemy: IMG_ENEMY, frames, groups: j.groups as unknown as UnitsAtlas['groups'] };
}

/** units.json 里所有「攻击帧」矩形的 key，用来从 sprite 指令反查「这一帧是不是挥砍」。 */
function attackRectKeys(): Set<string> {
  const j = readUnitsJson();
  const frames: Record<string, UnitFrameRect> = {};
  for (const sp of j.pages[0]!.sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
  const out = new Set<string>();
  for (const g of Object.values(j.groups)) {
    for (const name of [...(g.attack ?? []), ...(g.attackEnemy ?? [])]) {
      const f = frames[name];
      if (f) out.add(`${f.x},${f.y},${f.w},${f.h}`);
    }
  }
  return out;
}

/** actions.json 的三个动作组，结构必须与 animSelect.collectFrames() 一致（不是 name→rect）。 */
function installActionAtlas(): { restore(): void } {
  const saved = { img: actionAtlas.img, frames: actionAtlas.frames };
  const meta = JSON.parse(readFileSync(new URL('../web/anim/actions.json', import.meta.url), 'utf8')) as {
    pages: { sprites: { name: string; x: number; y: number; w: number; h: number }[] }[];
  };
  const keys = ['attack_back', 'hit_back', 'death_back'] as const;
  const grouped: Record<string, UnitFrameRect[]> = {};
  for (const page of meta.pages) {
    for (const sp of page.sprites) {
      const key = keys.find((k) => sp.name.startsWith(`${k}_`));
      if (!key) continue;
      (grouped[key] ??= []).push({ x: sp.x, y: sp.y, w: sp.w, h: sp.h });
    }
  }
  for (const key of keys) grouped[key]?.sort((a, b) => a.y - b.y || a.x - b.x);
  actionAtlas.img = ACTION_IMG as unknown as HTMLImageElement;
  actionAtlas.frames = grouped;
  return {
    restore() {
      actionAtlas.img = saved.img;
      actionAtlas.frames = saved.frames;
    },
  };
}

const spriteCmds = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'sprite');
const rectKey = (c: DrawCmd) => (c.kind === 'sprite' ? `${c.sx},${c.sy},${c.sw},${c.sh}` : '');
/** 尸体窗口：`drawSoldier` 把 animTick 冻结在阵亡那一 tick，所以攻击窗口也跟着冻结。 */
const animTickOf = (u: Unit, tick: number): number => {
  const dying = deathAgeOf(u, { tick } as World);
  return dying === null ? tick : tick - dying;
};
const visible = (u: Unit, camX: number): boolean => {
  const p = projectUnit(u.x, u.y, camX);
  return !(p.sy < FIELD_TOP - 80 || p.sy > FIELD_BOTTOM + 80);
};

interface Sim {
  world: World;
  samples: number;
  attackDrawn: number;
  attackExpected: number;
  attackMismatch: { tick: number; drawn: number; expected: number }[];
  flashDrawn: number;
  flashExpected: number;
  toppled: number;
  toppledExpected: number;
  corpseMismatch: { tick: number; drawn: number; expected: number }[];
  deathFrameSprites: number;
  deathsA: number;
  deathsB: number;
}

/** 只跑一次接战（30v30 / 900 tick，前 600 tick 还在行军、接不上火），四组断言共用同一份采样，避免重复跑仿真。 */
let simCache: Sim | null = null;
function sim(): Sim {
  if (simCache) return simCache;
  const units = realAtlas();
  const atkKeys = attackRectKeys();
  const world = engage(createWorld({
    data,
    seed: 7,
    a: { troop: 2, soldiers: 30, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { troop: 10, soldiers: 30, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  }));
  const out: Sim = {
    world,
    samples: 0,
    attackDrawn: 0,
    attackExpected: 0,
    attackMismatch: [],
    flashDrawn: 0,
    flashExpected: 0,
    toppled: 0,
    toppledExpected: 0,
    corpseMismatch: [],
    deathFrameSprites: 0,
    deathsA: 0,
    deathsB: 0,
  };
  const wasAlive = new Map(world.units.map((u) => [u, u.alive]));
  for (let t = 0; t < 900; t += 1) {
    step(world);
    out.samples += 1;
    for (const u of world.units) {
      if (wasAlive.get(u) && !u.alive) { if (u.side === 'A') out.deathsA += 1; else out.deathsB += 1; }
      wasAlive.set(u, u.alive);
    }
    const camX = camera(world);
    const cmds = buildFrame(world, { mode: 'fighting', units, skills: [], camX });
    let drawnAtk = 0;
    let drawnFlash = 0;
    let drawnTopple = 0;
    for (const c of spriteCmds(cmds)) {
      // 白闪是「同一帧再叠一层」，不是额外一个单位，对账时剔除
      if (c.comp === 'lighter') { drawnFlash += 1; continue; }
      if (atkKeys.has(rectKey(c))) drawnAtk += 1;
      if (c.rot) drawnTopple += 1;
      if ((actionAtlas.frames.death_back ?? []).some((f) => `${f.x},${f.y},${f.w},${f.h}` === rectKey(c))) out.deathFrameSprites += 1;
    }
    let expAtk = 0;
    let expFlash = 0;
    let expTopple = 0;
    for (const u of world.units) {
      if (!visible(u, camX)) continue;
      // 主将的挥砍由 drawGeneral 走 generalAtlas（另一套素材），本文件只对账士兵图集
      if (u.isGeneral === true) continue;
      // 窗口必须显式传 24：`pushSpriteFrames` 用 24 铺 10 帧，默认值是 ATTACK_TICKS(20)
      if (attackAgeOf(u, animTickOf(u, world.tick), 24) !== null) expAtk += 1;
      const hit = hitAgeOf(u, world);
      if (hit !== null && hit <= 1) expFlash += 1;
      // 这一局两侧都不是朴刀（troop 2 / 10），所以每个尸体都应该被程序化放倒
      if (!usesDeathFrames(u, world) && deathAgeOf(u, world) !== null) expTopple += 1;
    }
    out.attackDrawn += drawnAtk;
    out.attackExpected += expAtk;
    out.flashDrawn += drawnFlash;
    out.flashExpected += expFlash;
    out.toppled += drawnTopple;
    out.toppledExpected += expTopple;
    if (drawnAtk !== expAtk && out.attackMismatch.length < 6) out.attackMismatch.push({ tick: world.tick, drawn: drawnAtk, expected: expAtk });
    if (drawnTopple !== expTopple && out.corpseMismatch.length < 6) out.corpseMismatch.push({ tick: world.tick, drawn: drawnTopple, expected: expTopple });
  }
  simCache = out;
  return out;
}

// ---------------------------------------------------------------------------
// 1) 动作年龄的语义（view 层唯一入口，纯函数）
// ---------------------------------------------------------------------------

test('attackAgeOf：只认「真出手」写的 lastAttackTick，窗口内返回年龄', () => {
  const u = { side: 'A' } as Unit;
  assert.equal(attackAgeOf(u, 10), null, '没出手过 → 不播攻击帧');
  (u as unknown as { lastAttackTick: number }).lastAttackTick = 100;
  assert.equal(attackAgeOf(u, 99), null, '出手之前不播');
  assert.equal(attackAgeOf(u, 100), 0, '出手那一 tick 从第 0 帧起播');
  assert.equal(attackAgeOf(u, 119), 19, '默认窗口 = ATTACK_TICKS(20) 的最后一 tick');
  assert.equal(attackAgeOf(u, 120), null, '默认窗口外不播');
  // 士兵用 24 tick 把 10 帧铺满（`battleView.pushSpriteFrames` 传的就是 24）
  assert.equal(attackAgeOf(u, 123, 24), 23, '显式 24 tick 窗口的最后一 tick');
  assert.equal(attackAgeOf(u, 124, 24), null, '超出显式窗口');
});

test('deathAgeOf / hitAgeOf：两侧通用、主将不走士兵死亡帧', () => {
  const w = { tick: 200 } as World;
  const u = { side: 'B', alive: false } as Unit;
  assert.equal(deathAgeOf(u, w), null, 'lastHitTick 缺失 → 没有死亡窗口');
  (u as unknown as { lastHitTick: number }).lastHitTick = 190;
  assert.equal(deathAgeOf(u, w), 10, '敵兵也有死亡窗口（改前只有 A 侧）');
  assert.ok(deathAgeOf(u, w)! < DEATH_TICKS);
  (u as unknown as { alive: boolean }).alive = true;
  assert.equal(deathAgeOf(u, w), null, '活人不走死亡帧');
  (u as unknown as { lastHitTick: number }).lastHitTick = 195;
  assert.equal(hitAgeOf(u, w), 5, '受击窗口读同一字段');
  (u as unknown as { lastHitTick: number }).lastHitTick = 190;
  assert.equal(hitAgeOf(u, w), null, `离开受击窗口（${HIT_FLASH_TICKS} tick）`);
  const general = { side: 'A', alive: false, isGeneral: true, lastHitTick: 190 } as unknown as Unit;
  assert.equal(deathAgeOf(general, w), null, '主将仍走 drawGeneral，不套士兵尸体');
});

// ---------------------------------------------------------------------------
// 2) 回归：全员待機时不许再「空挥」
// ---------------------------------------------------------------------------

test('待機 240 tick：一个攻击帧都不许画（改前 235 个，全是从没出过手的兵）', () => {
  const units = realAtlas();
  const atkKeys = attackRectKeys();
  const world = createWorld({
    data,
    seed: 7,
    a: { troop: 2, soldiers: 30 },
    b: { troop: 10, soldiers: 30 },
    aiSides: { A: false, B: false },
  });
  let drawn = 0;
  for (let t = 0; t < 240; t += 1) {
    step(world);
    const camX = camera(world);
    for (const c of spriteCmds(buildFrame(world, { mode: 'fighting', units, skills: [], camX }))) {
      if (c.comp === 'lighter') continue;
      if (atkKeys.has(rectKey(c))) drawn += 1;
    }
  }
  assert.equal(world.stats.attacksA + world.stats.attacksB, 0, '这一局压根没接战');
  assert.equal(drawn, 0, '没出手就不该有挥砍帧（旧实现每个兵 60% 时间在挥空刀）');
});

// ---------------------------------------------------------------------------
// 3) 核心不变量：画出来的攻击帧数 == 出手年龄在窗内的单位数
// ---------------------------------------------------------------------------

test('接战：逐 tick 攻击帧数 == 出手窗口内的单位数（画多/画少都算回归）', () => {
  const s = sim();
  assert.ok(s.world.stats.attacksA + s.world.stats.attacksB > 10, '这一局应该真打起来了');
  assert.deepEqual(s.attackMismatch, [], '攻击帧必须与真实出手对齐');
  assert.ok(s.attackDrawn > 0, '接战之后必须看得到挥砍帧');
  assert.ok(s.attackDrawn === s.attackExpected, `总账：画了 ${s.attackDrawn}，应为 ${s.attackExpected}`);
});

test('接战：受击反馈（白闪/后仰）与命中次数对得上', () => {
  const s = sim();
  assert.ok(s.flashDrawn > 0, '命中之后必须有可见反馈');
  assert.equal(s.flashDrawn, s.flashExpected, '每 tick 的白闪层数 = 受击年龄 ≤1 的单位数');
});

test('阵亡：两侧都留尸体（改前敵兵原地消失、我方只有朴刀倒地帧）', () => {
  const s = sim();
  assert.ok(s.deathsA > 0, `A 侧这一局该有阵亡（实际 ${s.deathsA}）`);
  assert.ok(s.deathsB > 0, `B 侧这一局该有阵亡（实际 ${s.deathsB}）`);
  assert.deepEqual(s.corpseMismatch, [], '每个可见尸体都该被放倒一次，且只放倒一次');
  assert.equal(s.toppled, s.toppledExpected, `总账：放倒 ${s.toppled}，应为 ${s.toppledExpected}`);
  assert.ok(s.deathFrameSprites === 0, '大刀/黄巾没有自带倒地帧，不该画出朴刀的');
});

// ---------------------------------------------------------------------------
// 4) 素材对不上就别硬套（骑兵不许摆朴刀兵的倒地姿势）
// ---------------------------------------------------------------------------

test('死亡帧只给对得上的兵种用：朴刀用 death_back，大刀走程序化倒地', () => {
  const restore = installActionAtlas();
  try {
    const units = realAtlas();
    const world = engage(createWorld({
      data,
      seed: 7,
      a: { troop: 0, soldiers: 20, general: { name: '張角', str: 56, int: 95, level: 45 } },
      b: { troop: 0, soldiers: 20 },
      aiSides: { A: false, B: false },
    }));
    // 先跑到镜头里有兵，再手动打死一个 A 兵
    for (let t = 0; t < 200; t += 1) step(world);
    const camX = camera(world);
    const victim = world.units.find((u) => u.side === 'A' && u.isGeneral !== true && visible(u, camX));
    assert.ok(victim, '镜头里应该有 A 兵');
    assert.equal(usesDeathFrames(victim!, world), true, '兵种 0（朴刀）有本人造型的倒地帧');
    victim!.alive = false;
    victim!.lastHitTick = world.tick;
    const p = projectUnit(victim!.x, victim!.y, camX);
    // 容差要给白闪留余量：pushedHitFlash 会把整个单位再抬 3px（含复制帧）
    const near = spriteCmds(buildFrame(world, { mode: 'fighting', units, skills: [], camX }))
      .filter((c) => Math.abs(c.x - p.sx) < 4 && Math.abs(c.y - (p.sy + 26 * p.scale)) < 10);
    assert.ok(near.length > 0, '尸体必须画出来');
    assert.ok(near.every((c) => !c.rot), '朴刀兵有自带倒地帧，不该同时被程序化放倒');
  } finally {
    restore.restore();
  }
});

// ---------------------------------------------------------------------------
// 5) 视觉分离：抖动幅度、滑行对穿
// ---------------------------------------------------------------------------

test('抖动幅度：落格偏移不超过 ±12px 纵深 / ±9px 车道（原作 ±24/±18，R194 砍半）', () => {
  const world = engage(createWorld({
    data,
    seed: 7,
    a: { troop: 2, soldiers: 30, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { troop: 10, soldiers: 30, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  }));
  let maxX = 0;
  let maxY = 0;
  let sawJitter = false;
  for (let t = 0; t < 600; t += 1) {
    step(world);
    for (const u of world.units) {
      // 滑行途中是两格之间的插值，量了没意义；只看已经 settle 到格子上的
      if (u.slide != null) continue;
      const jx = Math.abs(u.x - Math.round(u.x)) * 96;
      const jy = Math.abs(u.y - Math.round(u.y)) * 72;
      maxX = Math.max(maxX, jx);
      maxY = Math.max(maxY, jy);
      if (jx > 0.5 || jy > 0.5) sawJitter = true;
    }
  }
  assert.ok(sawJitter, '抖动应该还在（不是被删掉，只是幅度变小）');
  assert.ok(maxX <= 12, `纵深偏移 ${maxX.toFixed(1)}px 超过 ±12px 上限`);
  assert.ok(maxY <= 9, `车道偏移 ${maxY.toFixed(1)}px 超过 ±9px 上限`);
});

test('滑行对穿：任意两个 sprite 中心距 ≥ 8px（改前两个骑兵能重合到 0px）', () => {
  const units = realAtlas();
  const world = engage(createWorld({
    data,
    seed: 7,
    a: { troop: 2, soldiers: 40, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { troop: 10, soldiers: 40, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  }));
  let min = Infinity;
  let worstTick = -1;
  for (let t = 0; t < 900; t += 1) {
    step(world);
    const camX = camera(world);
    const sp = spriteCmds(buildFrame(world, { mode: 'fighting', units, skills: [], camX }))
      .filter((c) => c.comp !== 'lighter');
    for (let i = 0; i < sp.length; i += 1) {
      for (let k = i + 1; k < sp.length; k += 1) {
        const d = Math.hypot(sp[i]!.x - sp[k]!.x, sp[i]!.y - sp[k]!.y);
        if (d < min) {
          min = d;
          worstTick = world.tick;
        }
      }
    }
  }
  assert.ok(min >= 8, `tick ${worstTick} 两个 sprite 中心距只有 ${min.toFixed(2)}px（应 ≥8px）`);
});

