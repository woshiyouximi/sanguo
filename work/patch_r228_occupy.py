# -*- coding: utf-8 -*-
"""R228：兵團抵達「空城/無主城」要佔領，而不是停在原地或去打不存在的守軍。

用戶：「你是不是不会占领空城，导致如果是空城，部队到达后待在原地？」

現況（R227 之後）：
- 抵達敵城 → `startArrivalSiege()` 一律進編成屏；
- 但 `arrivedNoticed` 在「進編成失敗（例如 `!this.save`）」時已經把兵團標記為處理過，
  於是部隊永遠停在 progress=1 的原地，既不佔城也不再重試 —— 這就是「待在原地」。
- 另外無主城（`無主`）在資料上仍有 110 守備隊，但 0 人 0 將的純空城（`garrison` 0）應該**直接接收**。

修法：
1. `GameState.occupyCity(city, armyId?)`：把城加進 `owned`、把兵團併入守軍、寫存檔。
2. 抵達分支：目標非我方時先算敵情——
   - 無守將且守軍 ≤0（真空城）→ `occupyCity()` 直接接收並寫戰報；
   - 否則 → `startArrivalSiege()`。
3. `arrivedNoticed` 只在**真的處理成功**後才寫入；失敗（`!this.save`）時把它刪掉，下幀重試。
"""
import io

G = r'F:\sanguo\game\cocos\assets\scripts\GameState.ts'
g = io.open(G, encoding='utf-8').read()
anchor = "/** 调试/测试用：清掉内存缓存（不会删除 sys.localStorage 的存档）。 */"
assert g.count(anchor) == 1
g = g.replace(
    anchor,
    """/**
 * [R228] 兵團抵達空城：直接把城收進 `owned`，部隊併入守軍。
 *
 * 與 `recordBattleResult()` 的「勝則佔城」分開，是因為空城沒有戰鬥可打：
 * 原作大地圖走過去就是接收（沒有守軍就沒有攻城戰）。
 */
export function occupyCity(city: string, armyId?: string | null, cap = CITY_TROOP_CAP): { ok: boolean; troops?: number } {
  const save = loadSave();
  if (!city) return { ok: false };
  if (!save.owned.includes(city)) save.owned.push(city);
  const state = save.cities[city];
  let troops: number | undefined;
  if (state) {
    if (armyId) {
      const army = save.armies.find((row) => row.id === armyId);
      if (army) {
        state.troops = Math.min(Math.max(0, cap), Math.max(0, Math.floor(numberOr(state.troops, 0))) + Math.max(0, Math.floor(numberOr(army.troops, 0))));
        save.armies = save.armies.filter((row) => row.id !== armyId);
      }
    }
    troops = state.troops;
  } else if (armyId) {
    save.armies = save.armies.filter((row) => row.id !== armyId);
  }
  persistSave();
  return { ok: true, troops };
}

""" + anchor,
    1,
)
io.open(G, 'w', encoding='utf-8', newline='\n').write(g)
print('GameState.occupyCity added')

P = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(P, encoding='utf-8').read()

old = """    let arrivedNew: CampaignArmy | null = null;
    for (const army of res.arrived) {
      if (army.side !== 'A' || this.arrivedNoticed.has(army.id)) continue;
      this.arrivedNoticed.add(army.id);
      arrivedNew = army;
    }"""
new = """    let arrivedNew: CampaignArmy | null = null;
    for (const army of res.arrived) {
      if (army.side !== 'A' || this.arrivedNoticed.has(army.id)) continue;
      // [R228] 先不標記：等真的處理成功（佔城/開戰/進城）再把 id 寫進 arrivedNoticed，
      // 否則一次失敗（例如存檔還沒載好）就永遠不再重試，部隊會停在城下不動。
      arrivedNew = army;
      break;
    }"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

old2 = """      if (target && !(this.save?.owned.includes(target) ?? false)) {
        // [R226] 原作：兵團走到敵城下就進戰鬥，不是等玩家再點一次城、再點「攻城戰」。
        // [R227] 不再複用 `doAction('march')`：那條路有「必須接壤」守衛（distanceFromOwned === 1），
        // 多段行軍的部隊走到遠城會被判「不接壤」→ 部隊被撤掉、也不進戰鬥（用戶實測）。
        this.selected = target;
        this.startArrivalSiege(arrivedNew, target);
        return;
      }"""
new2 = """      if (target && !(this.save?.owned.includes(target) ?? false)) {
        // [R226] 原作：兵團走到敵城下就進戰鬥，不是等玩家再點一次城、再點「攻城戰」。
        // [R227] 不再複用 `doAction('march')`：那條路有「必須接壤」守衛（distanceFromOwned === 1），
        // 多段行軍的部隊走到遠城會被判「不接壤」→ 部隊被撤掉、也不進戰鬥（用戶實測）。
        this.selected = target;
        // [R228] 真空城（沒有守將、守軍 0）沒有攻城戰可打：直接接收，部隊併入守軍。
        const intel = this.enemyIntelOf(target);
        const emptyCity = !intel || (!String(intel.name ?? '').trim() && Math.floor(Number(intel.troops) || 0) <= 0);
        if (emptyCity) {
          const out = GameState.occupyCity(target, arrivedNew.id);
          this.save = GameState.loadSave();
          this.arrivedNoticed.add(arrivedNew.id);
          this.pushBattleLog([
            battleLogLine(this.save.month, `兵 團 進 城：${arrivedNew.general ?? '我軍'} ${arrivedNew.troops} 兵 接 收 ${target}（守軍 ${out.troops ?? 0}）`, 'win'),
          ]);
          this.hintText = this.clampHint(`佔 領 ${target}：${arrivedNew.general ?? '我軍'} ${arrivedNew.troops} 兵 入城。`, 160);
          this.refresh();
          return;
        }
        this.startArrivalSiege(arrivedNew, target);
        this.arrivedNoticed.add(arrivedNew.id);
        return;
      }"""
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

old3 = """        const out = GameState.enterCityWithArmy(arrivedNew.id);
        this.save = GameState.loadSave();"""
new3 = """        const out = GameState.enterCityWithArmy(arrivedNew.id);
        this.save = GameState.loadSave();
        this.arrivedNoticed.add(arrivedNew.id);"""
assert s.count(old3) == 1
s = s.replace(old3, new3, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('CampaignRoot arrival patched')
