/**
 * 部队指令层（R141）：第一层 6 大按钮 + 第二层「随阵形变的 6 条部队指令」的内核。
 *
 * 原作证据（全部 `[确认]`，反汇编见 `work\battle_audit\` 与 `work\dis_battle_units2.txt`）：
 *  - 第一层描述符表 `0x48F2A8`（stride `0x38`）：
 *      `保護主將`(0x4451C3) / 部队指令子菜单(0x4450AE) / `武 將 技`(0x4453C2) /
 *      `武將出擊`(0x445491) / `主將待機`|`主將後退`(0x445282) / `全軍撤退`(0x44554A)。
 *  - 第二层：串表 `0x48F94C–0x490294` = **33 组 × 6 条**（组步长 `0x48`），
 *      `索引 = 组号 × 6 + 槽号`；指针表 `@0x48EB60`，执行表 `@0x48EE78`。
 *      33 组里第 5/6 条恒为 `全軍待機` / `全軍突擊`，前 4 条随阵形变。
 *  - 每条命令的「执行」都是 `0x43ADED(army, which, value)`：把命令字 `value`
 *    写进 `army+0x94 + idx*4` 的 8 个槽（`which=0x100` 全体 / `0x101` 除主将 /
 *    0..7 单槽）。命令字：`0 待機 / 1 前進 / 2 後退 / 3 上移 / 4 下移 /
 *    5 分散 / 6 集中 / 7 突擊 / 8 撤退`（docs/04b3:419-446）。
 *  - 每条命令的「查可用」（`mode==1`）同构：
 *      `(([0x4a8ae0] & mask) == 0) && [0x4a8abc] > 0`
 *    其中 `[0x4a8abc]` 是**本方兵力数**（`0x43A795`：side 0 → `0x4a8abc`，否则 `0x4b03fc`），
 *    `[0x4a8ae0]` 是战场状态字；`mask` 逐入口不同（`0xd` / `0x5`，全軍撤退另判双方）。
 *
 * 本模块**不碰位移机制**（R158 起）：
 *  - `applyArmyCmd()` 只写世界状态（本文件自己的 `WeakMap<World, ...>`，外加
 *    `world.army[side].flags/takenMul` 这两个 battle.ts 本来就在读的字段）；
 *  - 每个行动 tick 由 `armyStepPlan()` 把当前命令字翻译成「抽一格」的计划
 *    （`(sx,sy)` + 两组权重），抽样/占位互斥/瞬移/40 帧滑动都在 `battle.ts step()` 里。
 *    这与原作分工一致：命令字只是 `army+0x94+idx*4` 的数据，规则在更新器里。
 *
 * R83 反汇编真值（2026-11，证据与脚本在 `work/r83_steps/`，全部 `[确认]`）：
 *  - **一格 = 一次行动 tick**：方向表 `0x48E560` 8 项 = (1,0)(1,-1)(0,-1)(-1,-1)(-1,0)
 *    (-1,1)(0,1)(1,1)，分量恒为 −1/0/+1；`0x43C4C0` 只试 `(x0+dx, y0+dy)`
 *    （`0043C52D add edx,[ebp-0x30]`），没有「半格」「两格」。
 *  - **时长 40 帧/格**：`0x43B574` 复位 `[u+0x34] = 0x28`
 *    （`0043B5DE c7 41 34 28 00 00 00`）；撤退态 `and eax,0x4000` 命中后改 `0x2e`=46
 *    （`0043B5FD c7 40 34 2e 00 00 00`），主将再追加 `2*(F(敌军团)−F(己军团))`
 *    （`0043B64A..0043B653`；F = `[x+0x40]->[0x48]->int16[+0x40]`，字段语义【仍未定】）。
 *  - **滑动 40 帧**：`0x43BF26` 调 `0x43BE42` 时第 4 参写死 `0x28`（`0043BF5F push 0x28`），
 *    `0x43BE42` 里 `idiv` 用它把像素位移除成 16.16 速度（`0043BEF9`）。
 *  - 一格 = 96×72 px、格心 (0x30,0x24)：`0x43A4E0` `imul eax,0x60; add eax,0x30` /
 *    `imul edx,0x48; add edx,0x24`；抖动 ±0x18/±0x12 px，夹取 ±0x780000/±0x5a0000。
 *
 * 与作物的差异（每处都标了 `[推测]`，见 `project/147_部队指令层.md` §4 与 158 §5）：
 *  - 原作 8 个命令槽是「主将 + 7 支部队」，本作每个士兵是独立 `Unit`，
 *    所以按**位置**切前/後/左/右/中五军（`classifySoldiers`），再投影回槽 1..5；
 *  - 原作「上移/下移」的屏幕方向有歧义（`py = gy*0x48+0x24` 越大越往下，菜单却叫上移）；
 *    本作按命令字直译：cmd3 = `y+1`、cmd4 = `y−1`，A/B 不镜像；
 *  - 主將待機/後退是一个**开关**：bit `0x10` 置位时按钮显示「主將待機」，
 *    再按走 `0x444C94`（命令字 0 = 待機）并清 bit。
 */

import {
  allRush,
  GRID_H,
  nearestEnemy,
  planDirected,
  requestRetreat,
  retreatStepPlan,
  rushStepPlan,
  step,
  STEP_W_CONE,
  STEP_W_CONE_WIDE,
  STEP_W_FOCUS_ROW,
  STEP_W_STRAIGHT,
  unitCell,
} from './battle.ts';
import type { AiBattleCommand, Side, StepPlan, Unit, World } from './battle.ts';

// ---------------------------------------------------------------------------
// 一、类型
// ---------------------------------------------------------------------------

/** 33 组子菜单里出现过的指令语义（原作 18 个执行入口 + 第一层按钮） */
export type ArmyCmdKind =
  | 'hold'
  | 'rush'
  | 'advance'
  | 'back'
  | 'spread'
  | 'focus'
  | 'shiftUp'
  | 'shiftDown'
  | 'ambush'
  | 'guardLord'
  | 'lordWait'
  | 'lordBack'
  | 'sortie'
  | 'retreat'
  | 'unknown';

/** 子菜单 6 条里的一条 */
export interface ArmyCmdDef {
  /** 槽号 0..5（第 5/6 条恒为全軍待機/全軍突擊） */
  slot: 0 | 1 | 2 | 3 | 4 | 5;
  /** 中文 label，照抄原作串表（`0x48EB60` 指针表） */
  label: string;
  kind: ArmyCmdKind;
  /**
   * 原作命令字（写进 `army+0x94` 槽的值）：
   * `0 待機 / 1 前進 / 2 後退 / 3 上移 / 4 下移 / 5 分散 / 6 集中 / 7 突擊 / 8 撤退`。
   * 一条指令写多个槽时（左右前進 = 3+4）这里是**最后一个**命令字。
   */
  flags?: number;
  /** 这条指令依次写入的命令字（原作可能连写多次，如 `左右前進` → 槽 1 先 3 再 4） */
  codes: number[];
  /**
   * 目标槽位位掩码（原作 `0x43ADED` 的 `which` 展开）：
   * `1` 主将 / `2` 前軍 / `4` 後軍 / `8` 左軍 / `16` 右軍 / `32` 中軍 / `62` 除主将 / `63` 全体。
   */
  targets: number;
  /** 可用性检查的战场状态掩码（原作 `[0x4a8ae0] & mask`）；见 `battleCmdFlags()` */
  mask: number;
  /** 语义/数值属 `[推测]`（原作未定位到常量）时置 true */
  guess?: boolean;
}

/** 一侧的指令状态（本文件自己的 WeakMap，不动 `World` 接口） */
export interface ArmyOrderState {
  /** 6 条子菜单：当前生效的指令（null = 本槽未下达） */
  slots: (ArmyCmdDef | null)[];
  /** 8 个命令槽（`army+0x94` 的镜像）：0 主将 / 1 前軍 / 2 後軍 / 3 左軍 / 4 右軍 / 5 中軍 / 6-7 备用 */
  cmds: number[];
  /** 最近一条会持续影响位移的指令（`stepWithArmyOrders()` 只读这个） */
  active: ArmyCmdDef | null;
  /** 最近一次下达的指令类型 */
  last: ArmyCmdKind | null;
  /** 下达时刻（`world.tick`） */
  at: number;
  /** 第一层按钮状态（`ARMY_BTN`） */
  buttons: number;
  /** 阵形被破残留（原作 `[0x4a8ac4]`；`左右分散`/`中央集中` 一类会清 0） */
  broken: number;
}

/** 可用性检查结果 */
export interface ArmyCmdCheck {
  ok: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// 二、目标槽位与命令字表
// ---------------------------------------------------------------------------

/** 目标槽位位掩码（bit i = 第 i 槽；与 `ArmyOrderState.cmds` 下标一一对应） */
export const ARMY_TARGET = {
  /** 主将 */
  lord: 1,
  /** 前軍 */
  front: 2,
  /** 後軍 */
  rear: 4,
  /** 左軍 */
  left: 8,
  /** 右軍 */
  right: 16,
  /** 中軍 */
  center: 32,
  /** 除主将（原作 `which=0x101`） */
  soldiers: 0xfe,
  /** 全体（原作 `which=0x100`） */
  all: 0xff,
} as const;

/** 第一层按钮状态位（本作内部；与战场状态字 `0x4a8ae0` 不是同一个字） */
export const ARMY_BTN = {
  /** 保護主將（`army+0x84 |= 0x10`，消费点 `takenMul`） */
  guardLord: 0x1,
  /** 武將出擊（原作 `[0x4a8ae0] |= 2`） */
  sortie: 0x2,
  /** 主將待機/後退（原作 `[0x4a8ae0] |= 0x10`） */
  lordOrder: 0x4,
  /** 全軍撤退（原作 `[0x4a8ae0] |= 4`） */
  retreat: 0x8,
} as const;

/** 战场状态字 `0x4a8ae0` 的位（只保留有证据的；`0x8` 未定位，本作不置位） */
export const BATTLE_CMD_BIT = {
  /** `0x1` 全局锁：演出/结算中。**`[推测]`**（位本身 [确认] 出现在所有 mask 里，置位点未定位） */
  lock: 0x1,
  /** `0x2` 武將出擊（`0x444BA6` 置位） */
  sortie: 0x2,
  /** `0x4` 撤退中（`0x444B4C` → `0x4447B7` 置位） */
  retreat: 0x4,
  /** `0x8` 未解：`0x444C37` 置位，含义未定位，本作**从不置位** */
  unknown8: 0x8,
  /** `0x10` 主將待機/後退（`0x445282` 置位；`0x444C94` 清 `army+0x80` 的同位） */
  lordOrder: 0x10,
} as const;

/** label → 语义 */
const KIND_OF_LABEL: Record<string, ArmyCmdKind> = {
  前軍前進: 'advance',
  全軍前進: 'advance',
  左軍前進: 'advance',
  右軍前進: 'advance',
  中軍前進: 'advance',
  後軍前進: 'advance',
  左右前進: 'advance',
  前軍後退: 'back',
  全軍後退: 'back',
  左右分散: 'spread',
  前軍分散: 'spread',
  中央集中: 'focus',
  前軍集中: 'focus',
  全前集中: 'focus',
  前軍上移: 'shiftUp',
  前軍下移: 'shiftDown',
  伏軍攻擊: 'ambush',
  全軍待機: 'hold',
  全軍突擊: 'rush',
};

/** label → 原作执行入口给出的 (命令字, 目标槽, 可用 mask) */
interface EntrySpec {
  codes: number[];
  targets: number;
  mask: number;
  guess?: boolean;
}

/**
 * 18 个执行入口的归并（`cmd_obj_table.txt` 的去重表）：
 *  49A9 (1,1) 0xd / 49EA (1,2) 0xd / 4A35 (1,5) 0xd / 4A80 (1,6) 0xd /
 *  4ACB (0x101,0) 0xd / 4B0F AllRush+0x101,7 0x5 / 4B4C 撤退 双判 /
 *  4CCF (3,1) 0x5 / 4D10 (4,1) 0x5 / 4D51 (5,1) 0x5 / 4D92 (2,1) 0x5 /
 *  4E36 (1,2)(5,2)(2,2) 0x5 / 4E99 (1,2)(5,2) 0x5 / 4EEB (6,1)(6,3)(6,4) 0xd /
 *  4F58 (1,2) 0xd / 4F99 (1,3) 0xd / 4FDA (1,4) 0xd / 501B (2,1) 0xd / 505C (1,3)(1,4) 0xd。
 */
const ENTRY_OF_LABEL: Record<string, EntrySpec> = {
  // 前軍/全軍前進：同一个入口 0x4449A9，原作只写槽 1 [确认]
  前軍前進: { codes: [1], targets: ARMY_TARGET.front, mask: 0xd },
  全軍前進: { codes: [1], targets: ARMY_TARGET.front, mask: 0xd },
  左軍前進: { codes: [1], targets: ARMY_TARGET.left, mask: 0x5 },
  右軍前進: { codes: [1], targets: ARMY_TARGET.right, mask: 0x5 },
  中軍前進: { codes: [1], targets: ARMY_TARGET.center, mask: 0x5 },
  後軍前進: { codes: [1], targets: ARMY_TARGET.rear, mask: 0x5 },
  左右前進: { codes: [3, 4], targets: ARMY_TARGET.front, mask: 0xd },
  前軍後退: { codes: [2], targets: ARMY_TARGET.front, mask: 0xd },
  // 全軍後退有两个入口；g5 = 0x444E36（前/中/後），g27 = 0x444E99（前/中）→ 见 GROUP_OVERRIDE
  全軍後退: { codes: [2], targets: ARMY_TARGET.front | ARMY_TARGET.center | ARMY_TARGET.rear, mask: 0x5 },
  左右分散: { codes: [5], targets: ARMY_TARGET.front, mask: 0xd },
  前軍分散: { codes: [5], targets: ARMY_TARGET.front, mask: 0xd },
  中央集中: { codes: [6], targets: ARMY_TARGET.front, mask: 0xd },
  前軍集中: { codes: [6], targets: ARMY_TARGET.front, mask: 0xd },
  全前集中: { codes: [6], targets: ARMY_TARGET.front | ARMY_TARGET.left | ARMY_TARGET.right, mask: 0xd },
  前軍上移: { codes: [3], targets: ARMY_TARGET.front, mask: 0xd },
  前軍下移: { codes: [4], targets: ARMY_TARGET.front, mask: 0xd },
  // 伏軍攻擊 = 0x44501B，写 (2,1)：後軍前進 [确认]
  伏軍攻擊: { codes: [1], targets: ARMY_TARGET.rear, mask: 0xd },
  全軍待機: { codes: [0], targets: ARMY_TARGET.soldiers, mask: 0xd },
  全軍突擊: { codes: [7], targets: ARMY_TARGET.soldiers, mask: 0x5 },
};

/**
 * 33 组 × 前 4 条 label（照抄串表 `0x48F94C` 起，组步长 `0x48`）。
 * 第 5/6 条恒为 `全軍待機` / `全軍突擊`，由 `SLOT_HOLD_RUSH` 补。
 *
 * R83 复核（`work/r83_steps/menu_dump.mjs`，Big5 解码）：
 *  - 串表 `0x48F94C..0x490294` = **198 项 × 12 字节**，Big5（**不是 GBK**，GBK 解出乱码）；
 *  - 指针表 `0x48EB60` 198 项，每项恰指向串表 +12 递增，198 个互不相同；
 *  - 执行表 `0x48EE78` 198 dword，索引 `= [0x4a6674](阵形号)*0x18 + slot*4`
 *    （`004450CD` 段 `imul ecx,ecx,0x18` / `call [ecx+eax*4+0x48ee78]`），只有 18 个不同目标；
 *  - 本表 33 行 × 4 项与串表逐项一致，slot4/5 的 33 项各只有 1 种取值。
 */
const GROUP_LABELS: readonly (readonly [string, string, string, string])[] = [
  // 0-3
  ['前軍前進', '前軍後退', '左右分散', '中央集中'],
  ['前軍前進', '前軍後退', '左右分散', '中央集中'],
  ['前軍前進', '前軍後退', '左右分散', '中央集中'],
  ['前軍前進', '前軍後退', '左右分散', '中央集中'],
  // 4
  ['前軍前進', '左軍前進', '右軍前進', '中軍前進'],
  // 5
  ['前軍前進', '中軍前進', '後軍前進', '全軍後退'],
  ['前軍前進', '前軍後退', '左右分散', '中央集中'], // 6
  ['前軍前進', '左軍前進', '右軍前進', '全前集中'], // 7
  ['前軍前進', '前軍後退', '左右分散', '中央集中'], // 8
  ['前軍前進', '前軍後退', '前軍上移', '前軍下移'], // 9
  // 10-19（连号 10 组，同一套「全軍」菜单）
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  // 20-32
  ['前軍前進', '前軍後退', '前軍上移', '前軍下移'], // 20
  ['全軍前進', '全軍後退', '左右分散', '中央集中'], // 21
  ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'], // 22
  // 23：原作数据自相矛盾 —— 串表 slot0=`前軍前進`/slot1=`伏軍攻擊`，但执行表
  // slot0=0x44501B（伏軍攻擊）、slot1=0x4449A9（前軍前進），两者正好互换。
  // 本文件按**串表（按钮文字）**建表，不跟随执行表的错位；见 `work/r83_steps/REPORT.md` §4。
  ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'], // 23
  ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'], // 24
  ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'], // 25
  ['前軍前進', '伏軍攻擊', '左右前進', '中軍前進'], // 26
  ['前軍前進', '伏軍攻擊', '中軍前進', '全軍後退'], // 27
  ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'], // 28
  ['前軍前進', '伏軍攻擊', '左軍前進', '右軍前進'], // 29
  ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'], // 30
  ['前軍前進', '前軍後退', '前軍上移', '前軍下移'], // 31
  ['全軍前進', '全軍後退', '左右分散', '中央集中'], // 32
];

/** 33 组里第 5/6 条恒为这两条（`[确认]`，198 项无一例外） */
const SLOT_HOLD_RUSH = ['全軍待機', '全軍突擊'] as const;

/**
 * 组号 × 33 的行数自检：33 组是原作数据，少一行都要在测试里炸出来。
 *
 * 出处：`0x4A6674`（阵形号，取值 0..32）× `0x18` 索引 `0x48EE78` 执行表 198 项 ÷ 6 = 33 组；
 * 串表 198 项 × 12 字节 = `0x948` 字节，与 `0x48F94C..0x490294` 的长度严丝合缝。
 */
const GROUP_COUNT = 33;

/** 个别「同名 label 但入口不同」的槽位修正（key = `组:槽`） */
const GROUP_OVERRIDE: Record<string, Partial<EntrySpec>> = {
  // g27 的「全軍後退」是 0x444E99：只写 (1,2)(5,2) —— 前軍 + 中軍，不含後軍 [确认]
  '27:3': { targets: ARMY_TARGET.front | ARMY_TARGET.center },
};

const ARMY_CMDS: readonly (readonly ArmyCmdDef[])[] = buildAllDefs();

function buildAllDefs(): readonly (readonly ArmyCmdDef[])[] {
  const groups: ArmyCmdDef[][] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    const row = GROUP_LABELS[g]!;
    const labels: readonly string[] = [row[0], row[1], row[2], row[3], SLOT_HOLD_RUSH[0], SLOT_HOLD_RUSH[1]];
    const defs: ArmyCmdDef[] = [];
    for (let s = 0; s < 6; s++) {
      const label = labels[s]!;
      const base: EntrySpec = ENTRY_OF_LABEL[label] ?? {
        codes: [],
        targets: 0,
        mask: 0xd,
        guess: true,
      };
      const ov = GROUP_OVERRIDE[`${g}:${s}`];
      const spec: EntrySpec = ov ? { ...base, ...ov } : base;
      const def: ArmyCmdDef = {
        slot: s as 0 | 1 | 2 | 3 | 4 | 5,
        label,
        kind: KIND_OF_LABEL[label] ?? 'unknown',
        flags: spec.codes[spec.codes.length - 1] ?? 0,
        codes: [...spec.codes],
        targets: spec.targets,
        mask: spec.mask,
      };
      if (spec.guess) def.guess = true;
      defs.push(Object.freeze(def));
    }
    groups.push(defs);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 三、取表
// ---------------------------------------------------------------------------

/** 阵形 id → 组号（原作 `unit+0xc` 的 0..32；越界按 33 取模，**不抛**） */
export function armyGroupOf(formationId: number): number {
  if (!Number.isFinite(formationId)) return 0;
  const g = Math.trunc(formationId);
  return ((g % GROUP_COUNT) + GROUP_COUNT) % GROUP_COUNT;
}

/** 该阵形的 6 条子菜单（第 5/6 条恒为全軍待機/全軍突擊） */
export function armyCmdsOf(formationId: number): ArmyCmdDef[] {
  return [...ARMY_CMDS[armyGroupOf(formationId)]!];
}

/** 单条取用（越界/非整数槽 → undefined） */
export function armyCmdDefOf(formationId: number, slot: number): ArmyCmdDef | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) return undefined;
  return ARMY_CMDS[armyGroupOf(formationId)]![slot];
}

// ---------------------------------------------------------------------------
// 四、一侧的指令状态（WeakMap，不动 World 接口）
// ---------------------------------------------------------------------------

const ORDERS = new WeakMap<World, Record<Side, ArmyOrderState>>();

function freshOrder(): ArmyOrderState {
  return {
    slots: [null, null, null, null, null, null],
    cmds: [0, 0, 0, 0, 0, 0, 0, 0],
    active: null,
    last: null,
    at: 0,
    buttons: 0,
    broken: 0,
  };
}

/** 取（并懒惰建）一侧的指令状态 */
export function armyOrderOf(world: World, side: Side): ArmyOrderState {
  let bySide = ORDERS.get(world);
  if (!bySide) {
    bySide = { A: freshOrder(), B: freshOrder() };
    ORDERS.set(world, bySide);
  }
  return bySide[side];
}

/** 本方还有多少士兵（= 原作 `[0x4a8abc]` 的语义，主将不算） */
export function aliveSoldiersOf(world: World, side: Side): number {
  let n = 0;
  for (const u of world.units) if (u.alive && u.side === side && !u.isGeneral) n++;
  return n;
}

/**
 * 战场状态字 `[0x4a8ae0]` 的本作镜像。
 *
 * `[确认]` 位：`0x2` 武將出擊 / `0x4` 撤退中 / `0x10` 主將待機|後退。
 * `[推测]` 位：`0x1` 全局锁（原作里它出现在**每一个** mask 里，但置位点没定位；
 * 本作按「战斗结束/结算中」解释）。`0x8` 原作有、语义未定位，本作不置位。
 */
export function battleCmdFlags(world: World, side: Side): number {
  let f = 0;
  const st = armyOrderOf(world, side);
  if (world.over || world.settled) f |= BATTLE_CMD_BIT.lock;
  if (st.buttons & ARMY_BTN.sortie) f |= BATTLE_CMD_BIT.sortie;
  if (world.fled[side] || world.status[side] === 2) f |= BATTLE_CMD_BIT.retreat;
  if (st.buttons & ARMY_BTN.lordOrder) f |= BATTLE_CMD_BIT.lordOrder;
  return f;
}

// ---------------------------------------------------------------------------
// 五、查可用 / 下令
// ---------------------------------------------------------------------------

/**
 * 「查可用」态（原作每个入口的 `mode==1` 分支）：
 * `(([0x4a8ae0] & mask) == 0) && [0x4a8abc] > 0`。
 *
 * 本作额外给出 `reason`（原作只返回 bool；UI 要能说清"为什么灰"）。
 * `slot` 允许传任意数字：越界/非整数一律 `{ ok:false }`，不抛。
 */
export function canUseArmyCmd(world: World, side: Side, slot: number): ArmyCmdCheck {
  if (!world || (side !== 'A' && side !== 'B')) return { ok: false, reason: '陣營無效' };
  const rt = world.sides?.[side];
  if (!rt) return { ok: false, reason: '陣營無效' };
  if (world.over || world.settled) return { ok: false, reason: '戰鬥已結束' };
  const def = armyCmdDefOf(rt.formation ?? 0, slot);
  if (!def) return { ok: false, reason: '指令槽無效' };

  // 全軍撤退：原作 0x444B4C 的判定是「双方都不在撤退中」（`[0x4a8ae0]&4` 与 `[0x4a8ae4]&4`）
  if (def.kind === 'retreat') {
    if (world.fled[side] || world.status[side] === 2) return { ok: false, reason: '我軍已在撤退' };
    const foe: Side = side === 'A' ? 'B' : 'A';
    if (world.fled[foe] || world.status[foe] === 2) return { ok: false, reason: '敵軍已在撤退' };
    if (aliveSoldiersOf(world, side) <= 0) return { ok: false, reason: '已無士兵' };
    return { ok: true };
  }

  const flags = battleCmdFlags(world, side);
  if ((flags & def.mask) !== 0) return { ok: false, reason: '當前狀態不可下令' };
  if (aliveSoldiersOf(world, side) <= 0) return { ok: false, reason: '已無士兵' };
  return { ok: true };
}

/**
 * 下第二层指令（槽 0..5）。**只写状态**，不碰士兵数/位置：
 *  - 命令字写进 `state.cmds[0..7]`（`army+0x94` 的镜像）；
 *  - `全軍突擊` 直接委托 `battle.ts` 的 `allRush()`（已有实装，禁止重复造）；
 *  - 可用性不过 → `false`（与 `canUseArmyCmd` 同一套判定）。
 */
export function applyArmyCmd(world: World, side: Side, slot: number): boolean {
  if (!canUseArmyCmd(world, side, slot).ok) return false;
  const def = armyCmdDefOf(world.sides[side].formation ?? 0, slot);
  if (!def) return false;
  return applyDef(world, side, def);
}

function applyDef(world: World, side: Side, def: ArmyCmdDef): boolean {
  if (def.kind === 'unknown') return false;
  const st = armyOrderOf(world, side);
  if (def.kind === 'rush') {
    // 原作 0x444B0F → 0x4448B2：AllRush（0x120 位）+ 0x43ADED(0x101,7) + army+0x80|=1。
    // `allRush()` 已实装（R137）；它返回 false = 已经在突击态（幂等），这里同样返回 false。
    if (!allRush(world, side)) return false;
  }
  writeCmds(st, def);
  // R158：非突击命令要顶掉突击态 —— 原作命令字是**同一个字段** `army+0x94+idx*4`，
  // 写 4=下移 就把 7=突擊 覆盖掉了；本作把突击放在 `world.rush` 布尔态里，必须同步清。
  if (def.kind !== 'rush' && world.rush?.[side] === true) {
    world.rush = { ...(world.rush ?? { A: false, B: false }), [side]: false } as Record<Side, boolean>;
  }
  st.slots[def.slot] = def;
  st.active = def;
  st.last = def.kind;
  st.at = world.tick;
  // 原作 左右分散/中央集中/全前集中 会清 `[0x4a8ac4]`（阵形被破残留）
  if (def.kind === 'spread' || def.kind === 'focus') st.broken = 0;
  return true;
}

/** 按 `targets` 展开成 8 个命令槽（同一槽多条 codes 时后写覆盖前写 —— 原作就是连写） */
function writeCmds(st: ArmyOrderState, def: ArmyCmdDef): void {
  for (let i = 0; i < 8; i++) {
    if (!(def.targets & (1 << i))) continue;
    for (const code of def.codes) st.cmds[i] = code;
  }
}

/**
 * 下第一层按钮指令（`保護主將` / `武將出擊` / `主將待機` / `主將後退` / `全軍撤退`）。
 *
 * 语义（`[确认]`）：
 *  - `保護主將` = `0x444C37(2)`：`0x43ADED(armyA, 0x101, 9)` —— 除主将外 7 槽写 9=歸陣，
 *    士兵回军团线；另置全局 `[0x4a8ae0] |= 8`。**不是**减伤，也不写 `army+0x84`。
 *  - `武將出擊` = `0x43ADED(0,1)` + `[0x4a8ae0] |= 2` + 清 `0x10`。
 *  - `主將後退` = `0x43ADED(0,2)` + `[0x4a8ae0] |= 0x10`（0x445282 mode4）。
 *  - `主將待機` = `0x444C94`：`0x43ADED(0,0)` + 清 `army+0x80` 的 `0x10`。
 *  - `全軍撤退` = `requestRetreat()`（已有实装，R38）。
 */
export function applyArmyCmdKind(world: World, side: Side, kind: ArmyCmdKind): boolean {
  if (!world || (side !== 'A' && side !== 'B')) return false;
  if (world.over || world.settled) return false;
  const st = armyOrderOf(world, side);
  switch (kind) {
    case 'guardLord': {
      // 原作 0x4451C3（mode 4）→ 0x444C37(2) → `0x43ADED(0x4A8A60, 0x101, 9)` + `[0x4a8ae0] |= 8`：
      // 除主将外 7 个槽全部写 **9 = 歸陣**，士兵走回己方军团线（=回到主将身边），
      // 同时置全局「守勢」态。这里既不减伤，也不写 army+0x84 的 0x10。
      for (let i = 1; i < 8; i += 1) st.cmds[i] = CMD_RETURN;
      if (world.rush?.[side]) {
        world.rush = { ...(world.rush ?? { A: false, B: false }), [side]: false } as Record<Side, boolean>;
      }
      st.buttons |= ARMY_BTN.guardLord;
      st.last = kind;
      st.at = world.tick;
      return true;
    }
    case 'sortie':
      st.buttons = (st.buttons | ARMY_BTN.sortie) & ~ARMY_BTN.lordOrder;
      st.cmds[0] = 1;
      st.last = kind;
      st.at = world.tick;
      return true;
    case 'lordBack':
      st.buttons |= ARMY_BTN.lordOrder;
      st.cmds[0] = 2;
      st.last = kind;
      st.at = world.tick;
      return true;
    case 'lordWait':
      st.buttons &= ~ARMY_BTN.lordOrder;
      st.cmds[0] = 0;
      st.last = kind;
      st.at = world.tick;
      return true;
    case 'retreat':
      if (!requestRetreat(world, side)) return false;
      st.buttons |= ARMY_BTN.retreat;
      for (let i = 0; i < 8; i++) st.cmds[i] = 8;
      st.active = null;
      st.last = kind;
      st.at = world.tick;
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 六、命令字 → 抽格计划（原作 `0x43C907`/`0x43C921`/`0x43C9EF`/`0x43CA7B`/
//     `0x43CAB8`/`0x43CB87`/`0x43CAF5`/`0x43CDD3`/`0x43CC95` 的那张分派表）
//
// 本层只回答一个问题：**这个单位下一次行动 tick 该按 `(sx,sy)` + 哪两组权重抽格**。
// 抽样、占位互斥、瞬移与 40 帧滑动全在 `battle.ts step()` 里（`0x43C2A5`/`0x43C4C0`/
// `0x43BF26`/`0x43BE42`），与本层的分工和原作一致：先写命令字，更新器再按字分派。
// ---------------------------------------------------------------------------

/**
 * 命令字（`army+0x94 + idx*4`）：`0 待機 / 1 前進 / 2 後退 / 3 上移 / 4 下移 / 5 分散 / 6 集中 / 7 突擊 / 8 撤退 / 9 歸陣`
 *
 * 出处：主将分派 `0x43CF07`，`cmp cmd,8; ja 0x43CF89` 后
 * `jmp dword ptr [cmd*4 + 0x43cf8d]`（`0043CF37..0043CF40`），表 9 项实测：
 *   [0]=0x43CF71(→0x43C907 待機+0x43C47E) [1]=0x43CF47(→0x43C758) [2]=0x43CF55(→0x43C795)
 *   [3..7]=0x43CF89(ret) [8]=0x43CF63(→0x43C7E3)。
 * 小队分派 `0x43CFB1`，`cmp cmd,9; ja 0x43D0C5` 后 `jmp [cmd*4 + 0x43d0c9]`
 * （`0043CFE1..0043CFEE`），表 10 项实测：
 *   [0]=0x43CFF5(→0x43C907) [1]=0x43D006(→0x43C921) [2]=0x43D017(→0x43C9EF)
 *   [3]=0x43D028(→0x43CA7B) [4]=0x43D039(→0x43CAB8) [5]=0x43D0AB(→0x43CB87)
 *   [6]=0x43D09D(→0x43CAF5) [7]=0x43D047(→0x43CDD3+0x43C888) [8]=0x43D0B9(→0x43CC95)
 *   [9]=0x43D072(→0x43C888(u, army+8, army+0xc))。
 */
const CMD_HOLD = 0; //       0x43CF8D[0]/0x43D0C9[0] → 0x43C907（0043C90A push 0x48e6a0）
const CMD_ADVANCE = 1; //    0x43CF8D[1] → 0x43C758（0043C767）/ 0x43D0C9[1] → 0x43C921（0043C939）
const CMD_BACK = 2; //       0x43CF8D[2] → 0x43C795（0043C798 push 0x100）/ 0x43D0C9[2] → 0x43C9EF
const CMD_SHIFT_UP = 3; //   0x43CF8D[3] → 0x43CF89（ret，主将无效）/ 0x43D0C9[3] → 0x43CA7B（0043CA8A push 1）
const CMD_SHIFT_DOWN = 4; // 0x43CF8D[4] → 0x43CF89（ret）/ 0x43D0C9[4] → 0x43CAB8（0043CAC7 push -1）
const CMD_SPREAD = 5; //     0x43CF8D[5] → 0x43CF89（ret）/ 0x43D0C9[5] → 0x43CB87（0043CB97 cmp eax,1）
const CMD_FOCUS = 6; //      0x43CF8D[6] → 0x43CF89（ret）/ 0x43D0C9[6] → 0x43CAF5（0043CAFE [0x48e4d0]）
const CMD_RUSH = 7; //       0x43CF8D[7] → 0x43CF89（ret）/ 0x43D0C9[7] → 0x43CDD3（0043CDDF [ecx+0x38f4]）
const CMD_RETREAT = 8; //    0x43CF8D[8] → 0x43C7E3（0043C81E push 0x4000）/ 0x43D0C9[8] → 0x43CC95（0043CCD0）
const CMD_RETURN = 9; //     0x43CF8D 越界（ja 0x43CF89）/ 0x43D0C9[9] → 0x43D072（0043D093 call 0x43c888）

/**
 * 中央集中的目标行：原作 `0x48E4D0 = 6`（不是 `(14-1)/2 = 6.5`）。
 *
 * 0x48E4D0: 反彙編 `0043CAFE 8b0dd0e44800 mov ecx,[0x48e4d0]` /
 *           `0043CB04 2b480c sub ecx,[eax+0xc]` / `0043CB0E 743b je 0x43cb4b`
 *           —— dy = 6 − y，归到第 6 行才允许前压（`0x48E898`）。
 */
export const FOCUS_ROW = 6;

function foeSideOf(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/**
 * 五军划分（按**逻辑格**，不按渲染坐标）：靠敌一侧 = 前軍，另一侧 = 後軍；
 * 左右按车道中线分；中軍 = 中央 ±1/6 战场高度。
 *
 * 原作是按「军团槽位」分部队，本作每个士兵是独立 `Unit`，所以按位置投影成五军
 * （project/147 的设计，R158 只是把输入从浮点坐标换成格子）。
 */
function classifySoldiers(soldiers: readonly Unit[], side: Side): Map<Unit, number> {
  const xs = soldiers.map((u) => unitCell(u).gx).sort((a, b) => a - b);
  const midX = xs[Math.floor(xs.length / 2)] ?? 0;
  const midY = (GRID_H - 1) / 2;
  const centerR = (GRID_H - 1) / 6;
  // A 从大往小打：朝敌方向是 −x；B 相反
  const toFoe = side === 'A' ? -1 : 1;
  const out = new Map<Unit, number>();
  for (const u of soldiers) {
    const c = unitCell(u);
    let bits = (c.gx - midX) * toFoe >= 0 ? ARMY_TARGET.front : ARMY_TARGET.rear;
    if (c.gy < midY) bits |= ARMY_TARGET.left;
    else bits |= ARMY_TARGET.right;
    if (Math.abs(c.gy - midY) <= centerR) bits |= ARMY_TARGET.center;
    out.set(u, bits);
  }
  return out;
}

/** 五军位 → 原作槽位 1..5。我们的五军是投影，取一个固定优先级（`[推测]`）。 */
const SLOT_PRIORITY: ReadonlyArray<readonly [number, number]> = [
  [ARMY_TARGET.front, 1],
  [ARMY_TARGET.rear, 2],
  [ARMY_TARGET.left, 3],
  [ARMY_TARGET.right, 4],
  [ARMY_TARGET.center, 5],
];

/**
 * 单位该读哪个槽的命令字（`0x43ADED` 的 which/targets 投影，`[推测]`）。
 *
 * 两遍查找（顺序即优先级）：
 * 1. 本次指令 `active.targets` 真的写过的槽，且该槽命令字非 0；
 * 2. 本指令没覆盖到的部队 —— 原作命令字常驻，没重写的槽继续执行旧值。
 *
 * 都找不到返回 0（待機）。不能固定优先级一步到位：中心带
 * `|y-6.5| <= 13/6` 会和前/后位大面积重叠，若中心优先，`全軍前進`
 * （只写槽 1）会让 5/6/7 行所有单位读到空槽 5 而原地不动。
 */
function slotForUnit(st: ArmyOrderState, bits: number): number {
  const activeTargets = st.active?.targets ?? 0;
  for (const [bit, slot] of SLOT_PRIORITY) {
    if ((activeTargets & bit) !== 0 && (bits & bit) !== 0 && (st.cmds[slot] ?? 0) !== 0) return slot;
  }
  for (const [bit, slot] of SLOT_PRIORITY) {
    if ((bits & bit) !== 0 && (st.cmds[slot] ?? 0) !== 0) return slot;
  }
  return 0;
}

/** 五军划分的每 tick 缓存：一次 `step()` 里 N 个单位查同一条指令，别重复排序 */
let classCache: { world: World; tick: number; side: Side; map: Map<Unit, number> } | null = null;

function targetBitsOf(world: World, side: Side, u: Unit): number {
  if (!classCache || classCache.world !== world || classCache.tick !== world.tick || classCache.side !== side) {
    const soldiers = world.units.filter((x) => x.alive && x.side === side && !x.isGeneral);
    classCache = { world, tick: world.tick, side, map: classifySoldiers(soldiers, side) };
  }
  return classCache.map.get(u) ?? 0;
}

/** 某一侧「军团本体」所在的格（原作 `army+8/+0xc`；本作取该侧主将的格） */
function armyCellOf(world: World, side: Side): { gx: number; gy: number } | null {
  for (const u of world.units) {
    if (u.side === side && u.isGeneral && u.alive) return unitCell(u);
  }
  const gen = world.sides[side]?.general;
  if (gen && gen.alive) return null;
  return null;
}

/**
 * 前线判定 `0x43C831`：`u.x <= enemyArmy.x + 3`（A 侧；B 侧镜像）。
 * 命中后 前進/分散 改走 `0x43C888(敌军团格)` —— 即朝敌方军团本体压上，而不是继续盲进。
 */
function isFrontline(side: Side, cell: { gx: number }, enemyArmy: { gx: number }): boolean {
  return side === 'A' ? cell.gx <= enemyArmy.gx + 3 : cell.gx >= enemyArmy.gx - 3;
}

/**
 * 朝目标格的基向量（`0x43C888`）：**dx、dy 各自独立取符号**，两轴都非零就是斜走一格。
 *
 * 反彙編 `0043C888..0043C8F0`：`0043C894 sub ecx,[eax+8]`（dx）、`0043C8A0 sub eax,[edx+0xc]`（dy）、
 * `0043C8A6..0043C8BF` 对 dx 做 `cmp/jle/setge/dec`、`0043C8C8..0043C8E1` 对 dy 同样做一遍，
 * 然后 `0043C8EA push 0x48e808` 调 `0x43C4C0`。
 *
 * 注意 `battle.ts` 的 `planToward` 是「先沿 x 对齐，x 相同才走 y」（`sy = sx!==0 ? 0 : sign(dy)`），
 * 那是本作早期为连续走位写的，**不是** `0x43C888` 的语义；本文件的三处「朝目标一步」
 * （前進/分散的前线分支、歸陣）按真值走这里。
 */
function planSignToward(
  from: { gx: number; gy: number },
  to: { gx: number; gy: number },
  w1: readonly number[],
  w2: readonly number[],
  kind: StepPlan['kind'],
): StepPlan | null {
  const sx = Math.sign(to.gx - from.gx);
  const sy = Math.sign(to.gy - from.gy);
  // 已在目标格：`0x43C4C0(u,0,0,desc)` → `0x43C2A5` 索引 4 → `0x48E580[4] = -1` ⇒ 一项都不抽。
  if (sx === 0 && sy === 0) return null;
  return planDirected(sx, sy, w1, w2, kind);
}

/**
 * 单个命令字 → 抽格计划。逐条对应 `project/155_部队指令语义.md` §2.2 的表（R83 已按反彙編复核）：
 *
 * | 命令 | 基向量 | 权重（desc） | 反彙編入口 |
 * |------|--------|--------------|------------|
 * | 0 待機 | — | `0x48E6A0` 全 0 | 主将 `0x43CF71`/小队 `0x43CFF5` → `0x43C907` |
 * | 1 前進 | 主将 `(A?-1:+1,0)`；士兵同，前方 3 格内改朝敌军团 | `0x48E5C8` 100/0（主将）/ `0x48E6E8` 80/10/10（士兵） | `0x43C758`（`0043C767`）/ `0x43C921`（`0043C939`、`0043C9C2`） |
 * | 2 後退 | `(A?+1:-1,0)`，**与敌人无关** | `0x48E5C8` 100/0（主将，先置 `0x100`）/ `0x48E778` 80/10/10（士兵） | `0x43C795`（`0043C798`）/ `0x43C9EF`（`0043CA4D`） |
 * | 3 上移 | `(0,+1)` | `0x48E7C0` 100/0 | `0x43CA7B`（`0043CA8A`，A/B 相同） |
 * | 4 下移 | `(0,-1)` | `0x48E7C0` 100/0 | `0x43CAB8`（`0043CAC7`，A/B 相同） |
 * | 5 分散 | 前线→朝敌军团；否则 `(sx,0)`/`(sx,+1)`/`(sx,-1)` | 全是 `0x48E6E8` | `0x43CB87`（`0043CB97`、`0043CBCD`、`0043CBD6`、`0043CC19`） |
 * | 6 集中 | `(0,sign(6−y))`，归行后 `(sx,0)` | `0x48E850` 80/10/10 / `0x48E898` 35,5,5,5,5,5,5,35 | `0x43CAF5`（`0043CAFE`、`0043CB32`、`0043CB57`） |
 * | 7 突擊 | 朝缓存的敌 unit 格（`army+0x38F4`） | `0x48E808` | `0x43CDD3` → `0x43D068 call 0x43c888`（只走小队表） |
 * | 8 撤退 | `(A?+1:-1,0)` | `0x48E658` 直线（主将）/ `0x48E8E0` 80/10/10（士兵） | `0x43C7E3`（`0043C7F2`）/ `0x43CC95`（`0043CCA4`），都置 `0x4000` |
 * | 9 歸陣 | 朝己方军团格（`u+0x40` 的 `+8/+0xc`） | `0x48E808` | `0x43D072` → `0043D093 call 0x43c888` |
 *
 * 时长：每条指令都是「**一个行动 tick = 一格**」，tick 间隔由 `0x43B574` 定 —— 普通 **40 帧**
 * （`0043B5DE [u+0x34]=0x28`）、撤退态 **46 帧**（`0043B5FD [u+0x34]=0x2e`）、撤退中的主将
 * 再 `+2*(F(敌军团)−F(己军团))`（`0043B64A..0043B653`）。视觉滑动固定 40 帧
 * （`0043BF5F push 0x28`），所以下令后第 1 格最早 1 帧、最晚 40 帧出现，之后严格每 40 帧一格
 * （撤退 46 帧）。
 */
export function cmdStepPlan(world: World, side: Side, u: Unit, cmd: number): StepPlan | null {
  const c = unitCell(u);
  const forward = side === 'A' ? -1 : 1;
  const enemyArmy = armyCellOf(world, foeSideOf(side));
  // 主将 cmd 3..7 = 无操作：`0x43CF07` 的跳表 `0x43CF8D` 里 [3..7] 五项全指向 `0x43CF89`（直接 ret）。
  if (u.isGeneral && cmd >= CMD_SHIFT_UP && cmd <= CMD_RUSH) return null;
  switch (cmd) {
    case CMD_HOLD:
      return null;
    case CMD_ADVANCE:
      // 主将：`0043C767..0043C774` desc `0x48E5C8`（100/0）+ `(A?-1:+1, 0)` 直线。
      if (u.isGeneral) return planDirected(forward, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance');
      // 士兵前线：`0043C9C2..0043C9EE` → `0x43C888(u, 敌军团+8, 敌军团+0xc)`，desc `0x48E808`。
      if (enemyArmy && isFrontline(side, c, enemyArmy)) {
        return planSignToward(c, enemyArmy, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance');
      }
      // 否则 `0043C988` 起：desc `0x48E6E8` = 80/10/10（第二组 60/15/15/5/5 挤友军）。
      return planDirected(forward, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance');
    case CMD_BACK:
      // 主将 `0x43C795`：先 `0043C798 push 0x100; call 0x43b51e`（後退旗标），再
      // `0043C7B5`(A)/`0043C7CC`(B) 用 desc `0x48E5C8` —— **100/0 直线，不是锥形**（R83 修正）。
      if (u.isGeneral) return planDirected(-forward, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'back');
      // 士兵 `0x43C9EF`：`0043CA4D`(A)/`0043CA64`(B) desc `0x48E778` = 80/10/10。
      // 第一小队特例 `0x48E7C0` 要 `[army+0x64]!=0 && [u+0x20]==1`（`0043C9F8`/`0043CA01`），
      // 而 `army+0x64` 全 .text 只有两处写 0 ⇒ 该分支不可达（project/155 §6.1）。
      return planDirected(-forward, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'back');
    case CMD_SHIFT_UP:
      // `0043CA8A`：push desc `0x48E7C0`、sy=+1、sx=0；B 侧 `0043CAA1` 字节级相同。
      return planDirected(0, 1, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'shiftUp');
    case CMD_SHIFT_DOWN:
      // `0043CAC7`：desc `0x48E7C0`、sy=−1、sx=0。
      return planDirected(0, -1, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'shiftDown');
    case CMD_SPREAD: {
      // `0043CB8F call 0x43c831` == 1 → `0x43C888(u, 敌军团)`（`0043CBBD`），desc `0x48E808`。
      if (enemyArmy && isFrontline(side, c, enemyArmy)) {
        return planSignToward(c, enemyArmy, STEP_W_CONE, STEP_W_CONE_WIDE, 'spread');
      }
      // `0043CBCD cmp [u+0xc],3` / `0043CBD6 cmp,0xa`：`!(y>3 && y<10)` → (sx,0)。
      if (!(c.gy > 3 && c.gy < 10)) return planDirected(forward, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'spread');
      // `0043CC19 cmp [u+0xc],7`：`y>=7` → (sx,+1)（`0043CC2B`/`0043CC42`）；否则 (sx,−1)（`0043CC65`/`0043CC7C`）。
      if (c.gy >= 7) return planDirected(forward, 1, STEP_W_CONE, STEP_W_CONE_WIDE, 'spread');
      return planDirected(forward, -1, STEP_W_CONE, STEP_W_CONE_WIDE, 'spread');
    }
    case CMD_FOCUS: {
      // `0043CAFE mov ecx,[0x48e4d0]` / `0043CB04 sub ecx,[u+0xc]`；dy≠0 → `0043CB32` desc `0x48E850`。
      const dy = FOCUS_ROW - c.gy;
      if (dy !== 0) return planDirected(0, Math.sign(dy), STEP_W_CONE, STEP_W_CONE_WIDE, 'focus');
      // dy==0 → `0043CB57`(A)/`0043CB6E`(B) desc `0x48E898` = 35,5,5,5,5,5,5,35。
      return planDirected(forward, 0, STEP_W_FOCUS_ROW, STEP_W_FOCUS_ROW, 'focus');
    }
    case CMD_RUSH:
      // `0x43CDD3` 选目标（缓存 `army+0x38F4`）后 `0043D068 call 0x43c888`，desc `0x48E808`。
      // 目标格→基向量的取符号在 battle.ts 的 `rushStepPlan`（本文件不重复实现，见 R83 报告）。
      return rushStepPlan(world, u);
    case CMD_RETREAT:
      // 士兵 `0x43CC95`（`0043CCA4`）/ 主将 `0x43C7E3`（`0043C7F2`），两者都 `0043CCD0`/`0043C81E`
      // `push 0x4000; call 0x43b51e` 置撤退态。
      return retreatStepPlan(u);
    case CMD_RETURN: {
      // `0x43D072..0043D098`：目标格 = 己方军团 `[u+0x40]+8/+0xc`，再 `0x43C888`，desc `0x48E808`。
      const own = armyCellOf(world, side);
      return own ? planSignToward(c, own, STEP_W_CONE, STEP_W_CONE_WIDE, 'toward') : null;
    }
    default:
      return null;
  }
}

/**
 * 本车道是否还有活着的敌人（原作「本兵道没兵」的判定口径）。
 */
function laneHasEnemy(world: World, u: Unit): boolean {
  const gy = unitCell(u).gy;
  for (const v of world.units) {
    if (!v.alive || v.side === u.side) continue;
    if (unitCell(v).gy === gy) return true;
  }
  return false;
}

/**
 * 本车道已无敌人：士兵跨道寻敌。
 *
 * 原作小队走位器 `0x43C888` 可以朝任意格走（`0x43C4C0` 的 8 组格偏移不锁 y），
 * 所以「这一道打空了就挪到有敌人的道」是允许的；主将不走这条路（`0x43D76C`
 * 只打 `x+dir`、y 不变）。撤退态（`0x4000`）也不追敌，免得把撤退令走成反冲锋。
 */
function seekAcrossLanes(world: World, u: Unit): StepPlan | null {
  if (u.isGeneral) return null;
  if (((u.status ?? 0) & 0x4000) !== 0) return null;
  if (laneHasEnemy(world, u)) return null;
  const foe = nearestEnemy(world, u);
  if (!foe) return null;
  const c = unitCell(u);
  const t = unitCell(foe);
  const dx = Math.sign(t.gx - c.gx);
  const dy = Math.sign(t.gy - c.gy);
  if (dx === 0 && dy === 0) return null;
  return planDirected(dx, dy, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'default');
}

/**
 * 兵尽后的主将索敌（R216 补丁）。
 *
 * R216 起「士兵清零」不再结束战斗（`checkOver()` 只剩主将阵亡/撤退/时限三条出口），
 * 但 `adjacentEnemy()` 只扫**同一车道**：两将兵尽后各自按旧令走位，永远不会进
 * 对方的扫描行 —— 实测白等 9170 tick（153s）到 198s 判平手。这里让主将主动索敌：
 * **只在本车道内沿 x 逼近**（原作 `0x43D76C` 取 `u->+0x08 + dir`、y 不变），
 * 相邻（距离 1）由 `adjacentEnemy()` 接战，距离 2 也能打敌将。
 */
function closingStepPlan(world: World, u: Unit): StepPlan | null {
  const foe = world.units.find((v) => v.alive && v.isGeneral && v.side !== u.side);
  if (!foe) return null;
  const c = unitCell(u);
  const t = unitCell(foe);
  if (t.gy !== c.gy) return null; // 武将不换道
  const dx = Math.sign(t.gx - c.gx);
  if (dx === 0) return null;
  return planDirected(dx, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'default');
}

/**
 * 本作给 `battle.ts step()` 装的计划提供者（`world.armyStepPlan`）。
 *
 * 主将读槽 0，士兵按五军投影读槽 1..5。**没有任何指令时返回 null = 待機**
 * （原作 8 个槽全 0、`0x43CF07[0]` 的 `0x48E6A0` 权重全 0，见 project/173 Q1）；
 * 一旦下过指令，命令字就是唯一来源 —— 没被 `targets` 覆盖的部队保持旧值（缺省 0）。
 */
function armyStepPlanRaw(world: World, u: Unit): StepPlan | null {
  if (!world || world.over) return null;
  if (!world.units.includes(u)) return null;
  // 本车道打空：士兵挪到有敌人的车道（主将不走这条）
  const seek = seekAcrossLanes(world, u);
  if (seek) return seek;
  // R216 起兵尽不结束：对面没兵了就由主将互相索敌，避免走位到时限平手
  if (u.isGeneral && world.sides[u.side === 'A' ? 'B' : 'A'].aliveCount === 0) {
    return closingStepPlan(world, u);
  }
  const st = armyOrderOf(world, u.side);
  // 命令系统装着但**一条令都没下过** ⇒ 待機（原作 8 个槽全 0、`0x43CF07[0]` 权重全 0）。
  // 旧代码退回 `defaultStepPlan()` 自动前压，是 [新设计]，见 project/173 Q1。
  if (st.last === null && st.active === null) return null;
  if (u.isGeneral) return cmdStepPlan(world, u.side, u, st.cmds[0] ?? CMD_HOLD);
  const slot = slotForUnit(st, targetBitsOf(world, u.side, u));
  const cmd = slot > 0 ? (st.cmds[slot] ?? CMD_HOLD) : CMD_HOLD;
  return cmdStepPlan(world, u.side, u, cmd);
}

/**
 * 主将**不换兵道**：原作 `0x43D76C` 取 `t = 0x43AF7A(u->+0x08 + dir, u->+0x0c)`，
 * 只改 x、y 不变；所以命令层算出来的任何侧移分量都要清掉。
 * 纯侧移（sx==0）就原地不动，等敌人自己走到本车道。
 */
export function armyStepPlan(world: World, u: Unit): StepPlan | null {
  const plan = armyStepPlanRaw(world, u);
  if (!u.isGeneral || !plan || plan.sy === 0) return plan;
  if (plan.sx === 0) return null;
  return { ...plan, sy: 0 };
}

/**
 * AI 的命令入口（`world.aiCommand`，由 `battle_ai.ts` 按 60 帧节拍调）。
 *
 * 原作 `0x402EA5` 选完 case 直接跳执行入口，本函数按地址逐条复刻：
 *  - `advance` = `0x44497F` → `0x43ADED(army, 0, 1)`：**只写槽 0**（主将前進）。
 *    注意它和 UI 的「全軍前進」不是同一条（UI 走 `0x4449A9`/槽 1）。
 *  - `rush` = `0x4448B2` → `allRush()`（`army+0x80 |= 1`）+ `0x43ADED(army, 0x101, 7)`
 *    写槽 1..7 = 7（不含槽 0）。AI 的 case 2 先 `advance` 再 `rush`，两条合起来才覆盖 0..7。
 *  - `retreat` = `0x44493D` → `requestRetreat()`（R38 实装）。
 */
export function aiArmyCommand(world: World, side: Side, cmd: AiBattleCommand): void {
  if (!world || world.over || world.settled) return;
  if (side !== 'A' && side !== 'B') return;
  const st = armyOrderOf(world, side);
  if (cmd === 'advance') {
    st.cmds[0] = CMD_ADVANCE;
  } else if (cmd === 'rush') {
    allRush(world, side);
    for (let i = 1; i < 8; i++) st.cmds[i] = CMD_RUSH;
  } else if (cmd === 'retreat') {
    requestRetreat(world, side);
  } else {
    return;
  }
  st.last = cmd;
  st.at = world.tick;
}

/**
 * 把「部队指令」装到 world 上（`world.armyStepPlan` + `world.aiCommand`），供
 * `battle.ts step()` 每个行动 tick 查一次。幂等；`uninstallArmyOrders()` 摘掉。
 */
export function installArmyOrders(world: World): void {
  if (!world) return;
  world.armyStepPlan = (w, u) => armyStepPlan(w, u);
  world.aiCommand = (w, side, cmd) => aiArmyCommand(w, side, cmd);
}

/** 卸掉钩子（测试/复盘用；不影响 WeakMap 里已下的指令） */
export function uninstallArmyOrders(world: World): void {
  if (!world) return;
  delete world.armyStepPlan;
  delete world.aiCommand;
}

/**
 * `step()` 的包装器：装钩子 + 走一帧。
 *
 * R158 之前它是「step 之后再改写坐标」的补丁；现在命令只产出抽格计划，
 * 位移由 `step()` 内部的 `0x43C4C0` 机制统一落地，所以包装器只剩安装这一步。
 */
export function stepWithArmyOrders(world: World): void {
  if (!world) return;
  installArmyOrders(world);
  step(world);
}
