/**
 * unit1_battle.mjs — 战斗内核数值对拍：web `game/src/core/battle.ts` vs Cocos `assets/scripts/core/battle.ts`
 *
 * 驱动：同 `createWorld` 参数、同 seed、同 data 对象；600 tick 逐 tick 比对
 *       主将 hp/mp/qi/alive、双方 start/soldiers/aliveCount/aliveInf/aliveCav、
 *       world.over / endReason / winner；跑完再 `settle()` + `world.stats` 逐字段比对。
 *
 * 军师技组：`createWorld({ a:{strategy:seq} })` 之后立刻 `applyWiseOnBattleStart(world, data, { prefer })`
 *   —— 这正是 main.js 的真实流程（`?wise=` 同时接到战前效果与 `army.seq`），也是 web 侧 R88 去重块生效的场景。
 *
 * 三个变体：
 *   raw        —— 仓库现在的两侧源码原样（= 真正的「Cocos 验收」口径）
 *   fix        —— 把 Cocos 侧落后于 web 的 4 处按 web 语义改写后重编。**只改 work/parity_num/_sim/srcfix 的副本**，
 *                 一个字节都不碰 game/cocos。用来证明「差异恰好由这 4 处引起」，并给出精确补丁。
 *   negative   —— 在 fix 之上再故意把 Cocos 的 ATTACK_COOLDOWN 改 40→41，断言必须转红。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ROOT, SIM, TSC, compile, loadCjs, loadSimEsm, readJson, diffDeep, makeResult, ser,
} from './build_sim.mjs';

const WEB_ENTRY = 'web/core/battle.js';
const COC_ENTRY = 'cocos/core/battle.js';
const FIX_ENTRY = 'cocos_fix/core/battle.js';

/* ------------------------------------------------------------------ *
 * 0. Cocos 侧落后于 web 的 4 处（只在 _sim/srcfix 副本上打）
 *    来源：work/parity_num/_core_diff.md 的 battle.ts / capture.ts 段落
 * ------------------------------------------------------------------ */
export const COCOS_PATCHES = [
  {
    id: 'P1 ATTACK_COOLDOWN 120→40',
    file: 'core/battle.ts',
    why: 'web game/src/core/battle.ts:78 = 40（R113 按原作 0x43B574 硬编码 [u+0x34]=0x28）；Cocos core/battle.ts:72 仍是 120',
    find: 'export const ATTACK_COOLDOWN = 120;',
    replace: 'export const ATTACK_COOLDOWN = 40;',
  },
  {
    id: 'P2 basicDamage 军师技加法（不是乘法）',
    file: 'core/battle.ts',
    why: "web:1343 是 R33 的加法 `base + wiseBonus(...,'troop_atk')`；Cocos:1331 仍是旧式 `Math.round(base*(1+bonus/100))`",
    find: "return Math.round(base * (1 + wiseBonus(world, side, 'troop_atk') / 100));",
    replace: "return base + wiseBonus(world, side, 'troop_atk');",
  },
  {
    id: 'P3 R88 战前军师技去重（import）',
    file: 'core/battle.ts',
    why: 'web:24 还 import 了 wiseAppliedAtStart；Cocos:24 只 import 了 wiseBonus',
    find: "import { wiseBonus } from './wises';",
    replace: "import { wiseAppliedAtStart, wiseBonus } from './wises';",
  },
  {
    id: 'P3b R88 去重块本体',
    file: 'core/battle.ts',
    why: 'web:1582-1591 的 for-of 去重块在 Cocos 整块缺失（recompute 尾部 tickStrategy 之前）',
    find: '  tickStrategy(world);',
    replace:
      "  for (const side of ['A', 'B'] as const) {\n" +
      '    const army = world.army?.[side];\n' +
      '    if (!army || army.seq == null) continue;\n' +
      '    if (wiseAppliedAtStart(world, side).includes(army.seq)) army.seq = null;\n' +
      '  }\n' +
      '  tickStrategy(world);',
  },
  {
    id: 'P4 战后掉落（capture.ts）',
    file: 'core/capture.ts',
    why: 'web capture.ts:452-455 按 R57 删掉了掉落轮盘（原作战斗不掉落）；Cocos capture.ts:454-456 仍在 rollDrop 并 push',
    find:
      '  // 5) 掉落：原作战斗不掉落（§5.1 负证据），本作按需求在胜方战后掷一次轮盘\n' +
      '  const drop = rollDrop(data, ws.general.level, taken, rng);\n' +
      '  if (drop) report.drops.push(drop);\n',
    replace:
      '  // 5) 掉落：原作战斗不掉落（§5.1 负证据），这里不再调用；report.drops 恒为空数组\n',
  },
  // P5：wises.ts 的 troop_atk 表 —— web 是 R33 之后的「点数 + 敌我分明」，
  // Cocos 还是旧版「百分比 + 全部 target:'self'」。6 行全换。
  {
    id: 'P5a 强化士兵 16 → 敵軍士兵攻擊 −10',
    file: 'core/wises.ts',
    why: "web wises.ts:216 `{ target:'enemy', value:-10, note:'敵軍士兵攻擊 −10' }`；Cocos wises.ts:194 `{ target:'self', value:8, note:'士兵攻擊 +8%' }`",
    find: "  16: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 8, note: '士兵攻擊 +8%' },",
    replace: "  16: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -10, note: '敵軍士兵攻擊 −10' },",
  },
  {
    id: 'P5b 强化士兵 45 → 敵軍士兵攻擊 −20',
    file: 'core/wises.ts',
    why: "web wises.ts:217 `{ target:'enemy', value:-20 }`；Cocos wises.ts:195 `{ target:'self', value:14 }`",
    find: "  45: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 14, note: '士兵攻擊 +14%' },",
    replace: "  45: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -20, note: '敵軍士兵攻擊 −20' },",
  },
  {
    id: 'P5c 强化士兵 63 → 敵軍士兵攻擊 −30',
    file: 'core/wises.ts',
    why: "web wises.ts:218 `{ target:'enemy', value:-30 }`；Cocos wises.ts:196 `{ target:'self', value:20 }`",
    find: "  63: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 20, note: '士兵攻擊 +20%' },",
    replace: "  63: { kind: 'troop_atk', target: 'enemy', op: 'mod', channel: 'troop_atk', value: -30, note: '敵軍士兵攻擊 −30' },",
  },
  {
    id: 'P5d 增強攻擊 17 → 士兵攻擊 +10（点数）',
    file: 'core/wises.ts',
    why: 'web wises.ts:212 value 10 note「士兵攻擊 +10」；Cocos wises.ts:197 value 10 但 note 是 +10%',
    find: "  17: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 10, note: '士兵攻擊 +10%' },",
    replace: "  17: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 10, note: '士兵攻擊 +10' },",
  },
  {
    id: 'P5e 增強攻擊 46 → 士兵攻擊 +20',
    file: 'core/wises.ts',
    why: 'web wises.ts:213 value 20；Cocos wises.ts:198 value 18',
    find: "  46: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 18, note: '士兵攻擊 +18%' },",
    replace: "  46: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 20, note: '士兵攻擊 +20' },",
  },
  {
    id: 'P5f 增強攻擊 64 → 士兵攻擊 +30',
    file: 'core/wises.ts',
    why: 'web wises.ts:214 value 30；Cocos wises.ts:199 value 26',
    find: "  64: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 26, note: '士兵攻擊 +26%' },",
    replace: "  64: { kind: 'troop_atk', target: 'self', op: 'mod', channel: 'troop_atk', value: 30, note: '士兵攻擊 +30' },",
  },
];

/** 把 Cocos 源码复制到 _sim/srcfix 并打上补丁，然后编成单独一份 CJS */
function buildFixVariant() {
  const srcRoot = path.join(SIM, 'srcfix');
  const scripts = path.join(ROOT, 'game/cocos/assets/scripts');
  fs.rmSync(srcRoot, { recursive: true, force: true });
  const copyDir = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) copyDir(a, b);
      else if (e.name.endsWith('.ts')) fs.copyFileSync(a, b);
    }
  };
  for (const rel of ['types.ts', 'AudioBus.ts']) fs.copyFileSync(path.join(scripts, rel), path.join(srcRoot, rel).replace(/^(.*)$/, (m) => { fs.mkdirSync(path.dirname(m), { recursive: true }); return m; }));
  copyDir(path.join(scripts, 'core'), path.join(srcRoot, 'core'));

  for (const p of COCOS_PATCHES) {
    const f = path.join(srcRoot, p.file);
    const text = fs.readFileSync(f, 'utf8');
    const n = text.split(p.find).length - 1;
    // n === 0：Cocos 侧已经和 web 一致了（sync_core3 之后就是这种状态），
    // 这时「修好的变体」与真身相同，直接跳过补丁即可，不算失败。
    if (n === 0) continue;
    if (n !== 1) throw new Error(`补丁 ${p.id} 锚点命中 ${n} 次（要求恰好 1 次）：${p.file}`);
    fs.writeFileSync(f, text.replace(p.find, p.replace), 'utf8');
  }

  const out = path.join(SIM, 'cocos_fix');
  fs.rmSync(out, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    [
      TSC, '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--moduleResolution', 'node',
      '--skipLibCheck', '--noCheck', '--rootDir', srcRoot, path.join(srcRoot, 'core/battle.ts'),
    ],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' },
  );
  return out;
}

/* ------------------------------------------------------------------ *
 * 1. 参数矩阵：{terrain 0/7/9} × {3 种 troopMode} × {3 种军师技组合}，两组种子 = 54 组
 * ------------------------------------------------------------------ */
export const TERRAINS = [0, 7, 9];
export const SEEDS = [20260101, 777];
export const TICKS = 600;

const TROOP_MODES = {
  mirror: {
    a: { troop: 2, formation: 0, soldiers: 60, general: { name: '關羽', str: 84, int: 60, level: 12 } },
    b: { troop: 2, formation: 0, soldiers: 60, general: { name: '張飛', str: 84, int: 60, level: 12 } },
  },
  mixed: {
    a: { troop: 2, formation: 1, soldiers: 70, general: { name: '關羽', str: 90, int: 70, level: 20 } },
    b: { troop: 10, formation: 4, soldiers: 70, general: { name: '呂布', str: 99, int: 40, level: 20 } },
  },
  cavalry: {
    a: { troop: 2, formation: 2, soldiers: 100, general: { name: '關羽', str: 90, int: 70, level: 34 } },
    b: { troop: 10, formation: 6, soldiers: 100, general: { name: '張飛', str: 88, int: 55, level: 34 } },
  },
};

/** 17 = 增强攻击 L1（自己士兵攻击 +10）；64 = +30；45 = 敌士兵攻击 −20 */
const WISE_PAIRS = [
  { tag: 'wise-null', a: null, b: null },
  { tag: 'wise-A17', a: 17, b: null },
  { tag: 'wise-A64-B45', a: 64, b: 45 },
];

export function buildCases() {
  const out = [];
  for (const terrain of TERRAINS) {
    for (const mode of Object.keys(TROOP_MODES)) {
      for (const wp of WISE_PAIRS) {
        for (const seed of SEEDS) {
          out.push({ tag: `T${terrain}/${mode}/${wp.tag}/s${seed}`, terrain, seed, a: TROOP_MODES[mode].a, b: TROOP_MODES[mode].b, wise: wp });
        }
      }
    }
  }
  return out;
}

/** 逐 tick 快照（22 个叶子）：主将 hp/mp/qi/alive + 双方 start/soldiers/aliveCount/aliveInf/aliveCav + 终局标志 */
function snapTick(w) {
  const mk = (s) => ({
    hp: s.general.hp,
    mp: s.general.mp,
    qi: s.general.qi,
    alive: s.general.alive,
    start: s.start,
    soldiers: s.soldiers,
    aliveCount: s.aliveCount,
    aliveInf: s.aliveInf,
    aliveCav: s.aliveCav,
  });
  return { tick: w.tick, A: mk(w.sides.A), B: mk(w.sides.B), over: w.over, endReason: w.endReason, winner: w.winner };
}

/* ------------------------------------------------------------------ *
 * 2. 单次对局
 * ------------------------------------------------------------------ */
function runOne(MOD, opts, data) {
  const W = MOD.battle;
  const w = W.createWorld({ data, seed: opts.seed, terrain: opts.terrain, a: opts.a, b: opts.b, damageChannel: 'script' });
  if (opts.wise.a || opts.wise.b) {
    MOD.wises.applyWiseOnBattleStart(w, data, { prefer: { A: opts.wise.a ?? null, B: opts.wise.b ?? null } });
  }
  const pre = {
    A: { hp: w.sides.A.general.hp, mp: w.sides.A.general.mp, qi: w.sides.A.general.qi },
    B: { hp: w.sides.B.general.hp, mp: w.sides.B.general.mp, qi: w.sides.B.general.qi },
    seqA: w.army?.A?.seq,
    seqB: w.army?.B?.seq,
    atkModA: w.army?.A?.atkMod,
    atkModB: w.army?.B?.atkMod,
    mods: ser(MOD.wises.wiseModifiers(w)),
  };
  const ticks = [];
  for (let i = 0; i < TICKS; i += 1) {
    W.step(w);
    ticks.push(snapTick(w));
  }
  const settled = W.settle(w);
  return { pre, ticks, settled, stats: w.stats, world: { tick: w.tick, over: w.over, endReason: w.endReason, winner: w.winner } };
}

/* ------------------------------------------------------------------ *
 * 3. 一对模块跑完整个矩阵，统一记账
 * ------------------------------------------------------------------ */
function comparePair(pair, cases, data) {
  const out = { cases: 0, fields: 0, misses: 0, samples: [], capped: 0, firstDiff: null, perCase: [] };
  const seen = new Set();
  const take = (web, coc, tag, keyOf) => {
    const box = diffDeep(web, coc);
    out.fields += box.fields;
    if (!box.misses.length && !box.capped) return 0;
    out.misses += box.misses.length + box.capped;
    out.capped += box.capped;
    if (out.firstDiff === null && box.misses.length) out.firstDiff = { case: tag, path: box.misses[0].path };
    for (const m of box.misses) {
      const k = keyOf(m.path);
      if (seen.has(k) || out.samples.length >= 24) continue;
      seen.add(k);
      out.samples.push({ path: `${tag} ${m.path}`, key: k, web: m.web, cocos: m.cocos });
    }
    return box.misses.length + box.capped;
  };
  for (const c of cases) {
    const web = runOne(pair.web, c, data);
    const coc = runOne(pair.coc, c, data);
    out.cases += 1;
    let n = take(web.pre, coc.pre, `${c.tag} 战前`, (p) => `pre:${p}`);
    for (let i = 0; i < TICKS; i += 1) {
      out.cases += 1;
      n += take(web.ticks[i], coc.ticks[i], `${c.tag} tick${i + 1}`, (p) => p);
      if (n && !out.perCase.length) out.perCase.length = 0;
    }
    out.cases += 1;
    const sn = take({ settle: web.settled, stats: web.stats, world: web.world }, { settle: coc.settled, stats: coc.stats, world: coc.world }, `${c.tag} 战后`, (p) => `post:${p}`);
    out.perCase.push({ tag: c.tag, preOrPostMiss: n, settleMiss: sn, winner: web.world.winner, over: web.world.over, endReason: web.world.endReason, ticks: web.world.tick });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. 主入口
 * ------------------------------------------------------------------ */
export async function run({ negative = false } = {}) {
  compile('tsconfig.cocos.json');
  compile('tsconfig.web.json');
  buildFixVariant();

  const WEB = { battle: await loadSimEsm(WEB_ENTRY), wises: await loadSimEsm('web/core/wises.js') };
  const COC_RAW = { battle: loadCjs(COC_ENTRY), wises: loadCjs('cocos/core/wises.js') };
  const COC_FIX = { battle: loadCjs(FIX_ENTRY), wises: loadCjs('cocos_fix/core/wises.js') };

  const data = {
    troops: readJson('game/data/troops.json'),
    formations: readJson('game/data/formations.json'),
    magics: readJson('game/data/magics.json'),
    wises: readJson('game/data/wises.json'),
    generals: readJson('game/data/generals.json'),
    terrains: readJson('game/data/terrains.json'),
    items: readJson('game/data/items.json'),
    scenarios: readJson('game/data/scenarios.json'),
  };
  const cases = buildCases();

  const res = makeResult(
    'unit1-battle',
    `${cases.length} 组参数 (terrain ${TERRAINS.join('/')} × 3 troopMode × 3 军师技组合 × 2 seed) × ${TICKS} tick`,
  );
  res.notes.push(`两侧共用同一份 GameData（web game/data/；两仓 data 并不相同，见报告「数据层」一节）`);
  res.notes.push(`Cocos 侧落后于 web 的 ${COCOS_PATCHES.length} 处（仅打在 _sim/srcfix 副本上）：${COCOS_PATCHES.map((p) => p.id.split(' ')[0]).join(' ')}`);

  // ── (1) 原样：这才是「两端数值是否一致」的答案 ─────────────────────────
  const raw = comparePair({ web: WEB, coc: COC_RAW }, cases, data);
  Object.assign(res, {
    cases: raw.cases,
    fields: raw.fields,
    misses: raw.samples,
    missesCount: raw.misses,
    capped: raw.capped,
    firstDiff: raw.firstDiff,
    perCase: raw.perCase,
  });
  res.extra.raw = { cases: raw.cases, fields: raw.fields, misses: raw.misses };

  // ── (2) 打完 4 处补丁后重跑：验证「差异恰好由这 4 处引起」 ──────────────
  const fixd = comparePair({ web: WEB, coc: COC_FIX }, cases, data);
  res.extra.fixed = { cases: fixd.cases, fields: fixd.fields, misses: fixd.misses };
  res.notes.push(`原样 Cocos → 比较条目 ${raw.cases} / 字段 ${raw.fields} / 不一致 ${raw.misses}`);
  res.notes.push(`打完 P1~P5 之后 → 比较条目 ${fixd.cases} / 字段 ${fixd.fields} / 不一致 ${fixd.misses}`);
  if (fixd.misses === 0) {
    res.notes.push('⇒ P1~P5 足以让 battle.ts / capture.ts / wises.ts(troop_atk) 数值逐 tick 完全一致（差异归因完成）');
  } else {
    res.notes.push(`⇒ 仍有 ${fixd.misses} 条差异未被 P1~P5 解释，first=${fixd.firstDiff?.case} ${fixd.firstDiff?.path}`);
    for (const s of fixd.samples.slice(0, 10)) res.notes.push(`   残留 ✗ ${s.path} web=${ser(s.web)} cocos=${ser(s.cocos)}`);
  }

  // ── (3) 阴性对照 ───────────────────────────────────────────────────────
  if (negative) {
    const before = COC_FIX.battle.ATTACK_COOLDOWN;
    COC_FIX.battle.ATTACK_COOLDOWN = before + 1;
    const neg = comparePair({ web: WEB, coc: COC_FIX }, cases, data);
    res.notes.push(
      `阴性对照：在 fix 之上把 Cocos 的 ATTACK_COOLDOWN 由 ${before} 改成 ${COC_FIX.battle.ATTACK_COOLDOWN}（web 仍为 ${WEB.battle.ATTACK_COOLDOWN}）` +
        ` → fix 基线 ${fixd.misses} 条 / 扰动后 ${neg.misses} 条`,
    );
    res.notes.push(`阴性对照结论：${neg.misses > fixd.misses ? 'RED（按预期转红）' : 'GREEN —— 对拍恒真，无效！'}`);
    res.extra.negative = { baseline: fixd.misses, perturbed: neg.misses, red: neg.misses > fixd.misses };
    res.extra.negativeRed = neg.misses > fixd.misses;
    COC_FIX.battle.ATTACK_COOLDOWN = before;
  }
  return res;
}

/* 直接跑：node work/parity_num/unit1_battle.mjs [--negative] */
if (process.argv[1]?.endsWith('unit1_battle.mjs')) {
  const { report } = await import('./build_sim.mjs');
  const r = await run({ negative: process.argv.includes('--negative') });
  report(r, { show: 20 });
  if (process.argv.includes('--negative')) process.exitCode = r.extra.negativeRed ? 0 : 1;
  else process.exitCode = (r.missesCount ?? 0) === 0 ? 0 : 1;
}
