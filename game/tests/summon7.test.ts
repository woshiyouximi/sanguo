/**
 * R171：補兵類七條武將技（seq 5/17/19/31/37/57/81）在真實戰鬥裏出兵的回归测试。
 *
 * 七條技的腳本鏈（`export/script/magic_so.dis.txt`）：
 *   `MagicN` → `CALL MoreSoldier(arg1=0, arg2=上限)`（或 `BackSoldier`）
 *   → `CALLS "ProduceSoldier"`（`func #51 @0x4EF4`）→ 逐格 `0x113` 查佔用 + `0x119` 造兵
 *   → 每兵 `CALLS "StepShow"`。
 *
 * 本輪修的三處（詳見 `project/171_補兵七條收口.md`）：
 *   1. `0x10C(camp)` 真語義 = **該方當前活兵數**（EXE handler `0x004204FE` → `0x43A795`，
 *      `cmp [ebp+8],0` 選 `[0x4A8ABC]`/`[0x4B03FC]` = A/B sideStruct+0x5C）；舊端口當句柄查，恆 0。
 *   2. `spawnSoldier` 的 camp 映射改成**絕對陣營**（0=A、1=B），舊實現按朝向翻，A 方補的兵全加到 B。
 *   3. `StepShow` 的 180 幀動畫不佔施法者時間線（原作裏 CALLS 是並行實例），
 *      否則 45 個兵要 8100 幀、撞 `MAX_SKILL_FRAMES=1200` 被截斷（實測只出 7 個）。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/summon7.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { cast, createWorld, QI_MAX, step, type Side, type World } from '../src/core/battle.ts';
import { runSkill } from '../src/core/smartscript/runtime.ts';
import { dispatchSyscall, type SyscallContext } from '../src/core/smartscript/syscalls.ts';
import type { Slot } from '../src/core/smartscript/vm.ts';

const data = loadData();

/** 七條補兵技：seq → 腳本號 → 單次上限（`MagicN` 裏 `PUSHI n; PUSHI 0; CALL MoreSoldier` 的 n）。 */
const SUMMON7: Array<{ seq: number; script: number; cap: number; name: string }> = [
  { seq: 5, script: 509, cap: 17, name: '伏兵組陣' },
  { seq: 17, script: 523, cap: 32, name: '伏兵排陣' },
  { seq: 19, script: 524, cap: 25, name: '後伏連兵' },
  { seq: 31, script: 533, cap: 35, name: '後伏兵陣' },
  { seq: 37, script: 541, cap: 45, name: '後伏軍陣' },
  { seq: 57, script: 565, cap: 25, name: '伏兵班陣' },
  { seq: 81, script: 584, cap: 42, name: '伏兵連陣' },
];

const aliveOf = (w: World, side: Side): number =>
  w.units.filter((u) => u.side === side && !u.isGeneral && u.alive).length;

const idsOf = (w: World, side: Side): Set<World['units'][number]> =>
  new Set(w.units.filter((u) => u.side === side && !u.isGeneral));

/** 本輪新出的小兵（不是原來的 20 個）。 */
const freshOf = (
  w: World,
  before: Set<World['units'][number]>,
  side: Side = 'A',
): World['units'] => w.units.filter((u) => u.side === side && !u.isGeneral && u.alive && !before.has(u));

/** A 方主將貼到 (24,6.5)，雙方各 20 兵，seed 固定、氣力氣滿（同 smartscript.test.ts 的 staged()）。 */
function staged(seed = 7, soldiers = 20): World {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: '甲', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: '乙', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(g);
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  // `cast()` 讀的是 side runtime 的主將（不是 `units` 裏那個 Unit），氣力/技力都在它身上。
  world.sides.A.general.qi = QI_MAX;
  return world;
}

/**
 * 走**真實戰鬥路徑**（`cast()` + 逐 tick）：`markSummon` 記賬在 `settleSkill()` 裏，
 * 只有這條路才會寫 `world.skillMarks`；`runSkill()` 直接跑腳本、不結算。
 */
function castSummon(seq: number, seed = 7, soldiers = 20) {
  const world = staged(seed, soldiers);
  const before = aliveOf(world, 'A');
  const beforeIds = idsOf(world, 'A');
  const marks0 = world.skillMarks.length;
  const r = cast(world, 'A', seq, 20, 6.5);
  for (let i = 0; i < 600 && world.sessions.length > 0; i++) step(world);
  const marks = world.skillMarks.slice(marks0);
  return {
    world,
    r,
    beforeIds,
    add: aliveOf(world, 'A') - before,
    markSummon: marks.reduce((n, m) => n + (m.summoned ?? 0), 0),
    misses: marks.filter((m) => m.miss).length,
  };
}

/** 同步跑一條補兵技（不動 tick ⇒ 新兵還停在落格上，適合量格子）。 */
function runSummon(seq: number, seed = 7, soldiers = 20) {
  const world = staged(seed, soldiers);
  const beforeIds = idsOf(world, 'A');
  const r = runSkill(world, 'A', SUMMON7.find((s) => s.seq === seq)!.script, 20, 6.5);
  return { world, r, beforeIds, fresh: freshOf(world, beforeIds) };
}

// ── 1. 逐條：七條技各一條 ─────────────────────────────────────────────

for (const { seq, name, cap } of SUMMON7) {
  test(`補兵 ${seq} ${name}：真實戰鬥裏加兵 ${cap} 個，markSummon 同值、無 MISS`, () => {
    const { r, add, markSummon, misses } = castSummon(seq);
    assert.equal(r.ok, true, `cast 應成功：${JSON.stringify(r)}`);
    assert.equal(add, cap, `應加 ${cap} 個兵（實際 ${add}）`);
    assert.equal(markSummon, cap, `world.skillMarks.summoned 應記 ${cap}（實際 ${markSummon}）`);
    assert.equal(misses, 0, '補兵技不該冒 MISS');
  });
}

// ── 2. 兵數上限：一次最多 cap 個，且兵是「補到上限」不是「憑空加」 ────────

test('補兵上限：一次施放最多 cap 個（`loc7 = min(maxHp*5 - 0x10C, arg2)`）', () => {
  for (const { seq, cap } of SUMMON7) {
    const { add } = castSummon(seq);
    assert.ok(add <= cap, `seq ${seq} 一次不該超過 ${cap}（實際 ${add}）`);
  }
});

test('補兵上限：已有兵越多、補得越少（0x10C 讀的是該方活兵數）', () => {
  // `maxHp*5 - 活兵數`：A 主將 maxHp≈101 ⇒ 上限 505，遠大於 arg2，所以 20 兵時補滿 cap。
  // 把 A 方先塞到 195 兵，200 上限就只剩 5 個位置。
  const { add } = castSummon(5, 7, 195);
  assert.equal(add, 5, `195 兵時只該補 5 個到 200（實際 ${add}）`);
});

// ── 3. 格子佔用：新兵不疊格、不越界 ───────────────────────────────────

test('格子佔用：新兵兩兩不同格、x∈[0,70]、y∈[0,13]', () => {
  const { fresh } = runSummon(37); // 45 個，最多的一條
  assert.equal(fresh.length, 45, `應有 45 個新兵（實際 ${fresh.length}）`);
  const cells = new Set<string>();
  for (const u of fresh) {
    const key = `${u.x},${u.y}`;
    assert.equal(cells.has(key), false, `格 ${key} 被兩個兵佔了`);
    cells.add(key);
  }
  assert.equal(cells.size, 45, '每個兵各佔一格');
  for (const u of fresh) {
    assert.ok(u.x >= 0 && u.x <= 70, `x 越界：${u.x}`);
    assert.ok(u.y >= 0 && u.y <= 13, `y 越界：${u.y}`);
  }
});

/**
 * 落點位置：`ProduceSoldier` 的 `L04F60` 是 `EQ(arg2,1); JNZ L04FA8`，
 * 即 **camp 0（A）走 `x = loc1`（左邊緣）、camp 1（B）走 `x = 70-loc1`（右邊緣）**。
 * 本端口的世界裏 A 方陣地在 x=50..53（B 在 15..20），所以 A 的伏兵出現在 x=0..3 —
 * 也就是「伏兵從敵後冒出來」，與七條技的名字（伏兵/後伏）自洽。
 * 這條釘住 x 只落在**一側邊緣**、且從中間行往外擴（loc2 起點 = loc7/2 = 7）。
 */
test('格子佔用：camp 0 從左邊緣起造（x=loc1），y 從 7.5 起向兩側展開', () => {
  const { fresh } = runSummon(37);
  const xs = [...new Set(fresh.map((u) => u.x))].sort((a, b) => a - b);
  assert.deepEqual(xs, [0.5, 1.5, 2.5, 3.5], `45 個兵應佔 4 列（實際 ${xs.join(',')}）`);
  const ys = fresh.slice(0, 4).map((u) => u.y);
  assert.deepEqual(ys, [7.5, 6.5, 5.5, 8.5], `前四個應從 loc2=7 起鏡像展開（實際 ${ys.join(',')}）`);
  assert.equal(Math.min(...fresh.map((u) => u.y)), 1.5, '最小行 y=1.5（loc1=0, loc2=1）');
  assert.equal(Math.max(...fresh.map((u) => u.y)), 12.5, '最大行 y=12.5（loc7-1-loc2）');
});

test('格子佔用：施放兩次，第二次不會把兵疊在第一次的格上', () => {
  const world = staged();
  const g = world.units.find((u) => u.isGeneral && u.side === 'A')!;
  runSkill(world, 'A', 509, 20, 6.5);
  g.x = 24;
  g.y = 6.5;
  world.sides.A.general.qi = QI_MAX;
  runSkill(world, 'A', 509, 20, 6.5);
  const mine = world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive);
  const keys = mine.map((u) => `${u.x},${u.y}`);
  assert.equal(new Set(keys).size, keys.length, `不該有兩個兵同格：${keys.join(' ')}`);
});

// ── 4. 一方 200 上限 ─────────────────────────────────────────────────

test('一方 200 上限：反覆施放也不會超過 200 個兵', () => {
  const world = staged(7, 190);
  const g = world.units.find((u) => u.isGeneral && u.side === 'A')!;
  for (let i = 0; i < 4; i++) {
    g.x = 24;
    g.y = 6.5;
    world.sides.A.general.qi = QI_MAX;
    runSkill(world, 'A', 509, 20, 6.5);
  }
  assert.ok(aliveOf(world, 'A') <= 200, `A 方兵數應 ≤ 200（實際 ${aliveOf(world, 'A')}）`);
});

// ── 5. 戰鬥流程（cast + step）：真正走 web 用的那條路 ─────────────────

test('戰鬥流程：cast() + 400 tick 之後兵還在、markSummon 已入賬', () => {
  const world = staged();
  const before = aliveOf(world, 'A');
  const r = cast(world, 'A', 5, 20, 6.5);
  assert.equal(r.ok, true, `cast 應成功：${JSON.stringify(r)}`);
  for (let i = 0; i < 400; i++) step(world);
  assert.equal(aliveOf(world, 'A') - before, 17, '400 tick 後應仍是 +17');
  const marks = world.skillMarks.filter((m) => (m.summoned ?? 0) > 0);
  assert.ok(marks.length > 0, '應有 summoned 標記');
  assert.equal(marks.reduce((n, m) => n + (m.summoned ?? 0), 0), 17, 'summoned 合計 17');
});

// ── 6. 陰性對照：0x312/0x314 的實參序 ────────────────────────────────

/**
 * 這一條是**負向對照**，釘住 R171 對 0x312/0x314 實參序的定論：
 *   - `0x314`：反序（`args[N-1]` 變 arg1）。依據是 `DemonDancing #149` → `LockTargetXY #16`
 *     的逐形參自洽（R163），以及 `0x420CAD`/`0x4653F0`/`0x467CE0` 的 push 順序（R171 復證）。
 *   - `0x312`：**保留正序**。R171 逐字节證明 `0x420C43` 與 `0x420CAD` 是同一個實現
 *     （同形、只差 8/10 個實參），但把 0x312 也翻成反序會讓 `tests/r87_waitfor.test.ts`
 *     的「WAITFOR 真的掛起」由綠轉紅（多幀技只跑 25 帧，期望幾十帧）——`旋龍 #136` 的
 *     0x312 子腳本 `TornadoMotion` 取不到物件句柄，WAITFOR 輪詢對象一直不出現。
 *     所以 312 的翻轉**未落地**，這裡把兩條的當前契約都釘死。
 * 誰把 0x314 改回正序、或把 0x312 改成反序，這條就紅。
 */
test('陰性對照：0x314 必須反序、0x312 必須保持正序（改任何一邊必紅）', () => {
  const seen: Array<{ name: string; args: unknown[] }> = [];
  const ctx = {
    spawnScript: (name: string, args: unknown[]) => {
      seen.push({ name, args });
      return 0;
    },
    trace: () => {},
    markUnimplemented: () => {},
  } as unknown as SyscallContext;
  const slot = (v: number | string): Slot => ({ value: v, type: typeof v === 'string' ? 2 : 0 });
  // 腳本壓棧序：name 最先進、隨後 arg1..argN（`MagicN` 的寫法同此）。
  dispatchSyscall(ctx, 0x312, ['TornadoMotion', 11, 22, 33, 44, 55, 66, 77].map(slot));
  dispatchSyscall(ctx, 0x314, ['LockTargetXY', 1, 2, 3, 4, 5, 6, 7, 8, 9].map(slot));
  assert.equal(seen.length, 2, '兩條都該起實例');
  assert.equal(seen[0]!.name, 'TornadoMotion');
  assert.equal(seen[1]!.name, 'LockTargetXY');
  // 0x312：正序（保留 R163 的實作），反序就是 R171 已證會打斷 R87 的那一種。
  assert.deepEqual(seen[0]!.args, [11, 22, 33, 44, 55, 66, 77], '0x312 目前是正序');
  assert.notDeepEqual(seen[0]!.args, [77, 66, 55, 44, 33, 22, 11], '0x312 不能改成反序（會紅 R87）');
  // 0x314：反序（最後一個實參變成 arg1，`enter()` 從 args[N-1] 壓到 args[0]，args[0] 在棧頂）。
  assert.deepEqual(seen[1]!.args, [9, 8, 7, 6, 5, 4, 3, 2, 1], '0x314 必須反序');
  assert.notDeepEqual(seen[1]!.args, [1, 2, 3, 4, 5, 6, 7, 8, 9], '0x314 不能是正序');
});

test('補兵七條不經過 0x312/0x314：實例數不因它們上漲', () => {
  // 七條技全走 `CALL MoreSoldier` / `CALL BackSoldier`（同棧內聯），不碰 invoke-by-name。
  // 這條釘住「補兵修復與實參序無關」，免得日後把兩件事混在一起歸因。
  for (const { seq, script } of SUMMON7) {
    const world = staged();
    const r = runSkill(world, 'A', script, 20, 6.5);
    const text = r.log.join(' | ');
    assert.equal(/0x312|0x314/.test(text), false, `seq ${seq} 不該調 0x312/0x314：${text}`);
  }
});
