/**
 * 士兵造型图集（`web/anim/units.json` + `units_00.png`）自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/soldiers.test.ts
 *
 * 这一轮把士兵从「AI 画的弓兵 17 帧」换成**原作 `SHAPE\FORCE` 造型**（project/63）：
 * 13 个兵种全部接上，我方用 `M`（藍軍）帧、敌方用 `N`（紅軍）换色帧 —— 原作本身不做镜像，
 * 敌我差别只是调色板（project/63 §1 已逐帧证 alpha 掩码同形）。
 *
 * 这里钉的是「数据契约 + 对齐口径」，不重新测 `pickUnitFrames` 的逻辑（那是 units.test.ts）：
 *  1) 13 个兵种每个都有组、都选得出帧，帧数 = 原作 Walk 12 / Attack 10；
 *  2) 组里每个帧名都能在 `pages[0].sprites` 找到矩形，矩形不越界；
 *  3) 对齐：所有帧画布宽相同（battleView 按帧画布宽 1:1 落屏，宽不同就会跳大小），
 *     脚线永远在底边上方 `skirt` 像素（底边中点 = 地面点 = `fy + 26`）；
 *  4) 单页、帧名唯一、PNG 真实尺寸 == page 尺寸（PNG 和 JSON 必须同代）；
 *  5) 降级：找不到组 / 没图集 / 兵种号非法 → 返回 null，不抛错。
 *
 * 刻意读**真的** units.json：素材改名 / 少帧 / 换页宽时测试直接红，不用等截图。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import { camera, createWorld, step } from '../src/core/battle.ts';
import type { Unit, World } from '../src/core/battle.ts';
import { engage } from './_engage.ts';
import { buildFrame } from '../src/view/battleView.ts';
import { rowScale } from '../src/view/projection.ts';
import {
  ARCHER_GROUP,
  UNIT_HOLD,
  pickUnitFrames,
  type UnitFrameRect,
  type UnitsAtlas,
} from '../src/view/unitFrames.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const IMG = { tag: 'units' } as unknown as CanvasImageSource;
const IMG_ENEMY = { tag: 'units-enemy' } as unknown as CanvasImageSource;

/** 原作步兵 shape 名（`MAA10002`）第 2 位；`data/troops.json` 的 names 下标 0–12 依次对应 */
const LETTERS = ['A', 'C', 'D', 'F', 'I', 'H', 'J', 'K', 'E', 'L', 'M', 'B', 'G'] as const;
/** 组名（units.json 的 groups.<name>），弓兵为兼容旧图集沿用 `archer` */
const GROUPS = ['podao', 'changqiang', 'dadao', ARCHER_GROUP, 'lianchui', 'feidao',
  'wudou', 'manzu', 'tiechui', 'tengjia', 'huangjin', 'nu', 'nvbing'] as const;

/** 原作 FORCE 每个兵种的动作帧数（project/63 §1，13 兵种一致） */
const SRC_WALK = 12;
const SRC_ATTACK = 10;

interface Sprite {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface RawUnits {
  meta: Record<string, unknown>;
  pages: { file: string; w: number; h: number; sprites: Sprite[] }[];
  groups: Record<string, Record<string, unknown>>;
}

function readUnitsJson(): RawUnits {
  return JSON.parse(readFileSync(new URL('../web/anim/units.json', import.meta.url), 'utf8')) as RawUnits;
}

/** 把真的 units.json 变成 main.js loadUnits() 会产出的那坨东西 */
function realAtlas(): UnitsAtlas {
  const j = readUnitsJson();
  const frames: Record<string, UnitFrameRect> = {};
  for (const sp of j.pages[0]!.sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
  return { img: IMG, imgEnemy: IMG_ENEMY, frames, groups: j.groups as unknown as UnitsAtlas['groups'] };
}

function world(troopA: number, troopB: number, soldiers = 6): World {
  return createWorld({ data, seed: 7, a: { troop: troopA, soldiers }, b: { troop: troopB, soldiers } });
}

function firstSoldier(w: World, side: 'A' | 'B'): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral !== true);
  assert.ok(u, `${side} 側沒有士兵`);
  return u;
}

/**
 * 跑到两军接触为止。开局两侧还隔着半个战场，镜头只框得住一半，
 * 要验「同屏两种图源」必须先让它们走到一起（seed 固定，tick 可复现）。
 */
function engaged(troopA: number, troopB: number, soldiers = 6): World {
  const w = engage(world(troopA, troopB, soldiers));
  for (let i = 0; i < 900 && w.stats.attacksA === 0 && w.stats.attacksB === 0; i += 1) step(w);
  assert.ok(w.stats.attacksA > 0 || w.stats.attacksB > 0, '兩軍應該在 900 tick 內接觸');
  return w;
}

/** 取某兵种的组（直接读 JSON，绕开运行时接口，才能查「数据本身」） */
function groupOf(troop: number): Record<string, unknown> {
  const g = readUnitsJson().groups[GROUPS[troop]!];
  assert.ok(g, `兵种 ${troop}（${LETTERS[troop]}）缺少组 ${GROUPS[troop]}`);
  return g;
}

function names(g: Record<string, unknown>, key: string): string[] {
  const v = g[key];
  assert.ok(Array.isArray(v), `组 ${String(g.letter)} 缺少 ${key}`);
  return v as string[];
}

/** 读 PNG 的 IHDR（宽高），不装任何图像库 */
function pngSize(path: URL): { w: number; h: number } {
  const b = readFileSync(path).subarray(0, 33);
  assert.equal(b.readUInt32BE(0), 0x89504e47, 'PNG 签名不对');
  assert.equal(b.toString('ascii', 12, 16), 'IHDR', '第一个 chunk 应该是 IHDR');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
// 1) 13 兵种覆盖：每个兵种都能选出帧（这是本轮的核心交付）
// ---------------------------------------------------------------------------

test('13 個兵種全部接上：每個兵種兩側都選得出走路幀', () => {
  const units = realAtlas();
  for (let troop = 0; troop < 13; troop += 1) {
    const w = world(troop, troop);
    for (const side of ['A', 'B'] as const) {
      const pick = pickUnitFrames(w, firstSoldier(w, side), { units });
      assert.ok(pick, `兵種 ${troop}（${LETTERS[troop]}）${side} 側選不出幀`);
      assert.ok(pick.frames.length > 0);
      assert.ok(pick.attack.length > 0, `兵種 ${troop} 應該有攻擊幀`);
    }
  }
});

test('每個兵種的組都有 back/front/attack/attackEnemy，幀數 = 原作 12 走 / 10 攻', () => {
  assert.equal(GROUPS.length, 13);
  for (let troop = 0; troop < 13; troop += 1) {
    const g = groupOf(troop);
    assert.equal(g.letter, LETTERS[troop], `兵種 ${troop} 的原作字母`);
    assert.equal(g.troop, troop, '组里记的兵种号要和自己对得上');
    for (const key of ['back', 'front', 'attack', 'attackEnemy']) {
      const want = key === 'back' || key === 'front' ? SRC_WALK : SRC_ATTACK;
      assert.equal(names(g, key).length, want, `兵種 ${troop} 的 ${key} 幀數`);
    }
    assert.equal(g.hold, 4, '每帧停留 tick（12 帧 × 4 = 48 tick 一个循环）');
  }
});

test('我方用 M（藍軍）帧、敵方用 N（紅軍）帧，兩側幀名不重合', () => {
  for (let troop = 0; troop < 13; troop += 1) {
    const g = groupOf(troop);
    const back = names(g, 'back');
    const front = names(g, 'front');
    assert.equal(back.length, front.length);
    for (let i = 0; i < back.length; i += 1) {
      assert.match(back[i]!, new RegExp(`^${GROUPS[troop]}_walk_\\d\\d$`));
      assert.match(front[i]!, new RegExp(`^${GROUPS[troop]}_ewalk_\\d\\d$`), '敌方帧要带 e 段（N 调色板）');
      assert.notEqual(back[i], front[i]);
    }
    for (const n of names(g, 'attack')) assert.match(n, /_atk_\d\d$/);
    for (const n of names(g, 'attackEnemy')) assert.match(n, /_eatk_\d\d$/);
  }
});

test('兵種號 → 組：每個兵種用自己的組（弓箭 F 與 弩 B 不再共用 archer）', () => {
  const units = realAtlas();
  for (let troop = 0; troop < 13; troop += 1) {
    const w = world(troop, troop);
    const pick = pickUnitFrames(w, firstSoldier(w, 'A'), { units })!;
    assert.match(pick.frames[0]!, new RegExp(`^${GROUPS[troop]}_walk_`), `兵種 ${troop} 該用 ${GROUPS[troop]} 組`);
  }
  // 弓（3）与弩（11）是两套不同造型：原作 F 是弓箭兵、B 是弩兵
  assert.notEqual(GROUPS[3], GROUPS[11]);
});

// ---------------------------------------------------------------------------
// 2) 帧表完整性：帧名都能解析、矩形不越界
// ---------------------------------------------------------------------------

test('組裡每個幀名都能在 pages[0].sprites 找到矩形（沒有懸空幀名）', () => {
  const j = readUnitsJson();
  const have = new Set(j.pages[0]!.sprites.map((s) => s.name));
  for (let troop = 0; troop < 13; troop += 1) {
    const g = groupOf(troop);
    for (const key of ['back', 'front', 'attack', 'attackEnemy']) {
      for (const n of names(g, key)) assert.ok(have.has(n), `帧名 ${n} 不在图集里`);
    }
  }
});

test('所有矩形都在圖集內（不越界、不留 0 寬高）', () => {
  const j = readUnitsJson();
  const page = j.pages[0]!;
  for (const s of page.sprites) {
    assert.ok(s.w > 0 && s.h > 0, `${s.name} 寬高非法`);
    assert.ok(s.x >= 0 && s.y >= 0, `${s.name} 负坐标`);
    assert.ok(s.x + s.w <= page.w, `${s.name} 右边越界`);
    assert.ok(s.y + s.h <= page.h, `${s.name} 下边越界`);
  }
});

test('幀名唯一、meta.count 與 sprite 數一致', () => {
  const j = readUnitsJson();
  const seen = new Set<string>();
  for (const s of j.pages[0]!.sprites) {
    assert.ok(!seen.has(s.name), `帧名重复：${s.name}`);
    seen.add(s.name);
  }
  assert.equal(j.meta.count, j.pages[0]!.sprites.length);
});

// ---------------------------------------------------------------------------
// 3) 对齐口径：battleView 按帧画布宽 1:1 落屏（project/189 之前是固定 w=66）、底边中点 = 地面点
// ---------------------------------------------------------------------------

test('同一兵種所有幀畫布寬相同（battleView 按畫布寬 1:1 落屏，寬不同就會跳大小）', () => {
  const j = readUnitsJson();
  const canvasW = j.meta.canvas_w as number;
  assert.ok(canvasW > 0, 'meta.canvas_w 必須存在');
  for (const s of j.pages[0]!.sprites) assert.equal(s.w, canvasW, `${s.name} 畫布寬 ≠ ${canvasW}`);
});

test('腳線永遠在畫布底邊上方 skirt 像素（底邊中點 = 地面點 = fy + 26）', () => {
  const j = readUnitsJson();
  const skirt = j.meta.skirt as number;
  assert.ok(skirt >= 1, 'meta.skirt 必須 ≥ 1（旧图集是 4/104，脚线不在底边）');
  for (const s of j.pages[0]!.sprites) {
    assert.ok(s.h > skirt, `${s.name} 画布高 ${s.h} 放不下 skirt ${skirt}`);
  }
  // 屏幕像素：高 = 画布宽(75) × h/w，画布宽就是屏幕宽（project/189 起不再按 66 缩）
  const canvasW = j.meta.canvas_w as number;
  for (const s of j.pages[0]!.sprites) {
    const screenH = (canvasW * s.h) / s.w;
    assert.ok(screenH > 30 && screenH < 140, `${s.name} 屏幕上高 ${screenH.toFixed(1)}px 不合理`);
  }
});

test('畫布寬 = 原作用窗口寬 × 縮放 k（meta 自洽，換參數時能一眼看出）', () => {
  const meta = readUnitsJson().meta;
  const k = meta.frame_scale_k as number;
  const rawW = meta.frame_raw_w as number | undefined;
  assert.ok(k > 0 && k <= 1, 'frame_scale_k 應在 (0,1]');
  assert.equal(meta.canvas_w, Math.round((rawW ?? 100) * k));
  assert.equal(meta.skirt, Math.round(4 * k), 'skirt = 4px（旧图集口径）× k');
});

// [189] 屏幕宽度口径：以前 battleView 写死 66（老图集 80 宽画布时代的口径），
// 13 个兵种的 FORCE 帧画布是 75，66/75 = 0.88 就多了一道重采样（糊）而且比原作小。
// 现在由 pickUnitFrames 把「帧画布宽」带出来，battleView 1:1 落屏。
test('選出來的幀自帶畫布寬（battleView 按它 1:1 落屏，不再按 66 縮）', () => {
  const canvasW = readUnitsJson().meta.canvas_w as number;
  const units = realAtlas();
  for (let troop = 0; troop < 13; troop += 1) {
    const w = world(troop, troop);
    for (const side of ['A', 'B'] as const) {
      const pick = pickUnitFrames(w, firstSoldier(w, side), { units })!;
      assert.equal(pick.w, canvasW, `兵種 ${troop}（${LETTERS[troop]}）${side} 側的屏幕寬 ≠ 畫布寬 ${canvasW}`);
    }
  }
  // 幀表缺失時照舊返回 null（調用方降級），不會帶出 w=0 的半成品
  const w0 = world(2, 2);
  assert.equal(pickUnitFrames(w0, firstSoldier(w0, 'A'), { units: { ...units, frames: {} } }), null);
});

// ---------------------------------------------------------------------------
// 4) 单页 + PNG 与 JSON 同代
// ---------------------------------------------------------------------------

test('圖集只有一頁、檔名固定 units_00.png（main.js 的 loadUnits 寫死了）', () => {
  const j = readUnitsJson();
  assert.equal(j.pages.length, 1, 'main.js 只讀 pages[0]');
  assert.equal(j.pages[0]!.file, 'units_00.png');
  assert.deepEqual(j.meta.page_size, [j.pages[0]!.w, j.pages[0]!.h]);
});

test('PNG 真實尺寸 == JSON 頁面尺寸（換圖集時 JSON 和 PNG 必須一起換）', () => {
  const j = readUnitsJson();
  const size = pngSize(new URL('../web/anim/units_00.png', import.meta.url));
  assert.equal(size.w, j.pages[0]!.w);
  assert.equal(size.h, j.pages[0]!.h);
});

// ---------------------------------------------------------------------------
// 5) 降级：任何缺失都返回 null，不抛错
// ---------------------------------------------------------------------------

test('找不到組 / 沒圖集 / 兵種號非法 → null（退回 atlas.json 再退色塊）', () => {
  const units = realAtlas();
  const w = world(2, 2);
  const a = firstSoldier(w, 'A');
  assert.equal(pickUnitFrames(w, a, {}), null, '沒有 opts');
  assert.equal(pickUnitFrames(w, a, { units: null }), null, '圖集沒載入');
  assert.equal(pickUnitFrames(w, a, { units: { ...units, groups: {} } }), null, '組缺失');
  assert.equal(pickUnitFrames(w, a, { units: { ...units, frames: {} } }), null, '幀表缺失');
  assert.equal(pickUnitFrames(null, null), null);
  for (const troop of [13, 99, -1, 1.5]) {
    (w.sides.A as { troop: number }).troop = troop;
    assert.equal(pickUnitFrames(w, a, { units }), null, `兵種 ${troop} 該退回降級`);
  }
});

test('組存在但幀名全失效 / hold 非法 → 幀過濾、hold 退回 UNIT_HOLD', () => {
  const units = realAtlas();
  const w = world(3, 3);
  const a = firstSoldier(w, 'A');
  const archer = readUnitsJson().groups[ARCHER_GROUP]!;
  const broken = { ...archer, back: ['不存在的幀'], front: ['也不存在'] };
  assert.equal(pickUnitFrames(w, a, { units: { ...units, groups: { [ARCHER_GROUP]: broken } } }), null);
  const half = { ...archer, back: [names(archer, 'back')[0]!, '不存在的幀'], hold: 0 };
  const pick = pickUnitFrames(w, a, { units: { ...units, groups: { [ARCHER_GROUP]: half } } })!;
  assert.equal(pick.frames.length, 1, '坏帧名要被过滤掉');
  assert.equal(pick.hold, UNIT_HOLD, 'hold 非法时退回 UNIT_HOLD');
});

// ---------------------------------------------------------------------------
// 6) 接缝：buildFrame 真的把 13 个兵种画成 sprite
// ---------------------------------------------------------------------------

test('buildFrame：13 個兵種都能畫出 units sprite，且幀屬於自己的組', () => {
  const units = realAtlas();
  const canvasW = readUnitsJson().meta.canvas_w as number;
  for (let troop = 0; troop < 13; troop += 1) {
    const w = engaged(troop, troop);
    const cmds = buildFrame(w, { units }).filter((c) => c.kind === 'sprite') as unknown as
      { img: unknown; sx: number; sy: number; sw: number; sh: number; w: number }[];
    assert.ok(cmds.length > 0, `兵種 ${troop} 沒有畫出 sprite`);
    const named = cmds.map((c) => {
      for (const [n, f] of Object.entries(units.frames)) {
        if (f.x === c.sx && f.y === c.sy && f.w === c.sw && f.h === c.sh) return n;
      }
      return '';
    });
    assert.ok(named.some((n) => n.startsWith(`${GROUPS[troop]}_`)), `兵種 ${troop} 的 sprite 幀不屬於 ${GROUPS[troop]}`);
    // R193：落屏改成**透视投影**后，屏幕上占的寬度 = 幀畫布寬 × 該行的透視縮放
    // （遠排 ≈0.74×、近排 ≈1.18×），所以「恆等於 canvasW（1:1 落屏）」只在鏡頭所在那一行成立——
    // 舊斷言是常數投影時代的產物，必須改。新斷言反而更嚴：寬/畫布寬 必須**精確等於某一可見行的
    // rowScale**，即縮放只能來自透視表，不許被別的常數（如 66）偷偷縮過。
    const camX = camera(w);
    // camX 是小数（core 的 camera() 跟前锋走），所以缩放表要按**每个单位自己的行**取，
    // 不能只采整数行。
    const rowScales = new Set<number>();
    for (const u of w.units) rowScales.add(Number(rowScale(u.x - camX).toFixed(6)));
    for (const c of cmds) {
      const s = Number((c.w / canvasW).toFixed(6));
      assert.ok(
        rowScales.has(s),
        `兵種 ${troop} 的 sprite 寬 ${c.w} ≠ 畫布寬 ${canvasW} × 任一單位所在行的透視縮放（${s}）`,
      );
    }
    assert.ok(cmds.some((c) => c.img === IMG), '我方（A）用原圖');
    assert.ok(cmds.some((c) => c.img === IMG_ENEMY), '敵方（B）用染色圖源');
  }
});
