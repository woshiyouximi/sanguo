/**
 * unit3_city.mjs — 内政模型对拍：web `game/web/city_model.js` vs Cocos `assets/scripts/CityModel.ts`
 *
 * 手法沿用 `work/cocos_city/parity.mjs`（同仓库已验证）：同一批真实剧本数据 + 10 座城 ×
 * 3 个种子 × 10 轮 × 8 条命令（開發/徵兵/搜索/移動/任命/物品/情報/出征）+ 月令 + 自治 +
 * 换月补兵，每一步的**回传值**与**存档快照**两边必须一致。
 *
 * 相对旧脚本的三处改造：
 *   1. 数据取 `game/data/`（三方对拍统一口径；两仓 data 并不相同，见报告「数据层」）
 *   2. 判定同时给两个口径：`diffDeep` 的字段/条目统计（统一格式）+ `JSON.stringify` 逐字节
 *      （更严，连键的插入顺序都比；只报在 `键序` 命名下）
 *   3. 加 `fix` 变体：把 Cocos 侧落后于 web 的几处按 web 语义改写后重编（**只改 _sim 副本**），
 *      用来把差异归因到具体函数
 *
 * `hallImageOf`（美术资源路径，非数值）不计入数值回归，单独列在报告的「非数值差异」里。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ROOT, SIM, TSC, compile, loadCjs, loadEsm, readJson, diffDeep, makeResult, ser, clone,
} from './build_sim.mjs';

/* ------------------------------------------------------------------ *
 * 0. Cocos 侧落后于 web 的补丁（只打在 _sim/srcfix_city 副本上）
 * ------------------------------------------------------------------ */
export const COCOS_PATCHES = [
  {
    id: 'C1 efficiencyOf 公式',
    file: 'CityModel.ts',
    why:
      'web city_model.js:805-809 是 R9 反汇编口径 majorFactor(INT) = 1 + (INT−70)×2/300（原作 0x427A84/0x427947）；' +
      'Cocos CityModel.ts:798-807 还是旧版 [新设计] 1 + min(INT/400, 0.25)',
    find: '  return 1 + Math.min(EFF.MAX_BONUS, int / EFF.DIV);',
    replace: '  return 1 + ((int - 70) * 2) / 300;',
  },
  {
    id: 'C2 DEV.DEF 6→12（防御增量随机模数）',
    file: 'CityModel.ts',
    why: 'web city_model.js:884 `randBelow(DEV.DEF)`，DEV.DEF=incrVal(\'devDef\')=12（R9：0x427947 push 0xC）；Cocos CityModel.ts:216 `devDef: { v: 6 }`',
    find: "  devDef: { v: 6, grade: '新設計',",
    replace: "  devDef: { v: 12, grade: '新設計',",
  },
  {
    id: 'C3 DEV.POP_CAP 400000→1000000',
    file: 'CityModel.ts',
    why: "web city_model.js:873 用 DEV.POP_CAP=incrVal('devPopCap')=1000000（R9：0x427A84 硬闸 0xF4240）；Cocos CityModel.ts:217 `devPopCap: { v: 400000 }`",
    find: "  devPopCap: { v: 400000, grade: '新設計',",
    replace: "  devPopCap: { v: 1000000, grade: '新設計',",
  },
  {
    id: 'C4 EFF.DIV 400→300',
    file: 'CityModel.ts',
    why: "web city_model.js:148 MAJOR_RULE.DEN = incrVal('effDiv') = 300；Cocos CityModel.ts:246 `effDiv: { v: 400 }`",
    find: "  effDiv: { v: 400, grade: '新設計',",
    replace: "  effDiv: { v: 300, grade: '新設計',",
  },
  {
    id: 'C5 EFF 补 PIVOT=70',
    file: 'CityModel.ts',
    why: 'web city_model.js:209 `EFF = { DIV, MAX_BONUS, PIVOT: MAJOR_RULE.PIVOT }`（PIVOT=70）；Cocos CityModel.ts:308 没有 PIVOT 键',
    find: "export const EFF = { DIV: incrVal('effDiv'), MAX_BONUS: incrVal('effMax') };",
    replace: "export const EFF = { DIV: incrVal('effDiv'), MAX_BONUS: incrVal('effMax'), PIVOT: 70 };",
  },
];

/** 把 Cocos CityModel.ts 复制到 _sim/srcfix_city 打补丁并重编 */
function buildFixVariant() {
  const srcDir = path.join(SIM, 'srcfix_city');
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.mkdirSync(srcDir, { recursive: true });
  const src = path.join(ROOT, 'game/cocos/assets/scripts/CityModel.ts');
  const dst = path.join(srcDir, 'CityModel.ts');
  fs.copyFileSync(src, dst);
  for (const p of COCOS_PATCHES) {
    const text = fs.readFileSync(dst, 'utf8');
    const n = text.split(p.find).length - 1;
    if (n !== 1) throw new Error(`city 补丁 ${p.id} 锚点命中 ${n} 次（要求恰好 1 次）`);
    fs.writeFileSync(dst, text.replace(p.find, p.replace), 'utf8');
  }
  const out = path.join(SIM, 'cocos_city_fix');
  fs.rmSync(out, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [TSC, '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--moduleResolution', 'node',
      '--skipLibCheck', '--noCheck', '--rootDir', srcDir, dst],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' },
  );
  return 'cocos_city_fix/CityModel.js';
}

/* ------------------------------------------------------------------ *
 * 1. 与两端都无关的本地 PRNG（保证参数选择一致）
 * ------------------------------------------------------------------ */
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

function freshSave(scenario, gold) {
  return {
    gold, month: 3, scenario: scenario.id, owned: [], cities: {}, roster: {}, appointed: {},
    searchLog: [], foundItems: [], auto: {}, autoMonth: 0, lastActionMonth: 0, tire: {}, morale: {},
  };
}

const CMD_NAMES = ['開發', '徵兵', '搜索', '移動', '任命', '物品', '情報', '出征'];
/** 非数值：美术资源路径（不计入数值回归） */
const NON_NUMERIC = new Set(['hallImageOf']);

/** 深拷贝：函数类返回值（LOCK_HINT/AUTONOMY 里的模板函数）拷不动，退回原引用 */
function safeClone(v) {
  try {
    return clone(v);
  } catch {
    return v;
  }
}

/* ------------------------------------------------------------------ *
 * 2. 一串固定操作 → 可 JSON 化的日志
 * ------------------------------------------------------------------ */
/** 钉死的搜索 nonce（web 侧每份存档一个；不钉死会走 crypto.getRandomValues，跨次不可复现） */
const NONCE = 0x5eed1234;

function runScript(mod, scenario, cityNames, seed, bagSeqs, generalLevel) {
  const rnd = rngOf(seed);
  const ctx = { generals: GENS, items: ITEMS, wises: WISES, scenario, scenIdx: 0, bag: bagSeqs.slice(), level: generalLevel };
  const save = freshSave(scenario, 1200 + Math.floor(rnd() * 4000));
  save.owned = cityNames.slice(0, 3);
  // 同一存档 / 同一种子：把 web 的随机源与搜索 nonce 都钉死，否则 web 侧 develop 走
  // crypto.getRandomValues（city_model.js:250-259）——每次跑都不一样，对拍没有意义。
  // Cocos 侧没有 setRng（它的 develop 本来就不带随机），注入只是单边的，这正是差异之一。
  if (typeof mod.setRng === 'function') mod.setRng(rngOf((seed ^ 0x9e3779b9) >>> 0));
  save.searchNonce = NONCE;
  const log = [];
  // 必须**当场深拷贝**：多数对外接口回传的是存档内部对象的活引用（`ensureCityState` 回 st、
  // `ensureExtras` 回 save），若只存引用，日志里每条都会退化成「跑完时的最终状态」，
  // 差异定位就全乱了（旧脚本 work/cocos_city/parity.mjs 就是这个毛病）。
  const push = (label, value) => log.push([label, safeClone(value)]);

  push('ensureExtras', mod.ensureExtras(save));
  if (typeof mod.setSearchNonce === 'function') mod.setSearchNonce(save, NONCE);
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
    push(`${tag}/hallImageOf`, mod.hallImageOf(def));
    push(`${tag}/isGate`, mod.isGate(def));
    push(`${tag}/efficiencyOf`, mod.efficiencyOf(save, def, ctx));
    push(`${tag}/majorOf`, mod.majorOf(save, def));
    push(`${tag}/wiseOf`, mod.wiseOf(save, def));
    push(`${tag}/rosterOf`, mod.rosterOf(save, cityName, ctx).map((g) => g.NAME));
    push(`${tag}/stationedNames`, Array.from(mod.stationedNames(save, ctx)).sort());
    push(`${tag}/wildPool`, mod.wildPool(save, cityName, ctx).map((g) => g.NAME));
    push(`${tag}/searchCount`, mod.searchCount(save, cityName));
    push(`${tag}/monthLocked`, mod.monthLocked(save, false));

    push(`${tag}/開發`, mod.develop(save, def, ctx));
    push(`${tag}/開發.again`, mod.develop(save, def, ctx));
    push(`${tag}/save.gold`, save.gold);

    const arm = rnd() < 0.5 ? 'inf' : 'cav';
    const n = Math.floor(rnd() * 400);
    push(`${tag}/徵兵.enlist.${arm}`, mod.enlist(save, def, { arm, n }, ctx));
    push(`${tag}/徵兵.enlist.other`, mod.enlist(save, def, { arm: arm === 'inf' ? 'cav' : 'inf', n: 40 }, ctx));
    push(`${tag}/徵兵.enlist.bad`, mod.enlist(save, def, { arm: 'archer', n: 10 }, ctx));
    push(`${tag}/徵兵.enlist.none`, mod.enlist(save, def, { arm: 'inf', n: 0 }, ctx));
    push(`${tag}/徵兵.recruit`, mod.recruit(save, def, ctx));
    push(`${tag}/徵兵.state`, clone(mod.cityStateOf(save, cityName)));

    push(`${tag}/搜索.1`, mod.search(save, def, ctx));
    push(`${tag}/搜索.2`, mod.search(save, def, ctx));
    push(`${tag}/搜索.3`, mod.search(save, def, ctx));
    push(`${tag}/搜索.log`, mod.recentLog(save, 4, cityName));
    push(`${tag}/搜索.state`, clone(mod.cityStateOf(save, cityName)));

    const neigh = mod.neighboursOf(cityName, scenario);
    for (const to of neigh.slice(0, 3)) {
      const troops = Math.floor(rnd() * 300);
      const gens = mod.rosterOf(save, cityName, ctx);
      const general = gens.length && rnd() < 0.5 ? gens[0].NAME : '';
      push(`${tag}/移動→${to}`, mod.move(save, def, { to, troops, general }, ctx));
    }
    push(`${tag}/移動.bad`, mod.move(save, def, { to: cityName, troops: 10 }, ctx));
    push(`${tag}/移動.state`, clone(save.cities[cityName]));

    const gens2 = mod.rosterOf(save, cityName, ctx);
    if (gens2.length) {
      push(`${tag}/任命.major`, mod.appoint(save, def, 'major', gens2[0].NAME, ctx));
      push(`${tag}/任命.wise`, mod.appoint(save, def, 'wise', gens2[gens2.length - 1].NAME, ctx));
    }
    push(`${tag}/任命.bad`, mod.appoint(save, def, 'king', '無名', ctx));
    push(`${tag}/任命.appointed`, clone(save.appointed[cityName]));

    push(`${tag}/物品.parse.null`, mod.parseItemsSave(null));
    push(`${tag}/物品.parse.bag`, mod.parseItemsSave({ bag: [3, '7', 0, -1, 3], equip: { a: 1 } }));
    push(`${tag}/物品.withBagItem`, mod.withBagItem({ bag: [3] }, 49));
    push(`${tag}/物品.ownedItemSeqs`, mod.ownedItemSeqs(save, ctx));

    push(`${tag}/情報`, mod.intel(save, def, ctx));
    push(`${tag}/出征.targets`, mod.deployTargets(save, def, ctx));
  }

  push('lock.before', mod.monthLocked(save, false));
  push('lock.mark', mod.markMonthActed(save, false));
  push('lock.after', mod.monthLocked(save, false));
  push('lock.afterUnlimited', mod.monthLocked(save, true));
  push('lock.markUnlimited', mod.markMonthActed(save, true));
  push('lock.clear', mod.clearMonthLock(save));
  push('lock.afterClear', mod.monthLocked(save, false));
  push('lock.lastActionMonth', save.lastActionMonth);

  for (const name of cityNames.slice(0, 4)) push(`auto.set.${name}`, mod.setAuto(save, name, true));
  push('auto.cities', mod.autoCities(save, scenario.cities));
  push('auto.isAuto', mod.isAuto(save, cityNames[0]));
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

  push('const.incrRows', mod.incrRows());
  for (const key of ['devGold', 'prepGainPct', 'cavCapMax', 'effMax', 'noSuchKey']) push(`const.incrVal.${key}`, mod.incrVal(key));
  for (const k of ['DEV', 'RECRUIT', 'SEARCH', 'EFF', 'ARMS', 'ARM_NAMES', 'CMD_ORDER', 'CMD_EXTRA', 'CMD_META',
    'INCR_GRADES', 'PATH_SENTINEL', 'FLAG_GATE', 'BAG_KEY', 'DEFAULT_BAG', 'MOVE', 'APPOINT', 'AUTONOMY',
    'LOCK_HINT', 'UNLIMITED_HINT']) push(`const.${k}`, mod[k]);
  push('util.monthLabel', [1, 2, 12, 13, 25, 0, -3, 999].map((m) => {
    const s = { month: m };
    mod.logAdd(s, { text: 'x' });
    return s.searchLog[s.searchLog.length - 1].t;
  }));
  push('util.hashSeed', [mod.hashSeed('a'), mod.hashSeed('a', 1, 'b'), mod.hashSeed()]);
  push('util.searchSeed', mod.searchSeed('成都', 7, 3));
  push('util.mulberry32', Array.from({ length: 5 }, mod.mulberry32(mod.searchSeed('成都', 7, 3))));
  push('util.levelOf', [
    mod.levelOf({ NAME: 'a', level: 33 }, ctx), mod.levelOf({ NAME: 'b' }, ctx),
    mod.levelOf({ NAME: 'c' }, { ...ctx, level: 55 }), mod.levelOf(null, null),
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
    mod.rememberFound(s, 52); mod.rememberFound(s, 52); mod.rememberFound(s, 0);
    return s.foundItems;
  })());
  push('util.addToRoster', (() => {
    const s = { roster: {} };
    mod.addToRoster(s, '成都', '關羽'); mod.addToRoster(s, '成都', '關羽');
    return s.roster;
  })());
  push('save.final', clone(save));
  return log;
}

/** 非数值：常量表里的取证说明文字（`incrRows()[i].src`），不影响任何算式 */
const isDocPath = (p) => /(^|\.)src$/.test(String(p));

let SCEN; let GENS; let ITEMS; let WISES;

/* ------------------------------------------------------------------ *
 * 3. 主入口
 * ------------------------------------------------------------------ */
export async function run({ negative = false } = {}) {
  compile('tsconfig.city.json');
  const FIX_ENTRY = buildFixVariant();

  const WEB = await loadEsm('game/web/city_model.js');
  const COC_RAW = loadCjs('cocos_city/CityModel.js');
  const COC_FIX = loadCjs(FIX_ENTRY);

  SCEN = readJson('game/data/scenarios.json');
  GENS = readJson('game/data/generals.json');
  ITEMS = readJson('game/data/items.json');
  WISES = readJson('game/data/wises.json');

  const scenario = SCEN[0];
  const allCities = scenario.cities;
  const withPaths = allCities.filter((c) => Number(c.RATE) > 0);
  const gates = allCities.filter((c) => c.RATE === 0);
  const picked = [...withPaths.slice(0, 7), ...gates.slice(0, 3)].map((c) => c.NAME);
  const SEEDS = [11, 2024, 777];
  const BAGS = [[], [1, 4], [52, 49, 14, 20, 45]];

  /** 30 组（3 seed × 10 轮）脚本，web 侧只跑一次，两个变体复用 */
  const scripts = [];
  let detBad = 0;
  let detFields = 0;
  for (const seed of SEEDS) {
    for (let i = 0; i < 10; i += 1) {
      const rotated = picked.map((_, k) => picked[(k + i) % picked.length]);
      const bag = BAGS[i % BAGS.length];
      const level = i % 3 === 0 ? 30 : undefined;
      const web = runScript(WEB, scenario, rotated, seed, bag, level);
      const web2 = runScript(WEB, scenario, rotated, seed, bag, level);
      // 确定性自检：同一存档/同一种子，web 连跑两遍必须一字不差
      const box = diffDeep(web.map((e) => e[1]), web2.map((e) => e[1]));
      detFields += box.fields;
      if (box.misses.length) detBad += 1;
      scripts.push({ seed, rot: i, cities: rotated, bag, level, web });
    }
  }

  const compare = (cocMod) => {
    const out = { cases: 0, fields: 0, misses: 0, samples: [], firstDiff: null, coverage: new Map(), orderOnly: 0, byLabel: new Map(), docMisses: 0 };
    const seen = new Set();
    for (const sc of scripts) {
      const logCoc = runScript(cocMod, scenario, sc.cities, sc.seed, sc.bag, sc.level);
      if (logCoc.length !== sc.web.length) {
        out.misses += 1;
        out.samples.push({ path: `[seed=${sc.seed} rot=${sc.rot}] 日志长度`, web: sc.web.length, cocos: logCoc.length });
        continue;
      }
      for (let k = 0; k < sc.web.length; k += 1) {
        const [label, a] = sc.web[k];
        const [, b] = logCoc[k];
        const key = label.includes('/') ? label.slice(label.indexOf('/') + 1) : label;
        if (!NON_NUMERIC.has(key)) {
          out.cases += 1;
          const bucket = out.coverage.get(key) ?? { n: 0, ok: 0 };
          bucket.n += 1;
          if (ser(a).includes('"ok":true')) bucket.ok += 1;
          out.coverage.set(key, bucket);
        }
        const box = diffDeep(a, b);
        const numMisses = box.misses.filter((m) => !isDocPath(m.path));
        const docMisses = box.misses.length - numMisses.length;
        out.docMisses += docMisses;
        if (NON_NUMERIC.has(key)) continue; // 美术路径单独说明，不进数值口径
        out.fields += box.fields;
        const strict = JSON.stringify(a) !== JSON.stringify(b);
        const n = numMisses.length;
        if (strict && n === 0 && docMisses === 0) { out.orderOnly += 1; out.misses += 1; }
        if (n) {
          out.misses += n;
          out.byLabel.set(key, (out.byLabel.get(key) ?? 0) + n);
          if (out.firstDiff === null) out.firstDiff = { case: `seed=${sc.seed} rot=${sc.rot}`, path: `${label} ${numMisses[0].path}` };
          for (const m of numMisses) {
            if (seen.has(key) || out.samples.length >= 24) continue;
            seen.add(key);
            out.samples.push({ path: `[seed=${sc.seed} rot=${sc.rot}] ${label} ${m.path}`, web: ser(m.web), cocos: ser(m.cocos) });
          }
        }
      }
    }
    return out;
  };

  const res = makeResult('unit3-city', `${scenario.id} 剧本 / 60 城取样 ${picked.length} 座 × 3 seed × 10 轮 × 8 命令 + 月令 + 自治 + 换月补兵`);
  res.notes.push(`命令覆盖：${CMD_NAMES.join(' / ')} + 自治 / 情報 / 月令 / 換月補兵；hallImageOf（美术路径）与 incrRows().src（取证文案）不计入数值口径`);
  res.notes.push(`确定性自检（web 同一存档/同种子连跑两遍，${scripts.length} 组）：${detBad ? `失败 ${detBad} 组` : `全部一致（字段 ${detFields}）`}`);
  res.extra.determinism = { scripts: scripts.length, bad: detBad, fields: detFields };

  // (1) 原样
  const raw = compare(COC_RAW);
  res.cases = raw.cases;
  res.fields = raw.fields;
  res.missesCount = raw.misses;
  res.misses = raw.samples;
  res.extra.raw = { cases: raw.cases, fields: raw.fields, misses: raw.misses, orderOnly: raw.orderOnly };
  if (raw.firstDiff) res.notes.push(`首个不一致：${raw.firstDiff.case} ${raw.firstDiff.path}`);

  // (2) 打完补丁
  const fixd = compare(COC_FIX);
  res.extra.fixed = { cases: fixd.cases, fields: fixd.fields, misses: fixd.misses, orderOnly: fixd.orderOnly };
  res.notes.push(`原样 Cocos → 比较条目 ${raw.cases} / 字段 ${raw.fields} / 不一致 ${raw.misses}（其中仅键序 ${raw.orderOnly}）`);
  res.notes.push(`打完 ${COCOS_PATCHES.map((p) => p.id).join(' + ')} 之后 → 比较条目 ${fixd.cases} / 字段 ${fixd.fields} / 不一致 ${fixd.misses}（其中仅键序 ${fixd.orderOnly}）`);
  if (fixd.misses === 0) res.notes.push('⇒ 补丁足以让内政数值逐字段完全一致（差异归因完成）');
  else {
    res.notes.push(`⇒ 仍有 ${fixd.misses} 条差异未被该补丁解释，first=${fixd.firstDiff?.path}`);
    for (const s of fixd.samples.slice(0, 10)) res.notes.push(`   残留 ✗ ${s.path} web=${s.web} cocos=${s.cocos}`);
  }

  const covRows = Array.from(raw.coverage.entries()).sort((a, b) => b[1].n - a[1].n);
  res.notes.push(`覆盖率：${covRows.slice(0, 12).map(([k, v]) => `${k} ${v.n}次/成功${v.ok}`).join('  ')}`);
  const hist = Array.from(raw.byLabel.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
  res.notes.push(`原样不一致按操作分布（前 ${hist.length}）：${hist.map(([k, v]) => `${k} ${v}`).join('  ')}`);
  const histFix = Array.from(fixd.byLabel.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
  res.notes.push(`补丁后残留分布（前 ${histFix.length}）：${histFix.map(([k, v]) => `${k} ${v}`).join('  ')}`);

  if (negative) {
    const before = COC_FIX.DEV.COST;
    COC_FIX.DEV.COST = before + 1;
    const neg = compare(COC_FIX);
    res.notes.push(`阴性对照：在 fix 之上把 Cocos 的 DEV.COST 由 ${before} 改成 ${COC_FIX.DEV.COST}（web 仍为 ${WEB.DEV.COST}）→ fix 基线 ${fixd.misses} 条 / 扰动后 ${neg.misses} 条`);
    res.notes.push(`阴性对照结论：${neg.misses > fixd.misses ? 'RED（按预期转红）' : 'GREEN —— 对拍恒真，无效！'}`);
    res.extra.negative = { baseline: fixd.misses, perturbed: neg.misses, red: neg.misses > fixd.misses };
    res.extra.negativeRed = neg.misses > fixd.misses;
    COC_FIX.DEV.COST = before;
  }
  return res;
}

if (process.argv[1]?.endsWith('unit3_city.mjs')) {
  const { report } = await import('./build_sim.mjs');
  const negative = process.argv.includes('--negative');
  const r = await run({ negative });
  report(r, { show: 20 });
  process.exitCode = negative ? (r.extra.negativeRed ? 0 : 1) : (r.missesCount === 0 ? 0 : 1);
}
