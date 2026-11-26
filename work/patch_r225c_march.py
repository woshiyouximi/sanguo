# -*- coding: utf-8 -*-
"""R225b：行軍改成逐幀推進（原作 0x41AFAB 的 +0x9A 倒數 / 4980/[+0x82] 重裝）。

做法：
- `advanceArmiesMonth()` 的函數體抽成 `advanceArmies(stepFor)`（步長外部給）；
- 新增 `stepArmiesFrame(n)`：每 tick 走 `n / (marchMonths*300)`，抵達/對峙/遭遇戰規則沿用 planArmyMoves；
- `stepClock()` 每 tick 先推行軍；`monthTick()` 不再推行軍（只做經濟/AI）。
"""
import io

P = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(P, encoding='utf-8').read()
orig = s

# 1) 欄位：抵達提示去重
a = "  private stationNoticed = new Set<string>();"
assert s.count(a) == 1
s = s.replace(a, a + """

  /** [R225b] 逐幀行軍：已提示過的抵達部隊（避免每幀重複寫提示條） */
  private readonly arrivedNoticed = new Set<string>();""", 1)

# 2) stepClock：每 tick 先推行軍（原作兵團每幀移動，與日曆無關）
a = """    const before = this.clockT;
    this.clockT = Math.max(0, this.clockT - n);"""
assert s.count(a) == 1
s = s.replace(a, """    const before = this.clockT;
    this.clockT = Math.max(0, this.clockT - n);
    // [R225b] 原作兵團是「每幀推進」（0x41AFAB），不是按月跳；先走行軍再處理月邊界。
    this.stepArmiesFrame(n);
    if (this.clockPaused) { this.clockT = Math.max(0, this.clockT); return; }""", 1)

# 3) monthTick：移除行軍與其戰報（改由 stepArmiesFrame 負責）
a = """    const income = GameState.advanceMonth(this.cities, { data: this.data });
    const moved = this.advanceArmiesMonth();
    if (moved.battle) {
      this.save = GameState.loadSave();
      if (moved.logs.length > 0) this.pushBattleLog(moved.logs);
      this.clockPaused = true;
      this.hintText = this.clampHint('遭 遇 戰：已進入戰場（戰鬥結算後回到大地圖）。', 160);
      this.refresh();
      return false;
    }
    const ai = this.runMapAi();"""
assert s.count(a) == 1
s = s.replace(a, """    const income = GameState.advanceMonth(this.cities, { data: this.data });
    const ai = this.runMapAi();""", 1)

a = "    if (moved.logs.length > 0) this.pushBattleLog(moved.logs);\n"
assert s.count(a) == 1
s = s.replace(a, "", 1)

# 4) advanceArmiesMonth → advanceArmies(stepFor)
a = """  private advanceArmiesMonth(): {
    still: CampaignArmy[];
    arrived: CampaignArmy[];
    logs: BattleLogLine[];
    notes: string[];
    /** 本幀是否已發起遭遇戰（true → `endInterior()` 必須立刻收手，場景馬上切到 Battle） */
    battle: boolean;
  } {
    const scenario = this.scenarioLike();
    const logs: BattleLogLine[] = [];"""
assert s.count(a) == 1
s = s.replace(a, """  private advanceArmies(stepFor: (army: CampaignArmy) => number): {
    still: CampaignArmy[];
    arrived: CampaignArmy[];
    logs: BattleLogLine[];
    notes: string[];
    /** 本幀是否已發起遭遇戰（true → 呼叫端必須立刻收手，場景馬上切到 Battle） */
    battle: boolean;
  } {
    const logs: BattleLogLine[] = [];""", 1)

a = "    const moves = planArmyMoves(armies, (army) => armyStep(scenario, army.pathIndex));"
assert s.count(a) == 1
s = s.replace(a, "    const moves = planArmyMoves(armies, stepFor);", 1)

# 5) 在 leaderOf 之前插入：逐幀入口 + 舊月度入口（兼容測試）
a = "  private leaderOf(city: string): string {"
assert s.count(a) == 1
insert = """  /**
   * [R225b] 每幀行軍：原作兵團每幀推進
   * （`0x41AFAB`：`+0x9A` 倒數 → 到 0 推一格 → 重裝 `4980/[+0x82]` tick；`+0x9E`=2 行軍中）。
   * 這裡把「整段路 marchMonths 個月（300 tick/月）」攤到每 tick，progress 連續增長；
   * 抵達 / 被駐紮敵軍封鎖 / 對峙 / 遭遇戰仍沿用 `planArmyMoves()` 的規則。
   */
  private stepArmiesFrame(n: number): void {
    if (!this.save || n <= 0) return;
    const scenario = this.scenarioLike();
    const res = this.advanceArmies((army) => {
      const step = armyStep(scenario, army.pathIndex);
      const months = Math.max(1, Math.round(1 / Math.max(1e-6, step)));
      return n / (months * 300);
    });
    if (res.logs.length > 0) this.pushBattleLog(res.logs);
    if (res.battle) {
      this.save = GameState.loadSave();
      this.clockPaused = true;
      this.hintText = this.clampHint('遭 遇 戰：已進入戰場（戰鬥結算後回到大地圖）。', 160);
      this.refresh();
      return;
    }
    let arrivedNew: CampaignArmy | null = null;
    for (const army of res.arrived) {
      if (army.side !== 'A' || this.arrivedNoticed.has(army.id)) continue;
      this.arrivedNoticed.add(army.id);
      arrivedNew = army;
    }
    if (arrivedNew) {
      const target = armyAtCity(arrivedNew);
      this.hintText = this.clampHint(
        target ? `部隊已到 ${target} 城下：點該城 →「攻 城 戰」。` : '部隊已抵達目的地。',
        160,
      );
      this.refresh();
    }
  }

  /** 舊入口（測試與對照用）：按月推進一步。正式流程已改成逐幀，見 `stepArmiesFrame()`。 */
  private advanceArmiesMonth(): {
    still: CampaignArmy[];
    arrived: CampaignArmy[];
    logs: BattleLogLine[];
    notes: string[];
    battle: boolean;
  } {
    const scenario = this.scenarioLike();
    return this.advanceArmies((army) => armyStep(scenario, army.pathIndex));
  }

  private leaderOf(city: string): string {"""
s = s.replace(a, insert, 1)

assert s != orig
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('patched ok, len', len(s))
