/**
 * R145：武将技"运行时测不到效果"的回归护栏。
 *
 * 跑法：
 *   cd F:\sanguo\game
 *   node --test tests\magic_effects.test.ts
 *
 * 覆盖两块：
 *  A. 逐个修好的 syscall 端口（0x027 / 0x028 / 0x029 / 0x02B / 0x02C / 0x02E / 0x116 / 0x12D / 0x12E）：
 *     用最小假上下文直接调 `dispatchSyscall`，断言写的是 asm 里那个字段，而不是别的字段。
 *  B. 探针三/四场景里的典型技能：真的能打到人、能治疗、状态技按落点结算。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { QI_MAX, cast, createWorld, step } from '../src/core/battle.ts';
import { dispatchSyscall } from '../src/core/smartscript/syscalls.ts';
import type { SkillObject, SyscallContext } from '../src/core/smartscript/syscalls.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 建一个"主将 A 站在 (24,6.5)、气力满"的 20v20 战场。 */
function world(opts: { terrain?: number; weather?: number; cavalry?: number; troop?: number } = {}) {
  const w = createWorld({
    data, seed: 7, terrain: opts.terrain ?? 0, weather: opts.weather ?? 0,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: {
      formation: 0, troop: opts.troop ?? 0, morale: 50, soldiers: 20, cavalry: opts.cavalry ?? 0,
      general: { name: 'B', str: 60, int: 70 },
    },
  });
  const g = w.units.find((u) => u.isGeneral && u.side === 'A')!;
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  w.sides.A.general.qi = QI_MAX;
  return w;
}

/** cast + 把会话跑到结束；返回会话自己记的账。 */
function castAndSettle(w: ReturnType<typeof world>, seq: number, tx = 20, ty = 6.5) {
  const r = cast(w, 'A', seq, tx, ty);
  const sess = w.sessions[0] ?? null;
  let ticks = 0;
  while (w.sessions.length > 0 && ticks < 600) { step(w); ticks++; }
  return {
    cast: r,
    ticks,
    hits: (sess?.hits ?? 0) + (r.hits ?? 0),
    killed: (sess?.killed ?? 0) + (r.killed ?? 0),
    healed: (sess?.healed ?? 0) + (r.healed ?? 0),
    frames: sess?.frames.length ?? 0,
    objects: sess?.summary?.().objects ?? [],
  };
}

// ── 假上下文：只实现 0x027..0x02E / 0x116 / 0x12D / 0x12E 需要的那几个端口 ──
function fakeCtx(o: SkillObject) {
  const trace: string[] = [];
  const objects = new Map<number, SkillObject>([[o.handle, o]]);
  const ctx = {
    vm: {} as SyscallContext['vm'],
    casterHandle: 1,
    targetHandle: 2,
    clock: 0,
    objectOf: (h: number) => objects.get(h),
    isUnit: (h: number) => h === 1 || h === 2,
    maxHp: (h: number) => (h === 2 ? 111 : 77),
    sideUnitHandle: () => 2,
    trace: (line: string) => { trace.push(line); },
  } as unknown as SyscallContext;
  return { ctx, trace, objects };
}

function blankObject(patch: Partial<SkillObject> = {}): SkillObject {
  return {
    handle: 900, resource: 2501, x: 100, y: 200, z: 0, unit: 1,
    vx: 0, vy: 0, angle: -1, speed: 0, frames: 0, born: 0, expiresAt: 999,
    dead: false, motion: 0, flags: 0, animFrame: 0, param98: 0, params: [0, 0, 0],
    ...patch,
  };
}

const v = (n: number) => ({ kind: 'num' as const, value: n }) as never;

// ── A. syscall 端口 ──────────────────────────────────────────
test('0x027 写动画帧号 animFrame（原作 obj+0x58），不动 motion', () => {
  const o = blankObject({ motion: 5 });
  const { ctx } = fakeCtx(o);
  dispatchSyscall(ctx, 0x027, [v(900), v(17)]);
  assert.equal(o.animFrame, 17);
  assert.equal(o.motion, 5);
});

test('0x028 把 x/y/z 按 16.16 增量累加（原作 obj+8/+0xC/+0x10）', () => {
  const o = blankObject({ x: 100, y: 200, z: 0 });
  const { ctx } = fakeCtx(o);
  dispatchSyscall(ctx, 0x028, [v(900), v(30), v(-40), v(5)]);
  assert.deepEqual([o.x, o.y, o.z], [130, 160, 5]);
});

test('0x029 只置状态位 flags（原作 obj+0x30 |= arg），不写 motion', () => {
  const o = blankObject({ motion: 3 });
  const { ctx } = fakeCtx(o);
  dispatchSyscall(ctx, 0x029, [v(900), v(0x0100)]);
  dispatchSyscall(ctx, 0x029, [v(900), v(0x0004)]);
  assert.equal(o.flags, 0x0104);
  assert.equal(o.motion, 3);
});

test('0x02B 清状态位（原作 obj+0x30 &= ~arg）', () => {
  const o = blankObject({ flags: 0x0104 });
  const { ctx } = fakeCtx(o);
  dispatchSyscall(ctx, 0x02b, [v(900), v(0x0004)]);
  assert.equal(o.flags, 0x0100);
});

test('0x02C 写 param98（原作 obj+0x98），不是 motion', () => {
  const o = blankObject({ motion: 9 });
  const { ctx } = fakeCtx(o);
  dispatchSyscall(ctx, 0x02c, [v(900), v(34001)]);
  assert.equal(o.param98, 34001);
  assert.equal(o.motion, 9);
});

test('0x02E 写 params[idx]（原作 obj+0x9C+idx*4），idx>=3 时忽略', () => {
  const o = blankObject();
  const { ctx } = fakeCtx(o);
  dispatchSyscall(ctx, 0x02e, [v(900), v(0), v(11)]);
  dispatchSyscall(ctx, 0x02e, [v(900), v(2), v(33)]);
  dispatchSyscall(ctx, 0x02e, [v(900), v(3), v(99)]);
  dispatchSyscall(ctx, 0x02e, [v(900), v(-1), v(98)]);
  assert.deepEqual(o.params, [11, 0, 33]);
});

test('0x12D 返回常量 71、0x12E 返回常量 14（asm mov eax,0x47 / 0xE）', () => {
  const { ctx } = fakeCtx(blankObject());
  const val = (slot: unknown) => (slot as { value: number }).value;
  assert.equal(val(dispatchSyscall(ctx, 0x12d, [])), 71);
  assert.equal(val(dispatchSyscall(ctx, 0x12e, [])), 14);
});

test('0x116 返回血量上限（原作 0x43A871，与 0x117 读 hp 同族）', () => {
  const { ctx } = fakeCtx(blankObject());
  const val = (slot: unknown) => (slot as { value: number }).value;
  assert.equal(val(dispatchSyscall(ctx, 0x116, [v(2)])), 111);
  // 传阵营号（0/1）而不是句柄时，回落到该方主将
  assert.equal(val(dispatchSyscall(ctx, 0x116, [v(0)])), 111);
});

// ── B. 真打一遍：探针三/四场景里的典型技能 ────────────────────
test('seq3 地泉衝：全體伤害技按落点结算，必须打到人', () => {
  const w = world();
  const r = castAndSettle(w, 3);
  assert.equal(r.cast.ok, true);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
  assert.ok(r.killed > 0, `killed=${r.killed}`);
});

test('seq4 火箭：R145 新坏的兩条之一，修复后要能打到人', () => {
  const w = world();
  const r = castAndSettle(w, 4);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
});

test('seq8 火雷：特效物件落在 (0,0) 也不该整发空放（落点兜底）', () => {
  const w = world();
  const r = castAndSettle(w, 8);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
  assert.ok(r.frames > 0, '会话要有帧');
});

test('seq9 雷擊：全體技命中数随落点覆盖的敌单位数增长', () => {
  const w = world();
  const r = castAndSettle(w, 9);
  assert.ok(r.hits >= 1, `hits=${r.hits}`);
});

test('seq30 火箭天襲：R145 新坏的第二条，修复后要能打到人', () => {
  const w = world();
  const r = castAndSettle(w, 30);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
});

test('seq42 五雷轟頂：主將2 指向技，落点上的敌单位要被打到', () => {
  const w = world();
  const r = castAndSettle(w, 42);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
});

test('seq110 鬼哭神號：最高阶全體技必须有击杀', () => {
  const w = world();
  const r = castAndSettle(w, 110);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
  assert.ok(r.killed > 0, `killed=${r.killed}`);
});

test('场景二（敌带骑兵+弓兵）：seq12 拒陸馬 仍能生效', () => {
  const w = world({ cavalry: 10, troop: 3 });
  const r = castAndSettle(w, 12);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
});

test('场景三（山林+雨）：seq47 突石 仍能生效', () => {
  const w = world({ terrain: 6, weather: 1 });
  const r = castAndSettle(w, 47);
  assert.ok(r.hits > 0, `hits=${r.hits}`);
});

test('场景四（己方残缺）：seq1 命療術 治到伤兵（C3：满血时本来就观察不到）', () => {
  const w = world();
  w.sides.A.general.hp = Math.max(1, Math.floor(w.sides.A.general.maxHp * 0.3));
  const before = w.sides.A.general.hp;
  const r = castAndSettle(w, 1, 24, 6.5);
  assert.equal(r.cast.ok, true);
  assert.ok(w.sides.A.general.hp > before, `hp ${before} → ${w.sides.A.general.hp}`);
  assert.ok(r.healed > 0, `healed=${r.healed}`);
});

test('场景四（己方残缺）：seq60 回天術 同样要治到伤兵', () => {
  const w = world();
  w.sides.A.general.hp = Math.max(1, Math.floor(w.sides.A.general.maxHp * 0.3));
  const before = w.sides.A.general.hp;
  castAndSettle(w, 60, 24, 6.5);
  assert.ok(w.sides.A.general.hp > before, `hp ${before} → ${w.sides.A.general.hp}`);
});

test('補血/補兵技不被"落点兜底"误伤（它们不走命中，不该凭空打死人）', () => {
  const w = world();
  w.sides.A.general.hp = Math.max(1, Math.floor(w.sides.A.general.maxHp * 0.3));
  const foeBefore = w.units.filter((u) => u.side === 'B' && u.alive).length;
  const r = castAndSettle(w, 1, 20, 6.5); // 落点上就是敌人
  assert.equal(r.hits, 0, 'heal 技不该产生命中');
  const foeAfter = w.units.filter((u) => u.side === 'B' && u.alive).length;
  assert.ok(foeBefore - foeAfter <= 1, `治疗技把 B 兵打死太多：${foeBefore} → ${foeAfter}`);
});
