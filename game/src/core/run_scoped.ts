/**
 * RunScoped.ts — 「局内状态」键的清库工具（R214）。
 *
 * 背景：Cocos 的战役存档（`GameState.CampaignSave`）**不做白名单过滤**——`SurrenderModel`
 * 的 `queuePostBattle()` 直接把 `captured` / `executed` 写进同一个对象，`lastBattle` /
 * `lastPost` 也是战后临时键。`initCampaign(fresh)` 在 R214 之前只清 `owned/cities/seeded`，
 * 于是「上一局的待决俘虏队列」会原样活到下一局：2026-11-26 用户实测，选《討伐董卓》+
 * 劉備，一进大地图先弹「处置张角」。
 *
 * 这里把「哪些键属于一局」和「怎么判脏档」抽成纯函数（不 import 'cc'），
 * 好处：① `GameState` 与 `CampaignRoot` 用同一份名单，不会各清一半；
 * ② `game/tests/run_scoped.test.ts` 能直接在 node 里跑断言，不用 mock 引擎。
 */

/** 只在「一局之内」有意义的键。换局（`initCampaign(fresh)`）必须清掉。 */
export const RUN_SCOPED_KEYS = [
  'captured', // SurrenderModel.queuePostBattle：待决俘虏
  'executed', // SurrenderModel.queuePostBattle：已斩首
  'lastBattle', // 上一场战果（判「同一场只处置一次」）
  'lastPost', // 上一场战后明细（招降/掉落等）
  'roster', // 每城在职武将（含 `_moved`）
  'acted', // 逐将年令：今年已行动
  'away', // 在途武将
  // [R246] 下面三个也是「一局之内」的键：不清就会把上一局的死亡/俘虏状态、
  // 「这座城我打下来过」的标记、以及抵达待战的围城快照带进新局 ——
  // 新局里同名武将会因为旧的 '死'/'俘' 被名册自愈剔掉，看起来就是「开局将都没了」。
  'generalStatus', // 逐将生死/被俘（'死' | '俘'）
  'takenOver', // 城名 → 接管月份（R244）
  'siege', // 抵达待战的围城快照（R231）
] as const;

export type RunScopedKey = (typeof RUN_SCOPED_KEYS)[number];

type Bag = Record<string, unknown>;

/** 存档对象按「可增删键」的宽松视图看（与 `GameState` 的白名单口径无关）。 */
function bagOf(save: object): Bag {
  return save as unknown as Bag;
}

/** 把名字数组里的空串/空白剔掉；非数组一律当空。 */
export function nameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const name = String(item ?? '').trim();
    if (name) out.push(name);
  }
  return out;
}

/**
 * 「无主队列」：手里有待决名字，却没有配套的战果记录（`lastBattle`/`lastPost`）。
 *
 * 正常流程里 `queuePostBattle()` 会同时写队列与战果；只有**上一局遗留**（或 R214 之前的
 * 旧版本）才会出现「有队列、没战果」。这种队列不该弹面板——玩家会以为要处置上一局的俘虏。
 *
 * @returns 需要清掉的名字（`captured` + `executed` 的并集）；不需要清时返回 `[]`。
 */
export function staleQueueNames(save: object): string[] {
  const bag = bagOf(save);
  if (bag.lastBattle || bag.lastPost) return [];
  const names = nameList(bag.captured);
  for (const name of nameList(bag.executed)) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * 脏档自愈：清掉无主队列。**不做落盘**（调用方决定何时 `persistSave()`），
 * 因为 `CampaignRoot.start()` 与 `GameState.initCampaign()` 的落盘时机不同。
 *
 * @returns 是否真的清掉了东西（`true` 时调用方应落盘一次）。
 */
export function healStaleQueue(save: object): boolean {
  if (staleQueueNames(save).length === 0) return false;
  delete bagOf(save).captured;
  delete bagOf(save).executed;
  return true;
}

/**
 * 换局清库：删掉全部 `RUN_SCOPED_KEYS`，并把 `armies` 清空（行军中的部队不属于新局）。
 *
 * 注意**不清** `wins` / `losses` / `streak` / `bestStreak`——那是玩家战绩，跨局保留
 * （与 web `saves.js` 的 legacy 计分同义）。
 */
export function clearRunScoped(save: object): void {
  const bag = bagOf(save);
  for (const key of RUN_SCOPED_KEYS) delete bag[key];
  if (Array.isArray(bag.armies)) bag.armies = [];
}

/**
 * 存档里是否还有「待决的俘虏队列」（`captured` / `executed` 非空，空白名不算）。
 *
 * 开面板的前置闸：`surrenderCandidates()` 还会把「城下守将里的君主」做成「逃走」卡，
 * 所以调用方不能只靠 `needSurrenderPanel(cards)` 判空——`atCity` 若用错剧本号
 * （Cocos 之前恒取 `scenIdx=0`），新局也会造出敌将卡，玩家一进大地图就看到
 * 「处置张角」（R214 实测）。语义上「有没有仗打完留下的俘虏」只看这两个队列。
 */
export function hasPendingCaptures(save: object): boolean {
  const bag = bagOf(save);
  const live = (v: unknown): number =>
    Array.isArray(v) ? v.filter((n) => String(n ?? '').trim() !== '').length : 0;
  return live(bag.captured) > 0 || live(bag.executed) > 0;
}