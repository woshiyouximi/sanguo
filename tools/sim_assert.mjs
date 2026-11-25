#!/usr/bin/env node
/**
 * 三国群英传2 竖版重制 · 数值回归守卫
 *
 * 固定 12 组样本（3 组应胜 / 3 组应负 / 6 组镜像），每组用固定种子区间跑固定局数，
 * 断言胜率（镜像组再断言中位时长）落在预期区间。任何一组越界 → 退出码 1。
 *
 * 用法（一行）：
 *   node tools/sim_assert.mjs
 * 可调：--n 100 --seed0 9001 --workers 12 --quiet
 *
 * 阈值口径：兵种相克表 ≥ |56| 的对实测已饱和到 ~100%，故应胜/应负给宽区间（≥0.90 / ≤0.10），
 * 只在"0.5 附近"的镜像组收紧到 0.33–0.67（n=100 时 ≈ ±3σ）。
 * 这些阈值是"回归线"不是"平衡目标"：手感/节奏改动若让胜负整体漂移，这里会先红。
 */
import { loadData } from '../game/src/data.ts';
import { runBattle, runPool, newAgg, addBattle, stats } from './sim_balance.mjs';

const DATA_DIR = 'F:/sanguo/game/data';

// ── 12 组固定样本：expect = [下界, 上界]；mirror 组同时断言中位时长区间
const SPEC = [
  // ——— 3 组已知应胜（表值大正）———
  { kind: 'win', label: '大刀 vs 黄巾', a: ['大刀', '方形'], b: ['黄巾', '方形'], expect: [0.90, 1.0] },
  { kind: 'win', label: '长枪 vs 藤甲', a: ['长枪', '圆形'], b: ['藤甲', '圆形'], expect: [0.90, 1.0] },
  { kind: 'win', label: '弩兵 vs 黄巾', a: ['弩兵', '锥形'], b: ['黄巾', '锥形'], expect: [0.85, 1.0] },
  // ——— 3 组已知应负（上三组的反向）———
  { kind: 'loss', label: '黄巾 vs 大刀', a: ['黄巾', '方形'], b: ['大刀', '方形'], expect: [0.0, 0.10] },
  { kind: 'loss', label: '藤甲 vs 长枪', a: ['藤甲', '圆形'], b: ['长枪', '圆形'], expect: [0.0, 0.10] },
  { kind: 'loss', label: '女兵 vs 黄巾', a: ['女兵', '雁形'], b: ['黄巾', '雁形'], expect: [0.0, 0.15] },
  // ——— 6 组镜像（同兵种同阵形，只换种子）———
  { kind: 'mirror', label: '镜像 朴刀/方形', a: ['朴刀', '方形'], b: ['朴刀', '方形'], expect: [0.33, 0.67] },
  { kind: 'mirror', label: '镜像 长枪/圆形', a: ['长枪', '圆形'], b: ['长枪', '圆形'], expect: [0.33, 0.67] },
  { kind: 'mirror', label: '镜像 大刀/雁形', a: ['大刀', '雁形'], b: ['大刀', '雁形'], expect: [0.33, 0.67] },
  { kind: 'mirror', label: '镜像 飞刀/冲锋', a: ['飞刀', '冲锋'], b: ['飞刀', '冲锋'], expect: [0.33, 0.67] },
  { kind: 'mirror', label: '镜像 弩兵/钩形', a: ['弩兵', '钩形'], b: ['弩兵', '钩形'], expect: [0.33, 0.67] },
  { kind: 'mirror', label: '镜像 藤甲/箭矢', a: ['藤甲', '箭矢'], b: ['藤甲', '箭矢'], expect: [0.33, 0.67] },
];

const MIRROR_SEC = [12, 45]; // 镜像局中位时长区间（s）：低于 12 s 说明普遍速崩，高于 45 s 说明打不动

function parseArgs(argv) {
  const o = { n: 100, seed0: 9001, workers: 12, quiet: false, soldiers: 100, maxSec: 180 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} 缺参数`);
      return v;
    };
    switch (a) {
      case '--n': o.n = Math.max(1, Number(val())); break;
      case '--seed0': o.seed0 = Number(val()); break;
      case '--workers': o.workers = Math.max(1, Number(val())); break;
      case '--soldiers': o.soldiers = Math.max(1, Number(val())); break;
      case '--max-sec': o.maxSec = Math.max(5, Number(val())); break;
      case '--quiet': o.quiet = true; break;
      case '--help': case '-h': o.help = true; break;
      default: throw new Error(`未知参数 ${a}`);
    }
  }
  return o;
}

function idx(table, name, what) {
  const i = table.names.indexOf(name);
  if (i < 0) throw new Error(`${what} 里没有 "${name}"，可用：${table.names.join('/')}`);
  return i;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    return console.log('node tools/sim_assert.mjs [--n 100] [--seed0 9001] [--workers 12] [--quiet]');
  }
  const data = loadData({ dir: DATA_DIR });
  const mk = ([troop, formation]) => ({
    troop: idx(data.troops, troop, '兵种表'),
    formation: idx(data.formations, formation, '阵形表'),
    morale: 60,
    general: { str: 70, int: 60, level: 1 },
  });
  const combos = SPEC.map((s, k) => ({
    id: `G${k + 1}`,
    index: k,
    group: 'assert',
    tag: s.label,
    spec: s,
    a: mk(s.a),
    b: mk(s.b),
    seeds: Array.from({ length: o.n }, (_, i) => o.seed0 + i),
  }));

  const t0 = Date.now();
  const { results, elapsedMs } = await runPool(combos, {
    soldiers: o.soldiers,
    maxSec: o.maxSec,
    workers: o.workers,
  });

  const fails = [];
  const lines = [];
  let total = 0;
  for (const c of combos) {
    const agg = results.get(c.index);
    const s = c.spec;
    const rate = agg.n ? (agg.aWins + 0.5 * agg.draws) / agg.n : 0;
    const sec = stats(agg.secs).median;
    const [lo, hi] = s.expect;
    const okRate = rate >= lo - 1e-9 && rate <= hi + 1e-9;
    const okSec = s.kind !== 'mirror' || (sec >= MIRROR_SEC[0] && sec <= MIRROR_SEC[1]);
    const ok = okRate && okSec;
    total += agg.n;
    const val = s.a[0] !== s.b[0] ? `表值 ${data.troops.matrix[idx(data.troops, s.a[0], '')].vs[idx(data.troops, s.b[0], '')]}` : '镜像';
    lines.push(
      `[${String(c.index + 1).padStart(2)}] ${ok ? '✓' : '✗'} ${s.label.padEnd(12, '　')} ${val.padStart(8)}  n=${agg.n}` +
        `  A胜 ${(rate * 100).toFixed(1).padStart(5)}%  区间 ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%` +
        `  中位 ${sec.toFixed(1).padStart(5)}s${s.kind === 'mirror' ? `（区间 ${MIRROR_SEC[0]}–${MIRROR_SEC[1]}s）` : ''}`,
    );
    if (!ok) fails.push(`${s.label}：胜率 ${(rate * 100).toFixed(1)}%（期望 ${lo * 100}–${hi * 100}%）` + (okSec ? '' : ` 时长 ${sec}s（期望 ${MIRROR_SEC[0]}–${MIRROR_SEC[1]}s）`));
  }

  // 附加健全性：全部对局必须在 maxSec 内自然结束（不靠超时截断）
  const timeouts = [...results.values()].reduce((s, a) => s + a.timeouts, 0);
  const draws = [...results.values()].reduce((s, a) => s + a.draws, 0);
  if (timeouts > 0) fails.push(`有 ${timeouts} 局在 ${o.maxSec}s 内没打完（超时截断）`);

  if (!o.quiet) {
    console.log('三国群英传2 竖版重制 · 数值回归守卫（12 组固定样本）');
    console.log(`兵种=${data.troops.names.length} 阵形=${data.formations.names.length} n=${o.n} soldiers=${o.soldiers} seed0=${o.seed0} workers=${o.workers}`);
    console.log('');
    for (const l of lines) console.log(l);
    console.log('');
    console.log(`共 12 组 / ${total} 局 / ${(elapsedMs / 1000).toFixed(1)}s / ${(total / (elapsedMs / 1000)).toFixed(1)} 局/s（单局 ${(elapsedMs / total).toFixed(0)} ms 墙钟，含并行）  平局 ${draws}  超时 ${timeouts}`);
    console.log(`一行命令：node tools/sim_assert.mjs`);
  }

  if (fails.length) {
    console.error(`\n✗ 数值回归：${fails.length} 项越界`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\n✓ 全部 12 组通过，退出码 0（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
