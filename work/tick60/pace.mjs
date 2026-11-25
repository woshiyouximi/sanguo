/**
 * R192 节奏实测：真数据 `createWorld` + 逐 tick，量四件事。
 *
 *   cd F:\sanguo
 *   node work/tick60/pace.mjs
 *
 * 四个数（改前 = 30 Hz 口径，改后 = 60 Hz 实测）：
 *   1. 一格用时        —— 直线上一个兵每「跨一格」的 tick 数 ÷ TICK_HZ
 *   2. 31 格接近用时    —— 开战到双方首次进入 ENGAGE_RANGE 的 tick 数 ÷ TICK_HZ
 *   3. 整场时长        —— 到 world.over 的 tick 数 ÷ TICK_HZ（并给出硬时限）
 *   4. 倒计时 99→0     —— battleView.clockUnitsLeft 归零的 tick 数 ÷ TICK_HZ
 *
 * 改前一列不是猜的：本轮的 tick 常数（40/40/46/120）一位没动，**tick 时间轴与 30 Hz 时代完全相同**，
 * 所以「改前」= 同一条 tick 曲线按 30 Hz 折算（表里注明了）。倒计时/硬时限在两边都是 198 s，
 * 因为 30 Hz 时代写的是 5940 tick，60 Hz 写的是 11880 tick —— 同一个 198 秒。
 */
import fs from 'node:fs';
import { loadData } from '../../game/src/data.ts';
import {
  ACTION_INTERVAL_TICKS,
  BATTLE_SECONDS,
  BATTLE_TICK_LIMIT,
  ENGAGE_RANGE,
  TICK_HZ,
  actionIntervalOf,
  createWorld,
  step,
} from '../../game/src/core/battle.ts';
import { clockUnitsLeft } from '../../game/src/view/battleView.ts';
import { engage } from '../../game/tests/_engage.ts';

const DATA_DIR = 'F:/sanguo/game/data/';
const OUT_MD = 'F:/sanguo/work/tick60/pace_report.md';
const OUT_JSON = 'F:/sanguo/work/tick60/pace.json';
const BEFORE_HZ = 30;
const SEED = 20251125;

const data = loadData({ dir: DATA_DIR });

/** 同一 seed 跑一场：量行动闸门、接触时刻、终局。 */
function runFight(opts = {}) {
  const w = createWorld({ data, seed: SEED, ...(opts.ai ? { aiSides: { A: true, B: true } } : {}) });
  if (!opts.ai) engage(w);

  // 取 A 侧最前排的步兵当「走路采样器」（最前排先接触，途中不会撤退）
  const pick = () =>
    w.units
      .filter((u) => u.side === 'A' && !u.isGeneral && u.alive)
      .sort((p, q) => p.x - q.x || p.y - q.y)[0];
  const sample = pick();
  const sid = sample ? `${sample.x},${sample.y}` : 'none';
  let watch = sample;

  const cellTicks = [];
  const gateTicks = [];
  let lastCell = watch ? Math.round(watch.x) : 0;
  let lastChange = 0;
  let lastGate = 0;
  let prevCd = watch ? watch.cd : 0;
  let contactTick = -1;
  let minGap = Infinity;
  let startGap = Infinity;
  {
    for (const a of w.units) {
      if (a.side !== 'A' || !a.alive) continue;
      for (const b of w.units) {
        if (b.side !== 'B' || !b.alive) continue;
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (d < startGap) startGap = d;
      }
    }
    minGap = startGap;
  }

  const maxTicks = BATTLE_TICK_LIMIT + 10;
  while (!w.over && w.tick < maxTicks) {
    step(w);
    if (watch && !watch.alive) {
      watch = pick();
      prevCd = watch ? watch.cd : 0;
      lastGate = w.tick;
      lastCell = watch ? Math.round(watch.x) : 0;
      lastChange = w.tick;
    }
    if (watch && contactTick < 0) {
      const cell = Math.round(watch.x);
      if (cell !== lastCell) {
        cellTicks.push(w.tick - lastChange);
        lastChange = w.tick;
        lastCell = cell;
      }
      // 行动闸门：cd 刚好等于这一侧的 interval 即「本帧刚装填」⇒ 两次装填的 tick 差 = 一格用时
      const iv = actionIntervalOf(watch);
      if (watch.cd === iv && prevCd !== iv) {
        gateTicks.push(w.tick - lastGate);
        lastGate = w.tick;
      }
      prevCd = watch.cd;
    }
    if (contactTick < 0) {
      let gap = Infinity;
      for (const a of w.units) {
        if (a.side !== 'A' || !a.alive) continue;
        for (const b of w.units) {
          if (b.side !== 'B' || !b.alive) continue;
          const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          if (d < gap) gap = d;
        }
      }
      if (gap < minGap) minGap = gap;
      if (gap <= ENGAGE_RANGE) contactTick = w.tick;
    }
  }

  const sorted = [...cellTicks].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
  // 众数：闸门常数是整数 tick，众数比中位数更能反映「一格几步」
  const freq = new Map();
  for (const d of sorted) freq.set(d, (freq.get(d) || 0) + 1);
  let mode = NaN;
  let modeN = -1;
  for (const [d, n] of freq) {
    if (n > modeN || (n === modeN && d < mode)) {
      mode = d;
      modeN = n;
    }
  }
  const gateSorted = [...gateTicks].sort((a, b) => a - b);
  const gateFreq = new Map();
  for (const d of gateSorted) gateFreq.set(d, (gateFreq.get(d) || 0) + 1);
  let gateMode = NaN;
  let gateModeN = -1;
  for (const [d, n] of gateFreq) {
    if (n > gateModeN || (n === gateModeN && d < gateMode)) {
      gateMode = d;
      gateModeN = n;
    }
  }
  return {
    seed: SEED,
    ai: !!opts.ai,
    sample: sid,
    cellTicks: sorted,
    cellTicksMedian: median,
    cellTicksMode: mode,
    cellTicksModeN: modeN,
    cellTicksMean: cellTicks.length ? cellTicks.reduce((a, b) => a + b, 0) / cellTicks.length : NaN,
    gateTicks: gateSorted,
    gateMode,
    gateModeN,
    gateMedian: gateSorted.length ? gateSorted[Math.floor(gateSorted.length / 2)] : NaN,
    startGap,
    contactTick,
    minGap,
    endTick: w.tick,
    over: w.over,
    endReason: w.endReason ?? '',
  };
}

const fight = runFight();
const aiFight = runFight({ ai: true });

// 倒计时：逐 tick 走 battleView 的真函数，找归零那一 tick
let zeroTick = -1;
for (let t = 0; t <= BATTLE_TICK_LIMIT + 200; t++) {
  if (clockUnitsLeft(t) === 0) {
    zeroTick = t;
    break;
  }
}
const cd10 = clockUnitsLeft(Math.round(10 * TICK_HZ));

const cellAfter = fight.gateMode / TICK_HZ;
const cellBefore = fight.gateMode / BEFORE_HZ;
const approachAfter = fight.contactTick / TICK_HZ;
const approachBefore = fight.contactTick / BEFORE_HZ;
const fullAfter = fight.endTick / TICK_HZ;
const fullBefore = fight.endTick / BEFORE_HZ;
const aiAfter = aiFight.endTick / TICK_HZ;
const aiBefore = Math.min(aiFight.endTick, 5940) / BEFORE_HZ; // 30 Hz 版上限就是 5940 tick
const cdAfter = zeroTick / TICK_HZ;
const cdBefore = 5940 / BEFORE_HZ; // 30 Hz 版：5940 tick 上限、1 单位 60 tick ⇒ 99×2 s

const f = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
const rows = [
  [
    '一格用时',
    `${f(cellBefore)} s（${fight.gateMode} tick ÷ 30）`,
    `${f(cellAfter)} s（实测两次装填间隔 ${fight.gateMode} tick ÷ 60；闸门常数 ${ACTION_INTERVAL_TICKS} tick ⇒ 理论 ${f(ACTION_INTERVAL_TICKS / TICK_HZ)} s，多出的 1 tick 是采样相位；样本 ${fight.gateTicks.length}，中位数 ${fight.gateMedian}）`,
    '目标 ≈0.667 s；原作录像 0.507（主将）/0.602（弓兵）',
  ],
  [
    '31 格接近用时',
    `${f(31 * cellBefore)} s（理论 31×一格）`,
    `${f(31 * cellAfter)} s（理论 31×一格）；实测接触 ${f(approachAfter)} s（${fight.contactTick} tick，起手最近间距 ${fight.startGap} 格）`,
    `首次进入 ${ENGAGE_RANGE} 格即接触；两军阵面不是直线对齐，实际最先碰上的那一对更近`,
  ],
  [
    '整场时长（下合突击）',
    `${f(fullBefore)} s（${fight.endTick} tick ÷ 30）`,
    `${f(fullAfter)} s（${fight.endTick} tick ÷ 60）`,
    `endReason=${fight.endReason || 'n/a'}；硬时限 ${BATTLE_SECONDS} s（${BATTLE_TICK_LIMIT} tick）`,
  ],
  [
    '整场时长（AI 对 AI）',
    `${f(aiBefore)} s（30 Hz 版打到 5940 tick 硬时限）`,
    `${f(aiAfter)} s（${aiFight.endTick} tick ÷ 60）`,
    `endReason=${aiFight.endReason || 'n/a'}；目标区间 150–200 s 是硬时限，实际对局更短`,
  ],
  [
    '倒计时 99→0',
    `${f(cdBefore)} s（5940 tick ÷ 30）`,
    `${f(cdAfter)} s（${zeroTick} tick ÷ 60）`,
    `60 Hz：1 单位 = 120 tick = 2 s ⇒ 0.5/秒；10 s 时剩 ${cd10} 单位`,
  ],
];

const md = [
  '# R192 节奏实测（work/tick60/pace.mjs）',
  '',
  `- 数据：\`${DATA_DIR}\`（真 \`loadData\`），世界：\`createWorld({seed:${SEED}})\` + \`engage()\` 后逐 tick \`step()\`。`,
  `- 采样兵：起手 (x,y)=(${fight.sample}) 的 A 侧前排步兵；跨格 tick 样本 ${fight.cellTicks.length} 个：${fight.cellTicks.slice(0, 12).join('/')}${fight.cellTicks.length > 12 ? '/…' : ''}`,
  `- 改前一列 = 同一条 tick 曲线按 30 Hz 折算（本轮 tick 常数一位未改，tick 时间轴与 30 Hz 版逐 tick 相同）。`,
  '',
  '| 指标 | 改前（30 Hz） | 改后（60 Hz 实测） | 依据 |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
  '',
  `- 整场：over=${fight.over}，endReason=\`${fight.endReason}\`，最小间距 ${f(fight.minGap, 3)} 格。`,
  `- 硬时限自检：BATTLE_SECONDS=${BATTLE_SECONDS}，BATTLE_TICK_LIMIT=${BATTLE_TICK_LIMIT}，TICK_HZ=${TICK_HZ}。`,
  '',
].join('\n');

fs.writeFileSync(OUT_MD, md, 'utf8');
fs.writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      tickHz: TICK_HZ,
      beforeHz: BEFORE_HZ,
      battleTickLimit: BATTLE_TICK_LIMIT,
      battleSeconds: BATTLE_SECONDS,
      fight: { ...fight, cellTicks: fight.cellTicks.slice(0, 40) },
      aiFight: { ...aiFight, cellTicks: aiFight.cellTicks.slice(0, 40) },
      countdownZeroTick: zeroTick,
      derived: {
        cellBefore,
        cellAfter,
        approachBefore,
        approachAfter,
        fullBefore,
        fullAfter,
        aiBefore,
        aiAfter,
        cdBefore,
        cdAfter,
      },
    },
    null,
    2,
  ),
  'utf8',
);

console.log(
  `cell=${f(cellAfter)}s (before ${f(cellBefore)}s) | approach31=${f(31 * cellAfter)}s contact=${f(approachAfter)}s | full=${f(fullAfter)}s/${fight.endTick}t (before ${f(fullBefore)}s) | ai=${f(aiAfter)}s/${aiFight.endTick}t | clock99to0=${f(cdAfter)}s (before ${f(cdBefore)}s) | reason=${fight.endReason || 'n/a'}/${aiFight.endReason || 'n/a'} | over=${fight.over}/${aiFight.over}`,
);
