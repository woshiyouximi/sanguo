/**
 * 战场 AI 的軍令派发（原作 `0x402EA5`，由 `0x444385` 每帧驱动）。
 *
 * 本文件是**纯逻辑**：不碰 DOM、不碰视图，只 `import type` `battle.ts` 的类型。
 * 它只负责「选哪条令」，真正的命令字写入由 `world.aiCommand` 钩子（`army_cmd.ts` 装）
 * 完成 —— 与 `world.armyStepPlan` 的分工一致，避免 core 内部成环依赖。
 *
 * 证据（project/173 Q3）：
 *  - `0x444385`（每帧）：若 `!([0x4a79c8] & 0x10)` 则 `--[0x4b041c]`，`<= 0` 时调
 *    `0x402EA5(0x4B03A0)` 并把倒计时写回 `0x3C`(60)；`[0x4a79c8] & 0x102` 时另一路
 *    倒计时 `[0x4a8adc]` 同形。两个倒计时都零初始化 ⇒ **入场第一帧决策一次**，之后每 60 帧。
 *  - `0x402FB4`：`w0 = 0x64`(100) = 待機，其余 0；`0x403CA3 call 0x4687A0` 加权无放回抽样；
 *    `0x403CB4` 与 6 比较后跳表：case 0 无动作 / 2 → `0x4448B2` 全軍突擊 / 4 → `0x44497F`
 *    全軍前進 / 5 → `0x44493D` 全軍撤退 / 1、3、6 本轮未定位。
 *  - `0x4031B5`：`bit & 4` 时 `w2 += 0xC`(12)，另两条加成 `+0x96`(150) / `+0x3E8`(1000)。
 */
import type { Side, World } from './battle';
// R115：`0x4687A0` 的加权抽样在原作里也是 `rand()%sum`（`0x450117`）；接线了 `world.roll` 就走它
import type { SangoRng } from './sango_rng';

/**
 * 决策周期 = 60 帧（`0x444385` 的 `mov [倒计时], 0x3C`，见 project/173 Q3）。
 * 注意它不是行动闸门的 40，两者互相独立：先到 60 帧的决策改命令字，命令字再由
 * 每个单位自己的 40 帧闸门执行。
 */
export const AI_PERIOD = 60;

/** `0x402FB4` `mov [0x4c6bc0], 0x64`：待機（什么都不做）的默认权重 */
export const AI_W_NONE = 100;
/** `0x4031B5`：突擊基准 `+0xC`（12） */
export const AI_W_RUSH = 0xc;
/** 前進（case 4）的基准权重：摘录未直接给出 `0x4031B5` 之外的行，按同一 `+0xC` 记 `[推测]` */
export const AI_W_ADVANCE = 0xc;
/** `0x4031B5` `if(0x43B6E4(army)==4) w2 += 0x96`：前线单位数正好 4 时突擊再 +150 */
export const AI_W_RUSH_FRONTLINE = 0x96;
/** `0x4031B5` `if(0x406622(enemy+0x6c)==3 && 0x406622(ours+0x6c)!=3) w2 += 0x3E8`：兵种克制 +1000 */
export const AI_W_RUSH_COUNTER = 0x3e8;

/** 决策候选在权重表里的下标（与 `0x402EA5` 的跳表下标一致） */
const CASE_NONE = 0;
const CASE_RUSH = 2;
const CASE_ADVANCE = 4;
const CASE_RETREAT = 5;

/** 每侧的下次决策倒计时（`[0x4b041c]` / `[0x4a8adc]` 的镜像）。零初始化 ⇒ 第一帧决策 */
const COUNTDOWN = new WeakMap<World, Record<Side, number>>();

function countdownOf(world: World): Record<Side, number> {
  let c = COUNTDOWN.get(world);
  if (!c) {
    c = { A: 0, B: 0 };
    COUNTDOWN.set(world, c);
  }
  return c;
}

/** 该侧还有多少士兵（主将不算；原作 `army+0x5c`） */
function soldiersOf(world: World, side: Side): number {
  let n = 0;
  for (const u of world.units) if (u.alive && u.side === side && !u.isGeneral) n++;
  return n;
}

/**
 * 前线单位数（`0x43B6E4(army)`）。
 *
 * `[推测]` 本作每个士兵是独立 `Unit`、没有原作的 8 个小队槽，所以按 `army_cmd.ts`
 * 的**五军投影**折算：把「压到敌军团列 ±3 格内」的部队按 前/後/左/右/中 归并，
 * 数有几个军到了前线（0..5）。原作的 `==4`（8 槽里的 4 个）在地图上就是"半数以上
 * 部队已接敌"，五军口径下取同一个 4。
 */
export function frontlineUnits(world: World, side: Side): number {
  const foe: Side = side === 'A' ? 'B' : 'A';
  let foeCol: number | null = null;
  for (const u of world.units) {
    if (u.alive && u.isGeneral && u.side === foe) {
      foeCol = Math.round(u.x);
      break;
    }
  }
  if (foeCol === null) return 0;
  const ours = world.units.filter((u) => u.alive && u.side === side && !u.isGeneral);
  if (ours.length === 0) return 0;
  const xs = ours.map((u) => Math.round(u.x)).sort((a, b) => a - b);
  const midX = xs[Math.floor(xs.length / 2)] ?? 0;
  const midY = 6.5;
  const centerR = 13 / 6;
  const toFoe = side === 'A' ? -1 : 1;
  const seen = new Set<number>();
  for (const u of ours) {
    const gx = Math.round(u.x);
    const gy = Math.round(u.y);
    const engaged = side === 'A' ? gx <= foeCol + 3 : gx >= foeCol - 3;
    if (!engaged) continue;
    seen.add((gx - midX) * toFoe >= 0 ? 1 : 2); // 前 / 後
    seen.add(gy < midY ? 4 : 8); // 左 / 右
    if (Math.abs(gy - midY) <= centerR) seen.add(16); // 中
  }
  return seen.size;
}

/**
 * 兵种是否克制对方（`0x406622(enemy+0x6c)==3 && 0x406622(ours+0x6c)!=3`）。
 *
 * `0x406622` 的返回值语义本轮未定（`[推测]`），这里用 `troops.json` 的相克矩阵
 * `matrix[我方].vs[敌方] > 0` 表达"我克他"；表值与 `troopBonus()` 同源。
 */
export function counterAdvantage(world: World, side: Side): boolean {
  const foe: Side = side === 'A' ? 'B' : 'A';
  const ours = world.sides?.[side]?.troop ?? 0;
  const theirs = world.sides?.[foe]?.troop ?? 0;
  const row = world.data?.troops?.matrix?.[ours] as { vs?: number[] } | undefined;
  return (row?.vs?.[theirs] ?? 0) > 0;
}

/**
 * 本次决策的权重表（长度 7，下标 = `0x402EA5` 的 case）。
 *
 * 加成只在**有兵**时给（`0x4030EC`：`army+0x5c <= 0` 时清 `bit1|2|8`，即不能前進/突擊/撤退）；
 * case 1/3/6 本轮未定位，权重恒 0。
 */
export function aiWeights(world: World, side: Side): number[] {
  const w = [AI_W_NONE, 0, 0, 0, 0, 0, 0];
  if (soldiersOf(world, side) <= 0) return w;
  w[CASE_ADVANCE] = AI_W_ADVANCE;
  w[CASE_RUSH] = AI_W_RUSH;
  if (frontlineUnits(world, side) === 4) w[CASE_RUSH] += AI_W_RUSH_FRONTLINE;
  if (counterAdvantage(world, side)) w[CASE_RUSH] += AI_W_RUSH_COUNTER;
  return w;
}

/** 加权抽一个 case（`0x4687A0` 无放回抽样的第一个；其余候选不参与本次分派） */
function pickCase(weights: readonly number[], rng: () => number, roll?: SangoRng | null): number {
  let sum = 0;
  for (const v of weights) sum += Math.max(0, v);
  if (sum <= 0) return CASE_NONE;
  // R115：接线了原作流就走 `rand()%n`，否则维持 `floor(rng()*sum)`
  let r = roll ? roll.int(sum) : Math.floor(rng() * sum);
  for (let i = 0; i < weights.length; i++) {
    const v = Math.max(0, weights[i] ?? 0);
    if (r < v) return i;
    r -= v;
  }
  return CASE_NONE;
}

/**
 * 一侧决策一次（`0x402EA5`）。
 *
 * 选 2（突擊）时执行**两条命令的组合**：`0x44497F` 只写槽 0 = 1（主将前進）、
 * `0x4448B2` 只写槽 1..7 = 7（小队突擊）—— 两条合起来才是全军压上。
 */
export function decideBattleAi(world: World, side: Side): number {
  const weights = aiWeights(world, side);
  const pick = pickCase(weights, world.rng, world.roll);
  if (pick === CASE_RUSH) {
    world.aiCommand?.(world, side, 'advance');
    world.aiCommand?.(world, side, 'rush');
  } else if (pick === CASE_ADVANCE) {
    world.aiCommand?.(world, side, 'advance');
  } else if (pick === CASE_RETREAT) {
    world.aiCommand?.(world, side, 'retreat');
  }
  return pick;
}

/**
 * `0x444385`：每帧推进两侧的决策倒计时，到点的那一侧决策一次（并写回 60）。
 *
 * `world.aiSides[side]` 为 false 时整侧停摆 —— 同 seed 的两世界对比测试不受影响。
 */
export function tickBattleAi(world: World): void {
  if (world.over) return;
  const cd = countdownOf(world);
  for (const side of ['A', 'B'] as const) {
    if (!world.aiSides?.[side]) continue;
    const next = cd[side] - 1;
    if (next > 0) {
      cd[side] = next;
      continue;
    }
    cd[side] = AI_PERIOD;
    decideBattleAi(world, side);
  }
}

/** 该侧还要几帧才决策（`[0x4b041c]` 的只读镜像，测试/HUD 用） */
export function aiCountdownOf(world: World, side: Side): number {
  return countdownOf(world)[side];
}

/** 单元测试用：把某一侧倒计时归零，让它下一帧就决策 */
export function resetAiCountdown(world: World, side?: Side): void {
  const c = countdownOf(world);
  if (side) c[side] = 0;
  else {
    c.A = 0;
    c.B = 0;
  }
}
