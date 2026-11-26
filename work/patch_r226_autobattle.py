# -*- coding: utf-8 -*-
"""R226：兵團抵達敵城 → 自動進戰鬥（原作行為），不再要求玩家再點一次城再點「攻城戰」。

用戶實測：「我派兵出征，队伍到达目标点，但是没有触发战斗」。
起因：逐幀行軍只負責推進 progress；抵達後的攻/守/進城原本仍靠玩家點城觸發。
現在在 `stepArmiesFrame()` 的抵達分支直接走既有的 `doAction('march')`（到敵城 → 編成屏 → 出征 → 戰鬥），
到自家城則自動 `GameState.enterCityWithArmy()` 進城。
"""
import io

P = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(P, encoding='utf-8').read()

old = """    if (arrivedNew) {
      const target = armyAtCity(arrivedNew);
      this.hintText = this.clampHint(
        target ? `部隊已到 ${target} 城下：點該城 →「攻 城 戰」。` : '部隊已抵達目的地。',
        160,
      );
      this.refresh();
    }"""
new = """    if (arrivedNew) {
      const target = armyAtCity(arrivedNew);
      if (target && !(this.save?.owned.includes(target) ?? false)) {
        // [R226] 原作：兵團走到敵城下就進戰鬥，不是等玩家再點一次城、再點「攻城戰」。
        // 這裡復用大地圖既有的 `doAction('march')`：撤隊 → 落 deploy 快照 → 切 Deploy 編成屏。
        this.selected = target;
        this.doAction('march');
        return;
      }
      if (target) {
        // 到自家城（增援/回防）：直接併入守軍，不回大地圖等手點。
        const out = GameState.enterCityWithArmy(arrivedNew.id);
        this.save = GameState.loadSave();
        this.hintText = this.clampHint(
          `兵 團 進 城：${arrivedNew.general ?? '我軍'} ${arrivedNew.troops} 兵 入 ${out.city}（守軍 ${out.troops}）。`,
          160,
        );
        this.refresh();
        return;
      }
      this.hintText = this.clampHint('部隊已抵達目的地。', 160);
      this.refresh();
    }"""
assert s.count(old) == 1, 'arrived branch anchor missing'
s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('patched auto-battle on arrival')

G = r'F:\sanguo\game\cocos\native\engine\android\app\build.gradle'
g = io.open(G, encoding='utf-8').read()
g2 = g.replace('versionCode 22', 'versionCode 23').replace('versionName "3.2"', 'versionName "3.3"')
io.open(G, 'w', encoding='utf-8', newline='\n').write(g2)
print('bumped', g != g2)
