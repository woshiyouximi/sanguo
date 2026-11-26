// @ts-nocheck
/**
 * [R246] 守城戰的名冊：**真跑 GameState 存檔邏輯** 的回歸測試。
 *
 * 為什麼要單獨釘這一條：R245 的台账把「攻城勝利」接到了 `handoffCapture()`，但
 * `recordBattleResult()` 在**任何 A 方勝利**時都會 `markCityTaken()`（刪整城名冊 +
 * 記接管），而 `BattleRoot` 的還人塊又用 `this.launch?.defend !== true` 擋掉守城戰
 * ⇒ 守城戰打贏 = 這座城的守將（名冊裡正是他們）被整城刪掉，且 `takenOver` 讓
 * `ownedCityNames()` 不再回落劇本表，於是下一次開局 `seedRuntimeOfficers()` 也補不回來：
 *
 *     roster={} → 既不在城、也不在兵團 → 出征/守城/名冊全查不到（製作人：「武將沒了」）
 *
 * 本檔驗的是行為：守城勝不再清名冊、存活的守將留在本城、舊的「死/俘」判定被撤掉、
 * 守城敗則清空該城並把殘部撤到還握在手裡的城。
 *
 * 跑法：`cd F:\sanguo\game; node --test tests/defense_battle_runtime.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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

const GameState = await import(new URL('../cocos/assets/scripts/GameState.ts', import.meta.url).href);
const { clearRunScoped, RUN_SCOPED_KEYS } = await import(new URL('../src/core/run_scoped.ts', import.meta.url).href);

function memStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => map,
  };
}

/** 守城戰前的存檔前提：樂陵是我的城，名冊裡是守將；顏良帶兵壓在城下（side 'B'）。 */
function defenseSave(overrides = {}) {
  return {
    month: 3,
    gold: 1000,
    goldMigrated: true,
    seeded: true,
    owned: ['平原', '樂陵'],
    roster: {
      平原: ['趙雲'],
      樂陵: ['劉備', '關羽', '張飛'],
    },
    cities: {
      平原: { troops: 300, pop: 0, money: 0, DEFENSE: 300 },
      樂陵: { troops: 200, pop: 0, money: 0, DEFENSE: 300, officers: [{ name: '劉備' }, { name: '關羽' }] },
    },
    armies: [
      {
        id: 'B1',
        side: 'B',
        from: '南皮',
        to: '樂陵',
        pathIndex: 0,
        progress: 1,
        troops: 120,
        general: '顏良',
        officers: ['文醜'],
      },
    ],
    armySeq: 1,
    ...overrides,
  };
}

function boot(save) {
  const storage = memStorage();
  storage.setItem(GameState.SAVE_KEY, JSON.stringify(save));
  globalThis.__ccStorage = storage;
  GameState.resetCache();
  return storage;
}

test('[R246] 守城戰打贏：不再 markCityTaken（名冊/守將快照/接管標記都不動）', () => {
  boot(defenseSave());
  GameState.recordBattleResult('樂陵', 'A', 'B1', true);
  const save = GameState.loadSave();

  assert.ok(save.owned.includes('樂陵'), '守住的城當然還在我手上');
  assert.deepEqual(
    save.takenOver ?? {},
    {},
    '守城贏不是「打下城」：不該記 takenOver（記了會讓 ownedCityNames 停止回落、名冊永遠補不回來）',
  );
  assert.deepEqual(save.roster['樂陵'], ['劉備', '關羽', '張飛'], '守將名冊不該被整城刪掉');
  assert.ok((save.cities['樂陵'].officers ?? []).length > 0, '守將快照也不該被清空');
  assert.equal(save.armies.length, 0, '來犯的 B 兵團照舊要從存檔移除');
});

test('[R246] 守城戰勝利後還人：存活者留在本城，舊局殘留的「俘」判定被撤掉', () => {
  boot(defenseSave({ generalStatus: { 關羽: '俘' } }));
  const before = GameState.loadSave();
  assert.equal(before.generalStatus['關羽'], '俘', '前提：舊局留下的錯誤判定確實存在');

  GameState.recordBattleResult('樂陵', 'A', 'B1', true);
  // BattleRoot 的守城勝利分支做的事
  GameState.returnGeneralsToCity('樂陵', ['劉備', '關羽']);
  const save = GameState.loadSave();

  assert.ok(save.roster['樂陵'].includes('劉備'));
  assert.ok(save.roster['樂陵'].includes('關羽'), '打過仗還活著的人不能被當俘虜剔掉');
  assert.equal(save.generalStatus?.['關羽'], undefined, '活人身上的「俘」必須撤掉（absorbArmyPeople）');
  assert.ok(save.roster['樂陵'].includes('張飛'), '沒參戰的守將也不該被牽連');
});

test('[R246] 守城戰打輸：城易手 → 該城名冊與守將快照清空，殘部撤到還握著的城', () => {
  boot(defenseSave());
  GameState.recordBattleResult('樂陵', 'B', 'B1', true);
  const lost = GameState.loadSave();
  assert.equal(lost.owned.includes('樂陵'), false, '輸了要丟城');
  assert.equal(lost.roster['樂陵'], undefined, '已易手的城不能還掛著我的守將');
  assert.deepEqual(lost.cities['樂陵'].officers, [], '守將快照也要清空，否則面板把敵城當我城');

  // BattleRoot 的守城失敗分支：殘部撤到還握在手裡的第一座城
  const refuge = String(GameState.loadSave().owned?.[0] ?? '');
  assert.equal(refuge, '平原');
  GameState.returnGeneralsToCity(refuge, ['劉備', '關羽']);
  const after = GameState.loadSave();

  assert.ok(after.roster['平原'].includes('劉備'), '殘部要出現在避難城');
  assert.ok(after.roster['平原'].includes('關羽'));
  assert.ok(after.roster['平原'].includes('趙雲'), '避難城原有的人不能被頂掉');
  assert.equal(after.roster['樂陵'], undefined, '丟掉的城裡不能再冒出我的人');
});

test('[R246] 攻城勝利（非守城）仍走接管：清旧主 + 记 takenOver + 存活者进新城', () => {
  boot(defenseSave({ armies: [], owned: ['平原'], cities: { 平原: { troops: 300, pop: 0, money: 0, DEFENSE: 300 }, 樂陵: { troops: 0, pop: 0, money: 0, DEFENSE: 300 } } }));
  GameState.recordBattleResult('樂陵', 'A', null, false);
  const taken = GameState.loadSave();
  assert.ok(taken.owned.includes('樂陵'));
  assert.equal(taken.takenOver['樂陵'], 3, '打下來的城要記接管月份');
  assert.equal(taken.roster['樂陵'], undefined, '旧主名册先清空');

  GameState.handoffCapture('樂陵', ['劉備', '關羽']);
  const after = GameState.loadSave();
  assert.deepEqual(after.roster['樂陵'], ['劉備', '關羽'], '存活者要写进新城名册');
  assert.equal(after.takenOver['樂陵'], 3, '接管標記保留（擋劇本表回落）');
  assert.equal(after.roster['平原'].includes('劉備'), false, '同名不許留在原城');
});

test('[R246] 換局清库：generalStatus / takenOver / siege 必須一起清掉', () => {
  for (const key of ['generalStatus', 'takenOver', 'siege']) {
    assert.ok(RUN_SCOPED_KEYS.includes(key), `RUN_SCOPED_KEYS 要含 ${key}`);
  }
  const save = {
    captured: ['張角'],
    roster: { 樂陵: ['劉備'] },
    armies: [{ id: 'A1' }],
    generalStatus: { 關羽: '死' },
    takenOver: { 樂陵: 3 },
    siege: { from: '平原', target: '樂陵' },
    wins: 7,
    losses: 2,
  };
  clearRunScoped(save);
  assert.equal(save.generalStatus, undefined, '新局不能继承上一局的死亡判定');
  assert.equal(save.takenOver, undefined, '新局不能继承上一局的接管标记');
  assert.equal(save.siege, undefined, '新局不能继承上一局的围城快照');
  assert.deepEqual(save.armies, [], '兵團一律清空');
  assert.equal(save.wins, 7, '战绩跨局保留');
});
