/**
 * 两层战斗指令界面自检（6 大按钮 + 6 条部队指令子菜单）。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/battle_cmd_ui.test.ts
 *
 * 钉的是「版式 + 命中 + 置灰」三件事（长什么样靠 `work/battlecmd/*.png` 验）：
 *  1) 第一层 6 钮 2 列 × 3 行，全在 `CONSOLE_TOP..DESIGN_H` 内，两两不重叠，
 *     且与 4 格 / 8 格技能栏、提示框、突擊/撤退快捷钮都不打架（14 个矩形一条断言）；
 *  2) 第二层 6 行落在面板里、面板不遮战场（顶边 > `FIELD_BOTTOM`）；
 *  3) `hitTest` 的**绘制矩形 = 命中矩形**：每个按钮/每行子菜单的几何中心都能命中，
 *     且 `cmd6`/`armyCmd`/`armyMenu` 三个新类型与旧的 `skill`/`assault`/`retreat`/`field`
 *     共存不抢（`main.js` 的 6 个分支依赖旧语义，`tests/hud_slots.test.ts` 依赖旧矩形）；
 *  4) 置灰是**纯函数**判定（`cmd6Usable` / `armyMenuItems` / `canUseArmyCmd`），
 *     再用 DrawCmd 的颜色断言"灰了" —— 不做截图比对。
 *
 * 这里刻意造真 world（createWorld + 真 generals.json）：`armyCmdsOf` 的 33 组阵形表、
 * `canUseArmyCmd` 的 flags 判定都在 core 里，视图层一旦自己抄表，只有真数据才暴露得出来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { ARMY_BTN, applyArmyCmdKind, armyCmdsOf, armyOrderOf, canUseArmyCmd } from '../src/core/army_cmd.ts';
import {
  ARMY_MENU_RECT,
  CHIP_ASSAULT,
  CHIP_RETREAT,
  CMD6_BTN_H,
  CMD6_BTN_W,
  CMD6_COUNT,
  armyCmdRects,
  armyMenuItems,
  armyMenuOpen,
  armyMenuRect,
  buildFrame,
  cmd6Defs,
  cmd6Rects,
  cmd6Usable,
  hitTest,
  learnedSkillSeqs,
  makeSkillBar,
  setArmyMenuOpen,
  skillSlotRects,
  type Hit,
  type SkillSlot,
  type TextCmd,
  type ViewOptions,
} from '../src/view/battleView.ts';
import {
  CONSOLE_TOP,
  DESIGN_H,
  DESIGN_W,
  FIELD_BOTTOM,
  MESSAGE_BOX,
  PORTRAIT,
  skillSlotRect,
  type Rect,
} from '../src/view/layout.ts';
import { COLORS } from '../src/view/theme.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 張角 Lv45 恰好 8 条技能（`tests/hud_slots.test.ts` 已钉），这里当 8 格素材 */
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

function skills(n: number): SkillSlot[] {
  return makeSkillBar(data, ZHANG_JUE_SKILLS).slice(0, n);
}

function fightOpts(n: number, extra: ViewOptions = {}): ViewOptions {
  return { skills: skills(n), mode: 'fighting', ...extra };
}

function texts(cmds: ReturnType<typeof buildFrame>): TextCmd[] {
  return cmds.filter((c): c is TextCmd => c.kind === 'text');
}

/** 严格不重叠（贴边不算重叠） */
function overlap(a: Rect, b: Rect): boolean {
  const e = 0.001;
  return a.x + e < b.x + b.w && b.x + e < a.x + a.w && a.y + e < b.y + b.h && b.y + e < a.y + a.h;
}

function inConsole(r: Rect): boolean {
  return r.x >= 0 && r.y >= CONSOLE_TOP && r.x + r.w <= DESIGN_W && r.y + r.h <= DESIGN_H;
}

function center(r: Rect): [number, number] {
  return [r.x + r.w / 2, r.y + r.h / 2];
}

/** 命中类型断言 + 类型收窄（`hit?.type === 'x'` 在 strict 下不好收窄） */
function expectHit<K extends Hit['type']>(hit: Hit | null, type: K): Extract<Hit, { type: K }> {
  assert.ok(hit, `期望命中 ${type}，实际 null`);
  assert.equal(hit.type, type, `期望命中 ${type}，实际 ${hit.type}`);
  return hit as Extract<Hit, { type: K }>;
}

function assertNoOverlap(rects: readonly Rect[], what: string): void {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.ok(!overlap(rects[i]!, rects[j]!), `${what}：第 ${i} 个与第 ${j} 个重叠`);
    }
  }
}

// ---------------------------------------------------------------------------
// 一、版式：第一层 6 钮
// ---------------------------------------------------------------------------

test('版式：6 大按钮 = 2 列 × 3 行，单钮 100×84，全在控制台内，两两不重叠', () => {
  const rects = cmd6Rects();
  assert.equal(rects.length, CMD6_COUNT);
  assert.equal(CMD6_COUNT, 6);
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i]!;
    assert.ok(inConsole(r), `第 ${i} 钮越出控制台：${JSON.stringify(r)}`);
    assert.equal(r.w, CMD6_BTN_W);
    assert.equal(r.h, CMD6_BTN_H);
    // 2 列：奇偶列 x 差 108；3 行：行差 94
    assert.equal(r.x, 524 + (i % 2) * (CMD6_BTN_W + 8));
    assert.equal(r.y, 1030 + Math.floor(i / 2) * (CMD6_BTN_H + 10));
  }
  assertNoOverlap(rects, '6 大按钮');
  // 右列贴到 732（右侧留 18px），底边 1302（下方留 32px）
  assert.equal(Math.max(...rects.map((r) => r.x + r.w)), 732);
  assert.equal(Math.max(...rects.map((r) => r.y + r.h)), 1302);
});

test('版式：6 钮不压 4 格 / 8 格技能栏，也不压提示框', () => {
  for (const n of [4, 8]) {
    for (const btn of cmd6Rects()) {
      for (const slot of skillSlotRects(n)) {
        assert.ok(!overlap(btn, slot), `${n} 格技能栏被第 ${btn.x},${btn.y} 的按钮压住`);
      }
    }
  }
  for (const btn of cmd6Rects()) {
    assert.ok(!overlap(btn, MESSAGE_BOX), '提示框被 6 钮压住');
  }
});

test('版式：8 格技能 + 6 大按钮 + 突擊/撤退快捷钮 共 16 个矩形两两不重叠', () => {
  const all: Rect[] = [...skillSlotRects(8), ...cmd6Rects(), CHIP_ASSAULT, CHIP_RETREAT];
  assert.equal(all.length, 8 + 6 + 2);
  for (const r of all) assert.ok(inConsole(r), `矩形越出控制台：${JSON.stringify(r)}`);
  assertNoOverlap(all, '8 格 + 6 钮 + 2 快捷');
});

test('版式：突擊/撤退快捷钮在头像下方（让位给 6 钮），不压技能栏与提示框', () => {
  for (const chip of [CHIP_ASSAULT, CHIP_RETREAT]) {
    assert.ok(inConsole(chip));
    assert.ok(chip.y >= PORTRAIT.y + PORTRAIT.h, '快捷钮必须落在头像下沿之下');
    for (const slot of skillSlotRects(4)) assert.ok(!overlap(chip, slot));
    for (const slot of skillSlotRects(8)) assert.ok(!overlap(chip, slot));
    assert.ok(!overlap(chip, MESSAGE_BOX));
  }
  assert.ok(!overlap(CHIP_ASSAULT, CHIP_RETREAT));
});

// ---------------------------------------------------------------------------
// 二、版式：第二层子菜单面板
// ---------------------------------------------------------------------------

test('版式：子菜单面板 6 行全部在面板内、两两不重叠、不越出画布', () => {
  const panel = armyMenuRect();
  assert.deepEqual(panel, ARMY_MENU_RECT);
  const rows = armyCmdRects();
  assert.equal(rows.length, 6);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    assert.ok(r.x >= panel.x && r.x + r.w <= panel.x + panel.w, `第 ${i} 行横向越出面板`);
    assert.ok(r.y >= panel.y && r.y + r.h <= panel.y + panel.h, `第 ${i} 行纵向越出面板`);
    assert.ok(r.y >= CONSOLE_TOP && r.y + r.h <= DESIGN_H, `第 ${i} 行越出控制台`);
  }
  assertNoOverlap(rows, '子菜单 6 行');
});

test('版式：子菜单面板不遮战场（顶边 > FIELD_BOTTOM），不压技能栏与提示框', () => {
  const panel = armyMenuRect();
  assert.ok(panel.y >= FIELD_BOTTOM, `面板顶边 ${panel.y} 压进战场`);
  assert.ok(panel.y + panel.h <= DESIGN_H);
  assert.ok(panel.x >= MESSAGE_BOX.x + MESSAGE_BOX.w, '面板与提示框横向打架');
  for (const slot of skillSlotRects(8)) assert.ok(!overlap(panel, slot));
  assert.ok(!overlap(panel, MESSAGE_BOX));
  // 面板从 1116 起是刻意的：第 2 颗钮（部隊指令）底边 1114 露在面板外，才能"再点一次收起"
  const six = cmd6Rects();
  assert.ok(!overlap(panel, six[1]!), '「部隊指令」钮必须露在面板外');
  assert.ok(panel.y >= six[1]!.y + six[1]!.h, '面板顶边必须在「部隊指令」下沿之下');
});

// ---------------------------------------------------------------------------
// 三、命中：第一层 6 钮
// ---------------------------------------------------------------------------

test('hitTest：6 个按钮中心依次命中 cmd6 btn 0..5（文案取 cmd6Defs）', () => {
  const world = makeWorld();
  const opts = fightOpts(4);
  const defs = cmd6Defs(world);
  const rects = cmd6Rects();
  for (let i = 0; i < 6; i += 1) {
    setArmyMenuOpen(false); // 第 2 颗会顺手展开子菜单，逐颗复位
    const [x, y] = center(rects[i]!);
    const hit = expectHit(hitTest(world, opts, x, y), 'cmd6');
    assert.equal(hit.btn, i);
    assert.equal(hit.label, defs[i]!.label);
    assert.equal(hit.kind, defs[i]!.kind);
    assert.equal(hit.canUse, cmd6Usable(world, i, opts).ok);
  }
});

test('hitTest：点「部隊指令」展开子菜单，再点一次收起', () => {
  const world = makeWorld();
  const opts = fightOpts(4);
  const [x, y] = center(cmd6Rects()[1]!);
  setArmyMenuOpen(false);
  assert.equal(expectHit(hitTest(world, opts, x, y), 'cmd6').btn, 1);
  assert.equal(armyMenuOpen(), true, '第 1 次点击应展开子菜单');
  assert.equal(expectHit(hitTest(world, opts, x, y), 'cmd6').btn, 1);
  assert.equal(armyMenuOpen(), false, '第 2 次点击应收起子菜单');
});

// ---------------------------------------------------------------------------
// 四、命中：第二层 6 条子菜单
// ---------------------------------------------------------------------------

test('hitTest：展开后 6 行中心命中 armyCmd，slot / label / canUse 与 core 一致', () => {
  const world = makeWorld();
  const opts = fightOpts(4, { armyMenu: true });
  const defs = armyCmdsOf(world.sides.A.formation);
  const rows = armyCmdRects();
  for (let i = 0; i < 6; i += 1) {
    const [x, y] = center(rows[i]!);
    const hit = expectHit(hitTest(world, opts, x, y), 'armyCmd');
    assert.equal(hit.slot, defs[i]!.slot, `第 ${i} 行的 slot 应直接等于 armyCmdsOf 的槽号`);
    assert.equal(hit.label, defs[i]!.label, '视图层不许自己抄表：label 必须来自 armyCmdsOf');
    assert.equal(hit.kind, defs[i]!.kind);
    assert.equal(hit.canUse, canUseArmyCmd(world, 'A', i).ok);
  }
  // 末两槽恒为 全軍待機 / 全軍突擊（原作 [0x4a8ae0] 的两个固定位）
  assert.equal(defs[4]!.label, '全軍待機');
  assert.equal(defs[5]!.label, '全軍突擊');
});

test('hitTest：面板内空白返回 armyMenu（吞掉，不落到战场）', () => {
  const world = makeWorld();
  const opts = fightOpts(4, { armyMenu: true });
  // 面板顶边到第一行之间那 3px 留白
  const x = ARMY_MENU_RECT.x + 40;
  const y = ARMY_MENU_RECT.y + 1;
  assert.equal(hitTest(world, opts, x, y)?.type, 'armyMenu');
});

test('hitTest：面板外点击 → 收起，且这一次点击继续走正常命中（战场）', () => {
  const world = makeWorld();
  const opts = fightOpts(4);
  setArmyMenuOpen(true);
  const hit = expectHit(hitTest(world, opts, 375, 500), 'field');
  assert.equal(armyMenuOpen(), false, '面板外点击应把子菜单收起');
  assert.ok(hit.gx >= 0 && hit.gy >= 0);
});

test('hitTest：收起子菜单后恢复战场命中（第二次点击仍是 field，不再被吞）', () => {
  const world = makeWorld();
  const opts = fightOpts(4);
  setArmyMenuOpen(true);
  hitTest(world, opts, 375, 500);
  assert.equal(armyMenuOpen(), false);
  assert.equal(hitTest(world, opts, 375, 500)?.type, 'field');
  // 技能格也照常可点（面板 x≥512，不压技能栏）
  const [sx, sy] = center(skillSlotRects(4)[0]!);
  assert.equal(hitTest(world, opts, sx, sy)?.type, 'skill');
});

test('hitTest：展开时点技能格 → 收起子菜单并命中 skill（不吞技能）', () => {
  const world = makeWorld();
  const opts = fightOpts(4);
  setArmyMenuOpen(true);
  const [sx, sy] = center(skillSlotRects(4)[0]!);
  const hit = expectHit(hitTest(world, opts, sx, sy), 'skill');
  assert.equal(hit.index, 0);
  assert.equal(armyMenuOpen(), false);
});

// ---------------------------------------------------------------------------
// 五、命中：旧类型回归（改名 / 改矩形都算回归）
// ---------------------------------------------------------------------------

test('hitTest：4 格与 8 格技能中心仍命中 skill（8 格两行逐格对齐）', () => {
  const world = makeWorld();
  const s8 = skills(8);
  for (let i = 0; i < 8; i += 1) {
    const [x, y] = center(skillSlotRects(8)[i]!);
    const hit = expectHit(hitTest(world, fightOpts(8), x, y), 'skill');
    assert.equal(hit.index, i);
    assert.equal(hit.seq, s8[i]!.seq);
  }
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = center(skillSlotRects(4)[i]!);
    assert.equal(expectHit(hitTest(world, fightOpts(4), x, y), 'skill').index, i);
  }
});

test('hitTest：3 格技能的幽灵第 4 格仍是 null（新命中区不许压 x410..498 / y1124..1212）', () => {
  const world = makeWorld();
  const ghost = skillSlotRect(3);
  const [x, y] = center(ghost);
  assert.equal(hitTest(world, fightOpts(3), x, y), null);
});

test('hitTest：突擊 / 撤退快捷钮中心仍是 assault / retreat（语义没改名）', () => {
  const world = makeWorld();
  const opts = fightOpts(4);
  const [ax, ay] = center(CHIP_ASSAULT);
  const [rx, ry] = center(CHIP_RETREAT);
  assert.equal(hitTest(world, opts, ax, ay)?.type, 'assault');
  assert.equal(hitTest(world, opts, rx, ry)?.type, 'retreat');
});

// ---------------------------------------------------------------------------
// 六、置灰：纯函数判定 + DrawCmd 颜色
// ---------------------------------------------------------------------------

test('置灰：world.over ⇒ 6 钮与 6 条子菜单全部不可用，reason 来自 canUseArmyCmd', () => {
  const world = makeWorld();
  world.over = true;
  for (let i = 0; i < 6; i += 1) {
    const use = cmd6Usable(world, i);
    assert.equal(use.ok, false, `第 ${i} 钮应置灰`);
    assert.equal(use.reason, '戰鬥已結束');
  }
  const items = armyMenuItems(world);
  assert.equal(items.length, 6);
  for (const it of items) {
    assert.equal(it.ok, false, `子菜单「${it.label}」应置灰`);
    assert.equal(it.reason, '戰鬥已結束');
  }
  const [x, y] = center(armyCmdRects()[0]!);
  const hit = expectHit(hitTest(world, fightOpts(4, { armyMenu: true }), x, y), 'armyCmd');
  assert.equal(hit.canUse, false);
  assert.equal(hit.reason, '戰鬥已結束');
});

test('置灰：armyMenuItems 的 ok / reason 与 canUseArmyCmd 逐条一致（不另立判定）', () => {
  const world = makeWorld();
  // 士兵清空：retreat 槽给「已無士兵」，其余槽先看 flags
  world.units = world.units.filter((u) => u.side !== 'A' || u.isGeneral);
  const items = armyMenuItems(world);
  for (let i = 0; i < 6; i += 1) {
    const chk = canUseArmyCmd(world, 'A', i);
    assert.equal(items[i]!.ok, chk.ok, `第 ${i} 条可用性与 core 不一致`);
    assert.equal(items[i]!.reason, chk.reason ?? null);
  }
  assert.ok(items.some((it) => !it.ok), '士兵清空后至少有一条该灰');
});

test('置灰：不可用行在 DrawCmd 里是 textFaint，可用行是 text（纯比对，不截图）', () => {
  const world = makeWorld();
  const opts = fightOpts(4, { armyMenu: true });
  // 只认面板内的文本（x ≥ 面板左边）：左侧突擊钮的小字也叫「全軍突擊」，不能混进来
  const pick = (cmds: ReturnType<typeof buildFrame>, label: string): TextCmd | undefined =>
    texts(cmds).find(
      (t) =>
        t.text === label &&
        t.x >= ARMY_MENU_RECT.x &&
        t.y >= ARMY_MENU_RECT.y &&
        t.y <= ARMY_MENU_RECT.y + ARMY_MENU_RECT.h,
    );

  const items = armyMenuItems(world);
  const live = pick(buildFrame(world, opts), items[0]!.label);
  assert.ok(live, '子菜单第一行没画出来');
  assert.equal(live!.color, items[0]!.ok ? COLORS.text : COLORS.textFaint);

  world.over = true;
  const greyed = pick(buildFrame(world, opts), items[0]!.label);
  assert.ok(greyed, '结束态的子菜单第一行没画出来');
  assert.equal(greyed!.color, COLORS.textFaint, '不可用的行必须置灰');
});

test('绘制：子菜单收起时不画 6 条 label，展开时 6 条全在', () => {
  const world = makeWorld();
  const labels = armyMenuItems(world).map((it) => it.label);
  const inPanel = (cmds: ReturnType<typeof buildFrame>): string[] =>
    texts(cmds)
      .filter(
        (t) =>
          t.x >= ARMY_MENU_RECT.x &&
          t.y >= ARMY_MENU_RECT.y &&
          t.y <= ARMY_MENU_RECT.y + ARMY_MENU_RECT.h,
      )
      .map((t) => t.text);

  const closed = inPanel(buildFrame(world, fightOpts(4, { armyMenu: false })));
  for (const label of labels) assert.ok(!closed.includes(label), `收起时不该画「${label}」`);

  const open = inPanel(buildFrame(world, fightOpts(4, { armyMenu: true })));
  for (const label of labels) assert.ok(open.includes(label), `展开时缺「${label}」`);
});

test('绘制：6 大按钮的正题都在控制台里画出来了（贴原作文案）', () => {
  const world = makeWorld();
  const cmds = buildFrame(world, fightOpts(4, { armyMenu: false }));
  const consoleTexts = texts(cmds).filter((t) => t.y >= CONSOLE_TOP);
  const labels = cmd6Defs(world).map((d) => d.label);
  for (const label of labels) {
    assert.ok(consoleTexts.some((t) => t.text === label), `控制台没画「${label}」`);
  }
  // 键位与提示行
  for (const key of ['A', 'S', 'D', 'F', 'G', 'H']) {
    assert.ok(consoleTexts.some((t) => t.text === key), `缺键位提示 ${key}`);
  }
  assert.ok(consoleTexts.some((t) => t.text === '1-8 · A-H · R'), '提示行的键位说明没更新');
});

// ---------------------------------------------------------------------------
// 七、文案与状态：原作 6 大按钮
// ---------------------------------------------------------------------------

test('文案：6 钮顺序与键位照抄原作（A/S/D/F/G/H）', () => {
  const defs = cmd6Defs(makeWorld());
  assert.equal(defs.length, 6);
  assert.deepEqual(
    defs.map((d) => d.key),
    ['A', 'S', 'D', 'F', 'G', 'H'],
  );
  assert.deepEqual(
    defs.map((d) => d.label),
    ['保護主將', '部隊指令', '武將技', '武將出擊', '主將後退', '全軍撤退'],
  );
  assert.deepEqual(
    defs.map((d) => d.kind),
    ['guardLord', 'armyMenu', 'skillPage', 'sortie', 'lordOrder', 'retreat'],
  );
});

test('状态：下过主將後退之后第 5 颗翻成「主將待機」，再下待機又翻回来', () => {
  const world = makeWorld();
  assert.equal(cmd6Defs(world)[4]!.label, '主將後退');
  assert.equal(applyArmyCmdKind(world, 'A', 'lordBack'), true);
  assert.equal((armyOrderOf(world, 'A').buttons & ARMY_BTN.lordOrder) !== 0, true);
  assert.equal(cmd6Defs(world)[4]!.label, '主將待機');
  assert.equal(applyArmyCmdKind(world, 'A', 'lordWait'), true);
  assert.equal(cmd6Defs(world)[4]!.label, '主將後退');
});

test('状态：下过保護主將之后第 1 颗置灰（buttons 位已置）', () => {
  const world = makeWorld();
  assert.equal(cmd6Usable(world, 0).ok, true);
  assert.equal(applyArmyCmdKind(world, 'A', 'guardLord'), true);
  assert.equal((armyOrderOf(world, 'A').buttons & ARMY_BTN.guardLord) !== 0, true);
  const use = cmd6Usable(world, 0);
  assert.equal(use.ok, false);
  assert.equal(use.reason, '已下令護衛');
  const [x, y] = center(cmd6Rects()[0]!);
  const hit = expectHit(hitTest(world, fightOpts(4), x, y), 'cmd6');
  assert.equal(hit.canUse, false);
});

test('状态：结束态（settled）6 钮全灰，且 ready 态命中仍只给 start', () => {
  const world = makeWorld();
  for (let i = 0; i < 6; i += 1) {
    assert.equal(cmd6Usable(world, i, { mode: 'settled' }).ok, false);
    assert.equal(cmd6Usable(world, i, { mode: 'ready' }).ok, false);
  }
  const [x, y] = center(cmd6Rects()[0]!);
  assert.equal(hitTest(world, { mode: 'ready', skills: skills(4) }, x, y), null);
});
