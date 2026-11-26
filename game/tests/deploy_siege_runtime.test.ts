// @ts-nocheck
/**
 * [R231] 到達一次彈一次：**真跑 GameState 存檔邏輯** 的回歸測試（不是源碼文本契約）。
 *
 * 為什麼要這麼做：`depoy_siege.test.ts` 只讀源碼字符串，證明的是「寫法長這樣」；
 * 本檔用 `registerHooks` 把 `cc` 換成空殼樁（`sys.localStorage` = 內存 Map、
 * `director.loadScene` 記場景名），真的 import `GameState.ts` 並跑存檔讀寫，
 * 證明的是「行為」：
 *
 *   舊路徑（本 bug 的成因）：
 *     抵達 → removeArmy（部隊離開存檔，OK）→ setDeployMarch（只寫了「派兵」上下文，
 *     沒寫部隊本身）→ Deploy 屏按出征 → `dispatchMarch()` 又造一支新兵團從出發城出發
 *     → 新兵團走到目標再次抵達 → 再彈 Deploy → 再派……「到達一次彈一次」，
 *     每循環還從出發城多扣一次兵，直到城裡兵不夠派（卡在「兵不足」提示）。
 *
 *   新路徑（R231 修法）：
 *     抵達 → removeArmy → `setDeploySiege()` 快照（主將/隨軍/兵數/armyId）→ Deploy
 *     「戰前準備」按出戰 → `startBattle()` 帶 `armyId` 直接開打（不造新兵團）→
 *     `recordBattleResult()` 勝則佔城、按 armyId 清部隊（已不在存檔＝no-op，不雙刪）。
 *     返回大地圖 → `refundSiegeTroops()` 把兵退回出發城（cap 600，對齊 web refundArmy）。
 *
 * 跑法：`cd F:\sanguo\game; node --test tests/deploy_siege_runtime.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

/**
 * `cc` 空殼樁：GameState.ts 全檔只 import `{ director, sys }`。
 * 存檔後端用 globalThis 注入的內存 Map，`director.loadScene` 把場景名記進數組，
 * 這樣測試可以斷言「這一步到底有沒有切到 Battle / Campaign」。
 */
const CC_STUB = `
globalThis.__ccStorage = globalThis.__ccStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.__ccScenes = globalThis.__ccScenes || [];
export const director = { loadScene: (name) => { globalThis.__ccScenes.push(String(name)); } };
export const sys = {
  localStorage: {
    getItem: (key) => globalThis.__ccStorage.getItem(key),
    setItem: (key, value) => globalThis.__ccStorage.setItem(key, value),
    removeItem: (key) => globalThis.__ccStorage.removeItem(key),
  },
};
export const game = { on: () => {}, off: () => {} };
export class Game {
  static EVENT_SHOW = 'game-show';
  static EVENT_HIDE = 'game-hide';
  static EVENT_HIDDEN = 'game-hidden';
  static EVENT_GAME_INITED = 'game-inited';
}
`;
const CC_URL = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(CC_STUB);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cc') return { url: CC_URL, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      // Cocos 源內部 import 不帶 `.ts` 副檔名（Cocos/Babel 習慣），Node ESM 不補
      if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(specifier + '.ts', context);
      }
      throw err;
    }
  },
});

/** 正式版存檔/戰役狀態總線（含 R231 的 DeploySiege 快照） */
const GameState = await import(new URL('../cocos/assets/scripts/GameState.ts', import.meta.url).href);
/** [R232] 在途判定（`awayNameSet`）：攻城快照裡的將要算作不在城內 */
const O = await import(new URL('../cocos/assets/scripts/OfficersOfCity.ts', import.meta.url).href);

/** Map 假 storage（與 Cocos 的 `sys.localStorage` 同構；`dump` 方便斷言盤上內容） */
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

/**
 * 最小可用存檔：平原（我方）300 兵，樂陵（敵）80 兵；一支 120 兵的我方兵團
 * 已經走到樂陵（progress=1），主將 劉備、隨軍 關羽 —— 就是「抵達那一刻」的存檔。
 */
function arrivalSave(overrides = {}) {
  return {
    owned: ['平原'],
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    month: 1,
    gold: 1000,
    goldMigrated: true,
    seeded: true,
    cities: {
      平原: { troops: 300, pop: 0, money: 0, DEFENSE: 300 },
      樂陵: { troops: 80, pop: 0, money: 0, DEFENSE: 300 },
    },
    armies: [
      {
        id: 'A1',
        side: 'A',
        from: '平原',
        to: '樂陵',
        pathIndex: 0,
        progress: 1,
        troops: 120,
        general: '劉備',
        officers: ['關羽'],
      },
    ],
    armySeq: 1,
    ...overrides,
  };
}

/** 每個 test 重置：換一份乾淨的內存盤 → 清 GameState 模塊緩存 → 場景記錄清空 */
function boot(save = arrivalSave()) {
  const storage = memStorage();
  storage.setItem(GameState.SAVE_KEY, JSON.stringify(save));
  globalThis.__ccStorage = storage;
  globalThis.__ccScenes = [];
  GameState.resetCache();
  GameState.clearDeployMarch();
  GameState.takeDeployTarget();
  GameState.takeDeployFrom();
  GameState.takeDeployEnemy();
  GameState.takeDeployArmy();
  GameState.clearDeploySiege();
  GameState.consumeBattleLaunch();
  return storage;
}

/** 軍師/攻城戰的 loadout 最小樣本（fight() 實際會帶的欄位） */
function siegeLoadout(siege) {
  return {
    gen: siege.general,
    genStr: 80,
    genInt: 60,
    genLevel: 20,
    troop: '步兵',
    form: '方圓',
    soldiers: siege.troops,
    home: siege.from,
    armyId: siege.armyId,
    rosterA: [siege.general, ...siege.officers].filter(Boolean),
    rosterB: ['守備隊'],
    indexA: 0,
    indexB: 0,
    cols: { [siege.general]: '前' },
  };
}

/** CampaignRoot.siegeSnapshotOf() 的等價物（源碼形狀由 deploy_siege.test.ts 釘住） */
function snapshotOf(army, target = army.to) {
  return {
    from: army.from,
    target,
    pathIndex: army.pathIndex,
    armyId: army.id,
    general: army.general ?? '',
    officers: Array.isArray(army.officers) ? army.officers.filter((name) => !!name).slice(0, 4) : [],
    troops: Math.max(1, Math.round(Number(army.troops) || 1)),
    advisor: army.advisor ?? '',
  };
}

test('[R231] 抵達那一刻的存檔前提：A1 在樂陵 progress=1（stepArmiesFrame 會挑中它）', () => {
  boot();
  const save = GameState.loadSave();
  assert.equal(save.armies.length, 1);
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 1, '到達目標 → res.arrived 非空');
  assert.equal(GameState.arrivedAt('平原', 'A').length, 0);
});

test('[R231] 舊路徑：setDeployMarch → dispatchMarch 會再造新兵團，新兵團再次抵達＝「到達一次彈一次」', () => {
  const storage = boot();
  const army = GameState.loadSave().armies[0];

  // ① CampaignRoot.startArrivalSiege() 的舊寫法：撤隊 + 只寫「派兵」上下文
  GameState.removeArmy(army.id);
  GameState.setDeployFrom(army.from);
  GameState.setDeployTarget(army.to);
  GameState.setDeployMarch({ from: army.from, target: army.to, pathIndex: army.pathIndex });
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 0, '撤隊後存檔裡沒有抵達部隊（這一步本身是對的）');
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 0, '再判一次仍然為空 → 不會每 tick 重彈');

  // ② DeployRoot.march() 舊分支：peekDeployMarch() 為真 → dispatchMarch 派一支「新」兵團
  assert.equal(GameState.dispatchMarch('劉備', ['關羽'], 120), true, '編成屏可以按出征');
  const cycle1 = GameState.armies();
  assert.equal(cycle1.length, 1, '存檔裡又出現一支兵團');
  assert.notEqual(cycle1[0].id, army.id, '是新兵團（不是原來那支）');
  assert.equal(cycle1[0].to, '樂陵');
  assert.equal(cycle1[0].progress, 0, '從出發城重新出發 → 進度歸零');
  assert.equal(GameState.loadSave().cities['平原'].troops, 180, '出發城被再扣一次兵（300-120）');

  // ③ 新兵團走到目標 → 又滿足 arrived → 下一次 stepArmiesFrame 又彈 Deploy
  GameState.applyArmyProgress([{ id: cycle1[0].id, progress: 1 }]);
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 1, '循環第二步：新兵團也抵達了');
  GameState.removeArmy(cycle1[0].id);
  GameState.setDeployMarch({ from: '平原', target: '樂陵', pathIndex: 0 });
  assert.equal(GameState.dispatchMarch('劉備', ['關羽'], 120), true, '再按一次出征 → 又派一支');
  assert.equal(GameState.armies().length, 1, '第三支兵團上路');
  assert.notEqual(GameState.armies()[0].id, cycle1[0].id);
  assert.equal(GameState.loadSave().cities['平原'].troops, 60, '每循環都多扣一次出發城的兵');

  // ④ 出發城只剩 60 兵：dispatchMarch 會把能派的都派出去（taken=clamp(120,0,60)=60）
  GameState.removeArmy(GameState.armies()[0].id);
  GameState.setDeployMarch({ from: '平原', target: '樂陵', pathIndex: 0 });
  assert.equal(GameState.dispatchMarch('劉備', ['關羽'], 120), true, '舊邏輯把城裡剩的 60 兵也派出去');
  assert.equal(GameState.armies()[0].troops, 60);
  assert.equal(GameState.loadSave().cities['平原'].troops, 0);
  // ⑤ 再派 → 出發城 0 兵 → false；但 deployMarch 殘留（舊碼沒有 clearDeployMarch 調用點）
  GameState.removeArmy(GameState.armies()[0].id);
  GameState.setDeployMarch({ from: '平原', target: '樂陵', pathIndex: 0 });
  assert.equal(GameState.dispatchMarch('劉備', ['關羽'], 120), false, '出發城 0 兵，派不動');
  assert.equal(GameState.armies().length, 0);
  assert.notEqual(GameState.peekDeployMarch(), null, '失敗後 deployMarch 殘留，下一次進編成屏仍走派兵分支');
  JSON.parse(storage.getItem(GameState.SAVE_KEY));
});

test('[R231] 新路徑：抵達只寫 DeploySiege 快照，部隊不回到存檔 → 不會再被判定抵達（只觸發一次）', () => {
  boot();
  const army = GameState.loadSave().armies[0];

  // CampaignRoot.startArrivalSiege() 新寫法：撤隊 → 清派兵上下文 → 寫攻城快照
  GameState.removeArmy(army.id);
  GameState.clearDeployMarch();
  GameState.setDeploySiege(snapshotOf(army));
  GameState.setDeployFrom(army.from);
  GameState.setDeployTarget(army.to);

  const siege = GameState.peekDeploySiege();
  assert.ok(siege, '攻城戰前準備快照存在');
  assert.equal(siege.armyId, 'A1');
  assert.equal(siege.general, '劉備');
  // normalizeArmies() 會把主將補到 officers 最前（與 web normalizeArmyExtras 同規則），
  // 所以快照的 officers 是「主將 + 隨軍」，DeployRoot 靠名字去重後重建隊列。
  assert.deepEqual(siege.officers, ['劉備', '關羽']);
  assert.equal(siege.troops, 120);
  assert.equal(siege.from, '平原');
  assert.equal(siege.target, '樂陵');
  assert.equal(GameState.peekDeployMarch(), null, '不再寫「派兵」上下文 → Deploy 不可能走 dispatchMarch');
  assert.equal(GameState.armies().length, 0, '部隊已離開存檔');
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 0, '再判一次也為空 → 同一支部隊不會被二次處理');

  // DeployRoot.fight() 等價：直接 startBattle，一兵一將都帶快照
  GameState.clearDeploySiege();
  const launch = GameState.startBattle(siege.target, siegeLoadout(siege));
  assert.equal(launch.city, '樂陵');
  assert.equal(launch.armyId, 'A1', 'armyId 進 BattleLaunch（戰後結算用）');
  assert.equal(launch.soldiers, 120, '戰場兵數 = 抵達兵數');
  assert.equal(launch.gen, '劉備');
  assert.equal(launch.home, '平原');
  assert.equal(globalThis.__ccScenes.at(-1), 'Battle', '直接進 Battle，不經 Campaign');
  const taken = GameState.consumeBattleLaunch();
  assert.equal(taken.armyId, 'A1');
  assert.equal(GameState.consumeBattleLaunch(), null, 'BattleLaunch 只被取一次');

  // BattleRoot 結算：勝 → 佔城 + 按 armyId 清部隊（已不在存檔＝no-op）
  GameState.recordBattleResult(taken.city, 'A', taken.armyId, taken.defend === true);
  const after = GameState.loadSave();
  assert.equal(after.owned.includes('樂陵'), true, '勝利佔城');
  assert.equal(after.armies.length, 0, '不產生新兵團（循環斷掉）');
  assert.equal(after.wins, 1);
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 0, '戰後也沒有殘留的抵達部隊');
});

test('[R231] 攻敗：部隊消耗（不回到存檔），不掉出發城、不誤刪其他兵團', () => {
  const other = {
    id: 'A2',
    side: 'A',
    from: '平原',
    to: '界橋',
    pathIndex: 0,
    progress: 0.4,
    troops: 30,
    general: '張飛',
  };
  boot(arrivalSave({ armies: [arrivalSave().armies[0], other] }));
  const army = GameState.loadSave().armies.find((row) => row.id === 'A1');
  GameState.removeArmy(army.id);
  GameState.clearDeployMarch();
  GameState.setDeploySiege(snapshotOf(army));
  GameState.clearDeploySiege();
  const launch = GameState.startBattle('樂陵', siegeLoadout(snapshotOf(army)));
  GameState.recordBattleResult(launch.city, 'B', launch.armyId, launch.defend === true);
  const after = GameState.loadSave();
  assert.equal(after.losses, 1);
  assert.equal(after.owned.includes('樂陵'), false, '攻城輸了不佔城');
  assert.equal(after.owned.includes('平原'), true, '出發城不受影響');
  assert.deepEqual(
    after.armies.map((row) => row.id),
    ['A2'],
    '只按 armyId 清這支；其他兵團保留（已不在存檔時 filter 是 no-op，不雙刪）',
  );
});

test('[R231] 返回大地圖＝放棄攻城：兵退回出發城（cap 600 對齊 web refundArmy），清快照，不造新兵團', () => {
  const storage = boot(arrivalSave({ cities: { 平原: { troops: 550, pop: 0, money: 0, DEFENSE: 300 }, 樂陵: { troops: 80, pop: 0, money: 0, DEFENSE: 300 } } }));
  const army = GameState.loadSave().armies[0];
  GameState.removeArmy(army.id);
  GameState.clearDeployMarch();
  GameState.setDeploySiege(snapshotOf(army));
  assert.equal(GameState.arrivedAt('樂陵', 'A').length, 0);

  // DeployRoot.abandonSiege() 等價
  const siege = GameState.peekDeploySiege();
  GameState.clearDeploySiege();
  const added = GameState.refundSiegeTroops(siege.from, siege.troops);
  assert.equal(added, 50, '550 + 120 = 670 → 夾到 600，實退 50');
  const after = GameState.loadSave();
  assert.equal(after.cities['平原'].troops, 600);
  assert.equal(after.armies.length, 0, '返回大地圖不產生新兵團');
  assert.equal(GameState.peekDeploySiege(), null);
  assert.equal(GameState.peekDeployMarch(), null);
  const persisted = JSON.parse(storage.getItem(GameState.SAVE_KEY));
  assert.equal(persisted.cities['平原'].troops, 600, '退款要落盤（不能只改內存）');
  assert.equal(persisted.armies.length, 0);
});

test('[R231] 未滿 cap 時原樣退回（不退到別的城、不加倍、可重複讀檔）', () => {
  const storage = boot(arrivalSave({ cities: { 平原: { troops: 100, pop: 0, money: 0, DEFENSE: 300 }, 樂陵: { troops: 80, pop: 0, money: 0, DEFENSE: 300 } } }));
  const army = GameState.loadSave().armies[0];
  GameState.removeArmy(army.id);
  const added = GameState.refundSiegeTroops(army.from, army.troops);
  assert.equal(added, 120);
  assert.equal(GameState.loadSave().cities['平原'].troops, 220);
  assert.equal(storage.getItem(GameState.SAVE_KEY) !== null, true);
  // 再讀一次（模塊緩存命中）值不變，不會重複退款
  assert.equal(GameState.loadSave().cities['平原'].troops, 220);
  assert.equal(JSON.parse(storage.getItem(GameState.SAVE_KEY)).cities['平原'].troops, 220);
});

test('[R232] 攻城快照要落盤（save.siege），並把這些將算作在途', () => {
  GameState.resetCache();
  const save = GameState.loadSave();
  save.owned = ['平原'];
  save.cities = { 平原: { troops: 200, pop: 1000, money: 100 } } as never;
  save.armies = [];
  GameState.persistSave();

  GameState.setDeploySiege({
    from: '平原',
    target: '樂陵',
    pathIndex: 0,
    armyId: 'A9',
    general: '關羽',
    officers: ['張飛'],
    troops: 120,
  });

  // 1) 落盤：重新讀檔還看得到（不是只放在模塊內存裡）
  GameState.resetCache();
  const reload = GameState.loadSave();
  assert.ok(reload.siege, '重讀存檔後 save.siege 仍在');
  assert.equal(reload.siege!.general, '關羽');
  assert.equal(reload.siege!.troops, 120);

  // 2) 在途：這些將不能再出現在城內候選（第二支兵團的編成屏不該帶上他們）
  const away = O.awayNameSet(reload as never);
  assert.ok(away.has('關羽'), '攻城主將要算在途');
  assert.ok(away.has('張飛'), '隨軍將要算在途');

  // 3) 清掉之後要從存檔消失
  GameState.clearDeploySiege();
  GameState.resetCache();
  assert.equal(GameState.loadSave().siege, undefined, 'clearDeploySiege 要把存檔裡的 siege 刪掉');
});
