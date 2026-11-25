#!/usr/bin/env node
/**
 * `hud_assert.mjs` —— Cocos 战斗页 HUD / 结算面板的结构断言（不构建、不出包、不进包）。
 *
 * 思路：真正的 `BattleHud.ts` / `GeneralArt.ts` 用仓库自带的 typescript 编成 CommonJS
 * 到 `work\cocos_battleui\.build\`，把 `cc` 换成 `mock\cc\index.cjs`（Node 树 + Label/Sprite
 * 字段语义），然后在 Node 里**建真实的 HUD 树**，遍历节点断言：
 *
 *   ① 4 个技能格 + 2 个命令按钮 + 消息栏 + 头像框都在，且挂的是 `Sprite.Type.SLICED`；
 *      4 条分隔线/结算框是 TILED/SLICED、九宫内缩等于 `HUD_INSET`（= 原图边框宽度）；
 *   ② `applyTextRole()` 四级的 fontSize / 描边宽度 / 投影，以及树里各 Label 实际生效的角色；
 *   ③ 结算面板 6 行数据键全部渲染，且值/经验条/再战按钮文案都在；
 *   ④ 防回归：`GenAHorse/GenABody/GenAWeapon`（+ B 侧）三层还在，`Unit_${index}` 士兵池、
 *      结算调用链没被 HUD 改动碰过，`labelGeneral` 已彻底消失。
 *
 * 用法：`node work\cocos_battleui\hud_assert.mjs`（退出码 0 = 全过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCRIPTS = path.join(REPO, 'game', 'cocos', 'assets', 'scripts');
const BUILD = path.join(HERE, '.build');
const MOCK_CC = path.join(HERE, 'mock', 'cc', 'index.cjs');
const WEB_TEX = path.join(REPO, 'game', 'web', 'assets', 'battleui');
const RES_TEX = path.join(REPO, 'game', 'cocos', 'assets', 'bundles', 'res', 'ui', 'battle');

// ---------------------------------------------------------------------------
// 0. 把真源码编成 CJS
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
  const rootNames = [path.join(SCRIPTS, 'BattleHud.ts'), path.join(SCRIPTS, 'GeneralArt.ts')];
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
    // 不把 3.3MB 的引擎 d.ts 塞进 program：`cc` 解析不到只会产生 TS2307，
    // 但 CJS 产物里的 `require('cc')` 原样保留，运行期由 mock 接管。
    noResolve: false,
  };
  const program = ts.createProgram(rootNames, options);
  const result = program.emit();
  if (result.emitSkipped) throw new Error('tsc emit 被跳过（语法错误？）');
  const diag = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (!fs.existsSync(path.join(BUILD, 'BattleHud.js'))) throw new Error('没有产出 .build/BattleHud.js');
  let emitted = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) emitted += 1;
    }
  };
  walk(BUILD);
  return { emitted, errors: diag.length };
}

/**
 * 去注释（字符串/模板串里的 `//` `/*` 不能当注释，比如 `'載入 data/*.json'`）。
 *
 * 只是为了让「文档里提到某个 API 名字」不被误判成「代码里调用了它」。
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = src[i];
        out += c;
        i += 1;
        if (c === '\\') {
          if (i < n) {
            out += src[i];
            i += 1;
          }
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. 拦掉 `cc` → mock（必须在 require 产物之前装好）
// ---------------------------------------------------------------------------

const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  if (request === 'cc') return MOCK_CC;
  return originalResolve.call(this, request, ...rest);
};

const buildInfo = build();

const cc = require(MOCK_CC);
const hudMod = require(path.join(BUILD, 'BattleHud.js'));
const artMod = require(path.join(BUILD, 'GeneralArt.js'));

const { BattleHud, TEXT_ROLES, applyTextRole, HUD_ART_SPEC, HUD_INSET, HUD_TEXES, DEFAULT_SKILL_SEQ, HUD_UI_DIR } = hudMod;
const { GeneralArt } = artMod;

// ---------------------------------------------------------------------------
// 断言小工具
// ---------------------------------------------------------------------------

const failures = [];
let checks = 0;
let group = '';
/** 按 section 分组的通过数（报告里要贴分组表）。 */
const groupTally = new Map();

function section(title) {
  group = title;
}

function check(name, cond, detail = '') {
  checks += 1;
  const key = group || '(未分组)';
  const tally = groupTally.get(key) ?? { pass: 0, fail: 0 };
  if (cond) tally.pass += 1;
  else {
    tally.fail += 1;
    failures.push(`[${group}] ${name}${detail ? ` — ${detail}` : ''}`);
  }
  groupTally.set(key, tally);
}

function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

function findNode(node, name) {
  if (!node) return null;
  if (node.name === name) return node;
  for (const child of node.children) {
    const hit = findNode(child, name);
    if (hit) return hit;
  }
  return null;
}

function collectLabels(node, out = []) {
  if (!node) return out;
  const label = node.getComponent(cc.Label);
  if (label) out.push({ node, label });
  for (const child of node.children) collectLabels(child, out);
  return out;
}

function labelOf(root, name) {
  const node = findNode(root, name);
  return node ? node.getComponent(cc.Label) : null;
}

function spriteOf(root, name) {
  const node = findNode(root, name);
  return node ? node.getComponent(cc.Sprite) : null;
}

function sizeOf(root, name) {
  const node = findNode(root, name);
  const transform = node ? node.getComponent(cc.UITransform) : null;
  return transform ? transform.contentSize : null;
}

/**
 * 断言某个 Label 的「边」落在屏幕 x = expected 处。
 *
 * 左对齐给的是框左边、右对齐给的是框右边、居中给的是框中心（锚点 0.5）。
 * 这条专门防「placeOn 把边当中心用」那种错位：宽 560 的框错位 280px 会让整行飞出屏幕。
 */
function checkEdge(root, nodeName, edge, expected) {
  const node = findNode(root, nodeName);
  if (!node) {
    check(`${nodeName} 存在（对齐）`, false, '节点没找到');
    return;
  }
  const transform = node.getComponent(cc.UITransform);
  const width = transform ? transform.width : 0;
  // 局部坐标逐级累加（技能格里的字是 SkillSlotN 的子节点，父节点在格子中心）
  let worldX = 0;
  for (let cur = node; cur; cur = cur.parent) worldX += cur.position.x;
  const centerScreen = worldX + 375;
  const actual =
    edge === 'left' ? centerScreen - width / 2 : edge === 'right' ? centerScreen + width / 2 : centerScreen;
  check(
    `${nodeName} ${edge} 边 = ${expected}`,
    Math.abs(actual - expected) <= 0.51,
    `实际 ${actual.toFixed(1)}（宽 ${width}）`,
  );
}

// ---------------------------------------------------------------------------
// 2. 建 HUD 树
// ---------------------------------------------------------------------------

const sceneRoot = new cc.Node('BattleRoot');
const hud = new BattleHud(sceneRoot);

function fakeFrame(tex) {
  const frame = new cc.SpriteFrame();
  frame.name = `res/ui/battle/${tex}`;
  frame.rect = new cc.Rect(0, 0, 34, 34);
  frame.originalSize = new cc.Size(34, 34);
  return frame;
}

const frames = {};
for (const tex of HUD_TEXES) frames[tex] = fakeFrame(tex);
hud.applyFrames(frames);

// ---------------------------------------------------------------------------
// ① HUD 九宫化
// ---------------------------------------------------------------------------

section('① 九宫节点');
eq('root 节点名', hud.root.name, 'BattleHud');
check('控制台组存在', !!findNode(hud.root, 'HudConsole'));
check('结算层存在', !!findNode(hud.root, 'SettleLayer'));
eq('九宫图描述条数', HUD_ART_SPEC.length, 12);
eq('需要加载的素材张数', HUD_TEXES.length, 7);

const SLICED = 1;
const TILED = 2;

/** 从 mock frame 的 name（`res/ui/battle/slot`）反查它用的是哪张图。 */
function texOf(frame) {
  if (!frame || typeof frame.name !== 'string') return null;
  const base = frame.name.split('/').pop();
  return HUD_TEXES.includes(base) ? base : null;
}

for (const spec of HUD_ART_SPEC) {
  const sprite = spriteOf(hud.root, spec.name);
  check(`节点 ${spec.name} 存在且挂了 Sprite`, !!sprite);
  if (!sprite) continue;
  eq(`${spec.name} 的 sprite.type`, sprite.type, spec.mode === 'tiled' ? TILED : SLICED);
  const size = sizeOf(hud.root, spec.name);
  eq(`${spec.name} 宽`, size?.width, spec.rect.w);
  eq(`${spec.name} 高`, size?.height, spec.rect.h);
  check(`${spec.name} 已铺图`, !!sprite.spriteFrame, 'applyFrames() 之后 spriteFrame 仍是 null');
  const tex = texOf(sprite.spriteFrame);
  check(`${spec.name} 的图来自 ${HUD_UI_DIR}/`, tex !== null, `frame.name=${sprite.spriteFrame?.name}`);
  if (!tex) continue;
  // 两态节点（技能格 slot/slot_off、撤退 cmd_on/cmd_off）此刻挂哪张图，内缩就按哪张算
  eq(`${spec.name} 左内缩 = HUD_INSET.${tex}`, sprite.spriteFrame.insetLeft, HUD_INSET[tex]);
  eq(`${spec.name} 右内缩 = HUD_INSET.${tex}`, sprite.spriteFrame.insetRight, HUD_INSET[tex]);
  eq(`${spec.name} 上内缩 = HUD_INSET.${tex}`, sprite.spriteFrame.insetTop, HUD_INSET[tex]);
  eq(`${spec.name} 下内缩 = HUD_INSET.${tex}`, sprite.spriteFrame.insetBottom, HUD_INSET[tex]);
}

// 4 个技能格 / 2 个命令按钮 / 消息栏 / 头像框：显式点名（任务验收项①）
for (let i = 0; i < 4; i += 1) {
  const name = `SkillSlot${i + 1}`;
  const sprite = spriteOf(hud.root, name);
  check(`${name} 存在`, !!sprite);
  eq(`${name} 是 SLICED`, sprite?.type, SLICED);
  check(`${name} 槽位矩形来自 skillSlotRect(${i})`, sizeOf(hud.root, name)?.width === 88);
}
check('CmdBtnAssault 是 SLICED', spriteOf(hud.root, 'CmdBtnAssault')?.type === SLICED);
check('CmdBtnRetreat 是 SLICED', spriteOf(hud.root, 'CmdBtnRetreat')?.type === SLICED);
check('MsgBox 是 SLICED', spriteOf(hud.root, 'MsgBox')?.type === SLICED);
check('HudPortrait 是 SLICED', spriteOf(hud.root, 'HudPortrait')?.type === SLICED);
check('SepTop 是 TILED', spriteOf(hud.root, 'SepTop')?.type === TILED);
check('SepBottom 是 TILED', spriteOf(hud.root, 'SepBottom')?.type === TILED);
check('SettleFrame 是 SLICED', spriteOf(hud.root, 'SettleFrame')?.type === SLICED);
check('SettleSep 是 TILED', spriteOf(hud.root, 'SettleSep')?.type === TILED);

// 头像框是「定尺寸框 + Label 叠在上面」：框里的「將」和 Lv 必须是该框节点的兄弟/子节点
const portraitNode = findNode(hud.root, 'HudPortrait');
check('头像框里有「將」', !!findNode(hud.root, 'PortraitGlyph'));
check('头像框里有 Lv 角标', !!findNode(hud.root, 'PortraitLevel'));
eq('头像框尺寸沿用 PORTRAIT', portraitNode?.getComponent(cc.UITransform)?.width, 86);

// ---------------------------------------------------------------------------
// ② 字体层级
// ---------------------------------------------------------------------------

section('② 字体层级');
const EXPECT = {
  hero: { fontSize: 40, outlineWidth: 2, shadow: true, bold: true, lineHeight: 58 },
  subtitle: { fontSize: 22, outlineWidth: 1, shadow: false, bold: true, lineHeight: 32 },
  body: { fontSize: 18, outlineWidth: 0, shadow: false, bold: false, lineHeight: 26 },
  num: { fontSize: 20, outlineWidth: 1, shadow: false, bold: true, lineHeight: 28 },
  caption: { fontSize: 12, outlineWidth: 0, shadow: false, bold: false, lineHeight: 17 },
};
for (const [role, want] of Object.entries(EXPECT)) {
  const spec = TEXT_ROLES[role];
  check(`角色 ${role} 已定义`, !!spec);
  if (!spec) continue;
  eq(`${role}.fontSize`, spec.fontSize, want.fontSize);
  eq(`${role}.lineHeight`, spec.lineHeight, want.lineHeight);
  eq(`${role}.outlineWidth`, spec.outlineWidth, want.outlineWidth);
  eq(`${role}.shadow`, spec.shadow, want.shadow);
  eq(`${role}.bold`, spec.bold, want.bold);

  // applyTextRole 真的写到了 Label 上（不是只躺在表里）
  const label = new cc.Label();
  applyTextRole(label, role);
  eq(`applyTextRole(${role}).fontSize`, label.fontSize, want.fontSize);
  eq(`applyTextRole(${role}).lineHeight`, label.lineHeight, want.lineHeight);
  eq(`applyTextRole(${role}).isBold`, label.isBold, want.bold);
  eq(`applyTextRole(${role}).enableOutline`, label.enableOutline, want.outlineWidth > 0);
  eq(`applyTextRole(${role}).outlineWidth`, label.outlineWidth, want.outlineWidth);
  eq(`applyTextRole(${role}).enableShadow`, label.enableShadow, want.shadow);
  if (want.shadow) {
    check(`applyTextRole(${role}) 有投影偏移`, label.shadowOffset.x !== 0 || label.shadowOffset.y !== 0);
    check(`applyTextRole(${role}) 有投影色 alpha`, label.shadowColor.a > 0);
  }
  check(`applyTextRole(${role}) 描边色偏深`, label.outlineColor.r < 40 && label.outlineColor.b < 40);
}

// 树里各 Label 的实际字号（挑每个角色一个代表）
const roleSamples = [
  ['SettleTitle', 'hero'],
  ['GeneralName', 'subtitle'],
  ['SettleKey1', 'body'],
  ['SettleVal1', 'num'],
  ['MsgHint', 'caption'],
];
for (const [nodeName, role] of roleSamples) {
  const label = labelOf(hud.root, nodeName);
  check(`节点 ${nodeName} 存在 Label`, !!label);
  if (!label) continue;
  eq(`${nodeName} 用的是 ${role} 字号`, label.fontSize, TEXT_ROLES[role].fontSize);
  eq(`${nodeName} 描边宽度`, label.outlineWidth, TEXT_ROLES[role].outlineWidth);
}

const allLabels = collectLabels(hud.root);
check('HUD 树里有 Label（≥30）', allLabels.length >= 30, `实际 ${allLabels.length}`);
check(
  '所有 Label 都用 SHRINK + 关换行（定宽框才不会被撑成文字宽度）',
  allLabels.every(({ label }) => label.overflow === cc.Label.Overflow.SHRINK && label.enableWrapText === false),
);
check(
  '字号全部落在 4 级 + 角标里（40/22/18/20/12）',
  allLabels.every(({ label }) => [40, 22, 20, 18, 12].includes(label.fontSize)),
);

// ---------------------------------------------------------------------------
// ③ 结算面板 6 行
// ---------------------------------------------------------------------------

section('③ 结算面板');

const magic = (SEQUENCE, NAME, MP, ATTACK) => ({ SEQUENCE, NAME, MP, POWER: 100, ATTACK, ATTRIB: '', SCRIPT: '' });
const data = {
  magics: [magic(1, '旋龍', 22, 0), magic(50, '伏兵班陣', 21, 10), magic(2, '半月斬', 26, 30), magic(104, '神鬼亂舞', 47, 50)],
};
// mp=25：旋龍(22)/伏兵(21) 可用，半月斬(26)/神鬼(47) 不可用 —— 正好覆盖 slot / slot_off 两态
const generalA = { name: '關羽', level: 6, str: 97, int: 75, hp: 96, maxHp: 96, mp: 25, mpMax: 53, qi: 60000, alive: true };
const generalB = { name: '張角', level: 5, str: 70, int: 88, hp: 85, maxHp: 85, mp: 40, mpMax: 60, qi: 30000, alive: true };
const world = {
  tick: 480,
  over: false,
  status: { A: 0, B: 0 },
  fled: { A: false, B: false },
  record: { streak: 0, bestStreak: 2, wins: 0, losses: 0 },
  log: [{ text: '軍師技：火計 生效' }],
  data,
  sides: {
    A: { aliveCount: 88, start: 100, general: generalA },
    B: { aliveCount: 75, start: 100, general: generalB },
  },
};
const launch = { from: 'campaign', defend: false };

hud.refresh(world, null, launch, '火計');

section('① 控制台状态（战斗中）');
eq('GeneralName = 主将名', labelOf(hud.root, 'GeneralName')?.string, '關羽');
eq('GeneralState = 在陣', labelOf(hud.root, 'GeneralState')?.string, '在陣');
eq('GeneralStats = 武/智', labelOf(hud.root, 'GeneralStats')?.string, '武 97 · 智 75');
eq('HpValue', labelOf(hud.root, 'HpValue')?.string, '體 96');
eq('MpValue', labelOf(hud.root, 'MpValue')?.string, '技 25');
eq('QiValue = 氣 50%', labelOf(hud.root, 'QiValue')?.string, '氣 50%');
eq('SkillName1 = 旋龍', labelOf(hud.root, 'SkillName1')?.string, '旋龍');
eq('SkillKind1 = 療', labelOf(hud.root, 'SkillKind1')?.string, '療');
eq('SkillKind4 = 範圍', labelOf(hud.root, 'SkillKind4')?.string, '範圍');
eq('SkillCost1 = 技22 · 氣22%', labelOf(hud.root, 'SkillCost1')?.string, '技22 · 氣22%');
eq('CmdLabelAssault', labelOf(hud.root, 'CmdLabelAssault')?.string, '突 擊');
eq('CmdLabelRetreat', labelOf(hud.root, 'CmdLabelRetreat')?.string, '撤 退');
check('MsgLine1 = 最后一条战场消息', labelOf(hud.root, 'MsgLine1')?.string === '軍師技：火計 生效');
check('MsgLine2 带敌方主将明细', (labelOf(hud.root, 'MsgLine2')?.string ?? '').includes('張角 Lv.5'));
check('MsgHint = 1-4 / R', (labelOf(hud.root, 'MsgHint')?.string ?? '').includes('1-4 / R'));
check('HudMeta 带出征/连胜/军师技', /出征.*連勝 0（最高 2）.*軍師技 火計/.test(labelOf(hud.root, 'HudMeta')?.string ?? ''));
eq('战斗中控制台满不透明', findNode(hud.root, 'HudConsole')?.getComponent(cc.UIOpacity)?.opacity, 255);
eq('战斗中结算层隐藏', findNode(hud.root, 'SettleLayer')?.active, false);

// 对齐：左/右对齐的框必须按「边」落位（见 checkEdge 注释）
checkEdge(hud.root, 'GeneralName', 'left', 116);
checkEdge(hud.root, 'GeneralState', 'right', 366);
checkEdge(hud.root, 'GeneralStats', 'left', 116);
checkEdge(hud.root, 'HpValue', 'right', 358);
checkEdge(hud.root, 'SkillIndex1', 'left', 124);
checkEdge(hud.root, 'MsgLine1', 'left', 128);
checkEdge(hud.root, 'MsgHint', 'right', 496);
checkEdge(hud.root, 'HudMeta', 'right', 734);
checkEdge(hud.root, 'CmdLabelAssault', 'center', 630);

// 技能格两态 + 撤退按钮两态
section('① 技能格两态');
eq('SkillSlot1 可用 → slot.png', spriteOf(hud.root, 'SkillSlot1')?.spriteFrame, frames.slot);
eq('SkillSlot2 可用 → slot.png', spriteOf(hud.root, 'SkillSlot2')?.spriteFrame, frames.slot);
eq('SkillSlot3 技力不足 → slot_off.png', spriteOf(hud.root, 'SkillSlot3')?.spriteFrame, frames.slot_off);
eq('SkillSlot4 技力不足 → slot_off.png', spriteOf(hud.root, 'SkillSlot4')?.spriteFrame, frames.slot_off);
eq('撤退可下 → cmd_on.png', spriteOf(hud.root, 'CmdBtnRetreat')?.spriteFrame, frames.cmd_on);
eq('突擊未接 → cmd_off.png', spriteOf(hud.root, 'CmdBtnAssault')?.spriteFrame, frames.cmd_off);

// 结算
const settlement = {
  winner: 'A',
  mode: 1,
  modeName: '大勝',
  report: '大勝 · 用時 16 秒 · 100 擊殺',
  enemyLevel: 5,
  durationSec: 16,
  kills: 100,
  killsInf: 80,
  killsCav: 20,
  score: 1370,
  spellKills: 8,
  expGain: 1530,
  meritGain: 16,
  levelUp: 1,
  level: 6,
  exp: 1530,
  nextLevelAt: 2775,
  record: { wins: 1, losses: 0, streak: 1, bestStreak: 3 },
  status: { A: 0, B: 3 },
  morale: { A: { before: 40, after: 24 }, B: { before: 40, after: 26 } },
  loyalty: { A: { before: 100, after: 100 }, B: { before: 100, after: 100 } },
  tire: { A: { before: 0, after: 16 }, B: { before: 0, after: 16 } },
  tireGain: 16,
  learned: [],
};
hud.refresh(world, settlement, launch, '火計');

section('③ 结算面板');
eq('胜利时标题 = 大 勝', labelOf(hud.root, 'SettleTitle')?.string, '大 勝');
check('副行 = 模式·用时·击杀', (labelOf(hud.root, 'SettleSub')?.string ?? '').includes('用時 16 秒 · 100 擊殺'));
const KEYS = ['敵將等級', '戰功', '經驗', '功勳', '等級', '戰績'];
const VALS = ['Lv.5', '+1370', '+1530', '+16', 'Lv.6  (+1)', '1 勝 / 0 負'];
for (let i = 0; i < 6; i += 1) {
  eq(`SettleKey${i + 1} = ${KEYS[i]}`, labelOf(hud.root, `SettleKey${i + 1}`)?.string, KEYS[i]);
  eq(`SettleVal${i + 1} = ${VALS[i]}`, labelOf(hud.root, `SettleVal${i + 1}`)?.string, VALS[i]);
}
eq('EXP 文本', labelOf(hud.root, 'SettleExp')?.string, 'EXP 1530 / 2775');
eq('距下一级', labelOf(hud.root, 'SettleExpNext')?.string, '距下一級 1245');
check('SettleMeta 有法術擊殺/連勝', /法術擊殺 8 · 連勝 1（最高 3）/.test(labelOf(hud.root, 'SettleMeta')?.string ?? ''));
eq('SettleReport = 战报', labelOf(hud.root, 'SettleReport')?.string, settlement.report);
check('SettleNote 有预览版说明', (labelOf(hud.root, 'SettleNote')?.string ?? '').includes('不寫存檔'));
eq('再战按钮文案', labelOf(hud.root, 'SettleAgainLabel')?.string, '再 戰');
eq('再战副文案', labelOf(hud.root, 'SettleAgainSub')?.string, '點擊畫面返回大地圖');
eq('结算面板挂 msg.png', spriteOf(hud.root, 'SettleFrame')?.spriteFrame, frames.msg);
eq('结算分隔线挂 sep.png', spriteOf(hud.root, 'SettleSep')?.spriteFrame, frames.sep);
eq('结算时结算层显示', findNode(hud.root, 'SettleLayer')?.active, true);
eq('结算时控制台压到 16% 不透明', findNode(hud.root, 'HudConsole')?.getComponent(cc.UIOpacity)?.opacity, 41);
const settleArt = findNode(hud.root, 'SettleArt')?.getComponent(cc.Graphics);
const ops = settleArt?.ops ?? [];
const countOp = (name) => ops.filter((op) => op[0] === name).length;
check('结算面板画了面板/再战按钮圆角底（roundRect ≥ 4）', countOp('roundRect') >= 4, `roundRect ${countOp('roundRect')}`);
check('结算面板填了面板底+3 条斑马行+经验条+再战底（fill ≥ 6）', countOp('fill') >= 6, `fill ${countOp('fill')}`);
check('结算面板描了金边+按钮边+标题细线（stroke ≥ 3）', countOp('stroke') >= 3, `stroke ${countOp('stroke')}`);
// 结算 6 行的左右落位（web drawSettle：键 132 左、值 618 右）
checkEdge(hud.root, 'SettleKey1', 'left', 132);
checkEdge(hud.root, 'SettleVal1', 'right', 618);
checkEdge(hud.root, 'SettleKey6', 'left', 132);
checkEdge(hud.root, 'SettleVal6', 'right', 618);
checkEdge(hud.root, 'SettleExp', 'left', 132);
checkEdge(hud.root, 'SettleExpNext', 'right', 618);
checkEdge(hud.root, 'SettleTitle', 'center', 375);
checkEdge(hud.root, 'SettleNote', 'center', 375);

// 重开一局后必须回到战斗态（HUD 不能卡在结算）
hud.refresh(world, null, launch, '');
eq('重开后结算层隐藏', findNode(hud.root, 'SettleLayer')?.active, false);
eq('重开后控制台恢复不透明', findNode(hud.root, 'HudConsole')?.getComponent(cc.UIOpacity)?.opacity, 255);

// ---------------------------------------------------------------------------
// ④ 防回归
// ---------------------------------------------------------------------------

section('④ 防回归');
const portraitRoot = new cc.Node('PortraitTest');
const generalArt = new GeneralArt(portraitRoot);
const artRoot = portraitRoot.getChildByName('GeneralArt');
check('GeneralArt 根节点在', !!artRoot);
for (const name of ['GenAHorse', 'GenABody', 'GenAWeapon', 'GenBHorse', 'GenBBody', 'GenBWeapon']) {
  check(`主将三层节点 ${name} 仍在`, !!findNode(artRoot, name));
}

const battleRootSrc = fs.readFileSync(path.join(SCRIPTS, 'BattleRoot.ts'), 'utf8');
const battleRootCode = stripComments(battleRootSrc);
check('BattleRoot 里 HUD 由 BattleHud 建', /this\.hud = new BattleHud\(this\.node\)/.test(battleRootCode));
check(
  'BattleRoot 每帧把 world/settlement 交给 HUD',
  /this\.hud\.refresh\(world, this\.settlement, this\.launch, this\.wiseNote\)/.test(battleRootCode),
);
check('labelGeneral 字段/用法已彻底移除', !/labelGeneral/.test(battleRootCode));
check('士兵精灵池 Unit_${index} 还在', /Unit_\$\{index\}/.test(battleRootCode) || /`Unit_\$\{/.test(battleRootCode));
check('结算调用链 settle(this.world) 未动', /settle\(this\.world\)/.test(battleRootCode));
check('recordBattleResult 未动', /recordBattleResult\(/.test(battleRootCode));
check('没有偷偷下撤退令 requestRetreat(', !/requestRetreat\s*\(/.test(battleRootCode));
check('没有偷偷施法 cast(', !/[^.\w]cast\s*\(/.test(battleRootCode));

const hudSrc = fs.readFileSync(path.join(SCRIPTS, 'BattleHud.ts'), 'utf8');
const hudCode = stripComments(hudSrc);
check('BattleHud 不调用 requestRetreat', !/requestRetreat\s*\(/.test(hudCode));
check('BattleHud 不调用 cast', !/[^.\w]cast\s*\(/.test(hudCode));
check('BattleHud 不写 world.settled', !/\.settled\s*=/.test(hudCode));
check('BattleHud 不调用 settle()', !/[^.\w]settle\s*\(/.test(hudCode));
const coreImport = hudCode.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/core\/battle'/);
const coreNames = coreImport ? coreImport[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
const READONLY = new Set(['QI_MAX', 'expToReach', 'magicBySeq', 'qiCostMul', 'qiCostOf', 'qiPowerPercentOf', 'skillKindOf']);
check(
  'BattleHud 只 import core/battle 的只读查询（不放行 settle/cast/requestRetreat）',
  coreNames.length > 0 && coreNames.every((name) => READONLY.has(name)),
  coreNames.join(','),
);
check('BattleHud import 了技能查询 7 件套', coreNames.length === READONLY.size, `实际 ${coreNames.length} 个`);

// 素材：7 张 png + 7 个 .meta + 目录 .meta，且和 web 侧逐字节一致（没有重复造图/改图）
section('① 素材');
check('HUD_UI_DIR 指向 res 分包', HUD_UI_DIR === 'ui/battle');
let identical = 0;
for (const tex of HUD_TEXES) {
  const webFile = path.join(WEB_TEX, `${tex}.png`);
  const resFile = path.join(RES_TEX, `${tex}.png`);
  check(`res/ui/battle/${tex}.png 存在`, fs.existsSync(resFile));
  check(`res/ui/battle/${tex}.png.meta 存在`, fs.existsSync(`${resFile}.meta`));
  check(`web 侧 ${tex}.png 未被移动`, fs.existsSync(webFile));
  if (fs.existsSync(webFile) && fs.existsSync(resFile)) {
    const same = Buffer.compare(fs.readFileSync(webFile), fs.readFileSync(resFile)) === 0;
    check(`res/ui/battle/${tex}.png 与 web 侧逐字节一致`, same);
    if (same) identical += 1;
  }
}
check('7 张图全部一致', identical === 7, `一致 ${identical}/7`);
check('battle 目录 .meta 存在', fs.existsSync(path.join(RES_TEX, '..', 'battle.meta')));
const bytes = HUD_TEXES.reduce((sum, tex) => sum + (fs.existsSync(path.join(RES_TEX, `${tex}.png`)) ? fs.statSync(path.join(RES_TEX, `${tex}.png`)).size : 0), 0);
check('7 张素材合计 ≤ 4KB（体积预算）', bytes <= 4096, `实际 ${bytes}B`);

// ---------------------------------------------------------------------------
// 结果
// ---------------------------------------------------------------------------

const emitted = buildInfo.emitted;
console.log('');
console.log(`编译：.build 产出 ${emitted} 个 js 文件（tsc 语义告警 ${buildInfo.errors} 条，编译期不追求 0 —— tsc 类型检查另跑）`);
console.log(`素材：${bytes}B / 7 张，与 game/web/assets/battleui 逐字节一致 ${identical}/7`);
console.log(`断言：${checks - failures.length}/${checks} 通过`);
for (const [name, tally] of groupTally) {
  console.log(`  ${tally.fail === 0 ? '✓' : '✗'} ${name}：${tally.pass}/${tally.pass + tally.fail}`);
}
if (failures.length > 0) {
  console.log('');
  for (const line of failures) console.log(`  ✗ ${line}`);
  console.log('');
  console.log(`FAILED ${failures.length} 条`);
  process.exit(1);
}
console.log('OK');
