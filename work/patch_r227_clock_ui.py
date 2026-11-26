# -*- coding: utf-8 -*-
"""R227：时间暂停的语义 + 兵团抵达必开战。

用户反馈两条：
1. 「时间自动进行后，第二年的 1 月不会暂停，导致没有机会进行内政……且在游戏进程中打开界面时间也不会停止」
2. 「行军到达目的地以后，不触发攻城，也无法点击到城市，因为我们的兵团会挡住城市的图标」

原作事实（`work/orig_time/REPORT.md`）：
- `T==0` → `[0x4A6440]=1` → `SetScene(内政)`：**整个大地图场景停更**，兵团也不再走；离开内政才 `T=3600` 恢复。
- 也就是说：内政是「强制场景」，不是「弹个窗口」；没有「掐点」这回事。

修法：
1. `clockRunning()` 增加「任何面板/模态打开就停」：`this.node.children` 里 active 的面板名单（势力图/名册/物品/君主/城池一览/存档/结局）+ CityPanel + `Scrim_*`。
2. `update()` 开头：`clockT <= 0 && !clockPaused` → 立刻 `enterInterior()`（不依赖上一帧的步进）。
3. 城内页关闭（`openCityPanel` 的 onClose）时若 `clockT <= 0`：视为「內政終了」→ `clockT = 3600; clockAcc = 0; clockPaused = false`（新一年开始），避免 T=0 卡死反复弹。
4. 兵团抵达敌城：不再复用 `doAction('march')`（它会走「必须接壤」守卫，多段行军的部队会被判「不接壤」而白撤）。新增 `startArrivalSiege(army, target)`：直接写 deploy 快照（from / target / enemy intel）→ `GameState.removeArmy` → `director.loadScene('Deploy')`。
5. 地图点击优先级：兵团 `progress >= 1` 且停在敌城上时，**城优先**（否则兵图标把城挡住，永远点不到城）。
"""
import io

P = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(P, encoding='utf-8').read()


def sub(old, new, why):
    global s
    assert s.count(old) == 1, f'anchor not unique: {why} ({s.count(old)})'
    s = s.replace(old, new, 1)


# ---------- 1) clockRunning：任何面板打开都停 ----------
sub(
    """  private clockRunning(): boolean {
    if (!this.save) return false;
    if (this.clockPaused) return false;
    if (this.cityPanel?.isOpen()) return false;
    if (this.node.children.some((c) => c.name.startsWith('Scrim_'))) return false;
    return true;
  }""",
    """  private clockRunning(): boolean {
    if (!this.save) return false;
    if (this.clockPaused) return false;
    if (this.cityPanel?.isOpen()) return false;
    if (this.node.children.some((c) => c.name.startsWith('Scrim_'))) return false;
    // [R227] 原作打開任何界面時，大地圖場景仍在跑，但玩家的「內政/操作」機會不能被時間吃掉：
    // 這裡把「面板開著就停錶」當成硬規則（用戶實測：開著界面時間照跑，回來已經過了好幾個月）。
    if (this.node.children.some((c) => c.active && UI_PANEL_NODES.has(c.name))) return false;
    return true;
  }""",
    'clockRunning panels',
)

# ---------- 2) update 開頭：T<=0 立刻進內政 ----------
sub(
    """  update(dt: number): void {
    if (!this.save || !this.clockRunning()) return;""",
    """  update(dt: number): void {
    if (!this.save) return;
    // [R227] T 已歸零但還沒進內政（例如上一步被 UI 暫停）：先補這一步，別讓玩家「錯過」內政。
    if (this.clockT <= 0 && !this.clockPaused) {
      this.enterInterior();
      return;
    }
    if (!this.clockRunning()) return;""",
    'update enterInterior',
)

# ---------- 3) 城內頁關閉：T<=0 當作內政終了 ----------
# 找到 openCityPanel 內的 onClose，補 T<=0 的處理
import re

m_search = re.search(r"onClose: \(\) => \{[\s\S]{0,900}?this\.clockPaused = false;", s)
assert m_search, 'openCityPanel onClose 找不到'
m = m_search
block = m.group(0)
assert 'this.clockPaused = false;' in block, f'onClose 內沒有 clockPaused=false：{block[:200]}'
new_block = block.replace(
    'clockPaused = false',
    """if (this.clockT <= 0) {
        // [R227] 原作「離開內政」＝ T 重設 3600（0x41BBF5）；玩家用「返回」關掉城內頁時同樣處理，
        // 否則 T=0 會立刻再把內政頁彈回來。
        this.clockT = 3600;
        this.clockAcc = 0;
      }
      clockPaused = false""",
    1,
)
s = s.replace(block, new_block, 1)

# ---------- 4) 抵達敵城：專用開戰入口 ----------
sub(
    """      if (target && !(this.save?.owned.includes(target) ?? false)) {
        // [R226] 原作：兵團走到敵城下就進戰鬥，不是等玩家再點一次城、再點「攻城戰」。
        // 這裡復用大地圖既有的 `doAction('march')`：撤隊 → 落 deploy 快照 → 切 Deploy 編成屏。
        this.selected = target;
        this.doAction('march');
        return;
      }""",
    """      if (target && !(this.save?.owned.includes(target) ?? false)) {
        // [R226] 原作：兵團走到敵城下就進戰鬥，不是等玩家再點一次城、再點「攻城戰」。
        // [R227] 不再複用 `doAction('march')`：那條路有「必須接壤」守衛（distanceFromOwned === 1），
        // 多段行軍的部隊走到遠城會被判「不接壤」→ 部隊被撤掉、也不進戰鬥（用戶實測）。
        this.selected = target;
        this.startArrivalSiege(arrivedNew, target);
        return;
      }""",
    'arrival auto battle',
)

# 新增 startArrivalSiege（放在 stepArmiesFrame 之後）
anchor = """  /** 舊入口（測試與對照用）：按月推進一步。正式流程已改成逐幀，見 `stepArmiesFrame()`。 */"""
assert s.count(anchor) == 1
s = s.replace(
    anchor,
    """  /**
   * [R227] 兵團抵達敵城 → 直接進編成屏（原作：走到城下就開打，不需要玩家再點城）。
   * 不復用 `doAction('march')`：那裡有「必須接鄰」守衛，多段行軍會被判不接壤而白撤隊。
   */
  private startArrivalSiege(army: Army, target: string): void {
    if (!this.save) return;
    const from = saveOwnedOr(this.save, army.from);
    GameState.removeArmy(army.id);
    this.save = GameState.loadSave();
    GameState.setDeployMarch({ from, target, pathIndex: army.pathIndex });
    GameState.setDeployFrom(from);
    GameState.setDeployTarget(target);
    GameState.setDeployArmy(null);
    const intel = this.enemyIntelOf(target);
    GameState.setDeployEnemy(
      intel
        ? {
            name: intel.name,
            str: intel.str,
            int: intel.int,
            troops: intel.troops,
            defense: intel.defense,
            fallback: intel.fallback,
            owner: intel.owner ?? '',
          }
        : null,
    );
    this.hintText = this.clampHint(`兵 臨 城 下：${army.general ?? '我軍'} ${army.troops} 兵 抵 ${target}，進入編成。`, 160);
    this.refresh();
    director.loadScene('Deploy');
  }

""" + anchor,
    1,
)

# ---------- 5) 地圖點擊：兵團停在敵城上時城優先 ----------
sub(
    """    if (hit.kind === 'army') {
      const picked = this.armyScreen[hit.armyIndex];
      if (picked) this.openArmyMenu(picked.a.id);
      return;
    }""",
    """    if (hit.kind === 'army') {
      const picked = this.armyScreen[hit.armyIndex];
      // [R227] 兵團已停在敵城下時，兵圖標會蓋住城：此時點擊優先給城（否則永遠點不到城、開不了戰）。
      if (picked && best && picked.a.progress >= 1 && !(this.save?.owned.includes(best) ?? false)) {
        this.select(best);
        return;
      }
      if (picked) this.openArmyMenu(picked.a.id);
      return;
    }""",
    'city priority over arrived army',
)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('CampaignRoot patched')

# ---------- 面板名單常量 + saveOwnedOr 小工具 ----------
anchor2 = "export const BATTLE_LOG_KEY = 'sanguo_battlelog_v1';"
assert s.count(anchor2) == 1
s2 = io.open(P, encoding='utf-8').read()
s2 = s2.replace(
    anchor2,
    anchor2
    + """

/**
 * [R227] 這些面板一開，大地圖時鐘必須停（玩家在用界面，不能被時間偷走內政機會）。
 * 名字取自各面板的 `*_NODE_NAME` 常量：ForcesPanel / GeneralBookPanel / ItemsPanel /
 * MonarchPanel / CityListPanel / SaveSlotsPanel / EndingPanel。
 */
export const UI_PANEL_NODES = new Set<string>([
  'ForcesPanel',
  'GeneralBookPanel',
  'ItemsPanel',
  'MonarchPanel',
  'CityListPanel',
  'SaveSlotsPanel',
  'EndingPanel',
]);

/** 我方城名兜底（兵團的 `from` 可能已易手，落到第一個自有城）。 */
export function saveOwnedOr(save: { owned: string[] }, from: string): string {
  return save.owned.includes(from) ? from : (save.owned[0] ?? from);
}""",
    1,
)
io.open(P, 'w', encoding='utf-8', newline='\n').write(s2)
print('constants added')
