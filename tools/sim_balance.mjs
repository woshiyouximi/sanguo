#!/usr/bin/env node
/**
 * 三国群英传2 竖版重制 · 数值模拟 / 对拍器（headless，只读 game/src）
 *
 * 用真实战斗核心 `game/src/core/battle.ts` 跑四类实验，产出 work/sim_report.json：
 *   a) troop     13×13 兵种对拍（同阵形=方形、同士气=60、同兵力=100、同主将武 70）
 *   b) formation  9×9 阵形对拍（同兵种=朴刀）
 *   c) morale    士气敏感度：A 士气 0/25/50/75/100 vs B 固定 50；另加双方同士气的纯镜像
 *   d) general   武将影响：A 主将武 40/70/100 vs B 固定 70
 *
 * 复现口径：第 k 局种子的 seed = seed0 + k，与分组顺序、worker 数量无关；
 * 报告里带 `digest`（sha1，剔除耗时/时间戳），同参数两次跑 digest 必须一致。
 *
 * 用法：
 *   node tools/sim_balance.mjs --n 100 --only troop
 *   node tools/sim_balance.mjs --only all --out work/sim_report.json
 *   node tools/sim_balance.mjs --only troop --pairs full --n 20     # 169 组有序对（含对称性自检）
 *   node tools/sim_balance.mjs --selfcheck                          # 确定性自断言，退出码 0/1
 *
 * 参数默认值：--n 100 --soldiers 100 --seed0 1 --mirror-n 40 --max-sec 120
 *            --out work/sim_report.json --only all --pairs upper --workers 12
 *
 * 单局成本（i9-12900KF，100 兵/侧）：≈0.15–0.25 CPU·s（≈700 tick ~ 23 s 战场时间）。
 * 24 逻辑核实测只有 ~8× 有效并行（P/E 核 + SMT），即 ~30 局/s。
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { loadData } from '../game/src/data.ts';
import { TICK_HZ, createWorld, step } from '../game/src/core/battle.ts';

export const SELF = fileURLToPath(import.meta.url);
export const HERE = dirname(SELF);
export const ROOT = resolve(HERE, '..');
export const DATA_DIR = join(ROOT, 'game', 'data');

const GROUPS = ['troop', 'formation', 'morale', 'general'];

// ─────────────────────────────────────────────────────────── 实验定义

const STR_BASE = 70; // 主将武力基准（两侧同值 = 纯镜像）

function mkSide(troop, formation, morale, str) {
  return { troop, formation, morale, general: { str, int: 60, level: 1 } };
}

/**
 * 造实验组。每个 combo 自带 seeds —— 种子只由 (seed0, k) 决定，
 * 所以扩/缩 worker 数、换分组顺序都不会改变任何一局。
 */
export function makeCombos({ data, groups, n, mirrorN, pairs, seed0 }) {
  // 对角（i===j）是"同兵种镜像"，兵种/阵形对镜像局没有影响（相克值为 0），
  // 所以每个 i 必须换一段种子，否则 13 个对角格跑的是同一批局，只有 n 个独立样本。
  const seedsFor = (cnt, off = 0) => Array.from({ length: cnt }, (_, k) => seed0 + off + k);
  const diagSeeds = (i) => seedsFor(mirrorN, 1000 + i * 1000);
  const out = [];
  const push = (c) => out.push({ id: `${c.group}:${c.tag}`, index: out.length, ...c });

  if (groups.includes('troop')) {
    const T = data.troops.names.length;
    for (let i = 0; i < T; i++) {
      const jFrom = pairs === 'full' ? 0 : i;
      for (let j = jFrom; j < T; j++) {
        push({
          group: 'troop',
          tag: `${i}_${j}`,
          i,
          j,
          // 对角 = 纯镜像，只做公平性基线
          seeds: i === j ? diagSeeds(i) : seedsFor(n),
          a: mkSide(i, 0, 60, STR_BASE),
          b: mkSide(j, 0, 60, STR_BASE),
        });
      }
    }
  }

  if (groups.includes('formation')) {
    const F = data.formations.names.length;
    for (let i = 0; i < F; i++) {
      const jFrom = pairs === 'full' ? 0 : i;
      for (let j = jFrom; j < F; j++) {
        push({
          group: 'formation',
          tag: `${i}_${j}`,
          i,
          j,
          seeds: i === j ? diagSeeds(i) : seedsFor(n),
          a: mkSide(0, i, 60, STR_BASE),
          b: mkSide(0, j, 60, STR_BASE),
        });
      }
    }
  }

  if (groups.includes('morale')) {
    for (const m of [0, 25, 50, 75, 100]) {
      // A 士气 m vs B 基准 50：能看出"士气有没有参与战力"
      push({
        group: 'morale',
        tag: `asym_${m}`,
        m,
        mode: 'asym',
        seeds: seedsFor(n),
        a: mkSide(0, 0, m, STR_BASE),
        b: mkSide(0, 0, 50, STR_BASE),
      });
      // 双方同为 m：纯镜像，若士气参与战力，这里应恒 50% 但时长会变
      push({
        group: 'morale',
        tag: `mirror_${m}`,
        m,
        mode: 'mirror',
        seeds: seedsFor(n),
        a: mkSide(0, 0, m, STR_BASE),
        b: mkSide(0, 0, m, STR_BASE),
      });
    }
  }

  if (groups.includes('general')) {
    for (const s of [40, 70, 100]) {
      push({
        group: 'general',
        tag: `str_${s}`,
        str: s,
        seeds: seedsFor(n),
        a: mkSide(0, 0, 60, s),
        b: mkSide(0, 0, 60, STR_BASE),
      });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────── 单局

export function runBattle(data, combo, seed, { soldiers, maxSec }) {
  const w = createWorld({
    data,
    seed,
    a: { ...combo.a, soldiers },
    b: { ...combo.b, soldiers },
  });
  const limit = Math.round(maxSec * TICK_HZ);
  let t = 0;
  while (!w.over && t < limit) {
    step(w);
    t++;
  }
  return {
    winner: w.winner ?? 'draw',
    tick: w.tick,
    timeout: !w.over,
    reason: w.endReason ?? 'timeout',
    genAliveA: w.sides.A.general.alive,
    genAliveB: w.sides.B.general.alive,
    atkA: w.stats.attacksA,
    hitA: w.stats.hitsA,
    atkB: w.stats.attacksB,
    hitB: w.stats.hitsB,
  };
}

export function newAgg() {
  return {
    n: 0, aWins: 0, bWins: 0, draws: 0, timeouts: 0,
    secs: [], genDeadA: 0, genDeadB: 0,
    atkA: 0, hitA: 0, atkB: 0, hitB: 0,
    reasons: { troops: 0, general: 0, timeout: 0 },
    probe: [],
  };
}

export function addBattle(agg, r) {
  agg.n++;
  agg.secs.push(r.tick / TICK_HZ);
  if (r.winner === 'A') agg.aWins++;
  else if (r.winner === 'B') agg.bWins++;
  else agg.draws++;
  if (r.timeout) agg.timeouts++;
  agg.reasons[r.reason] = (agg.reasons[r.reason] ?? 0) + 1;
  if (!r.genAliveA) agg.genDeadA++;
  if (!r.genAliveB) agg.genDeadB++;
  agg.atkA += r.atkA;
  agg.hitA += r.hitA;
  agg.atkB += r.atkB;
  agg.hitB += r.hitB;
  if (agg.probe.length < 3) agg.probe.push([r.winner, r.tick]); // 指纹：前 3 局的胜负+tick
  return agg;
}

// ─────────────────────────────────────────────────────────── 统计小工具

const r4 = (x) => Math.round(x * 1e4) / 1e4;

export function stats(arr) {
  if (!arr.length) return { n: 0, min: NaN, p10: NaN, median: NaN, p90: NaN, max: NaN, mean: NaN };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return {
    n: s.length,
    min: r4(s[0]),
    p10: r4(q(0.1)),
    median: r4(q(0.5)),
    p90: r4(q(0.9)),
    max: r4(s[s.length - 1]),
    mean: r4(s.reduce((a, b) => a + b, 0) / s.length),
  };
}

function ranks(xs) {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const rk = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = rk;
    i = j + 1;
  }
  return out;
}

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** Spearman 秩相关（并列取平均秩） */
export function spearman(a, b) {
  return r4(pearson(ranks(a), ranks(b)));
}

// ─────────────────────────────────────────────────────────── worker 池

function workerMain() {
  const { combos, soldiers, maxSec } = workerData;
  const data = loadData({ dir: DATA_DIR });
  const results = [];
  let sincePing = 0;
  for (const c of combos) {
    const agg = newAgg();
    for (const seed of c.seeds) {
      addBattle(agg, runBattle(data, c, seed, { soldiers, maxSec }));
      if (++sincePing >= 20) {
        parentPort.postMessage({ type: 'progress', done: sincePing });
        sincePing = 0;
      }
    }
    results.push({ index: c.index, agg });
  }
  if (sincePing) parentPort.postMessage({ type: 'progress', done: sincePing });
  parentPort.postMessage({ type: 'done', results });
}

/**
 * 并行跑一批 combo，返回 Map<combo.index, agg>。
 * 负载均衡：按局数降序贪心塞给当前最空的 worker。
 */
export async function runPool(combos, { soldiers, maxSec, workers, label = 'sim', onProgress }) {
  const buckets = [];
  const w = Math.max(1, Math.min(workers, combos.length));
  for (let i = 0; i < w; i++) buckets.push({ load: 0, list: [] });
  [...combos]
    .sort((x, y) => y.seeds.length - x.seeds.length)
    .forEach((c) => {
      let best = buckets[0];
      for (const b of buckets) if (b.load < best.load) best = b;
      best.list.push({ index: c.index, a: c.a, b: c.b, seeds: c.seeds });
      best.load += c.seeds.length;
    });

  const total = combos.reduce((s, c) => s + c.seeds.length, 0);
  const results = new Map();
  let done = 0;
  const t0 = Date.now();
  const active = buckets.filter((b) => b.list.length);

  await Promise.all(
    active.map(
      (b) =>
        new Promise((res, rej) => {
          const wk = new Worker(SELF, {
            workerData: { role: 'sim', combos: b.list, soldiers, maxSec },
          });
          wk.on('message', (m) => {
            if (m.type === 'progress') {
              done += m.done;
              onProgress?.(done, total, Date.now() - t0);
            } else if (m.type === 'done') {
              for (const r of m.results) results.set(r.index, r.agg);
            }
          });
          wk.on('error', rej);
          wk.on('exit', (code) => (code === 0 ? res() : rej(new Error(`worker 退出码 ${code}`))));
        }),
    ),
  );
  return { results, elapsedMs: Date.now() - t0, total };
}

// ─────────────────────────────────────────────────────────── 聚合 → 报告

function finalize(agg) {
  const rate = agg.n ? (agg.aWins + 0.5 * agg.draws) / agg.n : 0;
  const totalSec = agg.secs.reduce((a, b) => a + b, 0);
  return {
    n: agg.n,
    aWins: agg.aWins,
    bWins: agg.bWins,
    draws: agg.draws,
    timeouts: agg.timeouts,
    aWinRate: r4(rate),
    sec: stats(agg.secs),
    endReasons: agg.reasons,
    genDeadA: agg.genDeadA,
    genDeadB: agg.genDeadB,
    hitRateA: agg.atkA ? r4(agg.hitA / agg.atkA) : null,
    hitRateB: agg.atkB ? r4(agg.hitB / agg.atkB) : null,
    attacksPerSec: totalSec > 0 ? r4((agg.atkA + agg.atkB) / totalSec) : null,
    probe: agg.probe,
  };
}

/**
 * 把一批 combo 的 aWinRate 排成方阵。
 * pairs=upper 时只跑了上三角：rate[j][i] 用 1-rate[i][j] 镜像补齐（矩阵严格反对称）。
 */
function buildMatrix(group, combos, fin, size, matrix) {
  const rate = Array.from({ length: size }, () => new Array(size).fill(null));
  const cells = [];
  for (const c of combos.filter((x) => x.group === group)) {
    const f = fin.get(c.index);
    rate[c.i][c.j] = f.aWinRate;
    cells.push({ i: c.i, j: c.j, value: matrix[c.i][c.j], n: f.n, rate: f.aWinRate });
  }
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (rate[i][j] === null && rate[j][i] !== null) rate[i][j] = r4(1 - rate[j][i]);
    }
  }
  return { rate, cells };
}

function matrixAnalysis({ group, names, matrix, rate, cells, diagonalRate, threshold }) {
  const size = names.length;
  const rowRate = [];
  for (let i = 0; i < size; i++) {
    let s = 0, k = 0;
    for (let j = 0; j < size; j++) {
      if (i === j) continue;
      if (rate[i][j] == null) continue;
      s += rate[i][j];
      k++;
    }
    rowRate.push(k ? r4(s / k) : null);
  }

  // 只取上三角做"表值 vs 实测"相关（下三角是镜像推的，不是独立样本）
  const pairs = cells.filter((c) => c.i < c.j);
  const vals = pairs.map((c) => c.value);
  const rates = pairs.map((c) => c.rate);
  const rhoPair = pairs.length >= 3 ? spearman(vals, rates) : null;

  // 表值的"强弱序"（行和）vs 实测行胜率。零和表（阵形）行和恒为 0，无意义 → 置 null。
  const valScore = [];
  for (let i = 0; i < size; i++) {
    let s = 0;
    for (let j = 0; j < size; j++) if (i !== j) s += matrix[i][j];
    valScore.push(s);
  }
  const zeroSum = valScore.every((x) => Math.abs(x) < 1e-9);
  const rhoRow = zeroSum ? null : spearman(valScore, rowRate.map((x) => x ?? 0));

  const signOk = pairs.filter((c) => Math.abs(c.rate - 0.5) < 1e-9 || Math.sign(c.value) === Math.sign(c.rate - 0.5));
  const order = names.map((nm, i) => ({ index: i, name: nm, rowRate: rowRate[i], matrixScore: valScore[i] }))
    .sort((a, b) => b.rowRate - a.rowRate);

  const strong = [];
  for (const c of pairs) {
    const other = c.rate >= 0.5 ? c.i : c.j;
    const beaten = c.rate >= 0.5 ? c.j : c.i;
    if (Math.max(c.rate, 1 - c.rate) >= threshold) strong.push({ win: names[other], lose: names[beaten], rate: Math.max(c.rate, 1 - c.rate), n: c.n });
  }
  strong.sort((a, b) => b.rate - a.rate);

  const sweeps = order.map((o) => {
    let k = 0;
    for (let j = 0; j < size; j++) {
      if (j === o.index) continue;
      if ((rate[o.index][j] ?? 0) >= threshold) k++;
    }
    return { name: o.name, sweptOpponents: k, of: size - 1 };
  });

  return {
    group,
    names,
    rate: rate.map((row) => row.map((x) => (x == null ? null : r4(x)))),
    matrix,
    zeroSum,
    rowRate,
    order,
    strongest: order[0],
    weakest: order[order.length - 1],
    rhoPairValueVsRate: rhoPair,
    rhoRowMatrixVsRate: rhoRow,
    signAgreement: r4(signOk.length / pairs.length),
    pairs: pairs.map((c) => ({ i: c.i, j: c.j, a: names[c.i], b: names[c.j], value: c.value, n: c.n, rate: c.rate })),
    dominant: strong,
    sweeps,
    diagonalRate,
    threshold,
    universalSide: order.filter((o) => (rate[o.index] ?? []).filter((x) => x != null && x >= threshold).length > 0)
      .map((o) => o.name),
    hasUniversal: order.some((o) => o.rowRate != null && o.rowRate >= threshold),
  };
}

function aggregateGroup(group, combos, results, data, opts) {
  const mine = combos.filter((c) => c.group === group);
  const fin = new Map();
  for (const c of mine) {
    const agg = results.get(c.index);
    if (agg) fin.set(c.index, finalize(agg));
  }
  const allSecs = [];
  let atk = 0, hit = 0;
  for (const c of mine) {
    const agg = results.get(c.index);
    if (!agg) continue;
    allSecs.push(...agg.secs);
    atk += agg.atkA + agg.atkB;
    hit += agg.hitA + agg.hitB;
  }
  const g = {
    group,
    combos: mine.length,
    battles: mine.reduce((s, c) => s + c.seeds.length, 0),
    duration: stats(allSecs),
    hitRate: atk ? r4(hit / atk) : null,
    drawCount: [...fin.values()].reduce((s, f) => s + f.draws, 0),
    timeoutCount: [...fin.values()].reduce((s, f) => s + f.timeouts, 0),
    endReasonTotals: { troops: 0, general: 0, timeout: 0 },
    mirror: null,
  };
  for (const f of fin.values()) for (const k of Object.keys(g.endReasonTotals)) g.endReasonTotals[k] += f.endReasons[k] ?? 0;

  if (group === 'troop' || group === 'formation') {
    const table = group === 'troop' ? data.troops : data.formations;
    const names = table.names;
    const matrix = table.matrix.map((r) => r.vs);
    const size = names.length;
    const { rate, cells } = buildMatrix(group, combos, fin, size, matrix);
    const diag = [];
    for (const c of combos.filter((x) => x.group === group && x.i === x.j)) {
      const f = fin.get(c.index);
      diag.push(f.aWinRate);
    }
    const diagonalRate = diag.length ? r4(diag.reduce((a, b) => a + b, 0) / diag.length) : null;
    const threshold = group === 'troop' ? 0.85 : 0.80;
    Object.assign(g, matrixAnalysis({ group, names, matrix, rate, cells, diagonalRate, threshold }));
    g.cells = [...fin.entries()]
      .filter(([idx]) => combos[idx].group === group)
      .map(([idx, f]) => ({
        i: combos[idx].i,
        j: combos[idx].j,
        n: f.n,
        aWins: f.aWins,
        bWins: f.bWins,
        aWinRate: f.aWinRate,
        medianSec: f.sec.median,
        endReasons: f.endReasons,
        genDeadA: f.genDeadA,
        genDeadB: f.genDeadB,
        hitRateA: f.hitRateA,
        hitRateB: f.hitRateB,
        probe: f.probe,
      }))
      .sort((a, b) => a.i - b.i || a.j - b.j);
    if (group === 'troop') {
      g.mirror = { n: fin.get(combos.find((c) => c.group === 'troop' && c.i === 0 && c.j === 0).index)?.n ?? 0, rate: diagonalRate };
    }
  } else if (group === 'morale') {
    g.series = [];
    for (const m of [0, 25, 50, 75, 100]) {
      const asym = fin.get(combos.find((c) => c.group === 'morale' && c.m === m && c.mode === 'asym').index);
      const mir = fin.get(combos.find((c) => c.group === 'morale' && c.m === m && c.mode === 'mirror').index);
      g.series.push({
        morale: m,
        asymRate: asym.aWinRate,
        asymSec: asym.sec.median,
        asymN: asym.n,
        mirrorRate: mir.aWinRate,
        mirrorSec: mir.sec.median,
        mirrorN: mir.n,
      });
    }
    const rates = g.series.map((s) => s.asymRate);
    g.spread = r4(Math.max(...rates) - Math.min(...rates));
    const secs = g.series.map((s) => s.mirrorSec);
    g.secSpread = r4(Math.max(...secs) - Math.min(...secs));
  } else if (group === 'general') {
    g.series = [];
    for (const s of [40, 70, 100]) {
      const f = fin.get(combos.find((c) => c.group === 'general' && c.str === s).index);
      g.series.push({
        str: s,
        n: f.n,
        aWinRate: f.aWinRate,
        medianSec: f.sec.median,
        hp: 100 + s,
        genDeadA: f.genDeadA,
        genDeadB: f.genDeadB,
        generalEnds: f.endReasons.general ?? 0,
      });
    }
    const rates = g.series.map((s) => s.aWinRate);
    g.spread = r4(Math.max(...rates) - Math.min(...rates));
  }
  return g;
}

// ─────────────────────────────────────────────────────────── 主流程

function parseArgs(argv) {
  const o = {
    n: 100, soldiers: 100, seed0: 1, out: 'work/sim_report.json',
    only: 'all', pairs: 'upper', workers: Math.min(12, os.availableParallelism()),
    mirrorN: 40, maxSec: 120, quiet: false, selfcheck: false, table: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} 缺参数`);
      return v;
    };
    switch (a) {
      case '--n': o.n = Math.max(1, Number(val())); break;
      case '--soldiers': o.soldiers = Math.max(1, Number(val())); break;
      case '--seed0': o.seed0 = Number(val()); break;
      case '--out': o.out = val(); break;
      case '--only': o.only = val(); break;
      case '--pairs': o.pairs = val(); break;
      case '--workers': o.workers = Math.max(1, Number(val())); break;
      case '--mirror-n': o.mirrorN = Math.max(1, Number(val())); break;
      case '--max-sec': o.maxSec = Math.max(5, Number(val())); break;
      case '--quiet': o.quiet = true; break;
      case '--selfcheck': o.selfcheck = true; break;
      case '--no-table': o.table = false; break;
      case '--help': case '-h': o.help = true; break;
      default: throw new Error(`未知参数 ${a}`);
    }
  }
  if (o.pairs !== 'upper' && o.pairs !== 'full') throw new Error('--pairs 只能是 upper|full');
  if (o.only !== 'all') {
    const gs = o.only.split(',').map((s) => s.trim()).filter(Boolean);
    for (const g of gs) if (!GROUPS.includes(g)) throw new Error(`--only 只支持 ${GROUPS.join('|')}|all，收到 ${g}`);
    o.groups = gs;
  } else o.groups = [...GROUPS];
  return o;
}

const USAGE = `三国群英传2 竖版重制 · 数值模拟器
  node tools/sim_balance.mjs [--n 100] [--soldiers 100] [--seed0 1]
       [--only troop|formation|morale|general|all] [--pairs upper|full]
       [--mirror-n 40] [--max-sec 120] [--workers 12]
       [--out work/sim_report.json] [--quiet] [--no-table] [--selfcheck]`;

async function selfcheck() {
  // 同一批 (combo, seed) 串行跑两遍，逐局比对胜负与 tick；再换 seed0 断言结果确实变了
  const data = loadData({ dir: DATA_DIR });
  const combos = makeCombos({ data, groups: ['troop'], n: 3, mirrorN: 3, pairs: 'upper', seed0: 7 })
    .filter((c) => c.i < 3 || (c.i === c.j && c.i < 3));
  const opts = { soldiers: 100, maxSec: 120 };
  const runs = [];
  for (let pass = 0; pass < 2; pass++) {
    const rec = [];
    for (const c of combos) for (const seed of c.seeds) {
      const r = runBattle(data, c, seed, opts);
      rec.push(`${c.id}@${seed}=${r.winner}/${r.tick}/${r.reason}`);
    }
    runs.push(rec.join('|'));
  }
  const same = runs[0] === runs[1];
  const other = [];
  for (const c of combos) for (const seed of c.seeds) {
    const r = runBattle(data, c, seed + 1000, opts);
    other.push(`${c.id}@${seed + 1000}=${r.winner}/${r.tick}/${r.reason}`);
  }
  const seedSensitive = other.join('|') !== runs[0];
  console.log(same ? '✓ 同参数两遍逐局一致（胜负/tick/结束原因）' : '✗ 同参数两遍结果不一致');
  console.log(seedSensitive ? '✓ 换 seed 后结果确实变化（不是常量输出）' : '✗ 换 seed 后结果完全相同（可疑）');
  console.log(`  样本：${combos.length} 组 × ${combos[0].seeds.length} 局 = ${runs[0].split('|').length} 局`);
  if (!same || !seedSensitive) {
    console.error('SELFCHECK FAILED');
    process.exit(1);
  }
  console.log('SELFCHECK PASSED');
}

function digestOf(payload) {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function pct(x) {
  return x == null ? ' — ' : `${(x * 100).toFixed(1)}%`;
}

function printGroup(g, report) {
  const L = [];
  const ns = g.cells ? [...new Set(g.cells.map((c) => c.n))].sort((a, b) => a - b) : [];
  var hint = g.group === 'formation' ? '（零和表，行和恒为 0，故不报行和相关）' : '';
  L.push('');
  L.push(`━━ ${g.group} ━━  ${g.combos} 组 / ${g.battles} 局  n=${ns.join('/') || '?'}  时长 min/median/max = ${g.duration.min}/${g.duration.median}/${g.duration.max} s  实测命中率 ${pct(g.hitRate)}`);
  if (g.group === 'troop' || g.group === 'formation') {
    L.push(`  强弱序（行胜率，跨全部对手）：`);
    for (const o of g.order) L.push(`   ${o.name.padEnd(4, '　')} ${pct(o.rowRate).padStart(7)}${g.zeroSum ? '' : `  表值和 ${String(o.matrixScore).padStart(5)}`}`);
    L.push(`  秩相关：逐对 ${g.rhoPairValueVsRate}  行和 ${g.rhoRowMatrixVsRate ?? '—'}  符号一致率 ${pct(g.signAgreement)}${hint}`);
    L.push(`  对角镜像：${pct(g.diagonalRate)}`);
    L.push(`  ≥${g.threshold * 100}% 的克制对：${g.dominant.length} 条`);
    for (const d of g.dominant.slice(0, 8)) L.push(`   ${d.win} → ${d.lose}  ${pct(d.rate)} (n=${d.n})`);
  } else if (g.group === 'morale' || g.group === 'general') {
    for (const s of g.series) {
      const k = g.group === 'morale' ? s.morale : s.str;
      const r = g.group === 'morale' ? s.asymRate : s.aWinRate;
      const t = g.group === 'morale' ? s.asymSec : s.medianSec;
      L.push(`   ${String(k).padStart(3)} → A 胜 ${pct(r).padStart(7)}  中位时长 ${String(t).padStart(5)} s`);
    }
    L.push(`  极差：${g.group === 'morale' ? `胜率 ${pct(g.spread)} / 镜像时长 ${g.secSpread} s` : `胜率 ${pct(g.spread)}`}`);
  }
  L.push(`  结束原因：${JSON.stringify(g.endReasonTotals)}  超时 ${g.timeoutCount}  平局 ${g.drawCount}`);
  console.log(L.join('\n'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(USAGE);
  if (opts.selfcheck) return selfcheck();

  const data = loadData({ dir: DATA_DIR });
  const combos = makeCombos({
    data, groups: opts.groups, n: opts.n, mirrorN: opts.mirrorN, pairs: opts.pairs, seed0: opts.seed0,
  });
  const battles = combos.reduce((s, c) => s + c.seeds.length, 0);
  console.error(`[sim] 组=${opts.groups.join('+')} combo=${combos.length} 局=${battles} n=${opts.n} soldiers=${opts.soldiers} seed0=${opts.seed0} workers=${opts.workers}`);

  let last = 0;
  const { results, elapsedMs, total } = await runPool(combos, {
    soldiers: opts.soldiers,
    maxSec: opts.maxSec,
    workers: opts.workers,
    onProgress: (done, tot, ms) => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      const rate = done / (ms / 1000);
      process.stderr.write(`\r[sim] ${done}/${tot} ${((done / tot) * 100).toFixed(0)}%  ${(ms / 1000).toFixed(0)}s  ${rate.toFixed(1)} 局/s   `);
    },
  });
  process.stderr.write(`\r[sim] ${total}/${total} 100%  ${(elapsedMs / 1000).toFixed(1)}s  ${(total / (elapsedMs / 1000)).toFixed(1)} 局/s\n`);

  const fin = new Map();
  for (const c of combos) fin.set(c.index, finalize(results.get(c.index)));
  const groups = {};
  for (const g of opts.groups) groups[g] = aggregateGroup(g, combos, results, data, opts);

  const payload = {
    meta: {
      tool: 'tools/sim_balance.mjs',
      generatedAt: new Date().toISOString(),
      n: opts.n,
      soldiers: opts.soldiers,
      seed0: opts.seed0,
      pairs: opts.pairs,
      mirrorN: opts.mirrorN,
      maxSec: opts.maxSec,
      workers: opts.workers,
      combos: combos.length,
      battles,
      elapsedMs,
      battlesPerSec: r4(battles / (elapsedMs / 1000)),
    },
    tables: {
      troops: { names: data.troops.names, matrix: data.troops.matrix.map((r) => r.vs) },
      formations: { names: data.formations.names, matrix: data.formations.matrix.map((r) => r.vs) },
    },
    groups,
  };
  // digest 只覆盖确定性内容（不含时间戳/耗时/worker 数）
  payload.meta.digest = digestOf({ meta: { n: opts.n, soldiers: opts.soldiers, seed0: opts.seed0, pairs: opts.pairs, mirrorN: opts.mirrorN, maxSec: opts.maxSec }, groups });

  const outPath = resolve(ROOT, opts.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 1), 'utf8');

  if (!opts.quiet) {
    for (const g of opts.groups) printGroup(groups[g], payload);
    console.log('');
    console.log(`[sim] ${combos.length} 组 / ${battles} 局 / ${(elapsedMs / 1000).toFixed(1)}s / ${payload.meta.battlesPerSec} 局/s`);
    console.log(`[sim] digest ${payload.meta.digest}  → ${outPath}`);
  }
}

if (!isMainThread && workerData?.role === 'sim') {
  workerMain();
} else if (isMainThread && process.argv[1] && resolve(process.argv[1]) === SELF) {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
