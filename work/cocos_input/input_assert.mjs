#!/usr/bin/env node
/**
 * `input_assert.mjs` —— Cocos 战斗页「操作层」断言（纯逻辑，不构建、不出包、不跑 Cocos）。
 *
 * 思路：真正的 `BattleInput.ts` 用仓库自带 typescript 编成 CommonJS 到
 * `work\cocos_input\.build\`，它拉进来的 `view/layout.ts` / `core/battle.ts`
 * 用的是**同一份编译产物**；数据来自 `game/src/data.ts` 的 `loadData()`（与 web 同源），
 * 世界由 **Cocos 内核 `createWorld()`** 建。`cc` 用哨兵 mock：Resolver 里记账、
 * 真被执行就抛错 —— 断言「整条链一次都没碰引擎」。
 *
 * 与 `hud_assert.mjs` 的差别：HUD 断言是"读节点树"，这里是"点屏幕 → 看内核状态"，
 * 所以额外给 `core.cast` / `core.requestRetreat` 套了计数壳，用来证明
 * 「真的调了内核」而不是页面自己算的。
 *
 * 用法：`node work\cocos_input\input_assert.mjs`（退出码 0 = 全过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCRIPTS = path.join(REPO, 'game', 'cocos', 'assets', 'scripts');
const BUILD = path.join(HERE, '.build');
const MOCK_CC = path.join(HERE, 'mock', 'cc', 'index.cjs');

// ---------------------------------------------------------------------------
// 0. 把真源码编成 CJS（只编 BattleInput，依赖自动带出来）
// ---------------------------------------------------------------------------

function loadTypeScript() {
  const candidates = [
    path.join(REPO, 'game', 'node_modules', 'typescript'),
    path.join(REPO, 'node_modules', 'typescript'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return require(dir);
  }
  try {
    return require('typescript');
  } catch (err) {
    throw new Error(`找不到 typescript（试过 ${candidates.join(' / ')}）：${err.message}`);
  }
}

/** @returns {{files: string[], errors: number}} */
function build() {
  const ts = loadTypeScript();
  fs.rmSync(BUILD, { recursive: true, force: true });
  const rootNames = [path.join(SCRIPTS, 'BattleInput.ts')];
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    experimentalDecorators: true,
    useDefineForClassFields: false,
    noEmit: false,
    declaration: false,
    sourceMap: false,
    removeComments: false,
    types: [],
    outDir: BUILD,
    rootDir: SCRIPTS,
    // 不把 3.3MB 引擎 d.ts 塞进 program：`cc` 解析不到只会产生 TS2307，
    // 而这条链本来就不该 require('cc')，断言里会单独查。
    noResolve: false,
  };
  const program = ts.createProgram(rootNames, options);
  const result = program.emit();
  if (result.emitSkipped) throw new Error('tsc emit 被跳过（语法错误？）');
  const diag = ts.getPreEmitDiagnostics(program).filter(
    (d) => d.category === ts.DiagnosticCategory.Error && d.code !== 2307,
  );
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(BUILD);
  return { files, errors: diag.length, diag };
}

// ---------------------------------------------------------------------------
// 1. `cc` 哨兵：只记账，不加载
// ---------------------------------------------------------------------------

let ccResolved = 0;
const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'cc') {
    ccResolved += 1;
    return MOCK_CC;
  }
  return origResolveFilename.call(this, request, ...rest);
};

const buildInfo = build();
const layout = require(path.join(BUILD, 'view', 'layout.js'));
const core = require(path.join(BUILD, 'core', 'battle.js'));
const BI = require(path.join(BUILD, 'BattleInput.js'));
// 部队指令内核（六颗第一层按下后要验证命令字真的写进 armyOrderOf）
const army = require(path.join(BUILD, 'core', 'army_cmd.js'));

// 内核调用计数壳（CJS 里 BattleInput 是 `battle_1.cast(...)`，属性在调用时读 → 能拦到）
const runtime = require(path.join(BUILD, 'core', 'smartscript', 'runtime.js'));

// ---------------------------------------------------------------------------
// 1b. magic_so 预加载：走 BootRoot 那条真路径（shim/host.ts 造 fetch + location）
//
// 真机上 `shim/host.ts::preloadMagicProgram()` 把 Bundle 资源包成 fetch 响应，
// 再 `initMagicProgram('data/')`。Node 里没有 location/fetch，这里用同一套接口
// 从 `game\data\` 读盘，**不碰 Cocos core 内部变量**；不预加载的话
// `cast()` 会走 node:fs + `https://cocos.local/` 兜底，抛 ERR_INVALID_URL_SCHEME。
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(REPO, 'game', 'data');
globalThis.location = { href: 'https://cocos.local/' };
globalThis.fetch = async (url) => {
  const u = String(url);
  const file = u.endsWith('magic_so.bin')
    ? path.join(DATA_DIR, 'magic_so.bin')
    : u.endsWith('magic_so.symbols.json')
      ? path.join(DATA_DIR, 'magic_so.symbols.json')
      : null;
  if (!file) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) };
  const buf = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
};
await runtime.initMagicProgram('data/');

const origCast = core.cast;
const origRetreat = core.requestRetreat;
let castCalls = 0;
let lastCastArgs = null;
let lastCastResult = null;
let retreatCalls = 0;
core.cast = function (...args) {
  castCalls += 1;
  lastCastArgs = args;
  lastCastResult = origCast.apply(null, args);
  return lastCastResult;
};
core.requestRetreat = function (...args) {
  retreatCalls += 1;
  return origRetreat.apply(null, args);
};

const { loadData } = await import(pathToFileURL(path.join(REPO, 'game', 'src', 'data.ts')).href);
const data = loadData();

// ---------------------------------------------------------------------------
// 2. 断言工具
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];
const sections = [];
let currentSection = null;

function section(name) {
  currentSection = { name, n: 0 };
  sections.push(currentSection);
}

function ok(name, cond, detail) {
  if (currentSection) currentSection.n += 1;
  if (cond) {
    passed += 1;
    return true;
  }
  failures.push(`${name}${detail === undefined ? '' : `  ::  ${String(detail)}`}`);
  return false;
}

function eq(name, actual, expected) {
  return ok(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

function near(name, actual, expected, tol, unit = '') {
  const d = Math.abs(actual - expected);
  return ok(name, d <= tol, `expected ${expected}±${tol}${unit}, got ${actual}（差 ${d}）`);
}

// ---------------------------------------------------------------------------
// 3. 夹具
// ---------------------------------------------------------------------------

const LANE_PX = layout.LANE_PX;
const ROW_PX = layout.ROW_PX;
const CAM = 35;

function newWorld(seed) {
  return core.createWorld({
    data,
    seed,
    a: {
      troop: 2,
      formation: 0,
      soldiers: 100,
      morale: 60,
      strategy: null,
      general: { name: '無名將', str: 97, int: 75, level: 6 },
    },
    b: {
      troop: 10,
      formation: 3,
      soldiers: 100,
      morale: 60,
      strategy: null,
      general: { name: '張角', str: 70, int: 88, level: 5 },
    },
    aiSides: { B: true },
  });
}

const slotRect = (i) => layout.skillSlotRect(i);
const slotCx = (i) => slotRect(i).x + slotRect(i).w / 2;
const slotCy = (i) => slotRect(i).y + slotRect(i).h / 2;
// 突擊/撤退在 h3 的指令台里挪到了左列 chip（web battleView.ts:407-408 的 CHIP_*），
// 老的 BTN_ASSAULT/BTN_RETREAT（x=528 宽 204）已被六颗指令按钮取代，只留作 layout 兼容值。
const CHIP_ASSAULT = { x: 18, y: 1128, w: 88, h: 84 };
const CHIP_RETREAT = { x: 18, y: 1218, w: 88, h: 84 };
const assaultC = { x: CHIP_ASSAULT.x + CHIP_ASSAULT.w / 2, y: CHIP_ASSAULT.y + CHIP_ASSAULT.h / 2 };
const retreatC = { x: CHIP_RETREAT.x + CHIP_RETREAT.w / 2, y: CHIP_RETREAT.y + CHIP_RETREAT.h / 2 };
const msgC = { x: layout.MESSAGE_BOX.x + layout.MESSAGE_BOX.w / 2, y: layout.MESSAGE_BOX.y + layout.MESSAGE_BOX.h / 2 };

function generalA(world) {
  return world.sides.A.general;
}

function enemyCenter(world) {
  const us = world.units.filter((u) => u.side === 'B');
  if (us.length === 0) return { x: 30, y: 6.5 };
  let sx = 0;
  let sy = 0;
  for (const u of us) {
    sx += u.x;
    sy += u.y;
  }
  return { x: sx / us.length, y: sy / us.length };
}

function fingerprint(world) {
  const g = generalA(world);
  return JSON.stringify({
    qi: g.qi,
    mp: g.mp,
    hp: g.hp,
    alive: g.alive,
    fled: world.fled,
    status: world.status,
    over: world.over,
    tick: world.tick,
    units: world.units.length,
    log: world.log.length,
    fx: world.fx.length,
    sessions: world.sessions.length,
  });
}

// ---------------------------------------------------------------------------
// G0 编译产物
// ---------------------------------------------------------------------------

section('G0 编译：BattleInput + layout + core 的 CJS 产物');
ok('tsc 无 error 诊断（忽略 cc 的 TS2307）', buildInfo.errors === 0, buildInfo.diag.length ? '见 stderr' : '');
ok('产出 .build/BattleInput.js', fs.existsSync(path.join(BUILD, 'BattleInput.js')));
ok('产出 .build/view/layout.js', fs.existsSync(path.join(BUILD, 'view', 'layout.js')));
ok('产出 .build/core/battle.js', fs.existsSync(path.join(BUILD, 'core', 'battle.js')));
ok('共编译出 >=4 个 .js', buildInfo.files.length >= 4, buildInfo.files.length);
let programReady = false;
try {
  programReady = typeof runtime.loadMagicProgram() === 'object';
} catch (err) {
  programReady = false;
}
ok('magic_so 预加载成功（与 BootRoot 同路径）', programReady);

// ---------------------------------------------------------------------------
// G1 技能格数据（makeSkillBar 对齐 web makeSkillBar + 内核 qiCostOf/fxTtlOf）
// ---------------------------------------------------------------------------

section('G1 技能格：makeSkillBar 的 name/mp/qi/kind/dir/ttl');
const bar = BI.makeSkillBar(data);
// R192：引擎节拍 30→60 Hz，FX_TTL_* 整体 ×2（`project/192` §三），这里跟着换新值；
// 但不断言旧值——真正的契约在 `game/tests/tick60.test.ts`（TICK_HZ=60、40 tick 不动）。
const expectSlots = [
  { seq: 1, name: '命療術', mp: 20, qi: 24000, kind: 'heal', dir: '016', ttl: 48 },
  { seq: 50, name: '半月斬', mp: 22, qi: 26400, kind: 'strike', dir: '001', ttl: 48 },
  { seq: 2, name: '落月弓', mp: 18, qi: 24000, kind: 'strike', dir: '003', ttl: 146 },
  { seq: 104, name: '神鬼亂舞', mp: 47, qi: 56400, kind: 'aoe', dir: '004', ttl: 115 },
];
eq('缺省兜底 4 个技能格（SKILL_SEQ）', bar.length, 4);
eq('SKILL_SLOTS 上限=8', BI.SKILL_SLOTS, 8);
eq('MAX_SKILL_SLOTS=8（原作 byte[8]）', BI.MAX_SKILL_SLOTS, 8);
for (let i = 0; i < expectSlots.length; i++) {
  const s = bar[i];
  const e = expectSlots[i];
  eq(`slot${i} seq`, s.seq, e.seq);
  eq(`slot${i} name`, s.name, e.name);
  eq(`slot${i} mp`, s.mp, e.mp);
  eq(`slot${i} qi=qiCostOf`, s.qi, e.qi);
  eq(`slot${i} kind`, s.kind, e.kind);
  eq(`slot${i} dir=fx_dir_primary`, s.dir, e.dir);
  eq(`slot${i} ttl=fxTtlOf`, s.ttl, e.ttl);
  eq(`slot${i} qi === qiCostOf(data,seq)`, s.qi, core.qiCostOf(data, s.seq));
  eq(`slot${i} ttl === fxTtlOf(data,seq)`, s.ttl, core.fxTtlOf(data, s.seq));
}

// ---------------------------------------------------------------------------
// G2 screenToWorld / screenToCell：6 个样本点往返 ≤1 格
// ---------------------------------------------------------------------------

section('G2 坐标：screenToWorld ↔ worldToScreen 往返（6 样本 × 4 项）');
const samples = [
  { name: '战场左上', sx: 4, sy: 104 },
  { name: '战场右上', sx: 746, sy: 104 },
  { name: '战场左下', sx: 4, sy: 996 },
  { name: '战场右下', sx: 746, sy: 996 },
  { name: '战场中心', sx: 375, sy: 550 },
  { name: 'HUD 区', sx: 375, sy: 50 },
];
for (const s of samples) {
  const w = BI.screenToWorld(CAM, s.sx, s.sy);
  const back = BI.worldToScreen(CAM, w.worldX, w.worldY);
  ok(`${s.name} worldX 有限`, Number.isFinite(w.worldX), w.worldX);
  ok(`${s.name} worldY 有限`, Number.isFinite(w.worldY), w.worldY);
  near(`${s.name} 往返 sx 误差 ≤1 格`, back.sx, s.sx, LANE_PX, 'px');
  near(`${s.name} 往返 sy 误差 ≤1 格`, back.sy, s.sy, ROW_PX, 'px');
  const cell = BI.screenToCell(CAM, s.sx, s.sy);
  const layoutCell = layout.screenToCell(s.sx, s.sy, CAM);
  const inField = layout.contains(layout.FIELD, s.sx, s.sy);
  if (inField) {
    ok(`${s.name} 在战场带内 → 有格`, cell !== null);
    eq(`${s.name} gx 与 layout.screenToCell 同值`, cell && cell.gx, layoutCell && layoutCell.gx);
    eq(`${s.name} gy 与 layout.screenToCell 同值`, cell && cell.gy, layoutCell && layoutCell.gy);
    near(`${s.name} worldX 与 layout 同值`, cell && cell.worldX, layoutCell && layoutCell.worldX, 1e-9);
  } else {
    eq(`${s.name} layout.screenToCell=null`, layoutCell, null);
    eq(`${s.name} screenToCell=null`, cell, null);
  }
}
for (const camX of [5, core.camera(newWorld(11)), 60]) {
  const w = BI.screenToWorld(camX, 375, 550);
  const back = BI.worldToScreen(camX, w.worldX, w.worldY);
  near(`camX=${camX.toFixed(2)} 往返 sx`, back.sx, 375, LANE_PX, 'px');
  near(`camX=${camX.toFixed(2)} 往返 sy`, back.sy, 550, ROW_PX, 'px');
}
near('战场中心 worldY=6.5', BI.screenToWorld(CAM, 375, 550).worldY, 6.5, 1e-9);
near('战场中心 worldX=camX', BI.screenToWorld(CAM, 375, 550).worldX, CAM, 1e-9);
near('左边缘 worldY=0 线在 sx=LANE_PX/2', BI.screenToWorld(CAM, LANE_PX / 2, 550).worldY, 0, 1e-9);

// ---------------------------------------------------------------------------
// G3 hitTest 分流：技能格 / 突擊 / 撤退 / 战场 / HUD
// ---------------------------------------------------------------------------

section('G3 hitTest：控件分流');
const W1 = newWorld(1010);
const inp1 = new BI.BattleInput();
inp1.bind(W1);
eq('未 bind 的输入器 mode=idle 且 hit=null', new BI.BattleInput().hitTest(375, 550, CAM), null);
for (let i = 0; i < 4; i++) {
  const h = inp1.hitTest(slotCx(i), slotCy(i), CAM);
  eq(`技能格${i} 命中 type`, h && h.type, 'skill');
  eq(`技能格${i} 命中 index`, h && h.index, i);
  eq(`技能格${i} 命中 seq`, h && h.seq, expectSlots[i].seq);
  eq(`技能格${i} 可放（满气力开局）`, h && h.canCast, true);
  eq(`技能格${i} 可放时 reason=null`, h && h.reason, null);
}
eq('突擊按钮命中', inp1.hitTest(assaultC.x, assaultC.y, CAM).type, 'assault');
eq('撤退按钮命中', inp1.hitTest(retreatC.x, retreatC.y, CAM).type, 'retreat');
const fieldHit = inp1.hitTest(375, 550, CAM);
eq('战场中心命中 type', fieldHit && fieldHit.type, 'field');
eq('战场中心 gx', fieldHit && fieldHit.gx, CAM);
eq('战场中心 gy', fieldHit && fieldHit.gy, 6);
near('战场中心 worldY=6.5', fieldHit && fieldHit.worldY, 6.5, 1e-9);
eq('HUD 中心 hit=null', inp1.hitTest(375, 50, CAM), null);
eq('消息栏中心 hit=null', inp1.hitTest(msgC.x, msgC.y, CAM), null);
eq('控制台头像 hit=null', inp1.hitTest(60, 1060, CAM), null);
eq('isConsoleControl(技能格0)', BI.isConsoleControl(slotCx(0), slotCy(0)), true);
eq('isConsoleControl(突擊)', BI.isConsoleControl(assaultC.x, assaultC.y), true);
eq('isConsoleControl(撤退)', BI.isConsoleControl(retreatC.x, retreatC.y), true);
eq('isConsoleControl(消息栏)', BI.isConsoleControl(msgC.x, msgC.y), true);
eq('isConsoleControl(HUD)', BI.isConsoleControl(375, 50), false);
eq('isConsoleControl(战场)', BI.isConsoleControl(375, 550), false);

// ---------------------------------------------------------------------------
// G4 HUD / 非战场区点击不产生施放
// ---------------------------------------------------------------------------

section('G4 HUD 区与战场外：点不出施放、气力技力不动');
const W2 = newWorld(2020);
const inp2 = new BI.BattleInput();
inp2.bind(W2);
const q2 = generalA(W2).qi;
const m2 = generalA(W2).mp;
eq('HUD 中心 tap 无副作用', inp2.tap(375, 50, CAM).length, 0);
eq('HUD 左上 tap 无副作用', inp2.tap(4, 4, CAM).length, 0);
eq('HUD 右上 tap 无副作用', inp2.tap(746, 4, CAM).length, 0);
eq('HUD 下沿 tap 无副作用', inp2.tap(375, 96, CAM).length, 0);
eq('控制台空白 tap 无副作用', inp2.tap(60, 1060, CAM).length, 0);
eq('消息栏 tap 无副作用', inp2.tap(msgC.x, msgC.y, CAM).length, 0);
eq('气力未变', generalA(W2).qi, q2);
eq('技力未变', generalA(W2).mp, m2);
eq('无施放调用', castCalls, 0);
eq('HUD 区内未进选中', inp2.selected, null);

// ---------------------------------------------------------------------------
// G5 castBlockReason / reasonText / skillRadius
// ---------------------------------------------------------------------------

section('G5 不可放原因：castBlockReason + 文案 + 半径');
const Wz = newWorld(1111);
eq('正常世界 可放', BI.castBlockReason(Wz, bar[0]), null);
eq('world=null → over', BI.castBlockReason(null, bar[0]), 'over');
Wz.over = true;
eq('world.over → over', BI.castBlockReason(Wz, bar[0]), 'over');
Wz.over = false;
generalA(Wz).alive = false;
eq('主将阵亡 → dead', BI.castBlockReason(Wz, bar[0]), 'dead');
generalA(Wz).alive = true;
generalA(Wz).mp = 5;
eq('技力不足 → mp', BI.castBlockReason(Wz, bar[0]), 'mp');
generalA(Wz).mp = 68;
generalA(Wz).qi = 100;
eq('气力不足 → qi', BI.castBlockReason(Wz, bar[0]), 'qi');
eq('reasonText(over)', BI.reasonText('over'), '戰鬥已結束。');
eq('reasonText(dead)', BI.reasonText('dead'), '主將已陣亡，無法施放。');
eq('reasonText(mp)', BI.reasonText('mp'), '技力不足。');
eq('reasonText(qi)', BI.reasonText('qi'), '氣力不足（每 tick 回复，等一會）。');
eq('reasonText(未知)', BI.reasonText('wat'), '無法施放。');
eq('reasonText(null)', BI.reasonText(null), '無法施放。');
eq('skillRadius(aoe)', BI.skillRadius('aoe'), 3.6);
eq('skillRadius(strike)', BI.skillRadius('strike'), 1.8);
eq('skillRadius(heal)', BI.skillRadius('heal'), 1.2);
eq('skillRadius(null)', BI.skillRadius(null), 1.2);

// ---------------------------------------------------------------------------
// G6 气力不足：点技能格出原因、点战场不扣气力
// ---------------------------------------------------------------------------

section('G6 气力不足：不施放、不扣气力、选中不被清');
const W3 = newWorld(3030);
generalA(W3).qi = 20000;
const inp3 = new BI.BattleInput();
inp3.bind(W3);
const q3 = generalA(W3).qi;
const m3 = generalA(W3).mp;
eq('castBlockReason(slot1)=qi', BI.castBlockReason(W3, bar[1]), 'qi');
const h3 = inp3.hitTest(slotCx(1), slotCy(1), CAM);
eq('技能格1 canCast=false', h3 && h3.canCast, false);
eq('技能格1 reason=qi', h3 && h3.reason, 'qi');
eq('点技能格1 无副作用', inp3.tapSkill(1).length, 0);
eq('点技能格1 不进选中', inp3.selected, null);
eq('点技能格1 文案=原因', inp3.message, '半月斬：氣力不足（每 tick 回复，等一會）。');
inp3.selected = 1; // web 里 selectedSkill 在被拒绝时保持原样
const casts3 = castCalls;
eq('强行选中后点战场 无副作用对象', inp3.tapField(30, 6.5).length, 0);
eq('点战场仍调内核 cast', castCalls, casts3 + 1);
eq('内核 cast 返回 !ok', lastCastResult && lastCastResult.ok, false);
eq('内核 cast reason=qi', lastCastResult && lastCastResult.reason, 'qi');
eq('气力一滴没扣', generalA(W3).qi, q3);
eq('技力一滴没扣', generalA(W3).mp, m3);
eq('失败后仍保留选中', inp3.selected, 1);
eq('失败文案=原因', inp3.message, '半月斬：氣力不足（每 tick 回复，等一會）。');

// ---------------------------------------------------------------------------
// G7 气力足：cast 真被调用、气力下降 === qiCostOf、飘字/技能音/清选中
// ---------------------------------------------------------------------------

section('G7 气力足够：真调 cast，气力下降 === qiCostOf');
const W4 = newWorld(4242);
generalA(W4).qi = core.QI_MAX;
generalA(W4).mp = 300;
const inp4 = new BI.BattleInput();
inp4.bind(W4);
const q4 = generalA(W4).qi;
const m4 = generalA(W4).mp;
eq('qiCostMul=1（默认无军师技）', core.qiCostMul(W4, 'A'), 1);
const casts4 = castCalls;
const fxLen4 = W4.fx.length;
// g5 口径：点技能格 = 直接施放（落点由内核 defaultAim 解析），不再进瞄准相
const eff4 = inp4.tapSkill(1);
eq('点技能格1 立刻调一次内核 cast', castCalls, casts4 + 1);
eq('一次点击返回 2 条特效（技能音 + 飘字）', eff4.length, 2);
eq('cast 的 side=A', lastCastArgs[1], 'A');
eq('cast 的 seq=50', lastCastArgs[2], 50);
eq('cast 的 ttl=fxTtlOf', lastCastArgs[5], bar[1].ttl);
eq('内核 cast 成功', lastCastResult && lastCastResult.ok, true);
eq('气力下降 === round(qiCostOf*1)', generalA(W4).qi, q4 - Math.round(core.qiCostOf(data, 50) * core.qiCostMul(W4, 'A')));
eq('技力下降 === MP', generalA(W4).mp, m4 - bar[1].mp);
ok('内核推了 fx', W4.fx.length > fxLen4, `${fxLen4} → ${W4.fx.length}`);
ok('特效含技能音（fx_dir_primary）', eff4.some((e) => e.kind === 'magic' && e.dir === '001'), JSON.stringify(eff4));
const floater4 = eff4.find((e) => e.kind === 'floater');
ok('特效含飘字', floater4 !== undefined);
ok('飘字文本 = -N/命中/MISS', floater4 !== undefined && /^(-?\d+|命中|MISS)$/.test(floater4.floater.text), floater4 && floater4.floater.text);
const aim4 = core.defaultAim(W4, 'A', 50);
ok(
  '飘字落在 defaultAim 解析出的落点（点格施放不选目标）',
  floater4 !== undefined && floater4.floater.x === aim4.x && floater4.floater.y === aim4.y,
  floater4 ? `${floater4.floater.x},${floater4.floater.y} vs ${aim4.x},${aim4.y}` : 'no floater',
);
ok('飘字 tone 与命中一致', floater4 !== undefined && (floater4.floater.tone === 'hit' || floater4.floater.tone === 'miss'));
eq('成功后清选中', inp4.selected, null);
eq('成功后清瞄准', inp4.aim, null);

section('G7b 命療術：直接施放、回血飘字、不进入瞄准');
const W5 = newWorld(5050);
generalA(W5).qi = 60000;
generalA(W5).mp = 68;
generalA(W5).hp = Math.round(generalA(W5).maxHp * 0.4);
const inp5 = new BI.BattleInput();
inp5.bind(W5);
const q5 = generalA(W5).qi;
const m5 = generalA(W5).mp;
const casts5 = castCalls;
const eff5 = inp5.tapSkill(0);
eq('heal 立刻调 cast', castCalls, casts5 + 1);
eq('heal 的 seq=1', lastCastArgs[2], 1);
eq('heal cast 成功', lastCastResult && lastCastResult.ok, true);
eq('heal 不进瞄准', inp5.selected, null);
eq('heal 气力扣除 24000', generalA(W5).qi, q5 - Math.round(core.qiCostOf(data, 1) * core.qiCostMul(W5, 'A')));
eq('heal 技力扣除 20', generalA(W5).mp, m5 - 20);
ok('heal 特效含 016 音', eff5.some((e) => e.kind === 'magic' && e.dir === '016'), JSON.stringify(eff5));
const fl5 = eff5.find((e) => e.kind === 'floater');
ok('heal 飘字 +N', fl5 !== undefined && /^\+\d+$/.test(fl5.floater.text), fl5 && fl5.floater.text);
eq('heal 飘字 tone=heal', fl5 && fl5.floater.tone, 'heal');
ok('heal 文案=回復 N 點體力', /^命療術：回復 \d+ 點體力。$/.test(inp5.message), inp5.message);

// ---------------------------------------------------------------------------
// G8 撤 退：requestRetreat → fled.A + 标记；推进到 endReason='retreat'
// ---------------------------------------------------------------------------

section('G8 撤退：内核状态 + 标记 + 结算原因');
const W6 = newWorld(6060);
const inp6 = new BI.BattleInput();
inp6.bind(W6);
eq('初始 fled.A=false', W6.fled.A, false);
eq('初始无标记', inp6.banner, null);
eq('初始 retreatBanner=null', BI.retreatBanner(W6), null);
eq('retreatBanner(null)=null', BI.retreatBanner(null), null);
const rCalls0 = retreatCalls;
eq('点撤退无副作用对象', inp6.tap(retreatC.x, retreatC.y, CAM).length, 0);
eq('requestRetreat 被调用', retreatCalls, rCalls0 + 1);
eq('fled.A=true', W6.fled.A, true);
eq('status.A=2', W6.status.A, 2);
ok('存活 A 单位都 flee', W6.units.filter((u) => u.side === 'A').every((u) => u.flee === true));
eq('输入器 banner', inp6.banner, '全軍撤退');
eq('BANNER_RETREAT 常量', BI.BANNER_RETREAT, '全軍撤退');
eq('撤退文案', inp6.message, '全軍撤退。');
inp6.tap(retreatC.x, retreatC.y, CAM);
eq('二次撤退 → requestRetreat 返回 false 的文案', inp6.message, '撤退失敗。');
let steps = 0;
while (!W6.over && steps < 3000) {
  core.step(W6);
  steps += 1;
}
eq('推进后 world.over', W6.over, true);
// 收尾原因：core 的 checkOver() 有两条路——「下令撤退且全部离场」判 'retreat'，
// 「兵全灭」判 'troops'。13:12 起走位改成 40 帧抽一格后，撤退方常常在离场前就被追杀光，
// 所以这里只钉「一定是我方输、且原因是这两种之一」，不再钉死 'retreat'。
ok('endReason ∈ {retreat, troops}', W6.endReason === 'retreat' || W6.endReason === 'troops', W6.endReason);
eq('winner=B', W6.winner, 'B');
ok('结算在 3000 tick 内完成', steps < 3000, `steps=${steps}`);
eq('结算后标记函数仍可读', BI.retreatBanner(W6), '全軍撤退');
inp6.setSettled(true);
eq('settle 后 mode=settled', inp6.modeNow, 'settled');
eq('settle 清选中', inp6.selected, null);

// ---------------------------------------------------------------------------
// G9 结算相：技能格/按钮/消息栏不重开；别处重开
// ---------------------------------------------------------------------------

section('G9 结算后：控件区不重开，画面才重开');
const W7 = newWorld(7070);
W7.over = true;
W7.endReason = 'retreat';
W7.winner = 'B';
const inp7 = new BI.BattleInput();
inp7.bind(W7);
inp7.setSettled(true);
const msg7 = inp7.message;
eq('结算相 技能格0 hit=null', inp7.hitTest(slotCx(0), slotCy(0), CAM), null);
eq('结算相 技能格3 hit=null', inp7.hitTest(slotCx(3), slotCy(3), CAM), null);
eq('结算相 突擊 hit=null', inp7.hitTest(assaultC.x, assaultC.y, CAM), null);
eq('结算相 撤退 hit=null', inp7.hitTest(retreatC.x, retreatC.y, CAM), null);
eq('结算相 消息栏 hit=null', inp7.hitTest(msgC.x, msgC.y, CAM), null);
eq('结算相 战场中心 hit=restart', inp7.hitTest(375, 550, CAM).type, 'restart');
eq('结算相 HUD 区 hit=restart', inp7.hitTest(375, 50, CAM).type, 'restart');
eq('结算相 控制台空白 hit=restart', inp7.hitTest(60, 1060, CAM).type, 'restart');
eq('结算相 战场角 hit=restart', inp7.hitTest(2, 102, CAM).type, 'restart');
eq('结算相 tap 战场无副作用对象', inp7.tap(375, 550, CAM).length, 0);
eq('结算相 tap 技能格无副作用对象', inp7.tap(slotCx(1), slotCy(1), CAM).length, 0);
eq('结算相 tapSkill=[]', inp7.tapSkill(0).length, 0);
eq('结算相 tapRetreat=[]', inp7.tapRetreat().length, 0);
eq('结算相 tapAssault=[]', inp7.tapAssault().length, 0);
eq('结算相 message 未被改写', inp7.message, msg7);
eq('结算相 world.over 仍 true', W7.over, true);

// ---------------------------------------------------------------------------
// G10 突 擊：只出提示，world 一个字段都不动
// ---------------------------------------------------------------------------

section('G10 突擊：AllRush 宿主通道 + 内核 rush 态 + 幂等');
const W8 = newWorld(8080);
const inp8 = new BI.BattleInput();
inp8.bind(W8);
const casts8 = castCalls;
const retreats8 = retreatCalls;
const qi8 = generalA(W8).qi;
const mp8 = generalA(W8).mp;
eq('初始未突擊', W8.rush && W8.rush.A, false);
eq('突擊命中 type', inp8.hitTest(assaultC.x, assaultC.y, CAM).type, 'assault');
eq('点突擊无 BattleEffect', inp8.tap(assaultC.x, assaultC.y, CAM).length, 0);
eq('突擊后 world.rush.A===true', W8.rush.A, true);
eq('内核 isRushing 同口径', core.isRushing(W8, 'A'), true);
eq('突擊文案=全軍突擊！', inp8.message, '全軍突擊！');
eq('没调 cast', castCalls, casts8);
eq('没调 requestRetreat', retreatCalls, retreats8);
const fpRush = fingerprint(W8);
const tapsBefore = inp8.tapAssault().length;
eq('再点突擊无副作用', tapsBefore, 0);
eq('再点文案=全軍已在突擊中。', inp8.message, '全軍已在突擊中。');
eq('再点后 rush 仍为 true（幂等）', W8.rush.A, true);
eq('再点后仍在突擊态', core.isRushing(W8, 'A'), true);
eq('突擊不动气力', generalA(W8).qi, qi8);
eq('突擊不动技力', generalA(W8).mp, mp8);
eq('再点仍不动气力', generalA(W8).qi, qi8);
eq('MSG_RUSH_OK 常量', BI.MSG_RUSH_OK, '全軍突擊！');
eq('MSG_RUSHING 常量', BI.MSG_RUSHING, '全軍已在突擊中。');
// 内核移动模型：13:12 起 core/battle.ts 改成「40 帧抽一格」的滑动（ACTION_SLIDE_TICKS），
// 旧的 RUSH_SPEED / RETREAT_SPEED / MOVE_PER_TICK 已随连续移动一起删除，这里改断言新常量。
eq('内核 ACTION_SLIDE_TICKS=40（40 帧抽一格）', core.ACTION_SLIDE_TICKS, 40);

// ---------------------------------------------------------------------------
// G11 瞄准路径：点格已直接施放，但 moveAim/cancelAim 仍由 BattleRoot 的拖动复用
// ---------------------------------------------------------------------------

section('G11 瞄准落点：moveAim / cancelAim');
const W9 = newWorld(9090);
const inp9 = new BI.BattleInput();
inp9.bind(W9);
inp9.moveAim(375, 550, CAM);
eq('未选中时 aim=null', inp9.aim, null);
inp9.tapSkill(2);
eq('点技能格2 直接施放（g5 口径，不进瞄准）', inp9.selected, null);
eq('施放后 aim=null', inp9.aim, null);
// 手动瞄准路径仍在（BattleRoot.update 在 selectedSlot 非空时会先摆到战场中央）
inp9.selected = 2;
inp9.moveAim(375, 550, CAM);
ok('战场中心 aim 非空', inp9.aim !== null, JSON.stringify(inp9.aim));
eq('aim.gx', inp9.aim && inp9.aim.gx, CAM);
eq('aim.gy', inp9.aim && inp9.aim.gy, 6);
inp9.moveAim(375, 50, CAM);
eq('移到 HUD 区 aim=null', inp9.aim, null);
inp9.moveAim(1, 500, CAM);
eq('战场左边缘 aim.gy=0', inp9.aim && inp9.aim.gy, 0);
inp9.cancelAim();
eq('cancelAim 清选中', inp9.selected, null);
eq('cancelAim 文案', inp9.message, '已取消瞄準。');
eq('cancelAim 清瞄准', inp9.aim, null);

// ---------------------------------------------------------------------------
// G12 文案常量 & 引擎隔离
// ---------------------------------------------------------------------------

section('G12 常量文案 + cc 隔离');
eq('MSG_PICK_FIRST', BI.MSG_PICK_FIRST, '先點下方技能格，再點戰場選目標。');
eq('MSG_AIM', BI.MSG_AIM, '點戰場選目標（再點技能格取消）。');
eq('MSG_CANCEL_AIM', BI.MSG_CANCEL_AIM, '已取消瞄準。');
eq('MSG_RETREAT_OK', BI.MSG_RETREAT_OK, '全軍撤退。');
eq('MSG_RETREAT_FAIL', BI.MSG_RETREAT_FAIL, '撤退失敗。');
eq('MSG_OVER', BI.MSG_OVER, '戰鬥已結束。');
eq('SKILL_SEQ 与 web DEFAULT_SKILL_SEQ 一致', JSON.stringify(BI.SKILL_SEQ), JSON.stringify([1, 50, 2, 104]));
eq('整条链一次都没碰 cc（Resolver 记账）', ccResolved, 0);
const ccRequires = buildInfo.files.filter((f) => /require\(["']cc["']\)/.test(fs.readFileSync(f, 'utf8')));
ok('编译产物里没有 require("cc")', ccRequires.length === 0, ccRequires.join(', '));
const srcUI = fs.readFileSync(path.join(SCRIPTS, 'BattleInput.ts'), 'utf8');
ok('BattleInput.ts 源码不 import cc', !/from\s+['"]cc['"]/.test(srcUI));

// ---------------------------------------------------------------------------
// G13 状态机口径（idle / aiming / cast）+ 突擊 TODO 挂点
// ---------------------------------------------------------------------------

section('G13 状态机 phase：idle → fighting → settled（点格即施放）');
const inpP = new BI.BattleInput();
eq('未 bind → phase=idle', inpP.phase, 'idle');
const WP = newWorld(13013);
inpP.bind(WP);
eq('bind 后 phase=fighting', inpP.phase, 'fighting');
inpP.tapSkill(1);
eq('点可放技能格 → 直接施放，phase 仍是 fighting', inpP.phase, 'fighting');
eq('施放后 selected=null（不进瞄准）', inpP.selected, null);
eq('施放后 modeNow 仍是 fighting', inpP.modeNow, 'fighting');
inpP.setSettled(true);
eq('结算后 phase=settled', inpP.phase, 'settled');
// —— 突擊接线（g6 内核 AllRush 已通）——
ok('源码不再有 v2 未接 兜底文案', !srcUI.includes('v2 未接'));
ok('tapAssault 走宿主通道 createBattleSysoHost', srcUI.includes('createBattleSysoHost(world'));
ok("宿主 handled!==true 时退化内核 allRush(world,'A')", srcUI.includes("allRush(world, 'A')"));
ok("tapAssault 先判 isRushing(world,'A') 做幂等", srcUI.includes("isRushing(world, 'A')"));
ok('宿主异常时 catch 里仍调内核', /catch\s*{[\s\S]{0,80}allRush\(world, 'A'\)/.test(srcUI));
const srcHud = fs.readFileSync(path.join(SCRIPTS, 'BattleHud.ts'), 'utf8');
ok('HUD 突擊副文案常态=全軍突擊', srcHud.includes("'全軍突擊'"));
ok('HUD 突擊副文案突击态=突擊中', srcHud.includes("'突擊中'"));
ok('HUD 不再出现 v2 未接', !srcHud.includes('v2 未接'));
ok('HUD 用 world.rush.A 切文案', srcHud.includes('world.rush?.A === true'));

// ---------------------------------------------------------------------------
// G14 触摸换算：getUILocation（设计单位、左下原点）→ 屏幕坐标（左上原点）
//
// 2026-11-25 真机实测（876x1368 canvas / 750x1334 设计分辨率，scale=1.025487）：
//   点设计点 (sx,sy) → getUILocation() = (sx, 1334 - sy)。
// 旧公式 sx = ui.x + 375、sy = 667 - ui.y 会把点击右移 375、纵向翻到对面，
// 点技能格会落进战场（CDP 真点复现过）。这里把换算锁死，防止再回退。
// ---------------------------------------------------------------------------

section('G14 触摸换算 uiToScreen：左下原点 → 左上原点');
const SC14 = 1.025487256371814;
const PAD_L14 = (876 - 750 * SC14) / 2; // 53.442…
const pageToUi = (px, py) => ({ x: (px - PAD_L14) / SC14, y: (1368 - py) / SC14 });
const designToPage = (sx, sy) => ({ x: PAD_L14 + sx * SC14, y: 1368 - (1334 - sy) * SC14 });

eq('uiToScreen：x 直通（设计单位不换算）', BI.uiToScreen(375, 784).sx, 375);
eq('uiToScreen：y 翻成 DESIGN_H - uy', BI.uiToScreen(375, 784).sy, 550);
eq('uiToScreen：设计底边 uy=0 → sy=1334', BI.uiToScreen(0, 0).sy, 1334);
eq('uiToScreen：黑边负 x 不夹取', BI.uiToScreen(-52.1, 668).sx, -52.1);

const WP14 = newWorld(14014);
generalA(WP14).qi = core.QI_MAX; // 保证 4 格都放得出，命中分流只看坐标
generalA(WP14).mp = 999;
const bar14 = BI.makeSkillBar(data);
const ctx14 = { world: WP14, slots: bar14, mode: 'fighting', camX: 0 };
const slot0Design = { x: slotCx(0), y: slotCy(0) };

// 真机同一组样本：page(318.02, 1197.77) 就是旧 steps_click 里"点技能格"的那一点，
// getUILocation 实测回 (258.4137, 166.75)；换算后应落在第 1 格中心 (258.41, 1167.25)
const pageMap = pageToUi(318.02, 1197.77);
near('页面→UI：page(318.02,1197.77) → ux≈258.41', pageMap.x, 258.4137, 1.5);
near('页面→UI：page(318.02,1197.77) → uy≈166.75', pageMap.y, 166.75, 1.5);
const realSx = BI.uiToScreen(258.4137426900585, 166.75);
near('真机样本 ui(258.41,166.75) → sx=258.41', realSx.sx, 258.4137426900585, 1e-9);
near('真机样本 ui(258.41,166.75) → sy=1167.25', realSx.sy, 1167.25, 1e-9);
const realHit = BI.hitTest(ctx14, realSx.sx, realSx.sy);
eq('真机样本点中的是技能格', realHit && realHit.type, 'skill');
eq('真机样本落在第 2 格（x=258 在 214..302）', realHit && realHit.index, 1);
eq('该格现在可放', realHit && realHit.canCast, true);

// 旧公式的反例：同样一次点击，+375/667 后落进战场 → 这正是 bug 的真身
const oldHit = BI.hitTest(ctx14, realSx.sx + 375, 667 - 166.75);
eq('旧公式(+375/667)会把同一点送进战场（回归反例）', oldHit && oldHit.type, 'field');

// 设计点 ↔ 页面点往返：slot0 中心转 page 再转回来必须还是它
const p0 = designToPage(slot0Design.x, slot0Design.y);
const back0 = BI.uiToScreen(pageToUi(p0.x, p0.y).x, pageToUi(p0.x, p0.y).y);
near('页面往返：slot0 中心 sx', back0.sx, slot0Design.x, 0.001);
near('页面往返：slot0 中心 sy', back0.sy, slot0Design.y, 0.001);

// 消息栏 / HUD 底栏：换算后必须落回 HUD 区，不许算成战场
const msgPage = designToPage(msgC.x, msgC.y);
const msgUi = pageToUi(msgPage.x, msgPage.y);
const msgBack = BI.uiToScreen(msgUi.x, msgUi.y);
near('消息栏设计点 → 页面 → UI → 屏幕，y 往返', msgBack.sy, msgC.y, 0.001);
eq('消息栏 hitTest 返回 null（不是战场格）', BI.hitTest(ctx14, msgC.x, msgC.y), null);
eq('消息栏被 isConsoleControl 吃掉', BI.isConsoleControl(msgC.x, msgC.y), true);

// 真机同一点走完整输入链：点第 2 格 → 直接施放（g5 口径），文案以技能名开头
const p1 = designToPage(slotCx(1), slotCy(1));
const ui1 = pageToUi(p1.x, p1.y);
const s1 = BI.uiToScreen(ui1.x, ui1.y);
const inp14 = new BI.BattleInput();
inp14.bind(WP14);
inp14.tap(s1.sx, s1.sy, 0);
eq('换算后的点 tap → 直接施放，selected=null', inp14.selected, null);
ok(
  '换算后的点 tap → 文案来自第 2 格技能',
  inp14.message.startsWith(`${inp14.slots[1].name}：`),
  inp14.message,
);

// 战场中心 page(438,564) → 设计 (375,550) → field
const fieldUi = pageToUi(438, 564);
const fieldSx = BI.uiToScreen(fieldUi.x, fieldUi.y);
near('战场中心 page(438,564) → sx=375', fieldSx.sx, 375, 1.0);
near('战场中心 page(438,564) → sy=550', fieldSx.sy, 550, 1.0);
eq('战场中心命中 field', BI.hitTest(ctx14, fieldSx.sx, fieldSx.sy).type, 'field');

// BattleRoot 必须真的走这个纯函数，不能把旧公式再写回去
const srcRoot = fs.readFileSync(path.join(SCRIPTS, 'BattleRoot.ts'), 'utf8');
ok('BattleRoot.toScreen 调 uiToScreen', srcRoot.includes('return uiToScreen(p.x, p.y);'));
ok('BattleRoot 不再用 HALF_W/HALF_H 拼触摸换算', !/sx: p\.x \+ HALF_W/.test(srcRoot));

// ---------------------------------------------------------------------------
// G15 8 技位：按将习得 + 两行版式 + 第 8 格命中/选中
// ---------------------------------------------------------------------------

section('G15 8 技位：learnedSkillSeqs + skillSlotRects + 第 8 格');
const seqs15 = BI.learnedSkillSeqs(data, '關羽', 30);
ok('關羽 Lv30 习得 >4 条（不再是写死 4 格）', seqs15.length > 4, `实际 ${seqs15.length}`);
ok('习得条数 <= 8', seqs15.length <= 8, `实际 ${seqs15.length}`);
const r4 = BI.skillSlotRects(4);
eq('4 格版式条数', r4.length, 4);
eq('4 格版式沿用 layout.skillSlotRect(0)', r4[0].y, layout.skillSlotRect(0).y);
eq('4 格版式沿用 layout.skillSlotRect(3).x', r4[3].x, layout.skillSlotRect(3).x);
const r8 = BI.skillSlotRects(8);
eq('8 格版式条数', r8.length, 8);
eq('8 格第一行 y=1100', r8[0].y, 1100);
eq('8 格第二行 y=1162', r8[4].y, 1162);
eq('8 格第二行 x 回到第一列', r8[4].x, r8[0].x);
eq('8 格行高 56', r8[0].h, 56);
eq('skillSlotRects(9) 夹到 8', BI.skillSlotRects(9).length, 8);
eq('learnedSkillSeqs(未知将) 回退 4 条兜底', BI.learnedSkillSeqs(data, '查無此人', 30).length, 4);
eq('learnedSkillSeqs(max=3) 只留 3', BI.learnedSkillSeqs(data, '關羽', 30, 3).length, 3);
// 旧内置包只有单个 "等级, 技序" 字符串；两种落盘形状必须同解
const fakeData = {
  ...data,
  generals: [
    { NAME: '測試甲', SKILL: '6, 63' },
    { NAME: '測試乙', SKILL: [[1, 50], [6, 63]] },
    { NAME: '測試丙', SKILL: [1, 50] },
  ],
};
eq('单字符串 SKILL "6, 63" → 1 条', JSON.stringify(BI.learnedSkillSeqs(fakeData, '測試甲', 1)), JSON.stringify([63]));
eq('单字符串 + 够级 → 仍是 63', JSON.stringify(BI.learnedSkillSeqs(fakeData, '測試甲', 9)), JSON.stringify([63]));
eq('二维数组 SKILL → 2 条', JSON.stringify(BI.learnedSkillSeqs(fakeData, '測試乙', 9)), JSON.stringify([50, 63]));
eq('扁平数组 SKILL → 1 条', JSON.stringify(BI.learnedSkillSeqs(fakeData, '測試丙', 9)), JSON.stringify([50]));
eq('空 SKILL 行回退兜底', BI.learnedSkillSeqs({ ...data, generals: [{ NAME: '測試丁', SKILL: '' }] }, '測試丁', 9).length, 4);

function newWorldLv(seed, name, level) {
  return core.createWorld({
    data,
    seed,
    a: { troop: 2, formation: 0, soldiers: 100, morale: 60, strategy: null, general: { name, str: 97, int: 75, level } },
    b: { troop: 10, formation: 3, soldiers: 100, morale: 60, strategy: null, general: { name: '張角', str: 70, int: 88, level: 5 } },
    aiSides: { B: true },
  });
}
const W15 = newWorldLv(15015, '關羽', 30);
const inp15 = new BI.BattleInput();
inp15.bind(W15);
eq('bind 后技能格数=习得条数（<=8）', inp15.slots.length, Math.min(seqs15.length, 8));
ok('技能格数 >=5', inp15.slots.length >= 5, `实际 ${inp15.slots.length}`);
eq('第 1 格 seq=习得列表第 1 条', inp15.slots[0].seq, seqs15[0]);
eq('最后一格 seq=习得列表最后一条', inp15.slots[inp15.slots.length - 1].seq, seqs15[inp15.slots.length - 1]);
generalA(W15).qi = core.QI_MAX;
generalA(W15).mp = 999;
const rectsNow = BI.skillSlotRects(inp15.slots.length);
let lastIdx = inp15.slots.length - 1;
if (inp15.slots[lastIdx].kind === 'heal') lastIdx -= 1; // heal 是立即施放，换最后一格非 heal
const rr = rectsNow[lastIdx];
const hit15 = inp15.hitTest(rr.x + rr.w / 2, rr.y + rr.h / 2, CAM);
eq('点最后一格命中 skill', hit15 && hit15.type, 'skill');
eq('命中的正是最后一格下标', hit15 && hit15.index, lastIdx);
eq('最后一格可放', hit15 && hit15.canCast, true);
inp15.tap(rr.x + rr.w / 2, rr.y + rr.h / 2, CAM);
eq('点最后一格 → 直接施放（selected=null）', inp15.selected, null);
ok(
  '最后一格文案以技名开头',
  inp15.message.startsWith(`${inp15.slots[lastIdx].name}：`),
  inp15.message,
);
// 8 格版式下 HUD 底栏不被误判为战场
// 8 格版式第二行比 4 格单行更低（y 1162..1218 vs 1124..1212），取行尾测试
eq('第 8 格行尾在 8 格版式下算控件', BI.isConsoleControl(rr.x + 2, rr.y + 52, inp15.slots.length), true);
eq('第 8 格行尾在 4 格版式下不算控件', BI.isConsoleControl(rr.x + 2, rr.y + 52, 4), false);

// ---------------------------------------------------------------------------
// G16 h3 指令台：6 颗第一层 / 第二层 6 行 / 左列 2 chip 的命中与下令
// ---------------------------------------------------------------------------

section('G16 指令台 cmd6 / armyMenu / armyCmd 命中与下令');
const CMD6 = [];
for (let i = 0; i < 6; i++) {
  CMD6.push({ x: 524 + (i % 2) * 108 + 50, y: 1030 + Math.floor(i / 2) * 94 + 42 });
}
const KINDS16 = ['guardLord', 'armyMenu', 'skillPage', 'sortie', 'lordOrder', 'retreat'];
const W16 = newWorld(16016);
const inp16 = new BI.BattleInput();
inp16.bind(W16);
for (let i = 0; i < 6; i++) {
  // 第 2 颗的 hitTest 会顺手开合第二层（web 同款），所以每次探针前先归位
  inp16.setArmyMenuOpen(false);
  const h = inp16.hitTest(CMD6[i].x, CMD6[i].y, CAM);
  eq(`第一层第${i + 1}颗 type`, h && h.type, 'cmd6');
  eq(`第一层第${i + 1}颗 btn`, h && h.btn, i);
  eq(`第一层第${i + 1}颗 kind`, h && h.kind, KINDS16[i]);
}
inp16.setArmyMenuOpen(false);
eq('第 1/2 颗之间的 8px 空隙 → null（不是 cmd6）', inp16.hitTest(628, 1072, CAM), null);
eq('突擊 chip 仍然命中', inp16.hitTest(assaultC.x, assaultC.y, CAM).type, 'assault');
eq('撤退 chip 仍然命中', inp16.hitTest(retreatC.x, retreatC.y, CAM).type, 'retreat');
eq('isConsoleControl(第一层第 1 颗)', BI.isConsoleControl(CMD6[0].x, CMD6[0].y), true);

inp16.tap(CMD6[1].x, CMD6[1].y, CAM);
eq('点第 2 颗 → 第二层展开', inp16.armyMenuNow, true);
const row0 = { x: 516 + 110, y: 1119 + 16 };
const hRow = inp16.hitTest(row0.x, row0.y, CAM);
eq('展开后第 1 行 → armyCmd', hRow && hRow.type, 'armyCmd');
eq('展开后第 1 行 slot=0', hRow && hRow.slot, 0);
eq('展开后第 1 行 label=前軍前進', hRow && hRow.label, '前軍前進');
const hCover = inp16.hitTest(CMD6[2].x, CMD6[2].y, CAM);
eq('第一层第 3 颗被面板盖住 → armyCmd', hCover && hCover.type, 'armyCmd');
const hBlank = inp16.hitTest(514, 1200, CAM);
eq('面板内空白 → armyMenu', hBlank && hBlank.type, 'armyMenu');
const hBack = inp16.hitTest(300, 400, CAM);
eq('面板外点 → field', hBack && hBack.type, 'field');
eq('面板外点后菜单自动收起', inp16.armyMenuNow, false);

inp16.tap(CMD6[1].x, CMD6[1].y, CAM);
const effRow = inp16.tap(row0.x, row0.y, CAM);
eq('下一行指令无特效对象', effRow.length, 0);
ok('下令文案含「已下令」', inp16.message.includes('已下令'), inp16.message);
ok('内核已记下第 1 槽指令', army.armyOrderOf(W16, 'A').slots[0] !== null);

inp16.tap(CMD6[0].x, CMD6[0].y, CAM);
eq(
  '保護主將 → 内核 ARMY_BTN.guardLord',
  (army.armyOrderOf(W16, 'A').buttons & army.ARMY_BTN.guardLord) !== 0,
  true,
);
ok('保護主將文案', inp16.message.startsWith('保護主將：'), inp16.message);
inp16.tap(CMD6[2].x, CMD6[2].y, CAM);
eq('武將技只切焦點', inp16.message, BI.MSG_SKILL_PAGE);
inp16.tap(CMD6[3].x, CMD6[3].y, CAM);
eq('武將出擊 → 内核 ARMY_BTN.sortie', (army.armyOrderOf(W16, 'A').buttons & army.ARMY_BTN.sortie) !== 0, true);
eq('G 键第一态=主將後退', inp16.hitTest(CMD6[4].x, CMD6[4].y, CAM).label, '主將後退');
inp16.tap(CMD6[4].x, CMD6[4].y, CAM);
eq('下令「後退」后按钮变「主將待機」', inp16.hitTest(CMD6[4].x, CMD6[4].y, CAM).label, '主將待機');
inp16.tap(CMD6[4].x, CMD6[4].y, CAM);
eq('再点一次回到「主將後退」', inp16.hitTest(CMD6[4].x, CMD6[4].y, CAM).label, '主將後退');

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

const total = passed + failures.length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
for (const s of sections) console.log(`${pad(s.name, 46)} ${String(s.n).padStart(3)} 条`);
console.log('-'.repeat(56));
console.log(`断言总数 ${total} · 通过 ${passed} · 失败 ${failures.length}`);
if (failures.length) {
  console.log('\n失败清单：');
  for (const f of failures) console.log('  ✗ ' + f);
}
process.exitCode = failures.length === 0 && total >= 60 ? 0 : 1;
