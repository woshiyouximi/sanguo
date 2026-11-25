#!/usr/bin/env node
// work/cocos_ai84/parity.mjs
// ─────────────────────────────────────────────────────────────────────────────
// 等价性对拍：web 版 `game/web/ai_model.js`  vs  Cocos 移植 `build/AiModel.js`
//
// 用法：
//   1) cd F:\sanguo && node game/node_modules/typescript/bin/tsc -p work/cocos_ai84/tsconfig.build.json
//   2) cd F:\sanguo && node work/cocos_ai84/parity.mjs
//
// 环境变量（可选）：PARITY_SCENARIOS(默认5) / PARITY_MONTHS(默认12) / PARITY_PLAYER_RANK(默认1)
//                  / PARITY_SHOW(默认20，打印多少条不一致)
//
// 设计：**同一个驱动函数**（runCase / unitChecks）分别喂给两个模块，输入完全相同、
//       随机数全部用同一 seed 的 mulberry32（seedRng）串起来，因此任何输出差异都只能来自移植。
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DATA = path.join(ROOT, 'game', 'data');
const WEB_ENTRY = path.join(ROOT, 'game', 'web', 'ai_model.js');
const COC_ENTRY = path.join(HERE, 'build', 'AiModel.js');

const CFG = {
  scenarios: clampInt(process.env.PARITY_SCENARIOS, 5, 1, 5),
  months: clampInt(process.env.PARITY_MONTHS, 12, 1, 60),
  playerRank: clampInt(process.env.PARITY_PLAYER_RANK, 1, 0, 4),
  show: clampInt(process.env.PARITY_SHOW, 20, 0, 200),
};

// ── 驱动自带的小工具（不 import 任何一侧，避免偏袒） ─────────────────────────
function clampInt(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v));
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

// ── 逐字段 diff ─────────────────────────────────────────────────────────────
function brief(v) {
  if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  if (typeof v === 'object' && v !== null) {
    try {
      const s = JSON.stringify(v);
      return s.length > 240 ? `${s.slice(0, 240)}…` : s;
    } catch {
      return String(v);
    }
  }
  return v;
}

function diff(a, b, where, acc) {
  const sameNum = typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  if (a === b || sameNum) {
    acc.fields += 1;
    return;
  }
  const ta = a === null ? 'null' : typeof a;
  const tb = b === null ? 'null' : typeof b;
  if (ta !== 'object' || tb !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
    acc.fields += 1;
    acc.misses.push({ path: where, web: brief(a), cocos: brief(b) });
    return;
  }
  if (Array.isArray(a)) {
    acc.fields += 1;
    if (a.length !== b.length) acc.misses.push({ path: `${where}.length`, web: a.length, cocos: b.length });
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) diff(a[i], b[i], `${where}[${i}]`, acc);
    return;
  }
  acc.fields += 1;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const ha = Object.prototype.hasOwnProperty.call(a, k);
    const hb = Object.prototype.hasOwnProperty.call(b, k);
    if (!ha || !hb) {
      acc.misses.push({ path: `${where}.${k}`, web: ha ? brief(a[k]) : '<missing>', cocos: hb ? brief(b[k]) : '<missing>' });
      continue;
    }
    diff(a[k], b[k], `${where}.${k}`, acc);
  }
}

// ── 快照（形状固定，方便逐字段比对） ───────────────────────────────────────
function snapCities(cities) {
  const out = {};
  const src = cities && typeof cities === 'object' ? cities : {};
  for (const name of Object.keys(src).sort()) {
    const c = src[name] || {};
    out[name] = {
      owner: str(c.owner),
      troops: Math.trunc(num(c.troops)),
      money: Math.trunc(num(c.money)),
      pop: Math.trunc(num(c.pop)),
      major: str(c.major),
      def: Math.trunc(num(c.DEFENSE)),
      flags: Math.trunc(num(c.flags)),
      rate: Math.trunc(num(c.rate)),
      officers: Array.isArray(c.officers)
        ? c.officers.map((o) => (typeof o === 'string'
          ? { name: o, str: 0, int: 0, status: '' }
          : { name: str(o && o.name), str: Math.trunc(num(o && o.str)), int: Math.trunc(num(o && o.int)), status: str(o && o.status) }))
        : [],
    };
  }
  return out;
}

function snapForces(forces) {
  const out = {};
  const src = forces && typeof forces === 'object' ? forces : {};
  for (const id of Object.keys(src).sort()) {
    const f = src[id] || {};
    out[id] = {
      id: str(f.id),
      king: str(f.king),
      flag: Math.trunc(num(f.flag)),
      ts: Math.trunc(num(f.ts)),
      alive: f.alive,
      cities: Array.isArray(f.cities) ? f.cities.slice() : [],
    };
  }
  return out;
}

function snapMap(raw) {
  const out = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const k of Object.keys(src).sort()) out[k] = Math.trunc(num(src[k]));
  return out;
}

function snapSave(save) {
  const s = save || {};
  return {
    king: str(s.king),
    month: Math.trunc(num(s.month)),
    owned: Array.isArray(s.owned) ? s.owned.slice() : [],
    cities: snapCities(s.cities),
    forces: snapForces(s.forces),
    tire: snapMap(s.tire),
    morale: snapMap(s.morale),
    loyal: snapMap(s.loyal),
  };
}

function serCand(c) {
  if (!c || typeof c !== 'object') return c === null || c === undefined ? null : str(c);
  return {
    keys: Object.keys(c).sort().join(','),
    act: Math.trunc(num(c.act)),
    actName: str(c.actName),
    kind: str(c.kind),
    sub: str(c.sub),
    from: str(c.from),
    to: str(c.to),
    joinCity: str(c.joinCity),
    a: c.a === undefined ? '<undef>' : Math.trunc(num(c.a)),
    b: c.b === undefined ? '<undef>' : Math.trunc(num(c.b)),
    c: c.c === undefined ? '<undef>' : Math.trunc(num(c.c)),
    rate: c.rate === undefined ? '<undef>' : Math.trunc(num(c.rate)),
    score: c.score === undefined ? '<undef>' : Math.trunc(num(c.score)),
    gold: c.gold === undefined ? '<undef>' : Math.trunc(num(c.gold)),
    troops: c.troops === undefined ? '<undef>' : Math.trunc(num(c.troops)),
    officer: str(c.officer),
    note: str(c.note),
    reason: str(c.reason),
    rank: c.rank === undefined ? '<undef>' : Math.trunc(num(c.rank)),
    generals: Array.isArray(c.generals) ? c.generals.map(str) : [],
  };
}

function serAction(a) {
  if (!a || typeof a !== 'object') return { invalid: brief(a) };
  return {
    ...serCand(a),
    force: str(a.force),
    cand: serCand(a.cand),
  };
}

const RESULT_KEYS = [
  'ok', 'reason', 'kind', 'type', 'act', 'text', 'debug', 'captured', 'empty', 'skipped',
  'attacker', 'defender', 'atk', 'def', 'left', 'oldMajor', 'gold', 'troops', 'before', 'after',
  'pop', 'defense', 'found',
];

function serResult(r) {
  if (!r || typeof r !== 'object') return r === null || r === undefined ? null : { invalid: brief(r) };
  const out = { keys: Object.keys(r).sort().join(',') };
  for (const k of RESULT_KEYS) {
    const v = r[k];
    if (v === undefined) continue;
    out[k] = typeof v === 'number' ? Math.trunc(v) : typeof v === 'boolean' ? v : str(v);
  }
  return out;
}

function serStages(st) {
  const s = st || {};
  return {
    domestic: Math.trunc(num(s.domestic)),
    recruit: Math.trunc(num(s.recruit)),
    attack: Math.trunc(num(s.attack)),
    join: Math.trunc(num(s.join)),
    move: Math.trunc(num(s.move)),
  };
}

function serImmediate(list) {
  return (Array.isArray(list) ? list : []).map((r) => ({
    force: str(r && r.force),
    city: str(r && r.city),
    gold: Math.trunc(num(r && r.gold)),
    troops: Math.trunc(num(r && r.troops)),
    before: Math.trunc(num(r && r.before)),
    after: Math.trunc(num(r && r.after)),
  }));
}

function serDrift(d) {
  const x = d || {};
  return {
    tire: { down: Math.trunc(num(x.tire && x.tire.down)) },
    spirit: { down: Math.trunc(num(x.spirit && x.spirit.down)), up: Math.trunc(num(x.spirit && x.spirit.up)), skipped: Math.trunc(num(x.spirit && x.spirit.skipped)) },
    loyal: { down: Math.trunc(num(x.loyal && x.loyal.down)), up: Math.trunc(num(x.loyal && x.loyal.up)), skipped: Math.trunc(num(x.loyal && x.loyal.skipped)) },
    names: Math.trunc(num(x.names)),
  };
}

function cloneWorld(w) {
  if (!w || typeof w !== 'object') return w;
  const out = { ...w };
  out.cities = clone(w.cities);
  out.paths = clone(w.paths);
  out.forces = clone(w.forces);
  out.rules = clone(w.rules);
  return out;
}

// ── 用例夹具：剧本 + garrison + generals → 存档 ─────────────────────────────
function buildFixture(scenario, garrison, generalByName, playerRank) {
  const rows = Array.isArray(scenario.cities) ? scenario.cities : [];
  const paths = Array.isArray(scenario.paths) ? scenario.paths : [];
  const gCities = (garrison && garrison.cities) || {};
  const owners = new Map();
  for (const row of rows) {
    const g = gCities[row.NAME] || null;
    const byGarrison = g && typeof g.owner === 'string' ? g.owner : '';
    const byRow = typeof row.KING === 'string' ? row.KING : '';
    owners.set(row.NAME, byGarrison || byRow || '');
  }
  // 玩家势力：按城数排序，默认取第 2 名（第 1 名留作最强 AI，能同时喂到「打玩家」和「打 AI」）
  const counts = new Map();
  for (const [, o] of owners) if (o) counts.set(o, (counts.get(o) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const player = ranked.length ? ranked[Math.min(playerRank, ranked.length - 1)][0] : '';

  const meta = [];
  const save = { king: player, month: 0, owned: [], cities: {}, paths, tire: {}, morale: {}, loyal: {}, forces: {} };
  const defenseByName = new Map();
  rows.forEach((row, i) => {
    const g = gCities[row.NAME] || {};
    const pop = Math.trunc(num(row.POPULATION));
    const officers = Array.isArray(g.officers)
      ? g.officers.filter((o) => o && typeof o.name === 'string' && o.name)
        .map((o) => ({ name: o.name, str: Math.trunc(num(o.str)), int: Math.trunc(num(o.int)), loyal: Math.trunc(num(o.loyal)), status: '登' }))
      : [];
    const def = Math.trunc(num(row.DEFENSE));
    defenseByName.set(row.NAME, def);
    const rec = {
      owner: owners.get(row.NAME) || '',
      troops: 40 + ((i * 53) % 160),          // 40..199：既能让 AI 出兵，也留得下败仗
      money: Math.trunc(num(row.MONEY)),
      pop,
      major: str(g.major) || str(row.MAJOR),
      officers,
      DEFENSE: def,
      flags: Math.trunc(num(row.FLAGS)),
      rate: Math.trunc(num(row.RATE)),
    };
    save.cities[row.NAME] = rec;
    meta.push({
      ...row,
      NAME: row.NAME,
      owner: rec.owner,
      officers,
      DEFENSE: def,
      FLAGS: rec.flags,
      RATE: rec.rate,
      POPULATION: pop,
      MONEY: rec.money,
    });
  });
  save.owned = Object.keys(save.cities).filter((n) => save.cities[n].owner === player);
  const capByName = new Map(rows.map((row) => [row.NAME, Math.min(Math.floor(num(row.POPULATION) / 2500) + 110, 600)]));
  const fx = {
    id: Math.trunc(num(scenario.id)),
    player,
    ranked,
    meta,
    paths,
    save,
    defenseByName,
    capByName,
    capOf: (name) => capByName.get(name) ?? 0,
    generalByName,
    talentPool: [
      { name: '姜維', str: 90, int: 92, loyal: 80, status: '野' },
      { name: '鄧艾', str: 88, int: 90, loyal: 78, status: '野' },
      { name: '鍾會', str: 70, int: 88, loyal: 70, status: '野' },
    ],
  };
  return fx;
}

// ── 一个剧本 × N 月的主循环（两侧共用的唯一驱动） ──────────────────────────
function runCase(MOD, fx, cfg) {
  const save = clone(fx.save);
  MOD.buildForces(save);
  MOD.syncOwned(save);
  const trace = {
    scenario: fx.id,
    player: str(fx.player),
    ranked: fx.ranked.map(([id, n]) => `${id}:${n}`),
    initial: snapSave(save),
    unit: null,
    months: [],
  };
  let rngCalls = 0;
  let entries = 0;
  const countedRng = (seed) => {
    const r = MOD.seedRng(seed);
    return () => {
      rngCalls += 1;
      return r();
    };
  };

  for (let m = 0; m < cfg.months; m += 1) {
    const month = m + 1;
    save.month = month;
    const monthStart = clone(save);
    const seed = (month + 1) * 7919;            // campaign.html: (Saves.num(save.month)+1)*7919
    const rng = countedRng(seed);
    const calls0 = rngCalls;
    const baseCtx = {
      playerId: save.king,
      paths: fx.paths,
      rules: { cheat: false },
      capOf: fx.capOf,
      talentPool: fx.talentPool.map((o) => ({ ...o })),
      seed,
    };

    // ── B. §5 旧接口：planForceMonth / runMonth（在「月初状态副本」上跑，单独 seed） ──
    const planSeed = 100003 + month * 977;
    const worldB = MOD.prepareMonth(clone(monthStart), fx.meta, { ...baseCtx, seed: planSeed });
    const plans = [];
    for (const fid of MOD.forceOrder(worldB)) {
      if (fid === str(worldB.playerId)) continue;
      if (!MOD.citiesOf(worldB, fid).length) continue;
      const plan = MOD.planForceMonth(worldB, fid, { rng: MOD.seedRng(planSeed) });
      plans.push({
        force: str(fid),
        chosen: serCand(plan.chosen),
        stages: serStages(plan.stages),
        immediate: serImmediate(plan.immediate),
        tableSize: MOD.tableSize(plan.table),
        debug: str(MOD.describeCandidate(worldB, plan.chosen)),
      });
    }
    const runSeed = 200003 + month * 1291;
    const worldC = MOD.prepareMonth(clone(monthStart), fx.meta, { ...baseCtx, seed: runSeed });
    const runRes = MOD.runMonth(worldC, { playerId: monthStart.king, rng: MOD.seedRng(runSeed), rules: { cheat: false } });
    const runSnap = {
      text: str(MOD.describeReports(runRes.reports, { world: worldC })),
      reports: (runRes.reports || []).map((r) => ({
        force: str(r.force),
        stages: serStages(r.stages),
        immediate: serImmediate(r.immediate),
        tableSize: MOD.tableSize(r.table),
        chosen: serCand(r.chosen),
        result: serResult(r.result),
        debug: str(MOD.describeCandidate(worldC, r.chosen)),
      })),
      executed: (runRes.executed || []).map((e) => ({ force: str(e.force), cand: serCand(e.cand), result: serResult(e.result) })),
    };

    // ── A. 正式链路：prepareMonth → planMonth → executeMonth → 结算 → 灭亡 → 漂移 ──
    const world = MOD.prepareMonth(save, fx.meta, { ...baseCtx, rand: rng });
    const actions = MOD.planMonth({ king: save.king, month }, world.cities, { ...baseCtx, rand: rng });
    const actionSnap = (actions || []).map(serAction);
    const res = MOD.executeMonth(world, actions, { rng });
    const execSnap = [];
    for (const row of res.executed || []) {
      const cand = row.cand || {};
      const action = row.action || {};
      const result = row.result || {};
      const entry = { force: str(row.force), cand: serCand(cand), action: serAction(action), result: serResult(result) };
      if (str(result.kind) === 'battle') {
        const toPlayer = Math.trunc(num(cand.act)) === MOD.ACT.ATTACK_PLAYER
          || str(MOD.forceOf(world, str(cand.to))) === str(world.playerId);
        if (toPlayer) {
          // campaign.html 对「打玩家」的仗不当场结算，交给守城战；这里只记录待战单
          entry.incoming = {
            from: str(cand.from),
            to: str(cand.to),
            et: Math.max(1, Math.trunc(num(result.troops))),
            gt: MOD.troopsOf(world, str(cand.to)),
            def: Math.trunc(num(fx.defenseByName.get(str(cand.to)))),
            joinCity: str(cand.joinCity),
          };
        } else {
          const rb = MOD.resolveBattle(world, result, rng);
          entry.battle = serResult(rb);
          entry.text = str(MOD.describeAction(world, cand));
          entry.debug = str(MOD.describeCandidate(world, cand));
        }
      } else {
        entry.text = str(MOD.describeAction(world, cand));
        entry.debug = str(MOD.describeCandidate(world, cand));
      }
      execSnap.push(entry);
    }
    const reportsText = str(MOD.describeReports(res.reports, { world }));
    const reportsSnap = (res.reports || []).map((r) => ({
      force: str(r.force),
      stages: serStages(r.stages),
      immediate: serImmediate(r.immediate),
      tableSize: MOD.tableSize(r.table),
      chosen: serCand(r.chosen),
      result: serResult(r.result),
    }));
    const gone = MOD.checkForceDeaths(world);

    // 回写（campaign.html applyWorld 只写 troops/money/owner；这里额外写 pop/major/officers/DEFENSE，
    // 让「開墾/搜索/調將」的成果能跨月延续，扩大覆盖；两侧完全一致，不影响等价性）
    const wc = world.cities || {};
    for (const name of Object.keys(wc)) {
      const src = wc[name] || {};
      if (!save.cities[name]) save.cities[name] = {};
      const st = save.cities[name];
      st.troops = Math.max(0, Math.trunc(num(src.troops)));
      st.money = Math.max(0, Math.trunc(num(src.money)));
      st.pop = Math.max(0, Math.trunc(num(src.pop)));
      st.major = str(src.major);
      st.officers = Array.isArray(src.officers) ? src.officers.map((o) => (typeof o === 'string' ? o : { ...o })) : [];
      if (src.DEFENSE !== undefined) st.DEFENSE = Math.trunc(num(src.DEFENSE));
      if (typeof src.owner === 'string') st.owner = src.owner;
    }
    save.forces = world.forces || save.forces;
    if (world.playerId) save.king = world.playerId;
    MOD.syncOwned(save);

    const officersByCity = {};
    for (const n of Object.keys(save.cities)) officersByCity[n] = Array.isArray(save.cities[n].officers) ? save.cities[n].officers : [];
    const drift = MOD.monthlyDrift(save, officersByCity, { rowOf: (name) => fx.generalByName.get(name) || null });

    entries += 3 + plans.length + actionSnap.length + execSnap.length + reportsSnap.length;
    trace.months.push({
      month,
      seed,
      rngCalls: rngCalls - calls0,
      plans,
      run: runSnap,
      actions: actionSnap,
      executed: execSnap,
      reports: reportsSnap,
      reportsText,
      gone,
      drift: serDrift(drift),
      save: snapSave(save),
    });
  }
  trace.entries = entries;
  return trace;
}

// ── 定点 API 检查（小世界，覆盖月循环里不一定走到的分支） ───────────────────
function miniSave() {
  return {
    king: '玩家',
    month: 3,
    seed: 0,
    owned: ['許昌', '洛陽'],
    cities: {
      許昌: { owner: '玩家', troops: 120, money: 900, pop: 150000, major: '曹操', officers: [{ name: '曹操', str: 90, int: 95, loyal: 99, status: '登' }, { name: '荀彧', str: 20, int: 98, loyal: 90, status: '登' }], DEFENSE: 120, flags: 0, rate: 3 },
      洛陽: { owner: '玩家', troops: 20, money: 100, pop: 80000, major: '', officers: [], DEFENSE: 90, flags: 0, rate: 2 },
      江夏: { owner: '孫堅', troops: 40, money: 600, pop: 120000, major: '孫堅', officers: [{ name: '孫堅', str: 88, int: 70, loyal: 95, status: '登' }, { name: '程普', str: 70, int: 60, loyal: 88, status: '登' }], DEFENSE: 60, flags: 0, rate: 3 },
      襄陽: { owner: '劉表', troops: 0, money: 300, pop: 90000, major: '劉表', officers: [{ name: '劉表', str: 60, int: 70, loyal: 80, status: '登' }], DEFENSE: 40, flags: 0, rate: 2 },
      陈留: { owner: '', troops: 0, money: 0, pop: 60000, major: '', officers: [], DEFENSE: 30, flags: 0, rate: 1 },
    },
    paths: [
      { Start: '許昌', End: '洛陽', Length: 120, _index: 0 },
      { Start: '許昌', End: '江夏', Length: 200, _index: 1 },
      { Start: '江夏', End: '襄陽', Length: 150, _index: 2 },
      { Start: '洛陽', End: '陈留', Length: 90, _index: 3 },
      { Start: '許昌', End: '襄陽', Length: 32000, _index: 4 },
    ],
    forces: {},
    tire: {},
    morale: {},
    loyal: {},
  };
}

function miniWorld(MOD) {
  const sv = miniSave();
  MOD.buildForces(sv);
  MOD.syncOwned(sv);
  return MOD.prepareMonth(sv, sv.cities, { paths: sv.paths, seed: 1 });
}

function unitChecks(MOD) {
  const out = {};
  out.constants = {
    ADDR: MOD.ADDR,
    ACT: MOD.ACT,
    ACT_NAMES: MOD.ACT_NAMES,
    ALL_ACTS: MOD.ALL_ACTS,
    ALL_KINDS: MOD.ALL_KINDS,
    ACT_KIND: MOD.ACT_KIND,
    KIND: MOD.KIND,
    KIND_NAMES: MOD.KIND_NAMES,
    MONTH_ACTION_MAX: MOD.MONTH_ACTION_MAX,
    ACTION_COST: MOD.ACTION_COST,
    KIND_RATE: MOD.KIND_RATE,
    RATE: MOD.RATE,
    RATE_BAND: MOD.RATE_BAND,
    COST: MOD.COST,
    DRIFT: MOD.DRIFT,
    GENERAL_INIT: MOD.GENERAL_INIT,
    MAX_CANDIDATES: MOD.MAX_CANDIDATES,
    DISPATCH_MAX: MOD.DISPATCH_MAX,
    TROOP_UNIT: MOD.TROOP_UNIT,
    ACT_IMPL_KEYS: Object.keys(MOD.ACT_IMPL).sort(),
  };
  out.rng = [0, 1, 2, 3, 7919, 99991].map((s) => {
    const r = MOD.seedRng(s);
    const vals = [];
    for (let i = 0; i < 4; i += 1) vals.push(r());
    return { seed: s, vals };
  });

  const w = miniWorld(MOD);
  out.world = {
    cities: snapCities(w.cities),
    forces: snapForces(w.forces),
    playerId: str(w.playerId),
    order: MOD.forceOrder(w).map(str),
    forcesOf: MOD.forcesOf(w).map(str),
    citiesOf: MOD.citiesOf(w, '孫堅').map(str),
    neighbors: MOD.neighborsOf(w, '許昌').map(str),
    neighborsFromPaths: MOD.neighborsFromPaths(w.paths, '許昌').map(str),
    distance: ['許昌|襄陽', '許昌|江夏', '許昌|陈留'].map((p) => {
      const [a, b] = p.split('|');
      return { p, v: MOD.distanceOf(w, a, b), path: MOD.pathLength(w, a, b) };
    }),
    limit: ['許昌', '江夏', '襄陽'].map((n) => MOD.limitOf(w, n)),
    cap: ['許昌', '江夏', '襄陽'].map((n) => MOD.capOf(w, n)),
    score: ['許昌|江夏', '許昌|陈留', '許昌|洛陽', '江夏|襄陽'].map((p) => {
      const [a, b] = p.split('|');
      return { p, ...MOD.scoreTarget(w, a, b) };
    }),
    needed: ['江夏', '襄陽'].map((n) => MOD.neededTroops(w, n)),
    governor: ['許昌', '洛陽', '江夏'].map((n) => str(MOD.governorOf(w, n))),
    canDispatch: ['許昌', '洛陽', '江夏', '襄陽'].map((n) => Boolean(MOD.canDispatch(w, n))),
    forceOf: ['許昌', '江夏', '陈留', '不存在'].map((n) => str(MOD.forceOf(w, n))),
    troopsOf: ['許昌', '江夏', '陈留'].map((n) => MOD.troopsOf(w, n)),
    officersOf: ['許昌', '洛陽', '襄陽'].map((n) => MOD.officersOf(w, n).map((o) => str(o && o.name))),
  };

  out.dispatch = [0, 0.25, 0.5, 0.75, 0.9, 0.999999].map((u) => ({
    u,
    governed: MOD.dispatchTroops(w, '許昌', '江夏', () => u),
    emptyDst: MOD.dispatchTroops(w, '許昌', '陈留', () => u),
    starved: MOD.dispatchTroops(w, '洛陽', '陈留', () => u),
  }));

  out.table = (() => {
    const t = MOD.createTable(3);
    const added = [];
    for (let i = 0; i < 5; i += 1) added.push(MOD.addCandidate(t, { act: 4, from: `a${i}`, to: 'b', a: 1, b: 1, c: 0, rate: 100 + i }));
    const tie = MOD.createTable();
    MOD.addCandidate(tie, { act: 4, from: 'x', to: 'y', a: 1, b: 1, rate: 200 });
    MOD.addCandidate(tie, { act: 5, from: 'x2', to: 'y', a: 1, b: 1, rate: 200 });
    MOD.addCandidate(tie, { act: 4, from: 'x3', to: 'y', a: 1, b: 1, rate: 800 });
    return {
      limit: t.limit,
      rows: t.rows.map(serCand),
      added,
      size: MOD.tableSize(t),
      argmax: MOD.argMaxRate(t),
      pick: serCand(MOD.pickCandidate(t)),
      tieArgmax: MOD.argMaxRate(tie),
      tiePick: serCand(MOD.pickCandidate(tie)),
      tieSize: MOD.tableSize(tie),
    };
  })();

  out.compare = (() => {
    const mk = (o) => ({
      act: 4, actName: 'x', from: '', to: '', rate: 100, score: 0, force: 'A', kind: 'attack', reason: '', generals: [], cand: {}, ...o,
    });
    const list = [
      mk({ rate: 200, act: 7, from: 'a' }),
      mk({ rate: 200, act: 4, from: 'b' }),
      mk({ rate: 100, act: 5, from: 'c' }),
      mk({ rate: 200, act: 7, from: 'a', to: 'z' }),
      mk({ rate: 200, act: 7, from: 'a', to: '', joinCity: 'q' }),
    ];
    return list.slice().sort(MOD.compareAction).map((a) => `${a.rate}/${a.act}/${a.from}/${a.to}/${a.joinCity}`);
  })();

  out.activators = {};
  for (const act of MOD.ALL_ACTS) {
    const w2 = cloneWorld(w);
    const list = MOD.ACT_IMPL[act]({ world: w2, force: '孫堅', rules: { cheat: true }, rand: MOD.seedRng(11 + act) });
    out.activators[act] = (list || []).map(serCand);
  }

  out.planners = (() => {
    const w3 = cloneWorld(w);
    const t = MOD.createTable();
    return {
      domestic: (MOD.planDomestic(w3, '孫堅', t) || []).map(serCand),
      recruit: (MOD.planRecruit(w3, '孫堅') || []).map((r) => ({
        force: str(r && r.force), city: str(r && r.city), gold: Math.trunc(num(r && r.gold)),
        troops: Math.trunc(num(r && r.troops)), before: Math.trunc(num(r && r.before)), after: Math.trunc(num(r && r.after)),
      })),
      attack: (MOD.planAttack(w3, '孫堅', t, { rng: MOD.seedRng(31) }) || []).map(serCand),
      join: (MOD.planJoin(w3, '孫堅', '江夏', '許昌', 3) || []).map(serCand),
      move: (MOD.planMoveGeneral(w3, '孫堅', t) || []).map(serCand),
      tableSize: MOD.tableSize(t),
    };
  })();

  out.forceMonth = (() => {
    const w4 = cloneWorld(w);
    const plan = MOD.planForceMonth(w4, '孫堅', { rng: MOD.seedRng(41) });
    return {
      force: str(plan.force),
      chosen: serCand(plan.chosen),
      stages: serStages(plan.stages),
      immediate: serImmediate(plan.immediate),
      tableSize: MOD.tableSize(plan.table),
      rows: plan.table.rows.map(serCand),
      debug: str(MOD.describeCandidate(w4, plan.chosen)),
    };
  })();

  out.deaths = (() => {
    const w5 = cloneWorld(w);
    const capture = MOD.captureKingIn(w5, '江夏', { major: '孫堅', owner: '孫堅' });
    const afterCapture = { cities: snapCities(w5.cities), forces: snapForces(w5.forces), playerId: str(w5.playerId) };
    const w6 = cloneWorld(w);
    const extinct = MOD.extinguishForce(w6, '劉表');
    const afterExtinct = { cities: snapCities(w6.cities), forces: snapForces(w6.forces) };
    const w7 = cloneWorld(w);
    const inherit = MOD.extinguishForce(w7, '孫堅', { inherit: true });
    const afterInherit = { cities: snapCities(w7.cities), forces: snapForces(w7.forces), playerId: str(w7.playerId) };
    const w8 = cloneWorld(w);
    const killed = MOD.applyKingDeaths(w8, ['劉表', '孫堅', '不存在']);
    const w9 = cloneWorld(w);
    w9.cities['襄陽'].owner = '';
    return {
      capture,
      afterCapture,
      extinct,
      afterExtinct,
      inherit,
      afterInherit,
      killed,
      check: MOD.checkForceDeaths(w9),
      forcesAfterCheck: snapForces(w9.forces),
      nearest: ['許昌', '襄陽', '陈留', '江夏'].map((n) => str(MOD.nearestForce(w, n, '孫堅'))),
      successor: ['孫堅', '劉表', '玩家'].map((f) => str(MOD.successorOf(w, f))),
    };
  })();

  out.officers = (() => {
    const cases = [
      { name: 'a', str: 70, int: 80, status: '登' },
      { name: 'b', str: 9, int: 9, status: '野' },
      { name: 'c', str: 9, int: 9, status: '俘' },
      { name: 'd', STR: 5, INT: 6, STATUS: 1 },
      { name: 'e', STR: 5, INT: 6, STATUS: 2 },
      null,
      'z',
    ];
    return cases.map((o) => ({ power: MOD.officerPower(o), employed: Boolean(MOD.isEmployed(o)) }));
  })();

  out.values = {
    spirit: [MOD.spiritOf({ morale: { 甲: 55 } }, '甲'), MOD.spiritOf({}, '乙'), MOD.spiritOf({ morale: { 丙: 999 } }, '丙')],
    loyal: [MOD.loyalOf({ loyal: { 甲: 40 } }, '甲', null), MOD.loyalOf({}, '乙', { LOYAL: '88' }), MOD.loyalOf({}, '丙', null), MOD.loyalOf({ loyal: { 丁: 0 } }, '丁', { LOYAL: 70 })],
    defense: ['許昌', '江夏', '陈留'].map((n) => MOD.defenseOf(w, n)),
  };

  out.describe = (() => {
    const w10 = cloneWorld(w);
    const acts = [];
    for (const act of MOD.ALL_ACTS) {
      const a = {
        act, actName: MOD.ACT_NAMES[act], force: '孫堅', kind: act === 0 ? MOD.KIND.RECRUIT : MOD.KIND.ATTACK,
        from: '江夏', to: '許昌', a: 3, b: 2, c: 0, rate: 200, score: 7, troops: 40, gold: 500,
        joinCity: '襄陽', generals: ['程普'], reason: 'r', rank: 1,
      };
      acts.push({ act, plan: str(MOD.describePlan(a)), action: str(MOD.describeAction(w10, a)), cand: str(MOD.describeCandidate(w10, a)) });
    }
    return acts;
  })();

  out.prepare = (() => {
    const sv = miniSave();
    const w11 = MOD.prepareMonth(sv, { 許昌: { NAME: '許昌', POPULATION: 150000, DEFENSE: 120, FLAGS: 4, RATE: 3, KING: '玩家' } }, { ownerOf: (n) => (n === '許昌' ? '玩家' : ''), seed: 5 });
    const sv2 = miniSave();
    sv2.owned = ['許昌'];
    sv2.king = '';
    MOD.syncOwned(sv2);
    return {
      cities: snapCities(w11.cities),
      playerId: str(w11.playerId),
      month: Math.trunc(num(w11.month)),
      syncOwned: { owned: sv2.owned.slice(), owners: Object.keys(sv2.cities).map((n) => `${n}=${str(sv2.cities[n].owner)}`) },
      buildForces: snapForces(MOD.buildForces(clone(miniSave()))),
    };
  })();

  return out;
}

// ── main ────────────────────────────────────────────────────────────────────
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const scenarios = readJson(path.join(DATA, 'scenarios.json'));
const garrisons = readJson(path.join(DATA, 'garrison.json'));
const generals = readJson(path.join(DATA, 'generals.json'));
const generalByName = new Map();
for (const g of generals) if (g && typeof g.NAME === 'string' && g.NAME) generalByName.set(g.NAME, g);

const WEB = await import(pathToFileURL(WEB_ENTRY).href);
const COC = await import(pathToFileURL(COC_ENTRY).href);

const report = {
  generatedAt: new Date().toISOString(),
  config: CFG,
  inputs: { scenarios: scenarios.length, citiesPerScenario: (scenarios[0].cities || []).length, pathsPerScenario: (scenarios[0].paths || []).length, generals: generals.length },
  totals: { cases: 0, months: 0, entries: 0, fields: 0, mismatches: 0 },
  determinism: [],
  cases: [],
  mismatches: [],
};

// 定点 API 检查（与剧本无关，跑一次）
const unitWeb = unitChecks(WEB);
const unitCoc = unitChecks(COC);
const unitAcc = { fields: 0, misses: [] };
diff(unitWeb, unitCoc, 'unit', unitAcc);
report.totals.fields += unitAcc.fields;
report.totals.entries += 1;
if (unitAcc.misses.length) {
  report.totals.mismatches += unitAcc.misses.length;
  report.mismatches.push(...unitAcc.misses.slice(0, 200).map((m) => ({ case: 'unit', ...m })));
}
report.unit = { fields: unitAcc.fields, mismatches: unitAcc.misses.length };

const limit = Math.min(CFG.scenarios, scenarios.length);
for (let i = 0; i < limit; i += 1) {
  const sc = scenarios[i];
  const fx = buildFixture(sc, garrisons[i] || null, generalByName, CFG.playerRank);
  const web = runCase(WEB, fx, CFG);
  const coc = runCase(COC, fx, CFG);
  const web2 = runCase(WEB, fx, CFG);

  const detAcc = { fields: 0, misses: [] };
  diff(web, web2, 'det', detAcc);
  report.determinism.push({ scenario: fx.id, fields: detAcc.fields, mismatches: detAcc.misses.length, sample: detAcc.misses.slice(0, 5) });

  const acc = { fields: 0, misses: [] };
  diff(web, coc, `s${fx.id}`, acc);

  report.totals.cases += 1;
  report.totals.months += CFG.months;
  report.totals.entries += web.entries;
  report.totals.fields += acc.fields;
  report.totals.mismatches += acc.misses.length;
  report.cases.push({
    scenario: fx.id,
    player: fx.player,
    ranked: fx.ranked.slice(0, 6).map(([id, n]) => `${id}:${n}`),
    months: CFG.months,
    entries: web.entries,
    fields: acc.fields,
    mismatches: acc.misses.length,
    battles: web.months.reduce((n, m) => n + m.executed.filter((e) => e.battle).length, 0),
    incoming: web.months.reduce((n, m) => n + m.executed.filter((e) => e.incoming).length, 0),
    citiesChanged: web.months.reduce((n, m) => n + m.gone.length, 0),
  });
  if (acc.misses.length) report.mismatches.push(...acc.misses.slice(0, 300).map((m) => ({ case: `s${fx.id}`, ...m })));
}

fs.writeFileSync(path.join(HERE, 'parity-report.json'), JSON.stringify(report, null, 2), 'utf8');

const pct = report.totals.fields ? (100 * report.totals.mismatches / report.totals.fields) : 0;
console.log('== Cocos AI 等价性对拍 ==');
console.log(`剧本 ${report.totals.cases} / 月 ${report.totals.months} / 城 ${report.inputs.citiesPerScenario} / 路径 ${report.inputs.pathsPerScenario}`);
console.log(`定点 API 检查：字段 ${report.unit.fields}，不一致 ${report.unit.mismatches}`);
console.log(`比较条目 ${report.totals.entries}；比较字段 ${report.totals.fields}；不一致 ${report.totals.mismatches}（${pct.toFixed(6)}%）`);
const detBad = report.determinism.filter((d) => d.mismatches > 0);
console.log(`确定性自检（web 跑两遍）：${detBad.length ? `失败 ${detBad.length} 个剧本` : '全部一致'}`);
for (const c of report.cases) {
  console.log(`  剧本${c.scenario} 玩家=${c.player} 条目${c.entries} 字段${c.fields} 不一致${c.mismatches} 野战${c.battles} 待战${c.incoming} 灭亡${c.citiesChanged}`);
}
if (report.totals.mismatches) {
  console.log(`\n-- 前 ${CFG.show} 条不一致 --`);
  for (const m of report.mismatches.slice(0, CFG.show)) {
    console.log(`[${m.case}] ${m.path}\n    web  = ${JSON.stringify(m.web)}\n    cocos= ${JSON.stringify(m.cocos)}`);
  }
}
console.log(`\n明细已写入 work\\cocos_ai84\\parity-report.json`);
process.exit(report.totals.mismatches === 0 && detBad.length === 0 ? 0 : 1);
