#!/usr/bin/env node
/**
 * `input_assert.mjs` —— Cocos 战斗页「操作层」断言（纯逻辑，不构建、不出包、不跑 Cocos）。
 *
 * 思路：真正的 `BattleInput.ts` 用仓库自带 typescript 编成 CommonJS 到
 * `work\cocos_binput\.build\`，它拉进来的 `view/layout.ts` / `core/battle.ts`
 * 用的是**同一份编译产物**；数据来自 `game/src/data.ts` 的 `loadData()`（与 web 同源），
 * 世界由 **Cocos 内核 `createWorld()`** 建。`cc` 用哨兵 mock：Resolver 里记账、
 * 真被执行就抛错 —— 断言「整条链一次都没碰引擎」。
 *
 * 与 `hud_assert.mjs` 的差别：HUD 断言是"读节点树"，这里是"点屏幕 → 看内核状态"，
 * 所以额外给 `core.cast` / `core.requestRetreat` 套了计数壳，用来证明
 * 「真的调了内核」而不是页面自己算的。
 *
 * 用法：`node work\cocos_binput\input_assert.mjs`（退出码 0 = 全过）。
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
      general: { name: '關羽', str: 97, int: 75, level: 6 },
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
const CMD_UI = require(path.join(BUILD, 'BattleCmdUi.js'));
const chipCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const assaultC = chipCenter(CMD_UI.CHIP_ASSAULT);
const retreatC = chipCenter(CMD_UI.CHIP_RETREAT);
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
const expectSlots = [
  { seq: 1, name: '命療術', mp: 20, qi: 24000, kind: 'heal', dir: '016', ttl: 24 },
  { seq: 50, name: '半月斬', mp: 22, qi: 26400, kind: 'strike', dir: '001', ttl: 24 },
  { seq: 2, name: '落月弓', mp: 18, qi: 24000, kind: 'strike', dir: '003', ttl: 73 },
  { seq: 104, name: '神鬼亂舞', mp: 47, qi: 56400, kind: 'aoe', dir: '004', ttl: 57 },
];
eq('4 个技能格', bar.length, 4);
eq('SKILL_SLOTS=4', BI.SKILL_SLOTS, 4);
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
// 全图投影（R215）后镜头不参与坐标：屏幕中心恒为 worldX=35（71 行的正中），与 camX 无关
near('战场中心 worldX=35', BI.screenToWorld(CAM, 375, 550).worldX, 35, 1e-6);
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
eq('点技能格1 无副作用对象', inp4.tapSkill(1).length, 0);
eq('进入瞄准', inp4.selected, 1);
eq('瞄准文案', inp4.message, '半月斬：點戰場選目標（再點技能格取消）。');
inp4.tapSkill(1);
eq('同格再点 → 取消', inp4.selected, null);
eq('取消文案', inp4.message, '已取消瞄準。');
inp4.tapSkill(1);
const tgt4 = enemyCenter(W4);
const fxLen4 = W4.fx.length;
const eff4 = inp4.tapField(tgt4.x, tgt4.y);
eq('cast 被调用一次', castCalls, casts4 + 1);
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
ok('飘字落在点击处', floater4 !== undefined && floater4.floater.x === tgt4.x && floater4.floater.y === tgt4.y);
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
eq('endReason=retreat', W6.endReason, 'retreat');
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

section('G10 突擊：只出提示、不碰 world');
const W8 = newWorld(8080);
const inp8 = new BI.BattleInput();
inp8.bind(W8);
const fp8 = fingerprint(W8);
const casts8 = castCalls;
const retreats8 = retreatCalls;
eq('突擊命中 type', inp8.hitTest(assaultC.x, assaultC.y, CAM).type, 'assault');
eq('点突擊无副作用对象', inp8.tap(assaultC.x, assaultC.y, CAM).length, 0);
eq('突擊文案与 web 一致', inp8.message, '突擊：v2 未接。');
eq('ASSAULT_NOTE 常量', BI.ASSAULT_NOTE, '突擊：v2 未接。');
eq('world 指纹完全不变', fingerprint(W8), fp8);
eq('没调 cast', castCalls, casts8);
eq('没调 requestRetreat', retreatCalls, retreats8);
eq('直调 tapAssault 同样无副作用', inp8.tapAssault().length, 0);
eq('直调后指纹仍不变', fingerprint(W8), fp8);

// ---------------------------------------------------------------------------
// G11 瞄准：moveAim 只在选中 + 战场带内更新
// ---------------------------------------------------------------------------

section('G11 瞄准落点：moveAim / cancelAim');
const W9 = newWorld(9090);
const inp9 = new BI.BattleInput();
inp9.bind(W9);
inp9.moveAim(375, 550, CAM);
eq('未选中时 aim=null', inp9.aim, null);
inp9.tapSkill(2);
ok('点技能格2 进入瞄准', inp9.selected === 2, inp9.selected);
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
