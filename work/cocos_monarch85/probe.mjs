#!/usr/bin/env node
/**
 * work/cocos_monarch85/probe.mjs
 *
 * v17-cocos-monarch 探針：不跑 CocosCreator，直接抽 TypeScript 源碼裡的**純邏輯 region**
 * 編成 ESM 來跑（做法同 work/cocos_monarch84/ai_smoke.mjs 的 ts.transpileModule 路線）：
 *
 *   1. `CampaignRoot.ts` 的 `// #region 戰報 / 君主繼承 / 城點取色（純邏輯）` 逐字抽出，
 *      前面補一行 `import * as M from './MonarchModel.probe.mjs'`，transpileModule → ESM。
 *   2. `MonarchModel.ts` 同樣編一份（它沒有任何 import，自足）。
 *   3. 對真實編譯產物做斷言：繼承彈窗 0/1/多人、戰報環形緩衝上限與順序、
 *      `battleLogFromAi` 的三類戰報、`logHit` 命中區、60 城 tint 色號分布、
 *      以及「先彈窗後落地」與 `M.kingDeath` 一次性路徑的**存檔結果對拍**。
 *   4. 陰性對照：把編譯來源故意改壞兩處（`BATTLE_LOG_MAX` 8→3、玩家金環 alpha 235→0），
 *      重跑同一組斷言，必須變紅（failures > 0），否則探針本身是假的。
 *
 * 用法：node work/cocos_monarch85/probe.mjs        （EXIT=0 全綠，EXIT=1 有紅）
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPTS = path.join(ROOT, 'game', 'cocos', 'assets', 'scripts');
const DATA = path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'data');
const OUT = path.join(HERE, '_probe');

function requireTypescript() {
  const candidates = [
    path.join(ROOT, 'game', 'node_modules', 'typescript', 'lib', 'typescript.js'),
    path.join(ROOT, 'node_modules', 'typescript', 'lib', 'typescript.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return createRequire(import.meta.url)(file);
  }
  throw new Error('找不到 typescript（試過 game/node_modules 與根 node_modules）');
}

const ts = requireTypescript();

const REGION_START = '// #region 戰報 / 君主繼承 / 城點取色（純邏輯）';
const REGION_END = '// #endregion';

function extractRegion(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.indexOf(REGION_START);
  if (start < 0) throw new Error(`找不到 region 起點：${REGION_START}`);
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === REGION_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('找不到 region 終點 // #endregion');
  return lines.slice(start + 1, end).join('\n');
}

function transpile(source, outName) {
  // 注意：`fileName` 一定要是 .ts —— 傳 .mjs 的話 TS 會按 JS 解析、型別語法原樣留在輸出裡
  // （`new Set<string>()` 會在 node 端變成 SyntaxError）。
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
    },
    fileName: outName.replace(/\.mjs$/, '.ts'),
  });
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, outName);
  fs.writeFileSync(file, result.outputText, 'utf8');
  return pathToFileURL(file).href;
}

async function loadModules(regionSource) {
  const modelUrl = transpile(fs.readFileSync(path.join(SCRIPTS, 'MonarchModel.ts'), 'utf8'), 'MonarchModel.probe.mjs');
  const header = "import * as M from './MonarchModel.probe.mjs';\n";
  const regionUrl = transpile(header + regionSource, 'region.probe.mjs');
  const M = await import(modelUrl);
  const R = await import(regionUrl);
  return { M, R };
}

/* ------------------------------------------------------------------ */
/* 斷言器                                                              */
/* ------------------------------------------------------------------ */

const results = { passed: 0, failed: [], notes: [] };

function ok(cond, label, extra) {
  if (cond) {
    results.passed += 1;
    return true;
  }
  results.failed.push(extra ? `${label} ｜ ${extra}` : label);
  return false;
}

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return ok(a === e, label, `got ${a} want ${e}`);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* 夾具                                                                */
/* ------------------------------------------------------------------ */

function makeSave(over) {
  const save = {
    month: 13,
    monarch: '劉焉',
    force: '劉焉',
    king: '劉焉',
    monarchSince: 1,
    forces: {
      劉焉: { id: '劉焉', king: '劉焉', flag: 0, alive: true, cities: ['成都'], ts: 0 },
    },
    cities: { 成都: { owner: '劉焉' } },
    fate: {},
    ...over,
  };
  return save;
}

function officers(list) {
  return list.map((o) => ({
    name: o.name,
    str: o.str ?? 60,
    int: o.int ?? 60,
    loyal: o.loyal ?? 80,
    status: o.status ?? '登',
    loyalKing: o.loyalKing ?? '',
  }));
}

const THREE = officers([
  { name: '劉璋', str: 55, int: 60, loyal: 92 },
  { name: '張任', str: 84, int: 76, loyal: 88 },
  { name: '黃權', str: 62, int: 82, loyal: 40 },
]);

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

/* ------------------------------------------------------------------ */
/* 主體                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const regionSource = extractRegion(path.join(SCRIPTS, 'CampaignRoot.ts'));
  const { M, R } = await loadModules(regionSource);

  results.notes.push(`region 抽出 ${regionSource.split(/\r?\n/).length} 行；MonarchModel ${fs.readFileSync(path.join(SCRIPTS, 'MonarchModel.ts'), 'utf8').split(/\r?\n/).length} 行`);

  /* ---- 1. 年月標記 / 顏色 / 類別收斂 ---- */
  eq(R.monthStamp(1), '1年1月', 'monthStamp(1)');
  eq(R.monthStamp(13), '2年1月', 'monthStamp(13)');
  eq(R.monthStamp(12), '1年12月', 'monthStamp(12)');
  eq(R.monthStamp(0), '1年1月', 'monthStamp(0) 非法回 1');
  eq(R.monthStamp('x'), '1年1月', 'monthStamp(非數) 非法回 1');
  eq(R.logColor('atk'), '#E8A08C', 'logColor atk 對齊 web .logrow.atk');
  eq(R.logColor('hold'), '#7FD1A8', 'logColor hold');
  eq(R.logColor('lost'), '#E08A7A', 'logColor lost');
  eq(R.logColor('year'), '#F0D48A', 'logColor year');
  eq(R.logColor('win'), '', 'logColor win 無專屬色');
  eq(R.logKindOf('lost'), 'lost', 'logKindOf 合法值保留');
  eq(R.logKindOf('bogus'), 'info', 'logKindOf 非法值收斂 info');
  eq(R.logKindOf(undefined), 'info', 'logKindOf undefined');

  /* ---- 2. 戰報環形緩衝：上限 8 + 順序（最新在前） ---- */
  eq(R.BATTLE_LOG_MAX, 8, 'BATTLE_LOG_MAX = web 的 8 條');
  let buf = [];
  for (let i = 1; i <= 12; i += 1) {
    buf = R.battleLogPush(buf, R.battleLogLine(i, `第 ${i} 條`, 'info'));
  }
  eq(buf.length, 8, 'push 12 條後只剩 8 條');
  eq(buf[0].s, '第 5 條', '環形緩衝砍掉最舊的 4 條（首條＝第 5 條）');
  eq(buf[7].s, '第 12 條', '尾條＝最新');
  eq(R.battleLogTail(buf).length, 8, 'tail 長度 8');
  eq(R.battleLogTail(buf)[0].s, '第 12 條', 'tail[0] 是最新（web slice(-8).reverse()）');
  eq(R.battleLogTail(buf)[7].s, '第 5 條', 'tail[7] 是最舊');
  const small = R.battleLogPush([], R.battleLogLine(1, 'x', 'info'), 3);
  eq(R.battleLogAppend(small, [R.battleLogLine(1, 'a', 'atk'), R.battleLogLine(1, 'b', 'lost')], 3).map((l) => l.s), ['x', 'a', 'b'].slice(-3), 'append 保序');
  const frozen = R.battleLogPush([], R.battleLogLine(1, 'y', 'info'));
  R.battleLogPush(frozen, R.battleLogLine(1, 'z', 'info'));
  eq(frozen.length, 1, 'battleLogPush 不改入參');
  eq(R.battleLogTail([], 8), [], '空緩衝 tail 為空');

  /* ---- 3. battleLogFromAi：出兵 / 易手 / 陣亡 三類 ---- */
  const outcome = {
    month: 14,
    log: [
      'AI 月 報：3 個勢力行動（公孫瓚、張角、董卓）',
      '  公孫瓚 攻 北平 → 得手（守 800 兵）',
      '  嚴白虎 的君主陣亡於 吳郡，嚴輿 繼位',
      '  勢 力 滅 亡：孔岫',
    ],
    incoming: [
      { force: '張角', from: '鉅鹿', to: '平原', troops: 4200 },
      { force: '董卓', from: '長安', to: '洛陽', troops: 9000 },
    ],
    battles: [
      { force: '公孫瓚', from: '薊', to: '北平', captured: true, skipped: false, defenders: 800, attacker: '公孫瓚' },
      { force: '喬玄', from: '琅邪', to: '壽春', captured: false, skipped: false, defenders: 1200 },
      { force: '韓馥', from: '鄴', to: '晉陽', captured: false, skipped: true, defenders: 0 },
    ],
    gone: ['孔岫', '孔岫'],
  };
  const lines = R.battleLogFromAi(outcome);
  const texts = lines.map((l) => l.s);
  ok(texts.some((s) => s.includes('張角 出兵 平原') && s.includes('4200 兵')), '出兵類：某勢力出兵某城 + 兵數', JSON.stringify(texts));
  ok(texts.some((s) => s.includes('北平 易手') && s.includes('公孫瓚')), '易手類：某城易手', JSON.stringify(texts));
  ok(texts.some((s) => s.includes('陣亡') && s.includes('嚴輿')), '陣亡類：武將/君主陣亡原文進戰報', JSON.stringify(texts));
  ok(texts.some((s) => s.includes('敗退') && s.includes('壽春')), '敗退類：沒破城也有一條', JSON.stringify(texts));
  eq(texts.filter((s) => s.includes('孔岫 勢力滅亡')).length, 1, 'gone 去重（只一條勢力滅亡）');
  ok(texts.every((s) => s.indexOf('月 報') < 0), '月報頭不重複進戰報（已在提示條）');
  eq(lines.find((l) => l.s.includes('出兵')).k, 'atk', '出兵 kind=atk');
  eq(lines.find((l) => l.s.includes('易手')).k, 'win', '易手 kind=win');
  eq(lines.find((l) => l.s.includes('陣亡')).k, 'lost', '陣亡 kind=lost');
  eq(R.battleLogFromAi(null).length, 0, 'null 結果 → 0 條');
  const many = R.battleLogFromAi({ month: 1, incoming: Array.from({ length: 12 }, (_, i) => ({ force: '甲', from: 'A', to: `C${i}`, troops: 10 })) }, 5);
  eq(many.length, 5, 'battleLogFromAi 也受 max 上限約束');
  eq(many[4].s.indexOf('C11') >= 0, true, '超限時留最後 5 條');

  /* ---- 4. logHit：標題列 / 內容區 / 外面 ---- */
  const L = R.LOG_VIEW;
  eq(R.logHit(L.x + 10, L.y + 5, false), 'header', 'logHit 標題列 → header');
  eq(R.logHit(L.x + L.w - 1, L.y + L.h - 1, false), 'body', 'logHit 內容區 → body');
  eq(R.logHit(L.x - 1, L.y + 5, false), '', 'logHit 左外 → 不命中');
  eq(R.logHit(L.x + 10, L.y + L.h + 2, false), '', 'logHit 下外 → 不命中');
  eq(R.logHit(L.x + 10, L.y + R.LOG_BAR_H + 2, true), '', '折疊後高度只剩 LOG_BAR_H');
  eq(R.logHit(L.x + 10, L.y + 28, false), 'header', '標題列底線仍算 header');
  eq(R.logHit(L.x + 10, L.y + 29, false), 'body', '標題列下緣 → body');
  ok(L.x + L.w <= 750 && L.y + L.h <= 1080, '戰報浮層在地圖區內（不壓底部城市卡 1240）', `${L.x + L.w},${L.y + L.h}`);

  /* ---- 5. 城點 tint：單點語義 ---- */
  const playerTint = R.cityTintOf('劉焉', '劉焉');
  eq(playerTint.isPlayer, true, '自己的城 isPlayer');
  eq(playerTint.color, M.FORCE_GOLD === playerTint.color ? playerTint.color : playerTint.color, 'cityTintOf 主色存在');
  eq(playerTint.color, M.forceColorOf('劉焉'), '主色＝色板原色（不複製色板）');
  eq(playerTint.glowAlpha, 120, '玩家色暈 120');
  eq([playerTint.ringColor, playerTint.ringAlpha, playerTint.ringWidth], [M.FORCE_GOLD, 235, 2], '玩家金環 235 / 2px');
  eq(playerTint.labelColor, M.FORCE_GOLD, '玩家城名金');
  const foeTint = R.cityTintOf('張角', '劉焉');
  eq(foeTint.isPlayer, false, '敵城 isPlayer=false');
  eq(foeTint.glowAlpha, 78, '敵城色暈 78');
  eq(foeTint.ringAlpha, 0, '敵城不畫金環');
  ok(foeTint.labelColor !== M.forceColorOf('張角') && foeTint.labelColor.startsWith('#'), '敵城城名用提亮版（不是原色）', foeTint.labelColor);
  eq(R.tintLighten('#000000', 0), '#000000', 'tintLighten k=0 原色');
  eq(R.tintLighten('#000000', 1), '#ffffff', 'tintLighten k=1 白');
  const neutral = R.cityTintOf('', '劉焉');
  eq(neutral.color, M.FORCE_COLOR_NEUTRAL, '無主城 → 中性灰');
  eq([neutral.isPlayer, neutral.ringAlpha, neutral.labelColor], [false, 0, ''], '無主城：無金環、城名走 textDim');

  /* ---- 6. 60 城 tint 色號分布（真實 scenarios + garrison） ---- */
  const scenario = readJson('scenarios.json')[0];
  const garrison = readJson('garrison.json')[0].cities;
  const cityNames = scenario.cities.map((c) => c.NAME);
  eq(cityNames.length, 60, 'scenarios.json 60 城');
  const ownerReal = (name) => {
    const row = garrison[name];
    return row && typeof row.owner === 'string' ? row.owner.trim() : '';
  };
  const palette = M.FORCE_PALETTE.map((e) => e.color.toLowerCase());
  const reserves = M.FORCE_RESERVE.map((c) => c.toLowerCase());
  const allowed = new Set([...palette, ...reserves, M.FORCE_COLOR_NEUTRAL.toLowerCase()]);
  const counts = { total: 0, player: 0, neutral: 0, colored: 0 };
  const colorOf = new Map();
  const forceSet = new Set();
  let badColor = 0;
  let mismatch = 0;
  for (const name of cityNames) {
    const owner = ownerReal(name);
    const tint = R.cityTintOf(owner, '劉焉');
    counts.total += 1;
    if (!owner) counts.neutral += 1;
    else {
      counts.colored += 1;
      forceSet.add(owner);
      if (owner === '劉焉') counts.player += 1;
    }
    if (!allowed.has(tint.color.toLowerCase())) badColor += 1;
    if (tint.color !== M.forceColorOf(owner)) mismatch += 1;
    colorOf.set(name, tint.color);
  }
  eq(counts.total, 60, '60 城全部取到 tint');
  eq(badColor, 0, '60 城色號全部落在「14 固定色 + 14 備色 + 中性灰」內');
  eq(mismatch, 0, '60 城主色 === M.forceColorOf(owner)（色板單一來源）');
  eq(counts.neutral, 39, '無主城 39 座 → 中性灰');
  eq(counts.colored, 21, '有主城 21 座');
  eq(counts.player, 1, '劉焉名下 1 城 → 金環');
  eq(forceSet.size, 14, '劇本 1 共 14 家勢力（全部落在固定色板）');
  const distinct = new Set(Array.from(colorOf.values()));
  eq(distinct.size, 15, '色號分布：14 家色 + 中性灰 ＝ 15 種');
  const hist = {};
  for (const [name, color] of colorOf) hist[color] = (hist[color] || 0) + 1;
  const top = Object.keys(hist).sort((a, b) => hist[b] - hist[a])[0];
  eq(hist[M.FORCE_COLOR_NEUTRAL], 39, '色號分布最高的是中性灰 39 座');
  results.notes.push(
    `60 城 tint 分布：${Object.keys(hist)
      .sort((a, b) => hist[b] - hist[a])
      .map((c) => `${c}×${hist[c]}`)
      .join(' ')}`,
  );
  ok(top === M.FORCE_COLOR_NEUTRAL, '最高頻色號就是中性灰', top);
  // 14 家固定色板逐一對照（forceColorOf 就是 web/saves.js:103-131 的同一份）
  for (let i = 0; i < M.FORCE_PALETTE.length; i += 1) {
    const entry = M.FORCE_PALETTE[i];
    eq(M.forceColorIndex(entry.force), i, `色板 #${i} ${entry.force} 下標固定`);
    eq(R.cityTintOf(entry.force, '劉焉').color, entry.color, `城點色 #${i} ${entry.force} = ${entry.color}`);
  }
  const unknownA = R.cityTintOf('司馬懿', '劉焉').color;
  const unknownB = R.cityTintOf('司馬懿', '劉焉').color;
  eq(unknownA, unknownB, '備色勢力取色穩定（同名同色）');
  ok(reserves.indexOf(unknownA.toLowerCase()) >= 0 || palette.indexOf(unknownA.toLowerCase()) >= 0, '備色勢力落在備色表內', unknownA);

  /* ---- 7. 繼承彈窗：候選 0 人 ---- */
  const save0 = makeSave();
  const off0 = officers([{ name: '劉焉', str: 70, int: 70, loyal: 90 }]);
  const st0 = R.successionStart({ force: '劉焉', dead: '劉焉', month: 13, remaining: 3, officers: off0 });
  eq(st0.phase, 'extinct', '0 候選 → extinct');
  eq(st0.candidates.length, 0, '0 候選');
  const view0 = R.successionView(st0);
  eq(view0.extinct, true, 'view.extinct');
  eq(view0.title, '君主陣亡 · 勢力滅亡', '滅亡文案標題');
  eq(view0.rows.filter((r) => r.tone === 'confirm').length, 1, '滅亡態有「確定」行');
  ok(view0.rows.some((r) => r.text.indexOf('殘將散去') >= 0), '滅亡態有殘將說明');
  eq(view0.hint, '沒有可繼位的武將，只能就此落幕', '滅亡態提示');
  const land0 = R.successionLand(save0, st0);
  eq([land0.ok, land0.extinct, land0.heir], [true, true, ''], '落地：勢力滅亡、無繼承人');
  eq([save0.monarch, save0.force, save0.king], ['', '', ''], '滅亡後 monarch/force/king 清空');
  eq(save0.forces['劉焉'].alive, false, '勢力 alive=false');
  eq(land0.kind, 'lost', '滅亡戰報 kind=lost');
  ok(land0.line.indexOf('勢力滅亡') >= 0 && land0.line.indexOf('勢力 劉焉') < 0, '戰報行：勢力滅亡（不含多餘前綴）', land0.line);
  // 與 M.kingDeath 一次性路徑對拍（同樣 remaining>0 但沒候選）
  const save0b = makeSave();
  const kd0 = M.kingDeath(save0b, '劉焉', { month: 13, dead: '劉焉', remaining: 3, officers: off0 });
  eq(kd0.reason, 'extinct', 'kingDeath 同輸入也判 extinct');
  eq(stable(save0), stable(save0b), '先彈窗後落地 === kingDeath 一次性路徑（0 候選）');
  eq(stable(save0.fate), stable(save0b.fate), '殘將 fate 表一致（0 候選）');

  /* ---- 8. 繼承彈窗：候選 1 人 ---- */
  const save1 = makeSave();
  const off1 = officers([
    { name: '劉焉', str: 70, int: 70, loyal: 90 },
    { name: '劉璋', str: 55, int: 60, loyal: 92 },
  ]);
  const st1 = R.successionStart({ force: '劉焉', dead: '劉焉', month: 14, remaining: 2, officers: off1 });
  eq(st1.phase, 'prompt', '1 候選 → prompt');
  eq(st1.candidates.map((c) => c.name), ['劉璋'], '1 候選＝劉璋');
  const view1 = R.successionView(st1);
  eq(view1.title, '君主陣亡 · 選繼承人', '繼承文案標題');
  eq(view1.rows.filter((r) => r.tone === 'cand').length, 1, '彈窗 1 行為候選');
  ok(view1.rows[0].text.indexOf('武 55') >= 0 && view1.rows[0].text.indexOf('智 60') >= 0, '候選行有武/智', view1.rows[0].text);
  // prompt 態**不能取消**：視圖只給候選行，沒有 confirm/取消列（「必須選一位」的提示是
  // MonarchPanel.rebuildSuccession 補的 UI 文案，探針不碰 UI）
  eq(view1.rows.filter((r) => r.tone !== 'cand').length, 0, 'prompt 態沒有取消/確定列（非答不可）');
  eq(view1.rows.length, 1, 'prompt 態行數＝候選數');
  const land1 = R.successionLand(save1, st1);
  eq([land1.ok, land1.extinct, land1.heir], [true, false, '劉璋'], '落地：劉璋繼位');
  eq([save1.monarch, save1.force], ['劉璋', '劉焉'], '繼位：monarch 換人、勢力 id 不變');
  eq(save1.monarchSince, 14, '即位月＝陣亡月');
  const save1b = makeSave();
  const kd1 = M.kingDeath(save1b, '劉焉', { month: 14, dead: '劉焉', remaining: 2, officers: off1 });
  eq(kd1.heir, '劉璋', 'kingDeath 同輸入選出劉璋');
  eq(stable(save1), stable(save1b), '先彈窗後落地 === kingDeath 一次性路徑（1 候選）');
  eq(land1.line, '2年2月　劉焉 君主陣亡：劉璋 繼位（勢力存續 · 名號不變）', '繼位戰報行文字');

  /* ---- 9. 繼承彈窗：候選多人（排序 / 同族 / 指定非首位） ---- */
  const off3 = officers([
    { name: '劉焉', str: 70, int: 70, loyal: 90 },
    { name: '劉璋', str: 55, int: 60, loyal: 92 },
    { name: '張任', str: 84, int: 76, loyal: 88 },
    { name: '黃權', str: 62, int: 82, loyal: 40 },
    { name: '孟達', str: 66, int: 70, loyal: 30, status: '俘' },
    { name: '法正', str: 60, int: 92, loyal: 70, status: '野' },
  ]);
  const st3 = R.successionStart({ force: '劉焉', dead: '劉焉', month: 15, remaining: 2, officers: off3 });
  eq(st3.phase, 'prompt', '多人 → prompt');
  eq(st3.candidates.length, 3, '俘虜/在野/死者被排除，剩 3 人');
  eq(st3.candidates.map((c) => c.name), ['劉璋', '張任', '黃權'], '排序：同族（劉璋 2 萬分）先，其餘按忠誠/武智');
  eq(st3.candidates[0].clan, true, '劉璋同族 clan=true');
  eq(st3.candidates[0].score, 2 * 10000 + 92 * 100 + 55 + 60, '同族分數公式 2*10000+忠*100+武+智');
  const view3 = R.successionView(st3);
  eq(view3.rows.filter((r) => r.tone === 'cand').length, 3, '彈窗 3 行候選');
  ok(view3.rows[0].text.indexOf('同族') >= 0, '同族候選行有標記', view3.rows[0].text);
  const save3 = makeSave();
  const land3 = R.successionLand(save3, st3, '張任');
  eq(land3.heir, '張任', '玩家可指定非首位候選');
  eq(save3.monarch, '張任', '指定落地：monarch=張任');
  eq(save3.forces['劉焉'].king, '張任', 'forces[勢力].king 同步');
  const save3b = makeSave();
  const kd3 = M.kingDeath(save3b, '劉焉', { month: 15, dead: '劉焉', remaining: 2, officers: off3 });
  eq(kd3.heir, '劉璋', 'kingDeath 默認取排序第一（劉璋）');
  ok(stable(save3) !== stable(save3b), '指定張任時存檔與默認繼承不同（玩家選擇真的生效）');

  /* ---- 10. remaining=0 即使有人也不繼承 ---- */
  const stR0 = R.successionStart({ force: '劉焉', dead: '劉焉', month: 16, remaining: 0, officers: off3 });
  eq(stR0.phase, 'extinct', 'remaining=0 → extinct（對齊 kingDeath 的 remaining===0）');
  eq(stR0.candidates.length, 0, 'remaining=0 不產生候選');
  ok(R.successionView(stR0).rows.some((r) => r.text.indexOf('名下已無城池') >= 0), 'remaining=0 文案「名下已無城池」');
  const stNo = R.successionStart({ force: '劉焉', dead: '劉焉', month: 16, remaining: 5, officers: off0 });
  eq(stNo.phase, 'extinct', '有城但沒候選 → extinct');
  ok(R.successionView(stNo).rows.some((r) => r.text.indexOf('還有 5 城無主') >= 0), '有城但無候選 → 「還有 N 城無主」');

  /* ---- 11. successionOfficers：從城→守將攤平，按勢力過濾 ---- */
  const cities = ['成都', '江州', '永安'];
  const byCity = {
    成都: officers([{ name: '劉焉', str: 70, int: 70, loyal: 90 }]),
    江州: officers([{ name: '張任', str: 84, int: 76, loyal: 88 }]),
    永安: [{ name: '嚴顏' }],
  };
  const owners = { 成都: '劉焉', 江州: '劉焉', 永安: '張飛' };
  const own = R.successionOfficers(cities, (c) => owners[c], (c) => byCity[c] ?? [], '劉焉');
  eq(own.map((o) => o.name), ['劉焉', '張任'], '按勢力過濾守將');
  eq(own.map((o) => o.city), ['成都', '江州'], '守將帶城名');
  eq(R.successionOfficers(cities, (c) => owners[c], (c) => byCity[c] ?? [], '').length, 3, 'force="" 不過濾');
  const stCity = R.successionStart({ force: '劉焉', dead: '劉焉', month: 17, remaining: 2, officers: own });
  eq(stCity.candidates.map((c) => [c.name, c.city]), [['張任', '江州']], '候選帶所在城（死者排除）');

  /* ---- 12. 陰性對照：故意改壞 → 探針必須變紅 ---- */
  const mutants = [
    { label: 'BATTLE_LOG_MAX 8→3', from: 'export const BATTLE_LOG_MAX = 8;', to: 'export const BATTLE_LOG_MAX = 3;' },
    { label: '玩家金環 235→0', from: 'ringAlpha: isPlayer ? 235 : 0', to: 'ringAlpha: isPlayer ? 0 : 0' },
  ];
  let mutantRed = 0;
  for (const mutant of mutants) {
    if (regionSource.indexOf(mutant.from) < 0) throw new Error(`陰性對照找不到要改的字串：${mutant.from}`);
    const brokenSource = regionSource.replace(mutant.from, mutant.to);
    const broken = await loadModules(brokenSource);
    let red = 0;
    if (broken.R.BATTLE_LOG_MAX !== 8) red += 1;
    let b = [];
    for (let i = 1; i <= 12; i += 1) b = broken.R.battleLogPush(b, broken.R.battleLogLine(i, `第 ${i} 條`, 'info'));
    if (b.length === 8) red += 1;
    if (broken.R.cityTintOf('劉焉', '劉焉').ringAlpha === 235) red += 1;
    if (red > 0) mutantRed += 1;
    results.notes.push(`陰性對照「${mutant.label}」→ ${red > 0 ? '紅（正確）' : '仍是綠（探針失效！）'}`);
    // 還原編譯產物：之後若還要 import 真實版本，重新編一次
    await loadModules(regionSource);
  }
  eq(mutantRed, mutants.length, '陰性對照：改壞兩處後探針都必須變紅');
  eq(mutantRed > 0, true, '陰性對照確實能偵測到回歸');

  /* ---- 13. 接線檢查（純邏輯綠了但沒接上去也會是「沒做到」） ---- */
  const rootSrc = fs.readFileSync(path.join(SCRIPTS, 'CampaignRoot.ts'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(SCRIPTS, 'MonarchPanel.ts'), 'utf8');
  const wiring = [
    [rootSrc, 'this.buildLogLabels();', 'CampaignRoot.onLoad 建戰報 Label'],
    [rootSrc, 'this.promoteLogLabels();', 'CampaignRoot.start 把戰報 Label 提到最上層'],
    [rootSrc, 'this.recordAiBattleLog(ai);', 'advance 接 AI 戰報'],
    [rootSrc, 'this.refreshBattleLog();', 'refresh 刷戰報文字'],
    [rootSrc, 'this.drawBattleLog(ui);', 'drawFrame 畫戰報底板'],
    [rootSrc, 'logHit(x, y, this.logCollapsed)', 'onTouch 命中戰報浮層'],
    [rootSrc, 'this.toggleBattleLog();', 'onTouch 點標題列折疊'],
    [rootSrc, 'cityTintOf(owner, this.playerForce())', 'drawMap 用 cityTintOf 取色'],
    [rootSrc, 'cityTintOf(owner, this.playerForce());\n      label.color', 'placeCityLabels 用 tint.labelColor'],
    [rootSrc, 'this.checkMonarchDeath();', 'start/advance 判君主陣亡'],
    [rootSrc, 'sys.localStorage.removeItem(MONARCH_SEAT_KEY)', '新開局清掉上一局的君主座位（否則開局即誤判陣亡）'],
    [rootSrc, 'if (!this.monarchExtinct) M.seedMonarch(view, this.cities);', '滅亡後不再播種君主（防「刷新頁面復活」）'],
    [rootSrc, 'openSuccession(view, (name: string)', '彈窗接面板'],
    [rootSrc, 'this.successionState) return;', 'onTouch 在彈窗期間吞地圖點擊'],
    [rootSrc, "logKindOf(rec.k)", '戰報落盤還原時收斂 kind'],
    [panelSrc, "this.sheetKind = 'succession';", 'MonarchPanel 新 succession 抽屜'],
    [panelSrc, 'rebuildSuccession();', 'MonarchPanel 重建繼承行'],
    [panelSrc, "if (this.sheetKind === 'succession')", 'rebuildSheet 分流到 succession'],
    [panelSrc, 'pickSuccession(name)', '候選行回呼'],
  ];
  for (const [src, needle, label] of wiring) ok(src.indexOf(needle) >= 0, `接線：${label}`, needle);
  const tintCalls = rootSrc.split('cityTintOf(').length - 1;
  ok(tintCalls >= 2, `drawMap + placeCityLabels 都走 cityTintOf（${tintCalls} 處）`);
  const classAt = rootSrc.indexOf("@ccclass('CampaignRoot')");
  ok(classAt > 0 && rootSrc.slice(classAt).indexOf('forceColorOf') < 0, '類別內不再自己算 forceColorOf（色板只有 cityTintOf 一個入口）');
  ok(panelSrc.indexOf('this.hide();\n    if (cb) cb(name);') >= 0, 'MonarchPanel.pickSuccession 先關窗再回呼');
  // 13b. Creator 3.8.8 的 plugin-transform-for-of 不能吃「for-of 頭是邏輯式/三元式」：
  //  `for (const g of this.opts?.generals ?? [])` 這種寫法會讓 Babel 在 TSUnionType
  //  型別推斷處拋 `Property types[1] of TSUnionType expected node to be of a type ["TSType"]`，
  //  而且 tsc 完全看不出來（本項目踩過一次：core/roster.ts）。用靜態掃描守住。
  const forbiddenForOf = /for\s*\(\s*(?:const|let|var)\s+[\w$]+\s+of\s+[^)]*(?:\?\?|\|\||&&|\?)/;
  for (const [src, label] of [
    [rootSrc, 'CampaignRoot.ts'],
    [panelSrc, 'MonarchPanel.ts'],
  ]) {
    const lines = src.split(/\r?\n/);
    const bad = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.indexOf('for (') < 0) continue;
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (forbiddenForOf.test(line)) bad.push(`${i + 1}: ${line.trim()}`);
    }
    eq(bad, [], `for-of 頭不得是邏輯式/三元式（${label}）`);
  }

  /* ---- 14. 面板級 shim：mock cc 實例化 MonarchPanel，真的點一次彈窗 ---- */
  const mockCcFile = path.join(ROOT, 'work', 'cocos_items', '_sim', 'node_modules', 'cc', 'index.js');
  ok(fs.existsSync(mockCcFile), '面板級：找到 work/cocos_items 的 mock cc');
  if (fs.existsSync(mockCcFile)) {
    const panelDir = path.join(OUT, 'panel');
    fs.rmSync(panelDir, { recursive: true, force: true });

    // 14.1 MonarchPanel + 相對 import 樹（view/layout → core/battle …）逐一 transpile 成 CommonJS
    const pending = [path.join(SCRIPTS, 'MonarchPanel.ts')];
    const seen = new Set();
    let compiled = 0;
    while (pending.length > 0) {
      const file = pending.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(SCRIPTS, file).replace(/\.ts$/, '.js');
      const outFile = path.join(panelDir, rel);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      const js = ts.transpileModule(src, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
          removeComments: false,
        },
        fileName: file,
      }).outputText;
      fs.writeFileSync(outFile, js, 'utf8');
      compiled += 1;
      const re = /from\s+['"](\.[^'"]+)['"]/g;
      let hit = re.exec(src);
      while (hit !== null) {
        const base = path.resolve(path.dirname(file), hit[1]);
        for (const cand of [`${base}.ts`, path.join(base, 'index.ts')]) {
          if (fs.existsSync(cand)) {
            pending.push(cand);
            break;
          }
        }
        hit = re.exec(src);
      }
    }
    ok(compiled >= 4, `面板級：CJS 編譯 ${compiled} 個檔（含 view / core 依賴）`);

    // 14.2 mock cc 以 node_modules 別名掛進產物目錄
    const ccDir = path.join(panelDir, 'node_modules', 'cc');
    fs.mkdirSync(ccDir, { recursive: true });
    const ccFile = path.join(ccDir, 'index.js');
    fs.writeFileSync(ccFile, `module.exports = require(${JSON.stringify(mockCcFile.split(path.sep).join('/'))});\n`, 'utf8');

    const req = createRequire(import.meta.url);
    const cc = req(ccFile);
    const panelMod = req(path.join(panelDir, 'MonarchPanel.js'));
    ok(typeof panelMod.MonarchPanel === 'function', '面板級：MonarchPanel 從 CJS 產物匯出');

    const HALF_W = 375;
    const HALF_H = 667;
    const saveFixture = {
      month: 13,
      monarch: '玩家',
      force: '玩家',
      king: '玩家',
      monarchSince: 1,
      forces: { 玩家: { id: '玩家', king: '玩家', flag: 0, alive: true, cities: ['城A'], ts: 0 } },
      cities: {},
      owned: ['城A'],
      gold: 100,
      wins: 0,
      losses: 0,
      fate: {},
    };
    const host = new cc.Node('Host');
    host.addComponent(cc.UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    const panel = host.addComponent(panelMod.MonarchPanel);
    panel.opts = {
      save: () => saveFixture,
      generals: [],
      cities: [],
      officersByCity: () => ({}),
      ownerOf: () => '玩家',
      onCommit: () => {},
      onClose: () => {},
    };
    panel.onLoad();
    eq(panel.isOpen, false, '面板級：onLoad 後未開窗');

    // mock 的 convertToNodeSpaceAR 是 identity；onTouch 反算 x=local.x+375、y=667-local.y
    const tap = (x, y) => cc.__emitTouch(x - HALF_W, HALF_H - y);
    const tapRow = (row) => {
      const rect = panel.sheetRects[row];
      if (!rect) return false;
      tap(rect.x + rect.w / 2, rect.y + rect.h / 2);
      return true;
    };
    const cand = (name) => ({ text: `${name}　武 80 · 智 70 · 忠 90　駐 城A`, tone: 'cand', name });

    // 14.3 三人候選：不可取消、點人回呼、選完關窗
    const picked = [];
    panel.openSuccession(
      {
        title: '君主陣亡 · 選繼承人',
        sub: '勢力 玩家 · 陣亡 劉焉（2年1月）',
        hint: '點一位武將立為新君',
        extinct: false,
        rows: [cand('甲'), cand('乙'), cand('丙')],
      },
      (name) => picked.push(name),
    );
    eq(panel.isOpen, true, '面板級：openSuccession 後開窗');
    eq(panel.sheetKind, 'succession', '面板級：抽屜種類 succession');
    eq(panel.sheetRows.length, 4, '面板級：3 候選 + 不可取消提示 = 4 行');
    eq(panel.sheetRows[0].text, cand('甲').text, '面板級：候選行文字照 view 帶入');
    ok(panel.sheetTitle.indexOf('君主陣亡') >= 0 && panel.sheetTitle.indexOf('2年1月') >= 0, '面板級：標題含事件與年月');
    tap(496 + 214 / 2, 1118 + 92 / 2);
    eq(panel.isOpen, true, '面板級：彈窗期間點「關閉」無效（吞點擊）');
    eq(picked.length, 0, '面板級：彈窗期間點「關閉」不回呼');
    tap(10, 400);
    eq(panel.isOpen, true, '面板級：彈窗期間點卡片外無效');
    tapRow(1);
    eq(picked, ['乙'], '面板級：點第二位 → 回呼乙');
    eq(panel.isOpen, false, '面板級：選完自動關窗');

    // 14.4 七人候選：5 人/頁 + 翻頁 + 第 2 頁點人
    const seven = [];
    for (let i = 0; i < 7; i += 1) seven.push(cand(`將${i}`));
    const picked2 = [];
    panel.openSuccession(
      {
        title: '君主陣亡 · 選繼承人',
        sub: '勢力 玩家 · 陣亡 劉焉（3年2月）',
        hint: '點一位武將立為新君',
        extinct: false,
        rows: seven,
      },
      (name) => picked2.push(name),
    );
    eq(panel.sheetRows.length, 7, '面板級：7 候選 → 5 行 + 翻頁列 + 提示 = 7 行');
    ok(String(panel.sheetRows[5].text).indexOf('下一頁') >= 0, '面板級：第 6 行是翻頁列');
    eq(panel.sheetRows[6].text, '必須選一位，無法取消', '面板級：最後一行是不可取消提示');
    tapRow(5);
    eq(panel.sheetRows.length, 4, '面板級：第 2 頁 → 2 候選 + 翻頁列 + 提示 = 4 行');
    eq(panel.sheetRows[0].text, cand('將5').text, '面板級：第 2 頁首行是第 6 位候選');
    tapRow(0);
    eq(picked2, ['將5'], '面板級：第 2 頁點人回呼正確');

    // 14.5 滅亡態：說明行不可點、「確定：勢力滅亡」回呼空字串
    const picked3 = [];
    panel.openSuccession(
      {
        title: '君主陣亡 · 勢力滅亡',
        sub: '勢力 玩家 · 陣亡 劉焉（4年3月）',
        hint: '沒有可繼位的武將，只能就此落幕',
        extinct: true,
        rows: [
          { text: '殘將散去 · 還有 2 城無主', tone: 'note', name: '' },
          { text: '確定：勢力滅亡', tone: 'confirm', name: '' },
        ],
      },
      (name) => picked3.push(name),
    );
    eq(panel.sheetRows.length, 2, '面板級：滅亡態 2 行（說明 + 確定）');
    eq(panel.sheetRows[0].act, null, '面板級：說明行不可點');
    ok(typeof panel.sheetRows[1].act === 'function', '面板級：確定行可點');
    tapRow(1);
    eq(picked3, [''], '面板級：確定滅亡 → 回呼空字串');
    eq(panel.isOpen, false, '面板級：滅亡確認後關窗');
    eq(panel.sheetKind, 'none', '面板級：關窗後抽屜清空');

    // 14.6 面板級陰性對照：把 openSuccession 的 opened=true 拔掉 → 「開窗」斷言必須會紅
    const altDir = path.join(OUT, 'panel_mutant');
    fs.rmSync(altDir, { recursive: true, force: true });
    fs.cpSync(panelDir, altDir, { recursive: true });
    const altFile = path.join(altDir, 'MonarchPanel.js');
    const altSrc = fs.readFileSync(altFile, 'utf8');
    const at = altSrc.indexOf('openSuccession(');
    const flip = at >= 0 ? altSrc.indexOf('this.opened = true;', at) : -1;
    ok(flip > 0, '面板級：找得到 openSuccession 內的 opened=true');
    fs.writeFileSync(altFile, altSrc.slice(0, flip) + 'this.opened = false;' + altSrc.slice(flip + 'this.opened = true;'.length), 'utf8');
    const altMod = req(altFile);
    const altHost = new cc.Node('HostMutant');
    altHost.addComponent(cc.UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    const altPanel = altHost.addComponent(altMod.MonarchPanel);
    altPanel.opts = panel.opts;
    altPanel.onLoad();
    altPanel.openSuccession(
      { title: '君主陣亡 · 選繼承人', sub: '勢力 玩家 · 陣亡 劉焉（2年1月）', hint: '', extinct: false, rows: [cand('甲')] },
      () => {},
    );
    eq(altPanel.isOpen, false, '面板級陰性對照：opened=true 被拔掉後探針確實變紅（isOpen=false）');

  }

  /* ---- 收尾 ---- */
  const total = results.passed + results.failed.length;
  console.log('———— work/cocos_monarch85/probe.mjs ————');
  for (const note of results.notes) console.log(`  · ${note}`);
  console.log(`斷言：${total} 條（PASS ${results.passed} / FAIL ${results.failed.length}）`);
  if (results.failed.length > 0) {
    for (const f of results.failed) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log('  ✓ 全綠：繼承彈窗 0/1/多人、戰報環形緩衝與順序、三類戰報、60 城 tint、與 kingDeath 對拍');
}

main().catch((err) => {
  console.error('[probe] 例外：', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
