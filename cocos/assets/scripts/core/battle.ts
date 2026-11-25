/**
 * 战斗核心（与引擎无关，可在 Node 里跑、也可直接被 Cocos 的 TS 引）。
 *
 * 坐标系：原作横屏网格 71 列(=X，纵向推进方向) × 14 行(=Y，车道)。
 *  - worldX ∈ [0, 70]：推进方向。我方 A 从大往小打，敌方 B 从小往大打。
 *  - worldY ∈ [0, 13]：车道，跨车道不镜像。
 *  - 竖屏只做投影（见 project()），逻辑坐标一个都不改 —— 这是 `PROJECT_BRIEF §6` 的口径。
 *
 * 数值全部照 `docs/04b`：
 *  - 命中 `rand()%300 < 战力`，战力 = 150 + 兵种相克 + 阵形相克
 *  - 士兵无 HP，命中即死；主将有 HP
 *  - 技力 MP 决定能不能放，气力 POWER×1200 决定节奏
 */
import type { FormationTable, GameData, MatrixTable } from '../types';

export const TICK_HZ = 30;
export const GRID_W = 71;
export const GRID_H = 14;
/** 竖屏战场带 750×900，71 列压进 750 宽 → 每列 10.56 px？不：纵深方向才是 750 宽 */
export const SCALE = 750 / 1008; // 0.7440（1 格纵深 = 96 px × 0.744 = 71.4 屏 px，见 docs/02）
export const ROW_PX = 96 * SCALE; // 71.43 屏 px / 格纵深
export const LANE_PX = 750 / GRID_H; // 53.57 屏 px / 车道

export const MOVE_PER_TICK = 0.09; // ≈2.7 格/秒
export const ENGAGE_RANGE = 1.15;
export const ATTACK_COOLDOWN = 120; // tick → 4 s
export const SEP_D = 0.55;
export const SEP_PUSH = 0.03;

export const QI_MAX = 120000;
export const QI_REGEN_PER_TICK = 200;
/** 【新设计】原作 POWER 恒 100 → 一次吃满整条气；原型缩到 10% 便于一局放多次 */
export const QI_COST_SCALE = 120;
export const MP_BASE = 60;

export type Side = 'A' | 'B';

export interface GeneralState {
  side: Side;
  name: string;
  str: number;
  int: number;
  hp: number;
  maxHp: number;
  mp: number;
  mpMax: number;
  qi: number;
  level: number;
  exp: number;
  alive: boolean;
  aiTimer: number;
}

export interface Unit {
  side: Side;
  x: number;
  y: number;
  alive: boolean;
  cd: number;
  isGeneral?: false;
}

export interface Fx {
  seq: number;
  kind: 'heal' | 'strike' | 'aoe';
  x: number;
  y: number;
  r: number;
  ttl: number;
  side: Side;
}

export interface SideConfig {
  /** 阵形下标 0..8 */
  formation: number;
  /** 兵种下标 0..12 */
  troop: number;
  morale: number;
  soldiers: number;
  general: { name?: string; str: number; int: number; level?: number };
}

export interface CreateOptions {
  data: GameData;
  seed?: number;
  a?: Partial<SideConfig>;
  b?: Partial<SideConfig>;
  /** 哪一侧由 AI 放技，默认 B */
  aiSides?: Partial<Record<Side, boolean>>;
}

export interface SideRuntime extends SideConfig {
  general: GeneralState;
  start: number;
  aliveCount: number;
  troopBonus: number;
  formationBonus: number;
}

export interface World {
  data: GameData;
  tick: number;
  over: boolean;
  endReason: 'troops' | 'general' | null;
  winner: Side | null;
  units: Unit[];
  sides: Record<Side, SideRuntime>;
  fx: Fx[];
  rng: () => number;
  aiSides: Record<Side, boolean>;
  /** 统计（调试/验收用）：每侧的出手次数与命中次数 */
  stats: { attacksA: number; attacksB: number; hitsA: number; hitsB: number };
  settled?: SettleResult;
}

export interface CastResult {
  ok: boolean;
  reason?: 'mp' | 'qi' | 'general-dead' | 'over' | 'no-magic' | 'no-target';
  killed?: number;
  healed?: number;
  mp?: number;
  qi?: number;
}

export interface SettleResult {
  winner: Side | 'draw';
  mode: 1 | 2;
  modeName: string;
  enemyLevel: number;
  durationSec: number;
  kills: number;
  score: number;
  expGain: number;
  meritGain: number;
  levelUp: number;
  level: number;
  exp: number;
  nextLevelAt: number;
  record: { wins: number; losses: number };
}

/** mulberry32：小而稳的确定性 PRNG，同 seed 同序列 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellAt(y: number, x: number): { gx: number; gy: number } {
  return { gx: x, gy: y };
}

/** 阵形落位：返回 100 人（或 N 人）在 71×14 网格上的格坐标 */
export function formationCells(
  table: FormationTable,
  formation: number,
  soldiers: number,
  side: Side,
): { gx: number; gy: number }[] {
  const slot = table.slots[formation] ?? table.slots[0]!;
  const want = String(soldiers);
  const key = slot.fill[want] ? want : String(100);
  const entries = slot.fill[key] ?? [];
  const n = entries.length;
  const shift = Math.floor((200 - n) / 25);
  return entries.map((e) => {
    let gx = e.x + slot.anchorX + shift;
    if (side === 'A') gx = GRID_W - 1 - gx;
    return { gx, gy: e.y };
  });
}

export function createWorld(opts: CreateOptions): World {
  const { data } = opts;
  const mk = (side: Side, src: Partial<SideConfig> | undefined): SideRuntime => {
    const cfg: SideConfig = {
      formation: 0,
      troop: side === 'A' ? indexOr(data.troops, '大刀', 2) : indexOr(data.troops, '黄巾', 10),
      morale: 60,
      soldiers: 100,
      general: { str: 80, int: 60, level: 1 },
      ...(src ?? {}),
    } as SideConfig;
    const int = cfg.general.int;
    const g: GeneralState = {
      side,
      name: cfg.general.name ?? (side === 'A' ? '我軍主將' : '敵軍主將'),
      str: cfg.general.str,
      int,
      hp: 100 + cfg.general.str,
      maxHp: 100 + cfg.general.str,
      mp: MP_BASE + Math.floor(int / 2),
      mpMax: MP_BASE + Math.floor(int / 2),
      qi: QI_MAX,
      level: cfg.general.level ?? 1,
      exp: 0,
      alive: true,
      aiTimer: 300,
    };
    return { ...cfg, general: g, start: cfg.soldiers, aliveCount: cfg.soldiers, troopBonus: 0, formationBonus: 0 };
  };

  const a = mk('A', opts.a);
  const b = mk('B', opts.b);
  const world: World = {
    data,
    tick: 0,
    over: false,
    endReason: null,
    winner: null,
    units: [],
    sides: { A: a, B: b },
    fx: [],
    rng: mulberry32(opts.seed ?? 1),
    // 默认两侧都不放技：AI 放技是显式 opt-in，否则镜像局里 "B 有 AI" 会变成系统性优势
    aiSides: { A: opts.aiSides?.A ?? false, B: opts.aiSides?.B ?? false },
    stats: { attacksA: 0, attacksB: 0, hitsA: 0, hitsB: 0 },
  };

  for (const side of ['A', 'B'] as const) {
    const rt = world.sides[side];
    const cells = formationCells(data.formations, rt.formation, rt.soldiers, side);
    for (const c of cells) {
      world.units.push({ side, x: c.gx, y: c.gy, alive: true, cd: Math.floor(world.rng() * 20) });
    }
    const gen = rt.general;
    const own = world.units.filter((u) => u.side === side);
    const minX = Math.min(...own.map((u) => u.x));
    const maxX = Math.max(...own.map((u) => u.x));
    const gy = 6.5;
    world.units.push({
      side,
      x: side === 'A' ? maxX + 2 : minX - 2,
      y: gy,
      alive: true,
      cd: 0,
      isGeneral: true,
    } as Unit & { isGeneral: true });
    gen.hp = gen.maxHp;
  }
  recompute(world);
  return world;
}

function indexOr(table: MatrixTable, name: string, fallback: number): number {
  const i = table.names.indexOf(name);
  return i >= 0 ? i : fallback;
}

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/** 战力 = 150 + 兵种相克 + 阵形相克（士气项在 v1 里不参与，见 docs/04b §4） */
export function powerOf(world: World, side: Side): number {
  return 150 + world.sides[side].troopBonus + world.sides[side].formationBonus;
}

export function troopBonus(data: GameData, aTroop: number, bTroop: number): number {
  return data.troops.matrix[aTroop]?.vs[bTroop] ?? 0;
}

export function formationBonus(data: GameData, aForm: number, bForm: number): number {
  return data.formations.matrix[aForm]?.vs[bForm] ?? 0;
}

function nearestEnemy(world: World, u: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const v of world.units) {
    if (!v.alive || v.side === u.side) continue;
    const d = Math.hypot(v.x - u.x, v.y - u.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

export function step(world: World): void {
  if (world.over) return;
  world.tick++;

  // 阶段 1：移动（主将不前进——原作主将压后阵，不是冲锋单位；
  // 否则两军主将会同时走向中线，谁先到谁先挨打，镜像局变成 100% 一侧胜）
  // 先算位移、再统一应用：否则先遍历的一侧用"旧位置"、后遍历的一侧用"新位置"，
  // 几百 tick 积累下来会把战线几何系统性地偏给某一侧（实测镜像局会 100% 一边胜）。
  const moves: { u: Unit; dx: number; dy: number }[] = [];
  for (const u of world.units) {
    if (!u.alive || u.isGeneral) continue;
    const target = nearestEnemy(world, u);
    if (!target) continue;
    const dx = target.x - u.x;
    const dy = target.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > ENGAGE_RANGE && d > 1e-6) moves.push({ u, dx: (dx / d) * MOVE_PER_TICK, dy: (dy / d) * MOVE_PER_TICK });
  }
  for (const m of moves) {
    m.u.x = Math.max(0.2, Math.min(GRID_W - 1.2, m.u.x + m.dx));
    m.u.y = Math.max(0.2, Math.min(GRID_H - 1.2, m.u.y + m.dy));
  }

  // 阶段 1.5：分离力（没有它 100 人会叠成一个点）
  applySeparation(world);

  // 阶段 2：收集攻击意图（不立即结算，否则先遍历的一侧每 tick 占先手）
  const intents: { from: Unit; to: Unit }[] = [];
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.cd > 0) {
      u.cd--;
      continue;
    }
    const target = nearestEnemy(world, u);
    if (!target) continue;
    if (Math.hypot(target.x - u.x, target.y - u.y) > ENGAGE_RANGE) continue;
    u.cd = ATTACK_COOLDOWN;
    intents.push({ from: u, to: target });
  }

  // 阶段 3：统一结算
  for (const { from, to } of intents) {
    if (from.side === 'A') world.stats.attacksA++;
    else world.stats.attacksB++;
    const power = powerOf(world, from.side);
    const roll = world.rng() * 300;
    if (roll >= power) continue;
    if (from.side === 'A') world.stats.hitsA++;
    else world.stats.hitsB++;
    if (to.isGeneral) {
      const g = world.sides[to.side].general;
      const dmg = Math.max(1, Math.round(((from as Unit & { isGeneral?: boolean }).isGeneral ? 12 : 6) + world.rng() * 6));
      g.hp -= dmg;
      if (g.hp <= 0) {
        g.hp = 0;
        g.alive = false;
        to.alive = false;
      }
    } else {
      to.alive = false;
    }
  }

  tickSkills(world);
  recompute(world);
  checkOver(world);
}

function applySeparation(world: World): void {
  const buckets = new Map<string, Unit[]>();
  for (const u of world.units) {
    if (!u.alive || u.isGeneral) continue;
    const k = `${Math.floor(u.x / 2)},${Math.floor(u.y / 2)}`;
    const arr = buckets.get(k);
    if (arr) arr.push(u);
    else buckets.set(k, [u]);
  }
  for (const [k, arr] of buckets) {
    const [cx, cy] = k.split(',').map(Number) as [number, number];
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const other = buckets.get(`${cx + ox},${cy + oy}`);
        if (!other) continue;
        for (const p1 of arr) {
          for (const p2 of other) {
            if (p1 === p2) continue;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const d = Math.hypot(dx, dy);
            if (d > SEP_D || d < 1e-6) continue;
            const nx = dx / d;
            const ny = dy / d;
            p1.x -= nx * SEP_PUSH;
            p1.y -= ny * SEP_PUSH;
            p2.x += nx * SEP_PUSH;
            p2.y += ny * SEP_PUSH;
          }
        }
      }
    }
  }
}

function recompute(world: World): void {
  for (const side of ['A', 'B'] as const) {
    const rt = world.sides[side];
    rt.aliveCount = world.units.filter((u) => u.side === side && u.alive && !(u as Unit & { isGeneral?: boolean }).isGeneral).length;
    const other = world.sides[opposite(side)];
    rt.troopBonus = troopBonus(world.data, rt.troop, other.troop);
    rt.formationBonus = formationBonus(world.data, rt.formation, other.formation);
  }
}

function checkOver(world: World): void {
  const aGen = world.sides.A.general.alive;
  const bGen = world.sides.B.general.alive;
  if (!aGen || !bGen) {
    world.over = true;
    world.endReason = 'general';
    world.winner = aGen ? 'A' : bGen ? 'B' : 'draw';
    return;
  }
  const aN = world.sides.A.aliveCount;
  const bN = world.sides.B.aliveCount;
  if (aN === 0 || bN === 0) {
    world.over = true;
    world.endReason = 'troops';
    world.winner = aN > 0 ? 'A' : bN > 0 ? 'B' : 'draw';
  }
}

export function magicBySeq(data: GameData, seq: number): Magic | undefined {
  return data.magics.find((m) => m.SEQUENCE === seq);
}

export function skillKindOf(data: GameData, seq: number): 'heal' | 'strike' | 'aoe' | null {
  if (seq === 1) return 'heal';
  if (seq === 50) return 'strike';
  if (seq === 104) return 'aoe';
  const m = magicBySeq(data, seq);
  if (!m) return null;
  if (m.ATTRIB?.includes('補血') || m.ATTRIB?.includes('补血')) return 'heal';
  return m.ATTACK >= 40 ? 'aoe' : 'strike';
}

export function qiCostOf(data: GameData, seq: number): number {
  const m = magicBySeq(data, seq);
  if (!m) return Infinity;
  return m.POWER * QI_COST_SCALE;
}

export function cast(world: World, side: Side, seq: number, tx: number, ty: number): CastResult {
  if (world.over) return { ok: false, reason: 'over' };
  const rt = world.sides[side];
  const g = rt.general;
  const m = magicBySeq(world.data, seq);
  if (!m) return { ok: false, reason: 'no-magic' };
  if (!g.alive) return { ok: false, reason: 'general-dead' };
  const qi = qiCostOf(world.data, seq);
  if (g.mp < m.MP) return { ok: false, reason: 'mp' };
  if (g.qi < qi) return { ok: false, reason: 'qi' };

  g.mp -= m.MP;
  g.qi -= qi;
  const kind = skillKindOf(world.data, seq);
  let killed = 0;
  let healed = 0;

  if (kind === 'heal') {
    const before = g.hp;
    g.hp = Math.min(g.maxHp, g.hp + 20 + m.ATTACK);
    healed = g.hp - before;
    world.fx.push({ seq, kind: 'heal', x: g.hp, y: 0, r: 0, ttl: 30, side });
  } else {
    const r = kind === 'aoe' ? 3.6 : 1.8;
    const rate = kind === 'aoe' ? 0.2 + m.ATTACK * 0.008 : 0.15 + m.ATTACK * 0.01;
    const p = Math.min(0.8, Math.max(0, rate));
    for (const u of world.units) {
      if (!u.alive || u.side === side) continue;
      if (Math.hypot(u.x - tx, u.y - ty) > r) continue;
      if (u.isGeneral) {
        const enemy = world.sides[u.side].general;
        enemy.hp = Math.max(0, enemy.hp - (8 + Math.floor(m.ATTACK / 2)));
        if (enemy.hp === 0) {
          enemy.alive = false;
          u.alive = false;
        }
        continue;
      }
      if (world.rng() < p) {
        u.alive = false;
        killed++;
      }
    }
    world.fx.push({ seq, kind, x: tx, y: ty, r, ttl: 30, side });
  }
  recompute(world);
  checkOver(world);
  return { ok: true, killed, healed, mp: g.mp, qi: g.qi };
}

export function tickSkills(world: World): void {
  for (const side of ['A', 'B'] as const) {
    const g = world.sides[side].general;
    if (!g.alive) continue;
    g.qi = Math.min(QI_MAX, g.qi + QI_REGEN_PER_TICK);
    if (!world.aiSides[side]) continue;
    g.aiTimer--;
    if (g.aiTimer > 0) continue;
    g.aiTimer = 300;
    const target = bestSkillTarget(world, side);
    if (target) cast(world, side, target.seq, target.x, target.y);
  }
  for (const f of world.fx) f.ttl--;
  world.fx = world.fx.filter((f) => f.ttl > 0);
}

function bestSkillTarget(world: World, side: Side): { seq: number; x: number; y: number } | null {
  const enemies = world.units.filter((u) => u.alive && u.side !== side && !u.isGeneral);
  if (enemies.length < 8) return null;
  // 找密度最高的一小片（3.6 格半径内敌兵最多）
  let best = { seq: 104, x: 0, y: 0, n: -1 };
  for (const e of enemies) {
    let n = 0;
    for (const o of enemies) if (Math.hypot(o.x - e.x, o.y - e.y) <= 3.6) n++;
    if (n > best.n) best = { seq: 104, x: e.x, y: e.y, n };
  }
  return best.n >= 8 ? { seq: best.seq, x: best.x, y: best.y } : null;
}

/** 竖屏投影：纵深(worldX) → 屏幕 Y（我方在下），车道(worldY) → 屏幕 X */
export function project(camX: number, x: number, y: number): { sx: number; sy: number } {
  return { sx: y * LANE_PX + LANE_PX / 2, sy: 550 + (x - camX) * ROW_PX };
}

/** 摄像机：两军都有兵时看双方前锋中点；一侧清空则看剩下那侧包围盒中心 */
export function camera(world: World): number {
  const half = 450 / ROW_PX;
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  let aN = 0, bN = 0;
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.side === 'A') { aN++; aMin = Math.min(aMin, u.x); aMax = Math.max(aMax, u.x); }
    else { bN++; bMin = Math.min(bMin, u.x); bMax = Math.max(bMax, u.x); }
  }
  let cam: number;
  if (aN && bN) cam = (aMin + bMax) / 2;
  else if (aN) cam = (aMin + aMax) / 2;
  else if (bN) cam = (bMin + bMax) / 2;
  else cam = GRID_W / 2;
  return Math.max(half, Math.min(GRID_W - 1 - half, cam));
}

/** 升到第 n 级所需累计经验：((n-1)*137-34)*n/2+17 */
export function expToReach(n: number): number {
  if (n <= 1) return 0;
  return (((n - 1) * 137 - 34) * n) / 2 + 17;
}

export function levelFromExp(exp: number): number {
  let n = 1;
  while (n < 99 && exp >= expToReach(n + 1)) n++;
  return n;
}

export function settle(world: World): SettleResult {
  if (world.settled) return world.settled;
  const a = world.sides.A;
  const b = world.sides.B;
  const winner = world.winner ?? 'draw';
  const mode: 1 | 2 = world.endReason === 'general' ? 1 : 2;
  const enemyLevel = b.general.level;
  const kills = b.start - b.aliveCount;
  const won = winner === 'A';
  const base = b.aliveCount * 6 + enemyLevel * (mode === 1 ? 51 : 34);
  const score = Math.max(1, Math.round(won ? base : base / 2));
  const expGain = score + Math.round(((b.general.level + 1) * 32) / Math.max(1, a.start));
  const meritGain = Math.min(100, 15 + Math.round(world.tick / TICK_HZ / 10));
  const before = a.general.level;
  a.general.exp += expGain;
  const after = Math.max(before, levelFromExp(a.general.exp));
  const levelUp = after - before;
  for (let i = 0; i < levelUp; i++) {
    a.general.maxHp += 6 + Math.floor(a.general.str / 20);
    a.general.mpMax += 3 + Math.floor(a.general.int / 25);
  }
  if (levelUp > 0) {
    a.general.hp = a.general.maxHp;
    a.general.mp = a.general.mpMax;
  }
  a.general.level = after;
  const out: SettleResult = {
    winner,
    mode,
    modeName: mode === 1 ? '歼灭' : '击退',
    enemyLevel,
    durationSec: Math.round(world.tick / TICK_HZ),
    kills,
    score,
    expGain,
    meritGain,
    levelUp,
    level: after,
    exp: a.general.exp,
    nextLevelAt: expToReach(after + 1),
    record: { wins: won ? 1 : 0, losses: won ? 0 : 1 },
  };
  world.settled = out;
  return out;
}
