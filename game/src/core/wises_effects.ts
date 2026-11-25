/**
 * 軍師技：戰前一次性效果的第二批登記表（R84 新增 11 條，R88 再加入十面埋伏 → 12 條）。
 *
 * ── 為什麼是一個新文件 ────────────────────────────────────────────────────
 * `wises.ts` 已經 500 行、主體是「分類 + 數值 + 側表」，再往裡塞 12 條規格會看不清。
 * 這裡只放兩樣東西：規格表 `WISE_EXTRA_SPECS` 和它的落地函數 `applyExtraSpec()`。
 * `wises.ts` 在模塊初始化時把這張表並進 `SPECS`，`applySpec()` 遇到新 op 就轉發過來。
 *
 * ── R88 的三處改動（都有原作負證據，見 `project/130`）────────────────────
 *   1. 十面埋伏（54）：舊實作「我方後排 +6 兵」沒有原作依據；`0x44E09D` 起的分支是
 *      `foeArmy+0x84 |= 4`（敵方無法退兵），敵將有坐騎時只打「破解我方埋伏」。
 *      這裡改成寫 `noRetreat` 位，戰前/戰中兩條路徑寫的是同一個位（不會雙倍）。
 *   2. 勸降（32）：原作成功分支只置 `foeArmy+0x84 |= 0x400`（敵將投靠），**不寫忠誠**；
 *      這裡補上 0x400 位。忠誠 −15 保留為「投靠 → 戰後招降」的本作代理（`capture.ts`
 *      的招降判定讀忠誠），屬 [推測]，見報告。
 *   3. 新增 `WISE_STRATEGY_HINTS`：12 條戰中派發的 UI 提示。此前 `wiseHintOf()` 對它們
 *      返回 null，出征頁把它們顯示成「原作有此技，本作尚未實作」——這正是 c5 誤判
 *      「24 條占位」的直接來源之一。
 *
 * ── R89：9 條代理落點轉正（project/130 的「9 代理」全部落地）─────────────────
 *   1. **疲勞 6 條**（4/25/51、5/27/50）不再直接加減 `general.tire`。原作那 6 支分支
 *      （`0x44D70A..0x44D83D`）只寫 `army+0x34 |= 0x1000` 與 `army+0x38 ±1/2/3`，
 *      真正加疲勞在戰後 `0x41048D`（`15+秒/10` 過 `0x4103DE` 的 7 項跳表）。
 *      本檔寫 `ArmyStatus.fatigueIdx`，`battle.ts:settle()` 用 `fatigueMul()` 兌現，
 *      結果落在 `SettleResult.tireAdded/tireIdx`（`tireGain` 仍是基值，兩者一致）。
 *   2. **勸降（32）**：成功時只置 `flags |= 0x400` + `defectPending = true`（顯式標記），
 *      名單在戰後由 `settle()` 翻成一條 `recruited: true` 的捕獲條目，交給
 *      `roster.applyPostBattle()`。**戰中一次都不改 roster**。
 *   3. **化解（24）**：不再清 `army.seq`（那是「整場封鎖」，比原作強）。改成給被化解方
 *      `cancelPending += 1`，`strategy.ts:runStrategy()` 下次派發時兌現：事件照發、
 *      `ops` 全部不落地 —— 對應原作「只有日誌」的語義，取消點標 [推測]。
 *
 * ── 這批技的依據 ──────────────────────────────────────────────────────────
 * `0x44D450` 那 66 條分支已抄成 `strategy.ts:STRATEGY_TABLE`（`exec` = `Execute`）：
 *   · Execute 9/10/11  → `or [unit2+0x34],0x1000` / `add [unit2+0x38],+1/+2/+3` → 4/25/51
 *   · Execute 12/13/14 → `or [unit1+0x34],0x1000` / `sub [unit1+0x38],1/2/3`     → 5/27/50
 *   · Execute 30/31/32 → `foeGen+0x3C -= 8/15/25`                               → 6/34/55
 *   · Execute 33       → `foeArmy+0x84 |= 0x400` + 訊息「說服敵將投靠我方」      → 32
 *   · Execute 44       → `foeArmy+0x84 |= 4`（有坐騎則破解）                    → 54
 *   · Execute 57       → 只有日誌（真正取消在呼叫方，未定位）                    → 24
 *
 * ── 消費點 ────────────────────────────────────────────────────────────────
 *   · `army.fatigueIdx`  → `battle.ts:settle()` 的 `fatigueMul()` → `.tireAdded/.tire/.tireIdx`
 *   · `army.cancelPending` → `strategy.ts:runStrategy()` 的下一次派發閘（取消一次）
 *   · `army.defectPending` → `battle.ts:settle()` → `roster.markDefectedCapture()` → 招降名單
 *   · `g.loyal`    → `settle()` 讀 `g.loyal ?? row.Loyal ?? 50` → `.loyalty` → `capture.ts`
 *   · `army.flags` → `battle.ts:1687` 的 `noRetreat` 讓 `requestRetreat()` 返回 false
 *
 * 疲勞的取值口徑照抄 `settle()`（`g.tire ?? 0`），忠誠/節操照抄 `settle()` 的
 * `g.loyal ?? row.Loyal ?? 50` / `g.constancy ?? row.CONSTANCY ?? 5`。
 *
 * ── 為什麼疲勞不接戰力係數 ────────────────────────────────────────────────
 * `docs/04b5 §2.2/§2.5` 是 [確認]：原作 `general+0x3A`（疲勞）在戰力與命中判定裡
 * **一次都沒被讀**，只影響月結算。所以本檔連 `g.tire` 都不寫（原作那 6 支分支也沒寫），
 * 只寫 `army+0x38` 的倍率檔，等戰後由 `settle()` 一次性加；不乘進 `powerOf`。
 *
 * ── 為什麼不重複登記另外 12 條 ────────────────────────────────────────────
 * 混亂敵軍(15/44/62)、逼近敵軍(23)、包圍敵軍(26)、亂陣(28)、太公陣(29)、偷襲敵軍(30)、
 * 保護主將(31)、封武將技(59)、詐敗(10)、金蟬脫殼(33) 寫的是 `army.atkMod / flags /
 * moveMul / takenMul / formation`，`strategy.ts` 的派發器已經在寫它們（battle.ts 有現成
 * 消費點）。在 `wises.ts` 再登記一遍會讓「出征頁選一次 + 戰中派發一次」變成雙倍，
 * 所以那 12 條留在派發器裡，本檔不碰。`WISE_STRATEGY_ONLY` 就是這份清單。
 *
 * 依據鏈：`docs/04b` §4.3、`docs/04b5` §2、`work/dis_battle_B_44D450.txt` 的
 * `0x44D450` 派發表、`game/data/wises.json` 的 `Execute` 列。
 */
import type { Side, World } from './battle.ts';
import type { WiseSpec } from './wises.ts';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** `army+0x84` 的位（同 `strategy.ts:57` 的 `ARMY_FLAG`；不 import 是為了避免模塊環）。 */
const FLAG_NO_RETREAT = 0x4;
const FLAG_DEFECT = 0x400;
/** `0x1000`： Execute 9-14 的「疲勞倍率已寫」狀態位（同 `ARMY_FLAG.fatigue`） */
const FLAG_FATIGUE = 0x1000;

/** 主將狀態（= `world.sides[X].general`），避免從 battle.ts 額外導入類型名。 */
type Gen = World['sides']['A']['general'];

/** generals.json 裡那一行；沒有（無名守將/雜兵將）返回 undefined。 */
function rowOf(world: World, g: Gen) {
  return world.data.generals.find((x) => x.NAME === g.name);
}

/** 忠誠基準：與 `settle()` 的 `g.loyal ?? row.Loyal ?? 50` 同一個口徑（battle.ts:2062）。 */
function loyalBase(world: World, g: Gen): number {
  return clamp(Math.round(g.loyal ?? rowOf(world, g)?.Loyal ?? 50), 0, 99);
}

/** 節操：與 `settle()` 的 `g.constancy ?? row.CONSTANCY ?? 5` 同一個口徑（battle.ts:2063）。 */
function constancyOf(world: World, g: Gen): number {
  return clamp(Math.round(g.constancy ?? rowOf(world, g)?.CONSTANCY ?? 5), 0, 9);
}

/**
 * 落地一條「第二批」軍師技。返回 false 表示「條件不滿足、沒生效」（只有勸降會）。
 *
 * 全部只寫既有字段，不新建世界狀態：
 *   · `tire`     —— 寫 `army.fatigueIdx` / `flags |= 0x1000`（戰後 `settle()` 兌現）
 *   · `loyal`    —— 寫 `general.loyal`（0..99）
 *   · `persuade` —— 先過兩道閘（忠誠 > 90 / 節操 > 5 → 失敗），再 −15 忠誠 + `defectPending`
 *   · `dispel`   —— 給敵方 `army.cancelPending += 1`（下一次派發被取消一次）
 */
export function applyExtraSpec(world: World, side: Side, spec: WiseSpec): boolean {
  const foeSide: Side = side === 'A' ? 'B' : 'A';
  const target: Side = spec.target === 'self' ? side : foeSide;
  const g = world.sides[target].general;

  switch (spec.op) {
    case 'tire': {
      // 原作 Execute 9/10/11（`0x44D717` 等）與 12/13/14：
      //   `or dh,0x10`（= `army+0x34 |= 0x1000`）+ `add/sub [army+0x38], 1/2/3`
      // **不寫 `general+0x3A`（疲勞值）**，`+0x38` 是戰後疲勞倍率檔。
      // 消費點 `0x41048D` → `0x4103DE(base, idx)` 的 7 項跳表（30..250%），本作在
      // `battle.ts:fatigueMul()` 落地、`settle()` 兌現（`SettleResult.tireAdded`）。
      // 所以這裡只寫檔位：戰前的「+5 疲勞」是舊實作，與原作指令不符，已刪。
      const army = world.army?.[target];
      if (!army) return false;
      army.flags |= FLAG_FATIGUE;
      army.fatigueIdx += Math.trunc(spec.value);
      return true;
    }
    case 'loyal':
      g.loyal = clamp(loyalBase(world, g) + spec.value, 0, 99);
      return true;
    case 'persuade': {
      // 兩道閘照 `strategy.ts:483-495`（`0x44D450` 那條分支的判定）：
      // 忠誠 > 0x5A、節操 > 5 都算「策略失敗!!」。另兩道是全局查詢（`0x40975E`/`0x450117`），未定位。
      if (!g.alive || loyalBase(world, g) > 90 || constancyOf(world, g) > 5) return false;
      // 原作成功分支只置 `foeArmy+0x84 |= 0x400`（敵將投靠），不寫忠誠 → 這裡照抄狀態位。
      const army = world.army?.[target];
      if (army) {
        army.flags |= FLAG_DEFECT;
        // 戰中只留「戰後才處理」的顯式標記：`battle.ts:settle()` 讀它，把這名敵將翻成一條
        // `recruited: true` 的捕獲條目交給 `roster.applyPostBattle()`。**戰中不改名單。**
        army.defectPending = true;
      }
      // 忠誠 −15 是本作代理：[推測] `capture.ts` 的戰後招降讀忠誠，投靠位目前在 core 內
      // 沒有消費點（`0x400` 的讀取處未在反彙編裡定位），靠這條把「投靠」接到招降流程。
      g.loyal = clamp(loyalBase(world, g) - spec.value, 0, 99);
      return true;
    }
    case 'no_retreat': {
      // 原作 Execute 44（`0x44E09D`）：敵將有坐騎 → 只打「敵將騎%s，破解我方埋伏。」
      // 不置位；沒坐騎 → `foeArmy+0x84 |= 4`（`requestRetreat()` 讀）。
      const row = rowOf(world, g);
      const horse = typeof row?.Horse === 'string' && row.Horse.length > 0 ? row.Horse : null;
      if (horse) return false;
      const army = world.army?.[target];
      if (!army) return false;
      army.flags |= FLAG_NO_RETREAT;
      return true;
    }
    case 'hp_regen':
    case 'mp_regen': {
      // 原作 Execute 35-40：`army+0x84 |= 1|2`、`+0x88 = 40/60/80（體）/ 30/50/70（技）`。
      // 舊實作寫成瞬回，滿血開戰時等於沒寫（probe: pre 無差量）；改成戰中持續回復後
      // `battle.ts:2107-2118` 的 `strategyRegen()` 每 60 tick 按 maxHp/mpMax × param/1000 回復。
      const army = world.army?.[side];
      if (!army) return false;
      if (spec.op === 'hp_regen') {
        army.hpRegen = spec.value;
        army.flags |= 0x1;
      } else {
        army.mpRegen = spec.value;
        army.flags |= 0x2;
      }
      army.qiParam = spec.value;
      return true;
    }
    case 'dispel': {
      const army = world.army?.[foeSide];
      if (!army) return false;
      // 原作 `0x44E34C` 只有一句日誌，真正的取消在呼叫方（未定位）。
      // [推測] 落點：記一次「待取消」在被化解方身上，`strategy.ts:runStrategy()` 下次派發時
      // 減一 —— 事件照發（日誌留痕）、`ops` 全部不落地。舊實作直接清 `army.seq` 讓敵方
      // 整場不派發，等於把「取消一次」做成了「永久封鎖」，與原作的日誌語義不符。
      army.cancelPending += 1;
      return true;
    }
    default:
      return false;
  }
}

/**
 * 第二批 11 條規格。鍵 = `wises.json` 的 `SEQUENCE`，強度 = `Execute` 那條分支的量級。
 * `target` 一律描述「效果打在哪一側」：擾亂敵將/離間計/勸降打敵方，減少疲勞打自己。
 */
export const WISE_EXTRA_SPECS: Readonly<Record<number, WiseSpec>> = {
  // 擾亂敵將（Execute 9/10/11）：敵方 `army+0x38 += 1/2/3`（戰後疲勞 ×1.5/×2/×2.5）
  4: { kind: 'tire', target: 'enemy', op: 'tire', value: 1, note: '敵將疲勞倍率 +1 檔（戰後 ×1.5）' },
  25: { kind: 'tire', target: 'enemy', op: 'tire', value: 2, note: '敵將疲勞倍率 +2 檔（戰後 ×2）' },
  51: { kind: 'tire', target: 'enemy', op: 'tire', value: 3, note: '敵將疲勞倍率 +3 檔（戰後 ×2.5）' },
  // 減少疲勞（Execute 12/13/14）：己方 `army+0x38 -= 1/2/3`（戰後疲勞 ×0.75/×0.5/×0.3）
  5: { kind: 'tire', target: 'self', op: 'tire', value: -1, note: '我軍疲勞倍率 −1 檔（戰後 ×0.75）' },
  27: { kind: 'tire', target: 'self', op: 'tire', value: -2, note: '我軍疲勞倍率 −2 檔（戰後 ×0.5）' },
  50: { kind: 'tire', target: 'self', op: 'tire', value: -3, note: '我軍疲勞倍率 −3 檔（戰後 ×0.3）' },
  // 離間計（Execute 30/31/32）：敵將忠誠 −8/15/25
  6: { kind: 'loyal', target: 'enemy', op: 'loyal', value: -8, note: '敵將忠誠 −8' },
  34: { kind: 'loyal', target: 'enemy', op: 'loyal', value: -15, note: '敵將忠誠 −15' },
  55: { kind: 'loyal', target: 'enemy', op: 'loyal', value: -25, note: '敵將忠誠 −25' },
  // 勸降（Execute 33）：有閘的一次性招降，成功才 −15
  32: { kind: 'loyal', target: 'enemy', op: 'persuade', value: 15, note: '勸降：敵將忠誠 −15' },
  // 化解計策（Execute 57）：清掉敵方待派發的 seq
  24: { kind: 'dispel', target: 'enemy', op: 'dispel', value: 0, note: '化解敵方軍師技' },
  // 十面埋伏（Execute 44）：`0x44E09D` 起 `foeArmy+0x84 |= 4`（敵方無法退兵）；
  // 敵將有坐騎時原作只打「破解我方埋伏」，不置位。舊的「後排 +6 兵」無原作依據，已刪。
  54: { kind: 'ambush', target: 'enemy', op: 'no_retreat', value: 0, note: '敵方無法退兵（十面埋伏）' },
};

/**
 * 12 條戰中派發的 UI 提示（`wiseHintOf` 的第二來源）。
 *
 * 出征頁原本對它們返回 null，看起來像「未實作」；R88 補上這層，讓 67 條每一條都有
 * 可讀的效果說明。鍵 = `wises.json` 的 SEQUENCE（與 `WISE_STRATEGY_ONLY` 同）。
 */
export const WISE_STRATEGY_HINTS: Readonly<Record<number, string>> = {
  10: '戰中：主將可後退（Execute 45）',
  15: '戰中：敵方兵戰力 −5（Execute 27）',
  23: '戰中：我方移速 ×1.1（Execute 49）',
  26: '戰中：我方包圍、敵方移速 ×0.9（Execute 47）',
  28: '戰中：敵陣散開、陣形歸零（Execute 7）',
  29: '戰中：我方收拢、陣形歸零（Execute 8）',
  30: '戰中：敵方被突襲（Execute 48）',
  31: '戰中：主將傷害 ×0.75（Execute 46）',
  33: '戰中：隨時可撤退（Execute 56）',
  44: '戰中：敵方兵戰力 −10（Execute 28）',
  59: '戰中：敵方武將技被封（Execute 64）',
  62: '戰中：敵方兵戰力 −15（Execute 29）',
};

/**
 * 本表不登記、但**已經由戰中派發器消費**的 12 條（`strategy.ts` 寫 `army.*`，
 * `battle.ts` 有現成消費點）。列在這裡是為了讓「67 = 54 + 12 + 1」可被測試釘住。
 *
 * 每條的落點（battle.ts 行號）：
 *   · atkMod   : 1234（`powerOf` 的加項）  → 15/44/62 混亂敵軍、def-down 系
 *   · moveMul  : 1407（移動步長）          → 23 逼近敵軍、26 包圍敵軍、30 偷襲敵軍
 *   · takenMul : 1461（主將挨打減傷）      → 31 保護主將
 *   · flags    : 1582 noRetreat / 1607 mayRetreat·fleeAnytime / 1762 sealMagic
 *                → 10 詐敗(mayRetreat)、33 金蟬脫殼(fleeAnytime)、59 封武將技(sealMagic)
 *   · formation: 1536（`formationBonus` 每 tick 重算）→ 26/28/29
 */
export const WISE_STRATEGY_ONLY: readonly number[] = [
  10, 15, 23, 26, 28, 29, 30, 31, 33, 44, 59, 62,
];

/**
 * 顯式佔位表 —— **R94 之後已清空**（最後一條 `3 後選出陣` 落地）。
 * 命名沿用 `SYSO_UNSUPPORTED`（見 `project/52` §4 的約定），保留空匯出是為了讓
 * 「67 = 55 登記 + 12 戰中派發 + 0 佔位」的三分法仍可被測試釘住。
 *
 * 歷史（`project/109`）：這張表曾只有一個鍵 `3`，理由是 `0x44DE44` 起只有
 * `push 0x491900("成功")` → `call 0x46dae0`（消息欄）→ `jmp 0x44e6c7`，
 * **沒有任何狀態寫入**（`work/dis_battle_B_44D450.txt:763`）；而 `ATTRIB=1` 表明它是
 * 戰前選擇（`docs/03a-武将技表MAGIC.md:297`），真實語義是「使用方在敵方之後選將/兵種」，
 * 需要戰役編成層的 5 將出陣隊列（Obj3 部隊池 `docs/07b` §6）。
 *
 * R94 補上了那一層：`3` 已進 `wises.ts` 的 `SPECS`（`kind: 'deploy'`、
 * `op: 'choose_after_foe'`），戰前 `applyWise()` 把使用方的 `army.chooseAfterFoe`
 * 立起來；真正的「敵方之後重排前 3 槽」由 `deploy_queue.ts` 的 `chooseAfterFoe()` /
 * 編成頁消費（見 `project/162_出阵队列与后选出阵.md`）。
 */
export const WISE_SYSO_UNSUPPORTED: Readonly<Record<number, string>> = {};
