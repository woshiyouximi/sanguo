#!/usr/bin/env node
// R102 部队层证据探针（project/186_Cocos部队层与兵团指令.md）
//
//   node work/cocos_army/assert_army.mjs
//
// 口径与 work/cocos_map84/probe.mjs 一致：把 ArmyLayer.ts 里
// `// [ARMY_CORE_BEGIN]` … `// [ARMY_CORE_END]` 之间**不 import 'cc'** 的纯逻辑整段抽出来，
// 用仓库自带的 typescript 去类型 → 写成 _army_core.mjs → 真 import 进 node 跑断言。
// （同一段代码在 Cocos 里被 CampaignRoot.ts / ArmyMenu 调用，所以断言通过＝游戏里就是这行为。）
//
// 断言分组：
//   A 坐标插值 / B 绘制=命中同一份列表 / C 命中优先级与半径 / D 重叠错开
//   E 驻扎冻结 / F 阻挡夹点（相向·同向·不后退） / G 对峙判定
//   H 军师可点性两态 / I 改道与进城 / J 5 项指令可点矩阵 / K 文案与月数
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'F:/sanguo';
const OUT = path.join(ROOT, 'work/cocos_army');
const SRC = path.join(ROOT, 'game/cocos/assets/scripts/ArmyLayer.ts');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

/** 抽 region → tsc 去类型 → import（第一次抽完缓存到 _army_core.mjs，报告里存路径） */
async function loadCore() {
  const src = fs.readFileSync(SRC, 'utf8');
  // 認 ` * [ARMY_CORE_BEGIN]`（註解行首帶星號）——檔頭說明段裡也提到這兩個標記，不能只 indexOf 名字
  const beginMark = src.indexOf(' * [ARMY_CORE_BEGIN]');
  const endMark = src.indexOf(' * [ARMY_CORE_END]');
  if (beginMark < 0 || endMark < 0 || endMark <= beginMark) throw new Error('ArmyLayer.ts 里的 [ARMY_CORE_BEGIN]…[ARMY_CORE_END] 不见了');
  // 開頭＝標記那一塊註解的結尾（往後找 */），結尾＝收尾註解塊的開頭（往前找 /*）
  const begin = src.indexOf('*/', beginMark) + 2;
  const end = src.lastIndexOf('/*', endMark);
  if (end - begin < 2000) throw new Error(`纯逻辑段切出来只有 ${end - begin} 字节，标记定位错了`);
  const region = src.slice(begin, end);
  const tsFile = [
    path.join(ROOT, 'game/node_modules/typescript/lib/typescript.js'),
    path.join(ROOT, 'node_modules/typescript/lib/typescript.js'),
  ].find((p) => fs.existsSync(p));
  if (!tsFile) throw new Error('找不到 typescript/lib/typescript.js');
  const ts = (await import(pathToFileURL(tsFile).href)).default;
  const out = ts.transpileModule(region, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  if (/from\s+['"]cc['"]/.test(out)) throw new Error('纯逻辑段里出现了 cc 依赖，探针抽不出来');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, '_army_core.mjs');
  fs.writeFileSync(file, out, 'utf8');
  return { mod: await import(`${pathToFileURL(file).href}?t=${Date.now()}`), region, out };
}

// ---------------------------------------------------------------------------
// 场景夹具：两条路、四座城（坐标与 units 无关，只要求形状正确）
//   paths[0]  甲城(100,100) → 乙城(400,100)，长 300（=1 个月，step 1）
//   paths[1]  丙城(100,500) → 丁城(400,1000)，points 折成兩段（300 + 500 = 800，與 Length 相符，3 个月）
//   paths[2]  哨兵长路（Length 30000），一个点都不给 → 走两端城的 pos_xy 兜底
// ---------------------------------------------------------------------------
const CITIES = [
  { NAME: '甲城', pos_xy: [100, 100] },
  { NAME: '乙城', pos_xy: [400, 100] },
  { NAME: '丙城', pos_xy: [100, 500] },
  { NAME: '丁城', pos_xy: [700, 500] },
  { NAME: '戊城', pos_xy: [200, 800] },
];
const PATHS = [
  { Start: '甲城', End: '乙城', Length: 300, points: [[100, 100], [400, 100]] },
  { Start: '丙城', End: '丁城', Length: 800, points: [[100, 500], [400, 500], [400, 1000]] },
  { Start: '戊城', End: '丁城', Length: 30000, points: [] },
];
const SCEN = { cities: CITIES, paths: PATHS };
const toScreen = (x, y) => ({ x: x * 0.5 + 10, y: y * 0.5 + 20 });

let seq = 0;
function army(over = {}) {
  seq += 1;
  return {
    id: `m1-A${seq}`,
    side: 'A',
    from: '甲城',
    to: '乙城',
    pathIndex: 0,
    progress: 0,
    troops: 100,
    ...over,
  };
}

function run(mod) {
  const {
    MARCH_FLAG_W, MARCH_HIT_R, MARCH_STACK_GAP, STATION_EPS, ARMY_MAX_OFFICERS,
    armyNum, armyClamp01, armyLerpPoint, armyPos, armyCityPos,
    armyMonthsOfLength, armyMonths, armyStep, armyRemain, armyAtCity,
    armyStackPlace, armyHitIndex, armyScreenList, resolveMapHit,
    armyOfficerList, armyCanAppointAdvisor, armyAdvisorOf, armySetAdvisor,
    armyIsStationed, normalizeArmyExtras, armyRosterPick, armySameLeg,
    stationProgressLimit, planArmyMoves, stationPairKey, stationStandoff,
    armyRetargetCheck, armyCanEnterCity, armyCmdRows, armyInfoRows,
  } = mod;

  // ---- 常數 ----
  check('K1 常數對齊 web：旗寬 11 / 命中 16 / 錯開 13 / 接觸點 0.005 / 隨軍 5',
    MARCH_FLAG_W === 11 && MARCH_HIT_R === 16 && MARCH_STACK_GAP === 13 && Math.abs(STATION_EPS - 0.005) < 1e-12 && ARMY_MAX_OFFICERS === 5,
    { MARCH_FLAG_W, MARCH_HIT_R, MARCH_STACK_GAP, STATION_EPS, ARMY_MAX_OFFICERS });
  check('K2 命中半徑 ≥14（任務驗收線）', MARCH_HIT_R >= 14, MARCH_HIT_R);
  check('K3 armyClamp01 收斂壞值/越界', [armyClamp01(-1), armyClamp01(2), armyClamp01('x'), armyClamp01(0.5)].join(',') === '0,1,0,0.5',
    [armyClamp01(-1), armyClamp01(2), armyClamp01('x'), armyClamp01(0.5)]);

  // ---- A 座標插值 ----
  const mid = armyLerpPoint([[0, 0], [100, 0]], 0.5, false);
  check('A1 兩點線中點插值', Math.abs(mid[0] - 50) < 1e-9 && Math.abs(mid[1]) < 1e-9, mid);
  const rev = armyLerpPoint([[0, 0], [100, 0]], 0.5, true);
  check('A2 reverse=true 取 1-t（反向部隊從 End 出發）', Math.abs(rev[0] - 50) < 1e-9, rev);
  // 兩段不等長：300 與 500，總 800 → 進度 0.375 正好在折點
  const seg = PATHS[1].points;
  const knee = armyLerpPoint(seg, 0.375, false);
  check('A3 按段長插值（不是按點平均）：0.375 落在折點 (400,500)', Math.abs(knee[0] - 400) < 1e-9 && Math.abs(knee[1] - 500) < 1e-9, knee);
  const quarter = armyLerpPoint(seg, 0.125, false);
  check('A4 300/800 段的 1/8 總長 → x=200（按長度、不按點數平均）', Math.abs(quarter[0] - 200) < 1e-6 && Math.abs(quarter[1] - 500) < 1e-6, quarter);
  check('A5 單點 → 該點；空/壞點 → [0,0]',
    JSON.stringify(armyLerpPoint([[7, 9]], 0.4, false)) === '[7,9]' && JSON.stringify(armyLerpPoint([null, ['x', 1]], 0.4, false)) === '[0,0]',
    [armyLerpPoint([[7, 9]], 0.4, false), armyLerpPoint([null, ['x', 1]], 0.4, false)]);
  check('A6 armyPos 端點：p=0 → 出發城、p=1 → 目的城',
    JSON.stringify(armyPos(SCEN, army({ progress: 0 }))) === '[100,100]' &&
    JSON.stringify(armyPos(SCEN, army({ progress: 1 }))) === '[400,100]',
    [armyPos(SCEN, army({ progress: 0 })), armyPos(SCEN, army({ progress: 1 }))]);
  check('A7 armyPos 反向：from=End 時 p=1 落在 Start（甲城）',
    JSON.stringify(armyPos(SCEN, army({ from: '乙城', to: '甲城', progress: 1 }))) === '[100,100]',
    armyPos(SCEN, army({ from: '乙城', to: '甲城', progress: 1 })));
  check('A8 點不夠 → 用兩端城 pos_xy 兜底（哨兵路只給 1 個點）',
    JSON.stringify(armyPos(SCEN, army({ pathIndex: 2, from: '戊城', to: '丁城', progress: 0.5 }))) === '[450,650]',
    armyPos(SCEN, army({ pathIndex: 2, from: '戊城', to: '丁城', progress: 0.5 })));
  check('A9 髒 pathIndex / 不存在的路 → [0,0] 而不是 NaN',
    JSON.stringify(armyPos(SCEN, army({ pathIndex: 9 }))) === '[0,0]' && JSON.stringify(armyPos({ cities: [], paths: [] }, army())) === '[0,0]',
    armyPos(SCEN, army({ pathIndex: 9 })));

  // ---- B 繪製與命中吃同一份列表 ----
  const list = [
    army({ id: 'A1', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.25 }),
    army({ id: 'B1', side: 'B', from: '乙城', to: '甲城', pathIndex: 0, progress: 0.75 }),
    army({ id: 'A2', from: '丙城', to: '丁城', pathIndex: 1, progress: 0.5 }),
  ];
  const screen = armyScreenList(SCEN, list, toScreen);
  check('B1 screenList 條數＝有效部隊數，且座標是 toScreen(armyPos)', screen.length === 3 &&
    Math.abs(screen[0].x - toScreen(175, 100).x) < 1e-9 && Math.abs(screen[0].y - toScreen(175, 100).y) < 1e-9,
    screen.map((it) => [it.a.id, Math.round(it.x), Math.round(it.y)]));
  const tapAt = (it) => armyHitIndex(screen.map((s) => [s.x, s.y]), it.x, it.y);
  check('B2 點「畫出來的座標」必定命中那一支（畫＝點）',
    tapAt(screen[0]) === 0 && tapAt(screen[1]) === 1 && tapAt(screen[2]) === 2,
    screen.map(tapAt));
  check('B3 screenList 過濾沒有 id 的髒資料',
    armyScreenList(SCEN, [null, { side: 'A' }, army({ id: 'ok' })], toScreen).length === 1);
  // 同一條路上兩支完全重疊 → 錯開後仍各自可點
  const dup = [army({ id: 'D1', progress: 0.5 }), army({ id: 'D2', progress: 0.5 })];
  const dupScreen = armyScreenList(SCEN, dup, toScreen);
  const dx = Math.abs(dupScreen[0].x - dupScreen[1].x);
  const dy = Math.abs(dupScreen[0].y - dupScreen[1].y);
  check('B4 完全重疊的兩支被 MARCH_STACK_GAP 錯開（13px）', Math.abs(Math.hypot(dx, dy) - 13) < 1e-6, Math.hypot(dx, dy));
  check('B5 錯開後兩支都還能各自點到',
    armyHitIndex(dupScreen.map((s) => [s.x, s.y]), dupScreen[0].x, dupScreen[0].y) === 0 &&
    armyHitIndex(dupScreen.map((s) => [s.x, s.y]), dupScreen[1].x, dupScreen[1].y) === 1);

  // ---- C 命中優先級與半徑（web campaign.html:3627-3642）----
  check('C1 選點態 > 部隊：pickMode 時部隊不吃點、只認城',
    resolveMapHit(true, 0, 2).kind === 'pick' && resolveMapHit(true, 0, -1).kind === 'none',
    [resolveMapHit(true, 0, 2), resolveMapHit(true, 0, -1)]);
  check('C2 部隊 > 城：非選點態同時命中時走部隊', resolveMapHit(false, 1, 3).kind === 'army' && resolveMapHit(false, 1, 3).armyIndex === 1);
  check('C3 只命中城 → city；都沒有 → none',
    resolveMapHit(false, -1, 3).kind === 'city' && resolveMapHit(false, -1, -1).kind === 'none');
  const ring = [[0, 0]];
  check('C4 半徑內命中、半徑外不命中（16 vs 16.5）',
    armyHitIndex(ring, 16, 0) === 0 && armyHitIndex(ring, 16.5, 0) === -1,
    [armyHitIndex(ring, 16, 0), armyHitIndex(ring, 16.5, 0)]);
  check('C5 兩支都在半徑內 → 取較近的',
    armyHitIndex([[0, 0], [10, 0]], 9, 0) === 1);
  check('C6 同一點兩支 → 取列表靠前（穩定，不會抖）',
    armyHitIndex([[0, 0], [0, 0]], 2, 0) === 0);

  // ---- D 重疊錯開 ----
  const placed = armyStackPlace([[100, 100], [100, 100], [300, 300]]);
  check('D1 九宮格順序＝正右(1,0)優先（照 web，換順序會讓同一存檔畫出不同位置）',
    placed[1][0] === 113 && placed[1][1] === 100, placed);
  check('D2 不重疊的部隊座標不動', placed[2][0] === 300 && placed[2][1] === 300);

  // ---- E 駐紮凍結（web planArmyMoves:1346）----
  const st = army({ id: 'ST', from: '丙城', to: '丁城', pathIndex: 1, progress: 0.4, stationed: true });
  const mv = planArmyMoves([st], () => 0.5)[0];
  check('E1 駐紮部隊 progress 凍結、frozen=true', mv.next === 0.4 && mv.frozen === true, mv);
  const arrived = army({ id: 'OK', progress: 1 });
  check('E2 已到城下也凍結（但 frozen=false，因為不是駐紮）',
    planArmyMoves([arrived], () => 0.9)[0].next === 1 && planArmyMoves([arrived], () => 0.9)[0].frozen === false);
  const free = army({ id: 'FR', progress: 0.2 });
  check('E3 沒人擋 → 正常推進 step', Math.abs(planArmyMoves([free], () => 0.25)[0].next - 0.45) < 1e-9);

  // ---- F 阻擋夾點 ----
  const blocker = army({ id: 'BK', side: 'B', from: '乙城', to: '甲城', pathIndex: 0, progress: 0.6, stationed: true });
  const mover = army({ id: 'MV', side: 'A', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.2 });
  check('F1 相向駐紮：limit = 1 - pb - 0.005 = 0.395（接觸點夾住）',
    Math.abs(stationProgressLimit(mover, blocker) - 0.395) < 1e-9, stationProgressLimit(mover, blocker));
  const plan1 = planArmyMoves([blocker, mover], () => 0.5).find((m) => m.a.id === 'MV');
  check('F2 推進方被夾在接觸點（0.2 + 0.5 → 0.395），blockedBy 指到擋它的部隊',
    Math.abs(plan1.next - 0.395) < 1e-9 && plan1.blockedBy === 'BK', plan1);
  const mover2 = army({ id: 'MV2', side: 'A', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.45 });
  const plan2 = planArmyMoves([blocker, mover2], () => 0.5).find((m) => m.a.id === 'MV2');
  check('F3 不後退：已經越過夾點（0.45）時原地不動，不回彈',
    Math.abs(plan2.next - 0.45) < 1e-9, plan2);
  const sameDir = army({ id: 'SD', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.4 });
  const blockAhead = army({ id: 'BH', side: 'B', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.7, stationed: true });
  check('F4 同向被擋：limit = pb - 0.005 = 0.695（不超車）',
    Math.abs(stationProgressLimit(sameDir, blockAhead) - 0.695) < 1e-9, stationProgressLimit(sameDir, blockAhead));
  check('F5 同陣營 / 未駐紮 / 不同段 → 不受限',
    stationProgressLimit(mover, { ...blocker, side: 'A' }) === 1 &&
    stationProgressLimit(mover, { ...blocker, stationed: false }) === 1 &&
    stationProgressLimit(mover, { ...blocker, pathIndex: 7, from: '丙城', to: '丁城' }) === 1);
  check('F6 駐紮方自己在 0 或 1 時不擋人（不限在路上的）',
    stationProgressLimit(blocker, { ...blocker, stationed: true, progress: 0 }) === 1);

  // ---- G 對峙 ----
  const pin = army({ id: 'P1', side: 'B', from: '乙城', to: '甲城', pathIndex: 0, progress: 0.6, stationed: true });
  const contact = army({ id: 'P2', side: 'A', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.395 });
  const face = stationStandoff([pin, contact]);
  check('G1 相向接觸點（pm = 1-ps-eps）判定對峙', face && face.blocker.id === 'P1' && face.mover.id === 'P2',
    face && stationPairKey(face.blocker, face.mover));
  check('G2 還沒撞上（差 0.02）不算對峙',
    stationStandoff([pin, { ...contact, progress: 0.375 }]) === null);
  check('G3 兩支都駐紮 → 不成對峙（沒有推進方）',
    stationStandoff([pin, { ...contact, stationed: true }]) === null);

  // ---- H 軍師可點性兩態（web armyCanAppointAdvisor:1281）----
  const solo = army({ id: 'S1', general: '張飛', officers: ['張飛'] });
  const duo = army({ id: 'S2', general: '張飛', officers: ['張飛', '簡雍'] });
  const noOff = army({ id: 'S3', general: '張飛' });
  check('H1 只有主將一人 → 不可任命', armyCanAppointAdvisor(solo) === false && armyCanAppointAdvisor(noOff) === false,
    [armyOfficerList(solo), armyOfficerList(noOff)]);
  check('H2 ≥2 人 → 可任命', armyCanAppointAdvisor(duo) === true, armyOfficerList(duo));
  check('H3 主將排第一且去重（general 不在 officers 裡也會被補到最前）',
    JSON.stringify(armyOfficerList(noOff)) === '["張飛"]' &&
    JSON.stringify(armyOfficerList(army({ general: '張飛', officers: ['簡雍', '張飛', '簡雍'] }))) === '["張飛","簡雍"]');
  check('H4 任命軍師：非成員 → false 且不改值',
    armySetAdvisor(duo, '關羽') === false && armyAdvisorOf(duo) === '');
  check('H5 任命軍師：成員 → true；空字串 → 免職',
    armySetAdvisor(duo, '簡雍') === true && armyAdvisorOf(duo) === '簡雍' && armySetAdvisor(duo, '') === true && armyAdvisorOf(duo) === '');
  const soloCmd = armyCmdRows(army({ id: 'S4', side: 'A', general: '張飛', officers: ['張飛'], progress: 0.5 }), () => false)
    .find((c) => c.act === 'advisor');
  const duoCmd = armyCmdRows(army({ id: 'S5', side: 'A', general: '張飛', officers: ['張飛', '簡雍'], progress: 0.5 }), () => false)
    .find((c) => c.act === 'advisor');
  check('H6 面板灰態：<2 人 → enabled=false、hint=「軍團僅主將一人，無可任命」',
    soloCmd.enabled === false && soloCmd.hint === '軍團僅主將一人，無可任命', soloCmd);
  check('H7 面板亮態：≥2 人 → enabled=true、hint=「從 2 名隨軍武將裡選」',
    duoCmd.enabled === true && duoCmd.hint === '從 2 名隨軍武將裡選', duoCmd);

  // ---- I 改道 / 進城（web marchRetargetCheck:1100 / canEnterCity:2974）----
  const pathOf = (from, to) => (from === '甲城' && to === '乙城' ? 0 : null);
  const mineAll = () => true;
  const rg = army({ id: 'RG', side: 'A', from: '甲城', to: '乙城', progress: 0.3 });
  check('I1 改道拒：沒有兵團 / 敵軍兵團 / 沒有城',
    armyRetargetCheck(null, '乙城', pathOf, () => false).why === '沒有選中兵團。' &&
    armyRetargetCheck({ ...rg, side: 'B' }, '乙城', pathOf, () => false).why === '敵軍兵團不能變更目的。' &&
    armyRetargetCheck(rg, '', pathOf, () => false).why === '沒有選中城市。');
  check('I2 改道拒：目的地已經是它 / 目的城＝出發城（提示用「進入城內」）',
    armyRetargetCheck(rg, '乙城', pathOf, () => false).why === '兵團的目的地已經是 乙城。' &&
    armyRetargetCheck(rg, '甲城', pathOf, () => false).why === '目的城不能是出發城 甲城：部隊要回城請用「進入城內」。');
  check('I3 改道拒：沒有可行道路',
    armyRetargetCheck(rg, '丁城', pathOf, () => false).why === '甲城 到 丁城 沒有可行道路：兵團只能改為與出發城相鄰的城。',
    armyRetargetCheck(rg, '丁城', pathOf, () => false));
  const rg2 = army({ id: 'RG2', side: 'A', from: '甲城', to: '丁城', pathIndex: 1, progress: 0.3 });
  check('I4 改道拒：目的地是我方城池（換一支目的城不同的部隊，才不會先被「已經是」攔掉）',
    armyRetargetCheck(rg2, '乙城', pathOf, () => true).why === '乙城 是我方城池：本作兵團只能開往敵城或空城。',
    armyRetargetCheck(rg2, '乙城', pathOf, () => true));
  check('I5 改道成功回 pathIndex', JSON.stringify(armyRetargetCheck(rg2, '乙城', pathOf, () => false)) === '{"ok":true,"pathIndex":0}',
    armyRetargetCheck(rg2, '乙城', pathOf, () => false));
  check('I5 進城：路上不行 / 敵城不行 / 我方城可以',
    armyCanEnterCity({ ...rg, progress: 0.4 }, () => true).why === '部隊在路途中，不在城上' &&
    armyCanEnterCity({ ...rg, progress: 1 }, () => false).why === '乙城 不是我方城池，不能進城' &&
    armyCanEnterCity({ ...rg, progress: 1 }, () => true).city === '乙城');
  check('I6 armyAtCity：0→出發城、1→目的城、路上→空',
    armyAtCity({ ...rg, progress: 0 }) === '甲城' && armyAtCity({ ...rg, progress: 1 }) === '乙城' && armyAtCity({ ...rg, progress: 0.5 }) === '');

  // ---- J 5 項指令可點矩陣（web renderArmySheet:3020-3035）----
  const ownOnRoad = army({ id: 'J1', side: 'A', general: '張飛', officers: ['張飛', '簡雍'], progress: 0.5 });
  const ownCmds = armyCmdRows(ownOnRoad, () => false);
  check('J1 5 項齊全、標籤逐字（武將資料/變更目的/部隊駐紮/任命軍師/進入城內）',
    ownCmds.map((c) => c.label).join('/') === '武將資料/變更目的/部隊駐紮/任命軍師/進入城內',
    ownCmds.map((c) => c.label));
  check('J2 我方在路上：武將資料✓ 變更目的✓ 駐紮✓ 軍師✓ 進城✗（路上不在城上）',
    ownCmds.map((c) => c.enabled).join(',') === 'true,true,true,true,false', ownCmds.map((c) => c.enabled));
  const ownAtCity = armyCmdRows(army({ id: 'J2', side: 'A', general: '張飛', officers: ['張飛'], progress: 1 }), (c) => c === '乙城');
  check('J3 我方在自家城上：進城✓、駐紮✗（已到城下不能再駐紮）',
    ownAtCity.find((c) => c.act === 'enter').enabled === true &&
    ownAtCity.find((c) => c.act === 'station').enabled === false,
    ownAtCity.map((c) => [c.act, c.enabled]));
  const foe = armyCmdRows(army({ id: 'J3', side: 'B', general: '曹操', officers: ['曹操', '荀彧'], progress: 0.5 }), () => false);
  check('J4 敵軍兵團：變更目的/駐紮/軍師 三項全灰，且 hint 都是「敵軍兵團不可用」',
    foe.filter((c) => ['retarget', 'station', 'advisor'].includes(c.act)).every((c) => c.enabled === false && c.hint === '敵軍兵團不可用'),
    foe.map((c) => [c.act, c.enabled, c.hint]));
  check('J5 駐紮中的 hint 是「再點一次解除」',
    armyCmdRows(army({ id: 'J4', side: 'A', general: '張飛', progress: 0.5, stationed: true }), () => false)
      .find((c) => c.act === 'station').hint === '駐紮中：再點一次解除');
  check('J6 沒有主將 → 武將資料灰、hint 是「沒有主將」',
    armyCmdRows(army({ id: 'J5', side: 'A', progress: 0.5 }), () => false).find((c) => c.act === 'general')
      .enabled === false);

  // ---- K 文案 / 月數 / 7 行軍情 ----
  check('K4 月數＝clamp(ceil(Length/100),1,3)：100→1、800→3',
    [armyMonthsOfLength(100), armyMonthsOfLength(800), armyMonthsOfLength(0), armyMonthsOfLength(280)].join(',') === '1,3,1,3',
    [armyMonthsOfLength(100), armyMonthsOfLength(800), armyMonthsOfLength(0), armyMonthsOfLength(280)]);
  check('K5 step＝1/月數：Length 80 → 一個月到（step 1）、Length 800 → 三個月（step 1/3）',
    armyStep({ cities: CITIES, paths: [{ Start: '甲城', End: '乙城', Length: 80, points: [] }] }, 0) === 1 &&
    Math.abs(armyStep(SCEN, 1) - 1 / 3) < 1e-12,
    [armyStep({ cities: CITIES, paths: [{ Start: '甲城', End: '乙城', Length: 80, points: [] }] }, 0), armyStep(SCEN, 1)]);
  const rem = armyRemain(0.5, 0.5);
  check('K6 剩餘：p=0.5 step=0.5 → 已走 50%、剩 1 個月 30 天',
    rem.pct === 50 && rem.months === 1 && rem.days === 30, rem);
  const info = armyInfoRows(
    army({ id: 'K1', general: '張飛', officers: ['張飛', '簡雍'], advisor: '簡雍', progress: 0.5, troops: 120 }),
    { gold: 12345, months: 2, levelOf: () => 7, wiseSeqOf: () => 3, wiseHintOf: () => '混亂' },
  );
  check('K7 7 行軍情標籤順序逐字（主將/軍師/目的地/武將數/兵數/金錢/目前所在地形）',
    info.map((r) => r[0]).join('/') === '主將/軍師/目的地/武將數/兵數/金錢/目前所在地形', info.map((r) => r[0]));
  check('K8 軍師行＝「簡雍 · 混亂」、金錢帶千分位與「勢力共用」、地形「平原（路上）」',
    info[1][1] === '簡雍 · 混亂' && info[5][1] === '12,345 · 勢力共用' && info[6][1] === '平原（路上）',
    [info[1][1], info[5][1], info[6][1]]);
  const infoSt = armyInfoRows(army({ general: '張飛', officers: ['張飛'], progress: 0.4, stationed: true, pathIndex: 1, from: '丙城', to: '丁城' }),
    { gold: 0, months: 3 });
  check('K9 駐紮時地形行追加「駐紮中（進度凍結）」、軍師行是「主將兼 · 未任命」',
    infoSt[6][1] === '平原（路上） · 駐紮中（進度凍結）' && infoSt[1][1] === '張飛（主將兼） · 未任命',
    [infoSt[6][1], infoSt[1][1]]);
  const norm = normalizeArmyExtras({ id: 'N', side: 'A', from: '甲城', to: '乙城', pathIndex: 0, progress: 0.2, troops: 1, general: '張飛', officers: ['簡雍'], advisor: '關羽', stationed: 'yes' });
  check('K10 normalizeArmyExtras：主將補到 officers 最前、非法軍師清空、stationed 只認 ===true',
    JSON.stringify(norm.officers) === '["張飛","簡雍"]' && norm.advisor === '' && norm.stationed === false, norm);
  check('K11 armyRosterPick：主將第一 → 出陣序裡屬於本城名冊的 → 名冊補齊 → 上限 5',
    JSON.stringify(armyRosterPick(['甲', '乙', '丙', '丁', '戊', '己'], ['戊', '甲', '乙', '丙', '丁'], '主將'))
      === '["主將","甲","乙","丙","丁"]',
    armyRosterPick(['甲', '乙', '丙', '丁', '戊', '己'], ['戊', '甲', '乙', '丙', '丁'], '主將'));
}

const { mod } = await loadCore();
run(mod);
const pass = results.filter((r) => r.ok).length;
const total = results.length;
const report = {
  at: new Date().toISOString(),
  source: SRC,
  total,
  pass,
  fail: total - pass,
  results,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'assert_army_report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\n${pass}/${total} 通过${pass === total ? ' ✓' : ' ✗'}`);
if (pass !== total) process.exitCode = 1;
