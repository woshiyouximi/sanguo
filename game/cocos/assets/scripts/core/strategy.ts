/**
 * R37 策略派發（軍師技在戰鬥中的落地）+ 援軍入場。
 *
 * ## 一、這份表是怎麼來的
 *
 * 原作戰鬥裡「策略」的派發器是 `0x44D450`（5040 B，`work/dis_battle_B_44D450.txt`）：
 *
 * ```
 * unit1 = [ebp+0xc]; side = [ebp+8]
 * if (0x44D3E0(unit1, unit2) != 1) return;      // 沒有合法目標 → 什麼都不做
 * idx = 0x40A63A(unit1->+0x40 self) - 1;        // 軍師技 id → 分支號（= WISE.Execute − 1）
 * if (idx > 0x42) return;                        // 跳表 0x44E6F4 共 67 項
 * jmp [0x44E6F4 + idx*4];
 * ```
 *
 * 於是「策略」= **WISE 表（`data/wises.json`）在戰鬥中生效一次**：
 * `SEQUENCE` 是軍師技編號，`Execute` 是上面那條分支號，`WiseLevel` 是同一條技的三個檔次。
 * 67 條分支逐條讀出來的效果見 `STRATEGY_TABLE`，每條都在註釋裡給了反彙編地址。
 *
 * 任務書裡猜的「突擊 / 火計 / 伏兵 / 嘲罵」在原作裡**並不存在**：
 *  - 「伏兵」實為 `Execute 44` 十面埋伏，原文是「敵方無法退兵」；
 *  - 「嘲罵」實為 `Execute 1..3` 降敵士氣 / `58..60` 喝阻敵軍（敵方士兵逃走）。
 * 所以本檔只做 `0x44D450` 真的有的 22 類 × 3 檔 + 8 條獨有技，一條也沒自己加。
 *
 * ## 二、分工
 *
 * - `planStrategy()`：**純函數**。世界狀態 → `StrategyPick`（含 ops 指令流），不寫 world。
 * - `runStrategy()`：把 ops 落地、push `world.strategyEvents` / `world.log`、翻 `used` 位。
 * - `tickStrategy()`：`battle.ts` 的 `step()` 每 tick 調，接戰那一 tick 為每側派發一次。
 * - `planReinforceGroups()` / `tickReinforce()`：援軍（見檔尾第二節）。
 *
 * ## 三、[推測] 都在這裡集中標了
 *
 * 反彙編給的是「改了哪個字段、加減多少」，沒給的是「這個字段在我們的模型裡算什麼」。
 * 凡屬後者的映射，註釋裡都寫 `[推測]`，報告 `project/61_策略与援军.md` 有總表。
 */
import { GRID_H, GRID_W } from './battle';
import type { Side, Unit, World } from './battle';
import type { GameData } from '../types';
import { garrisonOf } from './garrison';
import { parseWiseSkill } from './wises';

const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------------------
// 一、army 狀態位（`unit+0x84` / `+0x70` / `+0x68` / `+0x74` / `+0x88` / `+0x90`）
// ---------------------------------------------------------------------------

/**
 * `army+0x84` 的狀態位。反彙編裡 66 條分支幾乎全在 `or` 這幾個 bit：
 * `or dh,4` = 0x400、`or dh,0x20` = 0x2000 這類寫法要按字節拆開看。
 */
export const ARMY_FLAG = {
  /** 1 恢復體力（`+0x88` = 每週期回血千分比 40/60/80） */
  hpRegen: 1,
  /** 2 恢復技力（`+0x88` = 30/50/70） */
  mpRegen: 2,
  /** 4 敵方無法退兵（十面埋伏） */
  noRetreat: 4,
  /** 8 武將可以後退（詐敗） */
  mayRetreat: 8,
  /** 0x10 士兵可以保護主將 */
  guardGeneral: 0x10,
  /** 0x20 集氣速度變化（`+0x90` 為檔位 ±1/±2/±3） */
  qiSpeed: 0x20,
  /** 0x40 武將可以隨時撤退（金蟬脫殼） */
  fleeAnytime: 0x40,
  /** 0x80 施武將技所需氣力減少（`+0x88` = 66/50/25 = 百分比） */
  qiSave: 0x80,
  /** 0x100 敵將無法使用武將技（封武將技） */
  sealMagic: 0x100,
  /** 0x200 武將攻擊力上昇（`+0x74` = 10/15/20） */
  generalAtk: 0x200,
  /** 0x400 說服敵將投靠我方（勸降） */
  defect: 0x400,
  /**
   * 0x1000 疲勞倍率已寫（Execute 9/10/11/12/13/14，`0x44D717` 一族 `or dh,0x10`）。
   * 值在 `army+0x38`（本檔 `fatigueIdx`），由戰後 `0x41048D` 讀成倍率。
   */
  fatigue: 0x1000,
} as const;

/**
 * 集氣檔位 → 回氣倍率。
 *
 * 依據 `battle.ts:73-76` 已經寫下的反彙編結論：
 * `unit+0x84 & 0x20` 時按 **130% / 150% / 200% / 76% / 66% / 50%** 縮放。
 * 這裡把 `+0x90` 的檔位 1/2/3 與 −1/−2/−3 對到那六個係數。
 */
export const QI_TIER_MUL: Record<number, number> = {
  [-3]: 0.5,
  [-2]: 0.66,
  [-1]: 0.76,
  [0]: 1,
  [1]: 1.3,
  [2]: 1.5,
  [3]: 2,
};

/** 一側的「軍隊狀態」——原作那幾個 army 字段在我們的模型裡的鏡像 */
export interface ArmyStatus {
  /** 本場派發的軍師技 SEQUENCE（null = 這側沒帶軍師技） */
  seq: number | null;
  /** 已經派發過（軍師技在戰鬥中只生效一次） */
  used: boolean;
  /** `army+0x70` 的加減（增強攻擊 / 強化士兵 / 混亂敵軍），直接進 `powerOf` */
  atkMod: number;
  /** `army+0x74` 武將攻擊加成（強化武將 10/15/20）[推測] 當作主將傷害的額外武力 */
  generalAtk: number;
  /** `army+0x84` 狀態位，見 `ARMY_FLAG` */
  flags: number;
  /** `army+0x68` 戰術姿態：0 無 / 1 逼近 / 2 被包圍 / 3 包圍 / 4 偷襲 */
  posture: number;
  /** `army+0x88` 參數（回血千分比 / 省氣百分比） */
  qiParam: number;
  /** `army+0x90` 集氣檔位（−3..3） */
  qiTier: number;
  /** 恢復體力：每 `REGEN_PERIOD_TICKS` 回 `maxHp × hpRegen / 1000` */
  hpRegen: number;
  /** 恢復技力：同上，用 `mpMax` */
  mpRegen: number;
  /** `unit+0x3c` 經驗加成百分比（結算時乘） */
  expPct: number;
  /** 行軍速度係數（逼近 1.1 / 偷襲 1.2 / 包圍 1.15 / 被包圍 0.9）[推測] */
  moveMul: number;
  /** 主將受傷係數（保護主將 = 0.75）[推測] */
  takenMul: number;
  /**
   * `army+0x38` 疲勞倍率檔（Execute 9/10/11 給敵方 +1/+2/+3，12/13/14 給己方 −1/−2/−3）。
   *
   * 原作那 6 條分支**不寫**疲勞點數（`general+0x3A`），只把這個檔位加減；
   * 真正的疲勞加在戰後 `0x41048D`：`base = 15+秒/10` 過 `0x4103DE(base, idx)`
   * 這張 7 項跳表（30/50/75/100/150/200/250%）。本作在 `battle.ts:fatigueMul()` 落地，
   * 由 `settle()` 消費。0 = 沒有軍師技動過。
   */
  fatigueIdx: number;
  /**
   * 被「化解」掉、還沒兌現的派發次數（Execute 57 的落點，[推測]）。
   *
   * 原作 `0x44E34C` 只打一條日誌，取消動作在呼叫方（未定位）；本作把它記在**被化解方**
   * 的 army 上，`runStrategy()` 下一場派發時減一：事件照發（日誌留痕），`ops` 全部不落地。
   */
  cancelPending: number;
  /**
   * 勸降成功（`0x400`）的戰後標記，**戰中不改名單**。
   *
   * 原作 `0x44DDE0..0x44DE3F` 成功分支只有 `foeArmy+0x84 |= 0x400` + 一句「說服敵將投靠我方」；
   * 名單變動在戰後。本作把「投靠」記在這裡，`settle()` 戰後才翻成一條 `recruited: true`
   * 的捕獲條目交給 `roster.ts` 的招降路徑（`applyPostBattle()`）。
   */
  defectPending: boolean;
  /**
   * 後選出陣（Execute 34）的旗標：本側在**敵方之後**選將/兵種（`ATTRIB=1` 戰前選擇）。
   *
   * 原作為什麼沒有狀態寫入：`0x44DE44` 只打一句「成功」日誌（`work/dis_battle_B_44D450.txt:763`），
   * 真正的效果發生在戰役編成層的 5 將出陣隊列（原作 Obj3 部隊池 `docs/07b` §6），
   * 不在戰場內核。本作由 `wises.ts:applySpec('choose_after_foe')` 或
   * `strategy.ts` 的 `afterfoe` 指令立旗，`deploy_queue.ts:chooseAfterFoe()` 消費：
   * 前 `DEPLOY_FIELD_SLOTS`（3）個上陣槽可在開戰前重排。數值一律不動，所以是 optional
   * 且不進 `emptyArmyStatus()`（沒帶這條技的 army 對象形狀不變）。
   */
  chooseAfterFoe?: boolean;
}

export function emptyArmyStatus(): ArmyStatus {
  return {
    seq: null,
    used: false,
    atkMod: 0,
    generalAtk: 0,
    flags: 0,
    posture: 0,
    qiParam: 0,
    qiTier: 0,
    hpRegen: 0,
    mpRegen: 0,
    expPct: 0,
    moveMul: 1,
    takenMul: 1,
    fatigueIdx: 0,
    cancelPending: 0,
    defectPending: false,
  };
}

/** 某側的 army 狀態（`World.army` 一定存在，這裡只是給呼叫方一個不判空的入口） */
export function armyOf(world: World, side: Side): ArmyStatus {
  return world.army[side] ?? emptyArmyStatus();
}

// ---------------------------------------------------------------------------
// 二、策略表（67 條 = `0x44D450` 的 67 個跳表項）
// ---------------------------------------------------------------------------

export type StrategyKind =
  | 'morale-down'
  | 'morale-up'
  | 'scatter'
  | 'regroup'
  | 'tire-enemy'
  | 'tire-relief'
  | 'hp-up'
  | 'mp-up'
  | 'atk-up'
  | 'def-down'
  | 'chaos'
  | 'alienate'
  | 'persuade'
  | 'reserve'
  | 'hp-regen'
  | 'mp-regen'
  | 'general-atk'
  | 'ambush'
  | 'feign-rout'
  | 'guard-general'
  | 'encircle'
  | 'raid'
  | 'approach'
  | 'qi-fast'
  | 'exp-up'
  | 'flee-anytime'
  | 'dispel'
  | 'foe-flee'
  | 'qi-save'
  | 'seal-magic'
  | 'qi-slow';

export interface StrategyDef {
  /** `WISE.Execute`，也是 `0x44E6F4` 跳表下標 + 1 */
  exec: number;
  kind: StrategyKind;
  /** 機械參數（百分比 / 點數 / 檔位），含義隨 kind；`qi-fast`/`qi-slow` 是檔位 1..3 */
  value: number;
  /** 戰場消息原文（`%d` 由實際數值填；`%%` 是真的百分號） */
  text: string;
}

const d = (exec: number, kind: StrategyKind, value: number, text: string): StrategyDef => ({
  exec,
  kind,
  value,
  text,
});

/** 67 條分支，一條一行，註釋給反彙編地址。順序即 `WISE.Execute`。 */
export const STRATEGY_TABLE: readonly StrategyDef[] = [
  d(1, 'morale-down', 15, '敵方士氣下降%d點'), // 0x44D529 sub ax,0xf
  d(2, 'morale-down', 25, '敵方士氣下降%d點'), // 0x44D567 sub ax,0x19
  d(3, 'morale-down', 40, '敵方士氣下降%d點'), // 0x44D5A5 sub ax,0x28
  d(4, 'morale-up', 15, '我方士氣上昇%d點'), // 0x44D5E4 add ax,0xf
  d(5, 'morale-up', 25, '我方士氣上昇%d點'), // 0x44D623 add ax,0x19
  d(6, 'morale-up', 40, '我方士氣上昇%d點'), // 0x44D662 add ax,0x28
  d(7, 'scatter', 1.5, '敵方陣型潰散'), // 0x44D6A9 0x429DD8(0x400)→0x43A0F6(side^1,ptr)
  d(8, 'regroup', 0, '我方使用太公陣型'), // 0x44D6E3 0x429DD8(0x200)→0x43A0F6(side,ptr); unit1+0x10=0
  // 疲勞 6 條（Execute 9-14）：值 = **`army+0x38` 檔位**，不是疲勞點數。
  // `0x41048D` 戰後以 `0x4103DE(base, idx)` 的 7 項跳表把它換成 30..250%。
  d(9, 'tire-enemy', 1, '敵將疲勞度增加'), // 0x44D717 unit2+0x34 |= 0x1000; +0x38 += 1
  d(10, 'tire-enemy', 2, '敵將疲勞度增加'), // 0x44D74B +0x38 += 2
  d(11, 'tire-enemy', 3, '敵將疲勞度增加'), // 0x44D77F +0x38 += 3
  d(12, 'tire-relief', 1, '我方疲勞度減少'), // 0x44D7B3 unit1+0x34 |= 0x1000; +0x38 -= 1
  d(13, 'tire-relief', 2, '我方疲勞度減少'), // 0x44D7E7 +0x38 -= 2
  d(14, 'tire-relief', 3, '我方疲勞度減少'), // 0x44D81B +0x38 -= 3
  d(15, 'hp-up', 20, '武將體力增加%d點'), // 0x44D8A0 imul 0x14, idiv 0x64
  d(16, 'hp-up', 35, '武將體力增加%d點'), // 0x44D8F5 imul 0x23
  d(17, 'hp-up', 50, '武將體力增加%d點'), // 0x44D92F imul 0x32
  d(18, 'mp-up', 25, '武將技力增加%d點'), // 0x44D9A2 imul 0x19
  d(19, 'mp-up', 40, '武將技力增加%d點'), // 0x44DA15 imul 0x28
  d(20, 'mp-up', 60, '武將技力增加%d點'), // 0x44DA88 imul 0x3c
  d(21, 'atk-up', 10, '我方士兵攻擊力上昇%d'), // 0x44DAE8 ownArmy+0x70 += 10
  d(22, 'atk-up', 20, '我方士兵攻擊力上昇%d'), // 0x44DB0F
  d(23, 'atk-up', 30, '我方士兵攻擊力上昇%d'), // 0x44DB36
  d(24, 'def-down', 10, '我方士兵防禦力上昇%d'), // 0x44DB5D foeArmy+0x70 -= 10（原文如此）
  d(25, 'def-down', 20, '我方士兵防禦力上昇%d'), // 0x44DB84
  d(26, 'def-down', 30, '我方士兵防禦力上昇%d'), // 0x44DBAB
  d(27, 'chaos', 5, '敵方攻擊力降%2d  禦力降%d'), // 0x44DBD2 兩邊都動 5/5
  d(28, 'chaos', 10, '敵方攻擊力降%2d  禦力降%d'), // 0x44DC0A
  d(29, 'chaos', 15, '敵方攻擊力降%2d  禦力降%d'), // 0x44DC42
  d(30, 'alienate', 8, '敵將忠誠度降低%d'), // 0x44DC7A foeGeneral+0x3c -= 8
  d(31, 'alienate', 15, '敵將忠誠度降低%d'), // 0x44DCB8
  d(32, 'alienate', 25, '敵將忠誠度降低%d'), // 0x44DCF6
  d(33, 'persuade', 0, '說服敵將投靠我方'), // 0x44DDE0..0x44DE3F
  d(34, 'reserve', 0, '成功'), // 0x44DE44 只有一條日誌
  d(35, 'hp-regen', 40, '武將體力自動恢復'), // 0x44DE5A flags|=1, +0x88=0x28
  d(36, 'hp-regen', 60, '武將體力自動恢復'), // 0x44DE9F +0x88=0x3c
  d(37, 'hp-regen', 80, '武將體力自動恢復'), // 0x44DEE4 +0x88=0x50
  d(38, 'mp-regen', 30, '武將技力自動恢復'), // 0x44DF29 flags|=2, +0x88=0x1e
  d(39, 'mp-regen', 50, '武將技力自動恢復'), // 0x44DF6E +0x88=0x32
  d(40, 'mp-regen', 70, '武將技力自動恢復'), // 0x44DFB3 +0x88=0x46
  d(41, 'general-atk', 10, '武將攻擊力上昇%d'), // 0x44E007 flags|=0x200, +0x74=10
  d(42, 'general-atk', 15, '武將攻擊力上昇%d'), // 0x44E03E
  d(43, 'general-atk', 20, '武將攻擊力上昇%d'), // 0x44E075
  d(44, 'ambush', 0, '敵方無法退兵'), // 0x44E0AC foeArmy+0x84 |= 4
  d(45, 'feign-rout', 0, '武將可以後退'), // 0x44E104 flags |= 8
  d(46, 'guard-general', 0, '士兵可以保護主將'), // 0x44E12F flags |= 0x10
  d(47, 'encircle', 3, '我方包圍敵方'), // 0x44E163 own+0x68=3 / foe+0x68=2 / unit1+0x10=2
  d(48, 'raid', 4, '我方偷襲敵方成功'), // 0x44E183 foeArmy+0x68=4
  d(49, 'approach', 1, '我方逼近敵方成功'), // 0x44E1A3 ownArmy+0x68=1
  d(50, 'qi-fast', 1, '武將集氣增快%d%%'), // 0x44E1F5 flags|=0x20, +0x90 += 1
  d(51, 'qi-fast', 2, '武將集氣增快%d%%'), // 0x44E236 +0x90 += 2
  d(52, 'qi-fast', 3, '武將集氣增快%d%%'), // 0x44E278 +0x90 += 3
  d(53, 'exp-up', 30, '經驗值增加%d%%'), // 0x44E2A6 unit1+0x34|=0x2000, +0x3c=0x1e
  d(54, 'exp-up', 50, '經驗值增加%d%%'), // 0x44E2D7 +0x3c=0x32
  d(55, 'exp-up', 100, '經驗值增加%d%%'), // 0x44E308 +0x3c=0x64
  d(56, 'flee-anytime', 0, '武將可以隨時撤退'), // 0x44E335 flags |= 0x40
  d(57, 'dispel', 0, '化解敵方軍師策略'), // 0x44E34C 只有日誌
  d(58, 'foe-flee', 10, '敵方士兵逃走%d人'), // 0x44E3DF foeGeneral+0x44/+0x48 -= 10%
  d(59, 'foe-flee', 15, '敵方士兵逃走%d人'), // 0x44E472 15%
  d(60, 'foe-flee', 25, '敵方士兵逃走%d人'), // 0x44E505 25%
  d(61, 'qi-save', 66, '施武將技所需氣力減少'), // 0x44E53D flags|=0x80, +0x88=0x42
  d(62, 'qi-save', 50, '施武將技所需氣力減少'), // 0x44E575 +0x88=0x32
  d(63, 'qi-save', 25, '施武將技所需氣力減少'), // 0x44E5AC +0x88=0x19
  d(64, 'seal-magic', 0, '敵將無法使用武將技'), // 0x44E5E5 foeArmy+0x84 |= 0x100
  d(65, 'qi-slow', 1, '敵將集氣減慢%d%%'), // 0x44E63A foe+0x84|=0x20, +0x90 -= 1
  d(66, 'qi-slow', 2, '敵將集氣減慢%d%%'), // 0x44E679 +0x90 -= 2
  d(67, 'qi-slow', 3, '敵將集氣減慢%d%%'), // 0x44E6B7 +0x90 -= 3
];

const BY_EXEC = new Map<number, StrategyDef>(STRATEGY_TABLE.map((x) => [x.exec, x] as const));

export function strategyDefOf(exec: number): StrategyDef | undefined {
  return BY_EXEC.get(exec);
}

/** 集氣類日誌推的是百分比（30/50/100），機械檔位才是 1/2/3 */
const QI_TIER_PCT: Record<number, number> = { 1: 30, 2: 50, 3: 100 };

// ---------------------------------------------------------------------------
// 三、指令流（plan 只產生它，run 才落地）
// ---------------------------------------------------------------------------

export type StrategyOp =
  | { op: 'morale'; side: Side; delta: number }
  | { op: 'tire'; side: Side; delta: number }
  | { op: 'loyal'; side: Side; delta: number }
  | { op: 'hp'; side: Side; amount: number; growMax: boolean }
  | { op: 'mp'; side: Side; amount: number; growMax: boolean }
  | { op: 'atk'; side: Side; delta: number }
  | { op: 'flag'; side: Side; flag: number }
  | { op: 'posture'; side: Side; value: number; moveMul: number }
  | { op: 'qiparam'; side: Side; value: number }
  | { op: 'qitier'; side: Side; delta: number }
  | { op: 'generalatk'; side: Side; value: number }
  | { op: 'exp'; side: Side; pct: number }
  | { op: 'formation'; side: Side; value: number }
  | { op: 'scatter'; side: Side; r: number }
  | { op: 'regroup'; side: Side }
  | { op: 'desert'; side: Side; count: number }
  | { op: 'guarded'; side: Side }
  | { op: 'fatigue'; side: Side; delta: number }
  | { op: 'cancel'; side: Side; times?: number }
  | { op: 'defect'; side: Side }
  /** 後選出陣（Execute 34）：把本側的 `army.chooseAfterFoe` 立起來，不改任何數值 */
  | { op: 'afterfoe'; side: Side }
  | { op: 'note'; text: string };

export interface StrategyPick {
  /** 施計方 */
  side: Side;
  /** WISE.SEQUENCE（軍師技編號，`data/wises.json`） */
  seq: number;
  /** WISE.Execute（分支號 1..67） */
  exec: number;
  kind: StrategyKind;
  /** 技名（`data/wises.json` 的 NAME，如「降敵士氣」） */
  name: string;
  /** 檔次 0..3（0 = 獨有技單檔） */
  tier: number;
  /** 機械參數 */
  value: number;
  /** 已經填好數值的戰場消息 */
  text: string;
  /** 音效 id（給 view 播；本輪不動 view，寫進 log 等 lead 接） */
  sfx: string;
  ops: StrategyOp[];
}

export interface StrategyEvent {
  tick: number;
  side: Side;
  seq: number;
  exec: number;
  kind: StrategyKind;
  name: string;
  tier: number;
  value: number;
  text: string;
  /** 音效 id（view 層據此播 SE） */
  sfx: string;
  ops: StrategyOp[];
  /**
   * 這次派發被敵方的「化解」取消了（`cancelPending` 兌現）。
   * 事件照樣發（日誌要留痕），但 `ops` 一條都沒落地。
   */
  cancelled?: boolean;
}

export interface LogEntry {
  tick: number;
  kind: 'strategy' | 'reinforce' | 'info';
  side?: Side;
  text: string;
  /** 音效 id：`wise` / `march` / `rally`（view 層按這個選 SE 音，見報告） */
  sfx?: string;
  value?: number;
}

/** 把 `%d` / `%2d` / `%%` 依序填掉（原作是 `wsprintf` 進戰場消息欄） */
export function formatMsg(tpl: string, args: number[]): string {
  let i = 0;
  return tpl.replace(/%2?d|%%/g, (m) => (m === '%%' ? '%' : String(args[i++] ?? 0)));
}

/**
 * 「接戰」判定距離。
 *
 * `0x44D3E0`（派發前的閘）在 docs/04b5:101 記為「AI 選目標」，`0x44D450` 只在它返回 1
 * 時才動。我們的 `ENGAGE_RANGE`（1.15）是**砍殺**距離，太窄：策略要早於第一刀生效。
 * 取 3 格 = 「兩軍前鋒互相鎖定」的距離。[推測]
 */
export const STRATEGY_ENGAGE_RANGE = 3;

/**
 * 恢復體力/技力的週期（tick）。原作只給了 `+0x88` 參數與 `+0x8c` 計數，週期沒定位。[推測]
 *
 * 2 秒 @ `TICK_HZ=60` ⇒ **120 tick**（R192 前是 `60`，那是 30 Hz 下的"2 秒"）。
 * 这里写不出 `2 * TICK_HZ`：`battle.ts` 已经 `import { tickStrategy } from './strategy'`，
 * 反向 import 会成环（core 内不许成环，见 CLAUDE/项目约定）。
 * ⇒ **改 TICK_HZ 时这个字面值必须同步**，`game/tests/strategy.test.ts` 里有守卫断言，
 * 同时 `game/tests/tick60.test.ts` 也锁了 `REGEN_PERIOD_TICKS / TICK_HZ === 2`。
 */
export const REGEN_PERIOD_TICKS = 120;

function nearestFoeDist(world: World, u: Unit): number {
  let best = Infinity;
  for (const v of world.units) {
    if (!v.alive || v.side === u.side) continue;
    const dd = Math.hypot(v.x - u.x, v.y - u.y);
    if (dd < best) best = dd;
  }
  return best;
}

/** 某一側是否已經接戰（有任一對單位進入 `STRATEGY_ENGAGE_RANGE`） */
export function sideEngaged(world: World, side: Side): boolean {
  for (const u of world.units) {
    if (!u.alive || u.side !== side) continue;
    if (nearestFoeDist(world, u) <= STRATEGY_ENGAGE_RANGE) return true;
  }
  return false;
}

/**
 * 世界狀態 → 一條策略指令。**純函數**：不寫 world，只讀。
 *
 * 閘的順序照 `0x44D450`：
 *  1. 戰鬥已結束 → 不派發；
 *  2. 這側沒有軍師技 / 已經派發過 → 不派發（原作一條軍師技只結算一次）；
 *  3. 觸發單位不在敵方 `STRATEGY_ENGAGE_RANGE` 內 → 不派發（= `0x44D3E0` 返回 0）。
 */
export function planStrategy(world: World, side: Side, unit: Unit): StrategyPick | null {
  if (!world || world.over) return null;
  const army = world.army?.[side];
  if (!army || army.used) return null;
  const seq = army.seq;
  if (seq == null) return null;
  if (!unit || !unit.alive || unit.side !== side) return null;
  const me = world.sides[side];
  const foeSide = other(side);
  const foeRt = world.sides[foeSide];
  const g = me.general;
  const fg = foeRt.general;
  if (!g.alive) return null;
  if (nearestFoeDist(world, unit) > STRATEGY_ENGAGE_RANGE) return null;

  const row = world.data.wises.find((w) => w.SEQUENCE === seq);
  if (!row) return null;
  const def = strategyDefOf(row.Execute);
  if (!def) return null;

  const ops: StrategyOp[] = [];
  let text = def.text;
  const args = [def.value];
  let sfx = 'wise';

  switch (def.kind) {
    case 'morale-down':
      // 原作改的是 `general+0x38`（武將士氣）；本作戰力吃 `sides[side].morale`（R41），
      // 所以兩份一起寫 —— 與 `settle()` 的雙寫約定一致。
      ops.push({ op: 'morale', side: foeSide, delta: -def.value });
      break;
    case 'morale-up':
      ops.push({ op: 'morale', side, delta: def.value });
      break;
    case 'scatter':
      // `0x43A0F6(side^1, buf)` 重排敵方陣形；本作沒有陣形網格，改成把敵兵打散 + 陣形歸 0。
      ops.push({ op: 'scatter', side: foeSide, r: def.value });
      ops.push({ op: 'formation', side: foeSide, value: 0 });
      break;
    case 'regroup':
      // `0x43A0F6(side, buf)` + `unit1+0x10 = 0`：把己方陣形緩衝區重寫，陣形號歸 0
      ops.push({ op: 'regroup', side });
      ops.push({ op: 'formation', side, value: 0 });
      break;
    case 'tire-enemy':
      // 原作 Execute 9/10/11（`0x44D717` 等）：`unit2+0x34 |= 0x1000` + `unit2+0x38 += 1/2/3`。
      // `+0x38` 是**戰後疲勞倍率檔**，不是疲勞點數（消費點 `0x41048D` → `0x4103DE`）。
      ops.push({ op: 'fatigue', side: foeSide, delta: def.value });
      break;
    case 'tire-relief':
      // Execute 12/13/14：同一組指令，目標換成自己、方向相反（−1/−2/−3）
      ops.push({ op: 'fatigue', side, delta: -def.value });
      break;
    case 'hp-up': {
      // d = trunc(maxHp(+0x10) × pct / 100)，同時加 +0x10 與 +0x12，再夾 hp ≤ maxHp
      const amount = Math.trunc((g.maxHp * def.value) / 100);
      ops.push({ op: 'hp', side, amount, growMax: true });
      args[0] = amount;
      break;
    }
    case 'mp-up': {
      const amount = Math.trunc((g.mpMax * def.value) / 100);
      ops.push({ op: 'mp', side, amount, growMax: true });
      args[0] = amount;
      break;
    }
    case 'atk-up':
      // `army+0x70 += v`；我們的 `powerOf` 是 150 + 各項加算，`+0x70` 就是那個和 ⇒ 直接加項
      ops.push({ op: 'atk', side, delta: def.value });
      break;
    case 'def-down':
      // 原文寫「我方士兵防禦力上昇」，實際改的是**敵方** `army+0x70 -= v`，照抄
      ops.push({ op: 'atk', side: foeSide, delta: -def.value });
      break;
    case 'chaos':
      ops.push({ op: 'atk', side, delta: def.value });
      ops.push({ op: 'atk', side: foeSide, delta: -def.value });
      args[0] = def.value;
      args[1] = def.value;
      break;
    case 'alienate':
      ops.push({ op: 'loyal', side: foeSide, delta: -def.value });
      break;
    case 'persuade': {
      // 原作閘：`0x40975E(foeGen) != 0`、`0x450117(3) != 0`、忠誠 > 0x5A、節操 > 5 都算失敗。
      // 只實現了「忠誠 > 90」「節操 > 5」兩道（另兩條是全局查詢，未定位）。[推測]
      const loyal = fg.loyal ?? 50;
      const constancy = fg.constancy ?? 0;
      if (!fg.alive || loyal > 90 || constancy > 5) {
        text = '策略失敗!!';
        ops.push({ op: 'note', text });
      } else {
        ops.push({ op: 'loyal', side: foeSide, delta: -15 });
        // `0x44DDE0..0x44DE3F`：失敗 4 條分支 + 成功 1 條，成功那條只有
        // `foeArmy+0x84 |= 0x400` + 訊息「說服敵將投靠我方」，**不動名單**。
        // 這裡把 0x400 與「戰後才處理」的標記一起寫在被勸降方身上。
        ops.push({ op: 'defect', side: foeSide });
        text = '說服敵將投靠我方';
      }
      args.length = 0;
      break;
    }
    case 'reserve':
      // 原作 `0x44DE44` 這條分支只有 `push 0x491900("成功")` + 消息欄，沒有任何狀態改動
      // （`work/dis_battle_B_44D450.txt:763`）——不造第 3 回合補兵。
      // 「3」是 SEQUENCE 3，不是回合數；真實效果在戰前選將流程（ATTRIB=1）：
      // 使用方在敵方之後選將/兵種（project/109 §5.3），落在戰役編成層的 5 將出陣隊列
      // （`deploy_queue.ts`，原作 Obj3 部隊池 docs/07b §6）。戰場內核沒有 5 個武將，
      // 所以這裡只立旗標 `army.chooseAfterFoe`，數值照舊不動（project/162）。
      ops.push({ op: 'afterfoe', side });
      ops.push({ op: 'note', text });
      break;
    case 'hp-regen':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.hpRegen });
      ops.push({ op: 'qiparam', side, value: def.value });
      break;
    case 'mp-regen':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.mpRegen });
      ops.push({ op: 'qiparam', side, value: def.value });
      break;
    case 'general-atk':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.generalAtk });
      ops.push({ op: 'generalatk', side, value: def.value });
      break;
    case 'ambush': {
      // `0x40918A(foeGen)`：敵將有馬 → 埋伏被破（原文「敵將騎%s，破解我方埋伏。」）
      const horse = horseOf(world.data, fg.name);
      if (horse) {
        text = `敵將騎${horse}，破解我方埋伏。`;
        ops.push({ op: 'note', text });
      } else {
        ops.push({ op: 'flag', side: foeSide, flag: ARMY_FLAG.noRetreat });
      }
      args.length = 0;
      break;
    }
    case 'feign-rout':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.mayRetreat });
      break;
    case 'guard-general':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.guardGeneral });
      ops.push({ op: 'guarded', side });
      break;
    case 'encircle':
      // own+0x68=3（包圍）、foe+0x68=2（被包圍）、unit1+0x10=2（陣形 2）
      ops.push({ op: 'posture', side, value: 3, moveMul: 1.15 });
      ops.push({ op: 'posture', side: foeSide, value: 2, moveMul: 0.9 });
      ops.push({ op: 'formation', side, value: 2 });
      break;
    case 'raid':
      // `0x44E183`：`mov [foeArmy+0x68], 4` —— 原作把「偷襲」寫在**敵方** army 上
      // （敵方被突襲 → 敵方進入被偷襲姿態）。舊實作寫成我方提速，方向反了（project/130 §6）。
      // 姿態 4 的移速意義沒有原作依據，`moveMul` 1/0.9 兩個值都是 [推測]：
      // 被偷襲的一方變慢 0.9，我方不因為「偷襲成功」自己提速（檔位在敵方）。
      ops.push({ op: 'posture', side: foeSide, value: 4, moveMul: 0.9 });
      break;
    case 'approach':
      ops.push({ op: 'posture', side, value: 1, moveMul: 1.1 });
      break;
    case 'qi-fast':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.qiSpeed });
      ops.push({ op: 'qitier', side, delta: def.value });
      args[0] = QI_TIER_PCT[def.value] ?? 0;
      break;
    case 'exp-up':
      ops.push({ op: 'exp', side, pct: def.value });
      args[0] = def.value;
      break;
    case 'flee-anytime':
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.fleeAnytime });
      break;
    case 'dispel':
      // 原作 `0x44E34C` 只有 `push 0x4916..` 一句日誌，取消動作在呼叫方（未定位）。
      // [推測] 落點：記一次「待取消」在被化解方身上，下一次派發 `runStrategy()` 兌現
      // ——事件照發、`ops` 全部不落地。見 `ArmyStatus.cancelPending`。
      ops.push({ op: 'cancel', side: foeSide, times: 1 });
      ops.push({ op: 'note', text });
      break;
    case 'foe-flee': {
      // `foeGeneral+0x44`（步兵）/`+0x48`（騎兵）各減 pct%，合計寫進日誌
      const inf = Math.trunc((foeRt.aliveInf * def.value) / 100);
      const cav = Math.trunc((foeRt.aliveCav * def.value) / 100);
      const count = inf + cav;
      ops.push({ op: 'desert', side: foeSide, count });
      args[0] = count;
      sfx = 'rout';
      break;
    }
    case 'qi-save':
      // `+0x84 |= 0x80`、`+0x88 = 66/50/25`（百分比）
      ops.push({ op: 'flag', side, flag: ARMY_FLAG.qiSave });
      ops.push({ op: 'qiparam', side, value: def.value });
      break;
    case 'seal-magic':
      ops.push({ op: 'flag', side: foeSide, flag: ARMY_FLAG.sealMagic });
      break;
    case 'qi-slow':
      ops.push({ op: 'flag', side: foeSide, flag: ARMY_FLAG.qiSpeed });
      ops.push({ op: 'qitier', side: foeSide, delta: -def.value });
      args[0] = QI_TIER_PCT[def.value] ?? 0;
      break;
  }

  return {
    side,
    seq,
    exec: def.exec,
    kind: def.kind,
    name: row.NAME,
    tier: row.WiseLevel,
    value: def.value,
    text: formatMsg(text, args),
    sfx,
    ops,
  };
}

/** 敵將的馬名（`0x4086D1(foeGen+0x99)`）；沒馬 / 沒檔案返回 null */
function horseOf(data: GameData, name: string): string | null {
  if (!name) return null;
  const row = data.generals.find((x) => x.NAME === name);
  const h = row?.Horse;
  return typeof h === 'string' && h.length > 0 ? h : null;
}

/**
 * 把一條策略落地：寫數值/狀態位、push `strategyEvents` 與 `log`、翻 `used`。
 * 這是唯一會改 world 的入口 —— `planStrategy` 保證純。
 */
export function runStrategy(world: World, pick: StrategyPick): StrategyEvent {
  const army = world.army[pick.side];
  // 化解（Execute 57）兌現點：被化解方下一次派發只發事件、`ops` 一條都不落地。
  // 原作 `0x44E34C` 這一支只有日誌（取消在呼叫方，未定位），所以「取消一次」是 [推測]。
  const cancelled = !!army && (army.cancelPending ?? 0) > 0;
  if (cancelled && army) army.cancelPending -= 1;
  if (!cancelled) for (const op of pick.ops) applyOp(world, op);
  if (army) {
    army.used = true;
    world.strategyUsed[pick.side] = pick.seq;
  }
  const text = cancelled ? `軍師策略被敵方化解（${pick.name}）` : pick.text;
  const ev: StrategyEvent = {
    tick: world.tick,
    side: pick.side,
    seq: pick.seq,
    exec: pick.exec,
    kind: pick.kind,
    name: pick.name,
    tier: pick.tier,
    value: pick.value,
    text,
    sfx: pick.sfx,
    ops: cancelled ? [] : pick.ops,
  };
  if (cancelled) ev.cancelled = true;
  world.strategyEvents.push(ev);
  world.log.push({
    tick: world.tick,
    kind: 'strategy',
    side: pick.side,
    text,
    sfx: pick.sfx,
    value: pick.value,
  });
  return ev;
}

function applyOp(world: World, op: StrategyOp): void {
  const rt = 'side' in op ? world.sides[op.side] : null;
  switch (op.op) {
    case 'morale': {
      if (!rt) return;
      rt.morale = clamp(rt.morale + op.delta, 0, 100);
      const g = rt.general;
      if (typeof g.morale === 'number' || op.delta > 0) g.morale = clamp((g.morale ?? rt.morale) + op.delta, 0, 100);
      return;
    }
    case 'tire': {
      if (!rt) return;
      const g = rt.general;
      g.tire = clamp((g.tire ?? 0) + op.delta, 0, 100);
      return;
    }
    case 'loyal': {
      if (!rt) return;
      const g = rt.general;
      g.loyal = clamp((g.loyal ?? 50) + op.delta, 0, 99);
      return;
    }
    case 'hp': {
      if (!rt) return;
      const g = rt.general;
      if (op.growMax) g.maxHp += op.amount;
      g.hp = Math.min(g.maxHp, g.hp + op.amount);
      return;
    }
    case 'mp': {
      if (!rt) return;
      const g = rt.general;
      if (op.growMax) g.mpMax += op.amount;
      g.mp = Math.min(g.mpMax, g.mp + op.amount);
      return;
    }
    case 'atk': {
      const army = world.army[op.side];
      if (army) army.atkMod += op.delta;
      return;
    }
    case 'flag': {
      const army = world.army[op.side];
      if (army) army.flags |= op.flag;
      return;
    }
    case 'posture': {
      const army = world.army[op.side];
      if (!army) return;
      army.posture = op.value;
      army.moveMul = op.moveMul;
      return;
    }
    case 'qiparam': {
      const army = world.army[op.side];
      if (!army) return;
      army.qiParam = op.value;
      // 恢復體力／恢復技力 复用 `+0x88` 这个字段（原作就是同一个 0x88）：flag 已先落地，这里按 flag 分流
      if (army.flags & ARMY_FLAG.hpRegen) army.hpRegen = op.value;
      if (army.flags & ARMY_FLAG.mpRegen) army.mpRegen = op.value;
      return;
    }
    case 'qitier': {
      const army = world.army[op.side];
      if (army) army.qiTier = clamp(army.qiTier + op.delta, -3, 3);
      return;
    }
    case 'generalatk': {
      const army = world.army[op.side];
      if (army) army.generalAtk = op.value;
      return;
    }
    case 'exp': {
      const army = world.army[op.side];
      if (army) army.expPct = op.pct;
      return;
    }
    case 'formation': {
      if (!rt) return;
      rt.formation = op.value;
      return;
    }
    case 'guarded': {
      const army = world.army[op.side];
      if (army) army.takenMul = 0.75;
      return;
    }
    case 'scatter': {
      if (!rt) return;
      for (const u of world.units) {
        if (!u.alive || u.side !== op.side || u.isGeneral) continue;
        u.x = clamp(u.x + (world.rng() - 0.5) * 2 * op.r, 0.2, GRID_W - 1.2);
        u.y = clamp(u.y + (world.rng() - 0.5) * 2 * op.r, 0.2, GRID_H - 1.2);
      }
      return;
    }
    case 'regroup': {
      if (!rt) return;
      // 把己方兵收回後陣一列（A 在 +x 側、B 在 −x 側），齊到主將前面
      const own = world.units.filter((u) => u.side === op.side && u.alive && !u.isGeneral);
      if (own.length === 0) return;
      const rear = own.reduce((acc, u) => (op.side === 'A' ? Math.max(acc, u.x) : Math.min(acc, u.x)), own[0]!.x);
      const x = clamp(rear + (op.side === 'A' ? -2 : 2), 0.2, GRID_W - 1.2);
      own.forEach((u, i) => {
        u.x = clamp(x + (op.side === 'A' ? 1 : -1) * Math.floor(i / 14) * 0.6, 0.2, GRID_W - 1.2);
        u.y = clamp(0.6 + (i % 14) * 0.95, 0.2, GRID_H - 1.2);
      });
      return;
    }
    case 'desert': {
      // 「逃走」不是陣亡：直接從 units 移除，不置 alive=false（否則會進 killsInf/killsCav）
      let left = Math.max(0, Math.round(op.count));
      for (let i = world.units.length - 1; i >= 0 && left > 0; i--) {
        const u = world.units[i]!;
        if (!u.alive || u.side !== op.side || u.isGeneral || u.flee) continue;
        world.units.splice(i, 1);
        left--;
      }
      return;
    }
    case 'note':
      return;
    case 'afterfoe': {
      // 後選出陣（Execute 34）：原作 `0x44DE44` 零狀態寫入，效果全在戰前編成 —— 這裡只把
      // 「本側在敵方之後選將」的旗標立起來，`deploy_queue.ts:chooseAfterFoe()` / 編成頁消費。
      const army = world.army[op.side];
      if (army) army.chooseAfterFoe = true;
      return;
    }
    case 'fatigue': {
      // Execute 9-14：`army+0x34 |= 0x1000`（狀態位）+ `army+0x38 += delta`（倍率檔）。
      // 不改 `general.tire`：原作這 6 條分支一次都沒碰 `general+0x3A`（見 b3 的指令級摘錄）。
      const army = world.army[op.side];
      if (!army) return;
      army.flags |= ARMY_FLAG.fatigue;
      army.fatigueIdx += Math.trunc(op.delta);
      return;
    }
    case 'cancel': {
      // Execute 57 的 [推測] 落點：給被化解方記一次「待取消」，`runStrategy()` 減一。
      const army = world.army[op.side];
      if (!army) return;
      army.cancelPending += Math.max(1, Math.trunc(op.times ?? 1));
      return;
    }
    case 'defect': {
      // 勸降成功（`foeArmy+0x84 |= 0x400`）：`flags` 是原作狀態位，`defectPending` 是本作
      // 的「戰後才處理」顯式標記（`settle()` 讀，`roster.applyPostBattle()` 落名單）。
      const army = world.army[op.side];
      if (!army) return;
      army.flags |= ARMY_FLAG.defect;
      army.defectPending = true;
      return;
    }
  }
}

/**
 * `step()` 每 tick 調：兩側各自在「首次接戰」那一 tick 派發一次軍師技。
 * 之所以不是在 `createWorld` 裡直接結算：原作 `0x44D450` 的閘 `0x44D3E0` 要求有合法目標，
 * 所以派發發生在「有敵人在視野內」的時刻，而不是開局第 0 tick。[推測]
 */
export function tickStrategy(world: World): void {
  if (world.over) return;
  for (const side of ['A', 'B'] as const) {
    const army = world.army[side];
    if (!army || army.used || army.seq == null) continue;
    if (!world.sides[side].general.alive) continue;
    if (!sideEngaged(world, side)) continue;
    for (const u of world.units) {
      if (!u.alive || u.side !== side) continue;
      const pick = planStrategy(world, side, u);
      if (pick) {
        runStrategy(world, pick);
        break;
      }
    }
  }
}

/**
 * 依武將的 `WISESKILL`（`[學習等級, 軍師技 SEQUENCE]`）挑一條本場可用的軍師技。
 *
 * 原作由玩家在軍師技面板選（`docs/04b §4.3`），AI 側沒有面板 ⇒ 這裡按「當前等級已解鎖、
 * `WiseLevel <= 等級`、檔次最高」自動選。[推測]
 */
export function pickStrategySeq(data: GameData, name: string | undefined, level: number): number | null {
  if (!data || !name) return null;
  const row = data.generals.find((x) => x.NAME === name);
  if (!row) return null;
  const bySeq = new Map(data.wises.map((w) => [w.SEQUENCE, w] as const));
  const lv = Math.max(1, Math.floor(level || 1));
  let best: { seq: number; tier: number; learn: number } | null = null;
  for (const [learn, seq] of parseWiseSkill(row)) {
    if (learn > lv) continue;
    const w = bySeq.get(seq);
    if (!w) continue;
    if (w.WiseLevel > lv) continue;
    if (!best || w.WiseLevel > best.tier || (w.WiseLevel === best.tier && learn > best.learn)) {
      best = { seq, tier: w.WiseLevel, learn };
    }
  }
  return best ? best.seq : null;
}

// ---------------------------------------------------------------------------
// 四、援軍
// ---------------------------------------------------------------------------

/**
 * 援軍配置（`CreateOptions.reinforce` 的元素）。
 *
 * ## 原作依據與它的缺口
 *
 * `docs/04b3:485-490`：`0x4A8A20`/`0x4A8A24` 是「可選第二戰場/援軍」的兩個 army 指針，
 * 戰鬥初始化時被清 0（`0x446B23/0x446B2D`，`work/dis_battle_units2.txt:4335-4336`），
 * 主循環 `0x447CD2` 在兩者都非空時走一支分支：`0x447516`（**空函數**）→ `0x443CEB`
 * → `0x447424` → HUD 提示。也就是說：原作**有**「第二支軍隊」的數據位，
 * 但**沒有**「按行軍距離 N tick 抵達」的證據。
 *
 * 所以「何時來、來多少」按任務書的 fallback 實現，全部標 `[推測]`：
 *  - 觸發：守方存活兵力 ≤ 開局 × `triggerRatio`（默認 0.5）；
 *  - 兵數：鄰城**預備兵**（`garrison.json` / `scenarios.json` 的 `garrison`，`garrison.ts:314`）
 *    調出 25%，夾 30..200 —— 不是寫死的 100；
 *  - 延時：兩城 `POS`（地圖像素）距離 / 120 = 「城距」，每城距 120 tick（= 2 秒 @60Hz，R192）；
 *  - 入場：己方後排外側（A 在 +x、B 在 −x），全步兵（數據裡沒給援軍兵種）。
 */
export interface ReinforceConfig {
  side: Side;
  /** 直接指定兵數（最高優先）；不給就從鄰城預備兵算 */
  troops?: number;
  /** 本方城名（`scenarios.json` 的城名），用來算距離 */
  city?: string;
  /** 鄰城/援軍來源城名 */
  from?: string;
  /** 劇本 id（`scenarios.json` 的 `id`），默認第一個 */
  scenario?: number;
  /** 城距（步），不給就從 `city`/`from` 的 POS 算 */
  distance?: number;
  /** 直接指定延時（tick），最高優先 */
  delayTicks?: number;
  /** 觸發閾值：本側存活 ≤ 開局 × 這個比例 */
  triggerRatio?: number;
}

export interface ReinforceGroup {
  side: Side;
  /** 援軍總兵數（入場前就已知） */
  troops: number;
  /** 預計入場 tick（未排程時為 −1） */
  arriveTick: number;
  /** 已入場的單位（入場前是空數組） */
  units: Unit[];
  from?: string;
  /** 城距（步） */
  distance?: number;
  arrived: boolean;
  scheduled: boolean;
  triggerRatio: number;
  /** 顯式延時（tick）；不給就按城距算 */
  delayTicks?: number;
  /** 兵數是怎麼來的（寫進報告/日誌，避免「寫死 100」的嫌疑） */
  basis: string;
}

/** 地圖像素 → 城距步數的折算 [推測] */
export const REINFORCE_MAP_PX_PER_STEP = 120;
/** 每城距耗時（tick） [推測] = 2 秒 @ `TICK_HZ=60` ⇒ 120 tick（不能 import battle.ts，见 REGEN_PERIOD_TICKS） */
export const REINFORCE_TICKS_PER_STEP = 120;
/** 援軍兵數上限（`docs/04b1`：帶兵上限 100 步 + 100 騎 = 200） */
export const REINFORCE_TROOP_CAP = 200;

function scenarioOf(data: GameData, id: number | undefined): { cities?: Array<Record<string, unknown>> } | undefined {
  const list = data.scenarios as unknown as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(list)) return undefined;
  if (id === undefined) return list[0] as { cities?: Array<Record<string, unknown>> } | undefined;
  return (list.find((s) => Number(s.id) === id) ?? list[0]) as { cities?: Array<Record<string, unknown>> } | undefined;
}

function cityRow(data: GameData, id: number | undefined, name: string): Record<string, unknown> | null {
  const sc = scenarioOf(data, id);
  const cities = sc?.cities;
  if (!Array.isArray(cities)) return null;
  return (cities.find((c) => String(c.NAME ?? '') === name) ?? null) as Record<string, unknown> | null;
}

function cityPos(data: GameData, id: number | undefined, name: string): [number, number] | null {
  const row = cityRow(data, id, name);
  const pos = row?.POS;
  if (!Array.isArray(pos) || pos.length < 2) return null;
  const x = Number(pos[0]);
  const y = Number(pos[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

/**
 * 算一組援軍的兵數。優先序：
 *  1. 顯式 `troops`；
 *  2. 鄰城預備兵 × 25%（`garrisonOf` 的 `garrison`，夾 30..200）；
 *  3. 兜底：本側開局兵力 × 30%（夾 10..200）。
 */
export function reinforceTroopsOf(data: GameData, cfg: ReinforceConfig, ownSoldiers: number): { troops: number; basis: string } {
  if (typeof cfg.troops === 'number' && Number.isFinite(cfg.troops) && cfg.troops > 0) {
    return { troops: clamp(Math.round(cfg.troops), 1, REINFORCE_TROOP_CAP), basis: 'given' };
  }
  const scId = cfg.scenario;
  const fromName = cfg.from ?? cfg.city;
  if (fromName) {
    const g = garrisonOf(data, scId ?? Number((data.scenarios as unknown as Array<Record<string, unknown>>)?.[0]?.id ?? 1), fromName);
    if (g && g.garrison > 0) {
      const troops = clamp(Math.round(g.garrison * 0.25), 30, REINFORCE_TROOP_CAP);
      return { troops, basis: `reserve:${fromName} 預備兵 ${g.garrison}×25%` };
    }
  }
  return { troops: clamp(Math.round(ownSoldiers * 0.3), 10, REINFORCE_TROOP_CAP), basis: 'own:開局兵力×30%' };
}

/** 城距（步）：兩城 POS 的歐氏距離 / 120，至少 1 步 */
export function reinforceDistanceOf(data: GameData, cfg: ReinforceConfig): number | undefined {
  if (typeof cfg.distance === 'number' && Number.isFinite(cfg.distance) && cfg.distance > 0) return cfg.distance;
  if (!cfg.city || !cfg.from) return undefined;
  const a = cityPos(data, cfg.scenario, cfg.city);
  const b = cityPos(data, cfg.scenario, cfg.from);
  if (!a || !b) return undefined;
  return Math.max(1, Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) / REINFORCE_MAP_PX_PER_STEP));
}

/**
 * `createWorld()` 調：把配置折成 `world.reinforce` 的待命組（還沒排程、還沒入場）。
 * 兵數/距離都在這裡定下來，方便測試與冒煙直接看。
 */
export function planReinforceGroups(world: World, cfgs: ReinforceConfig[] | undefined): ReinforceGroup[] {
  if (!Array.isArray(cfgs) || cfgs.length === 0) return [];
  const out: ReinforceGroup[] = [];
  for (const cfg of cfgs) {
    if (!cfg || (cfg.side !== 'A' && cfg.side !== 'B')) continue;
    const rt = world.sides[cfg.side];
    const { troops, basis } = reinforceTroopsOf(world.data, cfg, rt.start);
    out.push({
      side: cfg.side,
      troops,
      arriveTick: -1,
      units: [],
      ...(cfg.from ? { from: cfg.from } : {}),
      ...(reinforceDistanceOf(world.data, cfg) !== undefined ? { distance: reinforceDistanceOf(world.data, cfg) } : {}),
      arrived: false,
      scheduled: false,
      triggerRatio: clamp(cfg.triggerRatio ?? 0.5, 0.01, 1),
      ...(typeof cfg.delayTicks === 'number' && Number.isFinite(cfg.delayTicks)
        ? { delayTicks: Math.max(0, Math.round(cfg.delayTicks)) }
        : {}),
      basis,
    });
  }
  return out;
}

/**
 * 排程延時：顯式 tick > 城距 × `REINFORCE_TICKS_PER_STEP`(120) > 默認 2 步 = 240 tick；
 * 夾 60..600（= 1–10 秒 @60Hz；旧值 30..300 是 30 Hz 下的同一区间）。
 */
function reinforceDelayOf(g: ReinforceGroup, cfgDelay?: number): number {
  if (typeof cfgDelay === 'number' && Number.isFinite(cfgDelay) && cfgDelay >= 0) return Math.round(cfgDelay);
  const steps = g.distance && g.distance > 0 ? g.distance : 2;
  return clamp(Math.round(steps * REINFORCE_TICKS_PER_STEP), 60, 600);
}

/**
 * `step()` 每 tick 調：先看要不要「出發」，再看有沒有到點要「入場」。
 *
 * 狀態機在 `world.reinforce` 上：`scheduled=false → true`（已出發、有 `arriveTick`）
 * `→ arrived=true`（單位已進場）。全部靠這兩個布爾，測試可以只讀數組斷言。
 */
export function tickReinforce(world: World, delays?: Array<number | undefined>): void {
  if (world.over) return;
  const list = world.reinforce;
  if (!Array.isArray(list) || list.length === 0) return;
  for (let i = 0; i < list.length; i++) {
    const g = list[i]!;
    if (g.arrived) continue;
    if (!g.scheduled) {
      const rt = world.sides[g.side];
      if (!rt.general.alive) continue;
      if (rt.start <= 0) continue;
      // 守方戰力低於閾值才叫援軍（任務書 fallback）
      if (rt.aliveCount > rt.start * g.triggerRatio) continue;
      g.scheduled = true;
      g.arriveTick = world.tick + reinforceDelayOf(g, delays?.[i] ?? g.delayTicks);
      world.log.push({
        tick: world.tick,
        kind: 'reinforce',
        side: g.side,
        text: `援軍自${g.from ?? '鄰城'}出發，${Math.max(0, g.arriveTick - world.tick)} 刻後抵達（${g.troops} 人）`,
        sfx: 'march',
        value: g.troops,
      });
      continue;
    }
    if (world.tick < g.arriveTick) continue;
    spawnReinforce(world, g);
  }
}

/** 入場：己方後排外側一列一列擺開，同步 `start/soldiers/aliveCount`（同 `wises.addRearUnits` 的不變式） */
function spawnReinforce(world: World, g: ReinforceGroup): void {
  const rt = world.sides[g.side];
  const own = world.units.filter((u) => u.side === g.side && !u.isGeneral);
  const rear = own.length > 0
    ? own.reduce((acc, u) => (g.side === 'A' ? Math.max(acc, u.x) : Math.min(acc, u.x)), own[0]!.x)
    : g.side === 'A' ? GRID_W - 6 : 6;
  const x = clamp(rear + (g.side === 'A' ? 2.5 : -2.5), 0.2, GRID_W - 1.2);
  const n = Math.max(0, Math.round(g.troops));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 12);
    const y = clamp(6.5 + ((i % 12) - 5.5) * 0.55, 0.2, GRID_H - 1.2);
    const ux = clamp(x + (g.side === 'A' ? row * 0.55 : -row * 0.55), 0.2, GRID_W - 1.2);
    const unit: Unit = { side: g.side, x: ux, y, prevX: ux, prevY: y, alive: true, cd: 0, kind: 'infantry' };
    world.units.push(unit);
    g.units.push(unit);
  }
  g.arrived = true;
  // `start` 一起加：`GENERAL_BREAK`（主將前出）與戰功都靠 `start` 這個「開局數」
  rt.soldiers += n;
  rt.start += n;
  rt.aliveCount += n;
  world.log.push({
    tick: world.tick,
    kind: 'reinforce',
    side: g.side,
    text: `援軍抵達！${g.from ?? '鄰城'} 兵 ${n} 人入場`,
    sfx: 'rally',
    value: n,
  });
}
