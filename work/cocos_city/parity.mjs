/**
 * parity.mjs — Cocos 移植版 `CityModel.ts` 与 web 真源 `city_model.js` 的**逐字节对拍**。
 *
 * 做法：
 *   1. 把 `assets/scripts/CityModel.ts` 用 tsc 编成 CommonJS 到 `work/cocos_city/sim/`；
 *   2. 同时 import web 的 `city_model.js`（ESM 真源）与编译产物；
 *   3. 对同一批输入（真实剧本数据 + 10 座城 × 8 条命令 × 3 个种子）跑同一串脚本，
 *      每一步都把「回传值」和「存檔快照」压成 JSON，两边 JSON.stringify 必须**一字不差**。
 *
 * 判定标准是 `JSON.stringify(a) === JSON.stringify(b)` —— 连键的插入顺序都算在内，
 * 所以 TS 版里对象字面量的字段顺序必须和 web 版一致。
 *
 * 用法：node work/cocos_city/parity.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const COCOS = path.join(ROOT, 'game/cocos');
const SCRIPTS = path.join(COCOS, 'assets/scripts');
const DATA = path.join(COCOS, 'assets/bundles/res/data');
const SIM = path.join(HERE, 'sim');

/* ---------------- 1. 编译 CityModel.ts → sim/CityModel.js ---------------- */
fs.mkdirSync(SIM, { recursive: true });
const tsc = path.join(ROOT, 'game/node_modules/typescript/bin/tsc');
const tscArgs = [
  '--outDir', SIM,
  '--module', 'commonjs',
  '--target', 'ES2022',
  '--moduleResolution', 'node',
  '--strict',
  '--skipLibCheck',
  '--noEmitOnError',
  '--rootDir', SCRIPTS,
  path.join(SCRIPTS, 'CityModel.ts'),
];
execFileSync(process.execPath, [tsc, ...tscArgs], { stdio: 'inherit', cwd: ROOT });
console.log(`[parity] 編譯完成：${path.relative(ROOT, path.join(SIM, 'CityModel.js'))}`);

/* ---------------- 2. 载入两边 ---------------- */
const webUrl = pathToFileURL(path.join(ROOT, 'game/web/city_model.js')).href;
const tsUrl = pathToFileURL(path.join(SIM, 'CityModel.js')).href;
const WEB = await import(webUrl);
const TS = await import(tsUrl);

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf8'));
const SCEN = readJson('scenarios');
const GENS = readJson('generals');
const ITEMS = readJson('items');
const WISES = readJson('wises');

/* ---------------- 3. 与两边都无关的本地 PRNG（保证参数选择一致） ---------------- */
function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 4. 起始存档（形状同 web city.html 的 save） ---------------- */
function freshSave(scenario, gold) {
  return {
    gold,
    month: 3,
    scenario: scenario.id,
    owned: [],
    cities: {},
    roster: {},
    appointed: {},
    searchLog: [],
    foundItems: [],
    auto: {},
    autoMonth: 0,
    lastActionMonth: 0,
    tire: {},
    morale: {},
  };
}

/**
 * 序列化：把 `undefined` 也显式标出来（默认 JSON.stringify 会把它丢掉，
 * 那样 web 回 undefined、TS 回 null 的差异就看不见了）。
 */
const UNDEF = '\u0000undefined\u0000';
const ser = (value) => {
  const s = JSON.stringify(value, (k, v) => (v === undefined ? UNDEF : v));
  return s === undefined ? UNDEF : s;
};
const clone = (value) => JSON.parse(ser(value));

/* ---------------- 5. 一次「脚本」= 10 座城 × 8 条命令 × 1 个种子 ---------------- */
const CMD_NAMES = ['開發', '徵兵', '搜索', '移動', '任命', '物品', '情報', '出征'];

/**
 * 对某个模块跑一串固定操作，返回「可 JSON 化的日志」。
 * 同 seed ⇒ 两边挑到的参数完全相同 ⇒ 日志应当一字不差。
 */
function runScript(mod, scenario, cityNames, seed, bagSeqs, generalLevel) {
  const rnd = rngOf(seed);
  // RNG 注入口径（照 unit3_city.mjs:140）：web 的 develop/search 走 rngNext()，
  // 未注入时两端各从 crypto.getRandomValues 取一次 ⇒ 随机分支永远不相等。
  // 只在这里注入，参数选择用的 rnd 不受影响（同一 seed 仍挑同一组参数）。
  if (typeof mod.setRng === 'function') mod.setRng(rngOf(seed ^ 0x9e3779b9));
  const ctx = {
    generals: GENS,
    items: ITEMS,
    wises: WISES,
    scenario,
    scenIdx: 0,
    bag: bagSeqs.slice(),
    level: generalLevel,
  };
  const save = freshSave(scenario, 1200 + Math.floor(rnd() * 4000));
  save.owned = cityNames.slice(0, 3);
  const log = [];
  const push = (label, value) => log.push([label, value]);

  push('ensureExtras', mod.ensureExtras(save));
  // 先把全剧本的城都建一遍运行态（含 12 座关隘 RATE=0）
  for (const def of scenario.cities) mod.ensureCityState(save, def);
  push('cities.afterEnsure', clone(save.cities));

  for (const cityName of cityNames) {
    const def = mod.cityDefOf(cityName, scenario);
    const tag = `${cityName}`;
    push(`${tag}/ensureCityState`, mod.ensureCityState(save, def));
    push(`${tag}/troopCapOf`, mod.troopCapOf(def?.POPULATION));
    push(`${tag}/prepCapOf`, mod.prepCapOf(save.cities[cityName]?.pop));
    push(`${tag}/prepStateOf`, mod.prepStateOf(save, def));
    push(`${tag}/armCaps`, mod.armCaps(save, def, ctx));
    push(`${tag}/hallIndexOf`, mod.hallIndexOf(def));
    // 白名單（兩條，皆為美術適配、不是數值）：①路徑在 R84 換過（web `assets/bg/env/hall_0N.jpg`
    // → Cocos `assets/bg/policy/palais_0N.webp`）；②原作 POLICY 只有 PALAIS01..05，Cocos 對
    // hallIndexOf=6 的大城 clamp 到 5。故兩端都取 `hall_0min(尾碼,5)` 再比，只斷言「第幾座大殿」。
    push(`${tag}/hallImageOf`, String(mod.hallImageOf(def)).replace(/^.*(?:palais|hall)_0(\d)\.(?:webp|jpg)$/, (m, d) => `hall_0${Math.min(5, Number(d))}`));
    push(`${tag}/isGate`, mod.isGate(def));
    push(`${tag}/efficiencyOf`, mod.efficiencyOf(save, def, ctx));
    push(`${tag}/majorOf`, mod.majorOf(save, def));
    push(`${tag}/wiseOf`, mod.wiseOf(save, def));
    push(`${tag}/rosterOf`, mod.rosterOf(save, cityName, ctx).map((g) => g.NAME));
    push(`${tag}/stationedNames`, Array.from(mod.stationedNames(save, ctx)).sort());
    push(`${tag}/wildPool`, mod.wildPool(save, cityName, ctx).map((g) => g.NAME));
    push(`${tag}/searchCount`, mod.searchCount(save, cityName));
    push(`${tag}/monthLocked`, mod.monthLocked(save, false));

    // ── 命令 1：開發 ────────────────────────────────────────────────
    push(`${tag}/開發`, mod.develop(save, def, ctx));
    push(`${tag}/開發.again`, mod.develop(save, def, ctx));
    push(`${tag}/save.gold`, save.gold);

    // ── 命令 2：徵兵（enlist 步/騎 + 舊口徑 recruit） ───────────────
    const arm = rnd() < 0.5 ? 'inf' : 'cav';
    const n = Math.floor(rnd() * 400);
    push(`${tag}/徵兵.enlist.${arm}`, mod.enlist(save, def, { arm, n }, ctx));
    push(`${tag}/徵兵.enlist.other`, mod.enlist(save, def, { arm: arm === 'inf' ? 'cav' : 'inf', n: 40 }, ctx));
    push(`${tag}/徵兵.enlist.bad`, mod.enlist(save, def, { arm: 'archer', n: 10 }, ctx));
    push(`${tag}/徵兵.enlist.none`, mod.enlist(save, def, { arm: 'inf', n: 0 }, ctx));
    push(`${tag}/徵兵.recruit`, mod.recruit(save, def, ctx));
    push(`${tag}/徵兵.state`, clone(mod.cityStateOf(save, cityName)));

    // ── 命令 3：搜索 ────────────────────────────────────────────────
    push(`${tag}/搜索.1`, mod.search(save, def, ctx));
    push(`${tag}/搜索.2`, mod.search(save, def, ctx));
    push(`${tag}/搜索.3`, mod.search(save, def, ctx));
    push(`${tag}/搜索.log`, mod.recentLog(save, 4, cityName));
    push(`${tag}/搜索.state`, clone(mod.cityStateOf(save, cityName)));

    // ── 命令 4：移動（对每个邻城各试一次） ─────────────────────────
    const neigh = mod.neighboursOf(cityName, scenario);
    for (const to of neigh.slice(0, 3)) {
      const troops = Math.floor(rnd() * 300);
      const gens = mod.rosterOf(save, cityName, ctx);
      const general = gens.length && rnd() < 0.5 ? gens[0].NAME : '';
      push(`${tag}/移動→${to}`, mod.move(save, def, { to, troops, general }, ctx));
    }
    push(`${tag}/移動.bad`, mod.move(save, def, { to: cityName, troops: 10 }, ctx));
    push(`${tag}/移動.state`, clone(save.cities[cityName]));

    // ── 命令 5：任命 ────────────────────────────────────────────────
    const gens2 = mod.rosterOf(save, cityName, ctx);
    if (gens2.length) {
      push(`${tag}/任命.major`, mod.appoint(save, def, 'major', gens2[0].NAME, ctx));
      push(`${tag}/任命.wise`, mod.appoint(save, def, 'wise', gens2[gens2.length - 1].NAME, ctx));
    }
    push(`${tag}/任命.bad`, mod.appoint(save, def, 'king', '無名', ctx));
    push(`${tag}/任命.appointed`, clone(save.appointed[cityName]));

    // ── 命令 6：物品（背包读写） ───────────────────────────────────
    push(`${tag}/物品.parse.null`, mod.parseItemsSave(null));
    push(`${tag}/物品.parse.bag`, mod.parseItemsSave({ bag: [3, '7', 0, -1, 3], equip: { a: 1 } }));
    push(`${tag}/物品.withBagItem`, mod.withBagItem({ bag: [3] }, 49));
    push(`${tag}/物品.ownedItemSeqs`, mod.ownedItemSeqs(save, ctx));

    // ── 命令 7：情報 ────────────────────────────────────────────────
    push(`${tag}/情報`, mod.intel(save, def, ctx));

    // ── 命令 8：出征 ────────────────────────────────────────────────
    push(`${tag}/出征.targets`, mod.deployTargets(save, def, ctx));
  }

  // ── 月令（R8） ────────────────────────────────────────────────────
  push('lock.before', mod.monthLocked(save, false));
  push('lock.mark', mod.markMonthActed(save, false));
  push('lock.after', mod.monthLocked(save, false));
  push('lock.afterUnlimited', mod.monthLocked(save, true));
  push('lock.markUnlimited', mod.markMonthActed(save, true));
  push('lock.clear', mod.clearMonthLock(save));
  push('lock.afterClear', mod.monthLocked(save, false));
  push('lock.lastActionMonth', save.lastActionMonth);

  // ── 自治（R10）＋ 換月補兵（R12） ──────────────────────────────────
  for (const name of cityNames.slice(0, 4)) push(`auto.set.${name}`, mod.setAuto(save, name, true));
  push('auto.cities', mod.autoCities(save, scenario.cities));
  push('auto.isAuto', mod.isAuto(save, cityNames[0]));
  // 先補金，讓自治的成功分支（真的有城被代行開發）也被對拍到
  save.gold = 4000;
  push('auto.run', mod.runAutonomy(save, scenario.cities, ctx, { from: cityNames[0] }));
  push('auto.runAll', mod.runAutonomy(save, scenario.cities, ctx, { from: '' }));
  save.month += 1;
  push('tick.1', mod.autonomyTick(save, scenario.cities, ctx));
  push('tick.2', mod.autonomyTick(save, scenario.cities, ctx));
  push('tick.prep.0', mod.refillPrep(save, mod.cityDefOf(cityNames[0], scenario)));
  save.month += 5;
  push('tick.3', mod.autonomyTick(save, scenario.cities, ctx));
  push('tick.log', mod.recentLog(save, 8));

  // ── 杂项：常量表与小工具 ──────────────────────────────────────────
  push('const.incrRows', mod.incrRows());
  for (const key of ['devGold', 'prepGainPct', 'cavCapMax', 'effMax', 'noSuchKey']) {
    push(`const.incrVal.${key}`, mod.incrVal(key));
  }
  push('const.DEV', mod.DEV);
  push('const.RECRUIT', mod.RECRUIT);
  push('const.SEARCH', mod.SEARCH);
  push('const.EFF', mod.EFF);
  push('const.ARMS', mod.ARMS);
  push('const.ARM_NAMES', mod.ARM_NAMES);
  push('const.CMD_ORDER', mod.CMD_ORDER);
  push('const.CMD_EXTRA', mod.CMD_EXTRA);
  push('const.CMD_META', mod.CMD_META);
  push('const.INCR_GRADES', mod.INCR_GRADES);
  push('const.PATH_SENTINEL', mod.PATH_SENTINEL);
  push('const.FLAG_GATE', mod.FLAG_GATE);
  push('const.BAG_KEY', mod.BAG_KEY);
  push('const.DEFAULT_BAG', mod.DEFAULT_BAG);
  push('const.MOVE', mod.MOVE);
  push('const.APPOINT', mod.APPOINT);
  push('const.AUTONOMY', mod.AUTONOMY);
  push('const.LOCK_HINT', mod.LOCK_HINT);
  push('const.UNLIMITED_HINT', mod.UNLIMITED_HINT);
  // monthLabel 在 web 里是从 saves.js import 的、不对外导出，所以经 logAdd 的 t 字段间接对拍
  push('util.monthLabel', [1, 2, 12, 13, 25, 0, -3, 999].map((m) => {
    const s = { month: m };
    mod.logAdd(s, { text: 'x' });
    return s.searchLog[s.searchLog.length - 1].t;
  }));
  push('util.hashSeed', [mod.hashSeed('a'), mod.hashSeed('a', 1, 'b'), mod.hashSeed()]);
  push('util.searchSeed', mod.searchSeed('成都', 7, 3));
  push('util.mulberry32', Array.from({ length: 5 }, mod.mulberry32(mod.searchSeed('成都', 7, 3))));
  push('util.levelOf', [
    mod.levelOf({ NAME: 'a', level: 33 }, ctx),
    mod.levelOf({ NAME: 'b' }, ctx),
    mod.levelOf({ NAME: 'c' }, { ...ctx, level: 55 }),
    mod.levelOf(null, null),
  ]);
  push('util.troopMaxOf', [1, 19, 20, 99, 0, '30'].map((v) => mod.troopMaxOf(v)));
  push('util.cavalryCapOf', [1, 19, 20, 25, 99, '40'].map((v) => mod.cavalryCapOf(v)));
  push('util.itemsUrl', mod.itemsUrl('成都'));
  push('util.deployUrl', mod.deployUrl('襄平'));
  push('util.neighboursOf.all', scenario.cities.map((c) => mod.neighboursOf(c.NAME, scenario)).flat().length);
  push('util.wiseSkillsOf', mod.wiseSkillsOf(GENS.find((g) => Array.isArray(g.WISESKILL) && g.WISESKILL.length) || GENS[0], WISES));
  push('util.generalOf', mod.generalOf(GENS, '關羽')?.NAME ?? null);
  push('util.cityOf', [mod.cityOf(GENS[0], 0), mod.cityOf(GENS[0], 4), mod.cityOf(null, 0)]);
  push('util.statusOf', [mod.statusOf(GENS[0], 0), mod.statusOf(null, 0)]);
  push('util.searchPools', (() => {
    const p = mod.searchPools(ITEMS, [1, 4, 49]);
    return { talisman: p.talisman.map((i) => i.Sequence), treasure: p.treasure.map((i) => i.Sequence) };
  })());
  push('util.rememberFound', (() => {
    const s = { foundItems: [] };
    mod.rememberFound(s, 52);
    mod.rememberFound(s, 52);
    mod.rememberFound(s, 0);
    return s.foundItems;
  })());
  push('util.addToRoster', (() => {
    const s = { roster: {} };
    mod.addToRoster(s, '成都', '關羽');
    mod.addToRoster(s, '成都', '關羽');
    return s.roster;
  })());
  push('save.final', clone(save));
  return log;
}

/* ---------------- 6. 跑对拍 ---------------- */
const scenario = SCEN[0];
// 10 座城：前 7 座有路的 + 3 座关隘（RATE=0）也算进来，覆盖 isGate / prepCapOf(0) 分支
const allCities = scenario.cities;
const withPaths = allCities.filter((c) => Number(c.RATE) > 0);
const gates = allCities.filter((c) => c.RATE === 0);
const picked = [...withPaths.slice(0, 7), ...gates.slice(0, 3)].map((c) => c.NAME);
const SEEDS = [11, 2024, 777];
const BAGS = [[], [1, 4], [52, 49, 14, 20, 45]];

const diffs = [];
let assertions = 0;
let runs = 0;
/** 覆盖率：key = 操作名，n = 调用次数，ok = 返回 {ok:true} 的次数 */
const coverage = new Map();
const t0 = Date.now();

for (const seed of SEEDS) {
  for (let i = 0; i < 10; i += 1) {
    // 每次换一组 10 城（保证覆盖到 8 条命令 × 全部 60 城的不同组合）
    const rotated = picked.map((_, k) => picked[(k + i) % picked.length]);
    const bag = BAGS[i % BAGS.length];
    const level = i % 3 === 0 ? 30 : undefined;
    const logWeb = runScript(WEB, scenario, rotated, seed, bag, level);
    const logTs = runScript(TS, scenario, rotated, seed, bag, level);
    runs += 1;
    // 覆盖率统计：每类操作被跑了几次、其中成功（ok:true）几次
    for (const [label, value] of logWeb) {
      const key = label.includes('/') ? label.slice(label.indexOf('/') + 1) : label;
      const bucket = coverage.get(key) ?? { n: 0, ok: 0 };
      bucket.n += 1;
      if (ser(value).includes('"ok":true')) bucket.ok += 1;
      coverage.set(key, bucket);
    }
    if (logWeb.length !== logTs.length) {
      diffs.push({ label: `[run seed=${seed} rot=${i}] 日志长度`, web: logWeb.length, ts: logTs.length });
      continue;
    }
    for (let k = 0; k < logWeb.length; k += 1) {
      assertions += 1;
      const [label, a] = logWeb[k];
      const [, b] = logTs[k];
      let ja;
      let jb;
      try {
        ja = JSON.stringify(a);
        jb = JSON.stringify(b);
      } catch (err) {
        diffs.push({ label, web: `stringify 失败 ${String(err)}`, ts: '' });
        continue;
      }
      if (ja !== jb) diffs.push({ label: `[seed=${seed} rot=${i}] ${label}`, web: ja, ts: jb });
    }
  }
}

/* ---------------- 7. 报告 ---------------- */
const ms = Date.now() - t0;
console.log('');
console.log('=== CityModel parity (web city_model.js vs Cocos CityModel.ts) ===');
console.log(`剧本：${scenario.id}，城 ${allCities.length} 座，取样 ${picked.length} 座 × ${SEEDS.length} 种子 × 10 轮`);
console.log(`命令覆盖：${CMD_NAMES.join(' / ')} + 自治 / 情報 / 月令 / 換月補兵`);
console.log(`脚本轮次：${runs}`);
console.log(`断言数（每条都做 JSON.stringify 逐字节比对）：${assertions}`);
console.log(`不一致：${diffs.length}`);
console.log(`耗时：${ms} ms`);
// 覆盖率：命令被真的跑到了多少次、其中成功分支多少次（避免「只对拍了失败分支」的假绿灯）
if (coverage.size) {
  const rows = Array.from(coverage.entries()).sort((a, b) => b[1].n - a[1].n);
  const width = Math.max(...rows.map(([k]) => k.length));
  console.log('');
  console.log(`--- 覆盖率（${rows.length} 类操作）---`);
  for (const [key, bucket] of rows) {
    console.log(`  ${key.padEnd(width)}  ${String(bucket.n).padStart(5)} 次   成功 ${String(bucket.ok).padStart(5)}`);
  }
}
if (diffs.length) {
  console.log('');
  console.log('--- 前 8 条差异 ---');
  for (const d of diffs.slice(0, 8)) {
    console.log(`✗ ${d.label}`);
    console.log(`  web: ${String(d.web).slice(0, 600)}`);
    console.log(`  ts : ${String(d.ts).slice(0, 600)}`);
  }
  console.log('');
  console.log('PARITY FAIL');
  process.exitCode = 1;
} else {
  console.log('');
  console.log('PARITY PASS — 全部逐字节一致');
}
