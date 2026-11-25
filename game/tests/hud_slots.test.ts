/**
 * 战斗 HUD / 技能栏（4 → 8 格）自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/hud_slots.test.ts
 *
 * 钉四件事（其余靠 work/hud_slots 的 750×1334 截图验）：
 *  1) 8 格时每个格子的**中心**都能被 hitTest 命中，且 index / seq 与绘制顺序一致；
 *     8 格是原作 `general+0x54` 的 byte[8] 上限，不允许再有第 9 格。
 *  2) 只有 3 个技能时命中区不越界：第 4 格原来的位置必须返回 null，不能凭空多一个死格。
 *  3) HUD 的体力/技力文本是 `当前/上限`（原作 `0x4412C0` 的 `%d/%d`），不是单值。
 *  4) 4 → 8 的迁移不改前 4 格顺序；≤4 格继续用 layout 的老版式（1124 / 88×88）。
 *
 * 这里刻意造真 world（createWorld + 真 generals.json），因为「序号 / 置灰 / 命中」三者
 * 一旦有一处另算坐标，只有真数据才暴露得出来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import {
  GENERAL_SLOW_INTERVAL,
  MAX_SKILL_SLOTS,
  SKILL_GRID_ROW2_Y,
  SKILL_GRID_ROW_GAP,
  SKILL_GRID_ROW_H,
  actionGaugeOf,
  buildFrame,
  castBlockReason,
  generalUnitOf,
  hitTest,
  learnedSkillSeqs,
  makeSkillBar,
  skillSlotRects,
  vitalText,
  type SkillSlot,
  type TextCmd,
  type ViewOptions,
} from '../src/view/battleView.ts';
import { MESSAGE_BOX, SKILL_SLOT_W, SKILL_SLOT_Y, skillSlotRect } from '../src/view/layout.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 張角在 generals.json 里有 8 条 SKILL（1,49 / 7,56 / ... / 41,106），Lv45 全学会。 */
const ZHANG_JUE_SKILLS = learnedSkillSeqs(data, '張角', 45);

function makeWorld(opts: { mp?: number } = {}): World {
  const w = createWorld({
    data,
    seed: 7,
    a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  });
  if (opts.mp !== undefined) w.sides.A.general.mp = opts.mp;
  return w;
}

function texts(cmds: ReturnType<typeof buildFrame>): TextCmd[] {
  return cmds.filter((c): c is TextCmd => c.kind === 'text');
}

function fightOpts(skills: SkillSlot[]): ViewOptions {
  return { skills, mode: 'fighting' };
}

test('data: 張角 Lv45 恰好 8 条技能，且第一条是 49（刀劍亂）', () => {
  assert.equal(ZHANG_JUE_SKILLS.length, 8);
  assert.equal(ZHANG_JUE_SKILLS[0], 49);
  assert.equal(MAX_SKILL_SLOTS, 8);
});

test('skillSlotRects(8)：4×2 两行，行高 56、第二行 y=1162', () => {
  const rects = skillSlotRects(8);
  assert.equal(rects.length, 8);
  for (let i = 0; i < 4; i += 1) {
    assert.equal(rects[i]!.y, SKILL_GRID_ROW2_Y, `第 ${i + 1} 格应在第一行`);
    assert.equal(rects[i]!.h, SKILL_GRID_ROW_H);
  }
  const row2Y = SKILL_GRID_ROW2_Y + SKILL_GRID_ROW_H + SKILL_GRID_ROW_GAP;
  for (let i = 4; i < 8; i += 1) {
    assert.equal(rects[i]!.y, row2Y, `第 ${i + 1} 格应在第二行`);
    assert.equal(rects[i]!.h, SKILL_GRID_ROW_H);
  }
  // x 沿用 layout 的 88 + 10 列节奏
  for (let i = 0; i < 8; i += 1) {
    assert.equal(rects[i]!.x, 116 + (i % 4) * (SKILL_SLOT_W + 10));
    assert.equal(rects[i]!.w, SKILL_SLOT_W);
  }
});

test('skillSlotRects(8)：两行底边在提示框之上、互不重叠', () => {
  const rects = skillSlotRects(8);
  for (const r of rects) {
    assert.ok(r.y >= 1094, `格子不得压住氣力文字：y=${r.y}`);
    assert.ok(r.y + r.h <= MESSAGE_BOX.y, `格子不得压住提示框：底 ${r.y + r.h} > ${MESSAGE_BOX.y}`);
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `第 ${i + 1} 格与第 ${j + 1} 格重叠`);
    }
  }
});

test('skillSlotRects(4)：前 4 格与 layout.skillSlotRect 完全一致（老版式不动）', () => {
  const rects = skillSlotRects(4);
  assert.equal(rects.length, 4);
  for (let i = 0; i < 4; i += 1) assert.deepEqual(rects[i], skillSlotRect(i));
  assert.equal(rects[0]!.y, SKILL_SLOT_Y);
  assert.equal(rects[0]!.h, 88);
});

test('skillSlotRects(3)：只画 3 格，仍是单行老版式', () => {
  const rects = skillSlotRects(3);
  assert.equal(rects.length, 3);
  for (let i = 0; i < 3; i += 1) assert.deepEqual(rects[i], skillSlotRect(i));
});

test('hitTest：8 格时每格中心都命中，且 index / seq 与 skills 顺序一致', () => {
  const world = makeWorld();
  const skills = makeSkillBar(data, ZHANG_JUE_SKILLS);
  const opts = fightOpts(skills);
  for (let i = 0; i < 8; i += 1) {
    const r = skillSlotRects(8)[i]!;
    const hit = hitTest(world, opts, r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(hit?.type, 'skill', `第 ${i + 1} 格中心没命中：${JSON.stringify(hit)}`);
    if (hit!.type !== 'skill') continue;
    assert.equal(hit!.index, i);
    assert.equal(hit!.seq, skills[i]!.seq);
  }
});

test('hitTest：8 格的置灰原因与 castBlockReason 完全同步（mp=0 时全为 mp）', () => {
  const world = makeWorld({ mp: 0 });
  const skills = makeSkillBar(data, ZHANG_JUE_SKILLS);
  const opts = fightOpts(skills);
  for (let i = 0; i < 8; i += 1) {
    const r = skillSlotRects(8)[i]!;
    const hit = hitTest(world, opts, r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(hit?.type, 'skill');
    if (hit!.type !== 'skill') continue;
    assert.equal(hit!.reason, castBlockReason(world, skills[i]!));
    assert.equal(hit!.canCast, false);
    assert.equal(hit!.reason, 'mp');
  }
});

test('hitTest：只有 3 个技能时不越界，第 4 格原位置返回 null', () => {
  const world = makeWorld();
  const skills = makeSkillBar(data, [49, 56, 66]);
  const opts = fightOpts(skills);
  for (let i = 0; i < 3; i += 1) {
    const r = skillSlotRect(i);
    const hit = hitTest(world, opts, r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(hit?.type, 'skill');
    if (hit!.type !== 'skill') continue;
    assert.equal(hit!.index, i);
  }
  const ghost = skillSlotRect(3);
  const outside = hitTest(world, opts, ghost.x + ghost.w / 2, ghost.y + ghost.h / 2);
  assert.equal(outside, null, `第 4 格不该存在，却命中了 ${JSON.stringify(outside)}`);
});

test('HUD：体力/技力画成 当前/上限，A/B 两侧共 4 条 `/` 文本', () => {
  const world = makeWorld();
  const skills = makeSkillBar(data, ZHANG_JUE_SKILLS);
  const hud = texts(buildFrame(world, fightOpts(skills))).filter((t) => t.y === 72);
  const withMax = hud.filter((t) => t.text.includes('/'));
  assert.equal(withMax.length, 4, `HUD y=72 应有 4 条 当前/上限，实得 ${JSON.stringify(hud.map((t) => t.text))}`);
  const ga = world.sides.A.general;
  const gb = world.sides.B.general;
  assert.ok(hud.some((t) => t.text === vitalText('體', ga.hp, ga.maxHp)));
  assert.ok(hud.some((t) => t.text === vitalText('技', ga.mp, ga.mpMax)));
  assert.ok(hud.some((t) => t.text === vitalText('體', gb.hp, gb.maxHp)));
  assert.ok(hud.some((t) => t.text === vitalText('技', gb.mp, gb.mpMax)));
});

// 改前（本文件上一版）：断言控制台（y>1000）只画 `兵 cur/max` 与 `技 cur/max`，注释写的是
//       「按原作只留 兵 / 技 两条（0842 帧左块就是 兵 46/96 + 技 10/54，没有第二个体力条）」，
//       `體` 只归顶栏 y=72。
// 改后：那条依据被 `project/188_录像逐项复核.md` §7 修正 —— 0842 / 08:30 帧每侧是
//       `兵 65/96` **与** `體 10/54` 两条（第二行是「體」不是「技」）；技（MP）原作没有独立行，
//       降成名字行右侧的 10px 小字。故这里钉「兵 / 體 都是 当前/上限；技 仍是 当前/上限但不吃行位」。
// 依据：`project/188_录像逐项复核.md` §7（:70-77）+ `project/191_HUD體与招降对齐.md` §A
//       + `work/video_ui_b/B_battle_0842.png` 左块逐行内容（`work/hud_vital/orig_0842_cardA_x4.png`）。
test('HUD：控制台的主将卡画 兵 / 體 的 当前/上限，技 降成小字（原作 `65/96` + `10/54`）', () => {
  const world = makeWorld();
  const ga = world.sides.A.general;
  ga.mp = 123.4;
  ga.hp = Math.round(ga.maxHp * 0.5);
  const a = world.sides.A;
  const all = texts(buildFrame(world, fightOpts(makeSkillBar(data, ZHANG_JUE_SKILLS))));
  const deep = all.filter((t) => t.y > 1000);
  assert.ok(deep.some((t) => t.text === vitalText('兵', a.aliveCount, a.start)), '控制台缺 兵 当前/上限');
  assert.ok(
    deep.some((t) => t.text === vitalText('體', ga.hp, ga.maxHp)),
    '控制台缺 體 当前/上限（188 §7 修正：第二行是 體，不是 技）',
  );
  const mp = deep.find((t) => t.text === vitalText('技', ga.mp, ga.mpMax));
  assert.ok(mp, '控制台仍要画 技 当前/上限（技能格已有 技 成本，别丢信息）');
  assert.ok((mp!.size ?? 99) <= 10, `技 应是 10px 小字，实得 ${mp!.size}`);
});

test('vitalText：当前/上限都向上取整、负值夹 0', () => {
  assert.equal(vitalText('體', 12.1, 99.2), '體 13/100');
  assert.equal(vitalText('技', -3, 60), '技 0/60');
  assert.equal(vitalText('體', Number.NaN, 10), '體 0/10');
});

test('4→8 迁移：前 4 格顺序不变（Lv18 学的 4 条 == Lv45 的前 4 条）', () => {
  const four = learnedSkillSeqs(data, '張角', 18);
  assert.equal(four.length, 4);
  assert.deepEqual(four, ZHANG_JUE_SKILLS.slice(0, 4));
  const bar4 = makeSkillBar(data, four);
  const bar8 = makeSkillBar(data, ZHANG_JUE_SKILLS);
  assert.deepEqual(bar4.map((s) => s.seq), bar8.slice(0, 4).map((s) => s.seq));
});

test('makeSkillBar：最多 8 格，超过 8 条被截断', () => {
  const seqs = [...ZHANG_JUE_SKILLS, 104, 1];
  const bar = makeSkillBar(data, seqs);
  assert.equal(bar.length, 8);
  assert.deepEqual(bar.map((s) => s.seq), ZHANG_JUE_SKILLS);
});

test('绘制：8 格画 8 个序号、3 格只画 3 个，且名字落在各自格子里', () => {
  const world = makeWorld();
  const bar8 = makeSkillBar(data, ZHANG_JUE_SKILLS);
  const cmds8 = texts(buildFrame(world, fightOpts(bar8)));
  const nums8 = cmds8.filter((t) => /^[1-8]$/.test(t.text) && t.y >= 1000);
  assert.deepEqual(nums8.map((t) => t.text), ['1', '2', '3', '4', '5', '6', '7', '8']);

  const bar3 = makeSkillBar(data, [49, 56, 66]);
  const cmds3 = texts(buildFrame(world, fightOpts(bar3)));
  const nums3 = cmds3.filter((t) => /^[1-8]$/.test(t.text) && t.y >= 1000);
  assert.deepEqual(nums3.map((t) => t.text), ['1', '2', '3']);

  const rects = skillSlotRects(8);
  for (let i = 0; i < 8; i += 1) {
    const r = rects[i]!;
    assert.ok(
      cmds8.some((t) => t.text === bar8[i]!.name && t.x === r.x + r.w / 2 && t.y === r.y + 31),
      `第 ${i + 1} 格名字没画在 ${JSON.stringify(r)} 里`,
    );
  }
});

// 改前：断言控制台有一行文本 `武 56 · 智 95 · 行 12/40` —— 「行动节奏」当第四个字
//       段写在主将名下面（`grep '行 '` 能命中那段字）。
// 改后：四个字段位归原作（疲勞 / 士氣 / 智力 / 武力），「行」不再占字段位，只在主将卡
//       底部留一条 3px 细 bar；进度仍只读 core 的 `u.cd` / `actionIntervalOf()`。
//       所以断言从「文本有没有这段字」改成「bar 的填充宽 = 238 × core 的 ratio」。
// 依据：`project/178_全系统界面差异_B组.md:217`（四个裸数字）、`:238-253`（字段对照：
//       我们多出「行 40/40」）+ 派单口径「去掉 行 40/40 独占位置（若需要保留行动条，
//       放进主将块内部，不要占用这 4 个字段位）」。
test('console：行动节奏不再占字段位，改画成主将卡里的细 bar（进度仍只读 core 的 cd）', () => {
  const world = makeWorld();
  const gu = generalUnitOf(world, 'A');
  assert.ok(gu, 'world 里应有我方主将单位');
  gu!.cd = 12;
  const act = actionGaugeOf(gu!);
  const cmds = buildFrame(world, fightOpts(makeSkillBar(data, ZHANG_JUE_SKILLS)));

  // 1) 旧的那行字必须消失（不能又冒出一行「行 28/40」占着字段位）
  const lineTexts = texts(cmds).filter((t) => /行\s*\d+\s*\/\s*\d+/.test(t.text));
  assert.deepEqual(
    lineTexts.map((t) => t.text),
    [],
    '「行 a/b」不该再作为控制台文本出现',
  );

  // 2) bar 的填充宽 = 卡宽(250) − 12，乘 core 的 ratio
  //    y=1094：技能格第一行从 1100 起，再往下压就画到格子上了。
  const barY = 1094;
  const barH = 3;
  const barW = 250 - 12;
  const rects = cmds.filter(
    (c) =>
      c.kind === 'rect' &&
      c.y === barY &&
      c.h === barH &&
      c.x >= 116 &&
      c.x <= 116 + 250,
  );
  assert.equal(rects.length, 3, '行动条 = 底 + 填充 + 描边，共 3 笔');
  const fill = rects.find((c) => c.kind === 'rect' && c.w > 0.5 && c.w < barW - 0.01 && c.fill);
  assert.ok(fill, '行动条缺填充');
  assert.ok(
    fill!.kind === 'rect' && Math.abs(fill!.w - barW * act.ratio) < 0.01,
    `填充宽 ${fill!.kind === 'rect' ? fill!.w : '?'} 应等于 ${barW} × ${act.ratio}`,
  );
});

// R159（`project/160_撤退态0x4000.md`）：旧断言「主将一律以 46 帧为量程、40 帧停在 40/46」
// 建立在「46 是主将专属档位」的误读上。46 与 40 是同一字段 `[u+0x34]`
// （`0x43B5DE …28` / `0x43B5FD …2e`），只有撤退/溃退态（`0x4000`）才走 46；
// 旧画法的后果是**非撤退主将的行动条永远停在 87% 就复位**。改后：
//   - 普通主将：量程 40、刻度 1、ratio = 已走/40；
//   - 撤退态主将（status |= 0x4000）：量程 46；
//   - 士兵：40。
test('actionGaugeOf：量程只读 core（普通主将 40 / 撤退态 46 / 士兵 40）', () => {
  const ready = actionGaugeOf({ cd: 0, isGeneral: true, status: 0 });
  assert.equal(ready.interval, 40);
  assert.equal(ready.slow, 40, '普通主将的量程就是 40，不该被抬到 46');
  assert.equal(ready.mark, 1);
  assert.equal(ready.ratio, 1);

  const justFired = actionGaugeOf({ cd: 40, isGeneral: true, status: 0 });
  assert.equal(justFired.ratio, 0);
  const half = actionGaugeOf({ cd: 20, isGeneral: true, status: 0 });
  assert.equal(half.ratio, 0.5);

  const retreating = actionGaugeOf({ cd: 23, isGeneral: true, status: 0x4000 });
  assert.equal(retreating.interval, GENERAL_SLOW_INTERVAL, '撤退态才走 46 帧');
  assert.equal(retreating.slow, GENERAL_SLOW_INTERVAL);
  assert.equal(retreating.ratio, 0.5);

  const soldier = actionGaugeOf({ cd: 20, isGeneral: false, status: 0 });
  assert.equal(soldier.slow, 40);
  assert.equal(soldier.mark, 1);
  assert.equal(soldier.ratio, 0.5);
});
