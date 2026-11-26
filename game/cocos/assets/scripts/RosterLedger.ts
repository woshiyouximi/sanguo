/**
 * [R245] 狀態台账：一名武將在任一时刻**恰好**處在一個位置。
 *
 *   城：`save.roster[城]`            —— 在城（面板唯一來源）
 *   隊：`save.armies[i].general/officers` —— 在途兵團
 *   圍：`save.siege`（快照）          —— 已抵達城下、等進戰鬥
 *   亡：`save.generalStatus[名]`      —— '死' / '俘'（不再出現在任何位置）
 *
 * 這個模組只做「讀寫存档」，不碰 Cocos、不碰 UI，所以能在 Node 測試裡直接跑。
 * 規則（`audit()` 會檢查）：
 *   1. 不重疊：一個名字最多在一個位置；
 *   2. 不失踪：健在的將至少有一個位置（開局播種之後）；
 *   3. 不復活：'死'/'俘' 的名字不出現在任何位置；
 *   4. 我方城的守將只讀 `roster`，`cities[城].officers` 只描述敵方城。
 */

/** 台账只关心这几个键；用宽松结构是为了同时接住 GameState 与本模块两份 LedgerSave 声明 */
export type LedgerSave = { [key: string]: unknown };


/** 死/俘 之外的狀態視為健在 */
export const GONE_STATUSES: readonly string[] = ['死', '俘'];

export interface LedgerPlace {
  kind: 'city' | 'army' | 'siege' | 'gone' | 'nowhere';
  city?: string;
  armyId?: string;
  status?: string;
}

interface ArmyLike {
  siegeWait?: unknown;
  id?: unknown;
  side?: unknown;
  general?: unknown;
  officers?: unknown;
  troops?: unknown;
  to?: unknown;
  progress?: unknown;
}

interface SiegeLike {
  target?: unknown;
  city?: unknown;
  general?: unknown;
  officers?: unknown;
  troops?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function rosterOf(save: LedgerSave): Record<string, string[]> {
  const raw = (save as { roster?: unknown }).roster;
  if (!raw || typeof raw !== 'object') {
    const fresh: Record<string, string[]> = {};
    save.roster = fresh;
    return fresh;
  }
  return raw as Record<string, string[]>;
}

function armiesOf(save: LedgerSave): ArmyLike[] {
  const raw = (save as { armies?: unknown }).armies;
  return Array.isArray(raw) ? (raw as ArmyLike[]) : [];
}

function siegeOf(save: LedgerSave): SiegeLike | null {
  const raw = (save as { siege?: unknown }).siege;
  return raw && typeof raw === 'object' ? (raw as SiegeLike) : null;
}

function statusOf(save: LedgerSave, name: string): string {
  const table = save.generalStatus as Record<string, unknown> | undefined;
  if (!table || typeof table !== 'object') return '';
  return str(table[name]);
}

/** 死/俘：不在場上 */
export function isGone(save: LedgerSave, name: string): boolean {
  return GONE_STATUSES.includes(statusOf(save, name));
}

function armyNames(army: ArmyLike): string[] {
  const out: string[] = [];
  const general = str(army.general);
  if (general) out.push(general);
  const officers = army.officers;
  if (Array.isArray(officers)) {
    for (const item of officers) {
      if (typeof item === 'string') {
        const name = str(item);
        if (name) out.push(name);
      } else if (item && typeof item === 'object') {
        const name = str((item as { name?: unknown }).name);
        if (name) out.push(name);
      }
    }
  }
  return out;
}

function siegeNames(siege: SiegeLike): string[] {
  const out: string[] = [];
  const general = str(siege.general);
  if (general) out.push(general);
  const officers = siege.officers;
  if (Array.isArray(officers)) {
    for (const item of officers) {
      if (typeof item === 'string') {
        const name = str(item);
        if (name) out.push(name);
      } else if (item && typeof item === 'object') {
        const name = str((item as { name?: unknown }).name);
        if (name) out.push(name);
      }
    }
  }
  return out;
}

/** 全部在途武將（可只算某一側） */
export function namesInArmies(save: LedgerSave, side?: 'A' | 'B'): string[] {
  const out: string[] = [];
  for (const army of armiesOf(save)) {
    if (side && str(army.side) !== side) continue;
    out.push(...armyNames(army));
  }
  return unique(out);
}

/** 抵達待戰快照裡的武將 */
export function namesInSiege(save: LedgerSave): string[] {
  const siege = siegeOf(save);
  return siege ? unique(siegeNames(siege)) : [];
}

export function unique(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = str(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** 這名武將現在在哪 */
export function locate(save: LedgerSave, name: string): LedgerPlace {
  const who = str(name);
  if (!who) return { kind: 'nowhere' };
  if (isGone(save, who)) return { kind: 'gone', status: statusOf(save, who) };
  const roster = rosterOf(save);
  for (const [city, names] of Object.entries(roster)) {
    if (Array.isArray(names) && names.some((n) => str(n) === who)) return { kind: 'city', city };
  }
  for (const army of armiesOf(save)) {
    if (armyNames(army).includes(who)) return { kind: 'army', armyId: str(army.id) };
  }
  const siege = siegeOf(save);
  if (siege && siegeNames(siege).includes(who)) {
    return { kind: 'siege', city: str(siege.target) || str(siege.city) };
  }
  return { kind: 'nowhere' };
}

export interface LedgerAudit {
  /** 同時出現在兩個以上位置的名字 */
  dupes: string[];
  /** 名冊裡有、卻同時在兵團/圍城裡（幽靈副本） */
  ghosts: string[];
  /** 兵團/圍城裡帶著已死/已俘的名字 */
  missing: string[];
  /** 已死/已俘卻仍出現在名城/兵團/圍城 */
  revived: string[];
}

/** 四條不變量的機械檢查（測試與自檢共用） */
export function audit(save: LedgerSave): LedgerAudit {
  const roster = rosterOf(save);
  const cityOf = new Map<string, string[]>();
  for (const [city, names] of Object.entries(roster)) {
    if (!Array.isArray(names)) continue;
    for (const name of unique(names)) {
      const list = cityOf.get(name) ?? [];
      list.push(city);
      cityOf.set(name, list);
    }
  }
  const armySet = new Set(namesInArmies(save));
  const siegeSet = new Set(namesInSiege(save));

  const dupes: string[] = [];
  const ghosts: string[] = [];
  const missing: string[] = [];
  const revived: string[] = [];

  const all = new Set<string>([...cityOf.keys(), ...armySet, ...siegeSet]);
  for (const name of all) {
    const spots = (cityOf.get(name)?.length ?? 0) + (armySet.has(name) ? 1 : 0) + (siegeSet.has(name) ? 1 : 0);
    if (spots > 1) dupes.push(name);
    if ((cityOf.get(name)?.length ?? 0) > 0 && (armySet.has(name) || siegeSet.has(name))) ghosts.push(name);
    if (isGone(save, name)) revived.push(name);
    if ((armySet.has(name) || siegeSet.has(name)) && isGone(save, name)) missing.push(name);
  }
  return {
    dupes: unique(dupes),
    ghosts: unique(ghosts),
    missing: unique(missing),
    revived: unique(revived),
  };
}

/**
 * 開局播種：把劇本給這座城的駐將寫進 `roster`（只寫一次）。
 * 已經有名字、或這座城是被我方打下來的（`takenOver`），都不動。
 */
export function seedOwnedCity(save: LedgerSave, city: string, names: readonly string[]): boolean {
  const key = str(city);
  if (!key) return false;
  const roster = rosterOf(save);
  const current = roster[key];
  if (Array.isArray(current) && current.length > 0) return false;
  if (save.takenOver && Object.prototype.hasOwnProperty.call(save.takenOver, key)) return false;
  const placed = unique(names).filter((name) => !isGone(save, name));
  if (placed.length === 0) return false;
  roster[key] = placed;
  return true;
}

/**
 * 攻城勝利交接：舊主清空（名冊 + 守將快照 + 記接管月份），存活者寫進新城。
 * 兵團裡的同名將由調用方先撤回，這裡只負責「城」這一側。
 */
export function handoffCapture(
  save: LedgerSave,
  city: string,
  survivors: readonly string[],
): { city: string; removed: string[]; placed: string[] } {
  const key = str(city);
  const roster = rosterOf(save);
  const removed = Array.isArray(roster[key]) ? unique(roster[key]) : [];
  const cities = (save.cities && typeof save.cities === 'object' ? save.cities : {}) as Record<string, Record<string, unknown>>;
  save.cities = cities;
  const state = cities[key];
  if (state && typeof state === 'object') {
    state.officers = [];
  }
  const taken = (save.takenOver && typeof save.takenOver === 'object' ? save.takenOver : {}) as Record<string, number>;
  save.takenOver = taken;
  taken[key] = Math.max(0, Math.floor(num(save.month)) || 0);

  const placed = unique(survivors).filter((name) => !isGone(save, name));
  roster[key] = placed;
  // 同名不許留在別座城（打下城的將是從別處派來的）
  for (const [other, names] of Object.entries(roster)) {
    if (other === key || !Array.isArray(names)) continue;
    const kept = names.filter((n) => !placed.includes(str(n)));
    if (kept.length !== names.length) roster[other] = kept;
  }
  return { city: key, removed, placed };
}

export interface SiegeOutcome {
  armyId: string;
  city: string;
  result: 'captured' | 'repelled';
  attackers: number;
  defenders: number;
  lostCity?: boolean;
}

export interface ResolveOptions {
  /** 城防加成係數：effectiveDefense = troops + defense / divisor（默認 8） */
  defenseDivisor?: number;
  /** 城被圍時城裡該算多少兵 */
  troopsOf?: (city: string) => number;
  defenseOf?: (city: string) => number;
  /** 圍城寬限：敵軍已抵達後再過幾個月邊界才自動結算（默認 2，給玩家點守城戰的時間） */
  minWait?: number;
  /** 守將被俘的到府（默認寫 generalStatus='俘'） */
  onTaken?: (names: readonly string[]) => void;
}

function removeArmy(save: LedgerSave, armyId: string): void {
  const list = (save as { armies?: unknown }).armies;
  if (!Array.isArray(list)) return;
  (save as { armies?: unknown }).armies = list.filter((army) => str((army as ArmyLike).id) !== armyId);
}

/**
 * 月結：處理「已抵達我方城、玩家沒點守城戰」的敵軍。
 *
 * 原作的守城戰是可選的（玩家點才打），所以必須有一個時間兜底，否則敵軍會永遠懸在
 * `progress >= 1`。這裡按兵力比自動出結果：攻方贏則城易手、守將被俘；輸則退兵。
 */
export function resolvePendingSieges(save: LedgerSave, opts: ResolveOptions = {}): SiegeOutcome[] {
  const owned = Array.isArray(save.owned) ? (save.owned as string[]) : [];
  const divisor = opts.defenseDivisor && opts.defenseDivisor > 0 ? opts.defenseDivisor : 8;
  const out: SiegeOutcome[] = [];
  for (const army of armiesOf(save)) {
    if (str(army.side) !== 'B') continue;
    if (num(army.progress) < 1) continue;
    const waited = Math.max(0, Math.floor(num(army.siegeWait)) + 1);
    army.siegeWait = waited;
    if (waited < Math.max(1, Math.floor(opts.minWait ?? 2))) continue;
    const city = str(army.to);
    if (!city || !owned.includes(city)) continue;
    const armyId = str(army.id);
    const attackers = Math.max(1, Math.round(num(army.troops)));
    const cityState = (save.cities && typeof save.cities === 'object' ? (save.cities as Record<string, unknown>)[city] : undefined) as { troops?: unknown; defense?: unknown } | undefined;
    const base = opts.troopsOf ? opts.troopsOf(city) : num(cityState?.troops);
    const defense = opts.defenseOf ? opts.defenseOf(city) : num(cityState?.defense);
    const defenders = Math.max(1, Math.round(base + defense / divisor));
    removeArmy(save, armyId);
    if (attackers > defenders) {
      const roster = rosterOf(save);
      const garrison = Array.isArray(roster[city]) ? unique(roster[city]) : [];
      handoffCapture(save, city, []);
      save.owned = owned.filter((name) => name !== city);
      const cities = (save.cities && typeof save.cities === 'object' ? save.cities : {}) as Record<string, Record<string, unknown>>;
      save.cities = cities;
      const state = (cities[city] ??= {});
      state.troops = Math.max(0, attackers - defenders);
      state.officers = unique([str(army.general), ...armyNames(army).slice(1)]);
      const fate = (save.generalStatus && typeof save.generalStatus === 'object' ? save.generalStatus : {}) as Record<string, string>;
      save.generalStatus = fate;
      for (const name of garrison) fate[name] = '俘';
      if (opts.onTaken) opts.onTaken(garrison);
      out.push({ armyId, city, result: 'captured', attackers, defenders, lostCity: true });
    } else {
      const cities = (save.cities && typeof save.cities === 'object' ? save.cities : {}) as Record<string, Record<string, unknown>>;
      save.cities = cities;
      const state = (cities[city] ??= {});
      state.troops = Math.max(1, defenders - attackers);
      out.push({ armyId, city, result: 'repelled', attackers, defenders });
    }
  }
  return out;
}

