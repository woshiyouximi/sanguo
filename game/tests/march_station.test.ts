/**
 * 兵團指令補完（project/185）：駐紮 / 任命軍師 的純函數自檢。
 *
 * 和 tests/march_ui.test.ts 同一套手法：直接從 `web/campaign.html` 抽
 * `[[MARCH_STATION_CORE]]` 段，用 `new Function` 跑（不另寫鏡像，頁面壞了這裡就紅）。
 * 這一段刻意不碰 DOM / save / view，所以 `node --test` 直跑，不需要 jsdom。
 *
 * 覆蓋任務書 §B6 / §C9 的六條硬指標：
 *   · 駐紮凍結進度、取消駐紮恢復推進
 *   · 接觸即停（停在 1 - 駐紮方 progress 的接觸點，不多走一步）
 *   · 不越段（不同 from/to 或不同 pathIndex 的部隊互不影響）
 *   · 舊檔缺欄位默認不駐紮、軍師必須是本兵團 officers 成員、更換生效、序列化往返
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Army = {
  id: string;
  side: 'A' | 'B';
  from: string;
  to: string;
  pathIndex: number;
  progress: number;
  troops: number;
  general?: string;
  officers?: string[];
  advisor?: string;
  stationed?: boolean;
};

type AdvisorRow = { name: string; seq: number; hint: string; lv: number; isLeader: boolean; picked: boolean };

type Move = {
  army: Army;
  progress: number;
  arrived: boolean;
  frozen: boolean;
  blockedBy: string | null;
};

type Api = {
  STATION_EPS: number;
  ARMY_MAX_OFFICERS: number;
  normalizeArmyExtras(a: unknown): Army;
  armyOfficerList(a: unknown): string[];
  armyOfficerNames(roster: unknown, general: unknown): string[];
  armyRosterPick(queue: unknown, roster: unknown, general: unknown, max?: number): string[];
  armyCanAppointAdvisor(a: unknown): boolean;
  armyAdvisorOf(a: unknown): string;
  armySetAdvisor(a: unknown, name: unknown): boolean;
  armyIsStationed(a: unknown): boolean;
  marchSameLeg(a: unknown, b: unknown): boolean;
  stationProgressLimit(mover: unknown, blocker: unknown): number;
  planArmyMoves(list: unknown, stepOf?: (a: Army, p: number) => number): Move[];
  stationPairKey(blocker: unknown, mover: unknown): string;
  stationStandoff(list: unknown): { blocker: Army; mover: Army } | null;
};

const HTML = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

function pickCore(): Api {
  const hit = HTML.match(/\/\/ \[\[MARCH_STATION_CORE\]\][^\n]*\n([\s\S]*?)\/\/ \[\[\/MARCH_STATION_CORE\]\]/);
  assert.ok(hit, 'campaign.html 裡找不到 [[MARCH_STATION_CORE]] 段');
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const marchStep = () => 1 / 3;   // 一個月走三分之一（頁面 MARCH_PER_MONTH，短路段才有 1/3）
  const make = new Function('marchStep', 'clamp01', `${hit[1]}
    return { STATION_EPS, ARMY_MAX_OFFICERS, normalizeArmyExtras, armyOfficerList, armyOfficerNames,
      armyRosterPick, armyCanAppointAdvisor, armyAdvisorOf, armySetAdvisor, armyIsStationed,
      marchSameLeg, stationProgressLimit, planArmyMoves, stationPairKey, stationStandoff };`);
  return make(marchStep, clamp01) as Api;
}

const C = pickCore();
const EPS = 1e-9;
const near = (got: number, want: number, msg?: string) =>
  assert.ok(Math.abs(got - want) < EPS, `${msg || ''} got=${got} want=${want}`);

/** 張三（主將）從 A 城打 B 城，路上已走 40% */
function army(over: Partial<Army> = {}): Army {
  return {
    id: 'm1-1', side: 'A', from: 'A城', to: 'B城', pathIndex: 3,
    progress: 0.4, troops: 100, general: '張三',
    officers: ['張三', '李四', '王五'], advisor: '', stationed: false,
    ...over,
  };
}

const moveOf = (list: Army[], id: string) => C.planArmyMoves(list).find((m) => m.army.id === id)!;

// ─────────────────────────────────────────────────────────────
// A. 資料模型 / 舊檔相容
// ─────────────────────────────────────────────────────────────
test('舊檔缺 officers/advisor/stationed：補成主將一人、主將兼、不駐紮', () => {
  const old = { id: 'm1-1', side: 'A', from: 'A城', to: 'B城', pathIndex: 3, progress: 0.4, troops: 100, general: '張三' };
  const a = C.normalizeArmyExtras(old);
  assert.deepEqual(a.officers, ['張三'], '舊檔要補成「只有主將一人」');
  assert.equal(a.advisor, '', '沒任命軍師＝空字串（畫面寫「主將兼」）');
  assert.equal(a.stationed, false, '缺 stationed 一律當「沒駐紮」');
  assert.equal(C.armyIsStationed(a), false);
  // 未知鍵一律原樣留著（存檔升級不能吞欄位）
  const weird = C.normalizeArmyExtras({ ...old, mark: 'keep', reported: true });
  assert.equal((weird as unknown as { mark: string }).mark, 'keep');
  assert.equal((weird as unknown as { reported: boolean }).reported, true);
});

test('normalize：主將一定在 officers 裡，重複名只留一份，非字串丟掉', () => {
  assert.deepEqual(C.normalizeArmyExtras(army({ officers: ['李四'] })).officers, ['張三', '李四']);
  assert.deepEqual(C.normalizeArmyExtras(army({ officers: ['張三', '張三', '李四'] })).officers, ['張三', '李四']);
  assert.deepEqual(C.normalizeArmyExtras(army({ officers: [' 李四 ', '', null, 7] as unknown as string[] })).officers,
    ['張三', '李四']);
  assert.deepEqual(C.normalizeArmyExtras(army({ officers: '不是陣列' as unknown as string[] })).officers, ['張三']);
});

test('advisor 不是 officers 成員 → 一律清空（手改檔也走這條校驗）', () => {
  assert.equal(C.normalizeArmyExtras(army({ advisor: '李四' })).advisor, '李四');
  assert.equal(C.normalizeArmyExtras(army({ advisor: '外人' })).advisor, '');
  assert.equal(C.armyAdvisorOf(army({ advisor: '外人' })), '');
  assert.equal(C.armyAdvisorOf(army({ advisor: '王五' })), '王五');
  assert.equal(C.armyAdvisorOf(army({ advisor: '' })), '');
});

test('任命/更換/免職：非成員回 false 且不改原值；空字串＝免職', () => {
  const a = army({ advisor: '李四' });
  assert.equal(C.armySetAdvisor(a, '王五'), true, '換人：王五在名單裡');
  assert.equal(a.advisor, '王五');
  assert.equal(C.armySetAdvisor(a, '外人'), false, '非成員必須拒絕');
  assert.equal(a.advisor, '王五', '拒絕時不能把現任軍師弄丟');
  assert.equal(C.armySetAdvisor(a, ''), true, '免職');
  assert.equal(a.advisor, '');
  assert.equal(C.armyAdvisorOf(a), '');
  assert.equal(C.armySetAdvisor(a, ' 李四 '), true, '前後空白要 trim');
  assert.equal(a.advisor, '李四');
});

test('序列化往返：officers/advisor/stationed 寫得進 JSON、讀回來不變', () => {
  const a = army({ advisor: '李四', stationed: true });
  const back = C.normalizeArmyExtras(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(back.officers, ['張三', '李四', '王五']);
  assert.equal(back.advisor, '李四');
  assert.equal(back.stationed, true);
  assert.equal(back.general, '張三');
  // 再過一次 normalize 也是幂等（存檔會被 normalizeCampaign + ensureCityState 各正規化一次）
  const twice = C.normalizeArmyExtras(C.normalizeArmyExtras(JSON.parse(JSON.stringify(a))));
  assert.deepEqual(C.armyOfficerList(twice), ['張三', '李四', '王五']);
  assert.equal(twice.advisor, '李四');
  assert.equal(twice.stationed, true);
});

test('出發名單 armyOfficerNames：主將在最前、按名冊順序去重、空值與非字串丟掉', () => {
  assert.deepEqual(C.armyOfficerNames(['李四', '王五'], '張三'), ['張三', '李四', '王五']);
  assert.deepEqual(C.armyOfficerNames(['張三', '李四'], '張三'), ['張三', '李四']);
  assert.deepEqual(C.armyOfficerNames(['', null, '李四', '李四', 3], '張三'), ['張三', '李四']);
  assert.deepEqual(C.armyOfficerNames(null, '張三'), ['張三']);
  assert.deepEqual(C.armyOfficerNames(['李四'], undefined), ['李四']);
});

// ─────────────────────────────────────────────────────────────
// C0. 隨軍名單怎麼帶（§C2）：出征頁隊列優先、本城名冊補齊、最多 5 人、不隔空調人
// ─────────────────────────────────────────────────────────────
test('armyRosterPick：主將第一、最多 5 人、去重', () => {
  const roster = ['張三', '李四', '王五', '趙六', '孫七', '周八'];
  const got = C.armyRosterPick([], roster, '張三');
  assert.deepEqual(got, ['張三', '李四', '王五', '趙六', '孫七'], '主將＋名冊前 4 人＝5 人上限');
  assert.equal(C.ARMY_MAX_OFFICERS, 5);
  assert.deepEqual(C.armyRosterPick([], ['張三'], '張三'), ['張三'], '只有主將一人＝一個人名單');
  assert.deepEqual(C.armyRosterPick([], [], undefined), [], '什麼都沒有就是空名單');
});

test('armyRosterPick：出征頁 5 槽優先，但只帶本城名冊裡的人（不隔空調人）', () => {
  const roster = ['張三', '李四', '王五', '趙六', '孫七', '周八'];
  // 隊列順序＝玩家在出征頁排的順序；吳九不是這座城的人 → 不跟著走
  assert.deepEqual(
    C.armyRosterPick(['孫七', '吳九', '張三', '李四'], roster, '張三'),
    ['張三', '孫七', '李四', '王五', '趙六'],
    '主將固定第一，其後按隊列順序，再按名冊補滿 5 人',
  );
  // 隊列就是全部 5 人時，名冊其餘的人不再擠進來
  assert.deepEqual(
    C.armyRosterPick(['張三', '李四', '王五', '趙六', '孫七'], roster, '張三'),
    ['張三', '李四', '王五', '趙六', '孫七'],
  );
  assert.deepEqual(C.armyRosterPick(['李四', '王五'], roster, '張三', 3), ['張三', '李四', '王五'],
    'max 參數可以再壓小');
});

test('可點性：至少 2 名武將才能任命軍師（只有主將＝灰）', () => {
  assert.equal(C.armyCanAppointAdvisor(army({ officers: ['張三'] })), false, '只有主將 → 不可任命');
  assert.equal(C.armyCanAppointAdvisor(army({ officers: ['張三', '李四'] })), true);
  // 舊檔：沒有 officers → normalize 後只剩主將 → 也應該是灰的
  const old = C.normalizeArmyExtras({ id: 'm1-9', side: 'A', from: 'A城', to: 'B城', pathIndex: 3, progress: 0.2, troops: 50, general: '張三' });
  assert.equal(C.armyCanAppointAdvisor(old), false, '舊檔預設 1 人 → 軍師鈕灰');
});

// ─────────────────────────────────────────────────────────────
// B. 駐紮：凍結 / 接觸即停 / 不越段 / 取消恢復
// ─────────────────────────────────────────────────────────────
test('駐紮凍結：stationed 的部隊推一個月 progress 不動，也不進 arrived', () => {
  const a = army({ stationed: true, progress: 0.4 });
  const m = moveOf([a], a.id);
  assert.equal(m.progress, 0.4, '駐紮中 progress 必須凍結');
  assert.equal(m.frozen, true);
  assert.equal(m.arrived, false);
  // 走三步也不動（推進點每幀/每月都會呼叫）
  let list = [a];
  for (let i = 0; i < 3; i++) {
    for (const it of C.planArmyMoves(list)) it.army.progress = it.progress;
  }
  assert.equal(a.progress, 0.4);
});

test('取消駐紮後恢復推進：下一步就是 progress + 1/3', () => {
  const a = army({ stationed: true, progress: 0.4 });
  assert.equal(moveOf([a], a.id).progress, 0.4);
  a.stationed = false;
  near(moveOf([a], a.id).progress, 0.4 + 1 / 3);
});

test('駐紮在起點/終點：progress 0 不動；progress 1 算 arrived（但仍是凍結的）', () => {
  const start = army({ id: 'a0', stationed: true, progress: 0 });
  const m0 = moveOf([start], 'a0');
  assert.equal(m0.progress, 0);
  assert.equal(m0.arrived, false);
  const end = army({ id: 'a1', stationed: true, progress: 1 });
  const m1 = moveOf([end], 'a1');
  assert.equal(m1.progress, 1);
  assert.equal(m1.arrived, true);
});

test('接觸即停：敵軍推進到 1 - 駐紮方 progress 就停下，再推也不越過', () => {
  const blocker = army({ id: 'A1', side: 'A', from: 'A城', to: 'B城', progress: 0.5, stationed: true });
  const mover = army({ id: 'B1', side: 'B', from: 'B城', to: 'A城', progress: 0.1, general: '敵將', officers: ['敵將'] });
  const contact = 1 - 0.5;                       // 相向兩軍進度相加＝1 的位置
  const list = [blocker, mover];
  // 第一個月够不着（0.1 + 1/3 < contact），照常走
  let m = C.planArmyMoves(list).find((x) => x.army.id === 'B1')!;
  near(m.progress, 0.1 + 1 / 3, '够不着接觸點時照常推進');
  assert.equal(m.blockedBy, null);
  mover.progress = m.progress;
  // 第二個月够得着：停在接觸點前一個容差的位置（＝偵測到的接觸點）
  m = C.planArmyMoves(list).find((x) => x.army.id === 'B1')!;
  near(m.progress, contact - C.STATION_EPS, '够得着就夾在接觸點');
  assert.equal(m.blockedBy, 'A1', 'blockedBy 要指向擋路的部隊');
  mover.progress = m.progress;
  // 第三、四個月：原地不動，絕不越過
  for (let i = 0; i < 2; i++) {
    m = C.planArmyMoves(list).find((x) => x.army.id === 'B1')!;
    near(m.progress, contact - C.STATION_EPS, '已經貼著接觸點就不能再往前');
  }
  assert.ok(mover.progress + blocker.progress <= 1, '兩軍進度相加不得 > 1（沒有互相穿過）');
});

test('一步跨得太大也只走到接觸點（不會跳過）', () => {
  const blocker = army({ id: 'A1', side: 'A', progress: 0.6, stationed: true, from: 'A城', to: 'B城' });
  const mover = army({ id: 'B1', side: 'B', from: 'B城', to: 'A城', progress: 0.05, officers: ['敵將'] });
  const m = C.planArmyMoves([blocker, mover], () => 1).find((x) => x.army.id === 'B1')!;
  near(m.progress, 1 - 0.6 - C.STATION_EPS);
});

test('不越段：不同 from/to、不同 pathIndex 的駐紮部隊不擋路', () => {
  const blocker = army({ id: 'A1', side: 'A', from: 'A城', to: 'B城', pathIndex: 3, progress: 0.5, stationed: true });
  const mover = army({ id: 'B1', side: 'B', from: 'C城', to: 'D城', pathIndex: 7, progress: 0.2, officers: ['敵將'] });
  near(C.stationProgressLimit(mover, blocker), 1, '不同路段 → 不限制');
  near(C.planArmyMoves([blocker, mover]).find((x) => x.army.id === 'B1')!.progress, 0.2 + 1 / 3);
  // 同一段但路徑索引不同（from/to 相同）仍算同一段
  assert.equal(C.marchSameLeg(mover, army({ from: 'C城', to: 'D城', pathIndex: 99 })), true);
  assert.equal(C.marchSameLeg(mover, blocker), false);
  assert.equal(C.marchSameLeg(army({ from: 'X', to: 'Y' }), army({ from: 'Y', to: 'X' })), true, '反向也算同一段');
});

test('同向：駐紮部隊在前面時推進方不許超車；駐紮方在後面則不擋', () => {
  const front = army({ id: 'A1', side: 'A', from: 'A城', to: 'B城', progress: 0.5, stationed: true });
  const behind = army({ id: 'B1', side: 'B', from: 'A城', to: 'B城', progress: 0.2, officers: ['敵將'] });
  near(C.planArmyMoves([front, behind]).find((x) => x.army.id === 'B1')!.progress, 0.5 - C.STATION_EPS);
  // 推進方已經在前面 → 不擋
  behind.progress = 0.8;
  near(C.planArmyMoves([front, behind]).find((x) => x.army.id === 'B1')!.progress, 1);
});

test('不駐紮 / 停在起點 / 已抵達的部隊都不擋路', () => {
  const mover = army({ id: 'B1', side: 'B', from: 'B城', to: 'A城', progress: 0.1 });
  near(C.stationProgressLimit(mover, army({ id: 'A1', side: 'A', from: 'A城', to: 'B城', progress: 0.5, stationed: false })), 1);
  near(C.stationProgressLimit(mover, army({ id: 'A2', side: 'A', from: 'A城', to: 'B城', progress: 0, stationed: true })), 1);
  near(C.stationProgressLimit(mover, army({ id: 'A3', side: 'A', from: 'A城', to: 'B城', progress: 1, stationed: true })), 1);
  // 同陣營不互相擋
  near(C.stationProgressLimit(mover, army({ id: 'A4', side: 'B', from: 'A城', to: 'B城', progress: 0.5, stationed: true })), 1);
  // 自己不會擋自己
  near(C.stationProgressLimit(mover, mover), 1);
});

test('stationStandoff：認出「駐紮方＝守、推進方＝攻」，沒接觸/不同段/已交錯都不算', () => {
  const blocker = army({ id: 'A1', side: 'A', from: 'A城', to: 'B城', progress: 0.5, stationed: true });
  const mover = army({ id: 'B1', side: 'B', from: 'B城', to: 'A城', progress: 1 - 0.5 - C.STATION_EPS });
  const got = C.stationStandoff([blocker, mover]);
  assert.ok(got, '貼著接觸點必須認成對峙');
  assert.equal(got!.blocker.id, 'A1', '阻擋方（駐紮那支）＝守');
  assert.equal(got!.mover.id, 'B1', '來襲方（推進那支）＝攻');
  // 順序顛倒也要認得
  assert.equal(C.stationStandoff([mover, blocker])!.blocker.id, 'A1');
  // 還沒接觸
  mover.progress = 0.2;
  assert.equal(C.stationStandoff([blocker, mover]), null);
  // 已交錯而過（相加 > 1）不算對峙 —— 那是行軍遭遇（armiesIntercept）的活
  mover.progress = 0.9;
  assert.equal(C.stationStandoff([blocker, mover]), null);
  // 不同路段
  mover.progress = 1 - 0.5 - C.STATION_EPS;
  mover.from = 'C城'; mover.to = 'D城'; mover.pathIndex = 7;
  assert.equal(C.stationStandoff([blocker, mover]), null);
  // 兩支都駐紮在同段 → 不是「推進方」
  mover.stationed = true;
  mover.from = 'B城'; mover.to = 'A城'; mover.pathIndex = 3;
  assert.equal(C.stationStandoff([blocker, mover]), null);
  // 配對鍵：同一對穩定、不同對不同
  assert.equal(C.stationPairKey(blocker, mover), 'A1>B1');
});

test('駐紮凍結不影響別人：一支駐紮、另一支同路正常推進（不擋同陣營）', () => {
  const a = army({ id: 'A1', progress: 0.4, stationed: true });
  const b = army({ id: 'A2', progress: 0.2, from: 'A城', to: 'B城' });
  const moves = C.planArmyMoves([a, b]);
  assert.equal(moves.find((m) => m.army.id === 'A1')!.progress, 0.4);
  near(moves.find((m) => m.army.id === 'A2')!.progress, 0.2 + 1 / 3);
});

// ─────────────────────────────────────────────────────────────
// C. 頁面接線（靜態契約：這幾條斷了，功能就是死的）
// ─────────────────────────────────────────────────────────────
test('campaign.html 接線：駐紮/軍師不再是灰字，浮層與開戰鏈都接上了', () => {
  assert.ok(HTML.includes('[[MARCH_STATION_CORE]]'), '缺純函數段標記');
  // 5 項命令還在（march_ui.test.ts 也守著），且兩項不再 disabled
  for (const act of ['general', 'retarget', 'station', 'advisor', 'enter']) {
    assert.ok(HTML.includes(`cmd('${act}'`), `缺命令 ${act}`);
  }
  assert.ok(HTML.includes('駐紮：停在路上、阻擋敵軍'), '缺駐紮灰字提示');
  assert.ok(!HTML.includes('原作此項即灰字'), '駐紮不該再寫「原作即灰字」');
  assert.ok(!HTML.includes('存檔無軍師欄位'), '軍師不該再寫「存檔無欄位」');
  // 軍師浮層
  assert.match(HTML, /id="advisorSheet"/);
  assert.match(HTML, /id="advisorList"/);
  assert.match(HTML, /id="advisorTtl"/);
  assert.match(HTML, /data-advisor="\$\{surEsc\(data\)\}"/, '軍師卡片要帶 data-advisor');
  assert.match(HTML, /\$\('advisorList'\)\.addEventListener\('click'/, '軍師浮層沒接點擊');
  // 推進：駐紮凍結與阻擋都在 advanceArmies 這一個推進點裡
  assert.match(HTML, /function advanceArmies\(list\) \{[\s\S]{0,260}?planArmyMoves\(/,
    'advanceArmies 沒走 planArmyMoves（駐紮/阻擋就不生效）');
  // 派兵入口帶名單（走 armyRosterFor：出征頁 5 槽優先、本城名冊補齊、上限 5）
  assert.match(HTML, /function armyRosterFor\(city, general\) \{[\s\S]*?DQ\.queueOf\(save, \[\]\)/,
    'armyRosterFor 沒讀編成頁/出陣順序（save.deployQueue）');
  assert.match(HTML, /function armyRosterFor\(city, general\) \{[\s\S]*?armyRosterPick\(queueNames, roster, general\)/,
    'armyRosterFor 沒走 armyRosterPick（上限/去重/主將在前）');
  assert.match(HTML, /function dispatchArmy\(to\) \{[\s\S]*?officers: armyRosterFor\(/,
    'dispatchArmy 沒把隨軍名單寫進 officers');
  assert.match(HTML, /function spawnAiArmy\(atk\) \{[\s\S]*?officers: armyRosterPick\(/,
    'spawnAiArmy 沒補 officers');
  assert.ok(!/garrisonIn\(from\)\?\.officers[\s\S]{0,80}?splice|officers \|\| \[\]\)\.splice/.test(HTML),
    '不能把武將從城裡移走（隨軍只是名單）');
  // 舊檔升級路徑
  assert.match(HTML, /s\.armies = Array\.isArray\(s\.armies\)[\s\S]{0,240}?normalizeArmyExtras\(a\)/,
    'normalizeCampaign 沒升級舊檔的部隊欄位');
  assert.match(HTML, /a\.id = typeof a\.id === 'string'[\s\S]{0,200}?normalizeArmyExtras\(a\)/,
    'ensureCityState 沒二次正規化部隊欄位');
  // 遭遇戰只有一條開戰鏈：駐紮對峙走 startEncounter → encounterUrl
  assert.match(HTML, /function handleMarchEvents\(batch\) \{[\s\S]*?stationStandoff\(list\)/,
    'handleMarchEvents 沒接駐紮對峙');
  assert.match(HTML, /stationStandoff\(list\)[\s\S]{0,2200}?startEncounter\(stand\.blocker, stand\.mover, note\)/,
    '駐紮對峙沒走 startEncounter（自造第二套開戰）');
  assert.ok(!/location\.href = encounterUrl\(/.test(HTML.replace(/function startEncounter[\s\S]*?\n\}/, '')),
    'encounterUrl 只該在 startEncounter 裡被跳轉');
  // 軍師上戰場：?wise= 由 advisor 的軍師技 seq 拼出來
  assert.match(HTML, /const advisorName = armyAdvisorOf\(a\);[\s\S]{0,220}?q\.set\('wise', String\(seq\)\)/,
    'encounterUrl / deploy 沒把軍師技 seq 傳成 ?wise=');
  assert.match(HTML, /import \{ listWisdomChoices, wiseHintOf \} from '\.\.\/dist\/core\/wises\.js'/,
    '沒 import wises 的選招邏輯');
  // 可點性只看「軍團裡武將數 ≥ 2」：只有主將一人時灰，提示講人少而不是講存檔
  assert.match(HTML, /軍團僅主將一人，無可任命/, '缺「只有主將一人」的灰字提示');
  assert.match(HTML, /cmd\('advisor', '任命軍師', own[\s\S]{0,320}?armyCanAppointAdvisor\(a\)/,
    '任命軍師的可用性沒接 armyCanAppointAdvisor（≥2 人才亮）');
  assert.match(HTML, /function renderAdvisorSheet\(a\) \{[\s\S]{0,600}?if \(!armyCanAppointAdvisor\(army\)\)/,
    'renderAdvisorSheet 少了「人少不開」的雙保險');
});

test('頁面的軍師/駐紮函數都在（浮層與命令的落點）', () => {
  for (const fn of ['armyWiseSeq', 'armyAdvisorRows', 'renderAdvisorSheet', 'toggleStation',
    'normalizeArmyExtras', 'stationProgressLimit', 'planArmyMoves', 'stationStandoff',
    'armyOfficerNames', 'armyOfficerList', 'armyAdvisorOf', 'armySetAdvisor']) {
    assert.match(HTML, new RegExp(`function ${fn}\\(`), `缺 function ${fn}`);
  }
  // 7 行軍情改成讀真值：軍師走 armyAdvisorOf、武將數走 armyOfficerList
  assert.match(HTML, /function armyInfoRows\(a\) \{[\s\S]*?armyAdvisorOf\(a\)/);
  assert.match(HTML, /function armyInfoRows\(a\) \{[\s\S]*?armyOfficerList\(a\)/);
  // 兵團指令的兩個新分支
  assert.match(HTML, /if \(act === 'station'\) \{ toggleStation\(a\); return; \}/);
  assert.match(HTML, /if \(act === 'advisor'\) \{ renderAdvisorSheet\(a\); return; \}/);
});

// 這一段只用來斷言「軍師候選列」的形狀（頁面那支要 DOM，這裡斷言不到，這裡斷言 API 契約）
test('armyAdvisorRows 在頁面裡是「隨軍武將 × 當前可用軍師技」的列表（靜態檢查）', () => {
  const hit = HTML.match(/function armyAdvisorRows\(a\) \{[\s\S]*?\n\}/);
  assert.ok(hit, '缺 armyAdvisorRows');
  assert.match(hit![0], /armyOfficerList\(a\)\.map\(/, '候選必須來自 officers');
  assert.match(hit![0], /armyWiseSeq\(name\)/, '每個候選要算自己的軍師技');
  const rowsType: AdvisorRow[] = [];
  assert.equal(rowsType.length, 0);
});
