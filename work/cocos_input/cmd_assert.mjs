#!/usr/bin/env node
/**
 * `cmd_assert.mjs` —— Cocos 战斗页「指令台」几何 / 命中 / 文案断言。
 *
 * 覆盖 web 版 `game\src\view\battleView.ts` 的操作台三件套：
 *   ① 右列 6 颗第一层指令按钮（cmd6Rects）
 *   ② 第二层 6 行部队指令菜单（ARMY_MENU_RECT + armyCmdRects）
 *   ③ 左列 突擊 / 撤退 两颗 chip
 *   ④ 8 格技能格（skillSlotRects(8)，4×2 版）
 *
 * 断言口径（每条都对真源码跑，不 mock 业务逻辑）：
 *   - 矩形不重叠、都在 750×1334 设计区（控制台 y≥999）内；
 *   - 用 `BattleInput.hitTest()` 点矩形中心，返回的 type/slot/label/kind 对得上；
 *   - 第二层展开（menuOpen=true）时，被面板盖住的第 3~6 颗必须返回 `armyCmd`，
 *     6 行也必须返回 `armyCmd`（web battleView.ts:2068-2131 的命中顺序语义）；
 *   - 可用性一律取内核 `canUseArmyCmd()` / `cmd6Usable()` 的结果，UI 不自己判。
 *
 * `cc` 仍是哨兵 mock：真被执行就抛错，用来证明这条链一次都没碰引擎。
 *
 * 用法：`node work\cocos_input\cmd_assert.mjs`（退出码 0 = 全过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCRIPTS = path.join(REPO, 'game', 'cocos', 'assets', 'scripts');
const BUILD = path.join(HERE, '.build_cmd');
const MOCK_CC = path.join(HERE, 'mock', 'cc', 'index.cjs');

// ---------------------------------------------------------------------------
// 0. 把真源码编成 CJS（BattleInput + BattleCmdUi，依赖自动带出来）
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

function build() {
  const ts = loadTypeScript();
  fs.rmSync(BUILD, { recursive: true, force: true });
  const rootNames = [path.join(SCRIPTS, 'BattleInput.ts'), path.join(SCRIPTS, 'BattleCmdUi.ts')];
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
// 1. `cc` 哨兵
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
const army = require(path.join(BUILD, 'core', 'army_cmd.js'));
const BI = require(path.join(BUILD, 'BattleInput.js'));
const CM = require(path.join(BUILD, 'BattleCmdUi.js'));

// BattleCmdUi 只吃设计坐标，不需要 magic_so；但 world 要真建。
globalThis.location = { href: 'https://cocos.local/' };
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
// 3. 几何工具
// ---------------------------------------------------------------------------

const DESIGN_W = 750;
const DESIGN_H = 1334;
const CONSOLE_TOP = 999; // BattleRoot.redrawBase() 的控制台底色从 y=999 起
const CAM = 35;

const inDesign = (r) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= DESIGN_W && r.y + r.h <= DESIGN_H;
const inConsole = (r) => r.y >= CONSOLE_TOP && inDesign(r);
const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const fmt = (r) => `{${r.x},${r.y},${r.w},${r.h}}`;

/** 一组矩形两两不重叠，逐对报名字。 */
function noOverlap(label, rects, names) {
  let bad = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlap(rects[i], rects[j])) {
        bad += 1;
        ok(`${label}：${names[i]} 与 ${names[j]} 不重叠`, false, `${fmt(rects[i])} ∩ ${fmt(rects[j])}`);
      }
    }
  }
  if (bad === 0) ok(`${label}：${rects.length} 块两两不重叠`, true);
}

// ---------------------------------------------------------------------------
// 4. 夹具：真世界 + 真 hits
// ---------------------------------------------------------------------------

function newWorld(seed, general) {
  return core.createWorld({
    data,
    seed,
    a: {
      troop: 2,
      formation: 0,
      soldiers: 100,
      morale: 60,
      strategy: null,
      general: general ?? { name: '無名將', str: 97, int: 75, level: 6 },
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

const W = newWorld(9001);
// 8 格技能：Lv6 只有 1~2 格，这里给命中测试合成 8 条已知技能，
// 几何/命中与数据无关（web 的 skillSlotRects(count) 只看数量）。
const SLOTS8 = [];
for (let i = 0; i < 8; i++) {
  SLOTS8.push({ seq: 1 + i, name: `技${i + 1}`, mp: 1, qi: 1200, kind: 'strike', dir: 1, ttl: 10 });
}
const ctxOf = (slots, menuOpen = false, mode = 'fighting') => ({
  world: W,
  slots,
  mode,
  camX: CAM,
  menuOpen,
});
const hit = (tx, ty, opts) => BI.hitTest(ctxOf(SLOTS8, opts?.menuOpen ?? false), tx, ty, opts);

// ---------------------------------------------------------------------------
// 5. 断言
// ---------------------------------------------------------------------------

// === A 编译与隔离 ==========================================================
section('A 编译与 cc 隔离');
eq('编译错误数（忽略 TS2307）', buildInfo.errors, 0);
eq('整条链没 require("cc")', ccResolved, 0);
for (const f of ['BattleCmdUi.js', 'BattleInput.js']) {
  const src = fs.readFileSync(path.join(BUILD, f), 'utf8');
  ok(`${f} 产物里没有 require("cc")`, !/require\(\s*["']cc["']\s*\)/.test(src));
}
ok('BattleCmdUi 源码不 import cc', !/\bfrom\s+['"]cc['"]/.test(
  fs.readFileSync(path.join(SCRIPTS, 'BattleCmdUi.ts'), 'utf8'),
));
eq('MAX_SKILL_SLOTS=8', BI.MAX_SKILL_SLOTS, 8);

// === B 第一层 6 颗 =========================================================
section('B 第一层 6 颗指令按钮：几何 + 命中');
const R6 = CM.cmd6Rects();
eq('cmd6 数量', R6.length, 6);
eq('CMD6_COUNT=6', CM.CMD6_COUNT, 6);
for (let i = 0; i < R6.length; i++) {
  ok(`第${i + 1}颗在 750×1334 内`, inDesign(R6[i]), fmt(R6[i]));
  ok(`第${i + 1}颗在控制台区（y≥999）`, inConsole(R6[i]), fmt(R6[i]));
  eq(`第${i + 1}颗尺寸 100×84`, `${R6[i].w}x${R6[i].h}`, '100x84');
}
noOverlap('第一层 6 颗', R6, ['A', 'S', 'D', 'F', 'G', 'H']);
eq('列 x = 524 / 632', `${R6[0].x},${R6[1].x}`, '524,632');
eq('行 y = 1030 / 1124 / 1218', `${R6[0].y},${R6[2].y},${R6[4].y}`, '1030,1124,1218');

const DEFS = CM.cmd6Defs(W);
eq('cmd6Defs 数量', DEFS.length, 6);
eq('键位 A/S/D/F/G/H', DEFS.map((d) => d.key).join(''), 'ASDFGH');
eq(
  'kind 顺序',
  DEFS.map((d) => d.kind).join(','),
  'guardLord,armyMenu,skillPage,sortie,lordOrder,retreat',
);
for (let i = 0; i < 6; i++) {
  const c = center(R6[i]);
  const h = hit(c.x, c.y);
  eq(`第${i + 1}颗中心 type`, h && h.type, 'cmd6');
  eq(`第${i + 1}颗中心 btn`, h && h.btn, i);
  eq(`第${i + 1}颗中心 kind`, h && h.kind, DEFS[i].kind);
  eq(`第${i + 1}颗中心 label`, h && h.label, DEFS[i].label);
  ok(`第${i + 1}颗 label 非空`, typeof (h && h.label) === 'string' && h.label.length >= 3, h && h.label);
  ok(`第${i + 1}颗 sub 非空`, DEFS[i].sub.length >= 3, DEFS[i].sub);
  // canUse 必须是内核结论，不是页面自己算的
  const use = CM.cmd6Usable(W, i, { fighting: true, skillCount: SLOTS8.length });
  eq(`第${i + 1}颗 canUse === cmd6Usable`, h && h.canUse, use.ok);
}
eq('第 1/2 颗之间的 8px 空隙不命中按钮', hit(628, 1072), null);
eq('按钮列右侧（x>740）不命中', hit(746, 1072), null);

// === C 第二层 6 行 =========================================================
section('C 第二层部队指令菜单：面板 + 6 行');
const PANEL = CM.ARMY_MENU_RECT;
ok('面板在 750×1334 内', inDesign(PANEL), fmt(PANEL));
ok('面板在控制台区（y≥999）', inConsole(PANEL), fmt(PANEL));
eq('面板 512,1116,228,216', `${PANEL.x},${PANEL.y},${PANEL.w},${PANEL.h}`, '512,1116,228,216');
const RR = CM.armyCmdRects();
eq('菜单行数', RR.length, 6);
for (let i = 0; i < RR.length; i++) {
  ok(`第${i + 1}行在面板内`, RR[i].x >= PANEL.x && RR[i].y >= PANEL.y
    && RR[i].x + RR[i].w <= PANEL.x + PANEL.w
    && RR[i].y + RR[i].h <= PANEL.y + PANEL.h, fmt(RR[i]));
  ok(`第${i + 1}行在 750×1334 内`, inDesign(RR[i]), fmt(RR[i]));
  eq(`第${i + 1}行尺寸 220×33`, `${RR[i].w}x${RR[i].h}`, '220x33');
}
noOverlap('第二层 6 行', RR, ['1', '2', '3', '4', '5', '6']);
eq('行 x=516', RR[0].x, 516);
eq('行 y=1119+i*36', `${RR[0].y},${RR[5].y}`, '1119,1299');

const ITEMS = CM.armyMenuItems(W);
eq('armyMenuItems 数量', ITEMS.length, 6);
for (let i = 0; i < 6; i++) {
  const it = ITEMS[i];
  ok(`第${i + 1}行有新指令数据`, !!it, String(it));
  if (!it) continue;
  eq(`第${i + 1}行 slot`, it.slot, i);
  const chk = army.canUseArmyCmd(W, 'A', i);
  eq(`第${i + 1}行 ok === canUseArmyCmd`, it.ok, chk.ok);
  eq(`第${i + 1}行 reason === canUseArmyCmd.reason`, it.reason ?? null, chk.reason ?? null);
  eq(`第${i + 1}行初始未下令`, it.ordered, false);
  ok(`第${i + 1}行 label 与内核 armyCmdsOf 一致`, it.label === army.armyCmdsOf(0)[i].label,
    `${it.label} vs ${army.armyCmdsOf(0)[i].label}`);
}
eq('展开前点面板区域 = 第一层命中（不会凭空返回 armyCmd）',
  hit(574, 1166) && hit(574, 1166).type, 'cmd6');

for (let i = 0; i < 6; i++) {
  const c = center(RR[i]);
  const h = hit(c.x, c.y, { menuOpen: true });
  eq(`展开后第${i + 1}行中心 type`, h && h.type, 'armyCmd');
  eq(`展开后第${i + 1}行中心 slot`, h && h.slot, i);
  eq(`展开后第${i + 1}行中心 label`, h && h.label, ITEMS[i].label);
  eq(`展开后第${i + 1}行中心 kind`, h && h.kind, ITEMS[i].kind);
  eq(`展开后第${i + 1}行 canUse === 内核`, h && h.canUse, ITEMS[i].ok);
}
// 面板盖住第一层第 2/3 行：展开时第 3~6 颗中心必须回 armyCmd
for (let i = 2; i < 6; i++) {
  const c = center(R6[i]);
  const h = hit(c.x, c.y, { menuOpen: true });
  eq(`展开时第${i + 1}颗被面板盖住 → armyCmd`, h && h.type, 'armyCmd');
  ok(`展开时第${i + 1}颗回的是行号（slot 数字）`, typeof (h && h.slot) === 'number', h && h.slot);
}
ok('面板 y 覆盖第 2 行按钮（1124..1208）', PANEL.y < 1124 && PANEL.y + PANEL.h > 1124);
ok('面板 y 覆盖第 3 行按钮（1218..1302）', PANEL.y < 1218 && PANEL.y + PANEL.h > 1302);
{
  const blank = hit(514, 1200, { menuOpen: true });
  eq('面板内空白（行外）→ armyMenu', blank && blank.type, 'armyMenu');
  const outside = hit(300, 400, { menuOpen: true });
  eq('面板外点 → 落到战场 field', outside && outside.type, 'field');
}

// === D 左列 2 颗 chip ======================================================
section('D 左列突擊 / 撤退 chip');
const CA = CM.CHIP_ASSAULT;
const CR = CM.CHIP_RETREAT;
ok('CHIP_ASSAULT 在 750×1334 内', inDesign(CA), fmt(CA));
ok('CHIP_RETREAT 在 750×1334 内', inDesign(CR), fmt(CR));
eq('突擊 18,1128,88,84', `${CA.x},${CA.y},${CA.w},${CA.h}`, '18,1128,88,84');
eq('撤退 18,1218,88,84', `${CR.x},${CR.y},${CR.w},${CR.h}`, '18,1218,88,84');
ok('突擊 / 撤退 不重叠', !overlap(CA, CR));
ok('突擊 chip 与第一层 6 颗不重叠', R6.every((r) => !overlap(CA, r)));
ok('撤退 chip 与第一层 6 颗不重叠', R6.every((r) => !overlap(CR, r)));
ok('突擊 chip 与第二层面板不重叠', !overlap(CA, PANEL));
ok('撤退 chip 与第二层面板不重叠', !overlap(CR, PANEL));
eq('突擊 chip 中心 type', (hit(center(CA).x, center(CA).y) || {}).type, 'assault');
eq('撤退 chip 中心 type', (hit(center(CR).x, center(CR).y) || {}).type, 'retreat');
eq('展开第二层时突擊 chip 仍可点', (hit(center(CA).x, center(CA).y, { menuOpen: true }) || {}).type, 'assault');

const chipA = CM.assaultChip(W);
const chipR = CM.retreatChip(W);
eq('突擊 chip label', chipA.label, '突 擊');
eq('突擊 chip sub（未冲）', chipA.sub, '全軍突擊');
eq('突擊 chip canUse === canUseArmyCmd(rush 槽)', chipA.ok,
  army.canUseArmyCmd(W, 'A', CM.rushSlotOf(0)).ok);
eq('撤退 chip label', chipR.label, '撤 退');
eq('撤退 chip sub（未撤）', chipR.sub, '全軍離場');
eq('撤退 chip canUse === canUseArmyCmd(retreat 槽)', chipR.ok,
  army.canUseArmyCmd(W, 'A', 5).ok);

const WR = newWorld(9002);
core.allRush(WR, 'A');
eq('突擊后 sub=突擊中', CM.assaultChip(WR).sub, '突擊中');
eq('突擊后 ok=false（内核幂等）', CM.assaultChip(WR).ok, false);
const WF = newWorld(9003);
core.requestRetreat(WF, 'A');
eq('撤退后 sub=撤退中', CM.retreatChip(WF).sub, '撤退中');
eq('撤退后 ok=false', CM.retreatChip(WF).ok, false);
const WO = newWorld(9004);
WO.over = true;
WO.settled = true;
eq('战斗结束：撤退 chip 禁用原因来自内核', CM.retreatChip(WO).reason, '戰鬥已結束');
eq('战斗结束：突擊 chip 也禁用', CM.assaultChip(WO).ok, false);

// === E 8 格技能格 ==========================================================
section('E 8 格技能格（4×2 版）');
const RS = BI.skillSlotRects(8);
eq('8 格数量', RS.length, 8);
for (let i = 0; i < RS.length; i++) {
  ok(`第${i + 1}格在 750×1334 内`, inDesign(RS[i]), fmt(RS[i]));
  eq(`第${i + 1}格尺寸 88×56`, `${RS[i].w}x${RS[i].h}`, '88x56');
}
noOverlap('8 格技能格', RS, ['1', '2', '3', '4', '5', '6', '7', '8']);
eq('第 1 行 y=1100', RS[0].y, 1100);
eq('第 2 行 y=1162', RS[4].y, 1162);
eq('列 x = 116/214/312/410', `${RS[0].x},${RS[1].x},${RS[2].x},${RS[3].x}`, '116,214,312,410');
ok('技能格与第一层 6 颗不重叠', RS.every((s) => R6.every((r) => !overlap(s, r))));
ok('技能格与第二层面板不重叠', RS.every((s) => !overlap(s, PANEL)));
ok('技能格与两颗 chip 不重叠', RS.every((s) => !overlap(s, CA) && !overlap(s, CR)));
for (let i = 0; i < 8; i++) {
  const c = center(RS[i]);
  const h = hit(c.x, c.y);
  eq(`第${i + 1}格中心 type`, h && h.type, 'skill');
  eq(`第${i + 1}格中心 index`, h && h.index, i);
  eq(`第${i + 1}格中心 seq`, h && h.seq, SLOTS8[i].seq);
}
eq('第 4 格右侧（x>498）不命中技能格', hit(502, 1128), null);
eq('≤4 格时仍走老版式（88×88）', `${BI.skillSlotRects(4)[0].w}x${BI.skillSlotRects(4)[0].h}`, '88x88');

// === F buildCmdUi 渲染模型 =================================================
section('F buildCmdUi 渲染模型');
const M0 = CM.buildCmdUi(W, { menuOpen: false, mode: 'fighting', skillCount: 8 });
ok('模型有控件', M0.items.length > 0, M0.items.length);
const ids0 = M0.items.map((it) => it.id);
eq('id 不重复', new Set(ids0).size, ids0.length);
eq('menuOpen=false 时不出现第二层', ids0.some((id) => id.startsWith('army.')), false);
for (const must of ['chip.assault.bg', 'chip.assault.label', 'chip.assault.sub',
  'chip.retreat.bg', 'chip.retreat.label', 'chip.retreat.sub',
  'gen.stats', 'gen.hp', 'gen.mp']) {
  ok(`模型含 ${must}`, ids0.includes(must));
}
for (let i = 0; i < 6; i++) {
  for (const suffix of ['bg', 'key', 'label', 'sub']) {
    ok(`模型含 cmd6.${i}.${suffix}`, ids0.includes(`cmd6.${i}.${suffix}`));
  }
}
ok('menuOpen=false 时无 cmd6.1.sel', !ids0.includes('cmd6.1.sel'));
const bgs = M0.items.filter((it) => it.kind === 'bg');
ok('所有底图都在 750×1334 内', bgs.every((b) => inDesign(b.rect)), bgs.map((b) => fmt(b.rect)).join(' '));
ok('所有底图都落在控制台区（y≥999）', bgs.every((b) => inConsole(b.rect)));
const txt = M0.items.filter((it) => it.kind === 'text');
ok('所有文字都在控制台区（y 1010..1334）',
  txt.every((t) => t.y > 1010 && t.y < 1334), txt.filter((t) => !(t.y > 1010 && t.y < 1334)).map((t) => t.id).join(','));
ok('文字颜色都是 #RRGGBB / rgba', txt.every((t) => /^(#[0-9A-Fa-f]{6}|rgba?\()/.test(t.color)), txt[0] && txt[0].color);
ok('文字字号都在 9..24（控制台口径）', txt.every((t) => t.size >= 9 && t.size <= 24), txt.map((t) => t.size).join(','));
ok('六颗按钮文案都非空', [0, 1, 2, 3, 4, 5].every((i) => {
  const it = M0.items.find((x) => x.id === `cmd6.${i}.label`);
  return it && it.text.length >= 2;
}));

const M1 = CM.buildCmdUi(W, { menuOpen: true, mode: 'fighting', skillCount: 8 });
const ids1 = M1.items.map((it) => it.id);
ok('展开后有 army.panel', ids1.includes('army.panel'));
eq('展开后 menuOpen 标记', M1.menuOpen, true);
for (let i = 0; i < 6; i++) {
  for (const suffix of ['bg', 'no', 'label', 'right']) {
    ok(`展开后含 army.${i}.${suffix}`, ids1.includes(`army.${i}.${suffix}`));
  }
}
ok('展开后第 2 颗有选中层 cmd6.1.sel', ids1.includes('cmd6.1.sel'));
{
  const order = (m) => m.items.map((i) => i.id);
  const o1 = order(M1);
  ok('面板排在 6 颗按钮之后（盖住第一层）',
    o1.indexOf('army.panel') > o1.indexOf('cmd6.5.bg'), `${o1.indexOf('army.panel')} vs ${o1.indexOf('cmd6.5.bg')}`);
  ok('面板排在 chip 之后',
    o1.indexOf('army.panel') > o1.indexOf('chip.retreat.bg'));
  ok('技能格不参与绘制（HUD 自绘 8 格）', !ids1.some((id) => id.startsWith('skill.')));
}
// 面板/行必须是**实色底衬**：九宫皮肤中间镂空，只铺边框会让第一层第 2/3 行透出来
// （真机 h02 就是这么发现的：面板底下还能看见 D/F/G/H 的白字）
{
  const panel = M1.items.find((it) => it.id === 'army.panel');
  eq('面板有底衬 fillAlpha（web rgba(8,10,14,.96)）', panel && panel.fillAlpha, 245);
  eq('面板底衬色', panel && panel.fillColor, '#080A0E');
  const row0 = M1.items.find((it) => it.id === 'army.0.bg');
  eq('行底衬不透明', row0 && row0.fillAlpha, 255);
  eq('可用行底衬 alpha=255（不再半透）', row0 && row0.alpha, 255);
  ok('行底衬有颜色', !!(row0 && row0.fillColor));
  const M3 = CM.buildCmdUi(Object.assign(newWorld(9008), { over: true }), {
    menuOpen: true,
    mode: 'settled',
    skillCount: 8,
  });
  const row3 = M3.items.find((it) => it.id === 'army.0.bg');
  ok('不可用行底衬色与可用行不同（panel vs panelHi）', row3 && row3.fillColor !== (row0 && row0.fillColor),
    `${row3 && row3.fillColor} vs ${row0 && row0.fillColor}`);
  const cmd6bg = M1.items.find((it) => it.id === 'cmd6.0.bg');
  ok('第一层按钮不加底衬（保持九宫皮肤观感）', cmd6bg && cmd6bg.fillAlpha === undefined);
  const chipbg = M1.items.find((it) => it.id === 'chip.assault.bg');
  ok('chip 不加底衬', chipbg && chipbg.fillAlpha === undefined);
}
// 下令后 ordered 态：右侧文案变「已下令」，行底加选中层
const W2 = newWorld(9005);
army.applyArmyCmd(W2, 'A', 0);
const M2 = CM.buildCmdUi(W2, { menuOpen: true, mode: 'fighting', skillCount: 8 });
const right0 = M2.items.find((it) => it.id === 'army.0.right');
eq('下令后第 1 行右侧文案', right0 && right0.text, '已下令');
ok('下令后第 1 行有选中层', M2.items.some((it) => it.id === 'army.0.sel'));
const M2c = CM.buildCmdUi(W2, { menuOpen: true, mode: 'fighting', skillCount: 8 });
eq('模型可重复构建（幂等）', M2c.items.length, M2.items.length);

// === G 主将 HUD 与行动条口径 ===============================================
section('G 主将 HUD 文案 + 行动条（web battleView.ts 口径）');
eq('vitalText 體 四舍五入向上', CM.vitalText('體', 96.4, 120), '體 97/120');
eq('vitalText 技 下限 0', CM.vitalText('技', -3, 60), '技 0/60');
eq('vitalText 上限也 ceil', CM.vitalText('技', 12, 60.2), '技 12/61');
{
  const g = core.createWorld({
    data, seed: 9006,
    a: { troop: 2, formation: 0, soldiers: 100, morale: 60, strategy: null, general: { name: '無名將', str: 97, int: 75, level: 6 } },
    b: { troop: 10, formation: 3, soldiers: 100, morale: 60, strategy: null, general: { name: '張角', str: 70, int: 88, level: 5 } },
    aiSides: { B: true },
  });
  const gu = CM.generalUnitOf(g, 'A');
  ok('generalUnitOf(A) 找到主将', !!gu && gu.isGeneral === true);
  gu.cd = 0;
  const act = CM.actionGaugeOf(gu);
  eq('主将 interval=40', act.interval, 40);
  eq('主将 slow=46（GENERAL_SLOW_INTERVAL）', act.slow, 46);
  near('主将 mark=40/46', act.mark, 40 / 46, 1e-9);
  // web 语义：条走到 mark 才轮到主将，所以 cd=0（可行动）时 ratio 就是 mark
  near('cd=0（可行动）时 ratio=mark=40/46', act.ratio, 40 / 46, 1e-9);
  gu.cd = 20;
  near('cd=20 时 ratio=(40-20)/46', CM.actionGaugeOf(gu).ratio, 20 / 46, 1e-9);
  gu.cd = 40;
  near('cd=40（刚行动完）ratio=0', CM.actionGaugeOf(gu).ratio, 0, 1e-9);
  gu.cd = 999;
  eq('cd 超量程时 remain 被夹到 interval', CM.actionGaugeOf(gu).remain, 40);
  near('cd 超量程时 ratio=0', CM.actionGaugeOf(gu).ratio, 0, 1e-9);
  const gg = g.sides.A.general;
  eq(
    '主将一行文案 = 武 · 智 · 行',
    CM.generalStatLine(gg, act),
    `武 ${gg.str} · 智 ${gg.int} · 行 ${act.interval - act.remain}/${act.interval}`,
  );
  eq('没有行动条时只写武/智', CM.generalStatLine(gg, null), `武 ${gg.str} · 智 ${gg.int}`);
  const armyUnit = core.createWorld({
    data, seed: 9007,
    a: { troop: 2, formation: 0, soldiers: 100, morale: 60, strategy: null, general: { name: '無名將', str: 97, int: 75, level: 6 } },
    b: { troop: 10, formation: 3, soldiers: 100, morale: 60, strategy: null, general: { name: '張角', str: 70, int: 88, level: 5 } },
    aiSides: { B: true },
  });
  const soldier = armyUnit.units.find((u) => u.side === 'A' && !u.isGeneral);
  if (soldier) {
    soldier.cd = 10;
    const sa = CM.actionGaugeOf(soldier);
    eq('小兵 interval=40', sa.interval, 40);
    eq('小兵 slow=interval（没有 46 慢放）', sa.slow, sa.interval);
  }
}

// === H 与既有 HUD 不打架 ===================================================
section('H 与 BattleHud 老控件的关系');
const HUD_HIDE = ['CmdBtnAssault', 'CmdBtnRetreat', 'CmdLabelAssault', 'CmdSubAssault',
  'CmdLabelRetreat', 'CmdSubRetreat', 'GeneralStats', 'HpValue', 'MpValue'];
const rootSrc = fs.readFileSync(path.join(SCRIPTS, 'BattleRoot.ts'), 'utf8');
for (const name of HUD_HIDE) {
  ok(`BattleRoot.hideLegacyConsole 覆盖 ${name}`, rootSrc.includes(`'${name}'`));
}
ok('BattleRoot 装了 installArmyOrders（否则全軍待機不生效）', /installArmyOrders\(world\)/.test(rootSrc));
ok('BattleRoot 每帧刷新指令台', /this\.syncCmdUi\(world\)/.test(rootSrc));
ok('BattleRoot 用 buildCmdUi 建模型', /buildCmdUi\(/.test(rootSrc));
ok('BattleRoot 画主将行动条', /actionGaugeOf\(/.test(rootSrc));
ok('老 BTN_ASSAULT 已不在 BattleInput 里参与命中', !/BTN_ASSAULT/.test(
  fs.readFileSync(path.join(SCRIPTS, 'BattleInput.ts'), 'utf8'),
));

// ---------------------------------------------------------------------------
// 6. 汇总
// ---------------------------------------------------------------------------

const total = passed + failures.length;
console.log('');
for (const s of sections) console.log(`${s.name.padEnd(48, ' ')} ${String(s.n).padStart(3)} 条`);
console.log('-'.repeat(56));
console.log(`断言总数 ${total} · 通过 ${passed} · 失败 ${failures.length}`);
if (failures.length) {
  console.log('\n失败清单：');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
process.exitCode = failures.length === 0 && total >= 60 ? 0 : 1;
