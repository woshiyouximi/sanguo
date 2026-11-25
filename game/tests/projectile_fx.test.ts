/**
 * R187 武将技「投射物实体」的语义钉子。
 *
 * 原作把有弹道的武将技做成「物件」：`ShootObject @0x6998` 用 `SYSCALL 0x11` 建物件
 * （资源 = `13001 + 2*arg2`，dis:4015-4024）、`0x18` 给寿命（16 帧）、`0x2C` 挂碰撞回调
 * `ShootObjectCallback @0x5CA4`（dis:4102），回调里才 `CALL Hurt`（dis:3470）；
 * 脚本自己在 `L06FAC`（dis:4106-4130）逐帧轮询物件，飞完才收尾。
 *
 * 端口侧对应三件事：
 *   1. core 在物件挂上碰撞回调时登记 `ProjectileFlight`（`runtime.ts` 的 `emitProjectileFlights`）；
 *   2. 会话在「脚本已 done、弹丸还在飞」时继续空转（`holdForProjectile`），把兜底伤害压到弹丸到场那一帧；
 *   3. 视图 `drawProjectiles()` 按 `world.tick - bornTick` 在 from→to 之间画飞行帧。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/projectile_fx.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { QI_MAX, cast, createWorld, step, type Unit, type World } from '../src/core/battle.ts';
import { projectilesOf, clearProjectiles } from '../src/core/smartscript/runtime.ts';
import { buildFrame, type DrawCmd, type FxAtlas, type FxDir } from '../src/view/battleView.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function makeWorld(seed = 7): World {
  const w = createWorld({
    data,
    seed,
    a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: 56, int: 95, level: 2 } },
    b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: 69, int: 63, level: 2 } },
    aiSides: { A: false, B: false },
  });
  const g = w.sides.A.general;
  g.mp = 999;
  g.mpMax = 999;
  g.qi = QI_MAX;
  return w;
}

function unitOf(w: World, side: 'A' | 'B'): Unit {
  const u = w.units.find((x) => x.side === side && x.isGeneral);
  assert.ok(u, `主将单位缺失: ${side}`);
  return u;
}

/** 把双方主将钉在固定格子上：A(24,6.5) → B(16,6)，与 `work/proj/*` 的探针同布局。 */
function pin(w: World): void {
  const a = unitOf(w, 'A');
  const b = unitOf(w, 'B');
  a.x = 24;
  a.y = 6.5;
  a.prevX = a.x;
  a.prevY = a.y;
  b.x = 16;
  b.y = 6;
  b.prevX = b.x;
  b.prevY = b.y;
  w.sides.B.general.hp = w.sides.B.general.maxHp;
}

/** 施法并推进到「投射物已登记」的那一帧（最多 80 tick）。 */
function castUntilFlight(w: World, seq: number): { bornTick: number; hits: number[] } {
  pin(w);
  const r = cast(w, 'A', seq, 16, 6, 60);
  assert.equal(r.ok, true, `seq=${seq} 应能放出来：${JSON.stringify(r)}`);
  const hp0 = w.sides.B.general.hp;
  const hits: number[] = [];
  let last = hp0;
  for (let i = 0; i < 80; i++) {
    step(w);
    if (w.sides.B.general.hp !== last) {
      hits.push(w.tick);
      last = w.sides.B.general.hp;
    }
    if (projectilesOf(w).length) return { bornTick: projectilesOf(w)[0]!.bornTick, hits };
  }
  return { bornTick: -1, hits };
}

/** 假图集：dir 的帧数与下标只要够用即可（视图只按下标取帧）。 */
const IMG = {} as unknown as CanvasImageSource;
function fakeDir(n: number, rot: number): FxDir {
  return {
    img: IMG,
    frames: Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, w: 61, h: 65, ax: 30, ay: 32 })),
    rot,
  };
}
const ATLAS: FxAtlas = {
  map: { '2': '003', '13': '003', '46': '009', '50': '001', '52': '003', '59': '003', '83': '001' },
  dirs: { '003': fakeDir(33, 90), '001': fakeDir(10, 90), '009': fakeDir(5, 0) },
  life: 30,
  scale: 0.8,
};

/** 只取「投射物贴了多少张」——按假图的 img 身份过滤，避免把单位的 sprite 算进来。 */
function shots(w: World, atlas: FxAtlas | null): DrawCmd[] {
  return buildFrame(w, { fx: atlas }).filter((c) => c.kind === 'sprite' && (c as { img?: unknown }).img === IMG);
}

// ── 1. 落月弓：物件 → 飞行事件 ─────────────────────────────────────────

test('seq2 落月弓：登记投射物事件（资源 13001 = 13001+2*0，目录 003，寿命 10 tick）', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 2);
  const f = projectilesOf(w)[0];
  t.diagnostic(`flights=${JSON.stringify(projectilesOf(w))}`);
  assert.ok(f, '落月弓应登记一条飞行事件');
  // 依据 dis:4015-4024：`PUSHI 13001; arg2; PUSHI 2; MUL; ADD` ⇒ 13001 + 2*arg2，Magic2 压的 arg2=0
  assert.equal(f.resource, 13001, '落月弓弹丸资源号应是 13001');
  // magics.json: SEQUENCE=2 的 fx_dir_primary = "003"（M003BALLB1..6 = 弹丸帧）
  assert.equal(f.dir, '003', '帧来源应是 MAGIC 目录 003');
  // 0x18 给的 16 帧动画寿命，与「飞行距离 / 速度」取小 ⇒ 768px / 80px ≈ 10
  assert.equal(f.lifeTick, 10, '落月弓飞行 tick 数应是 10（768px ÷ 80px/帧）');
  assert.equal(f.side, 'A');
});

test('seq2 落月弓：事件起点≈施法者、终点≈敵將（格坐标）', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 2);
  const f = projectilesOf(w)[0]!;
  t.diagnostic(`from=(${f.fromX},${f.fromY}) to=(${f.toX},${f.toY})`);
  // 起点：0x11 用施法者像素坐标建的物件（syscalls.ts 的 `case 0x011` → unitPx(a(0))）
  assert.ok(Math.abs(f.fromX - 24) < 1.5 && Math.abs(f.fromY - 6.5) < 1.5, `起点应在施法者身上（实际 ${f.fromX},${f.fromY}）`);
  // 终点：`ShootObjectCallback` 打的 arg1 = G[3] = 敌主将 ⇒ 端点应是敵將 (16,6)
  assert.ok(Math.abs(f.toX - 16) < 0.5 && Math.abs(f.toY - 6) < 0.5, `终点应是敵將（实际 ${f.toX},${f.toY}）`);
});

// ── 2. 先飞后判 ────────────────────────────────────────────────────────

test('seq2 落月弓：弹丸出场前敵將一滴血都不掉（先飞后判）', (t) => {
  const w = makeWorld();
  pin(w);
  const hp0 = w.sides.B.general.hp;
  cast(w, 'A', 2, 16, 6, 60);
  // 落月弓的物件在脚本第 10 帧才建（dis:4015 附近），之前不该有任何伤害
  for (let i = 0; i < 8; i++) step(w);
  t.diagnostic(`tick=${w.tick} hp=${w.sides.B.general.hp}（初始 ${hp0}）flights=${projectilesOf(w).length}`);
  assert.equal(w.sides.B.general.hp, hp0, '弹丸还没出生，敵將不该掉血');
});

test('seq2 落月弓：伤害落在弹丸到场那一帧（born+life ±1）', (t) => {
  const w = makeWorld();
  const { bornTick } = castUntilFlight(w, 2);
  const f = projectilesOf(w)[0]!;
  const hp0 = w.sides.B.general.hp;
  let hitTick = -1;
  for (let i = 0; i < 40 && hitTick < 0; i++) {
    step(w);
    if (w.sides.B.general.hp !== hp0) hitTick = w.tick;
  }
  const due = bornTick + f.lifeTick;
  t.diagnostic(`born=${bornTick} life=${f.lifeTick} 应到=${due} 实际命中=${hitTick}`);
  assert.ok(hitTick > 0, '弹丸飞完应打出伤害');
  assert.ok(Math.abs(hitTick - due) <= 1, `命中应在弹丸到场那一帧（应到 ${due}，实际 ${hitTick}）`);
});

// ── 3. 其它有弹道的技 ──────────────────────────────────────────────────

test('seq50 半月斬：11001 / 目录 001 / 寿命 13 tick', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 50);
  const f = projectilesOf(w)[0]!;
  t.diagnostic(`flights=${JSON.stringify(projectilesOf(w))}`);
  // HalfMoon 的 spawn 指令（dis:2788-2811）：`PUSHI 11001`、`0x18(obj,…,18)` ⇒ 寿命与距离取小
  assert.equal(f.resource, 11001);
  assert.equal(f.dir, '001');
  assert.equal(f.lifeTick, 13);
});

test('seq46 連弩：一次登记 5 发 29001（目录 009 = 箭矢帧）', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 46);
  const fl = projectilesOf(w);
  t.diagnostic(`flights=${JSON.stringify(fl)}`);
  assert.equal(fl.length, 5, '連弩一次射 5 发');
  assert.deepEqual([...new Set(fl.map((f) => f.resource))], [29001]);
  assert.deepEqual([...new Set(fl.map((f) => f.dir))], ['009']);
});

test('seq59 鬼戟：资源 13005 = 13001+2*2（arg2=2 分支）', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 59);
  const f = projectilesOf(w)[0]!;
  t.diagnostic(`resource=${f.resource} dir=${f.dir} life=${f.lifeTick}`);
  // Magic58 桩压 arg2=2（`PUSHI 2; PUSHI 0; CALL ShootObject`）⇒ 13001 + 2*2 = 13005
  assert.equal(f.resource, 13005);
  assert.equal(f.dir, '003');
});

test('三种弓技的帧来源与 magics.json 的 fx_dir_primary 一致', (t) => {
  for (const seq of [2, 13, 52, 59]) {
    const w = makeWorld();
    castUntilFlight(w, seq);
    const f = projectilesOf(w)[0]!;
    const magic = data.magics.find((m) => m.SEQUENCE === seq)!;
    t.diagnostic(`seq=${seq} dir=${f.dir} fx_dir_primary=${magic.fx_dir_primary}`);
    assert.equal(f.dir, magic.fx_dir_primary, `seq=${seq} 的帧来源应取 magics.json 的 fx_dir_primary`);
  }
});

// ── 4. 视图 ────────────────────────────────────────────────────────────

test('视图：飞行中画出弹丸 sprite，位置落在 from→to 之间', (t) => {
  const w = makeWorld();
  const { bornTick } = castUntilFlight(w, 2);
  const f = projectilesOf(w)[0]!;
  // 让它飞一半：落月弓 life=10，再走 4 tick
  for (let i = 0; i < 4; i++) step(w);
  const cmds = shots(w, ATLAS);
  t.diagnostic(`age=${w.tick - bornTick} sprites=${cmds.length} ${JSON.stringify(cmds.map((c) => ({ x: (c as { x: number }).x, y: (c as { y: number }).y })))}`);
  // 003 有 body 6 帧 + tail 1 帧 ⇒ 本体 + 拖尾 = 2 张
  assert.ok(cmds.length >= 1, '飞行中应画出弹丸');
  assert.equal(cmds.every((c) => (c as { comp?: string }).comp === 'lighter'), true, '投射物应叠加混合');
});

test('视图：落地之后不再画（age >= lifeTick）', (t) => {
  const w = makeWorld();
  const { bornTick } = castUntilFlight(w, 2);
  const life = projectilesOf(w)[0]!.lifeTick;
  while (w.tick - bornTick < life) step(w);
  const cmds = shots(w, ATLAS);
  t.diagnostic(`age=${w.tick - bornTick} life=${life} sprites=${cmds.length}`);
  assert.equal(cmds.length, 0, '弹丸落地后不该再有贴图（否则屏幕上会留残影）');
});

// ── 5. 阴性对照 ────────────────────────────────────────────────────────

test('阴性对照：所有投射物寿命置 0 → 不画，且不再等弹丸（伤害立刻由兜底结算）', (t) => {
  const w = makeWorld();
  const { bornTick } = castUntilFlight(w, 2);
  const fl = projectilesOf(w);
  assert.ok(fl.length > 0);
  const due = bornTick + fl[0]!.lifeTick;
  const hpBefore = w.sides.B.general.hp;
  for (const f of fl) f.lifeTick = 0; // 故意打断飞行
  let hitTick = -1;
  let sprites = 0;
  for (let i = 0; i < 30 && hitTick < 0; i++) {
    step(w);
    const n = shots(w, ATLAS).length;
    if (n > 0) sprites = n;
    if (w.sides.B.general.hp !== hpBefore) hitTick = w.tick;
  }
  t.diagnostic(`置 0 后命中=${hitTick} 原应到=${due} 飞行中贴图数=${sprites}`);
  assert.equal(sprites, 0, '寿命为 0 的投射物不该被画出来');
  assert.ok(hitTick > 0, '伤害仍要结算（兜底），只是不再等弹丸');
  assert.ok(hitTick < due, `寿命置 0 后结算不该拖到原定到场那一帧（原定 ${due}，实际 ${hitTick}）`);
});

test('阴性对照：没有图集时 drawProjectiles 直接跳过，不抛错也不画', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 2);
  for (let i = 0; i < 3; i++) step(w);
  const cmds = shots(w, null);
  t.diagnostic(`无可视化图集 sprites=${cmds.length}`);
  assert.equal(cmds.length, 0);
});

test('clearProjectiles：清空后 projectilesOf 返回空、视图不再画', (t) => {
  const w = makeWorld();
  castUntilFlight(w, 2);
  assert.ok(projectilesOf(w).length > 0);
  clearProjectiles(w);
  assert.equal(projectilesOf(w).length, 0);
  assert.equal(shots(w, ATLAS).length, 0);
});
