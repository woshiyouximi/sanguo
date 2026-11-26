/**
 * 战后处置：招降 / 斩首 / 释放 + 物品掉落。
 *
 * 规则唯一来源：`docs/04b2_招降斩首与战后结算.md`
 *   §2.2 `0x404344`  招降成功率（忠诚 / 节操 / 原势力是否健在）
 *   §2.4 `0x40452E`  自动处置：招降 → 失败则 50% 斩首 / 50% 释放
 *   §3.1 `0x40EF9A`  斩首落地（摘除归属，status=5）
 *   §3.2 `0x40EEAA`  招降落地（改属势力，忠诚≥50 折成 ×2/3）
 *   §5.3 `0x408EE2`  物品加权轮盘（SearchType / Level / Rate / ONLYONE）
 *   §5.1 负证据：原作战斗流程**不掉落**物品，掉落只挂在城池搜索上。
 *
 * 本模块是纯逻辑（无 DOM、不读 localStorage），所有随机都走传入的 `rng`，
 * 保证 `?seed=N` 下同一局的结果可复现。
 *
 * R115：`resolvePostBattle()` 可再收一个原作乱数流 `roll`（`SangoRng`）。给了 `roll`
 * 时，所有 `rand()%n` 点走 `roll.int(n)`、`rand()&1` 点走 `roll.bit()`，序列与 1998 年
 * 的 `0x450132` 一致；不给（或传 null）时逐字节保持旧行为，老存档/老测试不受影响。
 */

import type { GameData, General, Item } from '../types';
import type { Side } from './battle';
import type { SangoRng } from './sango_rng';

// ---------------------------------------------------------------------------
// 类型

/** 战后处置的对象：一个败方武将 */
export interface PostGeneral {
  name: string;
  str: number;
  int: number;
  level: number;
  /** 战斗结束时是否还活着；false = 阵亡，不进入处置 */
  alive?: boolean;
  /** 忠诚度 0..99（`general+0x3C`）；缺省取 generals.json 的 `Loyal` */
  loyal?: number;
  /** 节操 1..9（`general+0xC7`）；缺省取 generals.json 的 `CONSTANCY` */
  constancy?: number;
  /** 君主本人（`0x40975E`）→ 不可俘、不可招降 */
  isKing?: boolean;
  /** 其 LOYAL 情义势力的君主仍是自己主君（`kd->+0xCB == k0`）→ 宁死不降 */
  lordAlive?: boolean;
  /** 其 LOYAL 势力就是招降方（`k0 == 招降方`）→ 必降（code 6） */
  sameForce?: boolean;
  /** 旧主已归顺我方且原势力 `STATUS==1`（code 2）→ 必降 */
  lordSurrendered?: boolean;
}

/** 处置状态：把 rng / 数据 / 唯一物品账本一起传进来 */
export interface PostBattleState {
  data: GameData;
  rng: () => number;
  /**
   * 原作乱数流（R115）：非空时招降/斩首/被俘判定改从它取数，
   * 此时 `rng` 不再被消费；缺省/null 时仍走 `rng` 的旧行为。
   */
  roll?: SangoRng | null;
  /** 已拿过的唯一物品 seq（`ONLYONE` 全局只出一次） */
  dropTaken?: string[];
  /** 胜方剩余兵力（用于被俘概率） */
  winnerSoldiers?: number;
  /** 败方剩余兵力（越少越容易被俘） */
  loserSoldiers?: number;
  /** 败方是否被围（残兵被堵住） */
  surrounded?: boolean;
}

export interface RecruitOutcome {
  ok: boolean;
  /** 按 04b2 §2.2 等价概率表算出的成功率（0..1） */
  chance: number;
  /** 给 UI / 调试看的中文原因 */
  reasons: string[];
}

export interface CapturedGeneral {
  name: string;
  str: number;
  int: number;
  /** 被俘当刻的忠诚度（已被 `0x447520` 扣过：(10-节操)*2） */
  loyal: number;
  /** 是否招降成功；false 的条目会出现在 executed / released 里 */
  recruited: boolean;
}

export interface DropItem {
  /** items.json 的 Sequence，存成字符串便于塞进 localStorage */
  itemId: string;
  name: string;
}

export interface PostBattleReport {
  captures: CapturedGeneral[];
  executed: CapturedGeneral[];
  released: CapturedGeneral[];
  /**
   * 被围住但**没抓住**的敌方君主（`0x40975E`）：原作走
   * `0x4912B0 "我們俘虜了敵方君主，但被逃了...."`，条目状态改 7（逃脱），
   * 既不算俘获也不算阵亡，所以单列一栏给战报用（R56）。
   */
  kingsEscaped: string[];
  drops: DropItem[];
  expBonus: number;
  meritBonus: number;
}

/** `resolvePostBattle` 只依赖战场的这几个字段，方便测试构造 */
export interface PostBattleSideView {
  start: number;
  aliveCount: number;
  /**
   * 主将。字段形状与 `PostGeneral` 一致：除了 name/str/int/level，还可以带
   * loyal/constancy（`+0x3C`/`+0xC7`）与势力侧标记 isKing/lordAlive/sameForce/
   * lordSurrendered —— 战场单位本身没有势力指针，只能由调用方（web 层）挂上来，
   * 否则君主不可俘（`0x40975E`）判定会失效。
   */
  general: PostGeneral;
  /**
   * 随军副将（R54）：主将之外的参战武将，战后与主将**一起**逐个处置。
   * 没有就是单人局 —— 与旧版行为、rng 消耗顺序完全一致。
   */
  officers?: PostGeneral[];
}

export interface PostBattleWorld {
  winner: Side | 'draw' | null;
  /**
   * 结束原因，与 `battle.ts` 的 `World.endReason` 同一套（`0x44411B` 的理由码）：
   * `general` 主将阵亡 / `retreat` 全军撤退离场 / `time` 到点平手。
   * 本文件只做展示/上报，不据此改处置规则（处置只看 `winner` 与败方主将存活）。
   */
  endReason: 'general' | 'annihilate' | 'retreat' | 'time' | null;
  sides: Record<Side, PostBattleSideView>;
}

/** 每次返回全新数组，避免调用方改到共享对象 */
export function emptyReport(): PostBattleReport {
  return {
    captures: [],
    executed: [],
    released: [],
    kingsEscaped: [],
    drops: [],
    expBonus: 0,
    meritBonus: 0,
  };
}

// ---------------------------------------------------------------------------
// 基础数据

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function findGeneral(data: GameData, name: string): General | undefined {
  return data.generals.find((g) => g.NAME === name);
}

/**
 * 是不是君主（`0x40975E` 的判据 `general+0xD7` = "势力主"标志）。
 *
 * 两个来源：调用方显式给的 `isKing`（web 层从 `save.king` 带入），
 * 以及剧本 `kings[]` 名单（`types.ts` 的 `Scenario.kings`，对应原作 FLAGNUM/SELECT）。
 * 君主不可俘（04b §6.4），这条规则先于被俘掷骰，也先于招降/斩首。
 */
function isKingOf(g: PostGeneral, data: GameData): boolean {
  if (g.isKing === true) return true;
  const scenarios = data.scenarios ?? [];
  for (const sc of scenarios) {
    const kings = sc?.kings ?? [];
    for (const k of kings) {
      if (k && k.NAME === g.name) return true;
    }
  }
  return false;
}

/** 忠诚度 / 节操：显式值优先，否则回落到 generals.json（缺数据给中庸值） */
function profileOf(g: PostGeneral, data: GameData): { loyal: number; constancy: number } {
  const row = findGeneral(data, g.name);
  const loyal = clamp(Math.round(g.loyal ?? row?.Loyal ?? 50), 0, 99);
  const constancy = clamp(Math.round(g.constancy ?? row?.CONSTANCY ?? 5), 0, 9);
  return { loyal, constancy };
}

// ---------------------------------------------------------------------------
// §2.2 招降成功率

/**
 * 04b2 §2.2 的等价概率表（`L`=忠诚，`C`=节操）：
 *
 * | 条件 | 成功率 |
 * |---|---|
 * | 君主 | 0（`0x40975E` 在更高层就拦掉） |
 * | `L < 25` | 100%（早于一切） |
 * | 情义势力即招降方 | 100%（code 6） |
 * | 旧主已降 | 100%（code 2） |
 * | `t = -1`（C<3） | `1-(L/100)^2` |
 * | `t = 0`（C=3~4） | `1-L/100` |
 * | `t = 1` | `(1-L/100)/3` |
 * | `t >= 2`（原势力健在且 C≥3） | 0（宁死不降） |
 * | `L > 90` / `70 < L <= 90` / `50 < L <= 70` | 0（**三条硬门**） |
 *
 * `t` 的算法照抄汇编：`t = C>=5 ? 1 : C>=3 ? 0 : -1`，原势力健在时 `t += 2`。
 * 注意汇编里 `t += 2` 写在掷骰之前，而"宁死不降"的 `return 0` 写在掷骰之后，
 * 严格按控制流走时 `t=2/3` 会在掷骰成功处先 `return 1`（漏出 1/3 成功率）；
 * 文档 §2.2 的表与注释都写明"宁死不降 = 0"，本实现取文档口径。
 *
 * R53：原作 `0x404344` 尾部还有三段**无条件**的失败出口——
 * `cmp [g+0x3C],0x5A / jg 0x11`、`cmp 0x46 / jg 0x12`、`cmp 0x32 / jg 0x13`，全部 `return 0`。
 * 即"忠诚 >90、70~90、50~70 这三档根本招不动"，而且这三段在掷骰**之后**，
 * 所以它们不能表达成"降低概率"，只能是**概率恒 0**。三段合并等价于 `L > 50 → 0`
 * （`50 < L <= 70` 已覆盖 70 以下），这里仍按三档各判一次，报错文案才能对上原作的 code。
 */
export function recruitChanceOf(g: PostGeneral, state: PostBattleState): number {
  const { loyal, constancy } = profileOf(g, state.data);
  if (g.isKing) return 0;
  if (loyal < 25) return 1; // L < 0x19 早退，优先于宁死不降
  if (g.sameForce) return 1;
  if (g.lordSurrendered) return 1;
  let t = constancy >= 5 ? 1 : constancy >= 3 ? 0 : -1;
  if (g.lordAlive) t += 2;
  if (t >= 2) return 0;
  if (loyal > 90) return 0; // 0x404344 code 0x11
  if (loyal > 70) return 0; // code 0x12
  if (loyal > 50) return 0; // code 0x13
  const p = clamp(loyal, 0, 99) / 100;
  if (t < 0) return 1 - p * p;
  if (t === 0) return 1 - p;
  return (1 - p) / 3;
}

/**
 * 掷骰的调用次数也照抄汇编：
 * - `t<0`：两次 `rand()%100 >= L`
 * - `t=0`：一次
 * - `t>=1`：`rand()%100 >= L && rand()%3 == 0`（短路：第一个不过就不掷第二个）
 */
function rollRecruit(t: number, loyal: number, rng: () => number, roll?: SangoRng | null): boolean {
  // 原作这三条都是 `rand()%n`（`0x450117`）：给了 roll 时走 `roll.int(n)`（= rand()%n），
  // 否则保持旧的 `floor(rng()*n)`，逐字节不变。
  const draw = (n: number): number => (roll ? roll.int(n) : Math.floor(rng() * n));
  if (t < 0) {
    if (draw(100) >= loyal) return true;
    if (draw(100) >= loyal) return true;
    return false;
  }
  if (t === 0) return draw(100) >= loyal;
  return draw(100) >= loyal && draw(3) === 0;
}

/**
 * 招降判定 `canRecruit(winnerSide, loserGeneral, state)`。
 *
 * 返回 `ok` = 本次掷骰是否成功（会消耗 state.rng），`chance` = 理论成功率，
 * `reasons` = 判定过程的中文说明。
 */
export function canRecruit(winnerSide: Side, loser: PostGeneral, state: PostBattleState): RecruitOutcome {
  const reasons: string[] = [];
  void winnerSide; // 判定只看败方属性；保留参数是为了签名与"谁在招"对称
  const { loyal, constancy } = profileOf(loser, state.data);
  const chance = recruitChanceOf(loser, state);

  if (loser.isKing) {
    return { ok: false, chance: 0, reasons: ['君主不降（0x40975E 在处置入口就拦掉）'] };
  }
  if (loyal < 25) {
    return { ok: true, chance: 1, reasons: [`忠诚 ${loyal} < 25：必降，不掷骰`] };
  }
  if (loser.sameForce) {
    return { ok: true, chance: 1, reasons: ['其情义势力就是招降方（code 6）：必降'] };
  }
  if (loser.lordSurrendered) {
    return { ok: true, chance: 1, reasons: ['旧主已归顺（code 2）：必降'] };
  }
  let t = constancy >= 5 ? 1 : constancy >= 3 ? 0 : -1;
  if (loser.lordAlive) t += 2;
  if (t >= 2) {
    return {
      ok: false,
      chance: 0,
      reasons: [`节操 ${constancy} ≥ 3 且原势力健在（t=${t}）：宁死不降（0x10）`],
    };
  }
  // R53 三条硬门：原作 `0x404344` 尾部三段 `return 0`，掷骰之后仍一律不降。
  if (loyal > 90) {
    return { ok: false, chance: 0, reasons: [`忠诚 ${loyal} > 90：硬门 0x11，必不降`] };
  }
  if (loyal > 70) {
    return { ok: false, chance: 0, reasons: [`忠诚 ${loyal}（70 < L ≤ 90）：硬门 0x12，必不降`] };
  }
  if (loyal > 50) {
    return { ok: false, chance: 0, reasons: [`忠诚 ${loyal}（50 < L ≤ 70）：硬门 0x13，必不降`] };
  }
  const ok = rollRecruit(t, loyal, state.rng, state.roll);
  const pct = (chance * 100).toFixed(1);
  reasons.push(`忠诚 ${loyal} / 节操 ${constancy} / t=${t}：成功率 ${pct}%`);
  reasons.push(ok ? '掷骰成功 → 归顺' : '掷骰失败');
  return { ok, chance, reasons };
}

// ---------------------------------------------------------------------------
// 是否被俘

/**
 * 被俘概率。
 *
 * 04b2 §6.4 只确认了 `0x40ED3A(g, g->+0xD7)` 返回 0=俘获、非 0=逃脱，
 * **公式本身未解**。这里给一个最小模型（本作的实现选择）：
 * 基础 55%，败方残兵占比越低越高，被围 +20%，夹在 [5%, 95%]。
 */
export function captureChance(loser: PostGeneral, state: PostBattleState): number {
  if (loser.alive === false) return 0;
  const w = Math.max(0, state.winnerSoldiers ?? 0);
  const l = Math.max(0, state.loserSoldiers ?? 0);
  const total = w + l;
  const ratio = total > 0 ? l / total : 0.5;
  let c = 0.55 + (0.5 - ratio) * 0.5;
  if (state.surrounded) c += 0.2;
  return clamp(c, 0.05, 0.95);
}

// ---------------------------------------------------------------------------
// §5.3 物品轮盘

/** `0x408EE2` 的单件权重；0 = 本次不可出 */
export function dropWeight(item: Item, level: number, taken: string[]): number {
  const rate = item.Rate ?? 0;
  if (rate <= 0) return 0;
  if (item.Attrib === 'ONLYONE' && taken.includes(String(item.Sequence))) return 0;
  const st = item.SearchType ?? 0;
  const lv = item.Level ?? 1;
  if (st === 0) return rate;
  if (st === 1) {
    const d = Math.abs(level - lv);
    if (d > 4) return 0;
    return d > 0 ? rate / d : rate;
  }
  // st === 2：等级够（>= Level）给满权重，不够但差 ≤4 按差额衰减
  if (level < lv - 4) return 0;
  return level >= lv ? rate : rate / (lv - level);
}

/**
 * 一次加权轮盘。`taken` 里的唯一物品权重归零（`+0x20==1` → w=0）。
 * 战斗只有胜方掷一次（见 `resolvePostBattle`）。
 *
 * R115：`0x408EE2` 的轮盘落点是 `rand()%total`，给了 `roll` 时走 `roll.int(total)`
 * （`int` 会先 trunc，权重表本身是整数时二者完全等价）；否则仍是旧的 `rng()*total`。
 */
export function rollDrop(
  data: GameData,
  level: number,
  taken: string[],
  rng: () => number,
  roll?: SangoRng | null,
): DropItem | null {
  const pool: { item: Item; w: number }[] = [];
  let total = 0;
  for (const item of data.items) {
    const w = dropWeight(item, level, taken);
    if (w > 0) {
      pool.push({ item, w });
      total += w;
    }
  }
  if (total <= 0 || pool.length === 0) return null;
  let r = roll ? roll.int(total) : rng() * total;
  for (const p of pool) {
    r -= p.w;
    if (r < 0) return { itemId: String(p.item.Sequence), name: p.item.Name };
  }
  const last = pool[pool.length - 1];
  return { itemId: String(last.item.Sequence), name: last.item.Name };
}

// ---------------------------------------------------------------------------
// 主流程

/**
 * 战后处置主流程（`0x40452E` 的自动侧；R54 = 败方**全员**逐个处置）。
 *
 * 顺序：败方参战武将逐个走一遍（主将在前，副将按传入顺序）：
 *   阵亡（`alive === false`）→ 跳过（原作只看 status==3 的被俘者）；
 *   君主（`0x40975E`）→ 不可俘，记 `kingsEscaped`（status 7）后跳过；
 *   被俘掷骰（`0x40ED3A` 未解，用 `captureChance` 的最小模型）→ 没抓住 = 逃脱（status 7）；
 *   被俘 → 招降 `0x404344` → 招不到 50% 斩首 `0x40EF9A` / 50% 释放（status 2）；
 * 最后胜方掷一次掉落轮盘。
 *
 * 单人局（没有 `officers`）时 rng 消耗顺序与旧版逐字一致：
 * 被俘掷骰 → 招降的两次掷骰 → 斩首掷骰（见 tests/capture.test.ts ④⑤）。
 *
 * R115：第 5 参 `roll` 给了原作乱数流时，上面每个掷骰点都改从 `roll` 取数
 * （`rand()%n` → `roll.int(n)`），`rng` 一次也不消费；`roll` 缺省/null 时行为与旧版
 * 逐字节相同。被俘判定用的 `0x40ED3A` 公式未解（`captureChance` 是最小模型），
 * 因此这里用 `roll.float()` 保留同一 [0,1) 分布，而不是硬套某个 `%100`。
 */
export function resolvePostBattle(
  world: PostBattleWorld,
  data: GameData,
  rng: () => number,
  taken: string[] = [],
  roll?: SangoRng | null,
): PostBattleReport {
  if (!world.winner || world.winner === 'draw') return emptyReport();
  const winner: Side = world.winner;
  const loserSide: Side = winner === 'A' ? 'B' : 'A';
  const ws = world.sides[winner];
  const ls = world.sides[loserSide];
  const lg = ls.general;

  const state: PostBattleState = {
    data,
    rng,
    roll: roll ?? null,
    dropTaken: taken,
    winnerSoldiers: ws.aliveCount,
    loserSoldiers: ls.aliveCount,
    // 败方残兵 ≤ 3 或不到一成的残兵被堵住：算被围
    surrounded: ls.aliveCount <= 3 || (ls.start > 0 && ls.aliveCount / ls.start <= 0.1),
  };

  const report: PostBattleReport = emptyReport();
  // R54：`0x40452E` 的 `for (i < loser->count)` —— 败方**全体参战武将**逐个处置。
  // 主将在前，副将按 web 层传入顺序；单人局（没有 officers）就是旧行为。
  const roster: PostGeneral[] = [
    {
      name: lg.name,
      str: lg.str,
      int: lg.int,
      level: lg.level,
      alive: lg.alive,
      loyal: lg.loyal,
      constancy: lg.constancy,
      // 势力侧标记由 web 层挂在 general 上（战场单位没有势力指针），必须一起带过来，
      // 否则 isKing 会被丢掉 → 君主会被俘/被斩（R56 相关回归）
      isKing: lg.isKing,
      lordAlive: lg.lordAlive,
      sameForce: lg.sameForce,
      lordSurrendered: lg.lordSurrendered,
    },
    ...(ls.officers ?? []),
  ];

  for (const raw of roster) {
    if (raw.alive === false) continue; // 阵亡的人不处置（原作只处理 status==3 被俘者）
    // 君主不可俘 `0x40975E`（04b §6.4）：被围住也只是"我們俘虜了敵方君主，但被逃了"，
    // 条目状态改 7（逃脱）——既不进招降，也不进斩首/释放，所以单列 kingsEscaped。
    if (isKingOf(raw, data)) {
      report.kingsEscaped.push(String(raw.name));
      continue;
    }
    // 被俘惩罚 `0x447520`：忠诚 -= (10-节操)*2，先扣再招降。
    // 忠诚/节操优先取武将级字段（web 层从存档带入），没有才查 generals.json。
    const base = profileOf(raw, data);
    const loyal = clamp((raw.loyal ?? base.loyal) - (10 - base.constancy) * 2, 0, 99);
    const target: PostGeneral = { ...raw, alive: true, loyal, constancy: base.constancy };

    // 1) 是否被俘（公式未解，用 captureChance 的最小模型）；没抓住 = 逃脱（status 7）
    //    R115：公式未解 ⇒ 不能声称复刻某个 `rand()%n`，有 roll 时取 `roll.float()`
    //    保持与旧 `rng()` 相同的 [0,1) 均匀分布。
    if ((roll ? roll.float() : rng()) >= captureChance(target, state)) continue;

    // 2) 招降
    const verdict = canRecruit(winner, target, state);
    const nowLoyal = target.loyal ?? loyal;
    const entry: CapturedGeneral = {
      name: target.name,
      str: target.str,
      int: target.int,
      loyal: nowLoyal,
      recruited: verdict.ok,
    };
    report.captures.push(entry);
    if (verdict.ok) {
      // 招降落地 `0x40EEAA`：忠诚 ≥ 50 折成 ×2/3
      if (nowLoyal >= 50) entry.loyal = Math.floor((nowLoyal * 2) / 3);
      report.expBonus += target.level * 16;
      report.meritBonus += 15;
    } else if ((roll ? roll.int(100) : Math.floor(rng() * 100)) < 50) {
      // 3) 斩首 `0x40EF9A`（AI 侧 50%）
      report.executed.push(entry);
      report.expBonus += target.level * 32;
      report.meritBonus += 10;
    } else {
      // 4) 释放（status=2，无字段变更）
      report.released.push(entry);
    }
  }

  // 5) 掉落：**原作战斗不掉落任何物品**（`docs\04b2-战斗流程.md` §5.1 负证据）。
  //    旧实现「胜方战后无条件掷一次轮盘」是取巧/加戏，已按原作删除（R57）。
  //    `rollDrop()` 保留给内政搜索（`city_model.js` 走的是另一条路）与测试用，
  //    这里不再调用；`report.drops` 恒为空数组，调用方不必改。
  return report;
}

// ---------------------------------------------------------------------------
// R25 升級補學武將技 / 軍師技（`0x40A183` / `0x40A227`）
//
// 原作没有技能树：武將記錄裡有一張「習得等級 → 編號」表（`general+0x65`，8 組），
// 每次升級掃一遍，`習得等級 <= 新等級` 且還沒學會的就加進已學表（`+0x54` / `+0x5C`）。
// 本作同樣不存"已學"狀態：只要等級夠就算會，所以升級時把差集報出來即可。

/** 一條習得記錄：`[習得等級, 技能編號]` */
export type LearnRow = [number, number];

/**
 * 解析 `SKILL` / `WISESKILL`。數據裡兩種寫法都存在：
 * 字符串 `"1, 50"`（generals.json 現狀）與數組 `[1, 50]`（types.ts 的聲明）。
 * 臟行（NaN / 缺欄）直接丟掉。
 */
export function parseLearnTable(raw: unknown): LearnRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LearnRow[] = [];
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
    if (Number.isFinite(learn) && Number.isFinite(seq) && learn > 0 && seq > 0) {
      out.push([Math.floor(learn), Math.floor(seq)]);
    }
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function learnRowsOf(data: GameData, name: string, field: 'SKILL' | 'WISESKILL'): LearnRow[] {
  const row = findGeneral(data, name);
  if (!row) return [];
  return parseLearnTable((row as unknown as Record<string, unknown>)[field]);
}

/**
 * 該將在某等級已會的武將技（`習得等級 <= level`，去重、按習得等級排序）。
 * `data.magics` 裡查不到的編號視為臟數據跳過。
 */
export function knownMagicOf(data: GameData, name: string, level: number): number[] {
  const lv = Math.max(1, Math.floor(level));
  const seen = new Set<number>();
  const out: number[] = [];
  for (const [learn, seq] of learnRowsOf(data, name, 'SKILL')) {
    if (learn > lv || seen.has(seq)) continue;
    if (!data.magics.some((m) => m.SEQUENCE === seq)) continue;
    seen.add(seq);
    out.push(seq);
  }
  return out;
}

/** 一條「剛學會」的技能（結算面板與戰報用） */
export interface LearnedSkill {
  kind: 'magic' | 'wise';
  seq: number;
  name: string;
}

/**
 * 升級補學：`from < 習得等級 <= to` 的武將技 / 軍師技。
 * 一次升多級時一起返回；升到 1 級（`from < 1`）同樣會把 1 級技補上。
 */
export function learnedAtLevelUp(
  data: GameData,
  name: string,
  from: number,
  to: number,
): LearnedSkill[] {
  const lo = Number.isFinite(from) ? from : 1;
  const hi = Number.isFinite(to) ? Math.floor(to) : lo;
  if (hi <= lo) return [];
  const out: LearnedSkill[] = [];
  const seenMagic = new Set<number>();
  for (const [learn, seq] of learnRowsOf(data, name, 'SKILL')) {
    if (learn <= lo || learn > hi || seenMagic.has(seq)) continue;
    const m = data.magics.find((x) => x.SEQUENCE === seq);
    if (!m) continue;
    seenMagic.add(seq);
    out.push({ kind: 'magic', seq, name: m.NAME });
  }
  const seenWise = new Set<string>();
  for (const [learn, seq] of learnRowsOf(data, name, 'WISESKILL')) {
    if (learn <= lo || learn > hi) continue;
    const w = data.wises.find((x) => x.SEQUENCE === seq);
    if (!w || seenWise.has(w.NAME)) continue;
    seenWise.add(w.NAME);
    out.push({ kind: 'wise', seq, name: w.NAME });
  }
  return out;
}
