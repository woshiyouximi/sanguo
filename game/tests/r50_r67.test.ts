/**
 * R50（ACTIVE 状态位掩码）+ R67（伤害结算走脚本 syscall）的回归测试。
 *
 * 原作锚点：
 *  - R50 `MagicDef+0x10`「Active 生效类型」：1 我方士兵 / 2 我方主将 / 4 敌方士兵 / 8 敌方主将。
 *    数值来自 `docs/03a-武将技表MAGIC.md` §2.3:73-101（177 条技能的 7 种中文写法，组合恰好求和
 *    反解，[确认]）；结构布局见 `docs/04b_战斗系统.md:385-397`（基址 `0x4A61A0`、stride `0x16`、
 *    `+0x10` word、`if (active < 0) 跳过`、子表 `0x4868A8`、访问器 `0x40A41A(i)`）。
 *  - R50 `unit+0x2C & 4`：`HitRoll(0x43D400)` 首掷不中时 `p = p*2/3` 再掷一次（`docs/04b:152-181`，
 *    `:168` 把 `0x43D48C` 注成"连击/必杀位"）。
 *  - R67 `0x43ED96(objVictim, dmg, objSrc)` 是 `SYSCALL 0x125` 的宿主函数
 *    （`docs/04-scripts:515`、`docs/04b3_单挑流程.md:377`）。MAGIC.SO 的 `Hurt`（off `0x12B8`）
 *    就是 `0x125(victim, 0, dmg)` 的唯一常规调用者，本文件用**真 magic_so.bin** 跑它。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/r50_r67.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  ACTIVE_BIT,
  ACTIVE_LABELS,
  BATTLE_BITS,
  GRID_W,
  UNIT_STATUS,
  activeAim,
  activeHits,
  activeMaskOf,
  activeTargetCount,
  applyDamage,
  cast,
  createWorld,
  damageErrorOf,
  damageLogOf,
  damageSoundsOf,
  hitChance,
  hitRoll,
  legacyDamage,
  magicBySeq,
  statusBitOf,
  step,
} from '../src/core/battle.ts';
import type { Side, Unit, World } from '../src/core/battle.ts';
import { dispatchSyscall } from '../src/core/smartscript/syscalls.ts';
import type { SyscallContext } from '../src/core/smartscript/syscalls.ts';
import type { Slot } from '../src/core/smartscript/vm.ts';
import { DamageHost, createSysoHost, damageHostApply } from '../src/core/syso_host.ts';
import type { Magic } from '../src/types.ts';

import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 默认造两军对垒的世界（技力/气力给足，方便直接 cast） */
function world(seed: number, opts: { a?: number; b?: number; channel?: 'script' | 'legacy' } = {}): World {
  // m4：默认待機后要显式下令，否则这些「打起来才有的命中/伤害」口径全为 0。
  const w = engage(createWorld({
    data,
    seed,
    a: { soldiers: opts.a ?? 4 },
    b: { soldiers: opts.b ?? 4 },
    damageChannel: opts.channel ?? 'script',
  }));
  for (const side of ['A', 'B'] as const) {
    const g = w.sides[side].general;
    g.mp = 999;
    g.qi = 9999999;
  }
  return w;
}

function unitOn(w: World, side: Side, isGeneral: boolean): Unit {
  // 士兵的 `isGeneral` 是 undefined（不是 false），所以不能直接 `=== isGeneral`
  const u = w.units.find((x) => x.side === side && (isGeneral ? x.isGeneral === true : !x.isGeneral));
  assert.ok(u, `${side} 侧没有 ${isGeneral ? '主将' : '士兵'}单位`);
  return u;
}

const general = (w: World, side: Side): Unit => unitOn(w, side, true);
const soldier = (w: World, side: Side): Unit => unitOn(w, side, false);

/** 只填 `activeMaskOf()` 需要的字段（`Magic` 的其余字段与本条逻辑无关） */
const magicStub = (active: string | undefined): Magic => ({ ACTIVE: active }) as unknown as Magic;

const slot = (n: number): Slot => ({ value: n, type: 0 });

/** 跑到出现 `n` 次命中或打完 */
function runUntilHits(w: World, n = 3, maxTicks = 1200): number {
  let i = 0;
  for (; i < maxTicks && !w.over; i++) {
    step(w);
    if (w.stats.hitsA + w.stats.hitsB >= n) break;
  }
  return i;
}

// ---------------------------------------------------------------------------
// R50 —— ACTIVE 位掩码（`MagicDef+0x10`）
// ---------------------------------------------------------------------------

test('R50 位表是唯一定义处：每条都带 字/位/含义/证据/消费点，且 ACTIVE 只有 4 位', () => {
  assert.ok(BATTLE_BITS.length >= 5, '至少 4 个 ACTIVE 位 + 1 个 unit+0x2C 位');
  const names = new Set<string>();
  for (const b of BATTLE_BITS) {
    assert.ok(b.name.trim().length > 0, 'name 不能为空');
    assert.equal(names.has(b.name), false, `name 重复：${b.name}`);
    names.add(b.name);
    assert.ok(b.bit > 0 && (b.bit & (b.bit - 1)) === 0, `${b.name} 必须是单个位（值是 ${b.bit}）`);
    assert.ok(b.meaning.trim().length > 0, `${b.name} 缺含义`);
    assert.ok(b.evidence.trim().length > 0, `${b.name} 缺证据出处`);
    assert.ok(b.consumer.trim().length > 0, `${b.name} 没有消费点（死位）`);
    assert.ok(b.word === 'magicdef+0x10' || b.word === 'unit+0x2C', `${b.name} 的 word 非法：${b.word}`);
  }
  const magicdefBits = BATTLE_BITS.filter((b) => b.word === 'magicdef+0x10')
    .map((b) => b.bit)
    .sort((x, y) => x - y);
  assert.deepEqual(
    magicdefBits,
    [ACTIVE_BIT.OWN_TROOP, ACTIVE_BIT.OWN_GENERAL, ACTIVE_BIT.ENEMY_TROOP, ACTIVE_BIT.ENEMY_GENERAL],
    'ACTIVE 只有 1/2/4/8 四位，多一位都是无据的',
  );
  assert.ok(
    BATTLE_BITS.some((b) => b.word === 'unit+0x2C' && b.bit === UNIT_STATUS.DOUBLE_HIT),
    '`unit+0x2C & 4` 必须登记',
  );
});

test('R50 ACTIVE 真值表：1/2/4/8 各自只命中自己那一种单位（03a §2.3）', () => {
  // [mask, 施法方, 目标方, 目标是否主将, 期望] —— 逐条手写，不复用实现里的位运算
  const cases: [number, Side, Side, boolean, boolean][] = [
    [ACTIVE_BIT.OWN_TROOP, 'A', 'A', false, true],
    [ACTIVE_BIT.OWN_TROOP, 'A', 'A', true, false],
    [ACTIVE_BIT.OWN_TROOP, 'A', 'B', false, false],
    [ACTIVE_BIT.OWN_TROOP, 'A', 'B', true, false],
    [ACTIVE_BIT.OWN_GENERAL, 'A', 'A', false, false],
    [ACTIVE_BIT.OWN_GENERAL, 'A', 'A', true, true],
    [ACTIVE_BIT.OWN_GENERAL, 'A', 'B', false, false],
    [ACTIVE_BIT.OWN_GENERAL, 'A', 'B', true, false],
    [ACTIVE_BIT.ENEMY_TROOP, 'A', 'A', false, false],
    [ACTIVE_BIT.ENEMY_TROOP, 'A', 'A', true, false],
    [ACTIVE_BIT.ENEMY_TROOP, 'A', 'B', false, true],
    [ACTIVE_BIT.ENEMY_TROOP, 'A', 'B', true, false],
    [ACTIVE_BIT.ENEMY_GENERAL, 'A', 'A', false, false],
    [ACTIVE_BIT.ENEMY_GENERAL, 'A', 'A', true, false],
    [ACTIVE_BIT.ENEMY_GENERAL, 'A', 'B', false, false],
    [ACTIVE_BIT.ENEMY_GENERAL, 'A', 'B', true, true],
    // 换一侧施法，位语义必须跟着翻转
    [ACTIVE_BIT.OWN_TROOP, 'B', 'B', false, true],
    [ACTIVE_BIT.OWN_TROOP, 'B', 'A', false, false],
    [ACTIVE_BIT.ENEMY_GENERAL, 'B', 'A', true, true],
    [ACTIVE_BIT.ENEMY_GENERAL, 'B', 'B', true, false],
  ];
  for (const [mask, caster, side, isGeneral, want] of cases) {
    assert.equal(activeHits(mask, caster, side, isGeneral), want, `mask=${mask} ${caster}->${side} gen=${isGeneral}`);
  }
});

test('R50 组合掩码：5 = 敌我士兵、12 = 敌方全军、15 = 敌我全军，0 = 不限制（旧行为）', () => {
  // 敵我士兵 = 1|4
  assert.equal(activeHits(0x5, 'A', 'A', false), true);
  assert.equal(activeHits(0x5, 'A', 'B', false), true);
  assert.equal(activeHits(0x5, 'A', 'A', true), false, '不含主将位');
  assert.equal(activeHits(0x5, 'A', 'B', true), false, '不含主将位');
  // 敵方全軍 = 4|8
  assert.equal(activeHits(0xc, 'A', 'B', false), true);
  assert.equal(activeHits(0xc, 'A', 'B', true), true);
  assert.equal(activeHits(0xc, 'A', 'A', false), false);
  assert.equal(activeHits(0xc, 'A', 'A', true), false);
  // 敵我全軍 = 1|2|4|8
  for (const side of ['A', 'B'] as const) {
    for (const isGeneral of [false, true]) assert.equal(activeHits(0xf, 'A', side, isGeneral), true);
  }
  // 0 = 没有 ACTIVE 字段（未标注）⇒ 不做限制，改动前的行为一位都不变
  for (const side of ['A', 'B'] as const) {
    for (const isGeneral of [false, true]) assert.equal(activeHits(0, 'A', side, isGeneral), true);
  }
  assert.equal(activeHits(Number.NaN, 'A', 'B', false), true, '脏值也不能把技能卡死');
});

test('R50 ACTIVE_LABELS：7 种中文写法 ↔ 7 个掩码，magics.json 只出现这 7 种组合', () => {
  assert.equal(ACTIVE_LABELS.length, 7, '03a §2.3 的 7 种写法');
  const masks = ACTIVE_LABELS.map((e) => e.mask);
  assert.equal(new Set(masks).size, 7, '7 种写法必须映射到 7 个不同掩码');
  assert.deepEqual([...masks].sort((x, y) => x - y), [0x1, 0x2, 0x4, 0x5, 0x8, 0xc, 0xf]);
  assert.equal(new Set(ACTIVE_LABELS.map((e) => e.label)).size, 7, 'label 不能重复');

  // 数据侧：110 条技能的 ACTIVE 必须全被认出来，且只出现这 7 种组合
  const used = new Set<number>();
  let labeled = 0;
  for (const m of data.magics) {
    const mask = activeMaskOf(m);
    assert.ok(mask > 0, `${m.SEQUENCE} ${m.NAME} 的 ACTIVE=${String(m.ACTIVE)} 认不出来`);
    used.add(mask);
    labeled++;
  }
  assert.equal(labeled, data.magics.length);
  assert.deepEqual([...used].sort((x, y) => x - y), [0x1, 0x2, 0x4, 0x5, 0x8, 0xc, 0xf], '数据里不能出现第 8 种组合');
  assert.ok(data.magics.length >= 100, `magics.json 条数 ${data.magics.length}`);
});

test('R50 activeMaskOf：trim 后匹配，未知写法/缺字段都归一成 0（= 不限制）', () => {
  assert.equal(activeMaskOf(magicStub('我方主將')), ACTIVE_BIT.OWN_GENERAL);
  assert.equal(activeMaskOf(magicStub(' 我方主將 ')), ACTIVE_BIT.OWN_GENERAL, '要 trim');
  assert.equal(activeMaskOf(magicStub('敵方全軍')), 0xc);
  assert.equal(activeMaskOf(magicStub('敵我全軍')), 0xf);
  assert.equal(activeMaskOf(magicStub('隨便寫的')), 0);
  assert.equal(activeMaskOf(magicStub('')), 0);
  assert.equal(activeMaskOf(magicStub(undefined)), 0);
  assert.equal(activeMaskOf(undefined), 0);
  assert.equal(activeMaskOf(null), 0);
});

test('R50 activeTargetCount：只数"存活 + 落在掩码里"的单位', () => {
  const w = world(101, { a: 4, b: 3 });
  assert.equal(activeTargetCount(w, 'A', ACTIVE_BIT.OWN_TROOP), 4);
  assert.equal(activeTargetCount(w, 'A', ACTIVE_BIT.OWN_GENERAL), 1);
  assert.equal(activeTargetCount(w, 'A', ACTIVE_BIT.ENEMY_TROOP), 3);
  assert.equal(activeTargetCount(w, 'A', ACTIVE_BIT.ENEMY_GENERAL), 1);
  assert.equal(activeTargetCount(w, 'A', 0xc), 4, '敵方全軍 = 3 兵 + 1 将');
  assert.equal(activeTargetCount(w, 'A', 0xf), 9, '敌我全軍 = 全部 9 个单位');
  assert.equal(activeTargetCount(w, 'A', 0), 0, '0 = 不做限制，返回 0（调用方自己判）');

  soldier(w, 'A').alive = false;
  assert.equal(activeTargetCount(w, 'A', ACTIVE_BIT.OWN_TROOP), 3, '死掉的不算');
  general(w, 'B').alive = false;
  assert.equal(activeTargetCount(w, 'A', ACTIVE_BIT.ENEMY_GENERAL), 0);
});

test('R50 activeAim：纯己方技（掩码无敌方位）点在敌半场 → 改到己方主将；含敌方位原样', () => {
  const w = world(102);
  const self = general(w, 'A');
  // A 侧在纵深大的一头（createWorld 里 A ≈ 55、B ≈ 15）
  assert.ok(self.x > GRID_W / 2, `A 主将应该在 x 大的一侧，实际 ${self.x}`);
  const enemyHalfX = 5;
  assert.deepEqual(activeAim(w, 'A', ACTIVE_BIT.OWN_GENERAL, enemyHalfX, 6), { x: self.x, y: self.y }, '[推测] 子表未知');
  assert.deepEqual(activeAim(w, 'A', ACTIVE_BIT.OWN_GENERAL, self.x, 3), { x: self.x, y: 3 }, '己方半场不夹');
  assert.deepEqual(activeAim(w, 'A', 0xc, enemyHalfX, 6), { x: enemyHalfX, y: 6 }, '含敌方位的技能必须保留玩家选点');
  assert.deepEqual(activeAim(w, 'A', 0, enemyHalfX, 6), { x: enemyHalfX, y: 6 }, '掩码 0 不做任何改写');
  // 另一侧镜像
  const selfB = general(w, 'B');
  assert.deepEqual(activeAim(w, 'B', ACTIVE_BIT.OWN_GENERAL, GRID_W - 1, 2), { x: selfB.x, y: selfB.y });
});

test('R50 cast：ACTIVE 范围里一个活目标都没有 → no-target，且不扣 MP/气力', () => {
  const w = world(211, { a: 3, b: 3 });
  const seq = data.magics.find((m) => m.ACTIVE === '敵方士兵')!.SEQUENCE; // 只打敌方士兵
  const mask = activeMaskOf(magicBySeq(data, seq));
  assert.equal(mask, ACTIVE_BIT.ENEMY_TROOP);
  for (const u of w.units) if (u.side === 'B' && !u.isGeneral) u.alive = false;
  assert.equal(activeTargetCount(w, 'A', mask), 0, '敌方士兵已被清空');

  const g = w.sides.A.general;
  const before = { mp: g.mp, qi: g.qi };
  const r = cast(w, 'A', seq, 20, 6, 40);
  assert.deepEqual(r, { ok: false, reason: 'no-target' });
  assert.deepEqual({ mp: g.mp, qi: g.qi }, before, '打不到人就不该扣技力/气力（原作子表为空不派发）');
  assert.equal(w.sessions.length, 0);
});

test('R50 cast：掩码范围内有目标就照常放（敵方主將技打活着的敌将）', () => {
  const w = world(212);
  const seq = data.magics.find((m) => m.ACTIVE === '敵方主將')!.SEQUENCE;
  assert.equal(activeTargetCount(w, 'A', activeMaskOf(magicBySeq(data, seq))), 1);
  const g = w.sides.A.general;
  const mp0 = g.mp;
  const r = cast(w, 'A', seq, 15, 6, 40);
  assert.equal(r.ok, true);
  assert.ok(g.mp < mp0, '成功放技要扣技力');
});

test('R50 cast：纯己方技（我方主將 = 命療術）对着敌半场点，仍然只治自己', () => {
  const w = world(213);
  const g = w.sides.A.general;
  g.hp = 30;
  const enemyHp = w.sides.B.general.hp;
  const r = cast(w, 'A', 1, 5, 6, 60); // 点在自己半场之外
  assert.equal(r.ok, true);
  assert.ok(g.hp > 30, `己方主将该回血，实际 ${g.hp}`);
  assert.equal(w.sides.B.general.hp, enemyHp, '不能误伤到敌方主将');
});

test('R50 hitRoll（`unit+0x2C & 4` 缺省）：只掷一次，等价于旧算法 rng()*300 < p', () => {
  const w = world(201);
  const from = general(w, 'A');
  const to = soldier(w, 'B');
  const p = hitChance(w, from, to);
  for (const v of [0, 0.1, 0.5, 0.999]) {
    let calls = 0;
    w.rng = () => {
      calls++;
      return v;
    };
    assert.equal(hitRoll(w, from, to), v * 300 < p, `v=${v} p=${p}`);
    assert.equal(calls, 1, 'status 缺省时不能多掷一次（否则整局骰序会变）');
  }
});

test('R50 hitRoll：`+0x2C & 4` 置位后首掷不中要多掷一次，阈值是 p*2/3（0x43D400）', () => {
  const w = world(202);
  const from = general(w, 'A');
  const to = soldier(w, 'B');
  const p = hitChance(w, from, to);
  const p2 = Math.trunc((p * 2) / 3);
  assert.ok(p2 < p || p < 3, `p=${p} p2=${p2}`);
  from.status = UNIT_STATUS.DOUBLE_HIT;
  for (const v2 of [0, 0.25, 0.5, 0.999]) {
    const seq = [0.999, v2]; // 首掷必不中
    let i = 0;
    w.rng = () => seq[i++] ?? 0;
    assert.equal(hitRoll(w, from, to), v2 * 300 < p2, `v2=${v2} p=${p} p2=${p2}`);
    assert.equal(i, 2, '补判必须真的掷了第二次');
  }
  // 首掷命中就不该再补判
  let n = 0;
  w.rng = () => {
    n++;
    return 0;
  };
  assert.equal(hitRoll(w, from, to), true);
  assert.equal(n, 1);
});

test('R50 statusBitOf：`Unit.status` 缺省 0，按位判、不误伤别的位', () => {
  const u = soldier(world(203), 'A');
  assert.equal(u.status, undefined, '缺省不写字段');
  assert.equal(statusBitOf(u, UNIT_STATUS.DOUBLE_HIT), false);
  u.status = UNIT_STATUS.DOUBLE_HIT;
  assert.equal(statusBitOf(u, UNIT_STATUS.DOUBLE_HIT), true);
  u.status = 0x2;
  assert.equal(statusBitOf(u, UNIT_STATUS.DOUBLE_HIT), false, '第 2 位不能算第 4 位');
  u.status = UNIT_STATUS.DOUBLE_HIT | 0x10;
  assert.equal(statusBitOf(u, UNIT_STATUS.DOUBLE_HIT), true);
  u.status = 0;
  assert.equal(statusBitOf(u, UNIT_STATUS.DOUBLE_HIT), false);
});

// ---------------------------------------------------------------------------
// R67 —— 伤害走脚本 syscall（`Hurt` → `0x125` → `0x43ED96`）
// ---------------------------------------------------------------------------

test('R67 damageHostApply：夹 0..maxHp、判死、脏值安全（0x43ED96 的纯计算部分）', () => {
  assert.deepEqual(damageHostApply(1, -20, 0, 10, 10), { handle: 1, amount: -20, src: 0, applied: -10, killed: true });
  assert.deepEqual(damageHostApply(2, -3, 0, 10, 10), { handle: 2, amount: -3, src: 0, applied: -3, killed: false });
  assert.deepEqual(damageHostApply(3, 5, 0, 8, 10), { handle: 3, amount: 5, src: 0, applied: 2, killed: false }, '治疗夹到 maxHp');
  assert.deepEqual(damageHostApply(4, -3, 0, 2, 10), { handle: 4, amount: -3, src: 0, applied: -2, killed: true }, '不能扣成负数');
  const nan = damageHostApply(5, Number.NaN, 0, 5, 10);
  assert.equal(nan.applied, 0);
  assert.equal(nan.killed, false);
  const noCap = damageHostApply(6, -1, 0, 5, 0);
  assert.equal(noCap.applied, -5, 'maxHp 无效时按 0 处理');
});

test('R67 DamageHost：记录每次调用、回写血条，不认识的句柄返 0 不抛', () => {
  const writes: number[] = [];
  const host = new DamageHost(
    (h) => (h === 11 ? { hp: 10, maxHp: 10 } : undefined),
    (_h, r) => {
      writes.push(r.applied);
    },
  );
  assert.equal(host.hurt(11, -3), -3);
  assert.equal(host.calls.length, 1);
  assert.equal(host.calls[0].handle, 11);
  assert.equal(host.calls[0].applied, -3);
  assert.deepEqual(writes, [-3]);
  assert.equal(host.hurt(99, -1), 0, '未注册句柄');
  assert.equal(host.hurt(11, Number.NaN), 0, 'NaN 按 0 伤害处理，不抛');
  assert.equal(host.calls.length, 2, 'NaN 也要记一条 applied=0 的调用（宿主函数确实被调过）');
  assert.equal(host.calls[1].applied, 0);
  assert.equal(host.calls[1].killed, false);
});

test('R67 SysoHost.hurt：`0x125` 的宿主入口记 hpDeltas，`ports.damage` 的返回值透传', () => {
  const syso = createSysoHost({ damage: (_h, amount) => amount }, 7);
  assert.equal(syso.hurt(21, -4), -4);
  assert.deepEqual(syso.hpDeltas.at(-1), { handle: 21, delta: -4 });
  // 没接 damage 端口时（旧的 applyHpDelta 风格）把 amount 原样记下
  const bare = createSysoHost({}, 7);
  assert.equal(bare.hurt(22, -2, 21), -2);
  assert.deepEqual(bare.hpDeltas.at(-1), { handle: 22, delta: -2 });
  assert.ok(bare.events.some((e) => e.kind === 'hp-delta' && e.handle === 22), '事件流里要留痕');
});

test('R67 真 MAGIC.SO：applyDamage 跑 Hurt 字节码 → 0x125 → 主将掉 7 点血', () => {
  const w = world(401, { a: 2, b: 2 });
  const to = general(w, 'B');
  const before = w.sides.B.general.hp;
  assert.equal(applyDamage(w, to, 7), 7);
  assert.equal(w.sides.B.general.hp, before - 7, '血条必须真的掉了 7');
  const log = damageLogOf(w);
  assert.equal(log.length, 1, '0x125 必须被调用一次（Hurt 里那条 SYSCALL）');
  assert.equal(log[0].handle, 0x400000 + w.units.indexOf(to), '受害句柄');
  assert.equal(log[0].amount, -7);
  assert.equal(log[0].applied, -7);
  assert.equal(log[0].killed, false);
  assert.equal(w.damageFallbacks, 0, '走的是脚本通道，不该降级');
  assert.equal(damageErrorOf(w), null, '真字节码不该报错');
  assert.equal(damageSoundsOf(w).length, 0, 'Hurt 只有 victim 是 g2/g3（自己/主目标）时才放 Hit01 音');
  // 0 伤害 / 负数输入：不跑脚本、不记账
  assert.equal(applyDamage(w, to, 0), 0);
  assert.equal(applyDamage(w, to, -5), 0);
  assert.equal(damageLogOf(w).length, 1);
});

test('R67 真 MAGIC.SO：打士兵把它的 hp 从 1 打到 0（killed ⇒ alive=false）', () => {
  const w = world(402, { a: 2, b: 2 });
  const to = soldier(w, 'B');
  assert.equal(to.alive, true);
  assert.equal(applyDamage(w, to, 1), 1);
  assert.equal(to.alive, false);
  const log = damageLogOf(w);
  assert.equal(log.length, 1);
  assert.equal(log[0].applied, -1);
  assert.equal(log[0].killed, true);
  assert.equal(w.damageFallbacks, 0);
});

test('R67 默认通道是 script：一场混战里每次命中都过 syscall（log 条数 == 命中数）', () => {
  const w = world(403, { a: 8, b: 8 });
  assert.equal(w.damageChannel, 'script', '默认必须走脚本');
  runUntilHits(w, 5);
  const hits = w.stats.hitsA + w.stats.hitsB;
  assert.ok(hits >= 5, `至少要有 5 次命中，实际 ${hits}`);
  assert.equal(damageLogOf(w).length, hits, '每次命中恰好一次 0x125');
  assert.equal(w.damageFallbacks, 0, '整场都不许降级');
  assert.equal(damageErrorOf(w), null);
});

test('R67 等价性：script 与 legacy 同 seed 逐 tick 完全一致（伤害数字前后不变）', () => {
  // m4：默认待機后要显式下令，否则两边都站着不动、永远没有命中。
  const mk = (channel: 'script' | 'legacy'): World =>
    engage(createWorld({ data, seed: 777, a: { soldiers: 10 }, b: { soldiers: 10 }, damageChannel: channel }));
  const ws = mk('script');
  const wl = mk('legacy');
  assert.equal(ws.damageChannel, 'script');
  assert.equal(wl.damageChannel, 'legacy');

  let ticks = 0;
  for (; ticks < 1500; ticks++) {
    step(ws);
    step(wl);
    assert.deepEqual(
      [ws.sides.A.general.hp, ws.sides.B.general.hp, ws.units.filter((u) => u.alive).length],
      [wl.sides.A.general.hp, wl.sides.B.general.hp, wl.units.filter((u) => u.alive).length],
      `第 ${ticks} tick 出现分歧`,
    );
    if (ws.over) break;
  }
  assert.ok(ticks > 60, `要跑过接战，实际 ${ticks} tick`);
  assert.ok(ws.stats.hitsA + ws.stats.hitsB > 0, '期间必须有命中，否则对拍没意义');
  assert.deepEqual(ws.units.map((u) => u.alive), wl.units.map((u) => u.alive), '逐个单位的存活状态一致');
  assert.deepEqual(ws.stats, wl.stats, '战果统计一致');
  assert.equal(damageLogOf(ws).length, ws.stats.hitsA + ws.stats.hitsB);
  assert.equal(damageLogOf(wl).length, 0, 'legacy 通道一次脚本都不跑');
  assert.equal(wl.damageFallbacks, 0);
});

test('R67 legacy 通道：显式选择时只走旧实现，且 legacyDamage 语义与改动前一致', () => {
  const w = world(404, { channel: 'legacy' });
  const to = general(w, 'B');
  const before = w.sides.B.general.hp;
  assert.equal(applyDamage(w, to, 4), 4);
  assert.equal(w.sides.B.general.hp, before - 4);
  assert.equal(damageLogOf(w).length, 0);
  assert.equal(w.damageFallbacks, 0, '显式 legacy 不算降级');

  const g = w.sides.B.general;
  g.hp = 3;
  g.maxHp = 100;
  const u = general(w, 'B');
  legacyDamage(w, u, 5);
  assert.equal(g.hp, 0, '扣到 0 就夹住');
  assert.equal(g.alive, false);
  assert.equal(u.alive, false);
  const s = soldier(w, 'A');
  legacyDamage(w, s, 1);
  assert.equal(s.alive, false, '士兵命中即死');
});

test('R67 分派：`0x125` 优先走 ctx.damage（宿主 0x43ED96），没有才回落 applyHpDelta', () => {
  const seen: string[] = [];
  const withDamage = {
    damage: (h: number, amount: number, src: number) => {
      seen.push(`damage:${h}:${amount}:${src}`);
    },
    applyHpDelta: (h: number, delta: number) => {
      seen.push(`applyHpDelta:${h}:${delta}`);
    },
  } as unknown as SyscallContext;
  const ret = dispatchSyscall(withDamage, 0x125, [slot(7), slot(0), slot(5)]);
  assert.equal(ret, undefined, '0x125 不返回值');
  // 真 Hurt 传的是正伤害量（`0 <= arg1` 的门，实测 magic_so.bin），顺序：受害人 / 0 / 伤害
  assert.deepEqual(seen, ['damage:7:5:0'], '参数顺序：受害句柄 / 伤害量 / 来源');

  const seen2: string[] = [];
  const legacyCtx = {
    applyHpDelta: (h: number, delta: number) => {
      seen2.push(`applyHpDelta:${h}:${delta}`);
    },
  } as unknown as SyscallContext;
  dispatchSyscall(legacyCtx, 0x125, [slot(9), slot(0), slot(2)]);
  // R163：`applyHpDelta` 的口径是「负数=伤害」，而 `Hurt` 传进来的 `a(2)` 是**正伤害量**
  // （原作 `0x43ED96` 的 `mov [0x4b4c3c], arg3`）。旧代码把正数直接当前缀传，法术伤害
  // 变成加血（`stats.healed` 而非 `killed`），这里改成 `-a(2)`。
  assert.deepEqual(seen2, ['applyHpDelta:9:-2'], 'runtime.ts 没注入 damage 时按「负数=伤害」传给 applyHpDelta');
});

test('R67 脚本通道用独立 PRNG：不吃 world.rng（否则整局骰序会被脚本推歪）', () => {
  const w = world(405);
  let calls = 0;
  const orig = w.rng;
  w.rng = () => {
    calls++;
    return orig();
  };
  assert.equal(applyDamage(w, general(w, 'B'), 3), 3);
  assert.equal(calls, 0, '脚本里 rand 必须走通道自己的流');
  assert.equal(damageLogOf(w).length, 1);
  assert.equal(w.damageFallbacks, 0);
});
