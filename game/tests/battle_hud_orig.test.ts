/**
 * 战斗 HUD 对齐原作（B 组验收，`project/178_全系统界面差异_B组.md` §HUD）自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/battle_hud_orig.test.ts
 *
 * 钉三件事：
 *  1) **顶部金牌 = 战场剩余时间的中文数字倒计时**（不是 `MM:SS`）。语义与量纲见
 *     `src/view/battleView.ts` 里 `BATTLE_TIME_TICKS` 的注释（原作 `[0x4AC35C]` 初值 11880
 *     帧、每帧 −1、每 120 帧显示值 −1 ⇒ 起始 99、0.5/秒）。录像证据：0842「六十七」→
 *     0900「五十八」，18 秒掉 9 点。
 *  2) **底部左右两块主将卡，各四个裸数字 = 疲勞 / 士氣 / 智力 / 武力**（左块外侧列贴立绘、
 *     右块整块镜像）。原件 `work/video_ui_b/B_battle_0842.png` 左块 `0 / 84 / 88 / 100`，
 *     09:05 招降面板把同一个赵云写成 `疲勞度19 士氣64 智力88 武力100`（被俘后士气 −20）。
 *  3) 「行 a/b」不再占字段位；兵 / 體 各一条横条（原作 0842 帧 `兵 65/96` + `體 10/54`），
 *     技（MP）降成名字行的 10px 小字。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import {
  buildFrame,
  chineseNumber,
  clockUnitsLeft,
  learnedSkillSeqs,
  makeSkillBar,
  type RectCmd,
  type TextCmd,
  type ViewOptions,
} from '../src/view/battleView.ts';
import {
  CLOCK_PLAQUE,
  GENERAL_CARD_B,
  GENERAL_CARD_BAR_H,
  GENERAL_CARD_VITAL_W,
  GENERAL_CARD_VITAL_W_B,
  GENERAL_CARD_Y,
  GENERAL_INFO,
} from '../src/view/layout.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const ZHANG_JUE_SKILLS = learnedSkillSeqs(data, '張角', 45);

function makeWorld(): World {
  return createWorld({
    data,
    seed: 7,
    a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  });
}

function texts(cmds: ReturnType<typeof buildFrame>): TextCmd[] {
  return cmds.filter((c): c is TextCmd => c.kind === 'text');
}

function fightOpts(): ViewOptions {
  return { skills: makeSkillBar(data, ZHANG_JUE_SKILLS), mode: 'fighting' };
}

// ---------------------------------------------------------------------------
// 一、中文数字渲染器
// ---------------------------------------------------------------------------

test('chineseNumber：0..99 按原作金牌的三字写法（九十九 / 六十 / 五十八 / 十 / 五）', () => {
  const cases: [number, string][] = [
    [0, '零'],
    [5, '五'],
    [9, '九'],
    [10, '十'],
    [12, '十二'],
    [20, '二十'],
    [58, '五十八'], // 0900 帧金牌
    [60, '六十'],
    [67, '六十七'], // 0842 帧金牌
    [95, '九十五'],
    [99, '九十九'],
  ];
  for (const [n, want] of cases) assert.equal(chineseNumber(n), want, `${n} 的中文数字`);
  // 越界一律夹到 0..99，且不吐 NaN
  assert.equal(chineseNumber(-3), '零');
  assert.equal(chineseNumber(1234), '九十九');
  assert.equal(chineseNumber(Number.NaN), '零');
});

test('clockUnitsLeft：起始 99，每 2 秒掉 1，到 0 停住（原作 11880 帧 / 120 = 99）', () => {
  // R192：TICK_HZ 30→60 后，2 秒 = 120 tick（旧 60），198 秒 = 11880 tick（旧 5940）。
  assert.equal(clockUnitsLeft(0), 99, '开战第 0 tick = 九十九');
  assert.equal(clockUnitsLeft(60), 99, '1 秒还没掉');
  assert.equal(clockUnitsLeft(119), 99, '1.98 秒仍在九十九');
  assert.equal(clockUnitsLeft(120), 98, '第 2 秒掉第一点');
  assert.equal(clockUnitsLeft(240), 97);
  assert.equal(clockUnitsLeft(960), 91, '第 16 秒 = 16 秒 × 0.5 = 掉 8 点');
  assert.equal(clockUnitsLeft(11880), 0, '198 秒见底');
  assert.equal(clockUnitsLeft(18000), 0, '见底后夹 0，不出现负数');
  assert.equal(clockUnitsLeft(-5), 99, '负 tick 当 0 处理');
});

// ---------------------------------------------------------------------------
// 二、顶部金牌
// ---------------------------------------------------------------------------

test('HUD：顶部中央是中文数字金牌，没有 MM:SS 时钟', () => {
  const world = makeWorld();
  const cmds = buildFrame(world, fightOpts());
  const ts = texts(cmds);

  // 金牌文字：落在 CLOCK_PLAQUE 的中线上
  const plaque = ts.find((t) => t.x === CLOCK_PLAQUE.x + CLOCK_PLAQUE.w / 2 && t.text === '九十九');
  assert.ok(plaque, `顶栏缺中文数字金牌，实得 ${JSON.stringify(ts.filter((t) => t.y < 100).map((t) => t.text))}`);
  assert.ok(plaque!.y > CLOCK_PLAQUE.y && plaque!.y < CLOCK_PLAQUE.y + CLOCK_PLAQUE.h, '金牌文字要落在牌内');
  assert.ok((plaque!.size ?? 0) >= 24, '金牌是 HUD 里最大的一处字');

  // 旧画法（`00:08`）必须消失
  assert.deepEqual(
    ts.filter((t) => /^\d{1,2}:\d{2}$/.test(t.text)).map((t) => t.text),
    [],
    '不该再出现 MM:SS 时钟',
  );

  // 牌面三笔：外框 + 木底 + 内芯（全都在顶栏里）
  const frames = cmds.filter(
    (c) => c.kind === 'rect' && c.y <= CLOCK_PLAQUE.y + CLOCK_PLAQUE.h && c.h >= CLOCK_PLAQUE.h - 9,
  );
  assert.ok(frames.length >= 3, `金牌至少要画 3 层（框/底/芯），实得 ${frames.length}`);
});

test('HUD：金牌随 tick 掉数（960 tick = 16 秒 ⇒ 九十一）', () => {
  const world = makeWorld();
  // R192：TICK_HZ 30→60，8 秒从 240 tick 变 480 tick，16 秒从 480 变 960。
  world.tick = 960;
  const ts = texts(buildFrame(world, fightOpts()));
  assert.ok(ts.some((t) => t.text === '九十一'), '16 秒后金牌应是九十一');
  assert.ok(!ts.some((t) => t.text === '九十九'), '旧值不该还在');
});

test('HUD：顶栏不再写「士氣 A · B」双值行（士氣归底部主将卡，每侧一个）', () => {
  const world = makeWorld();
  const ts = texts(buildFrame(world, fightOpts()));
  const top = ts.filter((t) => t.y < 100);
  assert.deepEqual(top.filter((t) => t.text.includes('士氣')).map((t) => t.text), [], '顶栏不该有士氣');
  assert.deepEqual(
    top.filter((t) => /士氣 \d+ · \d+/.test(t.text)).map((t) => t.text),
    [],
    '士氣 双值行要删掉',
  );
});

// ---------------------------------------------------------------------------
// 三、底部两块主将卡：四个裸数字
// ---------------------------------------------------------------------------

test('console：我方块 = 疲勞 / 士氣 / 智力 / 武力 四个裸数字（外列疲勞·智力、内列士氣·武力）', () => {
  const world = makeWorld();
  const g = world.sides.A.general;
  const morale = g.morale ?? world.sides.A.morale;
  const ts = texts(buildFrame(world, fightOpts()));

  const at = (text: string, x: number) => ts.find((t) => t.text === text && t.x === x);
  // 外列 = 卡左缘，内列 = 左缘 + 124
  const outer = GENERAL_INFO.x;
  const inner = GENERAL_INFO.x + 124;
  assert.ok(at(`疲 ${g.tire ?? 0}`, outer), `缺「疲 0」，实得 ${JSON.stringify(ts.filter((t) => t.text.startsWith('疲')).map((t) => [t.x, t.text]))}`);
  assert.ok(at(`士 ${morale}`, inner), `缺「士 ${morale}」`);
  assert.ok(at(`智 ${g.int}`, outer), '缺「智」');
  assert.ok(at(`武 ${g.str}`, inner), '缺「武」');
  // 上排在下排之上
  assert.ok(at(`疲 ${g.tire ?? 0}`, outer)!.y < at(`智 ${g.int}`, outer)!.y, '疲勞在上、智力在下');
});

test('console：敌方块是镜像（士氣/武力在内侧列、疲勞/智力在外侧列，名字靠右）', () => {
  const world = makeWorld();
  const g = world.sides.B.general;
  const morale = g.morale ?? world.sides.B.morale;
  // 只取控制台（y>1000）里落在敌方块范围内的文本 —— 顶栏右侧也有 x>366 的字
  const ts = texts(buildFrame(world, fightOpts())).filter(
    (t) => t.y > 1000 && t.x >= GENERAL_CARD_B.x,
  );

  const at = (text: string) => ts.find((t) => t.text === text);
  // 敌方块 151 宽：内侧列（士/武）= 左缘 + 4，外侧列（疲/智）= 右缘（右对齐）
  const inner = GENERAL_CARD_B.x + 4;
  const outer = GENERAL_CARD_B.x + GENERAL_CARD_B.w;

  assert.ok(at(`士 ${morale}`), '敌方块缺士氣');
  assert.equal(at(`士 ${morale}`)!.x, inner, '士氣应落在内侧列');
  assert.equal(at(`疲 ${g.tire ?? 0}`)!.x, outer, '疲勞应落在外侧列（贴屏边）');
  assert.equal(at(`武 ${g.str}`)!.x, inner, '武力应落在内侧列');
  assert.equal(at(`智 ${g.int}`)!.x, outer, '智力应落在外侧列');
  // 镜像 = 士氣在左、疲勞在右（原作右块读数 78 | 20）
  assert.ok(at(`士 ${morale}`)!.x < at(`疲 ${g.tire ?? 0}`)!.x, '镜像块的读数顺序反了');
  // 名字靠右
  const name = ts.find((t) => t.text === g.name);
  assert.ok(name, '敌方块缺主将名');
  assert.equal(name!.x, outer);
});

test('console：兵 / 技 仍是 当前/上限（原作 `46/96`、`10/54`）', () => {
  const world = makeWorld();
  const ts = texts(buildFrame(world, fightOpts()));
  const body = ts.filter((t) => t.y > 1000);
  assert.ok(
    body.some((t) => new RegExp(`^兵 ${world.sides.A.aliveCount}/${world.sides.A.start}$`).test(t.text)),
    `我方兵数应是 当前/上限，实得 ${JSON.stringify(body.map((t) => t.text).slice(0, 12))}`,
  );
  const g = world.sides.A.general;
  assert.ok(body.some((t) => t.text === `技 ${g.mp}/${g.mpMax}`), '我方技力应是 当前/上限');
  assert.ok(
    body.some((t) => new RegExp(`^兵 ${world.sides.B.aliveCount}/${world.sides.B.start}$`).test(t.text)),
    '敌方块也要有兵数',
  );
});

test('console：四个字段全是裸数字，不再出现「武 x · 智 y · 行 a/b」那一行', () => {
  const world = makeWorld();
  const ts = texts(buildFrame(world, fightOpts()));
  assert.deepEqual(
    ts.filter((t) => /^武 \d+ · 智 \d+/.test(t.text)).map((t) => t.text),
    [],
    '旧的「武 · 智 · 行」一行要拆掉',
  );
});

// 改前：每侧主将卡只有「兵 当前/上限」与「技 当前/上限」两条数字，**没有「體」**
//       （`hud_slots.test.ts:181-187` 那条旧注释写的是「0842 帧左块只有 兵 与 技 两条」）。
// 改后：按 `project/188_录像逐项复核.md` §7 修正 —— 原作每侧是 **兵 + 體 各一条横条**：
//       `work/video_ui_b/B_battle_0842.png`（08:42）左赵云 `兵 65/96` + `體 10/54`，
//       右曹豹 `44/96` + `5/49`，右块整块镜像。技（MP）原作没有独立行，降成名字行的 10px 小字。
// 依据：188 §7 / 191 §A（`project/191_HUD體与招降对齐.md`）。
test('console：我方块 兵 / 體 各一条横条，體 = 主将 hp/maxHp（原作 `65/96`、`10/54`）', () => {
  const world = makeWorld();
  const ga = world.sides.A.general;
  const a = world.sides.A;
  const hp = Math.round(ga.maxHp * 0.37);
  ga.hp = hp;
  a.aliveCount = 63;
  const cmds = buildFrame(world, fightOpts());
  const ts = texts(cmds);

  // 数值口径：兵 = 本侧存活/起始，體 = 主将 hp/maxHp（不是士兵血量）
  const troopText = ts.find((t) => t.text === `兵 ${a.aliveCount}/${a.start}` && t.x === GENERAL_INFO.x);
  assert.ok(troopText, '我方块缺 兵 当前/上限');
  const hpText = ts.find((t) => t.y > 1000 && t.text === `體 ${hp}/${ga.maxHp}`);
  assert.ok(hpText, `我方块缺「體 ${hp}/${ga.maxHp}」（主将体力）`);
  assert.equal(hpText!.x, GENERAL_INFO.x, '體 应落在卡的外侧列（贴立绘）');
  assert.ok(hpText!.y > troopText!.y, '兵 条在上、體 条在下（同原作 0842 帧的顺序）');

  // 两条横条：x 从文本预留宽度之后起画，宽 = 卡宽 − 预留 − 4
  const barX = GENERAL_INFO.x + GENERAL_CARD_VITAL_W;
  const barW = GENERAL_INFO.w - GENERAL_CARD_VITAL_W - 4;
  const barAt = (y: number): RectCmd[] =>
    cmds.filter(
      (c): c is RectCmd =>
        c.kind === 'rect' &&
        c.y === y &&
        c.h === GENERAL_CARD_BAR_H &&
        c.x >= GENERAL_INFO.x &&
        c.x + c.w <= GENERAL_INFO.x + GENERAL_INFO.w + 0.01,
    );
  const fillOf = (rects: RectCmd[]): RectCmd | undefined =>
    rects.find((c) => c.fill !== undefined && c.fill !== 'rgba(255,255,255,0.10)' && c.w < barW - 0.01);

  for (const [label, y] of [
    ['兵', GENERAL_CARD_Y.troopBar],
    ['體', GENERAL_CARD_Y.hpBar],
  ] as const) {
    const rects = barAt(y);
    assert.equal(rects.length, 3, `${label} 条 = 底 + 填充 + 描边共 3 笔，实得 ${rects.length}`);
    assert.equal(rects[0]!.w, barW, `${label} 条宽应是 ${barW}`);
    assert.ok(fillOf(rects), `${label} 条缺填充`);
  }
  const troopFill = fillOf(barAt(GENERAL_CARD_Y.troopBar))!;
  assert.ok(
    Math.abs(troopFill.w - barW * (a.aliveCount / a.start)) < 0.01,
    `兵 条填充宽 ${troopFill.w} 应 = ${barW} × ${a.aliveCount / a.start}`,
  );
  const hpFill = fillOf(barAt(GENERAL_CARD_Y.hpBar))!;
  assert.ok(
    Math.abs(hpFill.w - barW * (hp / ga.maxHp)) < 0.01,
    `體 条填充宽 ${hpFill.w} 应 = ${barW} × ${hp / ga.maxHp}`,
  );

  // 技（MP）没丢：降成名字行的 10px 小字，不吃 兵/體/裸数字 的行位
  const mp = ts.find((t) => t.text === `技 ${ga.mp}/${ga.mpMax}` && t.y > 1000);
  assert.ok(mp, '技 当前/上限 不该丢');
  assert.ok((mp!.size ?? 99) <= 10, `技 应是 10px 小字，实得 ${mp!.size}`);
});

test('console：敌方块同为 兵 / 體 两条横条，整块镜像（条在文本左侧、填充从右缘长出来）', () => {
  const world = makeWorld();
  const gb = world.sides.B.general;
  const b = world.sides.B;
  const hp = Math.round(gb.maxHp * 0.62);
  gb.hp = hp;
  b.aliveCount = 41;
  const cmds = buildFrame(world, fightOpts());
  const ts = texts(cmds).filter((t) => t.y > 1000 && t.x >= GENERAL_CARD_B.x);

  assert.ok(
    ts.some((t) => t.text === `兵 ${b.aliveCount}/${b.start}` && t.x === GENERAL_CARD_B.x + GENERAL_CARD_B.w),
    '敌方块缺 兵 当前/上限（贴右缘）',
  );
  assert.ok(
    ts.some((t) => t.text === `體 ${hp}/${gb.maxHp}` && t.x === GENERAL_CARD_B.x + GENERAL_CARD_B.w),
    '敌方块缺 體 当前/上限（贴右缘）',
  );

  const barX = GENERAL_CARD_B.x + 4;
  const barW = GENERAL_CARD_B.w - GENERAL_CARD_VITAL_W_B - 4;
  const barAt = (y: number): RectCmd[] =>
    cmds.filter(
      (c): c is RectCmd =>
        c.kind === 'rect' &&
        c.y === y &&
        c.h === GENERAL_CARD_BAR_H &&
        c.x >= GENERAL_CARD_B.x &&
        c.x + c.w <= GENERAL_CARD_B.x + GENERAL_CARD_B.w + 0.01,
    );
  for (const [label, y, ratio] of [
    ['兵', GENERAL_CARD_Y.troopBar, b.aliveCount / b.start],
    ['體', GENERAL_CARD_Y.hpBar, hp / gb.maxHp],
  ] as const) {
    const rects = barAt(y);
    assert.equal(rects.length, 3, `敌方块 ${label} 条应有 3 笔，实得 ${rects.length}`);
    assert.equal(rects[0]!.x, barX, `敌方块 ${label} 条应从 x=${barX} 起画`);
    assert.equal(rects[0]!.w, barW, `敌方块 ${label} 条宽应是 ${barW}`);
    const fill = rects.find((c) => c.fill !== undefined && c.fill !== 'rgba(255,255,255,0.10)' && c.w < barW - 0.01);
    assert.ok(fill, `敌方块 ${label} 条缺填充`);
    assert.ok(Math.abs(fill!.w - barW * ratio) < 0.01, `敌方块 ${label} 填充宽 ${fill!.w} 应 = ${barW} × ${ratio}`);
    // 镜像：填充贴条右缘（x + w === barX + barW）
    assert.ok(
      Math.abs(fill!.x + fill!.w - (barX + barW)) < 0.01,
      `敌方块 ${label} 条该从右缘长出来，实得 fill.x=${fill!.x} end=${fill!.x + fill!.w} 右缘=${barX + barW}`,
    );
  }
});
