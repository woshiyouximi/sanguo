/**
 * AiRunner.ts — 大地图 AI 的「一个月」编排（Cocos 侧唯一入口）
 *
 * 职责（对应 game\web\campaign.html 的 buildWorld → runAiMonth → applyWorld 三步）：
 *   1. 势力同步：把「城 → 势力」补齐到 save.cities[*].owner，buildForces + syncOwned；
 *   2. 行动选择：prepareMonth + planMonth（每势力每月 MONTH_ACTION_MAX 条）；
 *   3. 执行：executeMonth；
 *   4. 战果：打 AI 的仗就地 resolveBattle（含君主阵亡 / 势力继承），
 *      打玩家的仗**不结算**，作为 incoming 交给宿主的守城战（与 web 版一致）；
 *   5. 灭亡检查：checkForceDeaths；
 *   6. 回写：applyWorld（兵 / 钱 / 人口 / 城主 / 太守 / 武将 / 城防 / 势力 / 玩家势力 id）；
 *   7. 漂移：monthlyDrift（疲劳 / 士气 / 忠诚）。
 *
 * 约束：
 *   · 本文件不 import 'cc'，不碰任何 UI 节点、不读 localStorage，可在 node 里直接跑；
 *   · **不推进月份**：调用方（CampaignRoot）先做 GameState.advanceMonth / marchArmies，
 *     再调用本函数；月份只用于种子与日志；
 *   · 用同一份 state + 同一 seed 调用两次，结果完全一致（rng = seedRng((month+1)*7919)）。
 *
 * 宿主接线（补丁见 project\102_Cocos_AI移植.md）：
 *   const ai = AiRunner.runMonth(this.save, this.cities, this.generals, {
 *     paths: this.paths,
 *     garrisonOf: (name) => this.enemyIntelOf(name),
 *     capOf: (name) => GameState.garrisonOf(this.cityOf(name)),
 *   });
 *   if (ai.changed) this.save = GameState.loadSave();
 */

import {
  ACT,
  ACT_NAMES,
  KIND_NAMES,
  buildForces,
  captureKingIn,
  checkForceDeaths,
  describeAction,
  executeMonth,
  forceOf,
  monthlyDrift,
  planMonth,
  prepareMonth,
  resolveBattle,
  seedRng,
  syncOwned,
  troopsOf,
} from './AiModel';
import type {
  AiAction,
  AiCandidate,
  AiCity,
  AiCityMeta,
  AiDriftResult,
  AiExecutedRow,
  AiForce,
  AiForceReport,
  AiMonthCtx,
  AiOfficer,
  AiPath,
  AiRng,
  AiRules,
  AiSave,
  AiWorld,
} from './AiModel';

/** 玩家势力 id（Cocos 存档没有君主名，默认用这个；宿主可用 ctx.playerId 覆盖） */
export const PLAYER_FORCE = '玩家';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};
const intOf = (v: unknown, d = 0): number => Math.trunc(num(v)) || d;

/** garrison.json 的城内情报表（core/garrison.ts 的 Garrison 结构兼容） */
export interface AiRunnerGarrison {
  owner?: string;
  major?: string;
  wise?: string;
  garrison?: number;
  DEFENSE?: number;
  defense?: number;
  officers?: Array<{
    name?: string;
    str?: number;
    int?: number;
    loyal?: number;
    status?: string | number;
    NAME?: string;
    STR?: number;
    INT?: number;
    LOYAL?: number;
    STATUS?: string | number;
  }>;
}

/** 打玩家：交给宿主开守城战（与 campaign.html 的 incoming 行同义） */
export interface AiRunnerIncoming {
  force: string;
  from: string;
  to: string;
  troops: number;
  joinCity?: string;
  /** 目标城守军（出兵前的世界值） */
  defenders: number;
  act: number;
  cand: AiCandidate;
}

/** 打 AI：本函数已就地结算 */
export interface AiRunnerBattle {
  force: string;
  from: string;
  to: string;
  captured: boolean;
  skipped: boolean;
  attackers: number;
  defenders: number;
  left: number;
  attacker: string;
  defender: string;
  oldMajor: string;
}

export interface AiRunnerCtx {
  /** 玩家势力 id；缺省用 save.king，再缺省用 save.owned 非空时的 PLAYER_FORCE */
  playerId?: string;
  /** 路网（缺省用 save.paths） */
  paths?: AiPath[];
  /** 规则（默认 { cheat:false }） */
  rules?: AiRules;
  /** 行动随机种子；缺省 (month+1)*7919，与 web 一致 */
  seed?: number;
  /** 直接给 rng（优先于 seed；plan 与 execute 共用，调用顺序会体现在结果里） */
  rand?: AiRng;
  /** 每势力每月动作数（默认 1） */
  maxPerForce?: number;
  /** kind 白名单（调试用） */
  kinds?: string[];
  /** 人才池（搜索/登用会从这里取，取走即消耗） */
  talentPool?: unknown[];
  /** 城归属解析：优先 save.cities[name].owner，其次本回调，其次 garrisonOf */
  ownerOf?: (name: string) => unknown;
  /** 城内情报（owner / major / officers / DEFENSE），宿主从 core/garrison 或 garrison.json 取 */
  garrisonOf?: (name: string) => AiRunnerGarrison | null | undefined;
  capOf?: (name: string) => unknown;
  limitOf?: (name: string) => unknown;
  distanceOf?: (a: string, b: string) => unknown;
  neighborsOf?: (name: string) => unknown;
  /** 默认 true；false 可跳过漂移 */
  drift?: boolean;
  /** 漂移部位（'tire,spirit,loyal' 的子集，见 AiModel.monthlyDrift） */
  driftParts?: string;
  /** 武将表行（LOYAL 等），缺省用 runMonth 的 generals 参数 */
  rowOf?: (name: string) => unknown;
  /** 打玩家的仗是否就地结算（默认 false → 走 incoming + 守城战） */
  resolvePlayerBattles?: boolean;
  /** 君主阵亡后是否让继承人继位（传给 captureKingIn） */
  inherit?: boolean;
  onIncoming?: (row: AiRunnerIncoming) => void;
  onBattle?: (row: AiRunnerBattle) => void;
  onForceGone?: (id: string) => void;
}

export interface AiMonthOutcome {
  month: number;
  log: string[];
  changed: boolean;
  actions: AiAction[];
  executed: AiExecutedRow[];
  reports: AiForceReport[];
  incoming: AiRunnerIncoming[];
  battles: AiRunnerBattle[];
  gone: string[];
  drift: AiDriftResult | null;
  forces: string[];
  seed: number;
}

// ── 夹具归一化 ────────────────────────────────────────────────────────────

function lookupGarrison(ctx: AiRunnerCtx | undefined, name: string): AiRunnerGarrison | null {
  if (!ctx || typeof ctx.garrisonOf !== 'function' || !name) return null;
  const g = ctx.garrisonOf(name);
  return g && typeof g === 'object' ? g : null;
}

/** 狀態歸一：字串原樣（空字串按 '登'）、有限數字原樣、其餘 '登'（與 `GameState.officerStatusOf` 同規則） */
function officerStatusOf(value: unknown): string | number {
  if (typeof value === 'string') return value || '登';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return '登';
}

/**
 * [OFFICER_OBJ] 武將清單 → 存檔物件形 `{name,str,int,loyal,status}`。
 *
 * 三處共用：`buildMeta`（劇本行 / 宿主情報 → meta）、`ensureMeta`（meta → 存檔補缺）、
 * `applyWorld`（世界 → 存檔回寫）。以前 `applyWorld` 只寫 `{...o}`、舊檔的純字串則整批被
 * `GameState.normalize()` 的 `stringArray()` 濾掉（project/106 §7.2 的跨月人事丟失）。
 *   · 純字串（更早的存檔形狀）→ 補 `{str:0,int:0,loyal:0,status:'登'}`，不丟人；
 *   · 名字認 `name` / `NAME`，沒名字的項丟掉（其餘項照收）；
 *   · str/int/loyal 走 `Math.trunc(num(...))` 補 0；status 保留 `string|number`（garrison 是
 *     '登'/'野'，AiModel 可能寫數字）；
 *   · **以 `{...raw}` 起手**：模組/新版本多帶的鍵原樣留下（與 GameState 存檔清洗同一規則）。
 *
 * 回傳型別用 `AiOfficer` 而不是 `GameState.CityOfficer`：AiRunner 必須保持「node 可直接
 * import、運行時不依賴 'cc'」，而 GameState 頂部 `import ... from 'cc'`。兩者形狀相同，
 * 存檔側由 `GameState.cityOfficersOf()` 再清洗一次。
 */
export function toCityOfficers(list: unknown): AiOfficer[] {
  if (!Array.isArray(list)) return [];
  const out: AiOfficer[] = [];
  for (const raw of list) {
    if (typeof raw === 'string') {
      const name = raw.trim();
      if (name) out.push({ name, str: 0, int: 0, loyal: 0, status: '登' });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const name = str(rec.name) || str(rec.NAME);
    if (!name) continue;
    const o = { ...rec } as AiOfficer;
    o.name = name;
    o.str = Math.trunc(num(rec.str ?? rec.STR));
    o.int = Math.trunc(num(rec.int ?? rec.INT));
    o.loyal = Math.trunc(num(rec.loyal ?? rec.LOYAL));
    o.status = officerStatusOf(rec.status ?? rec.STATUS);
    out.push(o);
  }
  return out;
}

function rowList(cities: unknown): AiCityMeta[] {
  const out: AiCityMeta[] = [];
  if (Array.isArray(cities)) {
    for (const row of cities) if (row && typeof row === 'object') out.push(row as AiCityMeta);
  } else if (cities && typeof cities === 'object') {
    const table = cities as Record<string, AiCityMeta>;
    for (const key of Object.keys(table)) {
      const row = table[key];
      if (row && typeof row === 'object') out.push({ ...row, NAME: str(row.NAME) || key });
    }
  }
  return out;
}

/**
 * 剧本城市行 + 宿主情报 → prepareMonth 要的 meta 行。
 * owner 优先级：行上的 owner → garrison.owner → 行上的 KING（剧本君主）。
 */
export function buildMeta(cities: unknown, ctx: AiRunnerCtx = {}): AiCityMeta[] {
  return rowList(cities).map((row) => {
    const name = str(row.NAME);
    const g = lookupGarrison(ctx, name);
    const officers = toCityOfficers(g?.officers);
    const rowOff = toCityOfficers(row.officers);
    const defense = num(row.DEFENSE ?? row.defense ?? g?.DEFENSE ?? g?.defense);
    return {
      ...row,
      NAME: name,
      owner: str(row.owner) || str(g?.owner) || str(row.KING),
      MAJOR: str(row.MAJOR) || str(g?.major),
      officers: officers.length ? officers : rowOff,
      DEFENSE: Math.max(0, Math.trunc(defense)),
    } as AiCityMeta;
  });
}

/**
 * 把 meta 里宿主才有的人事字段补进 save.cities（只补缺，不覆盖已有值）。
 *
 * 导出是给对拍脚本/其它宿主用的（`work\cocos_officers85\parity.mjs` 要用同一支补缺逻辑
 * 才能和 `runMonth()` 内部走一样的路径）；业务代码用 `runMonth()` 就够了。
 */
export function ensureMeta(state: AiSave, meta: AiCityMeta[]): boolean {
  const cities = state.cities && typeof state.cities === 'object' ? state.cities : (state.cities = {});
  let changed = false;
  for (const m of meta) {
    const name = str(m.NAME);
    if (!name) continue;
    const cur = cities[name];
    const st: AiCity = cur && typeof cur === 'object' ? cur : (cities[name] = {});
    if (typeof st.owner !== 'string') {
      st.owner = str(m.owner);
      changed = true;
    } else if (!st.owner && str(m.owner)) {
      st.owner = str(m.owner);
      changed = true;
    }
    if (!str(st.major) && str(m.MAJOR)) {
      st.major = str(m.MAJOR);
      changed = true;
    }
    // [OFFICER_OBJ] 存檔裡的 officers 是物件陣列（舊檔的純字串先由 GameState 補成物件）。
    const metaOfficers = toCityOfficers(m.officers);
    if ((!Array.isArray(st.officers) || !st.officers.length) && metaOfficers.length) {
      st.officers = metaOfficers;
      changed = true;
    }
    if (st.DEFENSE === undefined && m.DEFENSE !== undefined) {
      st.DEFENSE = m.DEFENSE;
      changed = true;
    }
  }
  return changed;
}

function officerSig(list: unknown): string {
  if (!Array.isArray(list)) return '';
  const names: string[] = [];
  for (const o of list) {
    const n = str((o as Record<string, unknown>)?.name);
    if (n) names.push(n);
  }
  return names.join('|');
}

/** world → save（比 campaign.html 的 applyWorld 多回写 major / officers / DEFENSE） */
export function applyWorld(state: AiSave, world: AiWorld | null | undefined): boolean {
  const s: AiSave = state && typeof state === 'object' ? state : {};
  const w = world || {};
  const cities = s.cities && typeof s.cities === 'object' ? s.cities : (s.cities = {});
  const src = w.cities && typeof w.cities === 'object' ? w.cities : {};
  let changed = false;
  for (const name of Object.keys(src)) {
    const sc = src[name];
    if (!sc || typeof sc !== 'object') continue;
    const cur = cities[name];
    const st: AiCity = cur && typeof cur === 'object' ? cur : (cities[name] = {});
    const troops = Math.max(0, Math.trunc(num(sc.troops)));
    const money = Math.max(0, Math.trunc(num(sc.money)));
    const pop = Math.max(0, Math.trunc(num(sc.pop)));
    if (num(st.troops) !== troops) { st.troops = troops; changed = true; }
    if (num(st.money) !== money) { st.money = money; changed = true; }
    if (num(st.pop) !== pop) { st.pop = pop; changed = true; }
    if (typeof sc.owner === 'string' && str(st.owner) !== sc.owner) { st.owner = sc.owner; changed = true; }
    if (typeof sc.major === 'string' && str(st.major) !== sc.major) { st.major = sc.major; changed = true; }
    // [OFFICER_OBJ] 回寫**物件陣列**（GameState 的 `CityRuntime.officers` 已是 CityOfficer[]）；
    // 走 toCityOfficers 而不是裸 `{...o}`：補齊 5 個已知鍵、同時保住世界裡多帶的擴展鍵。
    if (Array.isArray(sc.officers) && officerSig(st.officers) !== officerSig(sc.officers)) {
      st.officers = toCityOfficers(sc.officers);
      changed = true;
    }
    if (sc.DEFENSE !== undefined && num(st.DEFENSE) !== num(sc.DEFENSE)) { st.DEFENSE = num(sc.DEFENSE); changed = true; }
  }
  if (w.forces && typeof w.forces === 'object') {
    s.forces = w.forces as Record<string, AiForce>;
    changed = true;
  }
  const pid = str(w.playerId);
  if (pid && str(s.king) !== pid) { s.king = pid; changed = true; }
  return changed;
}

function officersByCity(world: AiWorld | null | undefined): Record<string, AiOfficer[]> {
  const out: Record<string, AiOfficer[]> = {};
  const cities = world?.cities && typeof world.cities === 'object' ? world.cities : {};
  for (const name of Object.keys(cities)) {
    const list = cities[name]?.officers;
    if (Array.isArray(list) && list.length) out[name] = list;
  }
  return out;
}

/**
 * 武将名 → 行（漂移取忠誠用）。
 * 先查世界里的武将对象（garrison.json 的 officers 带 loyal/str/int，与 web 版 drift 的入参同源），
 * 查不到再退回 generals.json 的行（其忠誠字段名是 `LOYAL`；本表实际为空，见报告 [推测]）。
 */
function officerRowIndex(world: AiWorld | null | undefined): (name: string) => unknown {
  const map = new Map<string, unknown>();
  const cities = world?.cities && typeof world.cities === 'object' ? world.cities : {};
  for (const city of Object.keys(cities)) {
    const list = cities[city]?.officers;
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      const n = str((o as AiOfficer)?.name);
      if (n && !map.has(n)) map.set(n, o);
    }
  }
  return (name: string): unknown => map.get(name) ?? null;
}

function generalIndex(generals: unknown): (name: string) => unknown {
  const map = new Map<string, unknown>();
  const add = (row: unknown, key?: string): void => {
    if (!row || typeof row !== 'object') return;
    const name = str((row as Record<string, unknown>).NAME) || str((row as Record<string, unknown>).name) || str(key);
    if (name) map.set(name, row);
  };
  if (Array.isArray(generals)) {
    for (const row of generals) add(row);
  } else if (generals && typeof generals === 'object') {
    const table = generals as Record<string, unknown>;
    for (const key of Object.keys(table)) add(table[key], key);
  }
  return (name: string): unknown => map.get(name) ?? null;
}

function actName(act: unknown): string {
  const i = Math.max(0, Math.min(ACT_NAMES.length - 1, Math.trunc(num(act))));
  return ACT_NAMES[i] || '?';
}

function kindName(kind: unknown): string {
  const k = str(kind);
  if (!k) return '';
  return str(KIND_NAMES[k]) || k;
}

// ── 一月 ──────────────────────────────────────────────────────────────────

/**
 * 推进一个月的 AI（世界仍由调用方推进月份）。
 * @param state   Cocos 存档（CampaignSave 可直接传：所有字段可选）
 * @param cities  剧本城市行（scenarios.json 的 cities，或 name→行）
 * @param generals 武将表行（generals.json；用于忠誠漂移与搜索人才池）
 * @param ctx     宿主情报与钩子（见 AiRunnerCtx）
 */
export function runMonth(
  state: AiSave,
  cities: unknown,
  generals: unknown,
  ctx: AiRunnerCtx = {},
): AiMonthOutcome {
  const s: AiSave = state && typeof state === 'object' ? state : {};
  const c: AiRunnerCtx = ctx && typeof ctx === 'object' ? ctx : {};
  const log: string[] = [];
  let changed = false;

  // 1) 势力同步 ────────────────────────────────────────────────────────
  const meta = buildMeta(cities, c);
  changed = ensureMeta(s, meta) || changed;

  const ownedList = Array.isArray(s.owned) ? s.owned.filter((n): n is string => typeof n === 'string') : [];
  if (!str(s.king)) s.king = str(c.playerId) || (ownedList.length ? PLAYER_FORCE : '');
  const playerId = str(c.playerId) || str(s.king);

  const metaByName = new Map<string, AiCityMeta>();
  for (const m of meta) {
    const n = str(m.NAME);
    if (n) metaByName.set(n, m);
  }
  const stateCities = s.cities && typeof s.cities === 'object' ? s.cities : (s.cities = {});
  const owners: Record<string, string> = {};
  for (const name of Object.keys(stateCities)) {
    owners[name] = str(stateCities[name]?.owner)
      || str(metaByName.get(name)?.owner)
      || str(typeof c.ownerOf === 'function' ? c.ownerOf(name) : '');
  }
  buildForces(s, owners);
  const ownedBefore = ownedList.slice();
  syncOwned(s);
  if (ownedBefore.join('|') !== (Array.isArray(s.owned) ? s.owned.join('|') : '')) changed = true;

  // 2) 行动选择 ────────────────────────────────────────────────────────
  const month = Math.max(0, Math.trunc(num(s.month)));
  const seed = c.seed === undefined ? (month + 1) * 7919 : Math.trunc(num(c.seed));
  const rand: AiRng = typeof c.rand === 'function' ? c.rand : seedRng(seed);
  const pool = Array.isArray(c.talentPool) ? c.talentPool : (Array.isArray(s.talentPool) ? s.talentPool : undefined);
  const generalRow = typeof c.rowOf === 'function' ? c.rowOf : generalIndex(generals);

  const ownerOf = (name: string): string => str(stateCities[name]?.owner) || str(metaByName.get(name)?.owner);
  const wctx: AiMonthCtx = {
    playerId,
    rules: c.rules || { cheat: false },
    rand,
    seed,
    ownerOf,
  };
  if (Array.isArray(c.paths)) wctx.paths = c.paths;
  else if (Array.isArray(s.paths)) wctx.paths = s.paths;
  if (pool) wctx.talentPool = pool;
  if (typeof c.maxPerForce === 'number' && c.maxPerForce > 0) wctx.maxPerForce = Math.max(1, Math.trunc(c.maxPerForce));
  if (Array.isArray(c.kinds) && c.kinds.length) wctx.kinds = c.kinds;
  if (typeof c.capOf === 'function') wctx.capOf = c.capOf;
  if (typeof c.limitOf === 'function') wctx.limitOf = c.limitOf;
  if (typeof c.distanceOf === 'function') wctx.distanceOf = c.distanceOf;
  if (typeof c.neighborsOf === 'function') wctx.neighborsOf = c.neighborsOf;

  const world = prepareMonth(s, meta, wctx);
  const actions = planMonth(s, meta, wctx);

  // 3) 执行 ────────────────────────────────────────────────────────────
  const res = executeMonth(world, actions, { rng: rand });
  const executed = Array.isArray(res?.executed) ? res.executed : [];
  const reports = Array.isArray(res?.reports) ? res.reports : [];

  const incoming: AiRunnerIncoming[] = [];
  const battles: AiRunnerBattle[] = [];
  const tags: string[] = [];

  for (const row of executed) {
    const cand = row?.cand;
    const result = row?.result;
    const force = str(row?.force) || str(cand?.force);
    const act = Math.trunc(num(cand?.act));
    const to = str(cand?.to);
    if (!result || result.ok === false) {
      log.push(`  ${actName(act)} 未 執 行：${str(result?.reason) || '?'}`);
      continue;
    }
    const tag = `${force}·${act === ACT.NONE && cand?.kind ? kindName(cand.kind) : actName(act)}`;
    if (tags.indexOf(tag) < 0) tags.push(tag);

    const guest = result.kind === 'battle' && to !== '' && (act === ACT.ATTACK_PLAYER || forceOf(world, to) === playerId);
    if (guest && c.resolvePlayerBattles !== true) {
      const inc: AiRunnerIncoming = {
        force,
        from: str(cand?.from),
        to,
        troops: Math.max(1, Math.trunc(num(result.troops))),
        defenders: troopsOf(world, to),
        act,
        cand: cand as AiCandidate,
      };
      const joinCity = str(cand?.joinCity);
      if (joinCity) inc.joinCity = joinCity;
      incoming.push(inc);
      log.push(`  ${describeAction(world, cand)}（待 守 城 戰）`);
      if (typeof c.onIncoming === 'function') c.onIncoming(inc);
      continue;
    }

    if (result.kind === 'battle') {
      const rb = resolveBattle(world, result, rand);
      const captured = rb.captured === true;
      const bt: AiRunnerBattle = {
        force,
        from: str(cand?.from),
        to,
        captured,
        skipped: rb.skipped === true,
        attackers: Math.trunc(num(rb.atk)),
        defenders: Math.trunc(num(rb.def)),
        left: Math.trunc(num(rb.left)),
        attacker: str(rb.attacker),
        defender: str(rb.defender),
        oldMajor: str(rb.oldMajor),
      };
      battles.push(bt);
      if (typeof c.onBattle === 'function') c.onBattle(bt);
      log.push(`  ${describeAction(world, cand)} → ${captured ? '得 手' : '敗 退'}（守 ${bt.defenders} 兵）`);
      if (captured && bt.defender) {
        const cap = captureKingIn(world, to, {
          major: bt.oldMajor,
          owner: bt.defender,
          ...(c.inherit === true ? { inherit: true } : {}),
        });
        if (cap && cap.killed) {
          const heir = str(cap.heir);
          log.push(`  ${bt.defender} 的君主陣亡於 ${to}${heir ? `，${heir} 繼位` : cap.extinguished ? '，勢力滅亡' : ''}`);
        }
      }
      continue;
    }

    log.push(`  ${describeAction(world, cand)}`);
  }

  // 4) 内政即时回报（徵兵） ─────────────────────────────────────────────
  for (const rep of reports) {
    const force = str(rep?.force);
    const imm = Array.isArray(rep?.immediate) ? rep.immediate : [];
    for (const one of imm) {
      const im = one as Record<string, unknown>;
      log.push(`  ${force} 徵 兵 ${str(im.city)} +${Math.trunc(num(im.troops))}`);
    }
  }

  // 5) 灭亡检查 ────────────────────────────────────────────────────────
  const gone = checkForceDeaths(world);
  for (const id of gone) {
    log.push(`  勢 力 滅 亡：${str(id)}`);
    if (typeof c.onForceGone === 'function') c.onForceGone(str(id));
  }

  // 6) 回写 ────────────────────────────────────────────────────────────
  changed = applyWorld(s, world) || changed;
  syncOwned(s);
  if (gone.length) changed = true;
  if (executed.length) changed = true;
  if (pool) s.talentPool = pool;

  // 7) 漂移 ────────────────────────────────────────────────────────────
  let drift: AiDriftResult | null = null;
  if (c.drift !== false) {
    const worldOfficer = officerRowIndex(world);
    const rowOf = (name: string): unknown => worldOfficer(name) ?? generalRow(name);
    const opts: { parts?: string; rowOf?: (name: string) => unknown } = { rowOf };
    if (typeof c.driftParts === 'string' && c.driftParts) opts.parts = c.driftParts;
    drift = monthlyDrift(s, officersByCity(world), opts);
    const moved = drift.tire.down + drift.spirit.down + drift.spirit.up + drift.loyal.down + drift.loyal.up;
    if (moved > 0) {
      changed = true;
      log.push(
        `  月 度 漂 移：疲勞 −${drift.tire.down}、士氣 ↑${drift.spirit.up} ↓${drift.spirit.down}`
        + `、忠誠 ↑${drift.loyal.up} ↓${drift.loyal.down}`,
      );
    }
  }

  if (tags.length) log.unshift(`AI 月 報：${tags.length} 個勢力行動（${tags.join('、')}）`);

  const forces = checkForceDeaths === undefined ? [] : Object.keys(s.forces && typeof s.forces === 'object' ? s.forces : {});
  return {
    month,
    log,
    changed,
    actions: Array.isArray(actions) ? actions : [],
    executed,
    reports,
    incoming,
    battles,
    gone,
    drift,
    forces,
    seed,
  };
}

/** 只做「一次一月」的外部入口别名，便于宿主按语义书写 */
export const runAiMonth = runMonth;
