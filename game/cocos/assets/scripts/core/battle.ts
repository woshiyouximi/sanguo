/**
 * 战斗核心（与引擎无关，可在 Node 里跑、也可直接被 Cocos 的 TS 引）。
 *
 * 坐标系：原作横屏网格 71 列(=X，纵向推进方向) × 14 行(=Y，车道)。
 *  - worldX ∈ [0, 70]：推进方向。我方 A 从大往小打，敌方 B 从小往大打。
 *  - worldY ∈ [0, 13]：车道，跨车道不镜像。
 *  - 竖屏只做投影（见 project()），逻辑坐标一个都不改 —— 这是 `PROJECT_BRIEF §6` 的口径。
 *
 * 数值全部照 `docs/04b` / `docs/04b4`：
 *  - 命中 `rand()%300 < p`
 *  - 兵→兵 p = 战力 = 150 + 兵种相克 + 地形 + 阵形相克 + (士气−50)/5（04b §2.5 / 04b:249）
 *  - 兵→将 p = 150 − 武力×20/100（04b4:171）；将→兵 p = 150 + 武力/2（04b4:189-191）
 *  - 目标本 tick 在移动 → p × 2/3（04b4:173，原作 `0x43BE08` 未站定）
 *  - 士兵无 HP，命中即死；主将有 HP
 *  - 技力 MP 决定能不能放，气力 POWER×1200 决定节奏
 */
import type { FormationTable, GameData, Magic, MatrixTable } from '../types';
import { learnedAtLevelUp, resolvePostBattle } from './capture';
import type { LearnedSkill, PostBattleReport, PostGeneral } from './capture';
// 勸降轉將（Execute 33）：戰中只留標記，名單變動走 roster 的招降路徑（見 `settle()`）
import { markDefectedCapture } from './roster';
import { loadMagicProgram, startSkill, type SkillSession } from './smartscript/runtime';
import { dispatchSyscall, type SyscallContext } from './smartscript/syscalls';
import { ScriptVm, type Slot, type VmHost } from './smartscript/vm';
import { DamageHost } from './syso_host';
import { skillKindOfEx } from './skill_kind';
import { wiseAppliedAtStart, wiseBonus } from './wises';
import { normalizeWeather, weatherHitMod, weatherOf } from './weather';
// R115：原作乱数发生器（`0x450132`）。给了 `CreateOptions.roll` 才走它，缺省仍是 mulberry32，
// 既有 139 处 `seed:` 用例的确定性断言一位都不动。
import type { SangoRng } from './sango_rng';
// R37 策略派發 / 援軍：純邏輯在 strategy.ts，本檔只做接線（見 project/61_策略与援军.md）
import {
  ARMY_FLAG,
  QI_TIER_MUL,
  REGEN_ACC_MAX,
  emptyArmyStatus,
  planReinforceGroups,
  tickReinforce,
  tickStrategy,
} from './strategy';
import type { ArmyStatus, LogEntry, ReinforceConfig, ReinforceGroup, StrategyEvent } from './strategy';
// 战场 AI（原作 `0x402EA5` / `0x444385`）。battle_ai.ts 只 `import type` 本文件的类型，
// 运行时不反向依赖 —— 这里的 import 不会成环。
import { tickBattleAi } from './battle_ai';
// 镜头夹取的**唯一真源**（见 `project/201_透视边界与摄像机.md`）：旧代码在这里写死
// `±450/ROW_PX`（±6.3 行），那是等距投影时代的半屏行数；R193 改成透视后近排被放大，
// 夹到 63.7 时最后一排的脚落到 1034.6（比 FIELD_BOTTOM 低 34.6px、被控制台盖住）。
// 端点由 `field.ts` 从「带沿 ± 精灵身位」反解 ⇒ 这里只负责夹，不再自己算行数。
import { ROWS_FAR, clampCameraX } from './field';

/**
 * 战斗引擎 tick 率（Hz）＝ **60**。
 *
 * 这不是手感调参，是「一 tick 到底等于多少秒」的**唯一真源**（R192）。
 *
 * 证据（`project/190_主将与士兵速度裁决.md` p5，`project/192_引擎节拍60Hz.md`）：
 *  - 单位计时字段 `+0x34` 累加的是**引擎全局 tick**，不是秒：
 *    `0x43AC79 call 0x468720` 取全局 tick `[0x4A79C4]`、`0x43AC89 lock sub eax,[0x4B7B14]`
 *    得到 dt、`0x43ACF3 mov [ecx+0x34],eax` 累加；
 *  - 行动闸门 `0x43B574` 到期 `0x43B580 sub ecx,1`（每单位帧 −1），零时
 *    `0x43B5DE mov dword ptr [ecx+0x34], 0x28` 复位 —— **一单位帧 = 一引擎 tick**；
 *  - 录像实测原作 tick 率 **66–79 Hz**（两个战场倒计时 1.75 s / 1.53 s，相差 14%。
 *    `project\180_战斗HUD对齐.md` 也记 `0x444126` 每帧 −1 ⇒ 11880 帧 ≈ 198 s）。
 *
 * 取 **60** 是三次证据里**最保守**的一档（比实测下限 66 Hz 还慢 10%，宁可慢不可快，
 * 也避免 40 tick 的行动闸门比原作还密）。旧值 30 Hz 把 40 tick 映射成 1.333 s/格，
 * 而原作实测 0.507 s（主将）/ 0.602 s（弓兵）；60 Hz 下 40/60 = 0.667 s/格，
 * 是唯一能落进这个区间的整数 Hz。
 *
 * 口径：`1 tick = 1 引擎帧 = 1/60 秒`。**所有「多少秒」都写成 `N * TICK_HZ`**，
 * 别再写 `30` / `60` 这类字面值；`40`/`46`/`11880` 这类**原作 tick 计数**则保持字面值。
 */
export const TICK_HZ = 60;
export const GRID_W = 71;
export const GRID_H = 14;
/**
 * 战斗硬时限（tick）＝原作 `[0x4AC35C]` 的初始值 `0x2E68 = 11880` 帧。
 *
 * 证据（`project/180_战斗HUD对齐.md`）：
 *  - `0x444126` 每帧 `--[0x4AC35C]`、下限 0；到 0 时 `0x443CA8(0x1000)` 置「战斗结束」位；
 *  - 同一常数还被 `0x443F2A` 当战功「战斗时长」的分母（`(11880−cd)/0x78`）；
 *  - HUD 显示口径 `ceil(cd/120)`：起始 99、约 0.5/秒、整场 198 秒。
 *
 * R192 起 `TICK_HZ = 60`，与原件同频 ⇒ 直接写原作帧数 **11880**（= 198 s），
 * 不再有 `11880 / 2 = 5940` 这道 30 Hz 的折算（那是 R158 为 30 Hz 补的换算，
 * 副作用是整场看着像 198 s，实际每格却慢了一倍）。
 * 到点后由 `checkOver()` 判：`0x44411B` 的选择器在没有任何结果位（4/8 主将阵亡、1/2 撤退）时
 * 落到 `else reason=0x10`，即**双方主将都还活着就是平手**，原作不看剩余兵力（`endReason='time'`）。
 */
export const BATTLE_TICK_LIMIT = 11880;
/** 一场战斗的硬时限（秒）＝ `BATTLE_TICK_LIMIT / TICK_HZ`；HUD/战功都用它，别再另造常数。 */
export const BATTLE_SECONDS = BATTLE_TICK_LIMIT / TICK_HZ;
/** 竖屏战场带 750×900，71 列压进 750 宽 → 每列 10.56 px？不：纵深方向才是 750 宽 */
export const SCALE = 750 / 1008; // 0.7440（1 格纵深 = 96 px × 0.744 = 71.4 屏 px，见 docs/02）
export const ROW_PX = 96 * SCALE; // 71.43 屏 px / 格纵深
export const LANE_PX = 750 / GRID_H; // 53.57 屏 px / 车道

/**
 * 原作**没有**速度倍率：位移只有「行动 tick 到点 → 抽一格 → 逻辑瞬移 + 40 帧视觉滑动」一种。
 *
 * 证据（`project/155_部队指令语义.md`）：
 *  - 行动闸门 `0x43B574` 到期复位 `[u+0x34] = 0x28`(40)，到期那一帧才动/才打；
 *  - `0x43BF26` 一次只把 `u+0x8/+0xc` 改成**相邻一格**（无中间态，逻辑瞬移）；
 *  - `0x43BE42` 用 `(目标像素−当前像素)/0x28` 算速度，即视觉上用 40 帧滑完这一格。
 *
 * R158 之前本作是 `MOVE_PER_TICK = 0.09`（= 每 tick 0.09 格 ⇒ 一格 11.1 tick），
 * 比原作快 `40/11.1 ≈ 3.6×`；该常量与 `RETREAT_SPEED`/`RUSH_SPEED`/`GENERAL_CHARGE_SPEED`
 * 一起删除 —— 它们都是为连续速度模型编出来的、原作不存在的倍率。
 */
/** 一格的视觉滑动帧数（`0x43BE42` 第 4 参写死 `0x28`） */
export const ACTION_SLIDE_TICKS = 40;
export const ENGAGE_RANGE = 1.15;
/**
 * 主将行动间隔（tick）。原作主将更新器 `0x43E964` 每帧调行动节奏计时器 `0x43B574`：
 * `u->+0x34 = 0x28` = 40 帧（`docs/04b3:71-89`；处于 `0x4000` 状态时改 0x2e=46 帧并按与
 * 敌将的行动力差追加，本作未实现该分支 `[推测]`）。
 *
 * tick↔帧口径见 `project/28_脚本虚拟机移植.md:143`（1 tick = 1 虚拟帧）⇒ 40 帧 = 40 tick；
 * 再乘上 `TICK_HZ = 60`（R192，原作实测 66–79 Hz）得 **0.667 s/格**，与原作录像的
 * 0.507 s（主将）/ 0.602 s（弓兵）同量级。旧版把 40 tick 按 30 Hz 换算成 1.333 s/格，
 * 比原作慢一倍 —— 那才是「走一格像卡住」的根因（`project/190` p5）。
 *
 * R84：主将从 `ATTACK_COOLDOWN`(120) 改用它。120 出自
 * `project/09_战斗原型说明.md:104` 的手感调参（18→36→60→90→120），**没有原作 VA 依据**，
 * 也是 `project/15_数值模拟报告.md:158` 记的 `[偏差·待核]`。120 的直接后果是一发 4 秒，
 * 97 报告那次 129 秒的战斗全耗在双方各剩 1 兵之后的将将对砍上（见 project/105）。
 */
export const ACTION_INTERVAL_TICKS = 40;
/**
 * 士兵/小队行动间隔（tick）＝原作 **40 帧**。
 *
 * 旧值 120 是原型手感值（`project/09_战斗原型说明.md:104` 的 18→36→60→90→120），
 * `project/15_数值模拟报告.md:158` 记作 `[偏差·待核]`。R113 补了原作证据，改回 40：
 *  - 行动节奏计时器 `0x43B574` 本身与兵种无关，复位时**硬编码** `[u+0x34] = 0x28`(40)
 *    （`work/dis_battle_units.txt:1624`，`0043B5DE mov dword ptr [ecx+0x34], 0x28`）；
 *    只有 `[u+0x3c] != 0` 走脚本接管分支、以及 `flags & 0x4000` 时改 `0x2e`(46) 两个例外。
 *  - 小队更新器 `0x43D125`（`docs/04b3:41-47`）在 `0x43D24B` 就用**同一个** `0x43B574(u)`
 *    （参数 `[u+0x84]`＝该小队的代表兵）开它的整套行动块：计时器没到期就 `je 0x43d3b3`
 *    只做逐帧动画更新，到期才找目标/掷伤害/发动画事件（`work/dis_battle_units.txt:4136-4239`）。
 *  - 主将更新器 `0x43E964` 在 `0x43EB50` 是**逐行同形**的调用（同文件 `:6205`），
 *    故主将/士兵在原作里共用 40 帧，士兵没有独立值。
 * 逐帧移动 vs 40 帧一次的"行动"（选目标+掷伤+动画事件）的分工也与本作一致（移动每 tick、攻击
 * 由 `actionIntervalOf` 把闸），所以这就是 1:1 的对应值，而不是新调的手感值。
 */
export const ATTACK_COOLDOWN = 40;
/**
 * `0x4000` 态下的行动间隔。
 *
 * R150 更正（`work\re_speed\state4000.txt`）：`0x4000` 是**撤退/溃退态**，不是"主将专属"，
 * 置位点在 `0x4447E2`（全军撤退）、`0x444858`（逐个**小队**，`lea edx,[ecx+eax+0xb4]`、
 * `eax=i*0x48`）、`0x43C827/0x43CCD9`（溃退包装）——军团与全部小队都会置。
 *
 * 46 与正常 40 写的是**同一个字段** `[u+0x34]`（`0x43B5DE c7 41 34 28` / `0x43B5FD c7 40 34 2e`），
 * 所以这里表达"退却时这一步的间隔是 46"。R158 起撤退也是「一次一格」，不再有位移放大，
 * 46 就是退却单位真实的抽格间隔（`0x4000` 置位见 `requestRetreat()`）。
 */
export const GENERAL_SLOW_INTERVAL = 46;
/**
 * 该单位的行动间隔（tick）。两个常量分开留着是为了保留两条独立的证据链
 * （主将 `0x43B574` 直证 / 士兵 `0x43D125`→`0x43B574` 间接证），数值当前都是 40。
 */
export function actionIntervalOf(u: Unit): number {
  // `0x43B574`：`flags & 0x4000` 时把**同一个字段** `[u+0x34]` 改成 `0x2e`(46)。
  // 原作不区分主将/士兵，所以撤退态对两者都生效（R158 收紧：旧代码只对主将生效）。
  if (isRetreating(u)) return GENERAL_SLOW_INTERVAL;
  if (u.isGeneral) return ACTION_INTERVAL_TICKS;
  return ATTACK_COOLDOWN;
}

/**
 * 攻击锁定长度（`unit+0x38`；`0x43BCA7` 开头 `if (--u->+0x38 > 0) return 0`）。
 *
 * 原作按兵种查表：`0x4862BC + idx*0x38` 的 `+0x1C/+0x20/+0x24/+0x28` 是四个变体列
 * （`0x406717(mask, cls, variant)` 选列）。这里取第 0 列，兵种序 = `data/troops.json`
 * 的 names 序（0 朴刀 … 12 女兵）。提取见 `work/orig_battle_behavior/07b_unit_table_4862BC.txt`。
 */
export const ATK_LOCK_BY_TROOP: readonly number[] = [1, 1, 1, 3, 1, 2, 1, 1, 1, 1, 1, 3, 1];

/**
 * 攻击射程（`0x4862BC` 的 `+0/+4` 两个 dword，`0x43B961` 读它）。
 *
 * 原表 `rng0` 列：朴刀/长枪/大刀/链锤/武斗/蛮族/铁缒/藤甲/黄巾 = 1，**弓箭 99、飞刀 16、弩兵 99**，
 * 女兵 1（`rng1` 列另有 弓箭 99 / 链锤 6 / 飞刀 24 / 弩兵 1）。远程兵种的整行射程要配
 * 箭矢动画（`0x10007`）与逐格飞行结算，本版先只开近战；扫描本身已按 `1..atkRange` 通用实现。
 */
export const ATK_RANGE_BY_TROOP: readonly number[] = [1, 1, 1, 99, 1, 16, 1, 1, 1, 1, 1, 99, 1];

/** 本单位出手后要锁几个行动周期：主将恒 1（`0x43EBA7`），小队查 {@link ATK_LOCK_BY_TROOP} */
export function atkLockOf(world: World, u: Unit): number {
  if (u.isGeneral) return 1;
  const troop = world.sides[u.side]?.troop ?? 0;
  return ATK_LOCK_BY_TROOP[troop] ?? 1;
}

/** 本单位的攻击射程（缺省 1；{@link Unit.atkRange} 可覆写，表见 {@link ATK_RANGE_BY_TROOP}） */
export function attackRangeOf(u: Unit): number {
  return u.atkRange ?? 1;
}

/**
 * 撤退/溃退态（`0x4000`）的判定与打标（R159，`project/160_撤退态0x4000.md`）。
 *
 * 原作有**两处**代码写这一位，写的是同一件事：
 *  - **命令入口**：`0x4447B7` 把 8 个命令槽全写 8 之后**无条件**置军团位（`0x4447E2`），
 *    紧接着 `for (i=0;i<[army+0x58];i++) SetState(army+0xB4+i*0x48, 0x4000)`（`0x444858`，
 *    stride 0x48）把每个小队也置上 —— 即「全軍撤退令下达那一刻」。
 *  - **每步执行 cmd 8 时**幂等重打标：主将 `0x43C827`（`0x43CF07` 表 [8]→`0x43CF67`）、
 *    小队 `0x43CCD9`（`0x43CFB1` 表 [8]→`0x43D0BD`）。
 *
 * **清除点不存在**（R159 全程序搜过：`ClearState 0x43B538` 只有 2 个 caller，mask 分别是
 * `0x1000`/`0x100`；`or/xor 0x4000` 立即数 0 条；`~0x4000` 0 条；`mov [..+0x2c],0` 的 11 组
 * 全打在 `[u+0x44]+0x2c`），所以一场战斗内**单向不可逆** —— 这也正是原作「撤退令不能反悔」
 * 的机制原因。因此这里**只提供打标、不提供清除**。
 *
 * 可见行为（都有地址，`project/160` §3）：抽格间隔 40→46；每周期位移 2 小步→**1 小步**
 * （`0x43BD06` vs `0x43BCE1`）且**只许倒走**（`0x43BD64`）；**不主动接敌**（`0x43C132`
 * 直接返回、跳过步进）；敌人会**专门找撤退中的单位打**（`0x43D76C` 探 `isRetreating`）。
 */
export function isRetreating(u: Unit): boolean {
  return (((u.status ?? 0) & 0x4000) !== 0) || u.flee === true;
}

/** 给单位打上撤退态（幂等）。`0x43CCD9` 每步都会重打一次，这里同样允许重复调用。 */
export function markRetreating(u: Unit): void {
  u.status = (u.status ?? 0) | 0x4000;
}

/**
 * 士气 → 战力：原作 `((short)g->+0x38 - 0x32) / 5`（docs/04b §2.5、04b:249）。
 * 士气 0 → −10、50 → 0、80 → +6、100 → +10。这是原作唯一把士气转成战力的地方。
 */
export const MORALE_BASE = 50;
export const MORALE_DIV = 5;
/**
 * 士气项阻尼：**1 = 原作系数**（`idiv 5`，`0x44302C`）。
 * 这里恒为 1 —— 曾一度设成 2（系数减半）来压跨度，那属于我们的手感调整，
 * 与「1:1 还原」冲突，已回退（docs/04b5 Q1 附注）。
 */
export const MORALE_DAMP = 1;

/** 主将随本阵推进时，压在自己后阵后面几格（原作主将压后阵，不是冲锋单位） */
export const GENERAL_GAP = 2;
/** 前锋被突破的判定：己方士兵存活比例 ≤ 这个值时，主将前出接战 */
export const GENERAL_BREAK = 0.35;

/**
 * 氣力上限 = `0x1D4C0` = 120000。
 * 证据：`work/dis_battle_units.txt:6097-6100`（`0x43E964`）`cmp [ecx+0x4c], 0x1d4c0` /
 * `jle` / `mov dword [edx+0x4c], 0x1d4c0`；同一常量也出现在 `0x43B8C8`
 * （`dis_battle_units.txt:1896`）。R47：docs/04b:91/210/273 把 60000 当成"满氣力"是错的 ——
 * 60000 只是**初值**（见 `QI_START`），满值 120000。
 */
export const QI_MAX = 120000;
/**
 * 氣力初值 = `0xEA60` = 60000。
 * 证据：`work/dis_battle_units.txt:25`（`0x442EFA`）`mov dword ptr [eax + 0x4c], 0xea60`。
 * 于是开战气力是半条，`POWER(恒 100)×1200 = 120000` 恰好等于**一整条**。
 */
export const QI_START = 60000;
/**
 * 每 tick 氣力回复 = `max(武力, 智力)`（`0x43E72E`，`work/dis_battle_units.txt:5889-5970`）：
 * `t = max(general+0x36 INT, general+0x34 STR)`，只有 `unit+0x84 & 0x20`（军师技 快速集氣/
 * 減緩集氣/保留氣力，`+0x90` 索引 0..6）时才按 130%/150%/200%/76%/66%/50% 缩放。
 * 军师技那一层由 `wises.ts` 的 `qi_regen` 百分比负责，这里只给基值。
 */
export function qiRegenOf(g: { str: number; int: number }): number {
  return Math.max(Math.round(g.str), Math.round(g.int));
}
/** 氣力消耗系数：`0x43BAE3` 是 `MagicDef_POWER × 0x1d4c0(120000) / 100` = **POWER × 1200** */
export const QI_COST_SCALE = 1200;
export const MP_BASE = 60;

export type Side = 'A' | 'B';

/**
 * 战场 AI 可以下的三种令（原作 `0x402EA5` 的分派表）：
 *  - `advance` = case 4 → `0x44497F`，`0x43ADED(army,0,1)` 只写槽 0 = 1（全軍前進）
 *  - `rush`    = case 2 → `0x4448B2`，`0x43ADED(army,0x101,7)` 只写槽 1..7 = 7（全軍突擊）
 *  - `retreat` = case 5 → `0x44493D`（全軍撤退，8 槽写 8 + `0x4000`）
 */
export type AiBattleCommand = 'advance' | 'rush' | 'retreat';

export interface GeneralState {
  side: Side;
  name: string;
  str: number;
  int: number;
  hp: number;
  maxHp: number;
  mp: number;
  mpMax: number;
  /**
   * 底值（`general+0x18` / `+0x1A`，docs/04c:205-212）：体力/技力上限公式的加数底，
   * 来自 `generals.json` 的 `BaseHP` / `BaseMP`。缺省时按 `100` / `MP_BASE(60)` 兜底
   * （无名字的临时将，例如仿真里的默认主将）。
   */
  baseHp?: number;
  baseMp?: number;
  qi: number;
  level: number;
  exp: number;
  alive: boolean;
  /** 距下次自动放技还剩多少 tick（每 10 秒一轮，见 `AI_SKILL_INTERVAL_TICKS`） */
  aiTimer: number;
  /**
   * 武将级士气（0..100）。web 层 `moraleApply()` 已经会写这个镜像字段，
   * 这里补上可选声明，`settle()` 战后扣士气才有地方落。
   * 注意：真正参与 `powerOf()` 的仍是 `sides[side].morale`（R41），
   * 本字段只是同一份数据的武将视图，两者由 `settle()` 一起写。
   */
  morale?: number;
  /** 忠诚 0..99（`general+0x3C`） */
  loyal?: number;
  /** 节操（`general+0xC7`）：战后忠诚扣减 `(10-节操)*2` 用 */
  constancy?: number;
  /** 疲劳 0..100（`general+0x3A`，project/35 的 tire）；战功写在结算时累加 */
  tire?: number;
}

export interface Unit {
  side: Side;
  x: number;
  y: number;
  /** 上一 tick 的位置：命中判定「目标本 tick 在移动 → p×2/3」用（docs/04b4:173） */
  prevX: number;
  prevY: number;
  alive: boolean;
  cd: number;
  /**
   * 兵种归属（R22）：`infantry` 步兵 / `cavalry` 骑兵。缺省（含主将）按步兵算。
   *
   * 骑兵是**独立的兵种池**，不是"马只是造型"：原作 `general+0x42`（带兵上限）与
   * `general+0x46`（骑兵上限）是两栏独立计数，升级到 21..40 级时提示
   * 「有5名士兵升為騎兵」，且步兵数溢出带兵上限时会转成骑兵（docs/04b §2.4 / §6.7）。
   * 详见 project/42_步骑与败方处置.md。
   *
   * 它**只**影响战功分（步兵 ×6 / 骑兵 ×12）与统计；落位、移动、命中、伤害一律不变。
   */
  kind?: 'infantry' | 'cavalry';
  /** 主将单位：由 createWorld 塞进 units，命中走 HitRoll_General 分支 */
  isGeneral?: boolean;
  /**
   * 主将站位（F26）：只有 `isGeneral` 的單位帶，缺省 `mid`。小兵不帶 —— 它们的列由
   * 阵形坐标决定（`formationCells()`）。同距接敌的 tie-break 只看这个字段（`nearestEnemy()`）。
   */
  col?: GeneralCol;
  /** 最近一次出手的 world.tick（视图选 attack_back 帧用） */
  lastAttackTick?: number;
  /** 最近一次挨打的 world.tick（视图选 hit_back / death_back 用） */
  lastHitTick?: number;
  /**
   * 撤退标记（R38）：本侧已下达"全军撤退"（`0x4447B7` 置 `[0x4A8AE0] |= 4`、
   * 全军转 `cmd 8` + `0x4000` 退却状态）。带此标记的单位不再寻敌，而是朝本方边界外走，
   * 走出场地即从 `world.units` 移除 —— **不算阵亡**，所以不进 `killsInf/killsCav`。
   */
  flee?: boolean;
  /**
   * `unit+0x2C` 状态位（R50）：原作对象状态字的镜像，位表见 `BATTLE_BITS` / `UNIT_STATUS`。
   *
   * 缺省 0（= 一位都没置），所以**既有对局逐位不变**。目前接上的消费点只有 bit `0x4`
   * （连击/二段判定）：`hitRoll()` 里首掷不中时按 `0x43D48C` 再掷一次 `p×2/3`。
   * 生产者（军师技 `0x4` 写这个字）在 `strategy.ts`，本轮没接 —— 见 75 报告的缺口表。
   */
  status?: number;
  /**
   * 视觉滑动（R158）：`0x43BE42` 的 40 帧插值。
   *
   * 逻辑格是 `gx/gy`（见 `unitCell`），一次行动 tick 直接瞬移一格；`x/y` 只是渲染坐标，
   * 在 `ACTION_SLIDE_TICKS`(40) 帧内从旧格线性滑到新格 —— 与 `0x43BE42` 的
   * `speed = (目标像素−当前像素)/0x28` 同构。逻辑判定（占位/攻击距离/技能瞄准）
   * **一律读 `unitCell`**，不读 `x/y`，否则又会退回连续速度模型。
   */
  slide?: UnitSlide | null;
  /**
   * 最近一次「行动 tick」的 world.tick（`0x43C20D` 要看 `other+0x30 == 当前帧`：
   * 本帧刚动作过的友军不让位）。与 `lastAttackTick` 分开：不动也算动作过。
   */
  lastActTick?: number;
  /**
   * 攻击锁定（`unit+0x38`，project/173 Q4/Q6）：出手后要跳过几个行动周期的探敌。
   *
   * 原作 `0x43BCA7` 开头 `if (--u->+0x38 > 0) return 0` —— 每个行动周期先减 1，还 >0 就
   * 本周期只走位、不找敌人；出手时由攻击序列写回（小队 `0x43D314`，主将 `0x43EBA7` 写 1）。
   * 缺省 undefined 与 0 等价（首次 -- 后是 −1，照常探敌）。
   */
  atkLock?: number;
  /**
   * 攻击射程（`0x43B961` 读 `0x4862BC` 的 `+0/+4`，缺省 1）。
   *
   * 内核的射程扫描本身是通用的（`1..atkRange` 同排 ±x），但弓箭/飞刀/弩兵的远程射程
   * 还要配箭矢动画与飞行结算才能上线，所以目前**只有近战**：不填就恒为 1。
   * 表值见 `ATK_RANGE_BY_TROOP` 与报告 §存疑。
   */
  atkRange?: number;
}

/** 移动滑动的状态（见 `Unit.slide`） */
export interface UnitSlide {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  total: number;
  done: number;
  /**
   * 本段滑动对应的**逻辑格**（`0x43BF26` 落地瞬移）。
   *
   * `tx/ty` 是视觉目标：`0x43BE42` 会加 `rand()%0x30-0x18` / `rand()%0x24-0x12` 的抖动
   * （±0.25 格），所以它们可能带小数；逻辑判定必须读 `gx/gy`。
   */
  gx?: number;
  gy?: number;
}

export interface Fx {
  seq: number;
  kind: 'heal' | 'strike' | 'aoe';
  x: number;
  y: number;
  r: number;
  /** 剩余 tick（每 tick 减 1，归零即从 world.fx 移除） */
  ttl: number;
  /**
   * 总时长（tick）。视图按 `elapsed / life` 均分动画帧，所以这个值要跟 ttl 一起给。
   * 缺省时视图退回 atlas.tickLife（30），老代码 push 的 fx 不填也能画。
   */
  life?: number;
  side: Side;
}

export interface SideConfig {
  /** 阵形下标 0..8 */
  formation: number;
  /** 兵种下标 0..12 */
  troop: number;
  morale: number;
  /**
   * 上阵总兵力 = 步兵栏 + 骑兵栏（原作 `unit+0x5C`，`0x443124`）。
   *
   * 原作口径是**两栏相加**：`min(帶兵數,帶兵上限) + min(騎兵數,騎兵上限)`，
   * 步兵与骑兵互不包含（`project/168_战场每侧单位数.md` §4 已逐地址回比 EXE）。
   * 本作沿用原作的对象布局：`soldiers` 就是这一栏之和，`cavalry` 是其中的骑兵计数，
   * 所以场上的单位数恒等于 `soldiers`（`formationCells()` 一次摆完 200 个槽）。
   * 两栏各自的**上限**见 `levels.ts` 的 `troopCapOf()` / `cavalryCapOf()`，
   * 相加口径见 `troopCapSumOf()`；旧调用只给总数时行为一位不变。
   */
  soldiers: number;
  /**
   * 骑兵数（R22）：`general+0x48` 的战场快照，是 `soldiers` 里**骑兵那一栏**的计数。
   *
   * 缺省按原作骑兵上限从等级推 `min(soldiers, clamp((等级−20)×5, 0, 100))`，
   * 见 `cavalryCapOf()` / `splitTroops()`。给显式值时以它为准（调试/截图/剧本用），
   * 仍会被 `soldiers` 截断——骑兵不可能多于总兵力。
   */
  cavalry?: number;
  /**
   * 随军副将（R54）：主将之外的**参战武将**。本版战场上只有主将能操作，
   * 副将不上场、不占兵，只在战后按 `0x40452E` 的循环逐个判定招降/斩首/释放。
   */
  officers?: PostGeneral[];
  /**
   * R37 本場帶的軍師技（`data/wises.json` 的 `SEQUENCE`）。缺省 `null` = 不帶，戰鬥中不派發策略
   * —— 這樣既有對局（測試/鏡像仿真）逐位不變；要開就顯式給。
   */
  strategy?: number | null;
  /**
   * 武將站位（F26）：`front` / `mid` / `back`，缺省 `mid`（既有對局逐格不變）。
   *
   * 原作戰前四件事之一（指南 L152「武將站位 ... 決定誰先挨打」），只挪主將的初始縱深
   * ±1 格（`colOffsetOf()` 的換算），小兵仍由陣形落位。
   */
  col?: GeneralCol;
  general: { name?: string; str: number; int: number; level?: number };
}

export interface CreateOptions {
  data: GameData;
  seed?: number;
  /**
   * 原作乱数流（R115）。给了就把它当作**战场随机源**：方位抽样走 `rand()%n`、
   * 扫描先看哪一侧走 `rand() & 1`（见 `project/133` §4.1、`project/173` :378）。
   * 不给则是 `mulberry32(seed)`，与 R208 之前逐位相同。
   */
  roll?: SangoRng;
  /**
   * 战场地形 id 0..11（`terrains.json` 的 `_index` / 原作全局 `[0x4A6694]`）。
   * 缺省 0 = 城/平地类。它只作为 `terrainBonus()` 的查表行，不影响投影与站位。
   */
  terrain?: number;
  a?: Partial<SideConfig>;
  b?: Partial<SideConfig>;
  /** 哪一侧由 AI 放技，默认 B */
  aiSides?: Partial<Record<Side, boolean>>;
  /**
   * 开战月份 1..12（R39）。给了才按「月 + 地形」推天气；不给则天气恒 0（晴），
   * 这样既有的仿真/测试曲线一位都不变。
   */
  month?: number;
  /** 直接指定天气 0..3，优先于 `month`（R39 测试用） */
  weather?: number;
  /** 战前战绩（R63）；缺省全 0，一场定胜负 */
  record?: Partial<BattleRecord>;
  /** AI 兵力劣势时自动全军撤退（R38），缺省关闭；阈值见 `AI_RETREAT_*` */
  aiRetreat?: boolean;
  /**
   * R37 援軍（`[推测]`，见 `strategy.ts` 的 `ReinforceConfig`）：
   * 守方存活兵力低于阈值时，邻城按行军距离折算出兵，N tick 后从己方后排外侧入场。
   * 缺省不配 = 没有援军，既有对局一位不变。
   */
  reinforce?: ReinforceConfig[];
  /**
   * R67 伤害通道，缺省 `script`（走 MAGIC.SO `Hurt` → `SYSCALL 0x125` → 宿主函数）。
   * `legacy` 只给对拍/回归用：两条路的伤害数字必须逐 tick 相同。
   */
  damageChannel?: DamageChannel;
}

/** 战绩（`0x4084C9`，docs/04b:550-556）：胜场 `+0x9F` / 败场 `+0xA1` / 连胜 `+0xA3` / 最高连胜 `+0xA5` */
export interface BattleRecord {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
}

export const EMPTY_RECORD: BattleRecord = { wins: 0, losses: 0, streak: 0, bestStreak: 0 };

export interface SideRuntime extends SideConfig {
  /** 本场实际骑兵数（已按带兵数截断），R22 */
  cavalry: number;
  /** 本场副将名单（`alive` 已归一化），R54 */
  officers: PostGeneral[];
  general: GeneralState;
  start: number;
  aliveCount: number;
  troopBonus: number;
  formationBonus: number;
  /** 地形项：`matrix[terrain][本侧兵种]`，−25..+25（04b §3.2） */
  terrainBonus: number;
  /** 开战步兵数（`unit+0x14` 快照，R59 战功带的"带兵差"左端） */
  startInf: number;
  /** 开战骑兵数（`unit+0x18` 快照，R59） */
  startCav: number;
  /** 当前存活步兵数（`g+0x44` 的战场视图，R59） */
  aliveInf: number;
  /** 当前存活骑兵数（`g+0x48` 的战场视图，R59） */
  aliveCav: number;
}

export interface World {
  data: GameData;
  tick: number;
  /** 本场地形 id 0..11（原作 `[0x4A6694]`）；越界值在 `terrainBonus()` 里一律按 0 处理 */
  terrain: number;
  over: boolean;
  /**
   * 结束原因（原作 `0x44411B` 的理由码，`[0x4B4C34]` 的 0x1000 位置起后选一档）：
   *  - `general` = 主将阵亡（A 位 4 / B 位 8）；
   *  - `retreat` = 一方全军撤退离场（A 位 1 / B 位 2）；
   *  - `time`    = 硬时限到点、双方主将都还活着（reason 0x10 平手）。
   * **没有「兵尽」这一档**：`army+0x5c<=0` 只清命令位，战斗要继续到主将分出死活/撤走。
   */
  endReason: 'general' | 'retreat' | 'time' | null;
  winner: Side | 'draw' | null;
  /**
   * 天气（R39）：0 晴 / 1 雨 / 2 雪 / 3 雾，见 `core/weather.ts`。
   * 原作由 `ProduceRain/Snow/Fog`（SYSCALL 11/14/11）在开战时初始化（docs/04-脚本引擎:657-658）。
   */
  weather: number;
  /**
   * 两侧战果状态码（`docs/04b:530`：**0 在场 / 2 撤退 / 3 被俘**）。
   * 原作由 `BattleYield`（SYSTEM.SO SYSCALL 13）在开战时写死两边的码
   * （`docs/04-脚本引擎:894` `BattleYield(g3,g2,g8,g7, 2,3,1)`），战斗中由 `0x4447B7` 改。
   */
  status: Record<Side, 0 | 2 | 3>;
  /** 哪一侧已经下达撤退令（`world.status[side] === 2` 的镜像，便于 `checkOver` 快速判断） */
  fled: Record<Side, boolean>;
  /**
   * 突击态（全軍突擊，R137）：哪一侧已经下了全军突击令。缺省两侧都是 false。
   *
   * 原作证据：`SYSTEM.SO` 函数 #22 `AllRush`（id=0x3B argc=0 @0x2B0C）在
   * `export\script\system_so.dis.txt:1536-1585` 的第 9 条指令是
   * `LDG 2; PUSHI 65536; SYSCALL 0x120, 0x2` —— 即 `0x120(主将, 0x10000)`。
   * `0x10000` 是「突击」命令位（`docs/04b3:419-446` 的命令字表），0x120 把它写进
   * `unit+0x6c`（`export\script\syscall_handlers.asm.txt:1397-1426`）。
   * 所以突击**不是**「选一个目标冲锋」、不加伤害/攻击力，只是把命令切成突击态，
   * 之后全体自行前压冲阵（本作由 `step()` 的突击分支实现）。
   * `world.over` 时由 `finish()` 清回 false。
   */
  rush: Record<Side, boolean>;
  /**
   * R158 部队指令的「抽格计划」提供者（由 `core/army_cmd.ts` 的 `installArmyOrders()` 装入）。
   *
   * 与原作的分工一致：命令字只是**数据**（`army+0x94+idx*4`），真正的抽格规则在更新器里
   * 按当前命令字分派（`0x43C907` / `0x43C921` / `0x43C9EF` / …）。本作把"命令字 → 抽格计划"
   * 放在 `army_cmd.ts`，`step()` 只负责「抽样 + 占位互斥 + 瞬移 + 40 帧滑动」这套机制。
   * 不装就退回本作自己的默认推进（`[新设计]`，见 `defaultStepPlan`）。
   */
  armyStepPlan?: (world: World, u: Unit) => StepPlan | null;
  /**
   * 战场 AI 的下令接口（`0x402EA5` 的 case 2/4/5 → `0x4448B2` / `0x44497F` / `0x44493D`）。
   *
   * 由 `core/army_cmd.ts` 的 `installArmyOrders()` 装入 —— AI 只负责**选**动作，
   * "命令字怎么写、突击态怎么置"是命令层的事（与 `armyStepPlan` 同一分工）。
   * 不装 = AI 决策空转（`world.aiSides` 打开也不会动），便于纯内核场景。
   */
  aiCommand?: (world: World, side: Side, cmd: AiBattleCommand) => void;
  /**
   * 「不许穿阵」拦阻开关（R190 P0）。缺省 `true`；显式设 `false` 退回 R189 的行为
   * ——**只判目标格**，与原作 `0x43C4C0`/`0x43C20D` 完全一致。
   *
   * 为什么要这条：用户实机反馈「我方武将直接穿过敌阵」「小兵放着旁边的敌人不管跑过去」。
   * 取证结论是原作**没有**车道/路径拦阻（见 `project/155` §1.4、`work/orig_battle_behavior/03,04`），
   * 旧实现与原作一致，所以这是**按用户观感新增**的规则，不是原作复刻。保留开关是为了
   * 让对比测试与"纯原作语义"复盘能一键退回。规则本体见 `passBlocked()`。
   */
  blockPass?: boolean;
  /** 战前战绩（R63）：`updateRecord()` 的输入，`settle()` 里按胜负累加 */
  record: BattleRecord;
  /** AI 兵力劣势时自动全军撤退（R38），由 `CreateOptions.aiRetreat` 打开 */
  aiRetreat: boolean;
  units: Unit[];
  sides: Record<Side, SideRuntime>;
  fx: Fx[];
  rng: () => number;
  /**
   * 原作乱数流（R115）。`null` = 没接线，方向/扫描继续用 `rng`（旧行为）。
   * 给了值时：`sampleStepOffsets()` 的权重抽样走 `roll.int(sum)`（= `rand()%n`），
   * `adjacentEnemy()` 的先扫侧走 `roll.bit()`（= `rand() & 1`）。观感抖动仍走 `rng`。
   */
  roll: SangoRng | null;
  aiSides: Record<Side, boolean>;
  /**
   * 统计（调试/验收用）：每侧的出手次数与命中次数、主将挨打次数，
   * 外加两侧本场吃到的地形项（HUD 的"地形 −8"就用这两个字段，无需重算）。
   */
  stats: {
    attacksA: number;
    attacksB: number;
    hitsA: number;
    hitsB: number;
    genHitsA: number;
    genHitsB: number;
    terrainBonusA: number;
    terrainBonusB: number;
    /** 法术击杀/治疗/对将伤害（**逐帧记账**；结算面板的"法术击杀"就取这里） */
    spellKillsA: number;
    spellKillsB: number;
    spellHealedA: number;
    spellHealedB: number;
    /** R84 法术对敌将造成的体力伤害合计（打主将不进 `killed`，单列） */
    spellDamageA: number;
    spellDamageB: number;
    /**
     * 我方（A）击杀的敌方步兵数 —— 战功分 ×6（R22，`0x41048D`）。
     * 与 `killsCav` 一起恒等于 `B.start - B.aliveCount`（含法术击杀）。
     */
    killsInf: number;
    /** 我方（A）击杀的敌方骑兵数 —— 战功分 ×12（R22） */
    killsCav: number;
    /** 敌方（B）击杀的我方步兵数 —— 败方战功分 `scL` 用（R22） */
    killsInfB: number;
    /** 敌方（B）击杀的我方骑兵数 —— 败方战功分 `scL` 用（R22） */
    killsCavB: number;
    /**
     * 格挡/招架次数（`THINGS.INI` Defense 的 `$Defense` 音）：**近战兵对兵砍空**才累加，
     * 与"射空/被闪开"区分开。是 `0x40452E` 之外唯一统计防御事件的字段。
     */
    blocks: number;
  };
  /**
   * 进行中的逐帧法术（`cast()` 只启动、每 tick 由 `tickSkills()` 推进一步）。
   * 空数组 = 当前没有在播的技能。
   */
  sessions: SkillSession[];
  /**
   * R84 技能战果标记：法术**真正产生效果**（打死敌兵／打掉主将体力／回复体力）的那一刻记一条。
   *
   * 为什么内核要记：`CastResult.killed` 的语义是「打死多少敌兵」（原作结算只按兵计战功），
   * 法术打主将恒为 0；而 web 的 `doCast()` 把 `killed > 0` 当「命中」，于是"打中敌将"被显示成
   * `MISS` +「擊殺 0 名敵兵」（project/97 步骤⑤、S2）。`game/web/**` 是冻结文件，所以由内核记账、
   * 由视图（`battleView.drawFloaters`）消费：标记才是"看到即发生"的唯一真值源。
   */
  skillMarks: SkillMark[];
  /**
   * R37 策略派發：兩側的「軍隊狀態」（原作 `army+0x70/+0x74/+0x84/+0x88/+0x90` 的鏡像）。
   * 由 `createWorld` 建、由 `strategy.ts` 的 `runStrategy()` 寫；`battle.ts` 只讀它。
   */
  army: Record<Side, ArmyStatus>;
  /** R37 本場已派發的策略（每側最多一條，軍師技在戰鬥中只生效一次） */
  strategyEvents: StrategyEvent[];
  /** R37 這側派發的是哪條軍師技（`WISE.SEQUENCE`），null = 沒帶軍師技 */
  strategyUsed: Record<Side, number | null>;
  /** R37 援軍：待命/已排程/已入場的組（`tickReinforce()` 推狀態機） */
  reinforce: ReinforceGroup[];
  /** R37 戰場消息欄（原作 `0x46DAE0`）：策略、援軍、提示都往這裡 push */
  log: LogEntry[];
  settled?: SettleResult;
  /**
   * R67 伤害通道：`script`（默认）= 普攻伤害走 MAGIC.SO 的 `Hurt` → `SYSCALL 0x125`
   * → `0x43ED96` 宿主函数；`legacy` = 旧的内联扣血（降级/对拍用）。
   * 两条路对同一 tick 同一 seed 的结果逐位相同（见 75 报告的对拍表）。
   */
  damageChannel?: DamageChannel;
  /** R67 脚本通道启动失败而降级的次数（0 = 全程走脚本） */
  damageFallbacks?: number;
}

/** R67 伤害通道路由（见 `World.damageChannel`） */
export type DamageChannel = 'script' | 'legacy';

export interface CastResult {
  ok: boolean;
  reason?: 'mp' | 'qi' | 'general-dead' | 'over' | 'no-magic' | 'no-target' | 'sealed';
  /** 这一发**打死**的敌兵数（原作结算口径：只有兵算击杀，主将的伤走 `damage`） */
  killed?: number;
  /** 这一发**回复**的体力 */
  healed?: number;
  /** 这一发打掉的敌将体力（>=0）。R84：打主将不再被当成"没打中" */
  damage?: number;
  /** 脚本这一发结算到的命中单位数（0 = 投影没扫到任何单位） */
  hits?: number;
  /**
   * 这一发**是否真的产生了效果**（打死兵 / 打掉主将体力 / 回复体力）。
   * R84：web 的 `doCast()` 现在拿 `killed > 0` 当命中（冻结文件），它的补丁应改用这个字段；
   * 内核侧另有 `world.skillMarks` 供视图飘字，语义见 `SkillMark`。
   */
  hit?: boolean;
  mp?: number;
  qi?: number;
}

/**
 * 一条技能战果标记（`World.skillMarks` 的元素）：法术**真正生效**的那一刻的快照。
 *
 * 与 `CastResult` 的区别：这里的数值是**实测差值**（法术结算前后数场上的兵/主将体力），
 * 不是脚本自报的帧统计——`runtime.applyHits()` 改主将血时只写 `g.hp`、不产出任何事件
 * （`runtime.ts:1076`），所以只有前后对账才能证明"打中了"。
 */
export interface SkillMark {
  /** 记账时的 `world.tick` */
  tick: number;
  side: Side;
  /** 飘字落点（技能瞄准点） */
  x: number;
  y: number;
  /** 打死的敌兵数（>0 才该飘击杀） */
  kills: number;
  /** 打掉的敌将体力（>0 = 真的打中了主将） */
  damage: number;
  /** 回复的体力 */
  healed: number;
  /** 補兵/召喚：己方复活的兵数（>0 = 召唤类技能生效，不是 MISS） */
  summoned: number;
  /** true = 这一发什么都没生效（被闪避/投影没扫到/射程不够），**只有它才该飘 MISS** */
  miss?: boolean;
}

/**
 * 战后结算结果。`mode` 对应 `0x41048D` 的四档战功表（docs/04b §6.2）：
 * 1 歼灭 / 2 击退 / 3 平手 / 4 大胜。
 */
export interface SettleResult {
  winner: Side | 'draw';
  /**
   * 我方是否取胜（= `winner === 'A'`）。
   * 这是唯一的胜者门信号：web 写 `save.lastBattle.won`、`roster.needSurrenderPanel(cards, {won})`
   * 与 `settleReport()` 的胜/败/平文案都用它，别另立判据。
   */
  won: boolean;
  mode: 1 | 2 | 3 | 4;
  modeName: string;
  /** 战报文案（`0x447037` 的 win/lose/draw 三段字符串 + 本作按模式拼的短句） */
  report: string;
  enemyLevel: number;
  durationSec: number;
  kills: number;
  /** 我方击杀的敌方步兵数（战功分 ×6，R22） */
  killsInf: number;
  /** 我方击杀的敌方骑兵数（战功分 ×12，R22） */
  killsCav: number;
  score: number;
  /** 法术击杀数（会话结束时由 `advanceSessions()` 汇总） */
  spellKills: number;
  expGain: number;
  meritGain: number;
  levelUp: number;
  level: number;
  exp: number;
  nextLevelAt: number;
  /** 战绩（`0x4084C9`，R63）：胜场 / 败场 / 连胜 / 最高连胜，由 `updateRecord()` 累加 */
  record: BattleRecord;
  /** 战果状态码（`docs/04b:530`：0 在场 / 2 撤退 / 3 被俘） */
  status: Record<Side, 0 | 2 | 3>;
  /** 战后士气（双方存活武将，`0x447520` 的 `+0x38 -= 0x14`） */
  morale: Record<Side, { before: number; after: number }>;
  /** 战后忠诚（双方存活武将，`0x447520` 的 `-(10-节操)*2`） */
  loyalty: Record<Side, { before: number; after: number }>;
  /** 战后疲劳（`0x41048D` ④：`15+秒/10`，双方+，cap 100） */
  tire: Record<Side, { before: number; after: number }>;
  /** 本场疲劳增量（原作 `15+秒/10`，未过 cap；面板显示"疲勞 +N"） */
  tireGain: number;
  /**
   * 每側**實得**疲勞增量 = `fatigueMul(tireGain, tireIdx)`（Execute 9-14 的倍率已生效）。
   * `tire.after − tire.before` 在未封頂時等於它；`tireGain` 仍是 `0x41048D` 的基值。
   */
  tireAdded: Record<Side, number>;
  /** 每側疲勞倍率檔（`army+0x38`；0 = 本場沒有軍師技動過疲勞） */
  tireIdx: Record<Side, number>;
  /**
   * 戰中被勸降（Execute 33）、戰後寫進招降名單的敵將名；`null` = 沒有觸發。
   * 名單本身由 `roster.applyPostBattle()` 落庫（本函數只把標記翻成一條 `recruited: true`）。
   */
  defected: string | null;
  /** 升级补学的武將技 / 军师技（`0x40A183` / `0x40A227`，R25） */
  learned: LearnedSkill[];
  /** 战后处置（招降/斩首/释放/掉落），见 core/capture.ts */
  post?: PostBattleReport;
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

/** 阵形落位的结果格：`gx/gy` 逻辑格 + 来自哪个 mode + 是不是骑兵槽（174 §3.2） */
export interface FormationCell {
  gx: number;
  gy: number;
  /** 原作的 `mode`（部队分组 1..5；权重为 0 的 mode 不产格） */
  mode: number;
  /** 该 mode 的前 `kc` 个槽是骑兵（`0x443180` 循环里先骑后步） */
  cavalry: boolean;
}

/**
 * 布阵的生成顺序：`0x443180..` 的循环按 `{1,3,4,5,2}` 走（project/174 §3.2）。
 * 权重/坐标表 `0x485DA8` 的 6 个 int16 = `{w1..w5, anchorX}`，坐标表 `0x485B10` 的 5 个 dword。
 */
const MODE_ORDER = [1, 3, 4, 5, 2] as const;

/**
 * 阵形落位：返回 N 个人在 71×14 网格上的格坐标（project/174 §3）。
 *
 * 与原作逐位对齐的三条：
 *  - 每个 mode 的格数 = **累积取整** `k_m = floor(P_m·N/200) − floor(P_{m−1}·N/200)`
 *    （`P_m = w1+…+wm`，`N` = 步+骑总数；N=10/50/100/200 四档与原作 `fill` 逐格相同）；
 *  - 先骑后步：mode 的前 `kc` 个坐标给骑兵，`kc` 用骑兵数做同样的累积取整；
 *  - `gx = 表x + anchorX + (200−N)/25`（整除向下，`0x442CB6`），A 侧 `gx = 0x47 − gx`
 *    = `71 − gx`（`0x442D1B`，不是旧的 `70 − gx`）。
 */
export function formationCells(
  table: FormationTable,
  formation: number,
  soldiers: number,
  side: Side,
  cavalry = 0,
): FormationCell[] {
  const slot = table.slots[formation] ?? table.slots[0]!;
  const n = Math.max(1, Math.min(soldiers, 200));
  const cav = Math.max(0, Math.min(cavalry, n));
  const shift = Math.floor((200 - n) / 25);
  const modes = slot.modes as Record<string, [number, number][]> | undefined;
  const out: FormationCell[] = [];
  let p = 0;
  let pc = 0;
  let prevK = 0;
  let prevCavK = 0;
  for (const mode of MODE_ORDER) {
    const w = Number(slot.weights?.[String(mode)] ?? 0);
    if (!(w > 0)) continue;
    p += w;
    pc += w;
    const cum = Math.floor((p * n) / 200);
    const cumCav = Math.floor((pc * cav) / 200);
    const k = cum - prevK;
    const kc = cumCav - prevCavK;
    const coords = modes?.[String(mode)] ?? [];
    for (let i = 0; i < k && i < coords.length; i++) {
      const [x, y] = coords[i]!;
      let gx = x + slot.anchorX + shift;
      if (side === 'A') gx = GRID_W - gx;
      out.push({ gx, gy: y, mode, cavalry: i < kc });
    }
    prevK = cum;
    prevCavK = cumCav;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// F26 武將站位（前 / 中 / 後列）
//
// 原作戰前可調四件事：出戰順序 / 陣形 / **武將站位** / 軍師技。指南原文
//（`work/ref_pdf/sanguo2_guide.txt` L152）：「武將站位 拖到前 / 中 / 后列，決定誰先挨打」，
// L161 再列一次「鼠标左键 拖顺序、选阵形、选站位、点"出战"」。戰前面板的「定位」行
// 左右各顯一檔（`work/video_ui_b/crop_cmp_mid.png`：兩側都是「後列」，中間金匾是行標籤）
// ⇒ 是**三檔**，不是自由座標。
//
// 縱深量的換算（`work/video_ref/REPORT.md` Q4b）：源幀 640×360、遊戲畫面寬 488px、
// 14 條車道 ⇒ 1 身位 ≈ 33px；雁形陣三排腳底 y≈150/190/235 ⇒ 排距 40–45px ≈ 1.2–1.4 身位。
// 本項目 1 格 = ROW_PX 71.43px、車道 53.57px ⇒ 1 格 = 1.33 身位 ⇒ **1 排距 ≈ 1 格**
//（40–45px × 53.57/33 = 65–73px，÷ 71.43px = 0.91–1.02 格）。所以取整成
// **前 = +1 格、中 = 0、後 = −1 格**，不是【待證】的保守值。
// ─────────────────────────────────────────────────────────────────────────────

/** 武將站位三檔（原作的「前 / 中 / 後列」）。 */
export type GeneralCol = 'front' | 'mid' | 'back';

/** 縱深序：數字越小越靠前（先接敵）。未知值一律按中列（`normalizeCol()` 的兜底）。 */
export const COL_RANK: Record<GeneralCol, number> = { front: 0, mid: 1, back: 2 };

/**
 * 站位字串歸一化：認 `front|f|前*` / `back|b|後*|后*` / `mid|middle|m|中*`，
 * 其餘（含 undefined、拼錯、數字）一律 `mid` —— 出征 URL 是外部輸入，解析失敗不能炸戰鬥。
 */
export function normalizeCol(raw: unknown): GeneralCol {
  if (typeof raw !== 'string') return 'mid';
  const s = raw.trim().toLowerCase();
  if (s === 'front' || s === 'f' || s.startsWith('前')) return 'front';
  if (s === 'back' || s === 'b' || s.startsWith('後') || s.startsWith('后')) return 'back';
  return 'mid';
}

/** 站位的縱深序（`front`=0 / `mid`=1 / `back`=2）。同距接敵的 tie-break 用它。 */
export function colRankOf(col: unknown): number {
  return COL_RANK[normalizeCol(col)];
}

/**
 * 站位 → **相對本側陣列的縱深偏移（格）**：前 +1、中 0、後 −1。
 *
 * 這是「朝敵方」的正方向；A 側面朝 −x（`step()` 的 `f = side === 'A' ? -1 : 1`），
 * 所以落位時還要乘上 `toward = A ? -1 : +1`（见 `createWorld()` 的主将落位段）。
 */
export function colOffsetOf(col: unknown): number {
  const c = normalizeCol(col);
  return c === 'front' ? 1 : c === 'back' ? -1 : 0;
}

/**
 * 解析出征 URL 的 `cols=` 參數：`關羽:front,張飛:back`（緊湊式）。
 *
 *  - 分隔符：`,` `，` `;` `；` 都認；鍵值分隔：`:` `：` 都認（中文冒號是常見誤輸入）；
 *  - 兩端空白一律 trim（`關羽 : 前` 也能讀）；
 *  - 值走 `normalizeCol()`，未知值回落 `mid`（**仍然記住這個名字**，只是按中列）；
 *  - 沒有冒號的段落、空名字、非字串輸入整段丟掉 —— 絕不拋異常，戰鬥照常開。
 */
export function parseCols(raw: unknown): Record<string, GeneralCol> {
  const out: Record<string, GeneralCol> = {};
  if (typeof raw !== 'string') return out;
  // 出征令是外部輸入：正常 5 將 × 8 字，這裡先擋病態長度（1 萬字不會拖慢建局）
  const text = raw.length > 4096 ? raw.slice(0, 4096) : raw;
  for (const part of text.split(/[,，;；]/)) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^([^:：]+)[:：](.*)$/);
    if (!m) continue;
    const name = m[1]!.trim();
    if (!name) continue;
    out[name] = normalizeCol(m[2]);
  }
  return out;
}

/**
 * 主将自动放技的间隔（tick）＝ **10 秒**。
 *
 * 这是**本作设计**，不是原作帧数（原作 AI 放技/决策节奏见 `battle_ai.ts` 的 `AI_PERIOD`，
 * 那条对应 `0x444385` 的 `mov [倒计时],0x3C`，才是甲类不改的字面值）。
 * 旧值 `300` 是 30 Hz 下"10 秒"的换算；R192 起按 `TICK_HZ` 推导（60 Hz ⇒ 600），
 * 否则 AI 会变成每 5 秒一发、整场多放一倍技。
 */
export const AI_SKILL_INTERVAL_TICKS = 10 * TICK_HZ;

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
    const level = cfg.general.level ?? 1;
    // R22 两栏：`soldiers` 是上阵总数，`cavalry` 只是其中的骑兵计数（见 `splitTroops()`）。
    // 缺省骑兵按原作骑兵上限从等级推（等级 ≤20 时恒为 0），并受总兵力截断。
    const split = splitTroops(level, cfg.soldiers, cfg.cavalry);
    const soldiers = split.total;
    const cavalry = split.cav;
    // R54 副将：只参加战后处置，`alive` 缺省 true
    const officers: PostGeneral[] = (cfg.officers ?? []).map((o) => ({ ...o, alive: o.alive ?? true }));
    // R23：上限公式的底值来自 TIMES 的 `general+0x18`（BaseHP）/`+0x1A`（BaseMP）。
    // 没有档案的临时将（仿真里的默认主将、测试里现造的将）按 100 / MP_BASE 兜底。
    const name = cfg.general.name ?? (side === 'A' ? '我軍主將' : '敵軍主將');
    const row = cfg.general.name ? data.generals.find((x) => x.NAME === cfg.general.name) : undefined;
    const baseHp = Math.max(0, Math.round(row?.BaseHP ?? 100));
    const baseMp = Math.max(0, Math.round(row?.BaseMP ?? MP_BASE));
    const maxHp = hpCapOf(baseHp, cfg.general.str, level);
    const mpMax = mpCapOf(baseMp, cfg.general.str, int, level);
    const g: GeneralState = {
      side,
      name,
      str: cfg.general.str,
      int,
      baseHp,
      baseMp,
      hp: maxHp,
      maxHp,
      mp: mpMax,
      mpMax,
      qi: QI_START,
      level,
      exp: 0,
      alive: true,
      aiTimer: AI_SKILL_INTERVAL_TICKS,
    };
    return {
      ...cfg,
      soldiers,
      cavalry,
      officers,
      general: g,
      start: soldiers,
      aliveCount: soldiers,
      troopBonus: 0,
      formationBonus: 0,
      terrainBonus: 0,
      startInf: split.inf,
      startCav: cavalry,
      aliveInf: split.inf,
      aliveCav: cavalry,
    };
  };

  const a = mk('A', opts.a);
  const b = mk('B', opts.b);
  const terrain = opts.terrain ?? 0;
  const world: World = {
    data,
    tick: 0,
    terrain,
    over: false,
    // R39：只有显式给了 month/weather 才去推天气，缺省晴（既有曲线不动）
    weather: normalizeWeather(opts.weather ?? (opts.month !== undefined ? weatherOf(opts.month, terrain) : 0)),
    status: { A: 0, B: 0 },
    fled: { A: false, B: false },
    // R137 全軍突擊：缺省两侧都没突击，`allRush()` 置位（原作 0x120 的 0x10000 位）
    rush: { A: false, B: false },
    record: { ...EMPTY_RECORD, ...(opts.record ?? {}) },
    aiRetreat: opts.aiRetreat === true,
    endReason: null,
    winner: null,
    units: [],
    sides: { A: a, B: b },
    fx: [],
    sessions: [],
    // R84：技能战果标记（视图飘字用；见 `SkillMark`）
    skillMarks: [],
    // R37：策略/援軍的載體（見 strategy.ts）
    army: { A: emptyArmyStatus(), B: emptyArmyStatus() },
    strategyEvents: [],
    strategyUsed: { A: null, B: null },
    reinforce: [],
    log: [],
    rng: mulberry32(opts.seed ?? 1),
    roll: opts.roll ?? null,
    // 默认两侧都不放技：AI 放技是显式 opt-in，否则镜像局里 "B 有 AI" 会变成系统性优势
    aiSides: { A: opts.aiSides?.A ?? false, B: opts.aiSides?.B ?? false },
    // R67：伤害默认走脚本通道（MAGIC.SO `Hurt` → `SYSCALL 0x125` → 宿主函数）；`legacy` 只给对拍
    damageChannel: opts.damageChannel ?? 'script',
    damageFallbacks: 0,
    stats: {
      attacksA: 0,
      attacksB: 0,
      hitsA: 0,
      hitsB: 0,
      genHitsA: 0,
      genHitsB: 0,
      terrainBonusA: 0,
      terrainBonusB: 0,
      spellKillsA: 0,
      spellKillsB: 0,
      spellHealedA: 0,
      spellHealedB: 0,
      spellDamageA: 0,
      spellDamageB: 0,
      killsInf: 0,
      killsCav: 0,
      killsInfB: 0,
      killsCavB: 0,
      blocks: 0,
    },
  };

  for (const side of ['A', 'B'] as const) {
    const rt = world.sides[side];
    const cells = formationCells(data.formations, rt.formation, rt.soldiers, side, rt.cavalry);
    // R179：骑兵槽由布阵层给出（每个 mode 的前 `kc` 个槽），不再取"列表末尾 N 个"。
    // 位置与旧实现逐格一致（N=10/50/100/200 四档见 project/174 §4.1），只改 kind 归属。
    cells.forEach((c) => {
      world.units.push({
        side,
        kind: c.cavalry ? 'cavalry' : 'infantry',
        x: c.gx,
        y: c.gy,
        prevX: c.gx,
        prevY: c.gy,
        alive: true,
        cd: Math.floor(world.rng() * 20),
      });
    });
    const gen = rt.general;
    // R179：主将落位 = `(anchorX + (200−N)/25, 6)`（`0x404DAF` + `0x442D1B`），
    // A 侧镜像 `71 − gx`。撞格按 `0x442D38` 只沿 x 挪：`X<=1 → +0x20`，
    // `X>=0x70 → −0x20`，否则 `X>=0x36 ? +1 : −1`（174 §3.2）。
    const slot = data.formations.slots[rt.formation] ?? data.formations.slots[0]!;
    const shift = Math.floor((200 - rt.soldiers) / 25);
    // F26 武將站位：前/中/後列 = 相對本側陣列的三條縱深線（換算見 `colOffsetOf()`：
    // 源排距 40–45px ≈ 1 格）。A 側面朝 −x ⇒ 「前」是 gx−1；B 側面朝 +x ⇒ 「前」是 gx+1。
    // 中列 `colOffsetOf()` 返回 0 ⇒ `gx` 与原式逐格相同（既有測試/仿真不受影响）。
    const col = normalizeCol(rt.col);
    const toward = side === 'A' ? -1 : 1;
    const base = Math.max(0, Math.min(GRID_W - 1,
      side === 'A' ? GRID_W - (slot.anchorX + shift) : slot.anchorX + shift));
    let gx = Math.max(0, Math.min(GRID_W - 1, base + toward * colOffsetOf(col)));
    // F26：站位把主將推進陣列時，目標格常被自家小兵占著（方陣 100 兵的 `x=1` 前排正好在
    // 中列前一格）。原作的撞格迴圈只沿 x 把主將擠回原位 —— 那等於把站位原地抵消掉。
    // 所以先做一次同車道換位：把小兵挪去主將原位，站位才真的落到場上。
    // 只在 `col !== 'mid'`（`gx !== base`）時發生；中列走原式，既有對局逐格不變。
    if (gx !== base) {
      const blocker = world.units.find((u) => u.side === side
        && Math.round(u.x) === gx && Math.round(u.y) === 6);
      const baseFree = !world.units.some((u) => Math.round(u.x) === base && Math.round(u.y) === 6);
      if (blocker && baseFree) {
        blocker.x = base;
        blocker.prevX = base;
      }
    }
    const taken = new Set(world.units.map((u) => cellKey(Math.round(u.x), Math.round(u.y))));
    for (let guard = 0; guard < GRID_W; guard++) {
      if (!taken.has(cellKey(gx, 6))) break;
      if (gx <= 1) gx += 0x20;
      else if (gx >= 0x70) gx -= 0x20;
      else gx = gx >= 0x36 ? gx + 1 : gx - 1;
      gx = Math.max(0, Math.min(GRID_W - 1, gx));
    }
    const gy = 6;
    world.units.push({
      side,
      x: gx,
      y: gy,
      prevX: gx,
      prevY: gy,
      alive: true,
      cd: 0,
      isGeneral: true,
      col,
    });
    gen.hp = gen.maxHp;
  }
  // R37：軍師技（`WISE.SEQUENCE`）與援軍在建局末尾落地。
  // 策略只認顯式給了 `strategy` 的一側 —— 缺省 null，既有對局逐位不變。
  for (const side of ['A', 'B'] as const) {
    const rt = world.sides[side];
    const want = rt.strategy;
    world.army[side].seq = typeof want === 'number' && Number.isFinite(want) && want > 0 ? Math.round(want) : null;
  }
  world.reinforce = planReinforceGroups(world, opts.reinforce);
  recompute(world);
  return world;
}

/**
 * 骑兵上限（`0x409FD8`）：`clamp((等级−20)×5, 0, 100)`（docs/04b §2.4 / §6.7）。
 *
 * 与带兵上限 `0x409FB6 = (等级≥20)?100:等级×5` 是**两栏独立**计数：带兵上限只管步兵栏，
 * 本函数只管骑兵栏，上阵总数是两栏之和（`levels.ts` 的 `troopCapSumOf()`）。
 * 升级时新骑兵来自「有5名士兵升為騎兵」（21..40 级），步兵溢出带兵上限也会转成骑兵——
 * 那是**升级过程**里的口径，不是战场配比：战场上 `cavalry` 永远是 `soldiers` 的子集。
 * 详见 `project/168_战场每侧单位数.md` §4 与 `project/170_步骑两栏兵力.md`。
 */
export function cavalryCapOf(level: number): number {
  return Math.max(0, Math.min(100, (Math.round(level) - 20) * 5));
}

/**
 * 总兵力 → 两栏拆解 `{ total, inf, cav }`（原作 `unit+0x5C` / `unit+0x58`）。
 *
 * `soldiers` 是**上阵总兵力**（两栏之和），`cav` 只是其中骑兵的计数，
 * `inf = total − cav` 才是步兵。缺省骑兵按等级上限推（20 级以下 0），
 * 显式值以调用方为准但不得多于总兵力 —— 与原作 `min(騎兵數, 騎兵上限)` 同构。
 *
 * 供 `createWorld()` 与编成页（web `deploy.html` / Cocos `DeployRoot.ts`）共用，
 * 避免「总数/步数/骑数」三处各算一遍。
 */
export function splitTroops(
  level: number,
  soldiers: number,
  cavalry?: number,
): { total: number; inf: number; cav: number } {
  const total = Math.max(0, Math.round(soldiers));
  const cav = Math.max(0, Math.min(total, Math.round(cavalry ?? cavalryCapOf(level))));
  return { total, inf: total - cav, cav };
}

/**
 * 体力上限 `0x40A020`（R23）：
 * ```
 * v = BaseHP + Level*2 * STR / 100;   // C 整除
 * if (BaseHP > v) v = BaseHP;
 * if (v > 0x7FFF) v = 0x7FFF;
 * ```
 * 证据：`docs/04c_世界与内政.md:292`（逐字给出上式）＋ `docs/04b_战斗系统.md:225-238`
 * 的同一条（04b 把标题误写成"兵力上限"，04b4:251 与 04c:292 都表明它是**体力**上限）。
 * 注：`docs/04b5:108` 明确「不存在 `60+INT/2` 或 INT→技力 的换算」，
 * 旧实现 `100 + STR` / `60 + INT/2` 属于本作自造，已按本条替换。
 */
export function hpCapOf(baseHp: number, str: number, level: number): number {
  const v = Math.trunc((Math.round(level) * 2 * Math.round(str)) / 100);
  return Math.max(baseHp, Math.min(0x7fff, baseHp + v));
}

/**
 * 技力上限 `0x40A098`（R23）：
 * ```
 * t = (STR > INT) ? (STR + INT) / 2 : INT;
 * v = BaseMP + Level*2 * t / 100;
 * if (BaseMP > v) v = BaseMP;
 * if (v > 0x7FFF) v = 0x7FFF;
 * ```
 * 证据：`docs/04b:225-238`（04b 这一栏标为"技力上限"）＋ `docs/04c:293`（同一式，只写了 `t` 的前半）。
 * 注意 **不是** `BaseMP + Level*2*INT/100` —— `t` 只在 `STR > INT` 时取平均，武将在
 * `STR > INT` 时技力也跟着涨，这是原作的怪处，别"修"。
 */
export function mpCapOf(baseMp: number, str: number, int: number, level: number): number {
  const s = Math.round(str);
  const i = Math.round(int);
  const t = s > i ? Math.trunc((s + i) / 2) : i;
  const v = Math.trunc((Math.round(level) * 2 * t) / 100);
  return Math.max(baseMp, Math.min(0x7fff, baseMp + v));
}

/**
 * `0x43B6C9(p) = p->+0x2C & 4`（docs/04b4:203 **[确认]**）：骑兵 / 特殊兵。
 *
 * R44 的冲突就在这里：`docs/04b:121/168/179/622` 把同一个 bit 4 说成"可二段判定 /
 * 连击位"，而 04b4:203 是 Process 层逐位逆出来的，且 04b4:189-191 与 04b4:216-240
 * **两处**把它当"目标是不是骑兵"来用（`150+STR/3` 打骑兵、`p*0x78/0x64` 伤害加成）。
 * 一份字段被两处消费、且 04b4 更靠近 `0x43EC54/0x43D400` 的实际代码，因此本作按
 * **bit 4 = 骑兵** 实现，不实现"额外 2/3 补判"（那是我们无法从反汇编复现的部分）。
 */
export function isCavalryBit(u: Unit): boolean {
  return u.kind === 'cavalry';
}

// ────────────────────────────────────────────────────────────────────────────
// R50：ACTIVE 状态位掩码（`MagicDef+0x10`）与 `unit+0x2C` 状态位
// ────────────────────────────────────────────────────────────────────────────

/**
 * `MagicDef+0x10`「Active 生效类型」的 4 个位（word，与 `BATTLE_BITS` 同一份定义）。
 *
 * 原作布局：基址 `0x4A61A0`、stride `0x16`(22B)、最多 128 项，`+0x10` 是 word；
 * `if (active < 0) 跳过`，否则再查子表 `0x4868A8`，访问器 `0x40A41A(i)`
 * （docs/04b_战斗系统.md §4.2:385-397）。
 */
export const ACTIVE_BIT = {
  /** 1 我方士兵 */
  OWN_TROOP: 0x1,
  /** 2 我方主将 */
  OWN_GENERAL: 0x2,
  /** 4 敌方士兵 */
  ENEMY_TROOP: 0x4,
  /** 8 敌方主将 */
  ENEMY_GENERAL: 0x8,
} as const;

/** `unit+0x2C` 状态位（与 `MagicDef+0x10` 不同字，别混用） */
export const UNIT_STATUS = {
  /**
   * 4 连击 / 可二段判定：`0x43D48C`，`HitRoll(0x43D400)` 首掷不中时
   * `p = p*2/3` 再掷一次（docs/04b:152-181，:168 注明 `0x43D48C`）。
   * 消费点：`hitRoll()`。
   */
  DOUBLE_HIT: 0x4,
} as const;

/**
 * **战斗标志位的唯一一张表**（R50）。每一位都写清：哪个字（结构）、第几位、含义、
 * 证据出处、本仓库的消费点。新增位必须同时在这里登记 + 接一个真消费点，
 * 否则就是死位（`tests/r50_r67.test.ts` 有一条"每个位都有消费点"的守卫用例）。
 */
export interface BattleBitDef {
  /** 位所在的原作结构字 */
  word: 'magicdef+0x10' | 'unit+0x2C';
  /** 位值（1 位一个值，组合由 `ACTIVE_LABELS` 给出） */
  bit: number;
  /** 导出符号名（便于 grep） */
  name: string;
  /** 原作含义（照 03a/04b 的写法） */
  meaning: string;
  /** 证据：文档 file:line 或反汇编地址；无据/存疑的必须带 `[推测]` */
  evidence: string;
  /** 本仓库消费点（导出符号名） */
  consumer: string;
  /** 是否 `[推测]`（没有直接反汇编证据的） */
  speculative?: boolean;
}

export const BATTLE_BITS: readonly BattleBitDef[] = [
  {
    word: 'magicdef+0x10',
    bit: ACTIVE_BIT.OWN_TROOP,
    name: 'ACTIVE_OWN_TROOP',
    meaning: '我方士兵',
    evidence: 'docs/03a-武将技表MAGIC.md §2.3:73-101（177 条技能的 1/2/4/8 组合求和反解，[确认]）+ docs/04b:395 `MagicDef+0x10`「Active 生效类型」',
    consumer: 'activeHits() / activeTargetCount() / cast()',
  },
  {
    word: 'magicdef+0x10',
    bit: ACTIVE_BIT.OWN_GENERAL,
    name: 'ACTIVE_OWN_GENERAL',
    meaning: '我方主将',
    evidence: 'docs/03a §2.3:73-101（補血類 32 条全是 2）；消费点见 `activeAim()`',
    consumer: 'activeHits() / activeAim() / cast()',
  },
  {
    word: 'magicdef+0x10',
    bit: ACTIVE_BIT.ENEMY_TROOP,
    name: 'ACTIVE_ENEMY_TROOP',
    meaning: '敌方士兵',
    evidence: 'docs/03a §2.3:73-101（敌方士兵 27 条 + 敌方全軍 72 条含此位）',
    consumer: 'activeHits() / activeTargetCount() / cast()',
  },
  {
    word: 'magicdef+0x10',
    bit: ACTIVE_BIT.ENEMY_GENERAL,
    name: 'ACTIVE_ENEMY_GENERAL',
    meaning: '敌方主将',
    evidence: 'docs/03a §2.3:73-101（敌方主将 19 条；03a 分类规则第 5 条按 ACTIVE=8 认"单体斩将技"）',
    consumer: 'activeHits() / activeTargetCount() / cast()',
  },
  {
    word: 'unit+0x2C',
    bit: UNIT_STATUS.DOUBLE_HIT,
    name: 'UNIT_STATUS_DOUBLE_HIT',
    meaning: '连击 / 可二段判定（首掷不中时 p×2/3 再掷一次）',
    evidence: 'docs/04b:168-172 `HitRoll 0x43D400`：`if (a->status & 4) { p=p*2/3; roll=rand()%300; }`，注释指 `0x43D48C`；docs/04b:403-407 军师技位 0x4 = 攻击二段判定',
    consumer: 'hitRoll()',
    // 与 docs/04b4:203 的「+0x2C & 4 = 骑兵位」冲突（见 isCavalryBit 的注释）：
    // 本仓库按 04b4 把 bit 4 当骑兵，所以**不**用它做二段判定，另开 `Unit.status` 字段承载。
    speculative: true,
  },
];

/**
 * 中文 ACTIVE 写法 → 位掩码。全表 7 种，与 `03a §2.3` 的 7 种写法一一对应
 * （110 条 `magics.json` 的分布：敵方全軍 72 / 敵方士兵 14 / 我方士兵 7 / 敵方主將 6 /
 * 敵我全軍 6 / 敵我士兵 3 / 我方主將 2）。
 */
export const ACTIVE_LABELS: readonly { label: string; mask: number }[] = [
  { label: '我方士兵', mask: ACTIVE_BIT.OWN_TROOP },
  { label: '我方主將', mask: ACTIVE_BIT.OWN_GENERAL },
  { label: '敵方士兵', mask: ACTIVE_BIT.ENEMY_TROOP },
  { label: '敵我士兵', mask: ACTIVE_BIT.OWN_TROOP | ACTIVE_BIT.ENEMY_TROOP },
  { label: '敵方主將', mask: ACTIVE_BIT.ENEMY_GENERAL },
  { label: '敵方全軍', mask: ACTIVE_BIT.ENEMY_TROOP | ACTIVE_BIT.ENEMY_GENERAL },
  { label: '敵我全軍', mask: ACTIVE_BIT.OWN_TROOP | ACTIVE_BIT.OWN_GENERAL | ACTIVE_BIT.ENEMY_TROOP | ACTIVE_BIT.ENEMY_GENERAL },
];

/**
 * 取一条技能的 ACTIVE 位掩码。缺字段/空串/未知写法 → 0。
 *
 * 0 的语义是「未标注，不做限制」（= 改动前的行为）；原作里 `+0x10` 的负数才是"跳过"，
 * 这里把"没数据"也归一成 0，避免把 110 条以外的临时数据算成"打不到任何目标"。
 */
export function activeMaskOf(m: Magic | undefined | null): number {
  const label = m?.ACTIVE?.trim();
  if (!label) return 0;
  const hit = ACTIVE_LABELS.find((e) => e.label === label);
  return hit ? hit.mask : 0;
}

/**
 * 单位是否落在 ACTIVE 掩码的命中范围里。`casterSide` = 施法方。
 * 掩码 0（未标注）→ 恒 true，保住旧行为。
 */
export function activeHits(mask: number, casterSide: Side, unitSide: Side, isGeneral: boolean): boolean {
  if (!Number.isFinite(mask) || mask <= 0) return true;
  const own = unitSide === casterSide;
  const bit = isGeneral ? (own ? ACTIVE_BIT.OWN_GENERAL : ACTIVE_BIT.ENEMY_GENERAL) : own ? ACTIVE_BIT.OWN_TROOP : ACTIVE_BIT.ENEMY_TROOP;
  return (mask & bit) !== 0;
}

/** 场上符合 ACTIVE 掩码的**存活**单位数。掩码 0 → 0（= 不做限制，调用方自己判）。 */
export function activeTargetCount(world: World, casterSide: Side, mask: number): number {
  if (!Number.isFinite(mask) || mask <= 0) return 0;
  let n = 0;
  for (const u of world.units) {
    if (!u.alive) continue;
    if (activeHits(mask, casterSide, u.side, u.isGeneral === true)) n++;
  }
  return n;
}

/**
 * ACTIVE 掩码的选点语义（`cast()` 的消费点②）。
 *
 * 掩码里**一位敌方位都没有**（纯己方技，如 命療術 = 我方主將 `0x2`）时，取目标走
 * `0x4868A8` 子表、不由玩家点地；本仓库把它落成"点落在敌方半场就改成己方主将位置"，
 * 这样 `命療術` 对着敌人点也还是治自己 —— 与"目标范围只有我方主将"一致。
 * 掩码含敌方位时原样返回调用方给的点（敌兵/敌将类技能本来就要选目标）。
 * 子表内容未知，映射方式 `[推测]`。
 */
export function activeAim(world: World, side: Side, mask: number, tx: number, ty: number): { x: number; y: number } {
  if (!Number.isFinite(mask) || mask <= 0) return { x: tx, y: ty };
  if ((mask & (ACTIVE_BIT.ENEMY_TROOP | ACTIVE_BIT.ENEMY_GENERAL)) !== 0) return { x: tx, y: ty };
  const g = world.sides[side].general;
  if (!g.alive) return { x: tx, y: ty };
  const self = world.units.find((u) => u.side === side && u.isGeneral === true);
  if (!self) return { x: tx, y: ty };
  // A 侧在纵深大的一头（`createWorld` 里 A ≈ 55、B ≈ 15），所以 A 的己方半场是 x 大的一侧
  const ownHalf = side === 'A' ? tx >= GRID_W / 2 : tx <= GRID_W / 2;
  return ownHalf ? { x: tx, y: ty } : { x: self.x, y: self.y };
}

/**
 * 自动选点（R139「武将技不需要选目标」的还原点，`cast()` 的消费点③）。
 *
 * ## 为什么可以不选目标（考古依据，详见 `project/139_武将技自动目标.md`）
 *
 * `export/script/magic_so.dis.txt` 的 463 个函数里，**110 条技能的脚本每条都至少写一次
 * `SYSCALL 0x100`**（= `setTargetPx`，写引擎全局 `0x4AC368/0x4AC370`）：脚本自己算特效锚点，
 * 引擎传进去的落点一律被覆盖（如 `Heal` dis:13732-13745：`LDG 2` → `0x105/0x106` 取施法者
 * 坐标 → `PUSHI 120; SUB` → `SYSCALL 0x100`；`ShootObject` dis:3950-3966 同法用施法者 ± 180px
 * 当弹丸起点，用到的句柄是 `LDG 2` 而不是 `LDG 3`）。
 * 而读这个锚点的 `SYSCALL 0x111/0x112` 只出现在 7 个**相机**函数里（MoveCamera / LockCamera*），
 * 伤害判定一次都没读它 —— 所以「点哪个格子」根本不进伤害公式。
 *
 * 落点唯一的真实作用是**选 g3 目标句柄**：`runtime.ts:318-329` 把落点当圆心，
 * 取离它最近的敌单位当 g3，再把 `targetPoint` 改成那个单位的像素位置（`runtime.ts:343-346`）。
 * 少数脚本会对比「自己扫出来的单位 == g3」来分支（如 `DemonDancing` dis:12050/12110），
 * 于是默认落点只要落在「ACTIVE 指定的那类目标」上，就与玩家手点它等价。
 *
 * ## 映射（`MagicDef+0x10` 的 1/2/4/8，docs/03a §2.3、docs/04b:395）
 *
 *  1. 掩码里没有敌方位（純己方技，如 命療術 = 我方主將 `0x2`）→ 自己主将位置；
 *  2. 掩码含 `ENEMY_GENERAL`（敵方主將 / 敵方全軍）且敌将还活着 → 敌将位置；
 *  3. 只有 `ENEMY_TROOP`（敵方士兵），或敌将已死 → 敌兵最密的一小片（3.6 格窗口）；
 *  4. 一个敌人都没有 → 自己主将位置（纯特效锚点，保证有限且在网格内）。
 *
 * 掩码 0（没有 ACTIVE 字段/未知写法）按「敌方全軍」处理，与旧行为（玩家点哪打哪）最接近。
 * `maskOrSeq` 先当 `magics.json` 的 SEQUENCE（1..110）解释，查不到再当掩码（1..15）：
 * 两个区间重叠（掩码 1..15 全落在技能 seq 区间里），所以同一条技请统一传 seq，`cast()` 就是这么传的；
 * 手里只有掩码时用 `defaultAimForMask()`，那是无歧义的入口（测试与内部走这条）。
 *
 * 映射方式 `[推测]`：`0x4868A8` 子表的内容仍未定位（docs/04:1008 明说写入者未找到），
 * 这里按 ACTIVE 位的中文语义直译，不做「子表可能按距离/兵力加权」的进一步猜测。
 */
export function defaultAim(world: World, side: Side, maskOrSeq: number): { x: number; y: number } {
  return defaultAimForMask(world, side, aimMaskOf(world, maskOrSeq));
}

/** 无歧义的选点入口：参数就是 `ACTIVE_BIT` 位掩码（0/1/2/4/8 及组合）。 */
export function defaultAimForMask(world: World, side: Side, mask: number): { x: number; y: number } {
  const selfUnit = world.units.find((u) => u.side === side && u.isGeneral === true);
  // 己方锚点：主将单位还在就用它的格子；不在（阵亡后被移出）就用己方底线中点，保证有限且不 NaN
  const own = selfUnit
    ? { x: selfUnit.x, y: selfUnit.y }
    : { x: side === 'A' ? GRID_W - 4 : 4, y: (GRID_H - 1) / 2 };
  const enemyBits = mask & (ACTIVE_BIT.ENEMY_TROOP | ACTIVE_BIT.ENEMY_GENERAL);
  // 1. 純己方技：Heal 脚本本来就用 g2（施法者自己）取坐标，落点只是特效锚点
  if (mask > 0 && enemyBits === 0) return clampAim(own);
  const foes = world.units.filter((u) => u.alive && u.side !== side);
  if (foes.length === 0) return clampAim(own);
  const foeGen = foes.find((u) => u.isGeneral === true);
  // 2. 敵方主將 / 敵方全軍（或掩码未标注）：目标是敌将
  if (foeGen && (mask === 0 || (enemyBits & ACTIVE_BIT.ENEMY_GENERAL) !== 0)) {
    return clampAim({ x: foeGen.x, y: foeGen.y });
  }
  // 3. 敵方士兵，或敌将已死：敌兵最密的一小片（与 AI 的 bestSkillTarget 同口径）
  const troops = foes.filter((u) => !u.isGeneral);
  const pool = troops.length > 0 ? troops : foes;
  const dense = densestPoint(pool, AIM_CLUSTER_RADIUS);
  return clampAim(dense ?? centroidOf(pool) ?? own);
}

/** `defaultAim()` 的掩码解析：先当技能 SEQUENCE，查不到再当 `ACTIVE` 位掩码。 */
export function aimMaskOf(world: World, maskOrSeq: number): number {
  const n = Math.trunc(Number(maskOrSeq));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const m = magicBySeq(world.data, n);
  if (m) return activeMaskOf(m);
  // 掩码只有 4 位（1..15）：查不到技能的 16 以上整数（如 9999）一律当"未标注"，不做位与
  if (n > 15) return 0;
  return n & (ACTIVE_BIT.OWN_TROOP | ACTIVE_BIT.OWN_GENERAL | ACTIVE_BIT.ENEMY_TROOP | ACTIVE_BIT.ENEMY_GENERAL);
}

/** `defaultAim()` 挑「敌兵最密处」的窗口半径（格）：与 `bestSkillTarget()` 的 3.6 一致。 */
export const AIM_CLUSTER_RADIUS = 3.6;

function densestPoint(units: readonly Unit[], radius: number): { x: number; y: number } | null {
  if (units.length === 0) return null;
  let best = { x: 0, y: 0, n: -1 };
  for (const e of units) {
    let n = 0;
    for (const o of units) if (Math.hypot(o.x - e.x, o.y - e.y) <= radius) n++;
    if (n > best.n) best = { x: e.x, y: e.y, n };
  }
  return { x: best.x, y: best.y };
}

function centroidOf(units: readonly Unit[]): { x: number; y: number } | null {
  if (units.length === 0) return null;
  let sx = 0, sy = 0;
  for (const u of units) { sx += u.x; sy += u.y; }
  return { x: sx / units.length, y: sy / units.length };
}

/** 落点一律夹进网格 `[0,GRID_W-1] × [0,GRID_H-1]`，非有限值退回最后一位（杜绝 NaN/越界）。 */
function clampAim(p: { x: number; y: number }): { x: number; y: number } {
  const x = Number.isFinite(p.x) ? p.x : GRID_W - 1;
  const y = Number.isFinite(p.y) ? p.y : (GRID_H - 1) / 2;
  return {
    x: Math.min(GRID_W - 1, Math.max(0, x)),
    y: Math.min(GRID_H - 1, Math.max(0, y)),
  };
}

/** `unit+0x2C & bit`（R50）。`Unit.status` 缺省 0。 */
export function statusBitOf(u: Unit, bit: number): boolean {
  return (((u.status ?? 0) & bit) | 0) !== 0;
}

/**
 * 普攻伤害 `0x43EC54(t, a)`（R46，docs/04b4:216-240 **[确认]**）：
 * ```
 * if (0x43B6A8(attacker)) {           // 武将单位
 *   str  = attacker->+0x34;
 *   half = str / 2;
 *   r    = Rand32()% (str - half) + half;   // 0x450117(n) = Rand32()%n
 *   d    = r / 10;
 *   return d > 1 ? d : 1;
 * }
 * p = attacker->+0x70;                 // 战力
 * if (0x43B6C9(attacker)) p = p * 0x78 / 0x64;   // 骑兵 ×1.2
 * d = p * 4 / 0xC0;                    // = p / 48
 * return d > 1 ? d : 1;
 * ```
 * 公式里**没有防御项**。对应样例（04b4:238）：武力 60 → 3..5、武力 100 → 5..9、战力 100 → 2。
 * 旧实现 `主将 12 / 兵 6 + rand()*6` 是本作自造，已按本条替换。
 */
export function basicDamage(world: World, from: Unit): number {
  if (from.isGeneral) {
    // R37「強化武將」（`army+0x74` = 10/15/20）：原作只把值寫進 army 字段，
    // 消費點未定位（docs/04b 沒有 `+0x74` 的讀取點）⇒ 當額外武力加進傷害公式。[推測]
    const plus = world.army?.[from.side]?.generalAtk ?? 0;
    const str = Math.round(world.sides[from.side].general.str) + (Number.isFinite(plus) ? plus : 0);
    const half = Math.trunc(str / 2);
    const span = str - half;
    const r = span > 0 ? Math.floor(world.rng() * span) + half : half;
    const d = Math.trunc(r / 10);
    return d > 1 ? d : 1;
  }
  let p = powerOf(world, from.side);
  if (isCavalryBit(from)) p = Math.trunc((p * 0x78) / 0x64);
  const d = Math.trunc((p * 4) / 0xc0);
  return d > 1 ? d : 1;
}

// ────────────────────────────────────────────────────────────────────────────
// R67：伤害结算走脚本 —— MAGIC.SO `Hurt` → `SYSCALL 0x125` → `0x43ED96` 宿主函数
// ────────────────────────────────────────────────────────────────────────────

/**
 * 脚本通道里的单位句柄：`0x400000 + units[] 下标`。
 *
 * 不能从 0 起：`Hurt` 的前两条指令拿 `arg2` 跟 `g2`/`g3`（施法者/主目标句柄）比，
 * 引擎全局缺省是 0，句柄 0 会被当成"打的是自己"而只放 `Hit01` 音、不走 0x125。
 * 详见 `docs/04-脚本引擎SmartScript.md:515` 与 `tools/` 里的 Hurt 反汇编。
 */
const DAMAGE_HANDLE_BASE = 0x400000;

/** 每个 World 一份的脚本伤害通道（`WeakMap`：不污染 World 的对外字段、不拖累序列化） */
interface DamageRuntime {
  host: DamageHost;
  vm: ScriptVm;
  ctx: SyscallContext;
  /** `Hurt` 里打的音效（打自己/主目标时只有 `Hit01`，不打 0x125） */
  sounds: { name: string; volume: number }[];
  /** 最近一次脚本失败的报错（成功路径恒 null；降级计数在 `world.damageFallbacks`） */
  error: string | null;
}

const DAMAGE_RUNTIMES = new WeakMap<World, DamageRuntime>();

function damageHandleOf(world: World, u: Unit): number {
  const i = world.units.indexOf(u);
  return DAMAGE_HANDLE_BASE + (i >= 0 ? i : world.units.length);
}

function unitOfDamageHandle(world: World, handle: number): Unit | undefined {
  const i = Math.trunc(handle) - DAMAGE_HANDLE_BASE;
  return i >= 0 && i < world.units.length ? world.units[i] : undefined;
}

/**
 * 旧实现（R67 的**降级**路径）：主将扣血 + 判死，士兵命中即死。
 * 语义与改动前完全一致（`g.hp -= dmg; if (g.hp<=0) {...}; else to.alive=false`）。
 */
export function legacyDamage(world: World, to: Unit, dmg: number): void {
  if (to.isGeneral) {
    const g = world.sides[to.side].general;
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

/**
 * 伤害落地（R67）：**默认走脚本**——真跑 MAGIC.SO 的 `Hurt` 字节码，由它的
 * `SYSCALL 0x125` 打到 `0x43ED96` 宿主函数（`syso_host.ts` 的 `DamageHost`）；
 * 脚本装不起来（浏览器未 preload、SO 解析失败、WAIT 之类）才降级到 `legacyDamage()`。
 * 返回**计划伤害**（≥1）；实际写进血条的差值记在 `DamageHost.calls` 里。
 *
 * `from` 是出手单位（普攻的攻方）：`Hurt` 读的引擎全局 `G2` 要填**出手方**主将句柄
 * （原作唯一写入者 `0x43BA59`：G2=施法方主将 `0x43BA8C`、G3=对方主将 `0x43BA9D`，
 * 见 `project/154 §1.2`、`project/159 §1` L4）。不传就保持 0（例如没有单一出手方的伤害）。
 */
export function applyDamage(world: World, to: Unit, amount: number, from?: Unit): number {
  const raw = Number.isFinite(amount) ? Math.round(amount) : 0;
  const dmg = raw > 0 ? raw : 0;
  if (dmg <= 0) return 0;
  if ((world.damageChannel ?? 'script') === 'script' && damageViaScript(world, to, dmg, from)) return dmg;
  if ((world.damageChannel ?? 'script') === 'script') world.damageFallbacks = (world.damageFallbacks ?? 0) + 1;
  legacyDamage(world, to, dmg);
  return dmg;
}

/** 脚本通道：`Hurt(arg1=伤害量, arg2=受害句柄, arg3=法术物件=0)`。成功返回 true。 */
function damageViaScript(world: World, to: Unit, dmg: number, from?: Unit): boolean {
  const rt = damageRuntimeOf(world);
  if (!rt) return false;
  const victim = damageHandleOf(world, to);
  // L4（project/154 §1.2 / §5 L4；project/159 §1）：把主将句柄写进引擎全局 `G2/G3`。
  //
  // `Hurt` 的第一条判据是 `LDSL arg2; LDG 2; EQ` / `LDSL arg2; LDG 3; EQ` / `LOR` / `3D L01364`
  // （`0x43BA59` 是 `0x4A6878[2]/[3]` 的唯一写入者）。L1 的极性落地后 `0x3D` = 比较为**假**时跳，
  // 于是这句的语义是「受害者不是 G2/G3 之一 ⇒ 跳到 0x1364 只放 Hit01 音、不扣血」，只有主将才走 0x125。
  //
  // 本端口把普攻/法术伤害**都**接到 `Hurt` 上（原作普攻不走 `Hurt`，见 §1.2 的宿主调用者表），
  // 所以 G3 这里填**受害者**（= Hurt 的 arg2）：受害单位恒等于 G3 ⇒ 永远进扣血分支，
  // 士兵也照旧 1 → 0。G2 填出手方（原作语义里的"施法方"，供脚本里其它 `LDG 2` 分支使用）。
  // 句柄口径用本模块自己的 `DAMAGE_HANDLE_BASE + units 下标`（§5 L4 明确不要引入 EXE 的
  // `& 0xffff / 0x4A64A0` 表）。
  const before = rt.host.calls.length;
  try {
    rt.vm.setEngineValue(2, from ? damageHandleOf(world, from) : 0);
    rt.vm.setEngineValue(3, victim);
    // 近战没有法术物件 ⇒ arg3 = 0（Hurt 里对它打 0x2b 命中状态，查不到对象时是 no-op）。
    // 伤害量传**正数**（R67 的 `主将掉 7 点血` 断言就是这个口径）；0/负数不会扣血。
    rt.vm.runByName('Hurt', [slot(dmg), slot(victim), slot(0)]);
  } catch (e) {
    rt.error = e instanceof Error ? e.message : String(e);
    return false;
  }
  // 真字节码可能整条路走完却没碰宿主（例如受害人被当成 g2/g3 只放音）：
  // 没记录到调用就算没打成，交给降级路径 —— 不然会静默不掉血。
  return rt.host.calls.length > before;
}

const slot = (n: number): Slot => ({ value: n, type: 0 });

/**
 * 建/取这个 World 的脚本伤害通道。**damage-only 上下文**：只服务 `Hurt` 会用到的那几条
 * syscall（0x2b 物件状态、0x125 伤害、0x300 音效），其余一律安全 no-op ——
 * 这条路径绝不能在战斗里抛异常（抛了就整局停摆），所以不认识的 syscall 就静默吞掉。
 */
function damageRuntimeOf(world: World): DamageRuntime | null {
  const cached = DAMAGE_RUNTIMES.get(world);
  if (cached) return cached;
  let program: ReturnType<typeof loadMagicProgram>;
  try {
    program = loadMagicProgram();
  } catch {
    return null;
  }
  const host = new DamageHost(
    (handle) => {
      const u = unitOfDamageHandle(world, handle);
      if (!u) return undefined;
      if (u.isGeneral) {
        const g = world.sides[u.side].general;
        return { hp: g.hp, maxHp: g.maxHp };
      }
      // 士兵没有 HP 字段（命中即死）：给 1/1，任何负数都落成 0 ⇒ killed
      return { hp: u.alive ? 1 : 0, maxHp: 1 };
    },
    (handle, res) => {
      const u = unitOfDamageHandle(world, handle);
      if (!u) return;
      if (u.isGeneral) {
        const g = world.sides[u.side].general;
        const hp = Math.max(0, Math.min(g.maxHp, g.hp + res.applied));
        g.hp = hp;
        if (hp <= 0) {
          g.alive = false;
          u.alive = false;
        }
      } else if (res.killed) {
        u.alive = false;
      }
    },
  );
  const sounds: { name: string; volume: number }[] = [];
  // 脚本通道自己的 PRNG：**不碰 `world.rng`**，否则脚本里一次 rand 就会把整局骰序推歪
  const localRng = mulberry32((world.tick + 1) ^ 0x51c0);
  const box: { ctx?: SyscallContext } = {};
  const vm = new ScriptVm(program, {
    syscall: (id, args) => (box.ctx ? dispatchSyscall(box.ctx, id, args) : undefined),
    wait: () => {
      throw new Error('damage channel: 脚本 WAIT 不适用（只跑同步的 Hurt）');
    },
    waitFor: () => {
      throw new Error('damage channel: 脚本 WAITFOR 不适用');
    },
  });
  const ctx: SyscallContext = {
    vm,
    casterHandle: 0,
    targetHandle: 0,
    clock: world.tick,
    unitOf: (h) => {
      const u = unitOfDamageHandle(world, h);
      return u ? { x: u.x * 96, y: u.y * 72, z: 0, side: u.side === 'A' ? 0 : 1, alive: u.alive } : undefined;
    },
    handleOfObject: () => 0,
    isUnit: (h) => unitOfDamageHandle(world, h) !== undefined,
    unitSide: (h) => {
      const u = unitOfDamageHandle(world, h);
      return u ? (u.side === 'A' ? 0 : 1) : -1;
    },
    unitAlive: (h) => unitOfDamageHandle(world, h)?.alive === true,
    unitPx: (h) => {
      const u = unitOfDamageHandle(world, h);
      return u ? { x: u.x * 96, y: u.y * 72, z: 0 } : { x: 0, y: 0, z: 0 };
    },
    setTargetPx: () => {},
    targetPx: () => ({ x: 0, y: 0 }),
    unitAtPx: () => 0,
    spawnObject: () => 0,
    objectOf: () => undefined,
    setObjectPx: () => {},
    setObjectMotion: () => {},
    setObjectFrames: () => {},
    applyHpDelta: (h, delta) => {
      host.hurt(h, delta, 0);
    },
    // 这就是 `0x125` 的宿主函数入口（R67）：普攻与 MAGIC.SO 的 Hurt 共用。
    // 注意符号：`0x125(受害人, 0, 伤害量)` 的第 3 参是**正数伤害量**（Hurt 的门只放行
    // `0 <= arg1`，见 damageViaScript 注释），而 DamageHost.hurt 收的是 hp 差值 ⇒ 取负。
    damage: (h, amount, src) => {
      host.hurt(h, -amount, src);
    },
    readHp: (h) => {
      const u = unitOfDamageHandle(world, h);
      if (!u) return 0;
      return u.isGeneral ? world.sides[u.side].general.hp : u.alive ? 1 : 0;
    },
    maxHp: (h) => {
      const u = unitOfDamageHandle(world, h);
      if (!u) return 0;
      return u.isGeneral ? world.sides[u.side].general.maxHp : 1;
    },
    // R88：`0x119` 改走 `spawnSoldier`；这条"只算伤害"的通道不新建单位，直接 0。
    summon: () => 0,
    spawnSoldier: () => 0,
    engineGet: () => 0,
    engineSet: () => {},
    rand: (min, max) => {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return lo + Math.floor(localRng() * (hi - lo + 1));
    },
    sound: (name, volume) => {
      sounds.push({ name, volume });
    },
    loadResource: () => {},
    brightness: () => {},
    brightnessOf: () => 0,
    screenFlash: () => {},
    callScript: () => undefined,
    trace: () => {},
    markUnimplemented: () => {},
  };
  box.ctx = ctx;
  const runtime: DamageRuntime = { host, vm, ctx, sounds, error: null };
  DAMAGE_RUNTIMES.set(world, runtime);
  return runtime;
}

/** 这个 World 的脚本伤害通道调用记录（测试断言"syscall 真被调用 + 数值正确"用） */
export function damageLogOf(world: World): readonly { handle: number; amount: number; applied: number; killed: boolean }[] {
  return damageRuntimeOf(world)?.host.calls ?? [];
}

/** 脚本通道最近一次失败原因（null = 没失败过 / 还没建通道） */
export function damageErrorOf(world: World): string | null {
  return DAMAGE_RUNTIMES.get(world)?.error ?? null;
}

/**
 * R84 本场至今的技能战果标记（只读；视图飘字/测试/`?cast=` 调试都用它）。
 *
 * 与 `damageLogOf()` 的分工：`damageLogOf` 是 **R67 脚本伤害通道**（只覆盖普攻的 `Hurt`），
 * 法术对主将的伤害根本不经过它（`runtime.applyHits()` 直接改 `g.hp`），所以"法术打中了没有"
 * 只能看这里的标记。
 */
export function skillMarksOf(world: World): readonly SkillMark[] {
  return world.skillMarks;
}

/** 脚本通道里 `Hurt` 打过的音效（打自己/主目标时是 `Hit01`，不打 0x125） */
export function damageSoundsOf(world: World): readonly { name: string; volume: number }[] {
  return damageRuntimeOf(world)?.sounds ?? [];
}

/**
 * 战功的基础项「带兵差」（`0x41048D`，docs/04b:481-515）：
 * ```
 * scW = max(0, (unitL->+0x14 - gL->+0x44)*6 + (unitL->+0x18 - gL->+0x48)*12);
 * ```
 * `unit+0x14/+0x18` 是**开战时**的步兵/骑兵快照，`g+0x44/+0x48` 是**战后**的同一对值，
 * 所以这一项就是「步兵损失 ×6 + 骑兵损失 ×12」，外面那个 `max(0, …)` 是原作的。
 * （旧实现只算了 `击杀数×6/×12`，代数上等价但少了 `max(0,·)`，也没有把
 * "开战快照 − 战后值"这个结构写出来 —— R59。）
 */
export function warMeritOf(startInf: number, startCav: number, aliveInf: number, aliveCav: number): number {
  const v = (startInf - aliveInf) * 6 + (startCav - aliveCav) * 12;
  return v > 0 ? v : 0;
}

/**
 * 额外经验 `0x410989(armyA, armyB)`（R64，docs/04b:518-524）：
 * ```
 * sum = Σ(敌方每个条目 general->+0x2E)   // 敌方全体等级和
 * per = sum * 32 / [armyA]               // 分母是我方**人数**（条目数）
 * 每个我方条目 +0x08 += per
 * ```
 * 旧实现是 `(敌将等级+1)*32 / 我方才兵数` —— 分子分母都不是原作的量（R64）。
 */
export function extraExpOf(enemyLevelSum: number, ourCount: number): number {
  const sum = Math.max(0, Math.round(enemyLevelSum));
  return Math.round((sum * 32) / Math.max(1, Math.round(ourCount)));
}

/**
 * 战绩累加 `0x4084C9(g, kind)`（R63，docs/04b:550-556）：
 * ```
 * kind = +1 胜：+0x9F++（胜场）、+0xA3++（连胜）、+0xA5 = max(+0xA5, +0xA3)
 * kind = -1 败：+0xA1++（败场）、+0xA3 = 0
 * kind =  0 平：+0xA3 = 0（胜败场都不动）
 * ```
 * 纯函数：不读存档、不写存档，调用方把上一场的结果喂回来即可。
 */
export function updateRecord(rec: BattleRecord | undefined, won: boolean | 'draw'): BattleRecord {
  // 存档里的脏值（NaN / 负数 / 小数）先归一，免得把 NaN 传染给后面的累加
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const prev: BattleRecord = {
    wins: num(rec?.wins),
    losses: num(rec?.losses),
    streak: num(rec?.streak),
    bestStreak: num(rec?.bestStreak),
  };
  if (won === 'draw') return { ...prev, streak: 0 };
  if (won) {
    const streak = prev.streak + 1;
    return { wins: prev.wins + 1, losses: prev.losses, streak, bestStreak: Math.max(prev.bestStreak, streak) };
  }
  return { wins: prev.wins, losses: prev.losses + 1, streak: 0, bestStreak: prev.bestStreak };
}

function indexOr(table: MatrixTable, name: string, fallback: number): number {
  const i = table.names.indexOf(name);
  return i >= 0 ? i : fallback;
}

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/**
 * 士气项：`((short)g->+0x38 - 0x32) / 5`（docs/04b §2.5 / 04b:249）。
 * 范围 −10..+10（士气 0..100），C 的整除向零截断，与原作 `idiv` 一致。
 */
export function moraleTerm(morale: number): number {
  return Math.trunc((morale - MORALE_BASE) / (MORALE_DIV * MORALE_DAMP));
}

/**
 * 战力 = 150 + 兵种相克 + 地形 + 阵形相克 + 士气项（原作五段加算）。
 *
 * 五段是**纯加法**：150 是硬编码立即数（`0x43A3AD` / `0x43A3B7` 两条
 * `c705 … 96000000` 把 `unit+0x70` 直接写成 150），后续只有
 * read-modify-write（`0x442FC0`/`0x442FC3`/`0x442FC8`）。依据：docs/04b5 Q1。
 * 疲劳（`general+0x3A`）**不在**这五项里（`0x442EFA`/`0x443498` 零命中），别加。
 */
export function powerOf(world: World, side: Side): number {
  const rt = world.sides[side];
  // R37 策略：`army+0x70` 的加減就是這條五段加算裡的一項
  // （增強攻擊 +10/20/30、強化士兵讓敵方 −10/20/30、混亂敵軍 ±5/10/15），
  // 缺省 0 時與原式逐位相同。
  const strategyAtk = world.army?.[side]?.atkMod ?? 0;
  const base = 150 + rt.troopBonus + rt.terrainBonus + rt.formationBonus + moraleTerm(rt.morale) + strategyAtk;
  // R33：軍師技「士兵攻擊力上昇 / 強化士兵」是**加點數**，不是乘百分比。
  // 原作 `0x44D450` 的 exec 21-23 對 `ownArmy+0x70 += 10/20/30`、exec 24-26 對
  // `foeArmy+0x70 -= 10/20/30`；`+0x70` 就是這個 150 起步的戰力和（docs/04b5 §1.2/§1.3）。
  // `0x442EFA`/`0x443498` 的五段加算裡沒有任何乘法指令（docs/04b5 §4.1）。
  // 舊式 `Math.round(base * (1 + bonus/100))` 是本作自造，R33 已按原作改成純加法；
  // 沒有軍師技時 `bonus = 0`，結果與原式逐位相同。詳見 project/109。
  return base + wiseBonus(world, side, 'troop_atk');
}

/**
 * 命中判定值 p（分母 300，`rand()%300 < p` 即命中）。原作 `0x43D400` / docs/04b4 §3.1：
 *  - 兵 → 兵：p = 攻方战力（150 + 相克 + 地形 + 阵形 + 士气）
 *  - 兵 → 将：p = 150 − 武力×20/100        （04b4:171，HitRoll_Grunt）
 *  - 将 → 兵：p = 150 + 武力/2              （04b4:189-191，HitRoll_General）
 *  - 将 → 将：p = 150 + (攻方武力 − 守方武力)/2
 * 最后一项：目标本 tick 有位移（原作 `0x43BE08(o)==0`，即还没站定）→ p × 2/3（04b4:173）。
 */
export function hitChance(world: World, from: Unit, to: Unit): number {
  const str = world.sides[from.side].general.str;
  let p: number;
  if (from.isGeneral) {
    p = to.isGeneral
      ? 150 + Math.trunc((str - world.sides[to.side].general.str) / 2)
      : // R44：目标带 `+0x2C & 4`（骑兵 `0x43B6C9`）时是 `150+STR/3`，否则 `150+STR/2`
        // （docs/04b4:189-191）。同一份 bit 语义见 `isCavalryBit()` 的说明。
        150 + Math.trunc(str / (isCavalryBit(to) ? 3 : 2));
  } else if (to.isGeneral) {
    p = 150 - Math.trunc((world.sides[to.side].general.str * 20) / 100);
  } else {
    p = powerOf(world, from.side);
  }
  // R39 天气：命中判定值加一个绝对修正（晴 0 / 雨 −10 / 雪 −15 / 雾 −20，[推测]）
  p += weatherHitMod(world.weather);
  if (to.x !== to.prevX || to.y !== to.prevY) p = Math.trunc((p * 2) / 3);
  return p;
}

/**
 * 命中判定的掷骰部分（R50 消费点 `unit+0x2C & 4`）—— 原作 `0x43D400 HitRoll`：
 * ```
 * p = 命中判定值;  roll = rand() % 300;
 * if (roll < p) return 1;
 * if (from->+0x2C & 4) { p = p * 2 / 3; roll = rand() % 300; if (roll < p) return 1; }  // 0x43D48C
 * return 0;
 * ```
 * `Unit.status` 缺省 0 ⇒ 只掷一次、`world.rng()` 不多抽，与改动前**逐位相同**。
 * 证据：docs/04b:152-181（HitRoll 全文）、docs/04b:168（`0x43D48C` 连击/必杀位）。
 */
export function hitRoll(world: World, from: Unit, to: Unit): boolean {
  const p = hitChance(world, from, to);
  if (hitRollOnce(world, p)) return true;
  if (!statusBitOf(from, UNIT_STATUS.DOUBLE_HIT)) return false;
  const p2 = Math.trunc((p * 2) / 3);
  return hitRollOnce(world, p2);
}

/**
 * 一次 `rand() % 300 < p`。接线了 `world.roll`（R115）就走原作流 `roll.int(300)`；
 * 否则维持旧的 `world.rng() * 300 < p`（**逐位不变**，139 处 `seed:` 用例都靠这条）。
 */
function hitRollOnce(world: World, p: number): boolean {
  const roll = world.roll;
  if (roll) return roll.int(300) < p;
  return world.rng() * 300 < p;
}

export function troopBonus(data: GameData, aTroop: number, bTroop: number): number {
  return data.troops.matrix[aTroop]?.vs[bTroop] ?? 0;
}

/**
 * 地形项，−25..+25（docs/04b §3.2 的 12×13 表；原作 `0x4307AE TerrainMod`：
 * `terrain < 12` 否则 0，取 `[terrain*0x34 + troop*4 + 0x48D030]`）。
 *
 * 表存在 `terrains.json` 每条的 `vs` 上（行=地形 id 0..11，列=兵种 0..12）。
 * 越界（地形 id 出 0..11、兵种出 0..12、`vs` 缺失或非有限数）一律返回 0 —— 绝不抛异常：
 * 调用方是每 tick 的战力计算，抛了会炸整局。
 */
export function terrainBonus(data: GameData, terrainId: number, troopIndex: number): number {
  if (!Number.isInteger(terrainId) || !Number.isInteger(troopIndex)) return 0;
  const row = data.terrains[terrainId]?.vs;
  if (!Array.isArray(row)) return 0;
  const v = row[troopIndex];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function formationBonus(data: GameData, aForm: number, bForm: number): number {
  return data.formations.matrix[aForm]?.vs[bForm] ?? 0;
}

/**
 * 最近敌人（本作缺省前压/主将压上的选目标口径）：欧氏距离，`d < bestD` 才换。
 *
 * F26 tie-break：距离**完全相等**时，列更靠前的候选优先被选中（原作「站前面的先挨打」）。
 * 只在候选真的带 `col` 时才会生效 —— 小兵的 `col` 是 undefined、两边都按中列算（rank 1），
 * 所以没有站位参数的旧对局仍是「数组里先出现的那个」，逐位不变。
 */
export function nearestEnemy(world: World, u: Unit): Unit | null {
  const c = unitCell(u);
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const v of world.units) {
    if (!v.alive || v.side === u.side) continue;
    const t = unitCell(v);
    const d = Math.hypot(t.gx - c.gx, t.gy - c.gy);
    const tie = d === bestD && best !== null && colRankOf(v.col) < colRankOf(best.col);
    if (d < bestD || tie) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// R158：行动 tick 抽格步进（原作 `0x43B574` → `0x43C2A5` → `0x43C4C0` → `0x43BF26`）
//
// 原作没有速度：每一步都是一格。四个机制函数逐条对应：
//   0x43B574  行动闸门：`[u+0x34]` 每帧 −1，到期那帧才动，随即复位 40（0x4000 态 46）
//   0x43C2A5  方位抽样：`mode` 基向量 + 权重无放回抽样，得到候选方位序列
//   0x43C4C0  试落点：先试「界内且空格」，再试「可让位」，都失败原地不动
//   0x43BF26  落地：逻辑格直接改成新格（瞬移），`0x43BE42` 再用 40 帧滑完这段像素
// 门与抽样的分工见 `project/155_部队指令语义.md` §1.4/§2.1/§2.2。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 单位所在的**逻辑格**。滑动中取目标格（`u+0x8/+0xc` 在 `0x43BF26` 里已经是新格）。
 *
 * `slide.gx/gy` 是落点格；`tx/ty` 只是带抖动的视觉目标（±0.25 格），不参与任何逻辑判定。
 */
export function unitCell(u: Unit): { gx: number; gy: number } {
  const s = u.slide;
  if (s) {
    if (s.gx != null && s.gy != null) return { gx: s.gx, gy: s.gy };
    return { gx: Math.round(s.tx), gy: Math.round(s.ty) };
  }
  return { gx: Math.round(u.x), gy: Math.round(u.y) };
}

/** 界内判定 `0x43AF54`：`0 <= x < 0x47(71) && 0 <= y < 0xE(14)` */
export function inGrid(gx: number, gy: number): boolean {
  return gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H;
}

function cellKey(gx: number, gy: number): number {
  return gy * GRID_W + gx;
}

const STEP_DIRS: readonly (readonly [number, number])[] = [
  [1, 0], // 0 E
  [1, -1], // 1 NE
  [0, -1], // 2 N
  [-1, -1], // 3 NW
  [-1, 0], // 4 W
  [-1, 1], // 5 SW
  [0, 1], // 6 S
  [1, 1], // 7 SE
];
/** `g_48E580`：按 `3*(sy+1)+(sx+1)` 取基向量序号；−1 = 只出 (0,0)（待机） */
const STEP_BASE_MODE: readonly number[] = [3, 2, 1, 4, -1, 0, 5, 6, 7];
/** `g_48E5A8`：无放回抽到第 j 个桶时的旋转量 `[0,-1,+1,-2,+2,-3,+3,-4]` */
const STEP_ROT: readonly number[] = [0, -1, 1, -2, 2, -3, 3, -4];

/** 锥形权重 `0x48E6E8`/`0x48E808` 的第一组：80% 正前 + 各 10% ±45° */
export const STEP_W_CONE: readonly number[] = [80, 10, 10, 0, 0, 0, 0, 0];
/** 第二组（允许让位/退场时用）：60/15/15/5/5 */
export const STEP_W_CONE_WIDE: readonly number[] = [60, 15, 15, 5, 5, 0, 0, 0];
/** 直线权重 `0x48E7C0`/`0x48E730`：100% 正前 */
export const STEP_W_STRAIGHT: readonly number[] = [100, 0, 0, 0, 0, 0, 0, 0];
/** 中央集中归行后的权重 `0x48E898`：35% 正前 + 35% 正后 + 六斜各 5% */
export const STEP_W_FOCUS_ROW: readonly number[] = [35, 5, 5, 5, 5, 5, 5, 35];
/** 原地不动（`0x48E6A0` 全 0） */
export const STEP_W_HOLD: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];

export type StepPlanKind =
  | 'hold'
  | 'advance'
  | 'back'
  | 'spread'
  | 'focus'
  | 'shiftUp'
  | 'shiftDown'
  | 'rush'
  | 'retreat'
  | 'toward'
  | 'default';

/**
 * 一次行动 tick 的抽格计划：基向量 `(sx,sy)` + 两轮权重。
 * 对应 `0x43C4C0(u, sx, sy, desc)` 的四个参数（`desc` = 第一组/第二组权重各 8 项）。
 */
export interface StepPlan {
  sx: number;
  sy: number;
  w1: readonly number[];
  w2: readonly number[];
  kind: StepPlanKind;
}

export interface StepOffset {
  dx: number;
  dy: number;
}

/**
 * `0x43C2A5` 方位抽样：按权重**无放回**抽，返回候选方位序列（顺序即试落点顺序）。
 *
 * 权重按 `0x450117(n) = rand()%n` 抽：给了 `roll`（R115 原作流）就用 `roll.int(sum)`，
 * 否则退回 `Math.floor(rng() * sum)`（旧行为，同一 seed 可复现）。
 * `mode == -1`（基向量 0,0）时两轮都只给 (0,0)，即原地不动。
 */
export function sampleStepOffsets(
  sx: number,
  sy: number,
  w1: readonly number[],
  w2: readonly number[],
  rng: () => number,
  roll?: SangoRng | null,
): { first: StepOffset[]; second: StepOffset[] } {
  const cx = sx > 0 ? 1 : sx < 0 ? -1 : 0;
  const cy = sy > 0 ? 1 : sy < 0 ? -1 : 0;
  const mode = STEP_BASE_MODE[3 * (cy + 1) + (cx + 1)] ?? -1;
  const draw = (weights: readonly number[]): StepOffset[] => {
    if (mode < 0) return [];
    const left = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Math.max(0, Math.round(weights[i] ?? 0)));
    let sum = left.reduce((a, b) => a + b, 0);
    const out: StepOffset[] = [];
    while (sum > 0) {
      let r = roll ? roll.int(sum) : Math.floor(rng() * sum);
      let j = 0;
      while (j < 8 && r >= left[j]!) {
        r -= left[j]!;
        j++;
      }
      if (j >= 8) j = 7;
      const k = (mode + STEP_ROT[j]!) & 7;
      const d = STEP_DIRS[k]!;
      out.push({ dx: d[0], dy: d[1] });
      sum -= left[j]!;
      left[j] = 0;
    }
    return out;
  };
  return { first: draw(w1), second: draw(w2) };
}

/**
 * 朝目标格走一步的**基向量**。
 *
 * 原作里 `(sign, sign)` 的斜基向量只出现在 `0x43C888(u,tx,ty)` 的**一处**分支（小队 cmd 1
 * 的 `0x43C831` 为真、以及 cmd 7/9），其余「朝某处走」都是一条轴：先沿 x 推进、x 对齐了
 * 才沿 y 走（`0x43CF07[1]` 主将前進 = `0x43C4C0(u,±1,0,0x48E5C8)`）。
 * 这也是蒙特卡洛 200k 的结论：空场正前基向量 79.9% 正前 / 20.1% 斜前 / 0 上下；
 * 旧实现用 `(sign, sign)` 造成了 36.4%/42.7%/15.4%/5.6% 的斜前偏多（project/173 Q7）。
 */
export function planToward(
  from: { gx: number; gy: number },
  to: { gx: number; gy: number },
  w1: readonly number[],
  w2: readonly number[],
  kind: StepPlanKind,
): StepPlan | null {
  const dx = to.gx - from.gx;
  const dy = to.gy - from.gy;
  if (dx === 0 && dy === 0) return null;
  const sx = Math.sign(dx);
  const sy = sx !== 0 ? 0 : Math.sign(dy);
  return { sx, sy, w1, w2, kind };
}

/** 指定基向量的计划（命令字直接给 `(sx,sy)` 的那些分支用它） */
export function planDirected(
  sx: number,
  sy: number,
  w1: readonly number[],
  w2: readonly number[],
  kind: StepPlanKind,
): StepPlan {
  return { sx: Math.sign(sx), sy: Math.sign(sy), w1, w2, kind };
}

type Occ = Map<number, Unit>;

function buildOccupancy(world: World): Occ {
  const occ: Occ = new Map();
  for (const u of world.units) {
    if (!u.alive) continue;
    const c = unitCell(u);
    if (!inGrid(c.gx, c.gy)) continue;
    const k = cellKey(c.gx, c.gy);
    if (!occ.has(k)) occ.set(k, u);
  }
  return occ;
}

/** 40 帧滑动的推进（`0x43BE42`：每帧 `+= 总位移/0x28`） */
function advanceSlides(world: World): void {
  for (const u of world.units) {
    const s = u.slide;
    if (!s) continue;
    s.done++;
    if (s.done >= s.total) {
      u.x = s.tx;
      u.y = s.ty;
      u.slide = undefined;
      continue;
    }
    const k = s.done / s.total;
    u.x = s.fx + (s.tx - s.fx) * k;
    u.y = s.fy + (s.ty - s.fy) * k;
  }
}

/**
 * 落地：逻辑格瞬移 + 40 帧视觉滑动（`0x43BF26` + `0x43BE42`）。
 *
 * `0x43BE42` 的落点像素 = 格心 `(gx*0x60+0x30, gy*0x48+0x24)` 加上
 * `rand()%0x30-0x18`（±24px）/ `rand()%0x24-0x12`（±18px）的抖动，再按
 * `±0x780000`(120px) / `±0x5A0000`(90px) 夹住位移，最后除以 0x28 帧线性积分。
 * 这里换成格单位（96×72 px/格）后就是 ±0.25 格。
 *
 * **R194 刻意偏离原作**：抖动幅度砍半成 `%0x18-0xC` / `%0x12-0x9`（±12/±9 px = ±0.125 格）。
 * 依据是实机反馈「兵与兵互相穿模」：实测车道节距只有 43.59px，而 ±18px = 0.25 车道，
 * 邻居的脚会被推到对方身上。砍半后「>50% 重叠」从 8.54 降到 5.59 对/帧（见
 * `work/anim_fix/PATCH_jitter.md`）。要恢复原作手感只改下面两行即可，别连着改 clampPx。
 */
function commitStep(u: Unit, cell: { gx: number; gy: number }, occ: Occ, rng: () => number): void {
  const from = unitCell(u);
  if (inGrid(from.gx, from.gy) && occ.get(cellKey(from.gx, from.gy)) === u) occ.delete(cellKey(from.gx, from.gy));
  occ.set(cellKey(cell.gx, cell.gy), u);
  // 0x60 = 96px/格（x 纵深），0x48 = 72px/格（y 车道）；0x30/0x24 是半格 = 格心
  const jx = Math.floor(rng() * 0x18) - 0xc; // −12..+11 px（R194 砍半，原作 ±0x18）
  const jy = Math.floor(rng() * 0x12) - 0x9; // −9..+8 px（R194 砍半，原作 ±0x12）
  const dx = clampPx((cell.gx - u.x) * 96 + jx, 0x780000 / 0x10000); // ±120 px
  const dy = clampPx((cell.gy - u.y) * 72 + jy, 0x5a0000 / 0x10000); // ±90 px
  u.slide = {
    fx: u.x,
    fy: u.y,
    tx: u.x + dx / 96,
    ty: u.y + dy / 72,
    total: ACTION_SLIDE_TICKS,
    done: 0,
    gx: cell.gx,
    gy: cell.gy,
  };
}

function clampPx(v: number, lim: number): number {
  return v > lim ? lim : v < -lim ? -lim : v;
}

/**
 * 没走成（`0x43C4C0` 两轮都失败）→ `0x43C084`：40 帧把像素滑回**格心**。
 *
 * 原作这一支只对齐像素（逻辑格没变），所以这里不加抖动、落点就是整数格。
 */
function settleToCell(u: Unit, cell: { gx: number; gy: number }): void {
  if (u.x === cell.gx && u.y === cell.gy) return;
  const dx = clampPx((cell.gx - u.x) * 96, 0x780000 / 0x10000);
  const dy = clampPx((cell.gy - u.y) * 72, 0x5a0000 / 0x10000);
  u.slide = {
    fx: u.x,
    fy: u.y,
    tx: u.x + dx / 96,
    ty: u.y + dy / 72,
    total: ACTION_SLIDE_TICKS,
    done: 0,
    gx: cell.gx,
    gy: cell.gy,
  };
}

/**
 * 请己方单位让位（`0x43C20D` → `vcall[0x4c](obj, 2, 0)`）。
 *
 * 只让**空闲**的友军让（原作里让位对象自己也要过一套检查；我们保留最强的两条：
 * 本帧没动作过、不在滑动中）。让位目标格取「远离请位者」的那一侧优先，避免
 * 被让的单位反过来挤在请位者要走的路上。
 */
function yieldFriend(world: World, other: Unit, mover: Unit, occ: Occ): boolean {
  if (other.slide) return false;
  if (other.lastActTick === world.tick) return false;
  const oc = unitCell(other);
  const mc = unitCell(mover);
  const awayX = Math.sign(oc.gx - mc.gx);
  const awayY = Math.sign(oc.gy - mc.gy);
  const order: (readonly [number, number])[] = [];
  const first = STEP_DIRS.findIndex((d) => d[0] === awayX && d[1] === awayY);
  if (first >= 0) order.push(STEP_DIRS[first]!);
  for (const d of STEP_DIRS) if (!order.includes(d)) order.push(d);
  for (const d of order) {
    // 主将让位也不许换兵道：只沿 x 前后挪，横向让位会把两将错开、永远对不上
    if (other.isGeneral && d[1] !== 0) continue;
    const tx = oc.gx + d[0];
    const ty = oc.gy + d[1];
    if (!inGrid(tx, ty)) continue;
    if (occ.has(cellKey(tx, ty))) continue;
    commitStep(other, { gx: tx, gy: ty }, occ, world.rng);
    return true;
  }
  // 兵尽主将索敌：整排都被自己人堵死、没有空格可让时，让友军与主将互换位置。
  // 否则主将永远挤不出自家方阵（R216 实测白等 9170 tick 到 198s 判平手）。
  // 平时也让主将能换位：原作主将是一路压到阵前的，不能因为前排站满就钉在后阵。
  if (mover.isGeneral) {
    commitStep(other, mc, occ, world.rng);
    return true;
  }
  return false;
}

export type StepPick = { gx: number; gy: number } | { exit: true } | null;

/**
 * 「不许穿阵」拦阻（R190 P0，`[新设计]`：原作**没有**这条）。
 *
 * 原作取证（`project/155` §1.4 `0x43C4C0` + `0x43C20D`、`work/orig_battle_behavior/03,04`）：
 * 走位只判**目标格**——界内 + 该格无人（`0x43B467`/`0x43AF7A`），第二轮也只拒敌格，
 * 从不看路径、车道或相邻格。所以"擦着敌人身边走过去"在原作里同样合法。
 *
 * 用户实机反馈（R190 两条）：
 *  ①「我方武将前方没有敌方武将和小兵阻挡后，直接穿过去了」
 *  ②「两个小兵前方没有敌方的情况下，放着旁边的敌人不管直接跑过去了」
 * 共同机制就是**擦过去**：目标格是空的 ⇒ 放行 ⇒ 观感上"敌阵不存在"。这里补两条拦阻，
 * 只在**擦着敌人走**时生效：
 *
 *  A. 斜穿禁止：1 格斜步 `(dx,dy)` 的两个正交拐角 `(x+dx,y)` / `(x,y+dy)` **都**站着敌人
 *     ⇒ 不许走（两敌之间的对角缝不钻）。只占一个拐角时仍可走：这是「贴侧被堵 → 斜插进敌人
 *     那条车道 → 下一手同排攻击」的唯一入口，禁死会把战线锁成并排站着打不到的死局。
 *     （probe：禁死版 R80 60v60 2600 tick 都打不完，放宽后 1400 上下打完。）
 *  B. 夹缝禁止：目标格在**垂直于本步主轴**的两侧都被敌人夹住 ⇒ 不许挤进去（1 格缝不穿）。
 *     例：B 兵 `(49,5)` 与 B 将 `(49,7)` 夹着 `(49,6)`，我方主将不许走进 `(49,6)`。
 *  C. 贴侧不许纵深：往纵深退/进一格时，**当前格**的侧翼（`from.gy±1`）或**落点**的侧翼
 *     （`ty±1`）有敌人 ⇒ 不许进。这是反馈②的主诉：敌人贴在旁边时既不挡路、也进不了
 *     同排扫描（`0x43BBE6` 只沿 ±x），旧实现当它不存在，于是"放着旁边的敌人不管直接跑过去"。
 *     禁的只是**纵深**方向，侧移不受限，所以被贴住时仍能靠横移脱身（见 REPORT「遗留风险」）。
 *
 * 三条都只看**目标格周围 1 格**，不扫车道、不看整条战线 —— 与"只判目标格"的模型同源，
 * 只是把判据从"目标格是否被占"扩到"目标格是否贴着敌人"。`world.blockPass === false`
 * 时完全退回旧行为（对比测试用）；**唯一豁免是溃逃 `u.flee`**（见函数内注释）。
 */
function passBlocked(
  world: World,
  u: Unit,
  from: { gx: number; gy: number },
  tx: number,
  ty: number,
  occ: Occ,
): boolean {
  if (world.blockPass === false) return false;
  // 只有溃逃豁免：`0x4000` 退却态在原作里就是「散开跑」，被侧翼敌人堵死＝逃不掉。
  // 突擊**不豁免**（用户抱怨的正是「全軍突擊時穿過去」）——冲锋路线同样要绕，不许踩过去。
  if (u.flee) return false;
  const enemyAt = (gx: number, gy: number): boolean => {
    if (!inGrid(gx, gy)) return false;
    const o = occ.get(cellKey(gx, gy));
    return !!o && o.side !== u.side;
  };
  const dx = tx - from.gx;
  const dy = ty - from.gy;
  if (dx !== 0 && dy !== 0) {
    // A. 斜穿：两个正交拐角**都被敌人占住**才算抄敌人的近路（两敌之间的对角缝不许钻）。
    //    任一拐角被占时仍允许走 —— 这一步正是「被侧翼敌人贴住时斜插进敌人那条车道」的唯一入口
    //    （敌人的格子永远不可进，同级 x 的上下格被 B 当夹缝拒，只剩斜插），
    //    禁掉它会把战线锁成「并排站着互相打不到」的死局（R80 60v60 实测 2600 tick 打不完）。
    const cx = enemyAt(from.gx + dx, from.gy);
    const cy = enemyAt(from.gx, from.gy + dy);
    if (cx && cy) return true;
  }
  if (dx === 0 && dy !== 0) {
    // B. 竖向一步：左右两侧都是敌人 ⇒ 夹缝
    return enemyAt(tx - 1, ty) && enemyAt(tx + 1, ty);
  }
  if (dx !== 0 && dy === 0) {
    // C. 贴侧不许纵深：敌人贴在**现在这一格**的侧翼（`from.gy±1`）或**落点**的侧翼（`ty±1`）时，
    //    不许沿纵深走。用户反馈②的主诉就是这个：敌人贴在旁边时既不挡路、也进不了同排扫描
    //    （`0x43BBE6` 只沿 ±x），旧实现当它不存在，于是"放着旁边的敌人不管直接跑过去"。
    //    只禁纵深（前后），侧移/上下的候选仍可走 ⇒ 被贴住时能靠侧移脱身，不会永久卡死。
    if (enemyAt(from.gx, from.gy - 1) || enemyAt(from.gx, from.gy + 1)) return true;
    if (enemyAt(tx, ty - 1) || enemyAt(tx, ty + 1)) return true;
    return false;
  }
  return false;
}

/**
 * 贴住就插进去（`[新设计]`，R190 v3，与 `passBlocked` 同一组规则）。
 *
 * 起因：`0x43BBE6` 只沿 ±x 扫同排 ⇒ 站在**相邻车道**的敌人既不挡路也进不了攻击扫描，
 * `passBlocked` 只能拦住「纵深推进」，拦不住「斜着绕开」（用户反馈②：小兵放着旁边的敌人
 * 不管直接跑过去）。这里补的是接敌那一步：正前 / 斜前格站着敌人、且我方横移一格能落进
 * **敌人那条车道**（落点空格）时，本 tick 横移过去；下一手与敌人同排相邻 ⇒ `adjacentEnemy()`
 * 必中（`0x43BBE6`），观感从「擦着敌人跑过去」变成「贴上去打」。
 *
 * 触发条件（写死，不抽样、不消耗 rng）：
 *  1. 斜前格 `(from.gx+f, from.gy±1)` 有敌人（正前有敌时本来就打得到，不需要插）；
 *  2. 横移落点 `(from.gx, 敌人车道)` 界内且**空**；
 *  3. `passBlocked` 不否认（不往两敌夹缝里钻）。
 *  4. 只有射程 1 的近战才插：弓/弩/飞刀（`attackRangeOf(u) > 1`，表在 `:186`）扫的是
 *     **自己那一整排**，插进敌人车道换的是「这排换那排」，不是「够不着变够得着」；
 *     放开会让远程兵种在 `tests/battle.test.ts:347` 的地形胜率口径里凭空变强。
 * 候选顺序固定 `[-1, +1]`；不碰 `chooseStepCell` 的候选顺序与权重表
 *（`project/173` §7 的抽样复刻度要保持）。
 */
function pullInStep(world: World, u: Unit, occ: Occ, kind?: StepPlanKind): { gx: number; gy: number } | null {
  if (world.blockPass === false) return null;
  if (u.flee) return null;
  // 主将不换兵道（原作 `0x43D76C` 只打 x+dir、y 不变），所以「斜前插进邻道」对它禁用
  if (u.isGeneral) return null;
  if (attackRangeOf(u) > 1) return null;
  // 全軍突擊（`kind === 'rush'` 或 `world.rush[side]`）不做「插队贴打」：突擊是**玩家按下
  // 冲锋**的命令，那一步横移会多抽 2 次 `commitStep` 抖动（RNG 流位移），把 `tests/weather.test.ts`
  // 那种「聚合命中率」统计搅成噪声。拦阻（`passBlocked`）照旧生效——突擊也不许穿阵。
  if (kind === 'rush' || world.rush?.[u.side]) return null;
  const from = unitCell(u);
  const f = u.side === 'A' ? -1 : 1; // 前进方向，与 `army_cmd.ts:673` 同源
  for (const dy of [-1, 1]) {
    const gy = from.gy + dy;
    if (!inGrid(from.gx + f, gy)) continue;
    const foe = occ.get(cellKey(from.gx + f, gy));
    if (!foe || foe.side === u.side) continue; // 斜前没有敌人 ⇒ 不触发
    if (occ.has(cellKey(from.gx, gy))) continue; // 落点必须空格
    if (passBlocked(world, u, from, from.gx, gy, occ)) continue;
    return { gx: from.gx, gy };
  }
  return null;
}

/**
 * `0x43C4C0` 试落点。
 *
 * 第一轮（`desc+4`）：界内 + 空格（`0x43B467`）即落。
 * 第二轮（`desc+0x24`）：空格落；拒绝**敌格**（`0x43C20D` 比 `+0x40` 阵营）；
 * 拒绝本帧已动作过的友军与 `status & 0x1001` 的友军；其余己方空闲单位请它让位。
 * 撤退态（`0x4000`）在第二轮允许从 x 越界处离场（`0x43BFE7`，细节 `[未解]`）。
 * 两轮都失败 → 原地不动（`0x43C084` 把像素对齐到格心）。
 */
export function chooseStepCell(world: World, u: Unit, plan: StepPlan, occ: Occ): StepPick {
  const from = unitCell(u);
  const { first, second } = sampleStepOffsets(plan.sx, plan.sy, plan.w1, plan.w2, world.rng, world.roll);
  for (const d of first) {
    const tx = from.gx + d.dx;
    const ty = from.gy + d.dy;
    if (!inGrid(tx, ty)) continue;
    if (occ.has(cellKey(tx, ty))) continue;
    if (passBlocked(world, u, from, tx, ty, occ)) continue;
    return { gx: tx, gy: ty };
  }
  for (const d of second) {
    const tx = from.gx + d.dx;
    const ty = from.gy + d.dy;
    if (!inGrid(tx, ty)) {
      if (u.flee && ty >= 0 && ty < GRID_H) return { exit: true };
      continue;
    }
    const other = occ.get(cellKey(tx, ty));
    if (!other) {
      if (passBlocked(world, u, from, tx, ty, occ)) continue;
      return { gx: tx, gy: ty };
    }
    if (other.side !== u.side) continue; // 敌格：一律拒绝（`+0x40` 阵营不同）
    if (other.lastActTick === world.tick) continue; // 本帧刚动作过
    if (((other.status ?? 0) & 0x1001) !== 0) continue;
    if (yieldFriend(world, other, u, occ)) return { gx: tx, gy: ty };
  }
  return null;
}

/**
 * 默认抽格计划（`[新设计]`，只在本作没接部队指令层时生效）。
 *
 * 原作缺省命令是 `0`（待机），本作保留"自动前压"作为兼容缺省 —— 34 个既有测试与
 * demo 都按这个节奏跑；一旦 `installArmyOrders()` 装上，命令字就是唯一来源。
 */
export function defaultStepPlan(world: World, u: Unit): StepPlan | null {
  if (u.isGeneral) return generalStepPlan(world, u);
  const foe = nearestEnemy(world, u);
  if (!foe) return null;
  return planToward(unitCell(u), unitCell(foe), STEP_W_CONE, STEP_W_CONE_WIDE, 'default');
}

/**
 * 主将默认行为：**跟着部队往前压**，不再缩在后阵后面。
 *
 * 历史：R158 把它写成「平时压在己方后阵后 `GENERAL_GAP` 格，前锋被打穿才前出」，
 * 那是我当时的 `[新设计]`。R172 用户实测「武将到死都在原地不动」——查下来这条就是
 * 主因之一：士兵一路推进，主将按公式吊在最后一名士兵后面 2 格，几秒才挪一格，
 * 观感就是没动。而本作的士兵缺省是**自动前压**（原作的缺省命令是 0 待机，我们是兼容
 * 缺省），主将没理由反而不动 ⇒ 改成与士兵同一套「朝最近敌人锥形推进」。
 *
 * 主将不会被自己人穿过（`chooseStepCell` 的占格互斥 + `yieldFriend`），所以它会自然
 * 被前排挡在队列里，不会越过自家士兵冲锋。
 */
export function generalStepPlan(world: World, u: Unit): StepPlan | null {
  const foe = nearestEnemy(world, u);
  if (!foe) return null;
  const c = unitCell(u);
  const t = unitCell(foe);
  // **不用 `planToward`**：锥形权重会抽 RNG（`sampleStepOffsets`），而主将每 tick 都要
  // 决策，等于给全场随机流插了一路新消耗 —— 那些"同一 seed 两世界对比"的确定性测试
  // （cast_autoaim / magic_frame / 606 等）会整体位移。主将就直线压上去，不抽随机。
  const dx = Math.sign(t.gx - c.gx);
  // 原作主将**不换兵道**（`0x43D76C` 只取 `x+dir`、y 不变）：只沿本车道推进，
  // 追不上另一条车道上的敌人就等自家士兵把那条道打穿。
  if (dx === 0) return null;
  return planDirected(dx, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'default');
}

/** 突擊目标缓存（原作 `army+0x38F4` 的敌 unit 指针 + 索引） */
interface RushTargetCache {
  unit: Unit | null;
  idx: number;
}
const RUSH_CACHE = new WeakMap<World, Record<Side, RushTargetCache>>();

function rushCacheOf(world: World): Record<Side, RushTargetCache> {
  let c = RUSH_CACHE.get(world);
  if (!c) {
    c = { A: { unit: null, idx: -1 }, B: { unit: null, idx: -1 } };
    RUSH_CACHE.set(world, c);
  }
  return c;
}

/**
 * 突擊目标（`0x43CDD3`）：缓存有效就继续用；死了/无效就按索引轮换到下一个活的小队，
 * 都轮不到就退到敌方军团本体（主将）。原作扫的是 `army+0xB4 + i*0x48` 的固定槽位，
 * 这里用「该侧存活小队数组」等价表达，索引从上次的位置 +1 开始、环形绕回。
 */
export function rushTargetOf(world: World, side: Side): Unit | null {
  const cache = rushCacheOf(world)[side];
  const foeSide: Side = side === 'A' ? 'B' : 'A';
  const squads = world.units.filter((u) => u.alive && u.side === foeSide && !u.isGeneral);
  if (cache.unit && cache.unit.alive && cache.unit.side === foeSide) {
    const i = squads.indexOf(cache.unit);
    if (i >= 0) {
      cache.idx = i;
      return cache.unit;
    }
  }
  if (squads.length > 0) {
    for (let k = 1; k <= squads.length; k++) {
      const i = (cache.idx + k) % squads.length;
      const t = squads[i];
      if (t) {
        cache.unit = t;
        cache.idx = i;
        return t;
      }
    }
  }
  const gen = world.sides[foeSide]?.general;
  const genUnit = world.units.find((u) => u.isGeneral && u.side === foeSide && u.alive) ?? null;
  if (gen && gen.alive && genUnit) {
    cache.unit = genUnit;
    return genUnit;
  }
  return null;
}

/** 突擊一步：朝缓存敌 unit 的当前格走一格（`0x43C888` + `0x48E808`） */
export function rushStepPlan(world: World, u: Unit): StepPlan | null {
  const tgt = rushTargetOf(world, u.side);
  if (!tgt) return null;
  return planToward(unitCell(u), unitCell(tgt), STEP_W_CONE, STEP_W_CONE_WIDE, 'rush');
}

/**
 * 撤退方向（`0x43CC95` 小队 / `0x43C7E3` 主将：`sx = A?+1:-1`，与敌人位置无关）。
 *
 * 它同时是 `0x43BF26` 每次移动写给 sprite 的**朝向**（`x` 变大写 0、变小写 `0x800000`），
 * 所以 `0x43BCA7` 的撤退分支（`n=1`、`dir = 朝向`）等价于「只朝本方边界那一侧看 1 格」。
 */
function retreatSx(u: Unit): 1 | -1 {
  return u.side === 'A' ? 1 : -1;
}

/** 撤退一步：纯 ±x，无 y 分量（`0x43CC95`：`sx=(A?+1:-1), sy=0`，权重 100/0） */
export function retreatStepPlan(u: Unit): StepPlan {
  // `0x43CC95`（小队）/ `0x43C7E3`（主将）：sx = A?+1:-1、sy = 0，方向朝本方边界、与敌人位置无关。
  // 权重：小队 `0x48E8E0` = 80/10/10（各 10% 走一次 ±45°），主将 `0x48E658` = 100/0（纯直线）。
  const sx = retreatSx(u);
  return u.isGeneral
    ? planDirected(sx, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'retreat')
    : planDirected(sx, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'retreat');
}

/**
 * 沿一个方向扫同排（`0x43BBE6`）。
 *
 * `x = u+8`、`y = u+c`（车道），`i = 1..n`（`n = 0x43B961(u)` 射程）：
 *  - 越界 → 这个方向扫不到（`0x43AF54` 返回 0）；
 *  - 空格 → 继续；
 *  - `0x2000`（未现身/隐身）→ 跳过；
 *  - 友军 → 视线被挡，返回 null（原作 `x = -99`）；
 *  - 敌人 → 命中。
 */
function rowEnemyAt(u: Unit, occ: Occ, dir: 1 | -1, range: number): Unit | null {
  const c = unitCell(u);
  for (let i = 1; i <= range; i++) {
    const gx = c.gx + dir * i;
    if (!inGrid(gx, c.gy)) return null;
    const o = occ.get(cellKey(gx, c.gy));
    if (!o) continue;
    if (((o.status ?? 0) & 0x2000) !== 0) continue;
    if (o.side === u.side) return null;
    return o;
  }
  return null;
}

/**
 * 能打就不走（`0x43BCA7` → `0x43BBE6`）：**同一车道**、只沿 ±x 找射程内的敌人。
 *
 * 普通态（`0x43BD06`）：`n = 2`，先随机一个首扫方向（`dir0`），命中就返回；没命中再反方向扫一次。
 * 这里等价地「两侧都扫、只有两侧都有敌人才抽一次 rng」，避免每周期给全场随机流白插一路消耗。
 * 接线了 `world.roll`（R115）时这一步走 `roll.bit()` = 原作 `rand() & 1`，
 * 保证「先看哪一侧」的**流消耗**与原作同源（结果仍是二选一，不影响伤害）。
 *
 * **撤退态**（`0x43BCD8` 的 `and eax,0x4000`）：原作把搜索降级成「**只朝当前朝向那一侧、只 1 格**」
 * （`n=1` @0x43BCE1；`dir` 取 sprite 朝向 @0x43BCEE，不掷骰）。于是撤退者**背后的敌人永远选不到** ——
 * 这就是「撤退不还手」的正证（`0x43D686`/`0x43D400` 那条攻击链本身一道状态门都没有）。
 * 本作没有 facing 字段，而 `0x43BF26` 每次移动都把朝向写成「走的那一边」、撤退只朝本方边界走，
 * 所以这里用 `retreatSx(u)` 代替朝向。第二道门 `0x43BD64`（撤退态 + 攻击方向与朝向相反 → 跳过）
 * 已被这条单向扫描涵盖；将来若补 facing 字段，两道门应分开实现。
 */
function adjacentEnemy(world: World, u: Unit, occ: Occ): Unit | null {
  // `0x43BCA7` 撤退分支：只朝朝向那一侧探 1 格（`0x43BCE1` n=1）。
  if (isRetreating(u)) return rowEnemyAt(u, occ, retreatSx(u), 1);
  const range = attackRangeOf(u);
  const left = rowEnemyAt(u, occ, -1, range);
  const right = rowEnemyAt(u, occ, +1, range);
  if (!left && !right) return null;
  if (left && !right) return left;
  if (right && !left) return right;
  const roll = world.roll;
  if (roll) return roll.bit() === 1 ? right : left;
  return world.rng() < 0.5 ? left : right;
}

/**
 * 一帧。移动/攻击的**同一条**闸门是 `0x43B574`（`[u+0x34]` 每到点才行动一次），
 * 到期那一帧要么打（有相邻敌人，`0x43BD64` 返回 0）要么走一格（返回 1），二者互斥。
 */
export function step(world: World): void {
  if (world.over) return;
  world.tick++;

  // 阶段 −1：战场 AI 的 60 帧节拍（`0x444385` 每帧 `--[0x4b041c]`，到 0 调 `0x402EA5`）。
  // 两个倒计时都零初始化 ⇒ 入场第一帧就决策一次；`world.aiSides` 全 false 时是空转。
  tickBattleAi(world);

  // 阶段 0：记下上一 tick 的**渲染**位置（命中判定「目标本 tick 在移动 → p×2/3」，
  // docs/04b4:173）；逻辑位已由 `unitCell` 表达。
  for (const u of world.units) {
    u.prevX = u.x;
    u.prevY = u.y;
  }
  // 阶段 0.5：40 帧滑动的插值（`0x43BE42`）。逻辑格早已是目标格，滑动只是表现。
  advanceSlides(world);

  // 阶段 1+2 合并：原作同一 tick 里移动与攻击由 `0x43BD64` 二选一，不是两套独立逻辑。
  const occ = buildOccupancy(world);
  const intents: { from: Unit; to: Unit }[] = [];
  const exited: Unit[] = [];
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.cd > 0) {
      u.cd--;
      continue;
    }
    if (u.slide) continue; // 保险：滑动没滑完不进入下一次行动（不清 cd，下帧再来）
    u.lastActTick = world.tick;
    // 闸门到期：先复位计时器（`0x43B574` 在分派**之前**写回 0x28/0x2e）
    const interval = actionIntervalOf(u);
    // 攻击锁定（`0x43BCA7` 开头）：每个行动周期先 `--[u+0x38]`，还 >0 就直接返回 0 ——
    // 本周期不探敌、但照常走位（原作锁定期内确实会继续移动）。
    u.atkLock = (u.atkLock ?? 0) - 1;
    const foe = u.atkLock > 0 ? null : adjacentEnemy(world, u, occ);
    if (foe) {
      // 能打就不走（`0x43BD64(u,dir)!=1` → 走攻击序列）；锁定值由出手分支写回
      u.atkLock = atkLockOf(world, u);
      u.cd = interval;
      u.lastAttackTick = world.tick;
      intents.push({ from: u, to: foe });
      continue;
    }
    let plan: StepPlan | null;
    if (u.flee) {
      // `0x43CCD9`/`0x43C827`：**每步执行 cmd 8 时**都会幂等重打 `0x4000`，所以退却态不依赖
      // 调用方有没有走 `requestRetreat()`（AI 的 `maybeRetreat` 也是直接置 flee）。
      markRetreating(u);
      plan = retreatStepPlan(u);
    }
    // 全軍突擊只写槽 1..7（`0x43ADED(army,0x101,7)`），主将槽 0 保持 0 = 待機；
    // 主将的 cmd 3..7 在原作是 `0x43CF89` 直接 ret（无操作），所以突击不推主将。
    else if (world.rush?.[u.side] === true && !u.isGeneral) plan = rushStepPlan(world, u);
    else if (world.armyStepPlan) plan = world.armyStepPlan(world, u);
    // 没装部队指令层、也没被 AI 接管 ⇒ **待機**：原作缺省命令字就是 0
    // （`0x43AEB2` 开战清零 8 个槽；`0x43CF07[0]` → `0x43C4C0(u,0,0,0x48E6A0)`，权重全 0，
    // 见 project/173 Q1）。旧代码在这里 `defaultStepPlan()` 自动前压，是 `[新设计]`，删掉。
    else plan = null;
    u.cd = interval;
    if (!plan || plan.kind === 'hold') continue;
    // R190 v3：贴住就插进去 —— 斜前的邻道敌人先横移进它那条车道，下一手同排打得到。
    // 後退（back）/ 撤退（retreat）不抢：那两种语义是「离开」，插上去等于抗令。
    if (plan.kind !== 'back' && plan.kind !== 'retreat') {
      const pull = pullInStep(world, u, occ, plan.kind);
      if (pull) {
        commitStep(u, pull, occ, world.rng);
        continue;
      }
    }
    const pick = chooseStepCell(world, u, plan, occ);
    if (!pick) {
      // 两轮都没走成（`0x43C4C0` 失败）→ `0x43C084`：40 帧滑回格心（逻辑格不变）
      settleToCell(u, unitCell(u));
      continue;
    }
    if ('exit' in pick) {
      const from = unitCell(u);
      if (inGrid(from.gx, from.gy) && occ.get(cellKey(from.gx, from.gy)) === u) occ.delete(cellKey(from.gx, from.gy));
      u.slide = undefined;
      exited.push(u);
      continue;
    }
    commitStep(u, pick, occ, world.rng);
  }
  // 离场（撤退走出 x 边界，`0x43BFE7` + `0x8000`）：不算阵亡，直接从 units 摘掉
  for (const u of exited) {
    const i = world.units.indexOf(u);
    if (i >= 0) world.units.splice(i, 1);
  }

  // 阶段 3：统一结算（不立即结算，否则先遍历的一侧每 tick 占先手）
  for (const { from, to } of intents) {
    if (from.side === 'A') world.stats.attacksA++;
    else world.stats.attacksB++;
    // R50：命中掷骰走 `hitRoll()`（原作 `0x43D400`：首掷 + `+0x2C & 4` 的 2/3 补判）。
    // `Unit.status` 缺省 0 ⇒ 只掷一次、`world.rng()` 不多抽，既有对局逐位不变。
    if (!hitRoll(world, from, to)) {
      // 格挡/招架（`THINGS.INI` Defense 的 `$Defense` 音）：只有**兵对兵的近战砍空**才算。
      // 主将出手被闪开记闪避，将来若有远程/法术也不进这个计数 —— 射空 ≠ 格挡。
      if (!from.isGeneral && !to.isGeneral) world.stats.blocks++;
      continue;
    }
    to.lastHitTick = world.tick;
    if (from.side === 'A') world.stats.hitsA++;
    else world.stats.hitsB++;
    if (to.isGeneral) {
      if (to.side === 'A') world.stats.genHitsA++;
      else world.stats.genHitsB++;
      // R46：普攻伤害按 `0x43EC54(t, a)` 算 —— 武将走 `(rand%(str-str/2)+str/2)/10`，
      // 士兵走 `战力×4/0xC0`（骑兵 ×1.2），下限 1，公式里没有防御项（docs/04b4:216-240）
      // 軍師技「保護主將」（Execute 46）原作只置 `army+0x84 |= 0x10` 并打「士兵可以保護主將」；
      // 0x10 在整份 EXE 里没有读取点（work/guard10 三套扫描 0 命中），故 `takenMul` 恒 1、不减伤。
      const taken = world.army?.[to.side]?.takenMul ?? 1;
      const dmg = Math.max(1, Math.round(basicDamage(world, from) * taken));
      // R67：落地不再就地 `g.hp -= dmg`，改走 `applyDamage()`：
      // 默认脚本通道（MAGIC.SO `Hurt` → `SYSCALL 0x125` → `0x43ED96` 宿主函数），
      // 脚本装不起来才降级到 `legacyDamage()`（= 上面那三行的原语义）。
      // L4：把攻方带进去 ⇒ `Hurt` 的 `LDG 2` 读到出手方主将句柄（原作 `0x43BA59`）。
      applyDamage(world, to, dmg, from);
    } else {
      // 士兵没有 HP（命中即死）：脚本通道里也是 hp 1 → 0 这一条路
      applyDamage(world, to, 1, from);
    }
  }

  tickSkills(world);
  recompute(world);
  // R37：策略派發（每側接戰後派一次）與援軍入場（狀態機）。放在 recompute 之後，
  // 因為「喝阻敵軍」要按剛算出的 `aliveInf/aliveCav` 抽兵。
  // R88：軍師技「一場只結算一次」——戰前 `applyWise()` 已經真正改過狀態的 seq，
  // 不再進戰中派發器。main.js 會把出征頁的 `?wise=` 同時接到戰前效果與 `army.seq`，
  // 不摘掉的話同一條技會被算兩遍（例：離間計 L3 忠誠 −25 → −50）。這裡只讀
  // `wiseAppliedAtStart()` 的清單並清 seq，不動任何戰鬥公式；滿血時沒有生效的
  // 恢復類（11/40/57、12/41/58）不在清單裡，仍由派發器在戰中持續回復。
  for (const side of ['A', 'B'] as const) {
    const army = world.army?.[side];
    if (!army || army.seq == null) continue;
    if (wiseAppliedAtStart(world, side).includes(army.seq)) army.seq = null;
  }
  tickStrategy(world);
  tickReinforce(world);
  maybeRetreat(world); // R38：AI 在兵力劣势时下令全军撤退（阈值 [推测]，由 opts.aiRetreat 打开）
  checkOver(world);
}

function recompute(world: World): void {
  for (const side of ['A', 'B'] as const) {
    const rt = world.sides[side];
    rt.aliveCount = world.units.filter((u) => u.side === side && u.alive && !(u as Unit & { isGeneral?: boolean }).isGeneral).length;
    // R59：战功要「开战快照 − 战后值」，按兵种分开数（`g+0x44` 步兵 / `g+0x48` 骑兵）
    let inf = 0;
    let cav = 0;
    for (const u of world.units) {
      if (u.side !== side || !u.alive || u.isGeneral) continue;
      if (u.kind === 'cavalry') cav++;
      else inf++;
    }
    rt.aliveInf = inf;
    rt.aliveCav = cav;
    const other = world.sides[opposite(side)];
    rt.troopBonus = troopBonus(world.data, rt.troop, other.troop);
    rt.terrainBonus = terrainBonus(world.data, world.terrain, rt.troop);
    rt.formationBonus = formationBonus(world.data, rt.formation, other.formation);
  }
  world.stats.terrainBonusA = world.sides.A.terrainBonus;
  world.stats.terrainBonusB = world.sides.B.terrainBonus;

  // R22 击杀分兵种：直接数"场上已阵亡的兵"，于是法术击杀（VM 里同样是 `alive = false`）
  // 也自然算进来，且恒有 `killsInf + killsCav === B.start - B.aliveCount`。
  let infA = 0;
  let cavA = 0; // A 的损失（B 的击杀）
  let infB = 0;
  let cavB = 0; // B 的损失（A 的击杀）
  for (const u of world.units) {
    if (u.alive || u.isGeneral) continue;
    const cav = u.kind === 'cavalry';
    if (u.side === 'B') {
      if (cav) cavB++;
      else infB++;
    } else if (cav) cavA++;
    else infA++;
  }
  world.stats.killsInf = infB;
  world.stats.killsCav = cavB;
  world.stats.killsInfB = infA;
  world.stats.killsCavB = cavA;
}

/** AI 撤退阈值：本侧存活兵力 ≤ 开局的这个比例（`[推测]`，`0x48727C` 只给了 ACT 2 = 逃跑） */
export const AI_RETREAT_TROOP_RATIO = 0.3;
/** AI 撤退阈值：敌方兵力至少是本侧的这么多倍（`[推测]`） */
export const AI_RETREAT_ADVANTAGE = 2;

/**
 * 全军撤退（R38）。对应原作 `0x4447B7(0x4A8A60)`：
 * 置 `[0x4A8AE0] |= 4`、文本 `0x490474「全軍撤退」`、全军转 `cmd 8` + `0x4000` 退却状态，
 * **不直接改士兵数与士气**（docs/04b3:419-446 / :154 [确认]）。
 *
 * 本作实现为：给该侧每个存活单位打 `flee` 标记，它们不再寻敌、直接往本方边界外走；
 * 走出场地的单位从 `world.units` 移除（**不算阵亡**，所以不进 `killsInf/killsCav`）。
 * 全部离场后由 `checkOver()` 判负，`endReason = 'retreat'`。
 * 状态码按 `docs/04b:530`：撤退中 = 2，被截住全灭 = 3（被俘）。
 */
export function requestRetreat(world: World, side: Side): boolean {
  if (world.over || world.fled[side]) return false;
  // R37 十面埋伏：`foeArmy+0x84 |= 4`「敵方無法退兵」→ 撤退令直接不成立（原文如此）
  if ((world.army?.[side]?.flags ?? 0) & ARMY_FLAG.noRetreat) return false;
  world.fled[side] = true;
  world.status = { ...world.status, [side]: 2 } as Record<Side, 0 | 2 | 3>;
  // R137：撤退令覆盖突击命令 —— 原作 `0x4447B7` 是「全军转 cmd 8」，即把命令字整支改写，
  // 突击态自然被顶掉；这里同步清掉布尔态，免得 HUD 一边「突击中」一边往后退。
  world.rush = { ...(world.rush ?? { A: false, B: false }), [side]: false } as Record<Side, boolean>;
  // R158：撤退单位同时置 `0x4000` 退却态（原作 `0x43CC95` 的 `or [u+0x2c],0x4000`），
  // 这样 `0x43B574` 的行动间隔才走 46 帧那一支 —— 旧代码只有 flee 标记、间隔仍是 40。
  for (const u of world.units) {
    if (u.side !== side || !u.alive) continue;
    u.flee = true;
    markRetreating(u);
  }
  return true;
}

/**
 * 全軍突擊（R137）。对应原作 `SYSTEM.SO` #22 `AllRush`（id=0x3B argc=0 @0x2B0C）里的
 * `SYSCALL 0x120 (0x2, 0x10000)`：把「突击」命令位写到该单位身上，而 0x120 的语义是
 * **整支部队**（`docs/04b3:419-446` 的命令字表，`0x10000` = 突击）。本作把它落成
 * 一个阵营级的布尔态，之后 `step()` 让该侧全体（含主将）朝**缓存的敌方 unit**（原作
 * `army+0x38F4`，语义见 `project/155_部队指令语义.md:246-263`）一格一格走过去。
 *
 * **幂等**：已经在突击态 → 返回 false（原作连按两次 `AllRush` 也只是重写同一个命令字，
 * 不会叠加成 2 倍速度，也没有"突击次数"这种状态）。
 *
 * 不做的两件事（**没有原作依据，主动不做**，见 `project/137_全军突击.md`）：
 *  1) 不抑制 `maybeRetreat` —— 突击后 AI 该撤还是会撤（原作字节码里没有任何"禁撤退"分支）；
 *  2) 不加伤害/攻击力加成 —— `AllRush` 全流程只有 0x120 一条 gameplay 指令。
 */
export function allRush(world: World, side: Side): boolean {
  if (world.over || world.rush?.[side] === true) return false;
  world.rush = { ...(world.rush ?? { A: false, B: false }), [side]: true } as Record<Side, boolean>;
  return true;
}

/** 该侧是否处于突击态（HUD/测试用；`world.rush` 缺失时当作 false） */
export function isRushing(world: World, side: Side): boolean {
  return world.rush?.[side] === true;
}

/** AI 兵力劣势时自动撤（R38）。阈值全是 `[推测]`，且缺省关闭（`opts.aiRetreat`） */
function maybeRetreat(world: World): void {
  if (!world.aiRetreat || world.over) return;
  for (const side of ['A', 'B'] as const) {
    if (!world.aiSides[side] || world.fled[side]) continue;
    const rt = world.sides[side];
    if (!rt.general.alive) continue;
    // R37 策略放寬兵力閘：詐敗（`|8` 武將可以後退）→ 0.5；金蟬脫殼（`|0x40` 隨時撤退）→ 不設兵力閘
    const flags = world.army?.[side]?.flags ?? 0;
    const ratio = flags & ARMY_FLAG.mayRetreat
      ? 0.5
      : flags & ARMY_FLAG.fleeAnytime
        ? 1
        : AI_RETREAT_TROOP_RATIO;
    if (rt.aliveCount > rt.start * ratio) continue;
    const opp = world.sides[opposite(side)];
    if (opp.aliveCount < rt.aliveCount * AI_RETREAT_ADVANTAGE) continue;
    requestRetreat(world, side);
  }
}

/** 收尾：写 over/winner/endReason + 两侧战果状态码（`docs/04b:530`） */
function finish(world: World, winner: Side | 'draw', reason: 'general' | 'retreat' | 'time'): void {
  world.over = true;
  world.endReason = reason;
  world.winner = winner;
  // R137：突击态随战斗结束清空（`step()` 在 `over` 之后直接 return，留着只会误导 HUD/结算）
  world.rush = { A: false, B: false };
  if (winner === 'draw') {
    world.status = { A: 0, B: 0 };
    return;
  }
  const loser: Side = winner === 'A' ? 'B' : 'A';
  const left = world.units.some((u) => u.side === loser);
  // 2 = 撤退（撤出去且没被截住）／3 = 被俘（`docs/04b:530`、`0x4911D4` 的"徹退中全體被俘"）
  const loserStatus: 2 | 3 = world.fled[loser] && !left ? 2 : 3;
  world.status = (winner === 'A' ? { A: 0, B: loserStatus } : { A: loserStatus, B: 0 }) as Record<Side, 0 | 2 | 3>;
}

/**
 * 结束判定（原作口径：`[0x4B4C34]` 结果位 + `0x44411B` 理由选择器）。
 *
 * 只有三条路能结束战斗，**士兵数不在其中**：
 *  1. **主将阵亡**：`0x43DB9A` 直接置结果位 4/8，`0x441E61` 见 `[0x4A665C]&1` 就跳过战场更新
 *     ⇒ 当场结束，不等本回合打完（`docs/04b3_单挑流程.md:26,408-424,462-464`）；
 *  2. **一方全军离场**（撤退/被俘）：`0x43B50D&0x8000` 后 `unit+0x90` 递减到 0 → 置位 1/2
 *     ⇒ `0x44411B` 取 reason 1/2（`0x43EAA0`-`0x43EB47`）；
 *  3. **硬时限到点**（`0x444126` → `0x443CA8(0x1000)`）：没有 4/8/1/2 位时
 *     `0x44411B` 落到 `else reason=0x10` ⇒ **平手**；原作没有「剩余兵力多者胜」。
 *
 * 兵尽只是让该侧命令位失效（`army+0x5c<=0` 清 bit1|2|8 → 不能前進/突擊/撤退），
 * 主将还活着就继续打（`project/177_战斗行动模型.md:48`；全 EXE 无「士兵为 0 即结束」的写法）。
 */
function checkOver(world: World): void {
  const aGen = world.sides.A.general.alive;
  const bGen = world.sides.B.general.alive;
  if (!aGen || !bGen) {
    finish(world, aGen ? 'A' : bGen ? 'B' : 'draw', 'general');
    return;
  }
  // R38：撤退令下达后要等全军走出场地（`0x43BFE7` 退场）才算结束。
  const aLeft = world.units.some((u) => u.side === 'A');
  const bLeft = world.units.some((u) => u.side === 'B');
  if (world.fled.A && !aLeft) {
    // 两边同时撤光：`0x44411B` 的 `1&&2` 分支 → reason 0x10（平手），不是先到者判负
    finish(world, world.fled.B && !bLeft ? 'draw' : 'B', 'retreat');
    return;
  }
  if (world.fled.B && !bLeft) {
    finish(world, 'A', 'retreat');
    return;
  }
  // 到点：能走到这里说明双方主将都活着 ⇒ 平手，不看兵力
  if (world.tick >= BATTLE_TICK_LIMIT) finish(world, 'draw', 'time');
}

export function magicBySeq(data: GameData, seq: number): Magic | undefined {
  return data.magics.find((m) => m.SEQUENCE === seq);
}

/**
 * 武将技分类（R149 起改为委托 `skill_kind.ts` 的 `skillKindOfEx`）。
 *
 * 原作**不按 `MAGIC.INI` 的 ATTRIB 判伤害/治疗**：`0x43BAE3` 施展入口只扣 MP/气力、
 * 取 Script 指针后进解释器，真正做什么全由字节码决定（`work\dis_battle_units.txt:2092-2174`）。
 * 所以「補兵」那 7 条（seq 5/17/19/31/37/57/81）的 `MagicN` 函数体只有
 * `PUSHI n; CALL MoreSoldier/BackSoldier; RET`，是**补自己部队**而不是打人；
 * 旧实现把它们归到 `ATTACK>=40 ? aoe : strike` 导致当伤害技结算（保真网 7 条 WARN）。
 * 证据与 110 条分布见 `project/149_補兵类技能语义.md`。
 */
export function skillKindOf(data: GameData, seq: number): 'heal' | 'strike' | 'aoe' | null {
  const m = magicBySeq(data, seq);
  if (!m) {
    // 数据里查不到时保留旧硬编码，避免影响 `?sim` 的兜底路径
    if (seq === 1) return 'heal';
    if (seq === 50) return 'strike';
    if (seq === 104) return 'aoe';
    return null;
  }
  const k = skillKindOfEx(m, { seq });
  if (k === 'heal' || k === 'heal-troop') return 'heal';
  if (k === 'strike' || k === 'aoe') return k;
  return null;
}

export function qiCostOf(data: GameData, seq: number): number {
  const m = magicBySeq(data, seq);
  if (!m) return Infinity;
  return qiPowerPercentOf(m) * (QI_MAX / 100);
}

/**
 * 一条武将技消耗「整条氣力」的百分之几。
 *
 * 原作公式（`0x43BAE3`，`work/dis_battle_units.txt:2097-2115`）是
 * `cost = POWER × 0x1D4C0 / 100`，即 `POWER` 是**百分比**（0..100），满值 100 ⇒ 一整条 120000。
 *
 * 但本仓库 `data/magics.json` 里 110 条技的 `POWER` **全是 100**（提取时的常量伪影，见
 * `project/53_数据与配额.md` 与 37a R47），照公式算就是「每一招都要整条氣力」：开局氣力是半条
 * （`QI_START=60000`），于是**整场战斗前十几次回气之前一招都放不出来** —— 全流程演练
 * （`project/89_全流程演练.md` 步骤 4a）实测就是这个结果：技能格恒提示「氣力不足」。
 *
 * 处理：数据里 `POWER` 恒 100 时，改用该技的 **`MP`（原作技力消耗）当百分比**并夹到 20..80，
 * 让「补血便宜、大招贵」的形状还在，同时开局半条氣力就能放小技。
 * 数据若将来修出真实 `POWER`（不再恒 100），自动回到原作公式。`[推测]`（proxy 规则本人为设定）
 */
export function qiPowerPercentOf(m: { POWER?: number; MP?: number }): number {
  const power = Number(m.POWER);
  if (Number.isFinite(power) && power > 0 && power !== 100) return Math.min(100, power);
  const mp = Number(m.MP);
  if (!Number.isFinite(mp) || mp <= 0) return 40;
  return Math.max(20, Math.min(80, Math.round(mp)));
}

/**
 * 军师技"保留氣力"的气力消耗系数（依据：docs/04b §4.3 位掩码 + project/26 §3 ②）。
 *
 * `wises.ts` 的 SPECS 里 `qi_cost` 存的是**负数**（−20 / −30 / −45 = 消耗 −20%…），
 * 所以系数是 `1 + bonus/100`（不是任务书里的 `1 − bonus`——那是按"bonus 为正"写的口径，
 * 与本仓库实际数据反号）。下限 0.1：削减最多 90%，杜绝负消耗。
 */
export function qiCostMul(world: World, side: Side): number {
  // R37 保留氣力（`+0x84 |= 0x80`、`+0x88 = 66/50/25`）：系数再乘 `qiParam/100`
  const army = world.army?.[side];
  const save = army && army.flags & ARMY_FLAG.qiSave ? clampUnit(army.qiParam / 100, 0.1, 1) : 1;
  return Math.max(0.1, 1 + wiseBonus(world, side, 'qi_cost') / 100) * save;
}

function clampUnit(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : hi;
}

/**
 * 特效默认时长（tick）＝ **1 秒**。
 *
 * 旧值 `30` 是"30 tick @30 Hz = 1 秒"写死的结果（R192 之前 `TICK_HZ=30` 的产物），
 * 不是原作帧数 —— MAGIC 表没有时长字段。tick 率翻倍后必须按 `TICK_HZ` 推导，
 * 否则全表特效会整片缩短一半（`project/192_引擎节拍60Hz.md` §乙类）。
 */
export const FX_TTL_DEFAULT = TICK_HZ;
/** 特效动画的播放帧率（帧/秒）：13.6 fps，比原作略慢，竖屏看得清 */
export const FX_FRAMES_PER_SEC = 13.6;
/**
 * 每动画帧占多少 tick ＝ `TICK_HZ / FX_FRAMES_PER_SEC`（60 Hz ⇒ 4.4118）。
 *
 * 旧值 `2.2` 是 30 Hz 下的换算结果（2.2 × 13.6 ≈ 30）。现在按「每秒帧数」表达，
 * tick 率再变也不会跟着漂。
 */
export const FX_TICK_PER_FRAME = TICK_HZ / FX_FRAMES_PER_SEC;
/** 特效时长下限/上限：0.8 秒 / 4.4 秒（60 Hz ⇒ 48 / 264 tick；旧值 24/132 @30Hz） */
export const FX_TTL_MIN = Math.round(0.8 * TICK_HZ);
export const FX_TTL_MAX = Math.round(4.4 * TICK_HZ);

/**
 * 逐技特效时长。
 *
 * MAGIC 表里没有任何时长字段（`types.ts` 的 Magic 只有 MP/POWER/ATTACK/fx_dir/fx_frames），
 * 所以时长只能从"这一招一共有多少动画帧"反推：
 *
 *   ttl = clamp(round(fx_frames * FX_TICK_PER_FRAME), FX_TTL_MIN, FX_TTL_MAX)
 *       = clamp(round(fx_frames * 60/13.6), 48, 264)   // 60 Hz
 *
 * fx_frames 是这一招所有目录的帧数之和（`game/data/magics.json`，导出侧 `export_magic_fx.py`
 * 也是这么写的），于是"一帧 = 1/13.6 秒"对单目录技和多目录技同时成立（按墙钟算，
 * 与 tick 率无关）：
 *  - 004 衝車 4 帧 → 一帧停 1/13.6 s，不是 7.5 tick；
 *  - 038 劍A1 112 帧 → 撞上限 264 tick 全放完，不再抽帧。
 */
export function fxTtlOf(data: GameData, seq: number): number {
  const m = magicBySeq(data, seq);
  const frames = m?.fx_frames ?? 0;
  if (!(frames > 0)) return FX_TTL_DEFAULT;
  return Math.min(FX_TTL_MAX, Math.max(FX_TTL_MIN, Math.round(frames * FX_TICK_PER_FRAME)));
}

/** 会话的落点与起始 tick（`SkillSession` 自己不存瞄准点，飘字要用）。 */
interface SessionInfo {
  x: number;
  y: number;
  tick: number;
  life: number;
  /** 这一发已经产生过真实效果（决定收尾时飘不飘 MISS） */
  effected: boolean;
}
const SESSION_INFO = new WeakMap<SkillSession, SessionInfo>();
/**
 * 技能飘字寿命（tick）＝ **1.5 秒**，与视图 `pushFloater` 的缺省 ttl 一致。
 *
 * 旧值 `45` 是 30 Hz 下"1.5 秒"的换算；现在按 `TICK_HZ` 推导（60 Hz ⇒ 90）。
 */
export const SKILL_MARK_TTL = Math.round(1.5 * TICK_HZ);
/** `world.skillMarks` 的保留条数（视图每帧重画，留最近 24 条足够覆盖多段技）。 */
const SKILL_MARK_KEEP = 24;
/**
 * 死等保护的最小窗口（tick）＝ **8 秒**：脚本已经播完特效、又没有 `done` 时，
 * 超出「特效时长 + 飘字寿命」就按"这一发空了"截断。8 秒是下限，确保 152 帧量级的技
 * （劍輪舞）也把动画走完，不会在伤害帧之前被砍掉（regression 防线）。
 *
 * 旧值 `240` 是 30 Hz 下"8 秒"的换算；现在按 `TICK_HZ` 推导（60 Hz ⇒ 480）。
 */
const EFFECT_WINDOW_MIN = 8 * TICK_HZ;

/** 法术结算前后要对比的快照：敌兵尸体数、己兵尸体数、双方主将体力。 */
interface EffectSnap {
  foeDead: number;
  ownDead: number;
  selfHp: number;
  foeHp: number;
  selfAlive: number;
}

function effectSnapOf(world: World, side: Side): EffectSnap {
  const foe: Side = side === 'A' ? 'B' : 'A';
  let foeDead = 0;
  let ownDead = 0;
  let selfAlive = 0;
  for (const u of world.units) {
    if (u.isGeneral) continue;
    if (u.side === foe) {
      if (!u.alive) foeDead++;
    } else if (u.alive) selfAlive++;
    else ownDead++;
  }
  return { foeDead, ownDead, selfHp: world.sides[side].general.hp, foeHp: world.sides[foe].general.hp, selfAlive };
}

function pushSkillMark(world: World, mark: SkillMark): void {
  world.skillMarks.push(mark);
  if (world.skillMarks.length > SKILL_MARK_KEEP) world.skillMarks.shift();
}

/**
 * 把「一次推进」（`cast()` 的第 0 帧 / `advanceSessions()` 的后续帧）的真实效果记账。
 *
 * 为什么前后对账，而不是读 `SkillFrameStat`：
 *  - `runtime.applyHits()` 改主将体力时只写 `g.hp`，**不产出任何统计**（`runtime.ts:1076`）；
 *  - `SkillFrameStat.killed` 只含兵死，而且只有"整会话结束"才会被 `pump()` 汇总进
 *    `session.killed`；多帧技（半月斬 348 帧仍未 done）的击杀过去**永远不进 `world.stats`**。
 * 逐帧数场上尸体/血条差值，两个坑一起绕开，而且天然满足"看到即发生"。
 */
function recordEffect(
  world: World,
  side: Side,
  before: EffectSnap,
  x: number,
  y: number,
): { kills: number; damage: number; healed: number; summoned: number } {
  const after = effectSnapOf(world, side);
  const kills = Math.max(0, after.foeDead - before.foeDead);
  const damage = Math.max(0, before.foeHp - after.foeHp);
  const healed = Math.max(0, after.selfHp - before.selfHp);
  // R88（project/152 §3）：補兵是**新增单位**（`0x119` → `runtime.spawnSoldier` 往
  // `world.units` 里 push 一个活兵），不是把己方尸体复活，所以要看"己方活兵增量"。
  // 原来用 `before.ownDead - after.ownDead`（己方阵亡数减少量），补兵时 ownDead 不变
  // ⇒ 始终算成 0，`+N` 提示永远不出现；反过来若有什么把尸体拉活，那个口径又会把它
  // 误记成"补兵"。
  const summoned = Math.max(0, after.selfAlive - before.selfAlive);
  if (kills + damage + healed + summoned > 0) {
    const st = world.stats;
    if (side === 'A') {
      st.spellKillsA += kills;
      st.spellDamageA += damage;
      st.spellHealedA += healed;
    } else {
      st.spellKillsB += kills;
      st.spellDamageB += damage;
      st.spellHealedB += healed;
    }
    pushSkillMark(world, { tick: world.tick, side, x, y, kills, damage, healed, summoned });
  }
  return { kills, damage, healed, summoned };
}

/** 会话收尾：整发没生效才补一条 MISS 标记，并把脚本中断留痕。 */
function finishSession(world: World, s: SkillSession): void {
  const info = SESSION_INFO.get(s);
  // 補血技即使回 0（满血放命療術）也不能标 MISS —— 那是"没有可回的量"，不是"打空了"。
  if (info && !info.effected && !s.isHealSkill) {
    pushSkillMark(world, {
      tick: world.tick,
      side: s.side,
      x: info.x,
      y: info.y,
      kills: 0,
      damage: 0,
      healed: 0,
      summoned: 0,
      miss: true,
    });
  }
  SESSION_INFO.delete(s);
  if (!s.ok && typeof console !== 'undefined') {
    console.warn(`[cast] 脚本 ${s.scriptNum} 中断：${s.reason}`);
  }
}

/**
 * 释放一条武将技（`0x43xxxx` 的技能派发；脚本执行见 `startSkill()`）。
 *
 * **落点 `tx/ty` 可以不传**（R139）：不传就按 `defaultAim()` 自动选点 —— 原作点技能格直接放，
 * 玩家不用先在战场上点目标（110 条脚本全部自己写 `SYSCALL 0x100` 覆盖锚点，见 `defaultAim()`
 * 的注释）。传了仍走老路（`activeAim()` 的"纯己方技落点纠正" + 用传进来的点选 g3），
 * 保留给调试与测试（web 的 `?dev=1&aim=gx,gy` 走的就是这条）。
 */
export function cast(
  world: World,
  side: Side,
  seq: number,
  tx?: number,
  ty?: number,
  ttl: number = FX_TTL_DEFAULT,
): CastResult {
  if (world.over) return { ok: false, reason: 'over' };
  const rt = world.sides[side];
  const g = rt.general;
  const m = magicBySeq(world.data, seq);
  if (!m) return { ok: false, reason: 'no-magic' };
  if (!g.alive) return { ok: false, reason: 'general-dead' };
  // R37 封武將技：`foeArmy+0x84 |= 0x100`「敵將無法使用武將技」
  if ((world.army?.[side]?.flags ?? 0) & ARMY_FLAG.sealMagic) return { ok: false, reason: 'sealed' };
  const qi = Math.round(qiCostOf(world.data, seq) * qiCostMul(world, side));
  if (g.mp < m.MP) return { ok: false, reason: 'mp' };
  if (g.qi < qi) return { ok: false, reason: 'qi' };

  // R50：ACTIVE 生效类型（`MagicDef+0x10`）。掩码里**一位活目标都没有**就没得打：
  // 原作取目标走 `0x4868A8` 子表，子表返回空时技能根本不派发（连技力都不扣）。
  // 掩码 0（没有 ACTIVE 字段/未知写法）不做限制 = 改动前的行为。
  const activeMask = activeMaskOf(m);
  if (activeMask > 0 && activeTargetCount(world, side, activeMask) === 0) return { ok: false, reason: 'no-target' };
  // 纯己方技（掩码里没有敌方位，例如 命療術 = 我方主將 0x2）的选点：
  // 点落在敌方半场时改成己方主将的位置 —— 这类技本来就不由玩家点地。[推测：子表未知]
  // R139：不传落点（tx/ty 缺一个也算）⇒ 自动选点，原作「点技能格直接放」。
  const aim =
    tx === undefined || ty === undefined
      ? defaultAim(world, side, seq)
      : activeAim(world, side, activeMask, tx, ty);

  const life = Math.max(1, Math.round(ttl));
  g.mp -= m.MP;
  g.qi -= qi;
  // R84：法术效果只能"前后对账"才看得见（runtime 改主将血不产出事件），先拍快照
  const before = effectSnapOf(world, side);
  // 真·脚本执行：跑 MAGIC.SO 的原始字节码（vm-port 移植的 SmartScript 虚拟机）。
  // 逐帧驱动：`startSkill()` 只**启动**脚本并跑完第 0 帧（治疗、瞬发这类立即生效），
  // 剩下的 WAIT 交给 session，由 `tickSkills()` 每 tick 推进一帧。
  // 这样"动画第 N 帧才扣血"的技能节奏才和原作一致，也才有"打到一半被中断"的可能。
  const session = startSkill(world, side, m.SCRIPT, aim.x, aim.y, { ttl: life });
  // 補血類是瞬發（原作扣完技力血就回），当场走完；攻击/召唤類逐帧推进。
  if (session.isHealSkill && !session.done) session.drain();
  const info: SessionInfo = { x: aim.x, y: aim.y, tick: world.tick, life, effected: false };
  SESSION_INFO.set(session, info);
  const delta = recordEffect(world, side, before, aim.x, aim.y);
  if (delta.kills + delta.damage + delta.healed + delta.summoned > 0) info.effected = true;
  if (!session.done) world.sessions.push(session);
  else finishSession(world, session);
  if (!session.ok) {
    // 脚本启动就失败（超预算/未知 opcode）时不能静默：留一条日志，并保留原地的特效表现
    world.fx.push({ seq, kind: skillKindOf(world.data, seq) ?? 'strike', x: aim.x, y: aim.y, r: 1.8, ttl: life, life, side });
    if (typeof console !== 'undefined') console.warn(`[cast] 脚本 ${m.SCRIPT} 失败：${session.reason}`);
  }
  recompute(world);
  checkOver(world);
  return {
    ok: true,
    killed: delta.kills,
    healed: delta.healed,
    damage: delta.damage,
    hits: session.hits,
    hit: info.effected,
    mp: g.mp,
    qi: g.qi,
  };
}

/**
 * 推进所有在播的法术会话（`step()` → `tickSkills()` 每 tick 调一次）。
 *
 * R84 两处关键改动：
 *  1. **逐帧记账**：每推一帧就把这一帧的真实效果（兵死/将伤/治療/補兵）累加进 `world.stats`
 *     并推一条 `SkillMark`。旧实现只在 `done` 时汇总整发，而半月斬这类脚本在同步模型下
 *     348 帧仍不 `done`（`docs/04b3` 的 WAIT 靠条件不满足就一直挂），战果永远记不上。
 *  2. **死等保护**：超过「特效时长 + 飘字寿命」还不 `done` 的会话按截断收尾（`done = true`），
 *     否则它永远留在 `world.sessions` 里白占帧。
 */
export function advanceSessions(world: World): void {
  if (world.sessions.length === 0) return;
  for (const s of world.sessions) {
    if (s.done) continue;
    const info = SESSION_INFO.get(s);
    const x = info?.x ?? 0;
    const y = info?.y ?? 0;
    const before = effectSnapOf(world, s.side);
    s.advance();
    const delta = recordEffect(world, s.side, before, x, y);
    if (info && delta.kills + delta.damage + delta.healed + delta.summoned > 0) info.effected = true;
    if (s.done) {
      finishSession(world, s);
      continue;
    }
    if (info && world.tick - info.tick >= Math.max(info.life + SKILL_MARK_TTL, EFFECT_WINDOW_MIN)) {
      s.done = true;
      finishSession(world, s);
    }
  }
  world.sessions = world.sessions.filter((s) => !s.done);
}

export function tickSkills(world: World): void {
  // 逐帧驱动：先推进在播的法术（脚本里的 WAIT 就挂在这里），再回气力/AI 放技。
  advanceSessions(world);
  for (const side of ['A', 'B'] as const) {
    const g = world.sides[side].general;
    if (!g.alive) continue;
    // 气力回复乘军师技"集氣速度"（依据：docs/04b §4.3 位掩码 0x0004 / project/26 §3 ①）
    // R47：每 tick 回复 `max(武力, 智力)`（`0x43E72E`），军师技按百分比缩放
    // R37：再乘策略的集氣檔位（`army+0x90`，快速集氣 +1/+2/+3 = 130/150/200%，
    // 減緩集氣 −1/−2/−3 = 76/66/50%，系数见 `QI_TIER_MUL`）
    const tierMul = QI_TIER_MUL[world.army?.[side]?.qiTier ?? 0] ?? 1;
    g.qi = Math.min(QI_MAX, g.qi + Math.round(qiRegenOf(g) * tierMul * (1 + wiseBonus(world, side, 'qi_regen') / 100)));
    strategyRegen(world, side);
    if (!world.aiSides[side]) continue;
    g.aiTimer--;
    if (g.aiTimer > 0) continue;
    g.aiTimer = AI_SKILL_INTERVAL_TICKS;
    const target = bestSkillTarget(world, side);
    // 逐技时长：AI 放的技也按帧数给足时间，不然 152 帧的劍輪舞只能抽 30 帧播
    if (target) cast(world, side, target.seq, target.x, target.y, fxTtlOf(world.data, target.seq));
  }
  for (const f of world.fx) f.ttl--;
  world.fx = world.fx.filter((f) => f.ttl > 0);
}

/**
 * 原作 `0x43E847(army)`：`work/dis_battle_units.txt` 地址 0x43E84A–0x43E963，
 * 唯一调用点 `0x43E9E5`（在 `0x43E964` 内），而 `0x43E964` 由 Process 4 的
 * OM_TICK(msg=2) 分支**每帧**调用。
 *
 *   - `army+0x84` bit0=體力恢復 / bit1=技力恢復（**只有军师技**「體力/技力自動恢復」会置位，
 *     全 dumps 26 处写入点里除 `0x44D450` 军师技分派器外只有 ctor/读档/初始化）；
 *   - 每帧 `army+0x8c += army+0x88`（參數 40/60/80 或 30/50/70）；
 *   - `army+0x8c > 0x1770`(6000) ⇒ `-= 6000`、对应当前值 +1、夹到上限；
 *   - bit0 成立时直接返回，技力分支整段不走（體力優先，`0x43E857` 末尾 `jmp 0x43E960`）。
 *
 * 效果（60Hz）：技力 L1/L2/L3 = 0.30/0.50/0.70 点/秒，體力 = 0.40/0.60/0.80 点/秒。
 * 没带军师技时整场恒 0 —— 这就是原作口径，玩家觉得「不回」属正常。
 */
function strategyRegen(world: World, side: Side): void {
  const army = world.army?.[side];
  if (!army) return;
  const g = world.sides[side].general;
  if (!g.alive) return;
  if ((army.flags & ARMY_FLAG.hpRegen) !== 0) {
    if (army.hpRegen <= 0) return;
    army.hpRegenAcc = (army.hpRegenAcc ?? 0) + army.hpRegen;
    if (army.hpRegenAcc > REGEN_ACC_MAX) {
      army.hpRegenAcc -= REGEN_ACC_MAX;
      g.hp = Math.min(g.maxHp, g.hp + 1);
    }
    return;
  }
  if ((army.flags & ARMY_FLAG.mpRegen) !== 0) {
    if (army.mpRegen <= 0) return;
    army.mpRegenAcc = (army.mpRegenAcc ?? 0) + army.mpRegen;
    if (army.mpRegenAcc > REGEN_ACC_MAX) {
      army.mpRegenAcc -= REGEN_ACC_MAX;
      g.mp = Math.min(g.mpMax, g.mp + 1);
    }
  }
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

// 我方主将锚点：主将放屏幕 ~70% 高（r=+2）；三条守卫决定阵形过深时牺牲谁。
const CAM_GEN_BACK = 2.0;   // 锚点前置量（行）
const GEN_MAX_R = 5.0;      // 主将最差也得留 r=+5（离下沿还有 0.894 行）
const GEN_MIN_R = -7.0;     // 主将最差不得出上沿超过 r=-7

/**
 * 摄像机：**钉我方主将**（原作 `project/176:362-376` 记录镜头全程跟主将、敌将从未入镜）。
 *
 * 语义：`camX = genAX - 2`，即把主将放在屏幕 ~70% 高处（透视 sy≈692），
 * 一屏 13.327 行（远 7.43 / 近 5.89）足够同时装下我方整阵（100 兵 11 排）。
 * 三条守卫（阵形过深时按优先级牺牲）：
 *   守 1  `cam ≤ aMin + ROWS_FAR`  前锋别顶出上沿 —— 阵深 > 9.43 行时开始触发；
 *   守 2  `cam ≥ genAX - GEN_MAX_R` 主将别掉出下沿 —— 阵深 > 12.43 行（一屏装不下）时宁可丢前排；
 *   守 3  `cam ≤ genAX - GEN_MIN_R` 主将别出上沿 —— 与前压时的下限兜底。
 * 主将阵亡（或单位表里找不到）时退回旧的「跟我方前锋」行为，保证镜头不跳空。
 * 夹取仍走 `field.clampCameraX()`（`[CAM_MIN, CAM_MAX] ≈ [6.29, 64.49]`）。
 *
 * 为什么不再取两军前锋中点：中点会把 camX 拉向敌阵（满员接战 50.5），
 * 而我方主将仍在 r=+7.5 出画 ⇒ 既没让主将入画、又把敌人拉近；且 bMax 穿过 38.4 时
 * 会产生 48.40→45.00 的 3.4 行突跳。钉主将后这两个问题同时消失。
 */
export function camera(world: World): number {
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  let aN = 0, bN = 0;
  let genAX = NaN;   // 我方主将 gx：world.sides.A.general 只有 hp/str/int、没有坐标，只能从 units 找
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.side === 'A') {
      aN++; aMin = Math.min(aMin, u.x); aMax = Math.max(aMax, u.x);
      if (u.isGeneral) genAX = u.x;
    } else { bN++; bMin = Math.min(bMin, u.x); bMax = Math.max(bMax, u.x); }
  }
  let cam: number;
  if (aN && bN) {
    if (Number.isFinite(genAX)) {
      cam = genAX - CAM_GEN_BACK;               // 默认：钉我方主将
      cam = Math.min(cam, aMin + ROWS_FAR);     // 守 1：我方前锋别顶出上沿
      cam = Math.max(cam, genAX - GEN_MAX_R);   // 守 2：主将别掉出下沿
      cam = Math.min(cam, genAX - GEN_MIN_R);   // 守 3：主将别出上沿
    } else {
      cam = aMin - 2.6;                         // 主将已阵亡：退回旧「跟前锋」
    }
  }
  else if (aN) cam = (aMin + aMax) / 2;
  else if (bN) cam = (bMin + bMax) / 2;
  else cam = GRID_W / 2;
  return clampCameraX(cam);
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

/**
 * 大胜门槛：歼敌后我方剩余兵力 ≥ 开局的这个比例。
 * `[推测]` —— 文档只给了 `0x41048D` 大胜档的结算系数（`scW*=2; scL*=2`），
 * 没有给"什么算大胜"的判定式，0.7 是本作取的经验值。
 */
export const GREAT_VICTORY_KEEP = 0.7;

/** 战后士气惩罚（`0x447520`：`g->+0x38 -= 0x14`） */
export const MORALE_BATTLE_LOSS = 20;

/** 战后忠诚惩罚（`0x447520`：`g->+0x3C -= (10 - 节操) * 2`） */
export function loyaltyLossOf(constancy: number): number {
  return (10 - Math.max(0, Math.min(9, Math.round(constancy)))) * 2;
}

/**
 * 戰後疲勞倍率表（原作 `0x4103DE` 的跳表，`0x410471` 起 7 個 dword）。
 *
 * 索引 = `army+0x38`（本作 `ArmyStatus.fatigueIdx`）+ 3：
 * `−3 → 30%`、`−2 → 50%`、`−1 → 75%`、`0 → 100%`、`+1 → 150%`、`+2 → 200%`、`+3 → 250%`。
 * 原作以**無符號**比較 `cmp idx',6 / ja` 判越界，所以 idx < −3 的檔位同樣走「原值返回」分支
 * （= 100%），不是 30% 以外再往下乘。
 */
export const FATIGUE_MUL: readonly number[] = [30, 50, 75, 100, 150, 200, 250];

/**
 * 疲勞增量過倍率表（`0x4103DE(v, idx)`）：`trunc(v × K / 100)`，K 見 `FATIGUE_MUL`。
 *
 * `0x41048D` 的消費順序：`base = 15 + trunc(秒/10)`（`0x410832-0x410846`）→ 對兩支軍隊各查
 * `army+0x38` 的檔位 → `general+0x3A += 結果` → 兩側封頂 100。`idx` 越界（含 < −3）返回原值。
 */
export function fatigueMul(gain: number, idx: number): number {
  const i = Math.trunc(idx) + 3;
  if (!(i >= 0 && i <= FATIGUE_MUL.length - 1)) return Math.trunc(gain);
  return Math.trunc((Math.trunc(gain) * FATIGUE_MUL[i]!) / 100);
}

export const MODE_NAME: Record<1 | 2 | 3 | 4, string> = {
  1: '歼灭',
  2: '击退',
  3: '平手',
  4: '大胜',
};

/**
 * 战功表四档（`0x41048D` 的 mode 索引，docs/04b §6.2）：
 *  1 歼灭 = 败方主将被歼；2 击退 = 败方主将活着、全军撤退离场；
 *  3 平手 = 到点双方主将都活着（`0x44411B` reason 0x10）；4 大胜 = 歼敌且我方损失极小。
 */
function settleMode(world: World): 1 | 2 | 3 | 4 {
  const a = world.sides.A;
  const b = world.sides.B;
  const winner = world.winner ?? 'draw';
  if (winner === 'draw') return 3;
  const loser = winner === 'A' ? b : a;
  const our = winner === 'A' ? a : b;
  // 「殲敵」= 敗方主將陣亡。兵盡不算殲敵：兵盡之後主將還活著，戰鬥本來就沒結束
  // （`checkOver()` 只剩 主將陣亡 / 全軍撤退 / 到點 三條出口）。
  const enemyGeneralDown = !loser.general.alive;
  const keep = our.start > 0 ? our.aliveCount / our.start : 0;
  if (enemyGeneralDown && keep >= GREAT_VICTORY_KEEP) return 4;
  if (enemyGeneralDown) return 1;
  return 2;
}

/** 战报文案：`0x447037` 的 draw/lose/win 三段字符串（docs/04b §6.1），[本作拼装] 处按 mode 补战果短句 */
function settleReport(world: World, mode: 1 | 2 | 3 | 4, post: PostBattleReport): string {
  const winner = world.winner ?? 'draw';
  if (winner === 'draw') return '雙方平手'; // 0x49118C
  const a = world.sides.A;
  if (winner === 'B') {
    if (post.captures.some((c) => c.name === a.general.name)) return '我軍在徹退中，全體被俘'; // 0x4911D4
    if (!a.general.alive) return '我軍戰敗了'; // 0x4911A0
    if (a.aliveCount <= 0) return '情況不妙全軍撤退'; // 0x4911B8
    return '我軍戰敗了';
  }
  if (mode === 4) return '我軍大獲全勝!!'; // 0x491258
  if (mode === 2) return '敵軍潰退，我軍取勝'; // [本作拼装]
  return '敵軍全軍覆沒，我軍大獲全勝!!'; // [本作拼装]
}

export function settle(world: World): SettleResult {
  if (world.settled) return world.settled;
  const a = world.sides.A;
  const b = world.sides.B;
  const winner = world.winner ?? 'draw';
  const won = winner === 'A';
  const mode = settleMode(world);
  const enemyLevel = b.general.level;
  const kills = b.start - b.aliveCount;
  // 战功分（docs/04b §6.2 / `0x41048D`）：基础 = 我方击杀**步兵 ×6 + 骑兵 ×12**（R22 分列），
  // 再加"敌将等级 × 系数"；歼灭档败方 `scL` 减半，大胜档双方 ×2。
  // killsInf/killsCav 由 recompute() 从场上阵亡单位数出，含法术击杀。
  const killsInf = world.stats.killsInf;
  const killsCav = world.stats.killsCav;
  // R59：「带兵差」按 `0x41048D` 的结构写 —— 左边是**开战快照**（`unit+0x14/+0x18`），
  // 右边是**战后值**（`g+0x44/+0x48`），外面套 `max(0, ·)`。
  // scW 看败方 B 的损失，scL 看我方 A 的损失。
  let scW = warMeritOf(b.startInf, b.startCav, b.aliveInf, b.aliveCav);
  let scL = warMeritOf(a.startInf, a.startCav, a.aliveInf, a.aliveCav);
  if (mode === 1) {
    scW += enemyLevel * 51; // 0x22*0xC0/0x80
    scL = Math.floor(scL / 2);
  } else if (mode === 2) {
    scW += enemyLevel * 34; // 0x22
    scL += Math.round(a.general.level * 8.5); // 0x22*0x20/0x80
  } else {
    scW += enemyLevel * 17; // 0x11
    scL += a.general.level * 17;
    if (mode === 4) {
      scW *= 2;
      scL *= 2;
    }
  }
  const score = Math.max(1, Math.round(winner === 'draw' ? (scW + scL) / 2 : won ? scW : scL));
  // R64 额外经验 `0x410989(armyA, armyB)`（docs/04b:518-524）：
  //   sum = Σ 敌方每个条目的 `general+0x2E`（等级）      ← 敌方全体等级和，不是"敌将等级+1"
  //   per = sum * 32 / [armyA]                          ← 分母是**我方人数**（条目数），不是带兵数
  // 双方副将（`officers`）都算条目：敌方 = 主将 + 副将，我方人数 = 1 + 我方副将数。
  const enemyLevelSum =
    Math.max(0, Math.round(b.general.level)) +
    (b.officers ?? []).reduce((s, o) => s + Math.max(0, Math.round(o.level ?? 1)), 0);
  const ourCount = 1 + (a.officers ?? []).length;
  const extraExp = extraExpOf(enemyLevelSum, ourCount);
  const expBase = score + extraExp;
  // 军师技"經驗增加"：战后经验按百分比放大，再叠加战后处置的固定加成
  // （依据：docs/04b §6.2 ④ `0x4103DE(base, unitW->+0x38)` / project/26 §3 ④）。
  // R37 策略"增加經驗"（`unit+0x34 |= 0x2000`、`unit+0x3c = 30/50/100`）走同一乘数。
  const expMul =
    (1 + wiseBonus(world, 'A', 'exp_bonus') / 100) * (1 + (world.army?.A?.expPct ?? 0) / 100);
  const expGain = Math.round(expBase * expMul);
  // 疲劳增量与战功 delta 同源（`0x41048D` ④：`15+秒/10`，秒数来自 `0x443F2A`），双方都加。
  // 用 trunc 而不是 round，跟 web 层 `tireGain()`（FATIGUE_CORE）保持逐位一致。
  const tireGain = 15 + Math.trunc(world.tick / TICK_HZ / 10);
  const meritGain = Math.min(100, tireGain);
  // 战后处置：招降 / 斩首 / 释放 + 掉落。只看战场已有的敌将/兵力：开了原作乱数流
  // （R115 `world.roll`）时走 roll，否则仍走 `world.rng`；两种模式下同一个 ?seed=
  // settle 的结果（含 post）都完全可复现。
  // 战后处置只看 `winner` 与两侧主将；`endReason` 原样传给 `capture.ts`
  // （'general' 主将阵亡 / 'retreat' 全军撤退离场 / 'time' 到点平手），
  // 不再有 R38 之前「兵尽」那套折档。
  const post = resolvePostBattle(
    {
      winner: world.winner,
      endReason: world.endReason,
      sides: world.sides,
    },
    world.data,
    world.rng,
    [],
    world.roll,
  );

  // R62 战后惩罚 `0x447520`：士气 −20、忠诚 −(10−节操)×2。
  // 注意原作这段只遍历 status==3（被俘）的将；`docs/04b §9.4` 与本任务的口径是"双方存活武将"，
  // 因此这里对双方主将各扣一次（活着才改士气/忠诚），差异记在 project/38_战后与成长修复.md。
  const sideStats = (side: Side) => {
    const s = world.sides[side];
    const g = s.general;
    const row = world.data.generals.find((x) => x.NAME === g.name);
    const moraleBefore = Math.max(0, Math.min(100, Math.round(g.morale ?? s.morale)));
    const moraleAfter = Math.max(0, moraleBefore - MORALE_BATTLE_LOSS);
    const loyalBefore = Math.max(0, Math.min(99, Math.round(g.loyal ?? row?.Loyal ?? 50)));
    const constancy = Math.max(0, Math.min(9, Math.round(g.constancy ?? row?.CONSTANCY ?? 5)));
    const loyalAfter = Math.max(0, Math.min(99, loyalBefore - loyaltyLossOf(constancy)));
    const tireBefore = Math.max(0, Math.min(100, Math.round(g.tire ?? 0)));
    // 疲勞通道（`tire_gain`）：軍師技把倍率檔寫在 `army+0x38`（本作 `fatigueIdx`），
    // 戰後才過 `0x4103DE` 的表。檔位 0 = 100%，所以沒帶軍師技時 `tireAdd === tireGain`。
    const tireIdx = Math.trunc(world.army?.[side]?.fatigueIdx ?? 0);
    const tireAdd = Math.max(0, fatigueMul(tireGain, tireIdx));
    const tireAfter = Math.min(100, tireBefore + tireAdd);
    if (g.alive) {
      s.morale = moraleAfter; // powerOf（R41）读的就是这一份
      g.morale = moraleAfter; // 武将级镜像（HUD / 存档写回）
      g.loyal = loyalAfter;
      g.constancy = constancy;
    }
    // 疲劳记在武将档案上，主将阵亡也照加（原作对两支军队的 gW/gL 都无条件写 `+0x3A`）
    g.tire = tireAfter;
    return {
      morale: { before: moraleBefore, after: g.alive ? moraleAfter : moraleBefore },
      loyalty: { before: loyalBefore, after: g.alive ? loyalAfter : loyalBefore },
      tire: { before: tireBefore, after: tireAfter },
      tireAdd,
      tireIdx,
    };
  };
  const statsA = sideStats('A');
  const statsB = sideStats('B');

  // 勸降轉將（Execute 33）：戰中只置 `army.defectPending`（原作 `foeArmy+0x84 |= 0x400`），
  // 名單要等戰後才動。這裡把戰中標記翻成一條 `recruited: true` 的捕獲條目，交給
  // `roster.applyPostBattle()` —— 那是 core 內唯一會改 `save.roster` 的路徑，戰鬥中不碰名單。
  // 只有敗方會被勸降（平手不處理：[推測] 原作戰後那段只掃 status==3 的將）。
  const loseSide: Side | null = winner === 'A' ? 'B' : winner === 'B' ? 'A' : null;
  let defected: string | null = null;
  if (loseSide && world.army?.[loseSide]?.defectPending) {
    const g = world.sides[loseSide].general;
    if (g.alive) {
      const row = world.data.generals.find((x) => x.NAME === g.name);
      defected = markDefectedCapture(post, {
        name: g.name,
        str: g.str,
        int: g.int,
        loyal: g.loyal ?? row?.Loyal ?? 50,
      });
    }
  }

  const before = a.general.level;
  a.general.exp += expGain + post.expBonus;
  const after = Math.max(before, levelFromExp(a.general.exp));
  const levelUp = after - before;
  // R23 升级 `0x40F23C`（docs/04b:558-575）：先记溢出量
  // `ovHP = (short)rec->+0x10 - 0x40A020(rec)`，等级 +1 后按公式**重算上限**再把溢出加回去。
  // 原作没有任何手调的 `+6` / `+3`，旧实现那两行是本作自造，已删除。
  for (let i = 0; i < levelUp; i++) {
    const ovHp = a.general.hp - a.general.maxHp;
    const ovMp = a.general.mp - a.general.mpMax;
    const lv = before + i + 1;
    a.general.maxHp = hpCapOf(a.general.baseHp ?? 100, a.general.str, lv);
    a.general.mpMax = mpCapOf(a.general.baseMp ?? MP_BASE, a.general.str, a.general.int, lv);
    a.general.hp = Math.max(0, Math.min(a.general.maxHp, a.general.maxHp + ovHp));
    a.general.mp = Math.max(0, Math.min(a.general.mpMax, a.general.mpMax + ovMp));
  }
  a.general.level = after;
  // R25 升级补学（`0x40A183` / `0x40A227`）：新等级越过哪条 `习得等级`，就把那条技报出来
  const learned = levelUp > 0 ? learnedAtLevelUp(world.data, a.general.name, before, after) : [];

  const out: SettleResult = {
    winner,
    won,
    mode,
    modeName: MODE_NAME[mode],
    report: settleReport(world, mode, post),
    enemyLevel,
    durationSec: Math.round(Math.min(world.tick, BATTLE_TICK_LIMIT) / TICK_HZ),
    kills,
    killsInf,
    killsCav,
    score,
    /** 本场用法术打掉的敌兵（结算面板显示"法术击杀 N"） */
    spellKills: world.stats.spellKillsA,
    expGain,
    meritGain,
    levelUp,
    level: after,
    exp: a.general.exp,
    nextLevelAt: expToReach(after + 1),
    // R63 战绩累加（`0x4084C9`）：胜/败/连胜/最高连胜，平手只把连胜清零
    record: updateRecord(world.record, winner === 'draw' ? 'draw' : won),
    /** 两侧战果状态码（`docs/04b:530`：0 在场 / 2 撤退 / 3 被俘） */
    status: world.status,
    morale: { A: statsA.morale, B: statsB.morale },
    loyalty: { A: statsA.loyalty, B: statsB.loyalty },
    tire: { A: statsA.tire, B: statsB.tire },
    tireGain,
    tireAdded: { A: statsA.tireAdd, B: statsB.tireAdd },
    tireIdx: { A: statsA.tireIdx, B: statsB.tireIdx },
    defected,
    learned,
    post,
  };
  world.settled = out;
  return out;
}
