/**
 * 兵種動作圖集（`web/anim/units.json` + `units_00.png`）選套自檢。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/units.test.ts
 *
 * 釘四件事（其餘靠 work/verify_units.mjs 的無頭截圖驗）：
 *  1) 兵種 → 組的映射：3 弓箭 / 11 弩兵 → `archer`，其它兵種 → null（照舊走 atlas.json）；
 *     騎乘（`ride`）這一輪不接，任何兵種都不許拿到 `ride_*` 幀。
 *  2) 側向：A 用 `back` + 原圖，B 用 `front` + 染色圖源；攻擊幀 B 用 `attackEnemy ?? attack`。
 *  3) 降級：圖集沒載入 / 組缺失 / 幀半成品 一律 null（不拋錯），`buildFrame` 不會炸。
 *  4) 弓兵不讓 `animSelect` 的朴刀 `attack_back` 搶走攻擊窗口（受擊 / 陣亡仍走動作幀）。
 *
 * 這裡刻意讀**真的** units.json：素材改名 / 少幀時測試直接紅，不用等截圖。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import { createWorld, step } from '../src/core/battle.ts';
import type { Unit, World } from '../src/core/battle.ts';
import { engage } from './_engage.ts';
import { buildFrame } from '../src/view/battleView.ts';
import { actionAtlas } from '../src/view/animSelect.ts';
import {
  ARCHER_GROUP,
  UNIT_HOLD,
  pickUnitFrames,
  type UnitFrameRect,
  type UnitsAtlas,
} from '../src/view/unitFrames.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 假圖源：純資料層測試不需要真的 Image，只要物件身份能區分兩側就行。 */
const IMG = { tag: 'units' } as unknown as CanvasImageSource;
const IMG_ENEMY = { tag: 'units-enemy' } as unknown as CanvasImageSource;
const ACTION_IMG = { tag: 'actions' } as unknown as CanvasImageSource;

const TROOP_BOW = 3;
const TROOP_CROSSBOW = 11;
const TROOP_BLADE = 2;

interface RawUnits {
  pages: { sprites: { name: string; x: number; y: number; w: number; h: number }[] }[];
  groups: Record<string, unknown>;
}

function readUnitsJson(): RawUnits {
  return JSON.parse(readFileSync(new URL('../web/anim/units.json', import.meta.url), 'utf8')) as RawUnits;
}

/** 把真的 units.json 變成 main.js loadUnits() 會產出的那坨東西 */
function realAtlas(): UnitsAtlas {
  const j = readUnitsJson();
  const frames: Record<string, UnitFrameRect> = {};
  for (const sp of j.pages[0]!.sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
  return { img: IMG, imgEnemy: IMG_ENEMY, frames, groups: j.groups as UnitsAtlas['groups'] };
}

/** 合成圖集：走路幀和攻擊幀刻意取不同名字，才能分辨「現在播的是哪一套」 */
function synthAtlas(group: Record<string, unknown>): UnitsAtlas {
  const frames: Record<string, UnitFrameRect> = {};
  for (let i = 0; i < 4; i += 1) frames[`w${i}`] = { x: i * 80, y: 0, w: 80, h: 104 };
  for (let i = 0; i < 2; i += 1) frames[`a${i}`] = { x: i * 80, y: 104, w: 80, h: 104 };
  for (let i = 0; i < 3; i += 1) frames[`f${i}`] = { x: i * 80, y: 208, w: 80, h: 104 };
  return { img: IMG, imgEnemy: IMG_ENEMY, frames, groups: { [ARCHER_GROUP]: group } };
}

function world(troopA: number, troopB: number, soldiers = 8): World {
  return createWorld({ data, seed: 7, a: { troop: troopA, soldiers }, b: { troop: troopB, soldiers } });
}

/**
 * 跑到兩軍接觸為止。開局兩側還隔著半個戰場，鏡頭只框得住一半，
 * 要驗「同屏兩種圖源」必須先讓它們走到一起（seed 固定，tick 可複現）。
 */
function engaged(troopA: number, troopB: number, soldiers = 8): World {
  const w = engage(world(troopA, troopB, soldiers));
  for (let i = 0; i < 900 && w.stats.attacksA === 0 && w.stats.attacksB === 0; i += 1) step(w);
  assert.ok(w.stats.attacksA > 0 || w.stats.attacksB > 0, '兩軍應該在 900 tick 內接觸');
  return w;
}

function firstSoldier(w: World, side: 'A' | 'B'): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral !== true);
  assert.ok(u, `${side} 側沒有士兵`);
  return u;
}

function spriteCmds(w: World, units: UnitsAtlas | null): { img: unknown; sx: number; sy: number; sw: number; sh: number }[] {
  return buildFrame(w, { units })
    .filter((c) => c.kind === 'sprite')
    .map((c) => c as unknown as { img: unknown; sx: number; sy: number; sw: number; sh: number });
}

/** 圖集矩形 → sprite 名（驗「畫的是哪一組幀」用） */
function nameOfRect(atlas: UnitsAtlas, cmd: { sx: number; sy: number; sw: number; sh: number }): string | null {
  for (const [name, f] of Object.entries(atlas.frames)) {
    if (f.x === cmd.sx && f.y === cmd.sy && f.w === cmd.sw && f.h === cmd.sh) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1) 兵種 → 組
// ---------------------------------------------------------------------------

test('兵種 3（弓箭）：A 用 archer.back + 原圖，B 用 archer.front + 染色圖源', () => {
  const units = realAtlas();
  const w = world(TROOP_BOW, TROOP_BOW);
  const a = pickUnitFrames(w, firstSoldier(w, 'A'), { units });
  const b = pickUnitFrames(w, firstSoldier(w, 'B'), { units });
  assert.ok(a && b);
  // 原作 F（弓箭兵）Walk 12 帧；我方走 M（藍軍）帧、敵方走 N（紅軍）帧（project/63 §1）
  assert.equal(a.frames.length, 12);
  assert.equal(b.frames.length, 12);
  assert.ok(a.frames.every((n) => n.startsWith('archer_walk_')), 'A 必須是 M 幀');
  assert.ok(b.frames.every((n) => n.startsWith('archer_ewalk_')), 'B 必須是 N 幀');
  assert.equal(a.img, IMG);
  assert.equal(b.img, IMG_ENEMY);
  // 12 帧 × hold 4 = 48 tick 一个走路循环（旧图集是 17 帧 × 5）
  assert.equal(a.hold, 4);
  assert.equal(b.hold, 4);
});

test('攻擊幀：A 用 attack，B 用 attackEnemy（我方不許拿背視幀去打敵人）', () => {
  const units = realAtlas();
  const w = world(TROOP_BOW, TROOP_BOW);
  const a = pickUnitFrames(w, firstSoldier(w, 'A'), { units })!;
  const b = pickUnitFrames(w, firstSoldier(w, 'B'), { units })!;
  assert.equal(a.attack.length, 10, '原作 Attack 10 帧');
  assert.equal(b.attack.length, 10);
  assert.ok(a.attack.every((n) => n.startsWith('archer_atk_')));
  assert.ok(b.attack.every((n) => n.startsWith('archer_eatk_')));
});

test('兵種 11（弩兵）改用 nu 組（原作 B），不再和弓箭共用 archer', () => {
  const units = realAtlas();
  const w = world(TROOP_CROSSBOW, TROOP_CROSSBOW);
  const a = pickUnitFrames(w, firstSoldier(w, 'A'), { units })!;
  const b = pickUnitFrames(w, firstSoldier(w, 'B'), { units })!;
  assert.ok(a.frames.every((n) => n.startsWith('nu_walk_')));
  assert.ok(b.frames.every((n) => n.startsWith('nu_ewalk_')));
});

test('13 個兵種全部接圖集（本輪起不再有「其它兵種一律 null」）', () => {
  const units = realAtlas();
  const w = world(TROOP_BLADE, TROOP_BLADE);
  // data/troops.json 的 names 下标 0–12 → 原作兵符字母 A/C/D/F/I/H/J/K/E/L/M/B/G
  const GROUPS = ['podao', 'changqiang', 'dadao', 'archer', 'lianchui', 'feidao',
    'wudou', 'manzu', 'tiechui', 'tengjia', 'huangjin', 'nu', 'nvbing'];
  for (let troop = 0; troop <= 12; troop += 1) {
    w.sides.A.troop = troop;
    const pick = pickUnitFrames(w, firstSoldier(w, 'A'), { units });
    assert.ok(pick, `兵種 ${troop} 應該接 ${GROUPS[troop]}`);
    assert.ok(pick.frames.every((n) => n.startsWith(`${GROUPS[troop]}_walk_`)), `兵種 ${troop} 用了別人的幀`);
  }
  // 兵种号超出 0–12 → 仍然 null（照舊退回 atlas.json 的 walk_back / walk_front）
  w.sides.A.troop = 13;
  assert.equal(pickUnitFrames(w, firstSoldier(w, 'A'), { units }), null);
});

test('騎乘這一輪不接：任何兵種都拿不到 ride_* 幀', () => {
  const units = realAtlas();
  const w = world(TROOP_BOW, TROOP_BOW);
  for (let troop = 0; troop <= 12; troop += 1) {
    w.sides.A.troop = troop;
    const pick = pickUnitFrames(w, firstSoldier(w, 'A'), { units });
    if (!pick) continue;
    assert.ok(![...pick.frames, ...pick.attack].some((n) => n.startsWith('ride_')), 'ride 這輪不接');
  }
});

// ---------------------------------------------------------------------------
// 2) 幀表 / hold 容錯
// ---------------------------------------------------------------------------

test('attackEnemy 缺失時退回 attack', () => {
  const units = synthAtlas({ back: ['w0', 'w1'], front: ['f0', 'f1'], attack: ['a0', 'a1'], hold: 3 });
  const w = world(TROOP_BOW, TROOP_BOW);
  const b = pickUnitFrames(w, firstSoldier(w, 'B'), { units })!;
  assert.deepEqual(b.attack, ['a0', 'a1']);
  assert.equal(b.hold, 3);
});

test('hold 非法 / 缺失 → 退回 UNIT_HOLD(5)', () => {
  for (const hold of [undefined, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, '5']) {
    const units = synthAtlas({ back: ['w0'], front: ['f0'], hold });
    const w = world(TROOP_BOW, TROOP_BOW);
    const a = pickUnitFrames(w, firstSoldier(w, 'A'), { units })!;
    assert.equal(a.hold, UNIT_HOLD, `hold=${String(hold)} 應退回 5`);
  }
});

test('幀名不在頁裡 → 過濾掉；走路幀全缺 → 返回 null（降級到 atlas.json）', () => {
  const units = realAtlas();
  const w = world(TROOP_BOW, TROOP_BOW);
  const a = firstSoldier(w, 'A');
  // 用真的帧名做前半，后半塞不存在的帧名（验证「过滤掉坏帧名」而不是「整组消失」）
  const real = units.groups[ARCHER_GROUP] as { back: string[]; front: string[] };
  const firstBack = real.back[0]!;
  const firstFront = real.front[0]!;
  units.groups = { archer: { back: [firstBack, '不存在的幀'], front: [firstFront], attack: ['也沒有'], hold: 5 } };
  const pick = pickUnitFrames(w, a, { units })!;
  assert.deepEqual(pick.frames, [firstBack]);
  assert.deepEqual(pick.attack, [], '攻擊幀全缺時是空數組 → 走路幀頂上');
  units.groups = { archer: { back: ['不存在的幀'], front: ['也不存在'], hold: 5 } };
  assert.equal(pickUnitFrames(w, a, { units }), null);
});

// ---------------------------------------------------------------------------
// 3) 降級：任何缺失都不許拋錯
// ---------------------------------------------------------------------------

test('圖集沒載入 / 圖未 onload / 組缺失 / 純數組組 → 一律 null，不拋錯', () => {
  const w = world(TROOP_BOW, TROOP_BOW);
  const a = firstSoldier(w, 'A');
  const units = realAtlas();
  assert.equal(pickUnitFrames(w, a, {}), null, '沒有 opts');
  assert.equal(pickUnitFrames(w, a, { units: null }), null, '沒載入');
  assert.equal(pickUnitFrames(w, a, { units: { ...units, img: null as unknown as CanvasImageSource } }), null, '圖未 onload');
  assert.equal(pickUnitFrames(w, a, { units: { ...units, groups: {} } }), null, '組缺失');
  // walk_side 這種純幀名數組不是「選套」組
  assert.equal(pickUnitFrames(w, a, { units: { ...units, groups: { archer: ['archer_back_f000'] as unknown as string[] } } }), null);
  // 幀表缺失
  assert.equal(pickUnitFrames(w, a, { units: { ...units, frames: {} } }), null);
  // 入參全空 / 怪值
  assert.equal(pickUnitFrames(null, null), null);
  assert.equal(pickUnitFrames(w, { side: 'C' } as unknown as Unit, { units }), null);
  assert.equal(pickUnitFrames({ sides: {} } as unknown as World, a, { units }), null);
});

// ---------------------------------------------------------------------------
// 4) 和 core 的接縫：兵種是「每側」的，但給單位自帶 troop 留了口子
// ---------------------------------------------------------------------------

test('兵種號讀側的 troop；單位自帶 troop 時優先（給「騎兵按單位帶兵種」留的口子）', () => {
  const units = realAtlas();
  const w = world(TROOP_BLADE, TROOP_BLADE);
  const bySide = pickUnitFrames(w, firstSoldier(w, 'A'), { units })!;
  assert.ok(bySide.frames.every((n) => n.startsWith('dadao_walk_')), '側的兵種號是大刀（2 → dadao）');
  const withTroop = { ...firstSoldier(w, 'A'), troop: TROOP_CROSSBOW } as Unit;
  const pick = pickUnitFrames(w, withTroop, { units })!;
  assert.ok(pick.frames.every((n) => n.startsWith('nu_walk_')), '單位自帶的 troop 應該蓋過側的兵種');
});

// ---------------------------------------------------------------------------
// 5) 大圖：buildFrame 真的把弓兵的 sprite 指令畫出來了
// ---------------------------------------------------------------------------

test('buildFrame：弓兵對弓兵 → 兩側都畫 units sprite，且 A 用 M 幀 / B 用 N 幀', () => {
  const units = realAtlas();
  const w = engaged(TROOP_BOW, TROOP_BOW);
  const cmds = spriteCmds(w, units);
  assert.ok(cmds.length > 0, '弓兵應該有 sprite 指令');
  const aCmds = cmds.filter((c) => c.img === IMG);
  const bCmds = cmds.filter((c) => c.img === IMG_ENEMY);
  assert.ok(aCmds.length > 0, 'A 側應該用原圖（M 幀）');
  assert.ok(bCmds.length > 0, 'B 側應該用染色圖源（N 幀）');
  for (const c of aCmds) assert.match(nameOfRect(units, c) ?? '', /^archer_(walk|atk)_/);
  for (const c of bCmds) assert.match(nameOfRect(units, c) ?? '', /^archer_e(walk|atk)_/);
});

test('buildFrame：大刀（本輪起也接圖集）→ 畫 dadao 組的 sprite，不再退回色塊', () => {
  const units = realAtlas();
  const w = engaged(TROOP_BLADE, TROOP_BLADE);
  const cmds = spriteCmds(w, units);
  assert.ok(cmds.length > 0, '大刀現在有自己的原作造型（project/63 §2），不該再退色塊');
  for (const c of cmds) assert.match(nameOfRect(units, c) ?? '', /^dadao_/);
});

test('buildFrame：13 個兵種都有自有攻擊幀 → 出手窗口不被 animSelect 的 attack_back 頂掉', () => {
  const units = realAtlas();
  const saved = { img: actionAtlas.img, frames: actionAtlas.frames };
  try {
    actionAtlas.img = ACTION_IMG as unknown as HTMLImageElement;
    actionAtlas.frames = {
      attack_back: [{ x: 0, y: 0, w: 80, h: 104 }],
      hit_back: [{ x: 0, y: 104, w: 80, h: 104 }],
      death_back: [{ x: 0, y: 208, w: 80, h: 104 }],
    };
    // 兵種 3（弓箭，舊圖集時代就有自有攻擊幀）與兵種 2（大刀，本輪新接）行為要一致
    for (const troop of [TROOP_BOW, TROOP_BLADE]) {
      const w = world(troop, troop);
      w.tick = 100;
      firstSoldier(w, 'A').lastAttackTick = 100; // 攻擊窗口內
      const cmds = spriteCmds(w, units);
      assert.ok(cmds.length > 0);
      assert.ok(cmds.every((c) => c.img !== ACTION_IMG),
        `兵種 ${troop} 有自己的攻擊幀，朴刀 attack_back 不許頂掉它`);
    }
  } finally {
    actionAtlas.img = saved.img;
    actionAtlas.frames = saved.frames;
  }
});
