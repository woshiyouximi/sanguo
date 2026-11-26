# -*- coding: utf-8 -*-
"""R225：把大地图从「点内政終了跑完一年」改成原作时钟（T=3600 tick/年，300/月，10/日）。

原作证据（llvm-objdump 反汇编 work/units_per_side/Sango2.exe）：
  0x41B6C1 subl $1                 ; 每帧 T -= 1
  0x41B6CF..0x41B6FF               ; T == 0 → 置 [0x4A6440]=1（内政时间到了）
  0x41B849 = 3600 / 0x41B855 = 300 / 0x41B879 = 10
  0x41B7F2                         ; month = (3600-T)/300+1，day = ((3600-T)%300)/10+1
  0x41BBF5                         ; 内政終了：T = 3600 后切回大地图（不跑任何模拟）
"""
import io
import re
import sys

PATH = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'

with io.open(PATH, encoding='utf-8') as f:
    src = f.read()

orig = src

# ---------- 1) 字段 ----------
anchor = "  private labelMonth: Label | null = null;\n"
assert anchor in src, 'labelMonth anchor not found'
fields = anchor + """  /**
   * [R225] 原作大地图时钟（`work/units_per_side/Sango2.exe` 反汇编）：
   *   `0x41B6C1 subl $1` 每帧 `T -= 1`；`0x41B849=3600` 一帧一年、`0x41B855=300` 一月、`0x41B879=10` 一日；
   *   `0x41B7F2` 用 `month = (3600-T)/300+1` 现算显示月份（原作没有「月份推进函数」）；
   *   `T == 0`（`0x41B6CF`）→ 置「内政时间到了」并 `SetScene(0x48CD50=内政)`；
   *   `0x41BBF5`（内政終了回调）只做 `T = 3600` + 切回大地图，**不跑任何模拟**。
   * 所以这里也必须是「每帧减 1」的活时钟，而不是按下按钮一次跑 12 个月。
   */
  private clockT = 3600;
  /** 60Hz 累加器：原作逐帧减 1，我们用固定步长把帧率差异吃掉 */
  private clockAcc = 0;
  /** 每帧推进的 tick 数（原作 `[0x4A64F8]`，命令行 atoi；默认 1） */
  private clockSpeed = 1;
  /** 时钟暂停：内政页开着 / 任一模态暗幕开着 / 场景即将切换 */
  private clockPaused = false;
"""
src = src.replace(anchor, fields, 1)

# ---------- 2) openCityPanel: 暂停时钟 + 关闭时恢复 ----------
old_open = "    this.cityPanel.open({\n      cityName,"
assert old_open in src
src = src.replace(old_open, "    this.clockPaused = true;\n    this.cityPanel.open({\n      cityName,", 1)

old_close = """        this.cityPanel?.hide();
        this.hintText = `${cityName}：內政已更新（國庫 ${GameState.nationalGold()} 金）。`;"""
assert old_close in src
src = src.replace(old_close, """        this.cityPanel?.hide();
        this.clockPaused = false;
        this.hintText = `${cityName}：內政已更新（國庫 ${GameState.nationalGold()} 金）。`;""", 1)

# ---------- 3) endInterior 整段替换 ----------
start = src.index('  private endInterior(): void {')
end = src.index('  private doAction(kind: ActionKind): void {')
assert start < end

new_block = '''  /**
   * [R225] 原作时钟：每帧 `T -= 1`（`0x41B6C1`），跨过 300 的整数倍就是一个月，`T == 0` 进内政。
   *
   * 与旧实现的差别（旧实现在 `endInterior()` 里一次帧内 for 循环跑 12 个月）：
   *   - 时间由 `update(dt)` 驱动，玩家能看见月份一周一周走、兵团一格一格挪；
   *   - 月度结算（年税/补兵/行军/AI）只在**月边界**跑一次；
   *   - 「內 政 終 了」只把 `T` 重设 3600 并恢复时钟（原作 `0x41BBF5`），不做模拟。
   */
  update(dt: number): void {
    if (!this.save || !this.clockRunning()) return;
    // 60Hz 固定步长：原作逐帧减 1，60fps ≈ 一秒 60 tick（一年 60 秒、一月 5 秒）
    const step = 1 / 60;
    this.clockAcc += Math.min(dt, 0.25);
    let guard = 0;
    while (this.clockAcc >= step && guard < 240) {
      this.clockAcc -= step;
      guard += 1;
      this.stepClock(this.clockSpeed);
      // stepClock 可能开内政页 / 切战场，此时立刻收手
      if (!this.clockRunning()) return;
    }
  }

  /** 时钟能不能走：内政页/模态暗幕/无存档都不走（原作内政场景不碰 T） */
  private clockRunning(): boolean {
    if (!this.save) return false;
    if (this.clockPaused) return false;
    if (this.cityPanel?.isOpen) return false;
    if (this.node.children.some((c) => c.name.startsWith('Scrim_'))) return false;
    return true;
  }

  /** 推进 n 个 tick：跨月结算 + T==0 进内政（原作 `0x41B6C1` / `0x41B6CF`） */
  private stepClock(n: number): void {
    if (!this.save || n <= 0) return;
    const before = this.clockT;
    this.clockT = Math.max(0, this.clockT - n);
    const monthBefore = Math.floor((3600 - before) / 300);
    const monthAfter = Math.floor((3600 - this.clockT) / 300);
    for (let m = monthBefore + 1; m <= monthAfter; m += 1) {
      if (!this.monthTick()) return;
    }
    if (this.clockT <= 0) this.enterInterior();
  }

  /**
   * 月边界的一次结算（旧 `endInterior()` 循环体逐月搬过来，顺序完全一致）：
   * 年税/补兵 → 我军行军/抵达 → AI 月结算 → 战报。
   * 返回 false 表示中途切了战场（本 tick 不再继续）。
   */
  private monthTick(): boolean {
    if (!this.save) return false;
    const from = this.save.month;
    const income = GameState.advanceMonth(this.cities, { data: this.data });
    const moved = this.advanceArmiesMonth();
    if (moved.battle) {
      this.save = GameState.loadSave();
      if (moved.logs.length > 0) this.pushBattleLog(moved.logs);
      this.clockPaused = true;
      this.hintText = this.clampHint('遭 遇 戰：已進入戰場（戰鬥結算後回到大地圖）。', 160);
      this.refresh();
      return false;
    }
    const ai = this.runMapAi();
    if (!ai) this.spawnRaid();
    this.save = GameState.loadSave();
    this.recordAiBattleLog(ai);
    if (moved.logs.length > 0) this.pushBattleLog(moved.logs);
    const arriving = this.save.owned
      .map((city) => GameState.arrivedAt(city, 'B').map((army) => ({ army, city })))
      .reduce((acc, list) => acc.concat(list), [] as Array<{ army: Army; city: string }>);
    if (arriving.length > 0 && this.clockT > 300) {
      this.hintText = this.clampHint(`敵軍已到 ${arriving[0].city} 城下：點該城 →「守 城 戰」。`, 160);
    } else if (income > 0) {
      this.hintText = this.clampHint(`${from} 月 → ${this.save.month} 月：稅入 +${income} 金。`, 160);
    }
    this.refresh();
    return true;
  }

  /** 原作 `T == 0`：进内政（年份在进内政时 +1，`0x4238BB`）；这里開城內頁代替「内政场景」 */
  private enterInterior(): void {
    if (!this.save || this.clockPaused) return;
    this.clockPaused = true;
    this.clockT = 0;
    const home = this.selected ?? this.save.owned[0] ?? '';
    this.pushBattleLog([
      battleLogLine(this.save.month, '時 間：本年走完（原作 T=0 · 0x41B6CF）→ 進內政', 'year'),
    ]);
    this.hintText = this.clampHint('內政時間到了（原作一年 = 3600 tick）：處理完點「返回」回大地圖。', 160);
    this.refresh();
    if (home) this.openCityPanel(home);
  }

  /**
   * [R225] 「內 政 終 了」＝ 原作 `0x41BBF5`：把 `T` 重设 3600、清队伍状态、切回大地图。
   * **不跑任何月份模拟**（旧实现一次跑 12 个月，用户实测抱怨的点）。
   */
  private endInterior(): void {
    if (!this.save) return;
    this.clockPaused = false;
    this.clockT = 3600;
    this.clockAcc = 0;
    this.pushBattleLog([
      battleLogLine(this.save.month, '內 政 終 了：時間開始流動（原作 0x41BBF5 → T=3600）', 'year'),
    ]);
    this.hintText = this.clampHint('內 政 終 了：時間開始流動（一年 ≈ 60 秒，一月 ≈ 5 秒）。', 160);
    this.refresh();
  }

'''
src = src[:start] + new_block + src[end:]

if src == orig:
    print('NO CHANGE')
    sys.exit(1)

with io.open(PATH, 'w', encoding='utf-8', newline='\n') as f:
    f.write(src)
print('patched', len(src), 'chars')
