/**
 * 軍師技（原作 WISE 表 67 條，`data/wises.json`）。
 *
 * 原作裡軍師技是「出征前由軍師發動、作用到整場戰鬥」的一次性效果：它不消耗戰場上的
 * 技力/氣力，而是在兩軍接觸前就把數值寫進主將或士兵（docs/04b §4.3：`unit+0x34`
 * 位掩碼 + `unit+0x38` 數值，結算時逐個 if 判定）。所以這裡的 `apply()` 全部是
 * 「進戰鬥前改一次數值」，不在每 tick 的主循環裡跑。
 *
 * ── 分類表（67 條 = 54 條本表 + 12 條戰中派發 + 1 條真佔位）──────────────────
 *
 * wises.json 只有 SEQUENCE / Execute / WiseLevel / NAME / ATTRIB / Level / ACTIVE，
 * 沒有強度字段（沒有 Rate）。可用的語義只有三個：
 *   · NAME      —— 效果的中文名（最可靠，下面按它歸類）
 *   · WiseLevel —— 同名的三檔（1/2/3）；獨有技為 0。數值強度按這檔給固定增量
 *   · Execute   —— 原作的分支代碼；同名的三檔只是 Execute 不同（4/5/6 …），
 *                  說明它們共用一個效果函數、只是參數不同，正好印證按 NAME 歸類
 *   · ATTRIB    —— 戰前選擇/化解/站位三類特殊技（1/2/3），本作沒有對應機制
 *   · Level     —— 120..490，隨 SEQUENCE 單調遞增；原作裡查不到用途，本實現不用
 * 強度：原表沒有百分數/增量字段，`docs/04b` 也只給了位掩碼不含數值，所以每一檔的
 * 具體增量是本作定的量級（見下表「值」），並在測試裡釘死，改動要同步改測試。
 *
 *  kind          影響                        SEQUENCE（名字 · 三檔值）              消費點
 *  ───────────── ─────────────────────────── ─────────────────────────────────────── ──────────
 *  mp      技力   主將技力上限 / 當前技力     13,42,60 增加技力 12/20/30（上限+補满同額）
 *                                            12,41,58 恢復技力 24/40/60            applySpec
 *  hp      體力   主將體力上限 / 當前體力     14,43,61 增加體力 15/25/40（上限+補满同額）
 *                                            11,40,57 恢復體力 24/40/60            applySpec
 *  morale_up  士氣 我軍士氣 +5/8/12            1,18,38 鼓舞士氣                       powerOf
 *  morale_down 士氣 敵軍士氣 −5/8/12（降敵士氣）2,19,39 降敵士氣 · 20,48,66 喝阻敵軍 −4/6/9  powerOf
 *  qi_up   氣力   集氣速度 +25/40/60%          9,37,52 快速集氣                       tickSkills
 *                 技能氣力消耗 −20/30/45%      8,36,56 保留氣力                       qiCostMul
 *  qi_down 氣力   敵軍集氣速度 −25/40/60%      7,35,53 減緩集氣                       tickSkills
 *  troop_atk 兵   我軍士兵攻擊 +10/20/30 點     17,46,64 增強攻擊（exec 21-23）        powerOf
 *                 敵軍士兵攻擊 −10/20/30 點     16,45,63 強化士兵（exec 24-26）        powerOf
 *  general_up 將  主將武力 +4/7/10             22,49,67 強化武將                       hitChance（讀 str）
 *  exp_up  經驗   戰後經驗 +15/25/40%          21,47,65 增加經驗                       settle
 *  ambush  伏兵   我方後排追加 6 名伏兵         54 十面埋伏（WiseLevel 0，獨有）        applySpec
 *  ── R84 新增 4 類（消費點本來就有，缺的只是「往字段寫」這一步）──────────────────
 *  tire    疲勞   敵將疲勞 +5/10/15             4,25,51 擾亂敵將（Execute 9/10/11）
 *                 我軍疲勞 −5/10/15             5,27,50 減少疲勞（Execute 12/13/14）  settle:2065
 *  loyal   忠誠   敵將忠誠 −8/15/25             6,34,55 離間計（Execute 30/31/32）    settle:2062
 *                 勸降：忠誠 −15（帶閘）        32（Execute 33；loyalty>90 或 CONSTANCY>5 失敗）
 *  dispel  化解   清掉敵方尚未派發的 `army.seq`  24 化解計策（Execute 57）            strategy:779
 *
 *  R84 三分法（67 = 55 + 12 + 0，測試釘住；R94 把最後一條佔位落地）：
 *    · 55 條登記在上表（43 條原有 + 11 條 R84 第二批：4,5,6,24,25,27,32,34,50,51,55
 *      + R94 的 3 後選出陣，`kind: deploy` / `op: choose_after_foe`）。
 *    · 12 條**只在戰中派發器生效**（`WISE_STRATEGY_ONLY`）：10 詐敗 / 15,44,62 混亂敵軍 /
 *      23 逼近敵軍 / 26 包圍敵軍 / 28 亂陣 / 29 太公陣 / 30 偷襲敵軍 / 31 保護主將 /
 *      33 金蟬脫殼 / 59 封武將技。它們寫 `army.atkMod / moveMul / takenMul / flags /
 *      formation`，`strategy.ts:runStrategy()` 已在寫，`battle.ts` 也有現成消費點
 *      （atkMod:1233 · moveMul:1407 · takenMul:1461 · noRetreat:1582 · mayRetreat/
 *      fleeAnytime:1607 · sealMagic:1762）。在本表重複登記 = 出征頁一次 + 戰中一次 = 雙倍。
 *    · 0 條佔位（`WISE_SYSO_UNSUPPORTED` 已清空）。最後一條 `3 後選出陣`（Execute 34）
 *      的 `0x44DE44` 同樣只有 `push 0x491900("成功")` + 消息欄 + 函數尾、零狀態寫入
 *      （`work/dis_battle_B_44D450.txt:763`）；但 `ATTRIB=1` 是戰前選擇
 *      （`docs/03a-武将技表MAGIC.md:297`），真實語義是「使用方在敵方之後選將/兵種」
 *      （`project/109` §5.3），落在**戰役編成層**的 5 將出陣隊列
 *      （`deploy_queue.ts`，原作 Obj3 部隊池 `docs/07b` §6），不是戰鬥內第 3 回合補兵。
 *      R94 的落地方式：戰前 `applyWise()` 只立 `army.chooseAfterFoe`，數值仍不動；
 *      重排由編成頁用同一份 `deploy_queue.ts` 完成（`project/162`）。
 *
 *  舊版這裡寫「24 條 unimplemented = World 沒有字段」，R84 逐條盤完是錯的：其中 21 條的
 *  消費點早就存在（`general.tire` / `general.loyal` / `army.*`）。全表見
 *  `project/94_軍師技補全.md`。
 *
 * ── 兩種生效方式 ────────────────────────────────────────────────────────
 *  live：直接改 `world.sides[side].general.*` / `morale` / `units`，battle.ts 每 tick
 *        實時讀這些字段（hitChance 讀 general.str、powerOf 讀 morale、units 現算
 *        aliveCount），所以下一 tick 就生效。
 *  mod ：不改數值，累積到 `world.wises = [{ side, kind, value, seq }]` 側表，由 battle.ts
 *        的 4 個消費點各消費一次。**量綱按通道分，不是同一個口徑**：
 *          · `troop_atk` 是**點**：`powerOf = base + wiseBonus(...,'troop_atk')`
 *            （原作 `0x44D450` exec 21-26 直接 `army+0x70 += v`；`0x442EFA` 無乘數）
 *          · `qi_regen` 是**百分比**：`qiRegenOf(g) * (1 + bonus/100)`
 *          · `qi_cost`  是**百分比**：`1 + bonus/100`（值是負數）
 *          · `exp_bonus` 是**百分比**：`expBase * (1 + bonus/100)`
 *        後三個在原作有乘算證據（`0x43E72E` 跳表 130/150/200/76/66/50%、`0x4103DE`
 *        真百分比、`unit+0x3C` 經驗倍率），所以同一批 MOD 裡 3 條乘算、1 條加法
 *        不是不一致，是原作如此。詳見 `project/109_加法口径与Execute34.md`。
 *        測試見 `game/tests/wises.test.ts` 的「R69 消費點」段（逐條量測 delta）。
 *        `applyWiseOnBattleStart` 是給 campaign 的一次性入口：戰前按武將 WISESKILL
 *        自動替 AI 側挑一條（玩家側由出征頁自己挑）。
 *
 * ── 為什麼不給 World 加字段 ──────────────────────────────────────────────
 * `World` 在 battle.ts 裡，改它會和另一個 agent 撞車。這裡用 `World & { wises?: … }`
 * 的類型斷言掛側表，battle.ts 不認識這個字段也不影響它跑。
 */
import { GRID_H, GRID_W } from './battle.ts';
import type { Side, Unit, World } from './battle.ts';
import type { GameData, General } from '../types.ts';
import { applyExtraSpec, WISE_EXTRA_SPECS, WISE_STRATEGY_HINTS } from './wises_effects.ts';
import { DEPLOY_FIELD_SLOTS } from './deploy_queue.ts';
export {
  WISE_EXTRA_SPECS,
  WISE_STRATEGY_HINTS,
  WISE_STRATEGY_ONLY,
  WISE_SYSO_UNSUPPORTED,
} from './wises_effects.ts';

// ---------------------------------------------------------------------------
// 分類
// ---------------------------------------------------------------------------

/** 14 類可實現效果（13 條原有 + R94 的 `deploy` 後選出陣）。 */
export type WiseKind =
  | 'mp'
  | 'hp'
  | 'morale_up'
  | 'morale_down'
  | 'qi_up'
  | 'qi_down'
  | 'troop_atk'
  | 'general_up'
  | 'exp_up'
  | 'ambush'
  | 'tire'
  | 'loyal'
  | 'dispel'
  /** 編成/出陣順序類：目前只有 3 後選出陣（戰前選擇，不改戰場數值） */
  | 'deploy';

export const WISE_KIND_LABEL: Record<WiseKind, string> = {
  mp: '技力',
  hp: '體力',
  morale_up: '士氣上升',
  morale_down: '士氣下降',
  qi_up: '氣力',
  qi_down: '減緩集氣',
  troop_atk: '士兵攻擊',
  general_up: '武將強化',
  exp_up: '經驗增加',
  ambush: '伏兵',
  tire: '疲勞',
  loyal: '敵將忠誠',
  dispel: '化解計策',
  deploy: '出陣順序',
};

/** `world.wises` 的通道名。量綱：`troop_atk` = 點（加到 150 起算的戰力和），其餘 = 百分比。 */
export type WiseChannel = 'qi_regen' | 'qi_cost' | 'troop_atk' | 'exp_bonus';

type Spec = {
  kind: WiseKind;
  /** self = 我方，enemy = 敵方 */
  target: 'self' | 'enemy';
  op:
    | 'mp_max'
    | 'mp_restore'
    | 'hp_max'
    | 'hp_restore'
    | 'morale_add'
    | 'morale_sub'
    | 'str_add'
    | 'mod'
    | 'units'
    /**
     * 疲勞倍率檔（Execute 9/10/11/12/13/14）：`value` 是 `army+0x38` 的加減量（±1/±2/±3），
     * 不是疲勞點數。`wises_effects.ts` 寫進 `army.fatigueIdx`，戰後由 `settle()` 的
     * `fatigueMul()` 換成 30..250% 的倍率再落到 `general.tire`。
     */
    | 'tire'
    | 'loyal'
    | 'persuade'
    | 'dispel'
    | 'hp_regen'
    | 'mp_regen'
    | 'no_retreat'
    /**
     * 後選出陣（Execute 34）：不寫任何數值，只把「本側在敵方之後選將」的旗標
     * `army.chooseAfterFoe` 立起來，由 `deploy_queue.ts` / 編成頁在開戰前消費。
     * `value` = 可重排的上陣槽數（原作 5 槽裡前 3 槽）。
     */
    | 'choose_after_foe';
  value: number;
  channel?: WiseChannel;
  /** 給 UI / 消息欄用的短句（≤ 20 字） */
  note: string;
};

/** 每條已實現軍師技的規格（R94 後 55 條）。鍵 = wises.json 的 SEQUENCE。 */
export type WiseSpec = Spec;

const SPECS: Record<number, Spec> = {
  // 後選出陣（Execute 34）：`0x44DE44` 只有一句「成功」日誌、零狀態寫入，但 `ATTRIB=1`
  // 是戰前選擇 —— 真實效果是「使用方在敵方之後選將/兵種」（project/109 §5.3），落在
  // 戰役編成層的 5 將出陣隊列（`deploy_queue.ts`；原作 Obj3 部隊池 docs/07b §6）。
  // 戰前只立 `army.chooseAfterFoe`，戰場數值一律不動；value = 可重排的上陣槽數（前 3 槽）。
  3: {
    kind: 'deploy',
    target: 'self',
    op: 'choose_after_foe',
    value: DEPLOY_FIELD_SLOTS,
    note: '敵方之後選將：可重排前 3 個上陣槽',
  },
  // 增加技力：上限與當前技力一起加
  13: { kind: 'mp', target: 'self', op: 'mp_max', value: 12, note: '技力上限 +12' },
  42: { kind: 'mp', target: 'self', op: 'mp_max', value: 20, note: '技力上限 +20' },
  60: { kind: 'mp', target: 'self', op: 'mp_max', value: 30, note: '技力上限 +30' },
  // 恢復技力：原作 exec 38-40 是「戰鬥中每 N 幀回 +0x88 點」的持續回復（旗標 0x2），
  // 不是瞬回 —— 舊實作的 `mp_restore 24/40/60` 在滿技力開戰時等於沒寫（probe 證實）。
  12: { kind: 'mp', target: 'self', op: 'mp_regen', value: 30, note: '戰中技力持續回復 +30' },
  41: { kind: 'mp', target: 'self', op: 'mp_regen', value: 50, note: '戰中技力持續回復 +50' },
  58: { kind: 'mp', target: 'self', op: 'mp_regen', value: 70, note: '戰中技力持續回復 +70' },
  // 增加體力：上限與當前體力一起加
  14: { kind: 'hp', target: 'self', op: 'hp_max', value: 15, note: '體力上限 +15' },
  43: { kind: 'hp', target: 'self', op: 'hp_max', value: 25, note: '體力上限 +25' },
  61: { kind: 'hp', target: 'self', op: 'hp_max', value: 40, note: '體力上限 +40' },
  // 恢復體力：原作 exec 35-37 是持續回復（旗標 0x1，參數 40/60/80），不是瞬回。
  11: { kind: 'hp', target: 'self', op: 'hp_regen', value: 40, note: '戰中體力持續回復 +40' },
  40: { kind: 'hp', target: 'self', op: 'hp_regen', value: 60, note: '戰中體力持續回復 +60' },
  57: { kind: 'hp', target: 'self', op: 'hp_regen', value: 80, note: '戰中體力持續回復 +80' },
  // 鼓舞士氣
  1: { kind: 'morale_up', target: 'self', op: 'morale_add', value: 5, note: '我軍士氣 +5' },
  18: { kind: 'morale_up', target: 'self', op: 'morale_add', value: 8, note: '我軍士氣 +8' },
  38: { kind: 'morale_up', target: 'self', op: 'morale_add', value: 12, note: '我軍士氣 +12' },
  // 降敵士氣
  2: { kind: 'morale_down', target: 'enemy', op: 'morale_sub', value: 5, note: '敵軍士氣 −5' },
  19: { kind: 'morale_down', target: 'enemy', op: 'morale_sub', value: 8, note: '敵軍士氣 −8' },
  39: { kind: 'morale_down', target: 'enemy', op: 'morale_sub', value: 12, note: '敵軍士氣 −12' },
  // 喝阻敵軍（同樣打在敵方士氣，幅度略低）
  20: { kind: 'morale_down', target: 'enemy', op: 'morale_sub', value: 4, note: '敵軍士氣 −4' },
  48: { kind: 'morale_down', target: 'enemy', op: 'morale_sub', value: 6, note: '敵軍士氣 −6' },
  66: { kind: 'morale_down', target: 'enemy', op: 'morale_sub', value: 9, note: '敵軍士氣 −9' },
  // 快速集氣
  9: { kind: 'qi_up', target: 'self', op: 'mod', channel: 'qi_regen', value: 25, note: '集氣速度 +25%' },
  37: { kind: 'qi_up', target: 'self', op: 'mod', channel: 'qi_regen', value: 40, note: '集氣速度 +40%' },
  52: { kind: 'qi_up', target: 'self', op: 'mod', channel: 'qi_regen', value: 60, note: '集氣速度 +60%' },
  // 保留氣力（原作：氣力保留 → 這裡按技能氣力消耗打折）
  8: { kind: 'qi_up', target: 'self', op: 'mod', channel: 'qi_cost', value: -20, note: '氣力消耗 −20%' },
  36: { kind: 'qi_up', target: 'self', op: 'mod', channel: 'qi_cost', value: -30, note: '氣力消耗 −30%' },
  56: { kind: 'qi_up', target: 'self', op: 'mod', channel: 'qi_cost', value: -45, note: '氣力消耗 −45%' },
  // 減緩集氣（打敵方）
  7: { kind: 'qi_down', target: 'enemy', op: 'mod', channel: 'qi_regen', value: -25, note: '敵軍集氣 −25%' },
  35: { kind: 'qi_down', target: 'enemy', op: 'mod', channel: 'qi_regen', value: -40, note: '敵軍集氣 −40%' },
  53: { kind: 'qi_down', target: 'enemy', op: 'mod', channel: 'qi_regen', value: -60, note: '敵軍集氣 −60%' },
  // 增強攻擊（Execute 21/22/23）：我方士兵攻擊 +10/+20/+30 點（`army+0x70 += v`）
  17: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 10, note: '士兵攻擊 +10' },
  46: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 20, note: '士兵攻擊 +20' },
  64: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 30, note: '士兵攻擊 +30' },
  // 強化士兵（Execute 24/25/26）：敵方士兵攻擊 −10/−20/−30 點（`foeArmy+0x70 -= v`）
  16: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -10, note: '敵軍士兵攻擊 −10' },
  45: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -20, note: '敵軍士兵攻擊 −20' },
  63: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -30, note: '敵軍士兵攻擊 −30' },
  // 強化武將
  22: { kind: 'general_up', target: 'self', op: 'str_add', value: 4, note: '主將武力 +4' },
  49: { kind: 'general_up', target: 'self', op: 'str_add', value: 7, note: '主將武力 +7' },
  67: { kind: 'general_up', target: 'self', op: 'str_add', value: 10, note: '主將武力 +10' },
  // 增加經驗
  21: { kind: 'exp_up', target: 'self', op: 'mod', channel: 'exp_bonus', value: 15, note: '戰後經驗 +15%' },
  47: { kind: 'exp_up', target: 'self', op: 'mod', channel: 'exp_bonus', value: 25, note: '戰後經驗 +25%' },
  65: { kind: 'exp_up', target: 'self', op: 'mod', channel: 'exp_bonus', value: 40, note: '戰後經驗 +40%' },
  // 十面埋伏（54）在 R88 移到 `WISE_EXTRA_SPECS`：原作 Execute 44 的效果是
  // 「敵方無法退兵」（`foeArmy+0x84 |= 4`），不是「我方後排 +6 兵」（舊實作無原作依據）。
};

// R84：第二批 11 條（疲勞/忠誠/勸降/化解）並進同一張表，讓 `wiseEffectOf` / `applyWise`
// 與第一批走完全相同的路徑。實現體在 `wises_effects.ts`（避免本檔膨脹 + 避免與
// strategy.ts 的 import 形成環）。
for (const [seq, spec] of Object.entries(WISE_EXTRA_SPECS)) SPECS[Number(seq)] = spec;

/**
 * 數據不足 / 本作沒有對應機制，**顯式佔位**（R94 後 0 條）。
 * R94 之前這裡是 13 條：其中 12 條不是「沒生效」——它們在戰中派發器
 * `strategy.ts:runStrategy()` 裡已落地，見 `WISE_STRATEGY_ONLY`；這裡不重複登記是為了
 * 不與派發器雙算。最後一條 `3 後選出陣` 本輪落地到戰役編成層
 * （`deploy_queue.ts`，見 `SPECS[3]` 與 `project/162`），所以表已清空；
 * 保留這個匯出是為了讓「67 = 55 + 12 + 0」仍可被測試釘住。
 */
export const WISE_UNIMPLEMENTED: readonly number[] = [
  10, 15, 23, 26, 28, 29, 30, 31, 33, 44, 59, 62,
];

/** 給測試/文檔看的唯讀視圖。 */
export const WISE_SPECS: Readonly<Record<number, Spec>> = SPECS;

// ---------------------------------------------------------------------------
// world.wises 側表
// ---------------------------------------------------------------------------

export interface WiseModifier {
  side: Side;
  kind: WiseChannel;
  /** `troop_atk` = 點（+10 = 戰力 +10）；其餘三個 = 百分比（+25 = +25%，−60 = −60%） */
  value: number;
  seq: number;
}

type WiseCarrier = World & { wises?: WiseModifier[] };

/** 這一局已經掛上的軍師技加成（可能為空）。 */
export function wiseModifiers(world: World): readonly WiseModifier[] {
  return (world as WiseCarrier).wises ?? [];
}

/**
 * 某一側某個通道的合計值。**量綱按通道分**：
 *   · `troop_atk` = 點：`powerOf` 直接 `base + wiseBonus(...)`
 *   · `qi_regen` / `qi_cost` / `exp_bonus` = 百分比：消費點各自 `/100`
 * 可疊加（同一側同一通道求和）。battle.ts 的 4 個消費點用它。
 */
export function wiseBonus(world: World, side: Side, channel: WiseChannel): number {
  let sum = 0;
  for (const m of wiseModifiers(world)) if (m.side === side && m.kind === channel) sum += m.value;
  return sum;
}

function pushModifier(world: World, side: Side, channel: WiseChannel, value: number, seq: number): void {
  const carrier = world as WiseCarrier;
  if (!carrier.wises) carrier.wises = [];
  carrier.wises.push({ side, kind: channel, value, seq });
}

// ---------------------------------------------------------------------------
// 效果對象
// ---------------------------------------------------------------------------

export interface WiseEffect {
  seq: number;
  name: string;
  kind: WiseKind;
  note: string;
  apply(world: World, side: Side): void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// 戰前生效紀錄（給 battle.ts 的「只結算一次」閘讀）
// ---------------------------------------------------------------------------

/**
 * 戰前 `applyWise` **真的改過狀態**的 seq（每側一份）。
 *
 * 為什麼需要：`main.js` 把出征頁選的 `?wise=` 同時傳給 `createWorld({strategy})`
 * 與 `applyWise()`（`game/web/main.js:613-615/631/678`），於是同一條軍師技會先走
 * 戰前效果、接戰後又被 `strategy.ts` 的派發器算一遍（例：離間計 L3 忠誠 −25 → −50）。
 * `battle.ts` 的 `step()` 在 `tickStrategy()` 前讀這份清單，把已生效的 seq 從
 * `army.seq` 摘掉 —— 每條技一場只結算一次，與 `0x44D450` 的「每側一次」一致。
 *
 * 只記「有觀測變化」的：滿血時的 `恢復體力`/`恢復技力`（11/40/57、12/41/58）戰前
 * 改了等於沒改，這些仍留給戰中派發器（原作 exec 35-40 本來就是戰鬥內持續回復）。
 */
const START_APPLIED = new WeakMap<World, Partial<Record<Side, number[]>>>();

/** 戰前效果的狀態指紋：只覆蓋 `applySpec` 會寫的字段（雙方都看，target 可能是敵方）。 */
function wiseFingerprint(world: World, side: Side): string {
  const foe: Side = side === 'A' ? 'B' : 'A';
  const gs = [world.sides[side].general, world.sides[foe].general];
  const mods = wiseModifiers(world);
  let modSum = 0;
  for (const m of mods) modSum = (modSum * 31 + m.value + m.kind.length * 7 + m.side.charCodeAt(0)) | 0;
  return [
    world.sides[side].morale,
    world.sides[foe].morale,
    world.units.length,
    mods.length,
    modSum,
    world.army?.[side]?.flags ?? 0,
    world.army?.[foe]?.flags ?? 0,
    world.army?.[foe]?.seq ?? -1,
    // R89：疲勞檔位 / 待取消的派發也算「狀態變化」（同一個 seq 第二次施放要能看到差量）
    world.army?.[side]?.fatigueIdx ?? 0,
    world.army?.[foe]?.fatigueIdx ?? 0,
    world.army?.[side]?.cancelPending ?? 0,
    world.army?.[foe]?.cancelPending ?? 0,
    // R94：後選出陣只立 `chooseAfterFoe`，這個旗標也算「狀態變化」（否則同一條技
    // 戰前生效後不會記進 START_APPLIED，`step()` 會讓派發器再打一次日誌）。
    world.army?.[side]?.chooseAfterFoe ? 1 : 0,
    ...gs.flatMap((g) => [
      g.hp,
      g.maxHp,
      g.mp,
      g.mpMax,
      g.str,
      Math.round(g.tire ?? 0),
      Math.round(g.loyal ?? -1),
    ]),
  ].join(',');
}

function recordStartApplied(world: World, side: Side, seq: number): void {
  const cur = START_APPLIED.get(world) ?? {};
  const list = cur[side] ?? (cur[side] = []);
  if (!list.includes(seq)) list.push(seq);
  START_APPLIED.set(world, cur);
}

/** 這一側戰前已真正生效的軍師技 seq（`battle.ts` 的 step 讀；空陣列 = 沒有）。 */
export function wiseAppliedAtStart(world: World, side: Side): readonly number[] {
  return START_APPLIED.get(world)?.[side] ?? [];
}


function applySpec(world: World, side: Side, seq: number, spec: Spec): boolean {
  const own = world.sides[side];
  const foeSide: Side = side === 'A' ? 'B' : 'A';
  const rt = spec.target === 'self' ? own : world.sides[foeSide];
  const g = rt.general;

  switch (spec.op) {
    case 'mp_max':
      g.mpMax += spec.value;
      g.mp = Math.min(g.mpMax, g.mp + spec.value);
      return true;
    case 'mp_restore':
      g.mp = Math.min(g.mpMax, g.mp + spec.value);
      return true;
    case 'hp_max':
      g.maxHp += spec.value;
      g.hp = Math.min(g.maxHp, g.hp + spec.value);
      return true;
    case 'hp_restore':
      g.hp = Math.min(g.maxHp, g.hp + spec.value);
      return true;
    case 'morale_add':
      rt.morale = clamp(rt.morale + spec.value, 0, 100);
      return true;
    case 'morale_sub':
      rt.morale = clamp(rt.morale - spec.value, 0, 100);
      return true;
    case 'str_add':
      g.str += spec.value;
      return true;
    case 'mod':
      pushModifier(world, rt.general.side, spec.channel as WiseChannel, spec.value, seq);
      return true;
    case 'units':
      addRearUnits(world, side, spec.value);
      return true;
    // R84 第二批：疲勞 / 敵將忠誠 / 勸降 / 化解計策。實現體在 wises_effects.ts，
    // 回 false = 條件不滿足（勸降的 loyalty>90 / constancy>5 閘），不是「未實作」。
    case 'tire':
    case 'loyal':
    case 'persuade':
    case 'dispel':
    case 'no_retreat':
    case 'hp_regen':
    case 'mp_regen':
      return applyExtraSpec(world, side, spec);
    // 後選出陣（3）：原作 `0x44DE44` 零狀態寫入，效果全在戰前編成 —— 這裡只立旗標，
    // 真正的「敵方之後重排前 3 槽」由 `deploy_queue.ts:chooseAfterFoe()` 在編成頁消費。
    case 'choose_after_foe': {
      const army = world.army?.[side];
      if (!army) return false;
      army.chooseAfterFoe = true;
      return true;
    }
  }
  return false;
}

/**
 * 伏兵：在我方後排（離敵最遠的那一列）後面追加 `n` 名士兵。
 * 位置跟著現有陣形算，不改 formation 表；`start/aliveCount/soldiers` 同步加，
 * 保持 createWorld 的不變式（start = 開戰時的兵數，GENERAL_BREAK 與戰功都靠它）。
 */
function addRearUnits(world: World, side: Side, n: number): void {
  const rt = world.sides[side];
  const own = world.units.filter((u) => u.side === side && !u.isGeneral);
  const rear = own.length > 0
    ? own.reduce((acc, u) => (side === 'A' ? Math.max(acc, u.x) : Math.min(acc, u.x)), own[0]!.x)
    : side === 'A' ? GRID_W - 6 : 6;
  // A 在右側、後排朝 +x；B 在左側、後排朝 −x
  const x = clamp(rear + (side === 'A' ? 1.2 : -1.2), 0.2, GRID_W - 1.2);
  for (let i = 0; i < n; i++) {
    const y = clamp(6.5 + (i - (n - 1) / 2) * 0.45, 0.2, GRID_H - 1.2);
    const unit: Unit = { side, x, y, prevX: x, prevY: y, alive: true, cd: 0 };
    world.units.push(unit);
  }
  rt.soldiers += n;
  rt.start += n;
  rt.aliveCount += n;
}

/** 查一條軍師技的實現；數據不足的返回 null（不是「空效果」）。 */
export function wiseEffectOf(data: GameData, seq: number): WiseEffect | null {
  const row = data.wises.find((w) => w.SEQUENCE === seq);
  const spec = SPECS[seq];
  if (!row || !spec) return null;
  return {
    seq,
    name: row.NAME,
    kind: spec.kind,
    note: spec.note,
    apply: (world, side) => applySpec(world, side, seq, spec),
  };
}

/**
 * 發動一條軍師技。
 *  · seq == null   → 空選，`{ ok: true }`（不報錯、不改 world）
 *  · 未實作 / 未知 → `{ ok: false }`（呼叫方靜默跳過）
 */
export function applyWise(
  world: World,
  side: Side,
  seq: number | null,
): { ok: boolean; kind?: string; note?: string } {
  if (seq == null) return { ok: true };
  const spec = SPECS[seq];
  if (!spec) return { ok: false, note: '未實作或未知的軍師技' };
  const before = wiseFingerprint(world, side);
  if (!applySpec(world, side, seq, spec)) {
    // R84：只有「條件不滿足」會走這裡（勸降的忠誠閘），不是未實作。
    return { ok: false, kind: spec.kind, note: '條件不滿足，未生效' };
  }
  // R88：只有真的改了狀態才記進「戰前已生效」，讓 step() 不再重複派發同一條。
  if (wiseFingerprint(world, side) !== before) recordStartApplied(world, side, seq);
  return { ok: true, kind: spec.kind, note: spec.note };
}

/** UI 用：這一條的短效果描述；未實作返回 null。 */
export function wiseHintOf(seq: number): string | null {
  return SPECS[seq]?.note ?? WISE_STRATEGY_HINTS[seq] ?? null;
}

// ---------------------------------------------------------------------------
// 已學軍師技（WISESKILL）
// ---------------------------------------------------------------------------

/**
 * `WISESKILL` 是 `[學習等級, 軍師技 SEQUENCE]` 的數組。
 * 數據裡實際存的是字符串（`"1, 6"`），types.ts 卻聲明成 `[number, number][]`，
 * 兩種都要喫得下（見 project/08 §9.5 的「多值字段」約定）。
 */
export function parseWiseSkill(general: General): Array<[number, number]> {
  const raw = general.WISESKILL;
  if (!Array.isArray(raw)) return [];
  const out: Array<[number, number]> = [];
  for (const row of raw as unknown[]) {
    let learn = Number.NaN;
    let seq = Number.NaN;
    if (Array.isArray(row)) {
      learn = Number(row[0]);
      seq = Number(row[1]);
    } else if (typeof row === 'string') {
      const parts = row.split(/[,\s]+/).filter((s) => s.length > 0);
      learn = Number(parts[0]);
      seq = Number(parts[1]);
    }
    if (Number.isFinite(learn) && Number.isFinite(seq)) out.push([learn, seq]);
  }
  return out;
}

/** 武將等級：General 類型沒有 level（存檔也還沒記），由呼叫方掛一個可選字段。 */
export function generalLevel(general: General): number {
  const lv = (general as General & { level?: number }).level;
  return typeof lv === 'number' && Number.isFinite(lv) && lv > 0 ? Math.floor(lv) : 1;
}

/**
 * 該將當前等級能用的軍師技（去重、按學習等級排序）。
 * 過濾兩道：
 *   1. `學習等級 <= 等級`（原作 WISESKILL 的門檻）
 *   2. `WISE.WiseLevel <= 等級`（軍師技檔次，1..3；獨有技為 0 恆過）
 * 順便濾掉 wises.json 裡沒有的 seq（臟數據）。
 *
 * 同名技在數據裡是 3 條不同 seq（WiseLevel 1/2/3）＝同一個技越練越強，不是三個技，
 * 所以按 NAME 併檔、只留當前等級已練到的最高檔（原作軍師技列表也只佔一格）。
 */
export function listWisdomChoices(data: GameData, general: General): number[] {
  const level = generalLevel(general);
  const bySeq = new Map(data.wises.map((w) => [w.SEQUENCE, w] as const));
  const best = new Map<string, { seq: number; tier: number; learn: number }>();
  for (const [learn, seq] of parseWiseSkill(general)) {
    if (learn > level) continue;
    const row = bySeq.get(seq);
    if (!row) continue;
    if (row.WiseLevel > level) continue;
    const cur = best.get(row.NAME);
    if (!cur) {
      best.set(row.NAME, { seq, tier: row.WiseLevel, learn });
      continue;
    }
    // 順序記「第一次學到」的等級，內容換成已練到的最高檔
    if (row.WiseLevel > cur.tier) cur.seq = seq;
    cur.tier = Math.max(cur.tier, row.WiseLevel);
    cur.learn = Math.min(cur.learn, learn);
  }
  return [...best.values()].sort((a, b) => a.learn - b.learn).map((v) => v.seq);
}

// ---------------------------------------------------------------------------
// 戰前入口：AI 側自動發動
// ---------------------------------------------------------------------------

/** `applyWiseOnBattleStart` 實際發動的紀錄（給戰場訊息用）。 */
export interface BattleStartWise {
  side: Side;
  seq: number;
  name: string;
  kind: string;
  note: string;
}

export interface BattleStartOptions {
  /** 指定某一側用哪一條（出征頁的選擇）；`null` = 明確不發動；不填 = 由這裡按 WISESKILL 自動挑 */
  prefer?: Partial<Record<Side, number | null>>;
  /** 由玩家自己挑技的側，默認只跳過 A（main.js 的 `cfg.wise` 已經套過 A） */
  humanSides?: readonly Side[];
}

/** 同一個 world 只處理一次：campaign 在 createWorld 之後呼叫，重複呼叫返回同一份結果。 */
const battleStartDone = new WeakMap<World, BattleStartWise[]>();

/**
 * 戰前為「不是玩家自己挑」的側自動發動一條軍師技。
 *
 * 原作軍師技是出征前由軍師發動的一次性效果（docs/04b §4.3），本作 `createWorld` 之後
 * 沒有任何地方替 AI 側發動（main.js 只替 A 側套 `cfg.wise`），所以 B 側（守方/AI）
 * 的 WISESKILL 一直沒生效。這個函數補這一步：
 *   1. `prefer[side]` 有值 → 用指定的那條；`null` → 這一側不發動；
 *   2. 否則跳過 `humanSides`（默認 A）；
 *   3. 否則按 `world.sides[side].general.level` + 該將的 WISESKILL 取
 *      `listWisdomChoices()` 的最後一條（已練到的最新技，同名的取最高檔）；
 *   4. 該將在 `generals.json` 裡查不到 / 沒有可用的技 → 跳過。
 *
 * 回傳實際發動的清單（空 = 沒發動）。同一 world 重複呼叫是冪等的。
 */
export function applyWiseOnBattleStart(
  world: World,
  data: GameData,
  opts: BattleStartOptions = {},
): BattleStartWise[] {
  const cached = battleStartDone.get(world);
  if (cached) return cached;

  const humanSides = opts.humanSides ?? (['A'] as const);
  const generalByName = new Map(data.generals.map((g) => [g.NAME, g] as const));
  const wiseBySeq = new Map(data.wises.map((w) => [w.SEQUENCE, w] as const));
  const out: BattleStartWise[] = [];

  for (const side of ['A', 'B'] as const) {
    const prefer = opts.prefer?.[side];
    if (prefer === null) continue;

    let seq: number | null | undefined = prefer;
    if (seq === undefined) {
      if (humanSides.includes(side)) continue;
      if (wiseModifiers(world).some((m) => m.side === side)) continue; // 已經有人替它套過
      seq = autoWiseOf(world, data, side, generalByName);
    }
    if (seq == null) continue;

    const applied = applyWise(world, side, seq);
    const row = wiseBySeq.get(seq);
    if (!applied.ok || !row) continue;
    out.push({ side, seq, name: row.NAME, kind: applied.kind ?? '', note: applied.note ?? '' });
  }

  battleStartDone.set(world, out);
  return out;
}

/** 該側主將已練到的「最新一條」軍師技；查不到武將/沒有可用技時返回 null。 */
function autoWiseOf(
  world: World,
  data: GameData,
  side: Side,
  generalByName: ReadonlyMap<string, General>,
): number | null {
  const g = world.sides[side].general;
  const row = generalByName.get(g.name);
  if (!row) return null;
  const choices = listWisdomChoices(data, { ...row, level: g.level });
  return choices.length > 0 ? choices[choices.length - 1]! : null;
}
