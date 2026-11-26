// @ts-nocheck
/**
 * [F-06] 路上遭遇戰真打（Cocos 側）契約 + 行為自檢。
 *
 * 背景（修 F-06）：`CampaignRoot.advanceArmiesMonth()` 的對峙分支以前直接
 * `Math.random()` 按兵力折算勝負，玩家看不到戰鬥；web 側（`web/campaign.html:4547
 * startEncounter()`）是跳戰鬥頁真打。正式版要跟 web 一樣進 `Battle` 場景打。
 *
 * 這個測試守四條硬指標（任務書 §F-06）：
 *   ① 遭遇分支含 `GameState.startBattle()` / `loadScene('Battle')` 的入口，不再「只用」
 *      `Math.random()` 結算；`Math.random()` 只允許出現在 `?autoenc=1` 的調試兜底分支。
 *   ② 雙方（我方將名 + 兵力、敵方將名 + 兵力）真的被帶進戰鬥 loadout。
 *   ③ 戰後回寫函數存在：回大地圖時寫 `save.lastBattle`、復原勝方部隊（`applyPendingEncounter()`）。
 *   ④ `AUTO_ENCOUNTER` 默認 false（正式版必須真打），只有 `?autoenc=1` 才允許舊擲骰。
 *
 * 手法和 `tests/cocos_p1_port.test.ts` / `tests/march_station.test.ts` 一致：不 import
 * `game/cocos/assets/scripts/**`（會 TS1287），而是讀源碼文本做接線契約；
 * 純邏輯區（`[[ENCOUNTER_CORE]]`）再抽出來剝掉型別、`new Function` 真跑行為斷言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const COCOS = read('../cocos/assets/scripts/CampaignRoot.ts');

/** 取某個函式/方法的函式體（含簽名行到對應的 `}`），找不到回空字串。 */
function fnBody(src: string, name: string): string {
  const hit = new RegExp(`(?:function|private|public|protected)\\s+(?:static\\s+)?(?:async\\s+)?${name}\\s*\\(`).exec(src);
  if (!hit) return '';
  const at = hit.index;
  // 函式體的 `{`：跳過回傳型別裡的物件字面值（`): { battle: boolean } {` 的第一個 `{` 前面是 `:`）。
  // 判據：body 的 `{` 前一個非空白字元是 `)`、`}`、`>`、`]` 或型別名（`void`/`boolean`/`Promise<void>`）。
  let open = -1;
  for (let p = src.indexOf('{', at); p >= 0; p = src.indexOf('{', p + 1)) {
    let q = p - 1;
    while (q >= at && /\s/.test(src[q])) q -= 1;
    const prev = q >= at ? src[q] : '';
    if (/[)>}\w\]]/.test(prev)) {
      open = p;
      break;
    }
    if (src.indexOf('\n', p) < 0) break;
  }
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return '';
}

const ADVANCE = fnBody(COCOS, 'advanceArmiesMonth');
const START_BATTLE = fnBody(COCOS, 'startEncounterBattle');
const APPLY = fnBody(COCOS, 'applyPendingEncounter');
const END_INTERIOR = fnBody(COCOS, 'endInterior');
const START = fnBody(COCOS, 'start');

test('源码契约：純邏輯區 [[ENCOUNTER_CORE]] 存在，且 AUTO_ENCOUNTER 默認 false', () => {
  assert.match(COCOS, /\/\/ \[\[ENCOUNTER_CORE\]\]/, 'CampaignRoot.ts 缺少 [[ENCOUNTER_CORE]] 區頭');
  assert.match(COCOS, /\/\/ \[\[\/ENCOUNTER_CORE\]\]/, 'CampaignRoot.ts 缺少 [[/ENCOUNTER_CORE]] 區尾');
  const core = COCOS.match(/\/\/ \[\[ENCOUNTER_CORE\]\][^\n]*\n([\s\S]*?)\/\/ \[\[\/ENCOUNTER_CORE\]\]/);
  assert.ok(core, '抽不出 ENCOUNTER_CORE 段');
  assert.match(core[1], /const AUTO_ENCOUNTER(?::\s*boolean)? = false;/, 'AUTO_ENCOUNTER 必須默認 false（正式版必須真打）');
  // 默認 false 的註釋必須寫清楚「僅調試用，正式版必須真打」
  assert.match(core[1], /僅調試用/, 'AUTO_ENCOUNTER 註釋要標「僅調試用」');
});

test('源码契约：遭遇分支走 startEncounterBattle（進 Battle），Math.random 只剩調試兜底', () => {
  assert.ok(ADVANCE, '找不到 advanceArmiesMonth()');
  // ① 遭遇分支必須有真打入口
  assert.ok(ADVANCE.includes('startEncounterBattle(a, b)'), '對峙分支沒有調 startEncounterBattle(a, b)');
  // 真打入口在 Math.random 之前（先嚐試真打，只有 debugDice 才落到舊擲骰）
  const atBattle = ADVANCE.indexOf('startEncounterBattle(a, b)');
  const atRandom = ADVANCE.indexOf('Math.random()');
  assert.ok(atBattle >= 0, '真打入口缺失');
  assert.ok(atRandom < 0 || atBattle < atRandom, 'Math.random() 不應排在真打入口之前');
  // 擲骰必須受 autoEncounterOn 開關保護
  assert.ok(ADVANCE.includes('autoEncounterOn('), '舊擲骰前沒有 autoEncounterOn(...) 開關判斷');
  assert.ok(/debugDice/.test(ADVANCE), '舊擲骰兜底沒有 debugDice 分支');
  // 返回「本幀是否已發起戰鬥」，供 endInterior 早退
  assert.match(ADVANCE, /battle:\s*battleStarted/, 'advanceArmiesMonth() 回傳值缺少 battle 標記');
});

test('源码契约：戰鬥入口用 GameState.startBattle(BattleLaunch)，不再只擲骰', () => {
  assert.ok(START_BATTLE, '找不到 startEncounterBattle()');
  assert.ok(START_BATTLE.includes('GameState.startBattle('), 'startEncounterBattle() 沒走 GameState.startBattle()');
  assert.ok(START_BATTLE.includes('encounterLoadout('), 'startEncounterBattle() 沒組 encounterLoadout');
  // 開戰前兩支部隊都要從地圖撤掉（web startEncounter 同款），否則戰後會重複出現
  assert.ok(START_BATTLE.includes('GameState.removeArmy(mine.id)'), '開戰前沒撤我方部隊');
  assert.ok(START_BATTLE.includes('GameState.removeArmy(foe.id)'), '開戰前沒撤敵方部隊');
  // 開戰前先落跨場景快照（Battle → Campaign 是新場景實例）
  assert.ok(START_BATTLE.includes('storeEncounterPending('), '開戰前沒落跨場景快照');
  // 傳給 recordBattleResult 的城必須選「已在 owned 的我方城」（傳空字/敵城都會出錯）
  assert.match(START_BATTLE, /save\.owned\.includes\(mine\.from\)/, '沒把我方出征城當 recordBattleResult 的 city');
});

test('源码契约：戰後回寫函數存在（寫 lastBattle + 復原勝方部隊）', () => {
  assert.ok(APPLY, '找不到 applyPendingEncounter()');
  assert.ok(APPLY.includes('lastBattle'), 'applyPendingEncounter() 沒寫 save.lastBattle');
  assert.ok(APPLY.includes('GameState.addArmy('), 'applyPendingEncounter() 沒復原勝方部隊');
  assert.ok(APPLY.includes('encounterPlan('), 'applyPendingEncounter() 沒用 encounterPlan() 判勝負');
  assert.ok(APPLY.includes('GameState.persistSave()'), 'applyPendingEncounter() 沒落盤');
  // start() 必須在 resolveCaptureFlow() 之前回寫（招降面板靠 lastBattle 判勝負）
  assert.ok(START, '找不到 start()');
  const atApply = START.indexOf('this.applyPendingEncounter()');
  const atFlow = START.indexOf('SurrenderModel.resolveCaptureFlow(');
  assert.ok(atApply >= 0, 'start() 沒調 applyPendingEncounter()');
  assert.ok(atFlow >= 0, 'start() 找不到 resolveCaptureFlow()');
  assert.ok(atApply < atFlow, 'applyPendingEncounter() 必須排在 resolveCaptureFlow() 之前（先寫 lastBattle）');
});

test('源码契约：endInterior() 遇戰立刻收手（不繼續跑剩餘月份/AI）', () => {
  assert.ok(END_INTERIOR, '找不到 endInterior()');
  assert.ok(END_INTERIOR.includes('moved.battle'), 'endInterior() 沒檢查 moved.battle');
  const atCheck = END_INTERIOR.indexOf('moved.battle');
  const atAi = END_INTERIOR.indexOf('this.runMapAi()');
  assert.ok(atCheck >= 0 && atAi >= 0, 'endInterior() 找不到 moved.battle 或 runMapAi');
  assert.ok(atCheck < atAi, 'moved.battle 早退必須排在 runMapAi() 之前');
});

/** 抽出純邏輯區並剝掉型別後真跑（Node >=22.6 的型別剝離；這裡不 import cc） */
function pickCore(): Record<string, any> {
  const hit = COCOS.match(/\/\/ \[\[ENCOUNTER_CORE\]\][^\n]*\n([\s\S]*?)\/\/ \[\[\/ENCOUNTER_CORE\]\]/);
  assert.ok(hit, 'CampaignRoot.ts 裡找不到 [[ENCOUNTER_CORE]] 段');
  const js = stripTypeScriptTypes(hit[1]);
  // 段內沒有 import/'cc'，可直接 new Function；return 出要驗的符號
  return new Function(`${js}
    return { AUTO_ENCOUNTER, autoEncounterOn, encounterSides, encounterSoldiers, encounterLoadout,
      encounterPendingOf, parseEncounterPending, encounterPlan };`)();
}

const C = pickCore();

const army = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  side: 'A',
  from: '平原',
  to: '南皮',
  pathIndex: 2,
  progress: 0.4,
  troops: 60,
  general: '關羽',
  officers: ['關羽', '周倉'],
  advisor: '',
  stationed: false,
  ...over,
});

test('行為：AUTO_ENCOUNTER 默認 false；只有 ?autoenc=1 或常量 true 才放行舊擲骰', () => {
  assert.equal(C.AUTO_ENCOUNTER, false, 'AUTO_ENCOUNTER 必須默認 false');
  assert.equal(C.autoEncounterOn('1'), true, "?autoenc=1 要放行調試擲骰");
  assert.equal(C.autoEncounterOn('0'), false, "?autoenc=0 不能放行");
  assert.equal(C.autoEncounterOn(undefined), false, '沒帶參數必須真打');
  assert.equal(C.autoEncounterOn(null), false, 'null 必須真打');
  assert.equal(C.autoEncounterOn(true), true, 'true 視為開關打開');
});

test('行為：encounterSides() 把我方 A 挑成 mine，B 挑成 foe；非我方對撞回 null', () => {
  const a = army({ id: 'A1', side: 'A' });
  const b = army({ id: 'B1', side: 'B', troops: 80, general: '張遼' });
  const sides1 = C.encounterSides(a, b);
  assert.ok(sides1, 'A vs B 應該挑得出雙方');
  assert.equal(sides1.mine.id, 'A1');
  assert.equal(sides1.foe.id, 'B1');
  // 順序顛倒（我方是第二個）也要認得出
  const sides2 = C.encounterSides(b, a);
  assert.ok(sides2);
  assert.equal(sides2.mine.id, 'A1');
  assert.equal(sides2.foe.id, 'B1');
  // 兩支都是 AI（B vs B）→ 不是玩家戰，回 null（呼叫方退回調試折算）
  assert.equal(C.encounterSides(b, army({ id: 'B2', side: 'B' })), null);
  assert.equal(C.encounterSides(null, b), null);
});

test('行為：encounterSoldiers() 把大地圖兵力 clamp 到戰鬥內 1..100', () => {
  assert.equal(C.encounterSoldiers(0.4), 1);
  assert.equal(C.encounterSoldiers(-5), 1);
  assert.equal(C.encounterSoldiers(48), 48);
  assert.equal(C.encounterSoldiers(47.6), 48);
  assert.equal(C.encounterSoldiers(250), 100);
  assert.equal(C.encounterSoldiers('60'), 60);
  assert.equal(C.encounterSoldiers(undefined), 1);
});

test('行為：encounterLoadout() 帶雙方將名與兵力（BattleLaunch 契約）', () => {
  const mine = army({ troops: 240, general: '關羽' });
  const foe = army({ id: 'B1', side: 'B', from: '鄴', to: '平原', troops: 90, general: '張遼' });
  const loadout = C.encounterLoadout(
    mine,
    foe,
    { name: '關羽', str: 97, int: 75, level: 8, wise: 3 },
    { name: '張遼', str: 92, int: 78, level: 7, wise: null },
  );
  // 我方（A 側）
  assert.equal(loadout.gen, '關羽');
  assert.equal(loadout.genStr, 97);
  assert.equal(loadout.genInt, 75);
  assert.equal(loadout.genLevel, 8);
  assert.equal(loadout.wise, 3);
  assert.equal(loadout.soldiers, 100, '240 兵要 clamp 成 100');
  // 敵方（B 側）
  assert.equal(loadout.bgen, '張遼');
  assert.equal(loadout.bstr, 92);
  assert.equal(loadout.bint, 78);
  assert.equal(loadout.bsoldiers, 90);
  // 兵種/陣形用 BattleRoot 缺省（野戰不帶 ?troop=&form=）
  assert.equal(loadout.troop, 2);
  assert.equal(loadout.form, 0);
  assert.equal(loadout.btroop, 10);
  assert.equal(loadout.bform, 3);
  // 缺將名時有兜底名，不會送空名進戰場
  const noName = C.encounterLoadout(army({ general: undefined }), army({ side: 'B', general: undefined }), { name: '', str: 70, int: 60, level: 5, wise: null }, { name: '', str: 70, int: 60, level: 5, wise: null });
  assert.equal(noName.gen, '我軍主將');
  assert.equal(noName.bgen, '來犯之將');
});

test('行為：跨場景快照可序列化往返；換局（runKey 不同）或壞檔一律丟掉', () => {
  const pending = C.encounterPendingOf({
    key: '0:劉備',
    ts: 1763000000000,
    month: 7,
    city: '平原',
    mine: army({ troops: 120 }),
    foe: army({ id: 'B1', side: 'B', from: '鄴', to: '平原', troops: 90, general: '張遼' }),
    before: { wins: 3, losses: 2, streak: 1, bestStreak: 4 },
  });
  const round = JSON.parse(JSON.stringify(pending));
  const back = C.parseEncounterPending(round, '0:劉備');
  assert.ok(back, '同 runKey 的快照要解得回來');
  assert.equal(back.mine.id, 'a1');
  assert.equal(back.mine.troops, 120);
  assert.equal(back.foe.troops, 90);
  assert.equal(back.before.wins, 3);
  assert.equal(back.city, '平原');
  // 換劇本/換勢力（runKey 不同）→ 當成別的局，丟掉
  assert.equal(C.parseEncounterPending(round, '1:曹操'), null, 'runKey 不符必須丟掉');
  // 壞檔（null / 亂塞 / 版本不符 / side 反了）→ null，不能崩
  assert.equal(C.parseEncounterPending(null, '0:劉備'), null);
  assert.equal(C.parseEncounterPending({ hello: 1 }, '0:劉備'), null);
  assert.equal(C.parseEncounterPending({ ...round, version: 99 }, '0:劉備'), null);
  assert.equal(C.parseEncounterPending({ ...round, mine: { ...round.mine, side: 'B' } }, '0:劉備'), null);
});

test('行為：encounterPlan() 依 wins/losses 增量判勝負（我方勝 → 半兵復原 + lastBattle.won）', () => {
  const pending = C.encounterPendingOf({
    key: '0:劉備',
    ts: 1763000000000,
    month: 7,
    city: '平原',
    mine: army({ troops: 120 }),
    foe: army({ id: 'B1', side: 'B', from: '鄴', to: '平原', troops: 90, general: '張遼' }),
    before: { wins: 3, losses: 2, streak: 1, bestStreak: 4 },
  });
  const win = C.encounterPlan(pending, { wins: 4, losses: 2, streak: 2, bestStreak: 4 }, 1763000001000);
  assert.equal(win.winner, 'A');
  assert.equal(win.restores.length, 1, '我方勝只復原我方殘部');
  assert.equal(win.restores[0].id, 'a1');
  assert.equal(win.restores[0].troops, 60, '勝方留一半兵力（120→60）');
  assert.equal(win.restores[0].progress, 0, '回圖後重新行軍');
  assert.equal(win.lastBattle.won, true);
  assert.equal(win.lastBattle.city, '平原');
  assert.equal(win.lastBattle.defend, false);
  assert.equal(win.lastBattle.ts, 1763000001000);
  assert.equal(win.logKind, 'win');
  assert.match(win.logText, /關羽/);
  assert.match(win.logText, /張遼/);

  const lose = C.encounterPlan(pending, { wins: 3, losses: 3, streak: 0, bestStreak: 4 }, 1763000001000);
  assert.equal(lose.winner, 'B');
  assert.equal(lose.restores.length, 1, '我方敗只復原敵方殘部');
  assert.equal(lose.restores[0].side, 'B');
  assert.equal(lose.restores[0].troops, 45, '敵方勝留一半（90→45）');
  assert.equal(lose.lastBattle.won, false);
  assert.equal(lose.logKind, 'lost');

  const draw = C.encounterPlan(pending, { wins: 3, losses: 2, streak: 1, bestStreak: 4 }, 1763000001000);
  assert.equal(draw.winner, 'draw');
  assert.equal(draw.restores.length, 2, '平手/中途退出：雙方按原兵力回圖');
  assert.deepEqual(draw.restores.map((row: any) => row.troops).sort((x: number, y: number) => x - y), [90, 120]);
  assert.equal(draw.lastBattle.won, false);
  assert.equal(draw.logKind, 'hold');
});
